"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { briefing, buildState, STATUS_COLOR, feed, HOMES, ORIGINS, planRoute, segLabel, steps, STATIONS, type Judged, type KReport, type Review, type Source } from "@/lib/knicks";
import { PixelJev, type Mood } from "./Pixel";

const KnicksMap = dynamic(() => import("./KnicksMap"), { ssr: false });

const SRC: Record<Source, string> = { official: "🏛️ official", social: "📱 social", "311": "☎️ 311" };
const KIND: Record<string, string> = {
  road_closed: "🚧 road closed",
  crowd: "👥 crowd",
  station_closed: "⛔ station closed",
  station_crowded: "⏳ station metered",
  reopened: "✅ reopened",
  hazard: "🔥 hazard",
  info: "💬 info / rumor",
};

export default function KnicksDashboard() {
  const [judged, setJudged] = useState<Judged[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [origin, setOrigin] = useState("msg8");
  const [home, setHome] = useState("brooklyn");
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [last, setLast] = useState<Judged | null>(null);
  const [jevLive, setJevLive] = useState(false);
  const [manual, setManual] = useState("");
  const [manualSrc, setManualSrc] = useState<Source>("social");
  const stop = useRef(false);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => setJevLive(s.jev)).catch(() => {});
  }, []);

  const state = useMemo(() => buildState(judged, reviews), [judged, reviews]);
  const plan = useMemo(() => planRoute(origin, home, state), [origin, home, state]);
  const naive = useMemo(() => planRoute(origin, home, null), [origin, home]);

  async function ingest(r: KReport) {
    setThinking(true);
    const res = await fetch("/api/knicks/judge", { method: "POST", body: JSON.stringify({ report: r }) }).then((x) => x.json());
    const x: Judged = { r, j: res.judgment, segments: res.segments ?? [], stations: res.stations ?? [], summary: res.summary };
    setJudged((p) => [...p, x]);
    setLast(x);
    setThinking(false);
  }

  async function run() {
    setRunning(true);
    stop.current = false;
    setJudged([]);
    setReviews({});
    for (const r of feed) {
      if (stop.current) break;
      await ingest(r);
      await new Promise((ok) => setTimeout(ok, 350));
    }
    setRunning(false);
  }

  async function addManual() {
    if (!manual.trim()) return;
    const r: KReport = { id: `m${Date.now()}`, source: manualSrc, author: manualSrc === "official" ? "Operator" : "Public report", minutesAgo: 0, text: manual };
    setManual("");
    await ingest(r);
  }

  const mood: Mood = !last ? "calm" : last.j.kind === "hazard" ? "alarm" : last.j.credible < 0.4 ? "skeptical" : last.j.kind === "road_closed" || last.j.kind === "station_closed" ? "concerned" : "calm";
  const counts = Object.values(state.edges).reduce((m, e) => ({ ...m, [e.status]: (m[e.status] ?? 0) + 1 }), {} as Record<string, number>);
  const sms = plan
    ? `Knicks traffic alert: ${naive && naive.station.id !== plan.station.id ? `${naive.station.name} is not your best option tonight. ` : ""}Walk ${steps(plan, origin).join(", then ")} → ${plan.station.name} (${plan.station.lines}). ~${Math.round(plan.totalMin)} min. Avoid 7th Ave 30th–35th.`
    : "";

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-800 px-4 py-2">
        <div className="text-2xl">🏆</div>
        <div className="flex-1">
          <div className="font-bold">
            Knicks Win · <span className="text-orange-400">Clear Path Home</span>
          </div>
          <div className="text-xs text-slate-400">{briefing}</div>
        </div>
        <span className={`rounded px-2 py-1 text-xs ${jevLive ? "bg-emerald-700" : "bg-slate-700"}`}>{jevLive ? "Jev live" : "Jev fallback"}</span>
        {running ? (
          <button onClick={() => (stop.current = true)} className="rounded bg-slate-700 px-3 py-1.5 text-sm">Stop</button>
        ) : (
          <button onClick={run} className="rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold hover:bg-orange-500">▶ Ingest live feed ({feed.length})</button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr_380px] gap-3 p-3">
        {/* Feed */}
        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-2">
            <PixelJev mood={mood} thinking={thinking} size={56} />
            <div className="text-xs text-slate-300">
              {last ? (
                <>
                  <div className="font-semibold">{KIND[last.j.kind]} · {Math.round(last.j.kindConfidence * 100)}% sure</div>
                  <div>credible {Math.round(last.j.credible * 100)}% · {last.r.source === "official" ? "official source → full weight" : `public → weight ${(0.45 * last.j.credible).toFixed(2)}`}</div>
                </>
              ) : (
                "Official alerts, social posts and 311 → one closure map."
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {[...judged].reverse().map((x) => (
              <div key={x.r.id} className={`rounded-lg border p-2 text-xs ${x.j.credible < 0.4 ? "border-slate-800 opacity-60" : "border-slate-700"} bg-slate-900`}>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>{SRC[x.r.source]} · {x.r.author}</span>
                  <span>{x.r.minutesAgo}m ago</span>
                </div>
                <div className="mb-1">{x.r.text}</div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">{KIND[x.j.kind]}</span>
                  <span className={`rounded px-1.5 py-0.5 ${x.j.credible < 0.4 ? "bg-red-900" : "bg-slate-800"}`}>credible {Math.round(x.j.credible * 100)}%</span>
                  {x.segments.map((s, i) => <span key={i} className="rounded bg-sky-950 px-1.5 py-0.5 text-sky-300">{segLabel(s)}</span>)}
                  {x.stations.map((s) => <span key={s} className="rounded bg-sky-950 px-1.5 py-0.5 text-sky-300">🚇 {STATIONS.find((t) => t.id === s)?.name}</span>)}
                  {reviews[x.r.id] && <span className="rounded bg-violet-900 px-1.5 py-0.5">human: {reviews[x.r.id]}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <select value={manualSrc} onChange={(e) => setManualSrc(e.target.value as Source)} className="rounded bg-slate-800 px-1 text-xs">
              <option value="social">social</option>
              <option value="311">311</option>
              <option value="official">official</option>
            </select>
            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManual()} placeholder="Type a report: '6th ave at 30th blocked by cops'" className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs" />
          </div>
        </section>

        {/* Map */}
        <section className="relative min-h-0">
          <KnicksMap state={state} plan={plan} origin={origin} />
          <div className="absolute bottom-3 left-3 z-[1000] space-y-0.5 rounded bg-slate-900/90 p-2 text-[11px]">
            {(["closed", "unconfirmed", "crowded"] as const).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-5" style={{ background: STATUS_COLOR[s] }} /> {s} ({counts[s] ?? 0} blocks)
              </div>
            ))}
            <div className="flex items-center gap-2"><span className="inline-block h-1.5 w-5 bg-sky-400" /> your route</div>
          </div>
        </section>

        {/* Planner */}
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">
            <div className="mb-2 font-semibold">🧭 Get me home</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>From<select value={origin} onChange={(e) => setOrigin(e.target.value)} className="mt-1 w-full rounded bg-slate-800 p-1">{Object.entries(ORIGINS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              <label>Home<select value={home} onChange={(e) => setHome(e.target.value)} className="mt-1 w-full rounded bg-slate-800 p-1">{Object.entries(HOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            </div>
            {naive && (
              <div className="mt-3 text-xs text-slate-400">
                Usual way: <b>{naive.station.name}</b> ({naive.station.lines}), {Math.round(naive.totalMin)} min
                {plan && naive.station.id !== plan.station.id && <span className="text-red-400"> · not tonight</span>}
              </div>
            )}
            {plan ? (
              <div className="mt-2 rounded border border-sky-700 bg-sky-950/50 p-2">
                <div className="text-base font-bold text-sky-300">
                  {plan.station.name} <span className="text-xs font-normal">({plan.station.lines})</span>
                </div>
                <div className="text-xs">
                  ~{Math.round(plan.totalMin)} min · walk {Math.round(plan.walkMin)} min{plan.waitMin ? ` + ${plan.waitMin} min entry wait` : ""}
                </div>
                <ol className="mt-1 list-decimal pl-4 text-xs">{steps(plan, origin).map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
            ) : (
              <div className="mt-2 text-xs text-red-400">No safe route found — ask an officer.</div>
            )}
            {plan && plan.rejected.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-400">
                <div className="font-semibold text-slate-300">Why not…</div>
                {plan.rejected.map((r) => <div key={r.station.id}>✗ {r.station.name}: {r.reason}</div>)}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-yellow-700/60 bg-slate-900 p-3 text-xs">
            <div className="mb-1 font-semibold text-yellow-300">👤 Needs a human ({state.needsReview.length})</div>
            <div className="mb-2 text-slate-400">Single unofficial report that changes routes. Penalized, not blocked, until someone confirms.</div>
            {state.needsReview.map((x) => (
              <div key={x.r.id} className="mb-2 rounded bg-slate-800 p-2">
                <div>{x.r.text}</div>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => setReviews((p) => ({ ...p, [x.r.id]: "confirm" }))} className="rounded bg-red-700 px-2 py-0.5">Confirm closure</button>
                  <button onClick={() => setReviews((p) => ({ ...p, [x.r.id]: "dismiss" }))} className="rounded bg-slate-600 px-2 py-0.5">Dismiss</button>
                </div>
              </div>
            ))}
          </div>

          {plan && judged.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
              <div className="mb-1 font-semibold">💬 SMS to fans near MSG (preview)</div>
              <div className="rounded bg-slate-800 p-2 font-mono">{sms}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
