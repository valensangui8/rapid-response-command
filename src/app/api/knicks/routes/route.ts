import { dist, edgePolygon, nearEdge, POIS, type LatLng, type Poi } from "@/lib/knicks";

/**
 * 3 walking routes on real streets (Valhalla, OSM):
 *  fast  — excludes confirmed closures
 *  calm  — also excludes crowds, hazards and unconfirmed reports
 *  stop  — calm route through a place to wait out the crowd (relieves the hot spots)
 */
const VALHALLA = "https://valhalla1.openstreetmap.de/route";
const cache = new Map<string, unknown>();

export type Step = { text: string; m: number; at: number };
export type RouteOut = { id: "fast" | "calm" | "stop"; label: string; shape: [number, number][]; walkMin: number; delayMin: number; waitMin: number; km: number; steps: Step[]; notes: string[]; poi?: Poi; fallback?: boolean };

function decode(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}

async function valhalla(points: LatLng[], polys: [number, number][][]) {
  const body = JSON.stringify({
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing: "pedestrian",
    exclude_polygons: polys,
    language: "en-US",
    units: "km",
  });
  if (cache.has(body)) return cache.get(body) as Awaited<ReturnType<typeof run>>;
  const run = async () => {
    const r = await fetch(VALHALLA, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`valhalla ${r.status}: ${(await r.text()).slice(0, 120)}`);
    const d = await r.json();
    const shape: [number, number][] = [];
    const steps: Step[] = [];
    let pending = 0;
    for (const leg of d.trip.legs) {
      const base = shape.length;
      shape.push(...decode(leg.shape));
      for (const m of leg.maneuvers) {
        const named = m.street_names?.length || m.type === 4 || m.type === 5 || m.type === 6;
        if (!named && steps.length) { steps[steps.length - 1].m += m.length * 1000; continue; }
        steps.push({ text: m.instruction.replace(/the walkway|the crosswalk|the sidewalk/gi, "ahead"), m: m.length * 1000 + pending, at: base + m.begin_shape_index });
        pending = 0;
      }
    }
    return { shape, steps, walkMin: d.trip.summary.time / 60, km: d.trip.summary.length };
  };
  const v = await run();
  cache.set(body, v);
  return v;
}

function straight(points: LatLng[]) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += dist(points[i - 1], points[i]) * 1.3;
  return { shape: points.map((p) => [p.lat, p.lng] as [number, number]), steps: [{ text: "Head toward your destination (offline estimate)", m, at: 0 }], walkMin: m / 80, km: m / 1000, fallback: true };
}

export async function POST(req: Request) {
  const { from, to, closed, busy } = (await req.json()) as { from: LatLng; to: LatLng; closed: string[]; busy: { key: string; label: string; penalty: number }[] };
  const keepFree = (poly: [number, number][]) => !poly.some(([lng, lat]) => dist({ lat, lng }, from) < 60 || dist({ lat, lng }, to) < 60);
  const closedPolys = closed.map((k) => edgePolygon(k, 18)).filter((p): p is [number, number][] => !!p && keepFree(p));
  const busyPolys = busy.map((b) => edgePolygon(b.key, 25)).filter((p): p is [number, number][] => !!p && keepFree(p));

  // Place to wait: smallest detour, not next to any hot spot.
  const direct = dist(from, to);
  const poi = POIS.filter((p) => ![...closed, ...busy.map((b) => b.key)].some((k) => nearEdge(p, k, 120)))
    .map((p) => ({ p, detour: dist(from, p) + dist(p, to) - direct }))
    .sort((a, b) => a.detour - b.detour)[0]?.p;

  const get = async (pts: LatLng[], polys: [number, number][][]) => {
    try { return await valhalla(pts, polys); } catch (e) {
      console.error("routing:", (e as Error).message);
      try { return await valhalla(pts, closedPolys); } catch { return straight(pts); }
    }
  };
  const fast = await get([from, to], closedPolys);
  const calm = await get([from, to], [...closedPolys, ...busyPolys]);
  const stop = poi ? await get([from, poi, to], [...closedPolys, ...busyPolys]) : null;

  // Delay = busy blocks the route actually walks through (crowd, hazard, unconfirmed).
  const crossed = (shape: [number, number][]) => busy.filter((b) => shape.some(([lat, lng], i) => i % 2 === 0 && nearEdge({ lat, lng }, b.key, 30)));
  const groupLabels = (bs: typeof busy) => [...new Set(bs.map((b) => b.label))];
  const build = (id: RouteOut["id"], label: string, r: Awaited<ReturnType<typeof get>>, extra: Partial<RouteOut> = {}): RouteOut => {
    const hits = crossed(r.shape);
    const delayMin = Math.min(25, hits.reduce((t, b) => t + b.penalty, 0));
    return { id, label, ...r, delayMin, waitMin: 0, notes: groupLabels(hits).map((l) => `Through ${l}`), ...extra };
  };

  const routes: RouteOut[] = [build("fast", "Fastest", fast)];
  routes.push(build("calm", "Least crowded", calm));
  if (stop && poi) routes.push(build("stop", `Stop at ${poi.name}`, stop, { poi, waitMin: 20 }));
  return Response.json({ routes, closedZones: closedPolys.length, busyZones: busyPolys.length });
}
