"use client";
import { useEffect, useRef, useState } from "react";
import { campaignReplies, messages as demoMessages, restaurant, type Booking, type Charge, type Message } from "@/lib/resy";
import type { Campaign, ChargeJudgment, MessageExtraction, MessageJudgment } from "@/lib/resyAi";
import { fmt, reconcile, resetIds, type Action } from "@/lib/resyBook";
import { PixelJev } from "./Pixel";
import { cached, demoMode } from "@/lib/demoFixture";
import VoiceAgent from "./VoiceAgent";

type Judged = { m: Message; j?: MessageJudgment; x?: MessageExtraction; outcome?: string };
const INTENT_LABEL: Record<string, string> = {
  existing_booking: "existing booking",
  new_request: "new request",
  modify: "change",
  cancel: "cancel",
  question: "question",
  irrelevant: "ignore",
};
const CH_ICON: Record<string, string> = { email: "✉️", sms: "💬", voicemail: "📞", instagram: "📷", staff: "🧑‍🍳", google: "🔎", manual: "✍️", x: "𝕏", pos: "🧾", phone: "☎️" };
const STATUS_COLOR: Record<Booking["status"], string> = {
  verified: "bg-emerald-600 border-emerald-400",
  unverified: "bg-amber-600 border-amber-400",
  requested: "bg-sky-600 border-sky-400",
  cancelled: "bg-slate-700 border-slate-500 line-through opacity-50",
  waitlist: "bg-slate-700 border-slate-500",
};

export default function ResyDashboard() {
  const [feed, setFeed] = useState<Judged[]>([]);
  const [book, setBook] = useState<Booking[]>([]);
  const bookRef = useRef<Booking[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [current, setCurrent] = useState<Judged | null>(null);
  const [thinking, setThinking] = useState(false);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [jevLive, setJevLive] = useState(false);
  const stop = useRef(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [posted, setPosted] = useState(0);
  const [campaignBusy, setCampaignBusy] = useState(false);

  async function launchCampaign() {
    setCampaignBusy(true);
    setPosted(0);
    setCampaign(await cached("campaign", async () => (await fetch("/api/resy/campaign", { method: "POST" })).json()));
    for (let i = 1; i <= 6; i++) {
      await new Promise((res) => setTimeout(res, 450));
      setPosted(i);
    }
    // Replies start arriving.
    stop.current = false;
    for (const m of campaignReplies) {
      if (stop.current) break;
      await ingest({ ...m, id: `${m.id}-${Date.now()}` });
    }
    setCampaignBusy(false);
  }

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => setJevLive(s.jev));
  }, []);

  async function ingest(m: Message): Promise<{ j: MessageJudgment; x: MessageExtraction; outcome: string; book: Booking[] } | null> {
    setFeed((f) => [{ m }, ...f]);
    setCurrent({ m });
    setThinking(true);
    const refs = bookRef.current.filter((b) => b.status !== "cancelled").map((b) => ({ id: b.id, summary: `${b.name}, party of ${b.partySize} at ${fmt(b.time)}${b.phone ? `, phone ${b.phone}` : ""}` }));
    try {
      const { judgment, extraction } = await cached(`judge:${m.text}`, async () => {
        const r = await fetch("/api/resy/judge", { method: "POST", body: JSON.stringify({ message: m, book: refs }), signal: AbortSignal.timeout(20000) });
        return (await r.json()) as { judgment: MessageJudgment; extraction: MessageExtraction };
      });
      const res = reconcile(bookRef.current, m, judgment, extraction);
      bookRef.current = res.book;
      setBook(res.book);
      setActions((a) => [
        ...a,
        // one manager flag per booking is enough
        ...res.actions.filter((n) => n.kind !== "manager" || !a.some((o) => o.kind === "manager" && o.bookingId && o.bookingId === n.bookingId)),
      ]);
      const judged = { m, j: judgment, x: extraction, outcome: res.outcome };
      setFeed((f) => f.map((it) => (it.m.id === m.id ? judged : it)));
      setCurrent(judged);
      setThinking(false);
      await new Promise((r) => setTimeout(r, demoMode() === "replay" ? 350 : 900)); // let the audience see the verdict
      return { j: judgment, x: extraction, outcome: res.outcome, book: res.book };
    } catch (e) {
      setFeed((f) => f.map((it) => (it.m.id === m.id ? { ...it, outcome: `error: ${String(e).slice(0, 60)}` } : it)));
      setThinking(false);
      return null;
    }
  }

  const treat = (id: string) => setBook((bk) => (bookRef.current = bk.map((b) => (b.id === id ? { ...b, status: "verified", dessert: true } : b))));

  async function run() {
    setRunning(true);
    stop.current = false;
    for (const m of demoMessages) {
      if (stop.current) break;
      await ingest({ ...m, id: `${m.id}-${Date.now()}` });
    }
    setRunning(false);
  }

  function reset() {
    stop.current = true;
    resetIds();
    bookRef.current = [];
    setBook([]);
    setActions([]);
    setFeed([]);
    setCurrent(null);
    setCampaign(null);
    setPosted(0);
  }

  async function draft(a: Action) {
    const b = book.find((x) => x.id === a.bookingId);
    const kindText: Record<Action["kind"], string> = {
      reconfirm: `Reconfirm their existing reservation since our system is down. If they reply YES to reconfirm, ${restaurant.reconfirmPerk} tonight as thanks`,
      referral: `A friend (${a.detail.split("referred by ")[1] ?? "a friend"}) told us about their reservation. Confirm it, and tell them they and their friend each get a free dessert tonight`,
      perk: `Thank them for reaching out after our post, confirm their table, and tell them ${restaurant.perk} is on us tonight`,
      waitlist_offer: `Good news: a table just opened for them (${a.detail}). Hold for 15 minutes, reply YES to take it`,
      suspicious: "Politely ask for the name the reservation is under, the time and party size so we can find it",
      confirm_new: "Confirm their new table is booked",
      offer_alt: `Their requested time is full; offer these alternatives: ${a.detail}`,
      ack_cancel: "Acknowledge their cancellation kindly",
      confirm_change: `Confirm the change to their reservation: ${a.detail}`,
      change_conflict: `We can't fit the change at that time; offer: ${a.detail}`,
      reply_question: "Answer: yes we take walk-ins at the bar, first come first served; tables are limited tonight",
      manager: `Personal note from the manager acknowledging: ${a.detail}`,
    };
    setActions((all) => all.map((x) => (x.id === a.id ? { ...x, draft: "Drafting…" } : x)));
    const r = await fetch("/api/resy/reply", {
      method: "POST",
      body: JSON.stringify({ kind: kindText[a.kind], guest: { name: b?.name ?? "there", partySize: b?.partySize ?? 2, time: b ? fmt(b.time) : "tonight", notes: b?.notes }, language: a.language }),
    });
    const { text } = await r.json();
    setActions((all) => all.map((x) => (x.id === a.id ? { ...x, draft: text } : x)));
  }

  const send = (a: Action) => {
    setActions((all) => all.map((x) => (x.id === a.id ? { ...x, status: "sent" } : x)));
    if (a.bookingId && (a.kind === "confirm_new" || a.kind === "reconfirm" || a.kind === "referral"))
      setBook((bk) => (bookRef.current = bk.map((b) => (b.id === a.bookingId ? { ...b, status: "verified", dessert: a.kind !== "confirm_new" || b.dessert } : b))));
  };

  const live = book.filter((b) => b.status !== "cancelled" && b.status !== "waitlist");
  const waitlist = book.filter((b) => b.status === "waitlist");
  const covers = live.reduce((s, b) => s + b.partySize, 0);
  const queue = [...actions].sort((a, b) => (a.status === b.status ? b.priority - a.priority : a.status === "pending" ? -1 : 1));
  const overbooked = live.filter((b) => !b.table).length;
  const ghosts = Math.max(0, restaurant.typicalCovers - covers);
  const bufferTables = Math.ceil(ghosts / 3.5);
  const perks = live.filter((b) => b.perk === "granted").length + live.filter((b) => b.dessert).length + live.filter((b) => b.referredBy).length * 2;
  const j = current?.j;
  const mood: "calm" | "concerned" | "alarm" | "skeptical" = !j ? "calm" : j.manager > 0.6 ? "alarm" : j.intent === "irrelevant" ? "skeptical" : j.urgency > 2.2 ? "concerned" : "calm";

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <div className="bg-red-700 px-4 py-1 text-center text-sm font-semibold">⚠ RESY OFFLINE since {restaurant.outageSince} · Fallback Host is rebuilding tonight’s book</div>
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 px-4 py-2">
        <div className="mr-auto">
          <div className="text-xs uppercase tracking-widest text-slate-400">Fallback Host · {restaurant.name} · now {restaurant.now}</div>
          <h1 className="text-lg font-semibold">Tonight’s book, rebuilt from every channel</h1>
        </div>
        <Stat label="bookings" value={live.length} />
        <Stat label="covers" value={covers} />
        <Stat label="verified" value={live.filter((b) => b.status === "verified").length} />
        <Stat label="to confirm" value={actions.filter((a) => a.status === "pending").length} />
        <Stat label="overbooked" value={overbooked} warn={overbooked > 0} />
        <Stat label="👻 missing covers" value={`~${ghosts}`} />
        <Stat label="🎁 perks" value={perks} />
        <span className={`rounded-full px-2 py-0.5 text-xs ${jevLive ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>Jev {jevLive ? "live" : "mock"}</span>
        <button onClick={running ? () => (stop.current = true) : run} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold hover:bg-red-500">
          {running ? "■ Stop" : "▶ Scan inbox, voicemail & DMs"}
        </button>
        <button onClick={launchCampaign} disabled={campaignBusy || running} className="rounded bg-fuchsia-600 px-3 py-1.5 text-sm font-semibold hover:bg-fuchsia-500 disabled:opacity-40">
          {campaignBusy ? "📣 Campaign live…" : "📣 Launch recovery campaign"}
        </button>
        <button onClick={reset} className="rounded border border-slate-700 px-3 py-1.5 text-sm">Reset</button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_1fr_400px]">
        {/* Inbox */}
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/50">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">Everything that mentions tonight</h2>
          <form
            className="flex gap-2 border-b border-slate-800 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) ingest({ id: `x-${Date.now()}`, channel: "manual", from: "Phone call", received: "now", text: manual });
              setManual("");
            }}
          >
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Log a phone call…" className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm outline-none" />
            <button className="rounded bg-slate-700 px-2 text-sm">Add</button>
          </form>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {feed.map(({ m, j, outcome }) => (
              <li key={m.id} className="rounded border border-slate-800 bg-slate-900 p-2 text-xs">
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>{CH_ICON[m.channel]} {m.from}</span>
                  <span>{j ? INTENT_LABEL[j.intent] : outcome ? "" : "reading…"}</span>
                </div>
                <p className="text-slate-200">{m.text}</p>
                {outcome && <p className="mt-1 font-semibold text-sky-300">→ {outcome}</p>}
              </li>
            ))}
          </ul>
        </section>

        {/* Jev + floor */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="flex gap-4 rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-3">
            <div className="flex w-32 shrink-0 flex-col items-center">
              <PixelJev mood={mood} thinking={thinking} />
              <div className="text-center text-[11px] text-slate-400">{thinking ? "Reading…" : current ? "Decided" : "Waiting"}</div>
            </div>
            <div className="min-w-0 flex-1 text-xs">
              {current ? (
                <>
                  <div key={current.m.id} className="jev-pop mb-2 rounded bg-slate-800/80 p-2 text-slate-200">
                    {CH_ICON[current.m.channel]} “{current.m.text}”
                  </div>
                  {j && !thinking && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <div className="mb-0.5 text-slate-400">What is this?</div>
                        {Object.entries(j.intentProbs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v], i) => (
                          <Bar key={k} label={INTENT_LABEL[k] ?? k} value={v} strong={i === 0} delay={i * 120} />
                        ))}
                      </div>
                      <div className="space-y-1">
                        <div>
                          <div className="text-slate-400">Matches a booking we already have?</div>
                          <div className="font-semibold text-violet-300">{j.matchOf ? `Yes → ${book.find((b) => b.id === j.matchOf)?.name ?? j.matchOf}` : "No"}</div>
                        </div>
                        <Bar label="Needs the manager?" value={j.manager} strong={j.manager > 0.6} delay={250} />
                        <Bar label={`Urgency (${j.urgency.toFixed(1)}/3)`} value={j.urgency / 3} strong={j.urgency > 2} delay={350} />
                        {current.outcome && <div className="jev-stamp mt-1 inline-block rounded border-2 border-sky-400 px-2 py-1 font-bold text-sky-300">{current.outcome}</div>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-24 items-center text-slate-500">Press ▶ to watch Jev rebuild the book message by message.</div>
              )}
            </div>
          </div>

          <VoiceAgent ingest={ingest} treat={treat} />

          {campaign && (
            <div className="rounded-lg border border-fuchsia-800 bg-fuchsia-950/30 p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">📣 Recovery campaign · turn the outage into a reason to reach out</h2>
                <span className="text-fuchsia-300">Reward: {restaurant.perk} · Jev filters freeloaders</span>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
                {([
                  ["📷 Instagram story", campaign.instagram_story],
                  ["🔎 Google Business", campaign.google_post],
                  ["𝕏 Post", campaign.x_post],
                  ["🌐 Website banner", campaign.website_banner],
                  ["🚪 Door sign + QR", campaign.door_sign],
                  ["🤝 Referral post", campaign.referral_post],
                ] as const).map(([ch, text], i) => (
                  <div key={ch} className={`rounded border p-2 transition-all duration-500 ${posted > i ? "border-fuchsia-500 bg-slate-900 opacity-100" : "border-slate-800 opacity-40"}`}>
                    <div className="mb-1 flex justify-between font-semibold">
                      <span>{ch}</span>
                      <span className={posted > i ? "text-emerald-400" : "text-slate-500"}>{posted > i ? "live ✓" : "posting…"}</span>
                    </div>
                    <p className="text-slate-300">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Floor timeline */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <h2 className="font-semibold">Tonight’s floor (rebuilt)</h2>
              <div className="flex gap-2 text-[10px]">
                <Legend c="bg-emerald-600" t="verified (2+ sources / guest replied)" />
                <Legend c="bg-amber-600" t="unverified (1 source)" />
                <Legend c="bg-sky-600" t="new, held" />
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded bg-slate-800 px-2 py-0.5">👻 Tuesday avg {restaurant.typicalCovers} covers → ~{ghosts} still unaccounted → hold {bufferTables} buffer table{bufferTables === 1 ? "" : "s"} for walk-ups who had a booking</span>
              {waitlist.length > 0 && <span className="rounded bg-slate-800 px-2 py-0.5">⏳ Waitlist: {waitlist.map((w) => `${w.name} (${w.partySize} @ ${fmt(w.time)})`).join(", ")}</span>}
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] text-[10px]" style={{ gridTemplateColumns: `48px repeat(${restaurant.slots.length}, 1fr)` }}>
                <div />
                {restaurant.slots.map((s) => (
                  <div key={s} className="border-l border-slate-800 pl-1 text-slate-500">{fmt(s).replace(":00", "")}</div>
                ))}
                {restaurant.tables.map((t) => (
                  <Row key={t.id} table={t} book={book} />
                ))}
                {overbooked > 0 && (
                  <>
                    <div className="py-1 font-semibold text-red-400">NO TABLE</div>
                    <div className="col-span-full -mt-5 ml-12 flex flex-wrap gap-1 py-1" style={{ gridColumn: `2 / span ${restaurant.slots.length}` }}>
                      {live.filter((b) => !b.table).map((b) => (
                        <span key={b.id} className="rounded bg-red-700 px-1.5 py-0.5">{b.name} · {b.partySize} @ {fmt(b.time)}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <PaymentsPanel
            book={book}
            onApply={(nextBook, newActions) => {
              bookRef.current = nextBook;
              setBook(nextBook);
              setActions((a) => [...a, ...newActions]);
            }}
          />
          <BackupPanel book={book} />
          <ResyBackPanel book={book} feed={feed} />
        </section>

        {/* Actions */}
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/50">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">Outreach queue · AI drafts, host approves</h2>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {queue.map((a) => (
              <li key={a.id} className={`rounded border border-slate-800 bg-slate-900 p-2 text-xs ${a.status === "sent" ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-bold text-slate-950 ${a.priority >= 60 ? "bg-red-400" : a.priority >= 40 ? "bg-amber-400" : "bg-slate-400"}`}>{a.priority}</span>
                  <span className="font-semibold">{a.title}</span>
                  {a.language !== "English" && a.language !== "unknown" && <span className="rounded bg-sky-900 px-1 text-sky-200">{a.language}</span>}
                </div>
                <p className="mt-1 text-slate-400">{a.detail}</p>
                {a.draft && <p className="mt-1 rounded bg-slate-800 p-1.5 text-slate-200">💬 {a.draft}</p>}
                <div className="mt-1.5 flex gap-2">
                  {a.status === "pending" ? (
                    <>
                      <button onClick={() => draft(a)} className="rounded bg-slate-700 px-2 py-0.5">{a.draft ? "Redraft" : "Draft SMS"}</button>
                      <button onClick={() => send(a)} className="rounded bg-emerald-600 px-2 py-0.5 font-semibold">Approve & send</button>
                    </>
                  ) : (
                    <span className="text-emerald-400">✓ sent</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ table, book }: { table: { id: string; seats: number }; book: Booking[] }) {
  const bs = book.filter((b) => b.table === table.id || (b.status === "cancelled" && b.table === table.id));
  return (
    <>
      <div className="border-t border-slate-800 py-1 text-slate-400">{table.id} <span className="text-slate-600">({table.seats})</span></div>
      <div className="relative border-t border-slate-800" style={{ gridColumn: `2 / span ${restaurant.slots.length}` }}>
        {bs.map((b) => {
          const i = restaurant.slots.indexOf(b.time);
          if (i < 0) return null;
          const w = (restaurant.turnMinutes / 30 / restaurant.slots.length) * 100;
          return (
            <div
              key={b.id}
              title={`${b.name} · ${b.partySize} @ ${fmt(b.time)} · ${b.notes}`}
              className={`jev-pop absolute top-0.5 h-5 truncate rounded border px-1 leading-5 ${STATUS_COLOR[b.status]}`}
              style={{ left: `${(i / restaurant.slots.length) * 100}%`, width: `${w}%` }}
            >
              {b.paid ? "💳 " : ""}{b.vip ? "★ " : ""}{b.perk === "granted" ? "🎁 " : ""}{b.referredBy ? "🤝 " : ""}{b.dessert ? "🍰 " : ""}{b.name} · {b.partySize}
            </div>
          );
        })}
        <div className="h-6" />
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="text-center leading-tight">
      <div className={`text-base font-semibold ${warn ? "text-red-400" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}
function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span className={`inline-block h-2 w-2 rounded ${c}`} />
      {t}
    </span>
  );
}
function Bar({ label, value, strong, delay = 0 }: { label: string; value: number; strong?: boolean; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value), 50 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div>
      <div className="flex justify-between">
        <span className={strong ? "font-semibold text-white" : "text-slate-400"}>{label}</span>
        <span className="tabular-nums text-slate-400">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800">
        <div className={`h-1.5 rounded transition-all duration-700 ${strong ? "bg-sky-400" : "bg-slate-600"}`} style={{ width: `${w * 100}%` }} />
      </div>
    </div>
  );
}

/** Never again: from now on the book is continuously copied outside Resy. */
function BackupPanel({ book }: { book: Booking[] }) {
  const [snapshots, setSnapshots] = useState(0);
  const [flash, setFlash] = useState(false);
  const [last, setLast] = useState<string>("—");
  useEffect(() => {
    if (!book.length) return;
    const t = setTimeout(() => {
      setSnapshots((n) => n + 1);
      setLast(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
    }, 800);
    return () => clearTimeout(t);
  }, [book]);

  function download() {
    const rows = [["name", "party", "time", "table", "phone", "status", "notes", "sources"], ...book.map((b) => [b.name, b.partySize, fmt(b.time), b.table ?? "", b.phone ?? "", b.status, b.notes, b.sources.length])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `lupa-book-tonight-${Date.now()}.csv`;
    a.click();
  }

  const dests = [
    ["✉️", "Email to manager@lupatrattoria.com", "every change + every 15 min"],
    ["📊", "Google Sheet “Tonight’s Book”", "live sync"],
    ["📱", "Offline copy on host iPad", "works with no Wi-Fi"],
    ["🖨️", "Printed run sheet", "auto-prints at 4:30 PM"],
  ];
  return (
    <div className={`rounded-lg border p-3 text-xs transition-colors ${flash ? "border-emerald-400 bg-emerald-950/40" : "border-slate-800 bg-slate-900/50"}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🛡️ Never again: automatic book backups (outside Resy)</h2>
        <button onClick={download} disabled={!book.length} className="rounded bg-slate-700 px-2 py-1 disabled:opacity-40">⬇ Download backup (CSV)</button>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {dests.map(([icon, name, freq]) => (
          <div key={name} className="rounded bg-slate-900 p-2">
            <div className="font-semibold">{icon} {name}</div>
            <div className="text-slate-400">{freq}</div>
            <div className={snapshots ? "text-emerald-400" : "text-slate-500"}>{snapshots ? `✓ synced ${last}` : "waiting for data"}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-slate-500">{snapshots} snapshots today · next outage, the book is one click away instead of buried in inboxes.</p>
    </div>
  );
}

/** When Resy comes back: push offline bookings in BEFORE it starts selling those tables online again. */
function ResyBackPanel({ book, feed }: { book: Booking[]; feed: Judged[] }) {
  const [open, setOpen] = useState(false);
  const fromResy = (b: Booking) => b.sources.some((id) => feed.find((f) => f.m.id === id)?.m.from.includes("resy.com"));
  const live = book.filter((b) => b.status !== "cancelled" && b.status !== "waitlist");
  const toEnter = live.filter((b) => !fromResy(b));
  const changed = live.filter((b) => fromResy(b) && b.sources.length > 1);
  const cancelled = book.filter((b) => b.status === "cancelled" && fromResy(b));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">🔄 When Resy comes back: sync before it double-books</h2>
        <button onClick={() => setOpen(!open)} disabled={!book.length} className="rounded bg-emerald-700 px-2 py-1 font-semibold disabled:opacity-40">
          {open ? "Hide plan" : "✅ Resy is back online"}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
          <div className="rounded bg-slate-900 p-2">
            <div className="font-semibold text-amber-300">1 · Block first ({toEnter.length})</div>
            <div className="text-slate-400">Taken offline, Resy doesn’t know them → enter before online booking reopens</div>
            {toEnter.map((b) => <div key={b.id}>• {b.name} · {b.partySize} @ {fmt(b.time)} {b.table ?? ""}</div>)}
          </div>
          <div className="rounded bg-slate-900 p-2">
            <div className="font-semibold text-sky-300">2 · Update ({changed.length})</div>
            <div className="text-slate-400">Existed in Resy but guests sent new info (size, notes, allergies)</div>
            {changed.map((b) => <div key={b.id}>• {b.name} · {b.partySize} @ {fmt(b.time)}{b.notes ? ` · ${b.notes.slice(0, 40)}` : ""}</div>)}
          </div>
          <div className="rounded bg-slate-900 p-2">
            <div className="font-semibold text-slate-300">3 · Cancel in Resy ({cancelled.length})</div>
            <div className="text-slate-400">So no-show fees / Notify alerts fire correctly</div>
            {cancelled.map((b) => <div key={b.id}>• {b.name} · {fmt(b.time)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

type ChargeRow = { ch: Charge; r: ChargeJudgment };

/** Payments as a validation layer: money is the strongest proof a booking exists. */
function PaymentsPanel({ book, onApply }: { book: Booking[]; onApply: (b: Booking[], a: Action[]) => void }) {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [last4, setLast4] = useState("");
  const [door, setDoor] = useState<{ ok: boolean; text: string } | null>(null);

  async function match() {
    setBusy(true);
    const refs = book.filter((b) => b.status !== "cancelled" && b.status !== "waitlist").map((b) => ({ id: b.id, summary: `${b.name}, party of ${b.partySize} at ${fmt(b.time)}` }));
    const { charges, results } = await cached("payments", async () => {
      const r = await fetch("/api/resy/payments", { method: "POST", body: JSON.stringify({ book: refs }) });
      return (await r.json()) as { charges: Charge[]; results: ChargeJudgment[] };
    }, 900);
    const out: ChargeRow[] = charges.map((ch) => ({ ch, r: results.find((x) => x.chargeId === ch.id)! }));
    let next = book;
    const acts: Action[] = [];
    for (const { ch, r: j } of out) {
      if (j.isReservation < 0.6) continue;
      if (j.matchOf) {
        next = next.map((b) => (b.id === j.matchOf ? { ...b, paid: { last4: ch.last4, brand: ch.brand, amount: ch.amount }, status: "verified", sources: [...b.sources, ch.id] } : b));
      } else {
        const guests = Math.round(ch.amount / restaurant.prepaidPerPerson);
        acts.push({
          id: `pay-${ch.id}`,
          kind: "reconfirm",
          bookingId: null,
          title: `💳 Recovered from payment: ${ch.cardholder}`,
          detail: `$${ch.amount} prepaid = ${guests} guests · time unknown · ${ch.email ? `email ${ch.email}` : `card ${ch.brand} ••${ch.last4}`}`,
          priority: 85,
          status: "pending",
          language: "English",
        });
      }
    }
    setRows(out);
    onApply(next, acts);
    setBusy(false);
  }

  function check() {
    const d = last4.trim();
    const b = book.find((x) => x.paid?.last4 === d && x.status !== "cancelled");
    if (b) return setDoor({ ok: true, text: `✓ ${b.name} · ${b.partySize} @ ${fmt(b.time)} · ${b.table ?? "seat now"} · prepaid $${b.paid!.amount}` });
    const orphan = rows.find((x) => x.ch.last4 === d && x.r.isReservation >= 0.6 && !x.r.matchOf);
    if (orphan) return setDoor({ ok: true, text: `✓ Prepaid $${orphan.ch.amount} (${Math.round(orphan.ch.amount / restaurant.prepaidPerPerson)} guests) by ${orphan.ch.cardholder} — not in the book: seat at buffer table` });
    setDoor({ ok: false, text: "No prepaid booking on this card → check name in the book or offer the waitlist" });
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">💳 Payment validation · money is the strongest proof</h2>
        <button onClick={match} disabled={busy || !book.length} className="rounded bg-indigo-600 px-2 py-1 font-semibold disabled:opacity-40">
          {busy ? "Jev matching…" : "Match Resy prepayments (Stripe)"}
        </button>
      </div>
      <p className="mb-2 text-slate-500">Prepaid tables: ${restaurant.prepaidPerPerson}/guest. Uses amount, time, cardholder & last 4 only — never full card numbers; contact only to confirm their own booking.</p>
      {rows.length > 0 && (
        <ul className="mb-2 space-y-1">
          {rows.map(({ ch, r }) => {
            const b = book.find((x) => x.id === r.matchOf);
            const verdict = r.isReservation < 0.6 ? ["text-slate-500", `not a reservation (${Math.round(r.isReservation * 100)}%) → ignored`] : b ? ["text-emerald-400", `= ${b.name} (${Math.round(r.matchProb * 100)}%) → 💳 verified`] : ["text-amber-300", `prepaid, NOT in book → recovered (${Math.round(ch.amount / restaurant.prepaidPerPerson)} guests)`];
            return (
              <li key={ch.id} className="flex flex-wrap justify-between gap-2 rounded bg-slate-900 px-2 py-1">
                <span>{ch.cardholder} · {ch.brand} ••{ch.last4} · ${ch.amount} · {ch.created} · <span className="text-slate-500">{ch.description}</span></span>
                <span className={`font-semibold ${verdict[0]}`}>{verdict[1]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <form className="flex items-center gap-2" onSubmit={(e) => (e.preventDefault(), check())}>
        <span className="font-semibold">🚪 Door check:</span>
        <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="last 4 of card" className="w-28 rounded bg-slate-800 px-2 py-1 outline-none" />
        <button className="rounded bg-slate-700 px-2 py-1">Verify</button>
        {door && <span className={door.ok ? "text-emerald-400" : "text-red-400"}>{door.text}</span>}
      </form>
    </div>
  );
}
