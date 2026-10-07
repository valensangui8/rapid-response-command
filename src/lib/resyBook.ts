import { restaurant, type Booking, type Message } from "./resy";
import type { MessageExtraction, MessageJudgment } from "./resyAi";

export type Action = {
  id: string;
  kind: "reconfirm" | "perk" | "referral" | "waitlist_offer" | "suspicious" | "confirm_new" | "offer_alt" | "ack_cancel" | "confirm_change" | "change_conflict" | "reply_question" | "manager";
  bookingId: string | null;
  title: string;
  detail: string;
  priority: number; // 0..100
  status: "pending" | "sent";
  draft?: string;
  language: string;
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/** Smallest free table that fits, with no overlap within the turn time. */
export function findTable(book: Booking[], size: number, time: string, ignoreId?: string): string | null {
  const start = toMin(time);
  const busy = new Set(
    book
      .filter((b) => b.id !== ignoreId && b.table && b.status !== "cancelled" && Math.abs(toMin(b.time) - start) < restaurant.turnMinutes)
      .map((b) => b.table!),
  );
  const fit = restaurant.tables.filter((t) => t.seats >= size && !busy.has(t.id)).sort((a, b) => a.seats - b.seats);
  return fit[0]?.id ?? null;
}

export function alternatives(book: Booking[], size: number, time: string): string[] {
  const start = toMin(time);
  return restaurant.slots
    .filter((s) => s !== time && Math.abs(toMin(s) - start) <= 90 && findTable(book, size, s))
    .sort((a, b) => Math.abs(toMin(a) - start) - Math.abs(toMin(b) - start))
    .slice(0, 2);
}

let n = 0;
const nid = (p: string) => `${p}${++n}`;

/** Apply one judged message to the book; returns new book and the actions it creates. */
/** Regex backup when the LLM misses party size or time. */
function backfill(m: Message, x: MessageExtraction): MessageExtraction {
  const t = m.text;
  const size =
    x.partySize ??
    Number(
      t.match(/(\d{1,2})\s*(?:people|ppl|guests|personas|pax)/i)?.[1] ??
        t.match(/(?:party of|table for|booked|reservation for|para)\s+(\d{1,2})(?![\d:]|\s*(?:pm|am|p\.m))/i)?.[1] ??
        NaN,
    );
  let time = x.time;
  if (!time) {
    const mt = t.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|p\.m\.)/i);
    if (mt) time = `${(Number(mt[1]) % 12) + 12}:${mt[2] ?? "00"}`;
    else {
      const bare = t.match(/\b(\d{1,2}):(\d{2})\b/); // "8:30" with no am/pm → dinner time
      if (bare) time = `${Number(bare[1]) < 11 ? Number(bare[1]) + 12 : bare[1]}:${bare[2]}`;
    }
  }
  // Different free models format differently: normalize "8:30 PM" -> "20:30", "en" -> "English".
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    const mt = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (mt) {
      let h = Number(mt[1]);
      if (/pm/i.test(mt[3] ?? "") && h < 12) h += 12;
      if (!mt[3] && h < 11) h += 12; // dinner context
      time = `${String(h).padStart(2, "0")}:${mt[2] ?? "00"}`;
    }
  }
  const langMap: Record<string, string> = { en: "English", english: "English", sms: "English", es: "Spanish", spanish: "Spanish", "español": "Spanish" };
  const language = langMap[(x.language || "").toLowerCase()] ?? x.language;
  return { ...x, partySize: Number.isFinite(size) ? size : null, time, language };
}

export function reconcile(book: Booking[], m: Message, j: MessageJudgment, x0: MessageExtraction): { book: Booking[]; actions: Action[]; outcome: string } {
  const x = backfill(m, x0);
  const actions: Action[] = [];
  const fromCampaign = m.id.startsWith("c");
  const target = j.matchOf ? book.find((b) => b.id === j.matchOf) : undefined;
  const lang = x.language || "English";
  const prio = (base: number) => Math.round(Math.min(100, base + j.urgency * 12 + j.manager * 15));
  let next = book;
  let outcome = "";

  const managerAction = (b: Booking | undefined) => {
    if (j.manager > 0.6)
      actions.push({ id: nid("a"), kind: "manager", bookingId: b?.id ?? null, title: `Manager: ${b?.name ?? m.from}`, detail: x.notes || m.text.slice(0, 90), priority: prio(40), status: "pending", language: lang });
  };

  switch (j.intent) {
    case "existing_booking": {
      if (fromCampaign && (j.plausible < 0.5 || !x.partySize || !x.time)) {
        outcome = `🚩 Vague claim (plausible ${Math.round(j.plausible * 100)}%) → ask for name/time, no perk yet`;
        actions.push({ id: nid("a"), kind: "suspicious", bookingId: null, title: `Verify claim: ${m.from}`, detail: "Campaign reply without verifiable details. Ask for name + time + party size.", priority: prio(5), status: "pending", language: lang });
        break;
      }
      if (target) {
        next = book.map((b) => (b.id === target.id ? { ...b, sources: [...b.sources, m.id], status: "verified", notes: [b.notes, x.notes].filter(Boolean).join(" · "), phone: b.phone ?? x.phone } : b));
        outcome = `Corroborates ${target.name} → verified`;
        managerAction(target);
        break;
      }
      if (!x.time || !x.partySize) {
        outcome = "Booking claim missing details → call back";
        actions.push({ id: nid("a"), kind: "reconfirm", bookingId: null, title: `Call back ${x.name ?? m.from}`, detail: "Claims a booking but details are missing", priority: prio(35), status: "pending", language: lang });
        break;
      }
      const table = findTable(book, x.partySize, x.time);
      const isReferral = fromCampaign && j.referral > 0.9;
      const b: Booking = { id: nid("B"), name: x.name ?? m.from, partySize: x.partySize, time: x.time, phone: x.phone, notes: x.notes, sources: [m.id], status: fromCampaign && !isReferral ? "verified" : "unverified", table, vip: j.manager > 0.6, perk: fromCampaign && !isReferral ? "granted" : undefined, referredBy: isReferral ? m.from : undefined };
      if (isReferral) {
        next = [...book, b];
        outcome = `🤝 Referral by ${m.from} → recovered ${b.name} · ${b.partySize} @ ${fmt(b.time)}${table ? ` → ${table}` : " → NO TABLE"}`;
        actions.push({ id: nid("a"), kind: "referral", bookingId: b.id, title: `🤝 Contact referred guest: ${b.name}`, detail: `${b.partySize} @ ${fmt(b.time)} · ${table ?? "needs table"}${b.phone ? ` · ${b.phone}` : ""} · referred by ${m.from} (both get dessert)`, priority: prio(30), status: "pending", language: lang });
        break;
      }
      next = [...book, b];
      outcome = `${fromCampaign ? "🎁 Campaign → " : ""}Recovered ${b.name} · ${b.partySize} @ ${fmt(b.time)}${table ? ` → ${table}` : " → NO TABLE (overbooked!)"}`;
      if (fromCampaign) {
        actions.push({ id: nid("a"), kind: "perk", bookingId: b.id, title: `🎁 Confirm + perk: ${b.name}`, detail: `${b.partySize} @ ${fmt(b.time)} · ${table ?? "needs table"} · plausible ${Math.round(j.plausible * 100)}%`, priority: prio(15), status: "pending", language: lang });
        break;
      }
      actions.push({ id: nid("a"), kind: "reconfirm", bookingId: b.id, title: `Reconfirm ${b.name}`, detail: `${b.partySize} @ ${fmt(b.time)} · ${table ?? "needs table"}${b.phone ? ` · ${b.phone}` : ""}`, priority: prio(table ? 20 : 60), status: "pending", language: lang });
      managerAction(b);
      break;
    }
    case "new_request": {
      const size = x.partySize ?? 2;
      const time = x.time ?? "19:00";
      const table = findTable(book, size, time);
      if (table) {
        const b: Booking = { id: nid("B"), name: x.name ?? m.from, partySize: size, time, phone: x.phone, notes: x.notes, sources: [m.id], status: "requested", table, vip: false };
        next = [...book, b];
        outcome = `Available: ${table} @ ${fmt(time)} (held)`;
        actions.push({ id: nid("a"), kind: "confirm_new", bookingId: b.id, title: `Confirm new: ${b.name}`, detail: `${size} @ ${fmt(time)} → ${table} (held)`, priority: prio(25), status: "pending", language: lang });
      } else {
        const alts = alternatives(book, size, time);
        next = [...book, { id: nid("B"), name: x.name ?? m.from, partySize: size, time, phone: x.phone, notes: x.notes, sources: [m.id], status: "waitlist", table: null, vip: false }];
        outcome = `Full @ ${fmt(time)} → offer ${alts.map(fmt).join(" / ") || "nothing"} + waitlist`;
        actions.push({ id: nid("a"), kind: "offer_alt", bookingId: null, title: `Offer alternative: ${x.name ?? m.from}`, detail: `${size} @ ${fmt(time)} is full → ${alts.map(fmt).join(" or ") || "waitlist"}`, priority: prio(25), status: "pending", language: lang });
      }
      break;
    }
    case "modify": {
      if (!target) {
        outcome = "Change request but booking not found → call";
        actions.push({ id: nid("a"), kind: "reconfirm", bookingId: null, title: `Find booking: ${x.name ?? m.from}`, detail: m.text.slice(0, 90), priority: prio(40), status: "pending", language: lang });
        break;
      }
      const size = x.partySize ?? target.partySize;
      const time = x.time ?? target.time;
      const table = findTable(book, size, time, target.id);
      if (table) {
        next = book.map((b) => (b.id === target.id ? { ...b, partySize: size, time, table, sources: [...b.sources, m.id], status: "verified" } : b));
        outcome = `${target.name}: now ${size} @ ${fmt(time)} → ${table}`;
        actions.push({ id: nid("a"), kind: "confirm_change", bookingId: target.id, title: `Confirm change: ${target.name}`, detail: `${target.partySize}→${size} guests @ ${fmt(time)} → ${table}`, priority: prio(30), status: "pending", language: lang });
      } else {
        outcome = `${target.name}: change doesn't fit → offer options`;
        actions.push({ id: nid("a"), kind: "change_conflict", bookingId: target.id, title: `Can't fit change: ${target.name}`, detail: `${size} @ ${fmt(time)} has no table · alt: ${alternatives(book, size, time).map(fmt).join(", ") || "none"}`, priority: prio(45), status: "pending", language: lang });
      }
      break;
    }
    case "cancel": {
      const t = target ?? book.find((b) => x.name && b.name.toLowerCase().includes(x.name.toLowerCase().split(" ")[0]));
      if (t) {
        next = book.map((b) => (b.id === t.id ? { ...b, status: "cancelled", table: null, sources: [...b.sources, m.id] } : b));
        outcome = `${t.name} cancelled → ${t.table ?? "table"} freed`;
        actions.push({ id: nid("a"), kind: "ack_cancel", bookingId: t.id, title: `Acknowledge cancel: ${t.name}`, detail: `${t.table ?? ""} freed @ ${fmt(t.time)}`, priority: prio(10), status: "pending", language: lang });
        // Freed table → first waitlisted guest that now fits.
        for (const w of next.filter((b) => b.status === "waitlist")) {
          const wt = findTable(next, w.partySize, w.time) ? w.time : alternatives(next, w.partySize, w.time)[0];
          const table = wt ? findTable(next, w.partySize, wt) : null;
          if (wt && table) {
            next = next.map((b) => (b.id === w.id ? { ...b, status: "requested", table, time: wt } : b));
            outcome += ` → 🔁 offered to ${w.name}`;
            actions.push({ id: nid("a"), kind: "waitlist_offer", bookingId: w.id, title: `🔁 Freed table → ${w.name}`, detail: `${w.partySize} @ ${fmt(wt)} → ${table} (held 15 min)`, priority: prio(35), status: "pending", language: lang });
            break;
          }
        }
      } else {
        outcome = "Cancellation for a booking not in book → noted";
      }
      break;
    }
    case "question":
      outcome = "Question → auto-reply";
      actions.push({ id: nid("a"), kind: "reply_question", bookingId: null, title: `Reply: ${m.from}`, detail: m.text.slice(0, 90), priority: prio(5), status: "pending", language: lang });
      break;
    default:
      outcome = "Ignored (not about tonight)";
  }
  return { book: next, actions, outcome };
}

export function resetIds() {
  n = 0;
}
