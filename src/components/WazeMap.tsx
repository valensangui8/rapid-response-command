"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { coord, dist, EDGES, POIS, STATIONS, type buildState, type LatLng } from "@/lib/knicks";
import { carCong, stationLoad, walkCrowd, type Mode, type Option, type Sim } from "@/lib/knicksSim";

const LEVEL = ["#22c55e", "#facc15", "#f97316", "#dc2626"];
const BASE: Record<Mode, string> = { car: "#1a73e8", transit: "#1a73e8", walk: "#1a73e8" };
const icon = (html: string, size: number) => L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const youIcon = icon(`<div style="width:22px;height:22px;border-radius:50%;background:#1a73e8;border:4px solid #fff;box-shadow:0 0 0 10px rgba(26,115,232,.22),0 2px 6px rgba(0,0,0,.4)"></div>`, 22);
const bubble = (txt: string, bg: string) =>
  L.divIcon({ html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:700 11px system-ui;padding:3px 7px;border-radius:12px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${txt}</div>`, className: "", iconSize: [0, 0] });

const SCAN_M = 3400; // radar reach at full reveal

function Camera({ me, focus, follow, booting }: { me: LatLng; focus: [number, number][]; follow: boolean; booting: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (booting) map.setView([me.lat + 0.004, me.lng + 0.004], 14, { animate: false });
  }, [booting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (follow) map.setView([me.lat, me.lng], 17, { animate: true });
  }, [follow, me.lat, me.lng, map]);
  const sig = focus.length ? `${focus[0]}|${focus.at(-1)}` : "";
  useEffect(() => {
    if (follow || focus.length < 2) return;
    map.fitBounds(L.latLngBounds([...focus, [me.lat, me.lng]]), { paddingTopLeft: [20, 150], paddingBottomRight: [60, 300], maxZoom: 16 });
  }, [sig, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function LongPress({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ contextmenu: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function WazeMap({
  me, mode, opts, selected, onSelect, state, sim, follow, onPick, progress, reveal = 1,
}: {
  me: LatLng; mode: Mode; opts: Option[]; selected: string | null; onSelect: (k: string) => void;
  state: ReturnType<typeof buildState>; sim: Sim; follow: boolean; onPick: (p: LatLng) => void; progress: number; reveal?: number;
}) {
  const booting = reveal < 1;
  const R = reveal * SCAN_M;
  const far = (p: [number, number]) => booting && dist(me, { lat: p[0], lng: p[1] }) > R;
  const sel = opts.find((o) => o.key === selected) ?? opts[0];
  const others = opts.filter((o) => o !== sel);
  return (
    <MapContainer center={[me.lat, me.lng]} zoom={15} className="h-full w-full" zoomControl={false} attributionControl={false} preferCanvas>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      <Camera me={me} focus={sel?.path ?? []} follow={follow} booting={booting} />
      {booting && <Circle center={[me.lat, me.lng]} radius={R} pathOptions={{ color: "#06b6d4", weight: 2, dashArray: "6 6", fillColor: "#06b6d4", fillOpacity: 0.06 }} />}
      <LongPress onPick={onPick} />

      {/* Live layer per mode: traffic for cars, sidewalk crowds for walkers */}
      {EDGES.map((e) => {
        const s = state.edges[e.key]?.status;
        const m: [number, number] = [(e.path[0][0] + e.path[1][0]) / 2, (e.path[0][1] + e.path[1][1]) / 2];
        if (far(m)) return null;
        if (booting && R - dist(me, { lat: m[0], lng: m[1] }) < 260) return <Polyline key={e.key} positions={e.path} pathOptions={{ color: "#22d3ee", weight: 5, opacity: 0.9 }} />;
        if (s === "closed") return <Polyline key={e.key} positions={e.path} pathOptions={{ color: "#b91c1c", weight: 6, opacity: 0.8, dashArray: "2 6" }}><Tooltip sticky>⛔ {e.label} closed</Tooltip></Polyline>;
        const v = mode === "car" ? carCong(sim, e.key) : walkCrowd(sim, state, e.key);
        if (booting) return <Polyline key={e.key} positions={e.path} pathOptions={{ color: s === "unconfirmed" ? "#a16207" : LEVEL[v > 0.8 ? 3 : v > 0.5 ? 2 : v > 0.25 ? 1 : 0], weight: 4, opacity: 0.7 }} />;
        if (v < 0.65 && s !== "unconfirmed") return null;
        return <Polyline key={e.key} positions={e.path} pathOptions={{ color: s === "unconfirmed" ? "#a16207" : LEVEL[v > 0.8 ? 3 : 2], weight: 4, opacity: 0.4 }} />;
      })}

      {others.map((o) => (
        <Polyline key={o.key} positions={o.path} eventHandlers={{ click: () => onSelect(o.key) }} pathOptions={{ color: "#64748b", weight: 7, opacity: 0.6 }} />
      ))}
      {sel && (
        <>
          <Polyline positions={sel.path} pathOptions={{ color: "#0b3d91", weight: 13, opacity: 0.9 }} />
          <Polyline positions={sel.path} pathOptions={{ color: BASE[mode], weight: 9 }} />
          {sel.legs.filter((l) => l.level >= 1).map((l) => <Polyline key={l.key} positions={l.path} pathOptions={{ color: LEVEL[l.level], weight: 9, lineCap: "butt" }} />)}
          {progress > 0 && <Polyline positions={sel.path.slice(0, progress + 1)} pathOptions={{ color: "#94a3b8", weight: 9 }} />}
        </>
      )}

      {(mode === "transit" || (booting && reveal > 0.15)) &&
        STATIONS.filter((st) => !far(coord(st.a, st.s))).map((st) => {
          const load = stationLoad(sim, state, st.id);
          const txt = load >= 2 ? "⛔ closed" : `🚇 ${Math.round(Math.min(1, load) * 100)}%`;
          return <Marker key={st.id} position={coord(st.a, st.s)} icon={bubble(txt, load >= 2 ? "#7f1d1d" : load > 0.8 ? "#dc2626" : load > 0.5 ? "#f97316" : "#16a34a")}><Tooltip>{st.name} · {st.lines}</Tooltip></Marker>;
        })}
      {mode !== "transit" && sel?.station === undefined && null}
      {POIS.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: "#9333ea", fillColor: "#fff", fillOpacity: 1, weight: 2 }}>
          <Tooltip>{p.emoji} {p.name}</Tooltip>
        </CircleMarker>
      ))}
      {sel && <Marker position={sel.path.at(-1)!} icon={bubble(sel.mode === "transit" ? `🚇 ${sel.line}` : "🏁", "#111827")} />}
      <Marker position={[me.lat, me.lng]} icon={youIcon} zIndexOffset={1000} />
    </MapContainer>
  );
}
