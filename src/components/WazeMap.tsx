"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { coord, EDGES, POIS, STATIONS, STATUS_COLOR, type buildState, type Judged, type LatLng } from "@/lib/knicks";
import type { RouteOut } from "@/app/api/knicks/routes/route";

const ROUTE_COLOR: Record<string, string> = { fast: "#1a73e8", calm: "#16a34a", stop: "#9333ea" };
const icon = (html: string, size = 28) => L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const youIcon = icon(`<div style="width:22px;height:22px;border-radius:50%;background:#1a73e8;border:4px solid #fff;box-shadow:0 0 0 8px rgba(26,115,232,.25),0 2px 6px rgba(0,0,0,.4)"></div>`, 22);
const pin = (e: string, bg: string) => icon(`<div style="font-size:16px;width:30px;height:30px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${e}</div>`, 30);
const HAZ: Record<string, string> = { hazard: "🔥", crowd: "👥", road_closed: "🚧" };

function Camera({ me, to, routes, follow }: { me: LatLng; to: LatLng | null; routes: RouteOut[]; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (follow) map.setView([me.lat, me.lng], 17, { animate: true });
  }, [follow, me.lat, me.lng, map]);
  const sig = routes.map((r) => r.shape.length).join(",");
  useEffect(() => {
    if (follow || !routes.length) return;
    const pts = routes.flatMap((r) => r.shape);
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [20, 90], paddingBottomRight: [20, 300] });
  }, [sig, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!routes.length && to) map.fitBounds(L.latLngBounds([[me.lat, me.lng], [to.lat, to.lng]]), { padding: [60, 60] });
  }, [to?.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function WazeMap({
  me, to, routes, selected, onSelect, state, judged, follow, onMapClick,
}: {
  me: LatLng; to: LatLng | null; routes: RouteOut[]; selected: string; onSelect: (id: string) => void;
  state: ReturnType<typeof buildState>; judged: Judged[]; follow: boolean; onMapClick?: (p: LatLng) => void;
}) {
  const sel = routes.find((r) => r.id === selected);
  const others = routes.filter((r) => r.id !== selected);
  // One pin per hazard/crowd report, at the middle of its first segment.
  const hazards = judged.filter((x) => ["hazard", "crowd"].includes(x.j.kind) && x.j.credible >= 0.4 && x.segments.length);
  return (
    <MapContainer center={[me.lat, me.lng]} zoom={15} className="h-full w-full" zoomControl={false} attributionControl={false}
      ref={(m) => { if (m && onMapClick) { m.off("contextmenu"); m.on("contextmenu", (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })); } }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
      <Camera me={me} to={to} routes={routes} follow={follow} />
      {EDGES.map((e) => {
        const s = state.edges[e.key];
        if (!s || s.status === "open") return null;
        return (
          <Polyline key={e.key} positions={e.path} pathOptions={{ color: STATUS_COLOR[s.status], weight: 9, opacity: 0.55, dashArray: s.status === "unconfirmed" ? "4 8" : undefined, lineCap: "butt" }}>
            <Tooltip sticky>{e.label} · {s.status}</Tooltip>
          </Polyline>
        );
      })}
      {others.map((r) => (
        <Polyline key={r.id} positions={r.shape} eventHandlers={{ click: () => onSelect(r.id) }} pathOptions={{ color: "#94a3b8", weight: 7, opacity: 0.85 }} />
      ))}
      {sel && (
        <>
          <Polyline positions={sel.shape} pathOptions={{ color: "#0b3d91", weight: 12, opacity: 0.9 }} />
          <Polyline positions={sel.shape} pathOptions={{ color: ROUTE_COLOR[sel.id], weight: 8, opacity: 1 }} />
        </>
      )}
      {STATIONS.map((st) => {
        const s = state.stations[st.id];
        if (!s || s.status === "open") return null;
        return (
          <Marker key={st.id} position={coord(st.a, st.s)} icon={pin(s.status === "closed" ? "⛔" : "⏳", s.status === "closed" ? "#ef4444" : "#f59e0b")}>
            <Tooltip>{st.name} · {s.status}</Tooltip>
          </Marker>
        );
      })}
      {hazards.map((x) => {
        const seg = x.segments[0];
        const e = EDGES.find((k) => state.edges[k.key]?.reports.includes(x.r.id) && (("avenue" in seg) ? k.key.startsWith("A") : k.key.startsWith("S")));
        if (!e) return null;
        return (
          <Marker key={x.r.id} position={e.path[0]} icon={pin(HAZ[x.j.kind] ?? "⚠️", x.j.kind === "hazard" ? "#f97316" : "#fbbf24")}>
            <Tooltip>{x.r.text}</Tooltip>
          </Marker>
        );
      })}
      {POIS.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={sel?.poi?.id === p.id ? 0 : 5} pathOptions={{ color: "#9333ea", fillColor: "#fff", fillOpacity: 1, weight: 2 }}>
          <Tooltip>{p.emoji} {p.name}</Tooltip>
        </CircleMarker>
      ))}
      {sel?.poi && <Marker position={[sel.poi.lat, sel.poi.lng]} icon={pin(sel.poi.emoji, "#9333ea")} />}
      {to && <Marker position={[to.lat, to.lng]} icon={pin("🏁", "#111827")} />}
      <Marker position={[me.lat, me.lng]} icon={youIcon} zIndexOffset={1000} />
    </MapContainer>
  );
}
