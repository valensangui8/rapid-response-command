/**
 * Challenge 2 — Knicks win chaos.
 * Midtown walking grid (10th–5th Ave × 23rd–45th St), demo feed, evidence fusion and routing.
 * Client-safe: the policy (weights, thresholds, penalties) lives here in plain code.
 */

export const AVES = ["10th", "9th", "8th", "7th", "6th", "5th", "Madison", "Park", "Lex", "3rd", "2nd", "1st"] as const;
export const MIN_ST = 14;
export const MAX_ST = 59;
// Each avenue's position at W 34th St; streets step north along the rotated Manhattan grid.
const AT34: [number, number][] = [
  [40.7557, -74.0006],
  [40.754, -73.9967],
  [40.7524, -73.9932],
  [40.7507, -73.9905],
  [40.7495, -73.9877],
  [40.7484, -73.9848],
  [40.7476, -73.9829],
  [40.7469, -73.9811],
  [40.7459, -73.9789],
  [40.745, -73.9767],
  [40.744, -73.9744],
  [40.7429, -73.9719],
];
const STEP: [number, number] = [0.000635, 0.000462];

export const coord = (a: number, s: number): [number, number] => [AT34[a][0] + (s - 34) * STEP[0], AT34[a][1] + (s - 34) * STEP[1]];
export const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export const nodeId = (a: number, s: number) => `${a}:${s}`;
export const aveIndex = (name: string) => {
  const n = name.toLowerCase().replace(/\s|ave(nue)?|\./g, "");
  return AVES.findIndex((x) => x === n || x.replace(/th$/, "") === n.replace(/(st|nd|rd|th)$/, ""));
};

export type Edge = { key: string; a: string; b: string; minutes: number; label: string; path: [number, number][] };

const metres = (p: [number, number], q: [number, number]) => {
  const dy = (q[0] - p[0]) * 111_000;
  const dx = (q[1] - p[1]) * 84_000;
  return Math.hypot(dx, dy);
};
const WALK_M_PER_MIN = 80;

/** Blocks with no through street (the Penn Station / MSG superblock swallows W 32nd between 7th and 8th). */
const MISSING = new Set(["S:32:2"]);

export const EDGES: Edge[] = (() => {
  const out: Edge[] = [];
  for (let a = 0; a < AVES.length; a++)
    for (let s = MIN_ST; s < MAX_ST; s++) {
      const p = coord(a, s), q = coord(a, s + 1);
      out.push({ key: `A:${a}:${s}`, a: nodeId(a, s), b: nodeId(a, s + 1), minutes: metres(p, q) / WALK_M_PER_MIN, label: `${AVES[a]} Ave, ${ord(s)}–${ord(s + 1)} St`, path: [p, q] });
    }
  for (let s = MIN_ST; s <= MAX_ST; s++)
    for (let a = 0; a < AVES.length - 1; a++) {
      const key = `S:${s}:${a}`;
      if (MISSING.has(key)) continue;
      const p = coord(a, s), q = coord(a + 1, s);
      out.push({ key, a: nodeId(a, s), b: nodeId(a + 1, s), minutes: metres(p, q) / WALK_M_PER_MIN, label: `W ${ord(s)} St, ${AVES[a]}–${AVES[a + 1]} Ave`, path: [p, q] });
    }
  return out;
})();

/** Segment as a person would say it: along an avenue between two streets, or along a street between two avenues. */
export type Segment = { avenue: string; fromStreet: number; toStreet: number } | { street: number; fromAve: string; toAve: string };

export function segmentEdges(seg: Segment): string[] {
  const keys: string[] = [];
  if ("avenue" in seg) {
    const a = aveIndex(seg.avenue);
    if (a < 0) return [];
    const lo = Math.max(MIN_ST, Math.min(seg.fromStreet, seg.toStreet));
    const hi = Math.min(MAX_ST, Math.max(seg.fromStreet, seg.toStreet));
    for (let s = lo; s < hi; s++) keys.push(`A:${a}:${s}`);
  } else {
    const x = aveIndex(seg.fromAve), y = aveIndex(seg.toAve);
    if (x < 0 || y < 0 || seg.street < MIN_ST || seg.street > MAX_ST) return [];
    for (let a = Math.min(x, y); a < Math.max(x, y); a++) keys.push(`S:${seg.street}:${a}`);
  }
  return keys.filter((k) => !MISSING.has(k));
}

export const segLabel = (seg: Segment) =>
  "avenue" in seg ? `${seg.avenue} Ave ${ord(seg.fromStreet)}–${ord(seg.toStreet)} St` : `W ${ord(seg.street)} St ${seg.fromAve}–${seg.toAve} Ave`;

// ── Stations ────────────────────────────────────────────────────────────────
export type Station = { id: string; name: string; lines: string; a: number; s: number };
export const STATIONS: Station[] = [
  { id: "penn7", name: "34 St–Penn (7th Ave side)", lines: "1 2 3 · LIRR", a: 3, s: 33 },
  { id: "penn8", name: "34 St–Penn (8th Ave side)", lines: "A C E · NJ Transit", a: 2, s: 33 },
  { id: "herald", name: "34 St–Herald Sq", lines: "B D F M N Q R W", a: 4, s: 34 },
  { id: "path33", name: "PATH 33 St", lines: "PATH to NJ", a: 4, s: 33 },
  { id: "times", name: "Times Sq–42 St", lines: "1 2 3 7 N Q R W S", a: 3, s: 42 },
  { id: "pabt", name: "Port Authority", lines: "A C E · NJ buses", a: 2, s: 42 },
  { id: "bryant", name: "42 St–Bryant Park", lines: "B D F M 7", a: 4, s: 42 },
  { id: "st28", name: "28 St", lines: "1", a: 3, s: 28 },
  { id: "st23ce", name: "23 St", lines: "C E", a: 2, s: 23 },
  { id: "st23fm", name: "23 St", lines: "F M", a: 4, s: 23 },
];
export const STATION_IDS = STATIONS.map((s) => s.id);

export const HOMES: Record<string, { label: string; stations: string[] }> = {
  brooklyn: { label: "Park Slope, Brooklyn", stations: ["penn7", "penn8", "herald", "st23ce", "st23fm", "bryant", "times"] },
  queens: { label: "Jackson Heights, Queens", stations: ["times", "bryant", "herald", "penn8", "st23ce"] },
  nj: { label: "Hoboken, New Jersey", stations: ["path33", "penn8", "pabt", "st23fm"] },
  uptown: { label: "Washington Heights", stations: ["penn8", "pabt", "st23ce", "penn7", "times", "st28"] },
};

export const ORIGINS: Record<string, { label: string; a: number; s: number }> = {
  msg8: { label: "MSG exit · 8th Ave & 31st", a: 2, s: 31 },
  bar: { label: "Watch party · 9th Ave & 39th", a: 1, s: 39 },
  office: { label: "Office · 5th Ave & 28th", a: 5, s: 28 },
};

// ── Feed ────────────────────────────────────────────────────────────────────
export type Source = "official" | "social" | "311";
export type Kind = "road_closed" | "crowd" | "station_closed" | "station_crowded" | "reopened" | "hazard" | "info";
export type KReport = {
  id: string;
  source: Source;
  author: string;
  minutesAgo: number;
  text: string;
  /** Pre-geocoded for the demo; live reports get these from the LLM. */
  segments?: Segment[];
  stations?: string[];
};

export const briefing =
  "The Knicks just won the NBA championship at Madison Square Garden at 11:12 PM. Tens of thousands of fans are pouring into Midtown streets around MSG, Penn Station and Times Square. NYPD has set a frozen zone around the Garden.";

export const feed: KReport[] = [
  { id: "k1", source: "official", author: "@NYPDnews", minutesAgo: 34, text: "Frozen zone in effect around Madison Square Garden. 7th Ave CLOSED from W 30th to W 35th St. W 33rd St closed between 6th and 8th Ave. Expect pedestrian holds.", segments: [{ avenue: "7th", fromStreet: 30, toStreet: 35 }, { street: 33, fromAve: "6th", toAve: "8th" }] },
  { id: "k2", source: "social", author: "@orangeandblue_til_i_die", minutesAgo: 32, text: "34th between 7th and 6th is a SEA of orange and blue 🧡💙 can't move at all, people on top of the bus shelters", segments: [{ street: 34, fromAve: "7th", toAve: "6th" }] },
  { id: "k3", source: "official", author: "@NYCTSubway", minutesAgo: 30, text: "Due to crowd conditions, 34 St–Penn Station 7th Ave entrances are closed. 1/2/3 trains are bypassing 34 St–Penn Station in both directions.", stations: ["penn7"] },
  { id: "k4", source: "social", author: "@bxdave", minutesAgo: 28, text: "HERALD SQUARE STATION SHUT DOWN!!! cops everywhere dont even try", stations: ["herald"] },
  { id: "k5", source: "311", author: "311 SR #4471", minutesAgo: 26, text: "Barricades and police cars blocking 8th Ave at 34th St, can't get through, officers sending everyone north", segments: [{ avenue: "8th", fromStreet: 33, toStreet: 35 }] },
  { id: "k6", source: "official", author: "Notify NYC", minutesAgo: 24, text: "Times Square fan celebration: 7th Ave closed from W 42nd St to W 47th St. Avoid the area.", segments: [{ avenue: "7th", fromStreet: 42, toStreet: 45 }] },
  { id: "k7", source: "social", author: "@hk_eats", minutesAgo: 22, text: "La calle 31 entre la 7ma y la 8va está bloqueada, la policía no deja pasar a nadie", segments: [{ street: 31, fromAve: "7th", toAve: "8th" }] },
  { id: "k8", source: "social", author: "@jersey_jenna", minutesAgo: 20, text: "8th ave at 34th totally blocked by NYPD barriers, had to walk all the way up to 36th to get around", segments: [{ avenue: "8th", fromStreet: 33, toStreet: 35 }] },
  { id: "k9", source: "social", author: "@midtown_insider", minutesAgo: 18, text: "I heard they're closing ALL of midtown and shutting the whole subway until 3am 😳" },
  { id: "k10", source: "official", author: "@NYCTSubway", minutesAgo: 16, text: "34 St–Herald Sq station is OPEN. B/D/F/M/N/Q/R/W trains are running with residual delays.", stations: ["herald"] },
  { id: "k11", source: "official", author: "@NYCTSubway", minutesAgo: 14, text: "34 St–Penn Station A/C/E: entry is being metered due to crowding. Expect waits of 20+ minutes to enter.", stations: ["penn8"] },
  { id: "k12", source: "311", author: "311 SR #4502", minutesAgo: 13, text: "Is the PATH at 33rd street running? I need to get back to Hoboken tonight" },
  { id: "k13", source: "social", author: "@timessq_cam", minutesAgo: 11, text: "Times Sq 42nd st station entrances packed, cops letting people in in groups, 20+ min wait", stations: ["times"] },
  { id: "k14", source: "social", author: "@nightshift_rn", minutesAgo: 9, text: "fireworks going off on 9th ave around 37th, someone got burned, ambulance can't get through the crowd", segments: [{ avenue: "9th", fromStreet: 36, toStreet: 38 }] },
  { id: "k15", source: "official", author: "@NYPDnews", minutesAgo: 6, text: "UPDATE: 8th Ave has REOPENED to pedestrians between W 33rd and W 35th St. 7th Ave remains closed.", segments: [{ avenue: "8th", fromStreet: 33, toStreet: 35 }] },
  { id: "k16", source: "social", author: "@ny_ricky", minutesAgo: 4, text: "8th ave & 27th someone flipped a car, crowd going nuts, cops pushing everyone back", segments: [{ avenue: "8th", fromStreet: 26, toStreet: 28 }] },
];

// ── Fusion policy ───────────────────────────────────────────────────────────
export type KJudgment = { kind: Kind; kindProbs: Record<string, number>; kindConfidence: number; credible: number; mock: boolean };
export type Judged = { r: KReport; j: KJudgment; segments: Segment[]; stations: string[]; summary?: string };
export type Review = "confirm" | "dismiss" | undefined;

export const OFFICIAL_WEIGHT = 1;
export const PUBLIC_WEIGHT = 0.45; // × Jev credibility
export const CONFIRM_AT = 0.8; // one official source, or two credible independent reports

export const weightOf = (x: Judged, review: Review) =>
  review === "dismiss" ? 0 : review === "confirm" || x.r.source === "official" ? OFFICIAL_WEIGHT : PUBLIC_WEIGHT * x.j.credible;

export const STATUS_COLOR = { closed: "#ef4444", unconfirmed: "#eab308", crowded: "#f97316", open: "#334155" } as const;

type Status = "closed" | "unconfirmed" | "crowded" | "open";
export type EdgeState = { status: Status; weight: number; why: string[]; reports: string[] };
export type StationState = EdgeState & { waitMin: number };

const BLOCKING: Kind[] = ["road_closed", "hazard"];

function fuse(items: { x: Judged; w: number }[]): EdgeState {
  // Oldest first; an official "reopened" wipes earlier evidence.
  const sorted = [...items].sort((p, q) => q.x.r.minutesAgo - p.x.r.minutesAgo);
  let block = 0, crowd = 0, why: string[] = [], reports: string[] = [];
  for (const { x, w } of sorted) {
    if (w < 0.1) continue; // rumors (credibility < ~20%) never touch the map
    const k = x.j.kind;
    if (k === "reopened" && w >= CONFIRM_AT) {
      block = 0; crowd = 0; why = [`reopened per ${x.r.author} (${x.r.minutesAgo}m ago)`]; reports = [x.r.id];
      continue;
    }
    if (BLOCKING.includes(k) || k === "station_closed") block += w;
    else if (k === "crowd" || k === "station_crowded") crowd += w;
    else continue;
    why.push(`${x.r.author} · ${x.r.source} · weight ${w.toFixed(2)}`);
    reports.push(x.r.id);
  }
  const status: Status = block >= CONFIRM_AT ? "closed" : block > 0 ? "unconfirmed" : crowd > 0 ? "crowded" : "open";
  return { status, weight: Math.max(block, crowd), why, reports };
}

export function buildState(judged: Judged[], reviews: Record<string, Review>) {
  const perEdge = new Map<string, { x: Judged; w: number }[]>();
  const perStation = new Map<string, { x: Judged; w: number }[]>();
  for (const x of judged) {
    const w = weightOf(x, reviews[x.r.id]);
    for (const seg of x.segments) for (const k of segmentEdges(seg)) (perEdge.get(k) ?? perEdge.set(k, []).get(k)!).push({ x, w });
    for (const s of x.stations) (perStation.get(s) ?? perStation.set(s, []).get(s)!).push({ x, w });
  }
  const edges: Record<string, EdgeState> = {};
  for (const [k, v] of perEdge) edges[k] = fuse(v);
  const stations: Record<string, StationState> = {};
  for (const [k, v] of perStation) {
    const st = fuse(v);
    stations[k] = { ...st, waitMin: st.status === "crowded" ? 20 : st.status === "unconfirmed" ? 15 : 0 };
  }
  // Reports that still decide a route but lack confirmation → a human looks at them.
  const needsReview = judged.filter(
    (x) => x.r.source !== "official" && !reviews[x.r.id] && x.j.kind !== "info" &&
      ([...x.segments.flatMap(segmentEdges).map((k) => edges[k]), ...x.stations.map((s) => stations[s])].some((e) => e?.status === "unconfirmed" && e.reports.includes(x.r.id))),
  );
  return { edges, stations, needsReview };
}

// ── Routing ─────────────────────────────────────────────────────────────────
const FACTOR: Record<Status, number> = { open: 1, crowded: 3, unconfirmed: 2.5, closed: Infinity };
const ADJ = (() => {
  const m = new Map<string, Edge[]>();
  for (const e of EDGES) {
    (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e);
    (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e);
  }
  return m;
})();

export function dijkstra(from: string, cost: (e: Edge) => number) {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, Edge>();
  const done = new Set<string>();
  while (true) {
    let u: string | null = null, best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (!u) break;
    done.add(u);
    for (const e of ADJ.get(u) ?? []) {
      const c = cost(e);
      if (!isFinite(c)) continue;
      const v = e.a === u ? e.b : e.a;
      if (best + c < (dist.get(v) ?? Infinity)) { dist.set(v, best + c); prev.set(v, e); }
    }
  }
  return { dist, prev };
}

export function walkBack(prev: Map<string, Edge>, from: string, to: string) {
  const out: Edge[] = [];
  let cur = to;
  while (cur !== from) {
    const e = prev.get(cur);
    if (!e) return null;
    out.unshift(e);
    cur = e.a === cur ? e.b : e.a;
  }
  return out;
}

export type Plan = {
  station: Station;
  edges: Edge[];
  path: [number, number][];
  walkMin: number;
  waitMin: number;
  totalMin: number;
  avoided: string[];
  rejected: { station: Station; reason: string }[];
};

/** Best station for this home: walking cost with closure/crowd penalties + station wait. Closed stations are skipped. */
export function planRoute(originKey: string, homeKey: string, state: ReturnType<typeof buildState> | null): Plan | null {
  const o = ORIGINS[originKey];
  const from = nodeId(o.a, o.s);
  const st = (e: Edge) => state?.edges[e.key]?.status ?? "open";
  const { dist, prev } = dijkstra(from, (e) => e.minutes * FACTOR[st(e)]);
  const rejected: Plan["rejected"] = [];
  let best: Plan | null = null;
  for (const id of HOMES[homeKey].stations) {
    const station = STATIONS.find((s) => s.id === id)!;
    const ss = state?.stations[id];
    if (ss?.status === "closed") { rejected.push({ station, reason: `closed — ${ss.why.at(-1)}` }); continue; }
    const d = dist.get(nodeId(station.a, station.s));
    if (d === undefined) { rejected.push({ station, reason: "no open walking path" }); continue; }
    const edges = walkBack(prev, from, nodeId(station.a, station.s))!;
    const walkMin = edges.reduce((t, e) => t + e.minutes, 0);
    const waitMin = ss?.waitMin ?? 0;
    const totalMin = d + waitMin;
    if (waitMin) rejected.push({ station, reason: `${ss!.status} (+${waitMin} min) — ${ss!.why.at(-1)}` });
    if (!best || totalMin < best.totalMin) {
      const path: [number, number][] = [];
      let cur = from;
      path.push(coord(o.a, o.s));
      for (const e of edges) {
        const nxt = e.a === cur ? e.b : e.a;
        const [a, s] = nxt.split(":").map(Number);
        path.push(coord(a, s));
        cur = nxt;
      }
      best = { station, edges, path, walkMin, waitMin, totalMin, avoided: [], rejected };
    }
  }
  if (best) {
    best.rejected = rejected.filter((r) => r.station.id !== best!.station.id);
    best.avoided = [...new Set(Object.entries(state?.edges ?? {}).filter(([, v]) => v.status !== "open").map(([k]) => k))];
  }
  return best;
}

/** Plain-language steps from the edge list (group consecutive edges on the same road). */
export function steps(plan: Plan, originKey: string): string[] {
  const out: string[] = [];
  const o = ORIGINS[originKey];
  let cur = nodeId(o.a, o.s);
  let road = "", blocks = 0, at = "";
  const flush = () => { if (road) out.push(`${road} ${blocks} block${blocks > 1 ? "s" : ""} to ${at}`); };
  for (const e of plan.edges) {
    const nxt = e.a === cur ? e.b : e.a;
    const [a, s] = nxt.split(":").map(Number);
    const r = e.key.startsWith("A") ? `${AVES[a]} Ave` : `W ${ord(s)} St`;
    if (r !== road) { flush(); road = r; blocks = 0; }
    blocks++;
    at = `${AVES[a]} Ave & ${ord(s)}`;
    cur = nxt;
  }
  flush();
  return out;
}

// ── Mobile app: places to wait it out, geometry helpers for real-street routing ──
export type Poi = { id: string; name: string; emoji: string; why: string; lat: number; lng: number };
export const POIS: Poi[] = [
  { id: "moynihan", name: "Moynihan Train Hall", emoji: "🚆", why: "Indoor, seating; LIRR + NJ Transit board here, away from the 7th Ave crowd", lat: 40.7506, lng: -73.9953 },
  { id: "skylight", name: "Skylight Diner", emoji: "🍳", why: "Open 24h, 9th Ave side, outside the frozen zone", lat: 40.7536, lng: -73.9966 },
  { id: "ticktock", name: "Tick Tock Diner", emoji: "🍳", why: "Open 24h, right by Penn", lat: 40.7525, lng: -73.9935 },
  { id: "ktown", name: "Koreatown (W 32nd St)", emoji: "🍜", why: "24h restaurants, a block from Herald Sq", lat: 40.7477, lng: -73.9867 },
  { id: "bryant", name: "Bryant Park", emoji: "🌳", why: "Open space to regroup, B/D/F/M/7 underneath", lat: 40.7536, lng: -73.9832 },
  { id: "madsq", name: "Madison Square Park", emoji: "🌳", why: "Quiet, open, near the F/M/N/R/W at 23rd", lat: 40.742, lng: -73.9877 },
  { id: "hy", name: "Hudson Yards Public Square", emoji: "🏙️", why: "Wide plaza, the 7 train, far from MSG", lat: 40.7539, lng: -74.0021 },
  { id: "gct", name: "Grand Central Terminal", emoji: "🚉", why: "Indoor, Metro-North, LIRR (Grand Central Madison), 4/5/6/7", lat: 40.7527, lng: -73.9772 },
  { id: "usq", name: "Union Square", emoji: "🌳", why: "Open plaza, 8 subway lines", lat: 40.7359, lng: -73.9906 },
];

export type LatLng = { lat: number; lng: number };
const M_LAT = 111_000, M_LNG = 84_000;
export const dist = (p: LatLng, q: LatLng) => Math.hypot((q.lat - p.lat) * M_LAT, (q.lng - p.lng) * M_LNG);

function distToSeg(p: LatLng, a: [number, number], b: [number, number]) {
  const ax = (a[1] - p.lng) * M_LNG, ay = (a[0] - p.lat) * M_LAT, bx = (b[1] - p.lng) * M_LNG, by = (b[0] - p.lat) * M_LAT;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
export const nearEdge = (p: LatLng, key: string, m: number) => {
  const e = EDGES.find((x) => x.key === key);
  return !!e && distToSeg(p, e.path[0], e.path[1]) < m;
};

/** Rectangle around a grid block, as a Valhalla exclude polygon ([lng, lat] ring). */
export function edgePolygon(key: string, bufferM: number): [number, number][] | null {
  const e = EDGES.find((x) => x.key === key);
  if (!e) return null;
  const [[la1, ln1], [la2, ln2]] = e.path;
  const dx = (ln2 - ln1) * M_LNG, dy = (la2 - la1) * M_LAT, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L; // along
  const px = -uy, py = ux; // across
  const pt = (lat: number, lng: number, s: number, t: number): [number, number] => [lng + (s * ux + t * px) / M_LNG, lat + (s * uy + t * py) / M_LAT];
  const b = bufferM;
  return [pt(la1, ln1, -b, -b), pt(la2, ln2, b, -b), pt(la2, ln2, b, b), pt(la1, ln1, -b, b), pt(la1, ln1, -b, -b)];
}
