"use client";
import { useEffect, useRef, useState } from "react";
import { campaignReplies, messages as demoMessages, restaurant, type Booking, type Message } from "@/lib/resy";
import type { Campaign, MessageExtraction, MessageJudgment } from "@/lib/resyAi";
import { fmt, reconcile, resetIds, type Action } from "@/lib/resyBook";
import { JevFace } from "./JevStage";

type Judged = { m: Message; j?: MessageJudgment; x?: MessageExtraction; outcome?: string };
const INTENT_LABEL: Record<string, string> = {
  existing_booking: "existing booking",
  new_request: "new request",
  modify: "change",
  cancel: "cancel",
  question: "question",
  irrelevant: "ignore",
};
const CH_ICON: Record<string, string> = { email: "✉️", sms: "💬", voicemail: "📞", instagram: "📷", staff: "🧑‍🍳", google: "🔎", manual: "✍️", x: "𝕏" };
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
    const r = await fetch("/api/resy/campaign", { method: "POST" });
    setCampaign(await r.json());
    for (let i = 1; i <= 5; i++) {
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

  async function ingest(m: Message) {
    setFeed((f) => [{ m }, ...f]);
    setCurrent({ m });
    setThinking(true);
    const refs = bookRef.current.filter((b) => b.status !== "cancelled").map((b) => ({ id: b.id, summary: `${b.name}, party of ${b.partySize} at ${fmt(b.time)}${b.phone ? `, phone ${b.phone}` : ""}` }));
    try {
      const r = await fetch("/api/resy/judge", { method: "POST", body: JSON.stringify({ message: m, book: refs }), signal: AbortSignal.timeout(20000) });
      const { judgment, extraction } = (await r.json()) as { judgment: MessageJudgment; extraction: MessageExtraction };
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
    } catch (e) {
      setFeed((f) => f.map((it) => (it.m.id === m.id ? { ...it, outcome: `error: ${String(e).slice(0, 60)}` } : it)));
    }
    setThinking(false);
    await new Promise((r) => setTimeout(r, 900)); // let the audience see the verdict
  }

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
      reconfirm: "Reconfirm their existing reservation since our system is down",
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
    if (a.bookingId && (a.kind === "confirm_new" || a.kind === "reconfirm"))
      setBook((bk) => (bookRef.current = bk.map((b) => (b.id === a.bookingId ? { ...b, status: "verified" } : b))));
  };

  const live = book.filter((b) => b.status !== "cancelled" && b.status !== "waitlist");
  const waitlist = book.filter((b) => b.status === "waitlist");
  const covers = live.reduce((s, b) => s + b.partySize, 0);
  const queue = [...actions].sort((a, b) => (a.status === b.status ? b.priority - a.priority : a.status === "pending" ? -1 : 1));
  const overbooked = live.filter((b) => !b.table).length;
  const ghosts = Math.max(0, restaurant.typicalCovers - covers);
  const bufferTables = Math.ceil(ghosts / 3.5);
  const perks = live.filter((b) => b.perk === "granted").length;
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
              <JevFace mood={mood} thinking={thinking} idle={!current} />
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

          {campaign && (
            <div className="rounded-lg border border-fuchsia-800 bg-fuchsia-950/30 p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">📣 Recovery campaign · turn the outage into a reason to reach out</h2>
                <span className="text-fuchsia-300">Reward: {restaurant.perk} · Jev filters freeloaders</span>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                {([
                  ["📷 Instagram story", campaign.instagram_story],
                  ["🔎 Google Business", campaign.google_post],
                  ["𝕏 Post", campaign.x_post],
                  ["🌐 Website banner", campaign.website_banner],
                  ["🚪 Door sign + QR", campaign.door_sign],
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
              {b.vip ? "★ " : ""}{b.perk === "granted" ? "🎁 " : ""}{b.name} · {b.partySize}
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
