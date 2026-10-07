"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AVES, buildState, coord, feed, MAX_ST, MIN_ST, nodeId, type Judged, type LatLng, type Review } from "@/lib/knicks";
import { addLoad, DESTS, newSim, options, step, stopover, type Mode, type Option, type Sim } from "@/lib/knicksSim";

const WazeMap = dynamic(() => import("./WazeMap"), { ssr: false });

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "car", icon: "🚗", label: "Drive" },
  { id: "transit", icon: "🚇", label: "Transit" },
  { id: "walk", icon: "🚶", label: "Walk" },
];
const KIND: Record<string, string> = { road_closed: "🚧 Closed", crowd: "👥 Crowd", station_closed: "⛔ Station closed", station_crowded: "⏳ Station packed", reopened: "✅ Reopened", hazard: "🔥 Hazard", info: "💬 Rumor/info" };
const MSG = { lat: coord(2, 31)[0], lng: coord(2, 31)[1] };
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)}` : `${Math.round(m)}`);
const BOOT_MS = 8500;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

function snap(p: LatLng) {
  let best = nodeId(2, 31), d = Infinity;
  for (let a = 0; a < AVES.length; a++)
    for (let s = MIN_ST; s <= MAX_ST; s++) {
      const [la, ln] = coord(a, s);
      const x = Math.hypot((la - p.lat) * 111, (ln - p.lng) * 84);
      if (x < d) { d = x; best = nodeId(a, s); }
    }
  return { node: best, km: d };
}

export default function KnicksApp() {
  // Signals (official + social + 311, judged by Jev)
  const [judged, setJudged] = useState<Judged[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const state = useMemo(() => buildState(judged, reviews), [judged, reviews]);

  // Where am I
  const [gps, setGps] = useState<LatLng | null>(null);
  const [picked, setPicked] = useState<LatLng | null>(null);
  const raw = picked ?? gps ?? MSG;
  const snapped = snap(raw);
  const usingGps = !picked && gps && snapped.km < 0.4;
  const originNode = usingGps || picked ? snapped.node : nodeId(2, 31);

  const [destId, setDestId] = useState("brooklyn");
  const dest = DESTS.find((d) => d.id === destId)!;
  const [mode, setMode] = useState<Mode>("transit");
  const [selected, setSelected] = useState<string | null>(null);
  const [sim, setSim] = useState<Sim>(newSim);
  const [nav, setNav] = useState<Option | null>(null);
  const [progress, setProgress] = useState(0);
  const [sheet, setSheet] = useState<"routes" | "alerts">("routes");
  const [toast, setToast] = useState<string | null>(null);
  const prevRec = useRef<Record<string, string>>({});
  // Opening sequence: sources come online one by one while the map fills in from your location
  const [boot, setBoot] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / BOOT_MS);
      setBoot((b) => (b >= 1 ? 1 : p));
      if (p >= 1) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, []);
  const booting = boot < 1;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clock = (m: number) => (now ? new Date(now + m * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--");

  // Live GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Ingest the signal feed through Jev, 3 at a time, in timeline order
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < feed.length && alive; i += 3) {
        const batch = await Promise.all(feed.slice(i, i + 3).map(async (r) => {
          try {
            const res = await fetch("/api/knicks/judge", { method: "POST", body: JSON.stringify({ report: r }) }).then((x) => x.json());
            return { r, j: res.judgment, segments: res.segments ?? [], stations: res.stations ?? [] } as Judged;
          } catch { return null; }
        }));
        if (alive) setJudged((p) => [...p, ...batch.filter((x): x is Judged => !!x)]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Other fans leaving: one simulated minute every 1.5 s
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const id = setInterval(() => setSim((s) => step(s, stateRef.current, nodeId(2, 31))), 1500);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(() => Object.fromEntries(MODES.map((m) => [m.id, options(m.id, originNode, dest, sim, state)])) as Record<Mode, Option[]>, [originNode, dest, sim, state]);
  const opts = all[mode];
  const sel = nav ?? opts.find((o) => o.key === selected) ?? opts[0];

  // Tell the user when the recommendation flips because others piled in
  useEffect(() => {
    const rec = opts[0];
    const id = `${mode}:${destId}`;
    if (!rec) return;
    const before = prevRec.current[id];
    if (before && before !== rec.key && !nav) {
      const old = opts.find((o) => o.key === before);
      setToast(`↻ New best route: ${rec.title}${old ? ` — ${old.title} is filling up` : ""}`);
      setTimeout(() => setToast(null), 3500);
    }
    prevRec.current[id] = rec.key;
  }, [opts, mode, destId, nav]);

  // Simulated movement while navigating
  useEffect(() => {
    if (!nav) return;
    const id = setInterval(() => setProgress((p) => Math.min(p + 1, nav.path.length - 1)), 900);
    return () => clearInterval(id);
  }, [nav]);
  const me: LatLng = nav ? { lat: nav.path[progress][0], lng: nav.path[progress][1] } : picked ?? (usingGps ? raw : MSG);
  const arrived = nav && progress >= nav.path.length - 1;
  const curStep = nav ? (nav.steps.find((s) => progress < s.to) ?? nav.steps.at(-1)!) : null;
  const left = nav ? nav.totalMin * (1 - progress / Math.max(1, nav.path.length - 1) * (nav.moveMin / nav.totalMin)) : 0;

  function go() {
    if (!sel) return;
    setSim((s) => { const n = structuredClone(s); addLoad(n, sel, 1); return n; });
    setNav(sel);
    setProgress(0);
  }
  const rush = () => setSim((s) => { let n = s; for (let i = 0; i < 8; i++) n = step(n, state, nodeId(2, 31)); return n; });
  const stop = sel ? stopover(sel, state) : null;
  const alerts = judged.filter((x) => x.j.kind !== "info" && x.j.credible >= 0.4).length;

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-slate-200">
      <div id="phone" className="relative h-full w-full overflow-hidden bg-white text-slate-900 md:h-[860px] md:max-h-full md:w-[420px] md:rounded-[36px] md:border-[10px] md:border-slate-900 md:shadow-2xl">
        <div className="absolute inset-0">
          <WazeMap me={me} mode={nav?.mode ?? mode} opts={booting ? [] : nav ? [nav] : opts} reveal={boot} selected={sel?.key ?? null} onSelect={setSelected} state={state} sim={sim} follow={!!nav} onPick={(p) => { setPicked(p); setNav(null); }} progress={progress} />
        </div>

        {booting ? (
          <BootOverlay boot={boot} judged={judged} onSkip={() => setBoot(1)} />
        ) : (
        <>
        {/* ── Top ── */}
        {nav ? (
          <div className="absolute inset-x-2 top-2 z-[1000] rounded-2xl bg-[#1d6f42] p-3 text-white shadow-xl">
            <div className="text-[11px] uppercase tracking-wide opacity-80">{arrived ? "You have arrived" : "Next"}</div>
            <div className="text-lg font-bold leading-tight">{arrived ? (nav.mode === "transit" ? `Board ${nav.line} — ${nav.station?.name}` : "🏁 Destination area") : curStep?.text}</div>
          </div>
        ) : (
          <div className="absolute inset-x-2 top-2 z-[1000] space-y-2">
            <div className="rounded-2xl bg-white p-2.5 shadow-lg">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100" />
                <span className="flex-1 truncate">{picked ? "Pinned location" : usingGps ? "Your location (GPS live)" : "MSG · 8th Ave exit (simulated GPS)"}</span>
                {picked && <button onClick={() => setPicked(null)} className="text-blue-600">reset</button>}
              </div>
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {DESTS.map((d) => (
                  <button key={d.id} onClick={() => { setDestId(d.id); setSelected(null); }} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${d.id === destId ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                    {d.emoji} {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div id="modes" className="flex gap-1.5">
              {MODES.map((m) => {
                const best = all[m.id][0];
                return (
                  <button key={m.id} onClick={() => { setMode(m.id); setSelected(null); }} className={`flex-1 rounded-xl px-2 py-1.5 text-center shadow-md ${m.id === mode ? "bg-blue-600 text-white" : "bg-white"}`}>
                    <div className="text-sm font-semibold">{m.icon} {m.label}</div>
                    <div className="text-[11px] opacity-80">{best ? `${fmtMin(best.totalMin)} min` : "—"}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {toast && <div className="absolute inset-x-6 top-40 z-[1001] rounded-xl bg-slate-900/95 px-3 py-2 text-center text-xs font-semibold text-white shadow-xl">{toast}</div>}

        {!nav && (
          <div className="absolute right-2 top-[150px] z-[1000] flex flex-col gap-2">
            <button onClick={() => setSheet(sheet === "alerts" ? "routes" : "alerts")} className="rounded-full bg-amber-400 px-3 py-2 text-xs font-bold shadow-lg">⚠ {alerts}</button>
            <button onClick={rush} className="rounded-full bg-white px-3 py-2 text-xs font-bold shadow-lg" title="Fast-forward the crowd 8 minutes">⏩ +8m</button>
          </div>
        )}

        {/* ── Bottom sheet ── */}
        <div id="sheet" className="absolute inset-x-0 bottom-0 z-[1000] max-h-[46%] overflow-y-auto rounded-t-3xl bg-white px-3 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,.15)]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
          {nav ? (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-2xl font-extrabold text-green-700">{fmtMin(left)} min</div>
                <div className="text-xs text-slate-500">Arrive {clock(left)} · {nav.mode === "transit" ? `${nav.line} from ${nav.station?.name}` : nav.title}</div>
                <div className="text-[11px] text-slate-500">👥 you + {k(sim.heading[nav.key] ?? 0)} app users on this route</div>
              </div>
              <button onClick={() => setNav(null)} className="rounded-full bg-red-600 px-5 py-3 font-bold text-white">End</button>
            </div>
          ) : sheet === "alerts" ? (
            <Alerts judged={judged} state={state} reviews={reviews} setReviews={setReviews} />
          ) : (
            <>
              {!opts.length && <div className="p-4 text-center text-sm text-slate-500">{mode === "walk" ? "Not walkable — pick Transit or Drive." : "No route right now."}</div>}
              <div className="space-y-2">
                {opts.map((o) => {
                  const on = o.key === sel?.key;
                  return (
                    <button key={o.key} onClick={() => setSelected(o.key)} className={`w-full rounded-2xl border-2 p-2.5 text-left ${on ? "border-blue-600 bg-blue-50" : "border-slate-100"}`}>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-extrabold ${o.crowd > 0.8 ? "text-red-600" : o.crowd > 0.5 ? "text-orange-500" : "text-green-700"}`}>{fmtMin(o.totalMin)} min</span>
                        <span className="text-xs text-slate-500">arrive {clock(o.totalMin)}</span>
                        {o.recommended && <span className="ml-auto rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">RECOMMENDED</span>}
                      </div>
                      <div className="truncate text-sm font-semibold">{o.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200">
                          <div className={`h-full ${o.crowd > 0.8 ? "bg-red-600" : o.crowd > 0.5 ? "bg-orange-500" : "bg-green-500"}`} style={{ width: `${Math.round(Math.min(1, o.crowd) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-500">👥 {k(o.heading)} going</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {o.mode === "transit" ? `🚶 ${Math.round(o.moveMin)} + ⏳ ${o.waitMin} + 🚇 ${o.rideMin} min · ` : ""}
                        {o.notes.join(" · ")}
                        {o.beyondMin ? ` · then ${o.sub.replace("then ", "")}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
              {stop && (
                <div className="mt-2 rounded-2xl bg-purple-50 p-2.5 text-xs">
                  <div className="font-bold text-purple-800">{stop.poi.emoji} Not in a rush? Wait {stop.minutes} min at {stop.poi.name}</div>
                  <div className="text-purple-900/80">{stop.poi.why}. In {stop.minutes} min {stop.saves}. You help clear the crush.</div>
                </div>
              )}
              {sel && (
                <button onClick={go} className="mt-3 w-full rounded-full bg-blue-600 py-3 text-lg font-extrabold text-white shadow-lg active:scale-[.98]">
                  Go · {fmtMin(sel.totalMin)} min
                </button>
              )}
              <div className="mt-2 text-center text-[10px] text-slate-400">Long-press the map to set your location · mocked traffic, transit and crowds</div>
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function Alerts({ judged, state, reviews, setReviews }: { judged: Judged[]; state: ReturnType<typeof buildState>; reviews: Record<string, Review>; setReviews: (f: (p: Record<string, Review>) => Record<string, Review>) => void }) {
  const review = new Set(state.needsReview.map((x) => x.r.id));
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">Live signals · official, social, 311</div>
      <div className="text-[11px] text-slate-500">Jev checks each one. Official = full weight; public reports count by credibility; 2 credible reports confirm a closure.</div>
      {[...judged].reverse().map((x) => (
        <div key={x.r.id} className={`rounded-xl border p-2 text-xs ${x.j.credible < 0.4 ? "opacity-50" : ""}`}>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{x.r.source === "official" ? "🏛️" : x.r.source === "311" ? "☎️" : "📱"} {x.r.author}</span>
            <span>{x.r.minutesAgo}m ago</span>
          </div>
          <div>{x.r.text}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            <span className="rounded bg-slate-100 px-1.5">{KIND[x.j.kind]}</span>
            <span className={`rounded px-1.5 ${x.j.credible < 0.4 ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>credible {Math.round(x.j.credible * 100)}%</span>
            {reviews[x.r.id] && <span className="rounded bg-violet-100 px-1.5">human: {reviews[x.r.id]}</span>}
          </div>
          {review.has(x.r.id) && (
            <div className="mt-1 flex gap-1">
              <button onClick={() => setReviews((p) => ({ ...p, [x.r.id]: "confirm" }))} className="rounded-full bg-red-600 px-2 py-0.5 text-white">Confirm</button>
              <button onClick={() => setReviews((p) => ({ ...p, [x.r.id]: "dismiss" }))} className="rounded-full bg-slate-200 px-2 py-0.5">Dismiss</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const SOURCES = [
  { at: 0.0, icon: "🏛️", name: "NYPD · Notify NYC alerts", unit: "alerts", n: 14 },
  { at: 0.14, icon: "🚇", name: "MTA service status · turnstiles", unit: "stations", n: 46 },
  { at: 0.32, icon: "🚦", name: "DOT traffic speed sensors", unit: "road segments", n: 1043 },
  { at: 0.55, icon: "📱", name: "Social posts (X, Instagram, Reddit)", unit: "posts", n: 2318 },
  { at: 0.72, icon: "☎️", name: "311 reports", unit: "reports", n: 87 },
  { at: 0.84, icon: "🧠", name: "Jev: verifying + fusing signals", unit: "verdicts", n: 0 },
];

function BootOverlay({ boot, judged, onSkip }: { boot: number; judged: Judged[]; onSkip: () => void }) {
  const last = judged.slice(-3).reverse();
  return (
    <>
      <div className="absolute inset-x-2 top-2 z-[1000] rounded-2xl bg-slate-900/95 p-3 text-white shadow-xl">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-cyan-400" />
          <div className="flex-1 text-sm font-bold">Scanning Midtown after the Knicks win…</div>
          <span className="font-mono text-sm text-cyan-300">{Math.round(boot * 100)}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded bg-slate-700">
          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${boot * 100}%` }} />
        </div>
      </div>
      <div id="boot" className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-3xl bg-white px-3 pb-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,.15)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-extrabold">Collecting live signals</div>
          <button onClick={onSkip} className="text-xs font-semibold text-blue-600">Skip</button>
        </div>
        <div className="space-y-1.5">
          {SOURCES.map((s, i) => {
            const next = SOURCES[i + 1]?.at ?? 1;
            const p = Math.max(0, Math.min(1, (boot - s.at) / (next - s.at)));
            const done = p >= 1, started = boot >= s.at;
            const count = s.n ? Math.round(s.n * p) : judged.length;
            return (
              <div key={s.name} className={`flex items-center gap-2 text-xs transition-opacity ${started ? "opacity-100" : "opacity-30"}`}>
                <span className="w-5 text-center">{s.icon}</span>
                <span className="flex-1 truncate">{s.name}</span>
                <span className="font-mono text-[11px] text-slate-500">{started ? `${count.toLocaleString()} ${s.unit}` : ""}</span>
                <span className="w-4 text-center">{done ? "✅" : started ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" /> : "·"}</span>
              </div>
            );
          })}
        </div>
        {last.length > 0 && (
          <div className="mt-3 space-y-1 border-t pt-2">
            {last.map((x) => (
              <div key={x.r.id} className="truncate text-[11px] text-slate-600">
                <b>{KIND[x.j.kind]}</b> · {Math.round(x.j.credible * 100)}% credible · {x.r.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
