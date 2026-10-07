/**
 * Mocked mobility layer for the Knicks app: car traffic, sidewalk crowds, station load.
 * Load is self-reinforcing: every app user who picks an option adds to that road / station,
 * so the next recommendation shifts — the app spreads people out instead of herding them.
 */
import { AVES, coord, dijkstra, EDGES, nearEdge, nodeId, ord, POIS, STATIONS, walkBack, type buildState, type Edge, type Poi, type Station } from "./knicks";

export type Mode = "car" | "transit" | "walk";
type Target = { a: number; s: number; beyond: number; via: string };
export type Dest = { id: string; label: string; emoji: string; car: Target; walk: Target | null; transit: { station: string; line: string; ride: number }[] };

export const DESTS: Dest[] = [
  { id: "brooklyn", label: "Park Slope, Brooklyn", emoji: "🏠", car: { a: 10, s: 14, beyond: 22, via: "Williamsburg Bridge" }, walk: { a: 5, s: 14, beyond: 62, via: "Brooklyn Bridge" },
    transit: [{ station: "penn7", line: "2/3", ride: 27 }, { station: "herald", line: "B/D/F/Q", ride: 25 }, { station: "st23fm", line: "F", ride: 27 }, { station: "st23ce", line: "C→A", ride: 31 }, { station: "bryant", line: "B/D/F", ride: 28 }] },
  { id: "queens", label: "Jackson Heights, Queens", emoji: "🏠", car: { a: 10, s: 36, beyond: 14, via: "Queens-Midtown Tunnel" }, walk: { a: 11, s: 59, beyond: 55, via: "Queensboro Bridge" },
    transit: [{ station: "times", line: "7", ride: 24 }, { station: "bryant", line: "7", ride: 22 }, { station: "herald", line: "M/R", ride: 28 }, { station: "penn8", line: "E", ride: 20 }, { station: "st23ce", line: "E", ride: 23 }] },
  { id: "nj", label: "Hoboken, NJ", emoji: "🏠", car: { a: 0, s: 39, beyond: 12, via: "Lincoln Tunnel" }, walk: null,
    transit: [{ station: "path33", line: "PATH", ride: 17 }, { station: "penn8", line: "NJ Transit", ride: 14 }, { station: "pabt", line: "NJ bus 126", ride: 22 }, { station: "st23fm", line: "PATH (23 St)", ride: 16 }] },
  { id: "uws", label: "Upper West Side", emoji: "🏠", car: { a: 2, s: 59, beyond: 7, via: "Columbus Circle" }, walk: { a: 2, s: 59, beyond: 18, via: "Central Park West" },
    transit: [{ station: "penn7", line: "1/2/3", ride: 13 }, { station: "times", line: "1/2/3", ride: 10 }, { station: "st28", line: "1", ride: 16 }, { station: "pabt", line: "A/C", ride: 11 }, { station: "penn8", line: "A/C", ride: 12 }] },
  { id: "gct", label: "Grand Central", emoji: "🚉", car: { a: 7, s: 42, beyond: 0, via: "" }, walk: { a: 7, s: 42, beyond: 0, via: "" },
    transit: [{ station: "times", line: "S shuttle", ride: 4 }, { station: "bryant", line: "7", ride: 3 }] },
];

// Hot spots (avenue index, street, strength).
const HOT_WALK: [number, number, number][] = [[2.5, 32, 1.1], [3, 44, 0.9], [4, 34, 0.45], [2, 41, 0.4]];
const HOT_CAR: [number, number, number][] = [[2.5, 32, 1.2], [3, 44, 0.9], [4, 34, 0.5], [2, 41, 0.6], [0.4, 39, 0.9], [10, 36, 0.6]];
const field = (hot: [number, number, number][], a: number, s: number) =>
  hot.reduce((t, [ha, hs, k]) => t + k * Math.exp(-Math.hypot((a - ha) * 3.2, s - hs) / 3), 0);
const mid = (e: Edge) => {
  const [a1, s1] = e.a.split(":").map(Number), [a2, s2] = e.b.split(":").map(Number);
  return [(a1 + a2) / 2, (s1 + s2) / 2] as const;
};
const BASE_CAR = Object.fromEntries(EDGES.map((e) => [e.key, field(HOT_CAR, ...mid(e))]));
const BASE_WALK = Object.fromEntries(EDGES.map((e) => [e.key, field(HOT_WALK, ...mid(e))]));
const BASE_STATION = Object.fromEntries(STATIONS.map((s) => [s.id, Math.min(0.9, field(HOT_WALK, s.a, s.s) * 0.8)]));

export type Sim = { tick: number; edgeLoad: Record<string, number>; stationLoad: Record<string, number>; heading: Record<string, number> };
export const newSim = (): Sim => ({ tick: 0, edgeLoad: {}, stationLoad: {}, heading: {} });

type State = ReturnType<typeof buildState>;
const clamp = (x: number, lo = 0, hi = 1.4) => Math.max(lo, Math.min(hi, x));
export const carCong = (sim: Sim, k: string) => clamp(BASE_CAR[k] + (sim.edgeLoad[k] ?? 0));
export const walkCrowd = (sim: Sim, st: State, k: string) => clamp(BASE_WALK[k] + (st.edges[k]?.status === "crowded" ? 0.6 : 0));
export function stationLoad(sim: Sim, st: State, id: string) {
  const s = st.stations[id];
  if (s?.status === "closed") return 2;
  return clamp(BASE_STATION[id] + (s?.status === "crowded" ? 0.35 : s?.status === "unconfirmed" ? 0.15 : 0) + (sim.stationLoad[id] ?? 0), 0, 1.2);
}
export const waitFor = (load: number) => Math.round(2 + 26 * load * load);

function carMin(sim: Sim, st: State, e: Edge) {
  const s = st.edges[e.key]?.status;
  if (s === "closed" || s === "crowded") return Infinity; // closed or full of people: no cars
  const free = e.minutes * (80 / 330) + 0.25; // ~20 km/h + a light per block
  return free * (1 + 5 * carCong(sim, e.key)) * (s === "unconfirmed" ? 2 : 1);
}
function walkMin(sim: Sim, st: State, e: Edge) {
  const s = st.edges[e.key]?.status;
  if (s === "closed") return Infinity;
  return e.minutes * (1 + 0.7 * walkCrowd(sim, st, e.key)) * (s === "unconfirmed" ? 1.8 : 1);
}

/** Up to k distinct routes: rerun Dijkstra, making blocks used by earlier routes more expensive. */
function kRoutes(from: string, to: string, cost: (e: Edge) => number, k = 3) {
  const used = new Map<string, number>();
  const out: Edge[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < k + 2 && out.length < k; i++) {
    const { prev } = dijkstra(from, (e) => cost(e) * (1 + 0.9 * (used.get(e.key) ?? 0)));
    const r = walkBack(prev, from, to);
    if (!r) break;
    const sig = r.map((e) => e.key).join();
    r.forEach((e) => used.set(e.key, (used.get(e.key) ?? 0) + 1));
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(r);
  }
  return out;
}

export type Leg = { path: [number, number][]; level: number; key: string };
export type Step = { text: string; from: number; to: number };
export type Option = {
  key: string; mode: Mode; title: string; sub: string;
  legs: Leg[]; path: [number, number][]; steps: Step[];
  moveMin: number; freeMin: number; waitMin: number; rideMin: number; beyondMin: number; totalMin: number;
  crowd: number; heading: number; station?: Station; line?: string; notes: string[]; recommended?: boolean; score: number;
};

function trace(edges: Edge[], from: string) {
  const [a0, s0] = from.split(":").map(Number);
  const path: [number, number][] = [coord(a0, s0)];
  const steps: Step[] = [];
  let cur = from;
  edges.forEach((e, i) => {
    const nxt = e.a === cur ? e.b : e.a;
    const [a, s] = nxt.split(":").map(Number);
    path.push(coord(a, s));
    const road = e.key.startsWith("A") ? `${AVES[a]} Ave` : `W ${ord(s)} St`.replace(/^W (.*) St$/, (m, n) => (a >= 6 ? `E ${n} St` : m));
    const last = steps.at(-1);
    if (last && last.text.includes(road)) { last.to = i + 1; }
    else steps.push({ text: `${steps.length ? "Turn onto" : "Head along"} ${road}`, from: i, to: i + 1 });
    cur = nxt;
  });
  for (const st of steps) {
    const n = st.to - st.from;
    const [a, s] = edges[st.to - 1] ? (() => { let c = from; for (let i = 0; i < st.to; i++) c = edges[i].a === c ? edges[i].b : edges[i].a; return c.split(":").map(Number); })() : [a0, s0];
    st.text += ` · ${n} block${n > 1 ? "s" : ""} to ${AVES[a]} & ${ord(s)}`;
  }
  return { path, steps };
}

const level = (x: number) => (x > 0.8 ? 3 : x > 0.5 ? 2 : x > 0.25 ? 1 : 0);

export function options(mode: Mode, from: string, dest: Dest, sim: Sim, st: State): Option[] {
  let out: Option[] = [];
  if (mode === "car" || mode === "walk") {
    const t = mode === "car" ? dest.car : dest.walk;
    if (!t) return [];
    const cost = (e: Edge) => (mode === "car" ? carMin(sim, st, e) : walkMin(sim, st, e));
    const free = (e: Edge) => (mode === "car" ? e.minutes * (80 / 330) + 0.25 : e.minutes);
    out = kRoutes(from, nodeId(t.a, t.s), cost).map((edges, i) => {
      const { path, steps } = trace(edges, from);
      const lv = edges.map((e) => (mode === "car" ? carCong(sim, e.key) : walkCrowd(sim, st, e.key)));
      const moveMin = edges.reduce((x, e) => x + cost(e), 0);
      const freeMin = edges.reduce((x, e) => x + free(e), 0);
      const via = steps.map((s) => s.text.split(" · ")[0].replace(/^(Head along|Turn onto) /, "")).filter((r) => r.includes("Ave")).slice(0, 2).join(" → ");
      const key = `${mode}:${dest.id}:${via}`;
      const jams = edges.filter((_, j) => lv[j] > 0.5).length;
      if (t.via) steps.push({ text: `Continue via ${t.via} · ~${t.beyond} min`, from: edges.length, to: edges.length });
      return {
        key, mode, title: `via ${via || "side streets"}`, sub: t.via ? `then ${t.via}` : "",
        legs: edges.map((e, j) => ({ path: e.path, level: level(lv[j]), key: e.key })), path, steps,
        moveMin, freeMin, waitMin: 0, rideMin: 0, beyondMin: t.beyond, totalMin: moveMin + t.beyond,
        crowd: lv.length ? Math.max(...lv) : 0, heading: sim.heading[key] ?? 0, score: 0,
        notes: [jams ? `${jams} congested block${jams > 1 ? "s" : ""} (+${Math.round(moveMin - freeMin)} min)` : "Clear roads", i === 0 ? "" : "Alternative"].filter(Boolean),
      };
    });
  } else {
    for (const opt of dest.transit) {
      const station = STATIONS.find((s) => s.id === opt.station)!;
      const load = stationLoad(sim, st, station.id);
      const key = `transit:${station.id}:${opt.line}`;
      if (load >= 2) continue; // closed
      const [edges] = kRoutes(from, nodeId(station.a, station.s), (e) => walkMin(sim, st, e), 1);
      if (!edges) continue;
      const { path, steps } = trace(edges, from);
      const moveMin = edges.reduce((x, e) => x + walkMin(sim, st, e), 0);
      const waitMin = waitFor(load);
      steps.push({ text: `Board ${opt.line} at ${station.name} · wait ~${waitMin} min, ride ${opt.ride} min`, from: edges.length, to: edges.length });
      out.push({
        key, mode, title: `${opt.line} from ${station.name}`, sub: station.lines, station, line: opt.line,
        legs: edges.map((e) => ({ path: e.path, level: level(walkCrowd(sim, st, e.key)), key: e.key })), path, steps,
        moveMin, freeMin: edges.reduce((x, e) => x + e.minutes, 0), waitMin, rideMin: opt.ride, beyondMin: 0, totalMin: moveMin + waitMin + opt.ride,
        crowd: Math.min(1, load), heading: sim.heading[key] ?? 0, score: 0,
        notes: [load > 0.8 ? `Packed platform (${Math.round(Math.min(1, load) * 100)}%)` : load > 0.5 ? `Busy (${Math.round(load * 100)}%)` : `Room to board (${Math.round(load * 100)}%)`],
      });
    }
  }
  const seenKeys = new Set<string>();
  out.forEach((o, i) => { if (seenKeys.has(o.key)) o.key += `#${i}`; seenKeys.add(o.key); });
  // Policy: time first, but heavy crowds cost extra (safety), so the app doesn't send everyone into the crush.
  out.forEach((o) => (o.score = o.totalMin + 18 * Math.max(0, o.crowd - 0.7)));
  out.sort((x, y) => x.score - y.score);
  out = out.slice(0, 3);
  if (out[0]) out[0].recommended = true;
  return out;
}

/** Place to wait out the rush: near the route start, not in a hot spot. */
export function stopover(opt: Option, st: State): { poi: Poi; minutes: number; saves: string } | null {
  if (opt.crowd < 0.6 || !opt.path.length) return null;
  const [lat, lng] = opt.path[0];
  const hot = Object.entries(st.edges).filter(([, v]) => v.status !== "open").map(([k]) => k);
  const poi = POIS.filter((p) => !hot.some((k) => nearEdge(p, k, 120)))
    .map((p) => ({ p, d: Math.hypot((p.lat - lat) * 111_000, (p.lng - lng) * 84_000) }))
    .filter((x) => x.d < 1200)
    .sort((a, b) => a.d - b.d)[0]?.p;
  if (!poi) return null;
  const after = Math.max(0.3, opt.crowd * 0.55);
  return {
    poi, minutes: 20,
    saves: opt.mode === "transit" ? `${opt.station?.name} drops from ${Math.round(opt.crowd * 100)}% to ~${Math.round(after * 100)}% full` : `traffic on your route eases ~${Math.round((1 - after / opt.crowd) * 100)}%`,
  };
}

/** One simulated minute: other fans pick options (most follow the app), loads build up, old load decays. */
export function step(sim: Sim, st: State, fromNode: string, rng = Math.random): Sim {
  const next: Sim = {
    tick: sim.tick + 1,
    edgeLoad: Object.fromEntries(Object.entries(sim.edgeLoad).map(([k, v]) => [k, v * 0.93]).filter(([, v]) => (v as number) > 0.01)),
    stationLoad: Object.fromEntries(Object.entries(sim.stationLoad).map(([k, v]) => [k, v * 0.93])),
    heading: Object.fromEntries(Object.entries(sim.heading).map(([k, v]) => [k, Math.round(v * 0.96)])),
  };
  const dest = DESTS[Math.floor(rng() * DESTS.length)];
  for (const [mode, fans] of [["transit", 90], ["car", 25], ["walk", 20]] as const) {
    const opts = options(mode, fromNode, dest, sim, st);
    if (!opts.length) continue;
    const w = opts.map((o) => Math.exp(-(o.score - opts[0].score) / 6));
    const W = w.reduce((a, b) => a + b, 0);
    opts.forEach((o, i) => addLoad(next, o, Math.round((fans * w[i]) / W)));
  }
  return next;
}

export function addLoad(sim: Sim, o: Option, people: number) {
  sim.heading[o.key] = (sim.heading[o.key] ?? 0) + people;
  if (o.mode === "transit" && o.station) sim.stationLoad[o.station.id] = (sim.stationLoad[o.station.id] ?? 0) + people * 0.0022;
  if (o.mode === "car") for (const l of o.legs) sim.edgeLoad[l.key] = (sim.edgeLoad[l.key] ?? 0) + people * 0.006;
}

