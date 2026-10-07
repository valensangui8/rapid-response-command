"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { coord, EDGES, ORIGINS, STATIONS, STATUS_COLOR, type buildState, type Plan } from "@/lib/knicks";

export default function KnicksMap({ state, plan, origin }: { state: ReturnType<typeof buildState>; plan: Plan | null; origin: string }) {
  const o = ORIGINS[origin];
  return (
    <MapContainer center={[40.7505, -73.991]} zoom={15} className="h-full w-full rounded-lg" zoomControl={false}>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
      {EDGES.map((e) => {
        const s = state.edges[e.key];
        if (!s || s.status === "open") return null;
        return (
          <Polyline key={e.key} positions={e.path} pathOptions={{ color: STATUS_COLOR[s.status], weight: 7, opacity: 0.9, dashArray: s.status === "unconfirmed" ? "6 6" : undefined }}>
            <Tooltip>
              <b>{e.label}</b> · {s.status}
              <br />
              {s.why.map((w, i) => <div key={i}>{w}</div>)}
            </Tooltip>
          </Polyline>
        );
      })}
      {plan && <Polyline positions={plan.path} pathOptions={{ color: "#38bdf8", weight: 5, opacity: 0.95 }} />}
      {STATIONS.map((st) => {
        const s = state.stations[st.id];
        const color = s ? STATUS_COLOR[s.status] : "#22c55e";
        return (
          <CircleMarker key={st.id} center={coord(st.a, st.s)} radius={plan?.station.id === st.id ? 10 : 7} pathOptions={{ color: plan?.station.id === st.id ? "#fff" : color, fillColor: color, fillOpacity: 0.9, weight: 2 }}>
            <Tooltip>
              🚇 <b>{st.name}</b> ({st.lines}) · {s?.status ?? "open"}
            </Tooltip>
          </CircleMarker>
        );
      })}
      <CircleMarker center={coord(o.a, o.s)} radius={8} pathOptions={{ color: "#f97316", fillColor: "#1d4ed8", fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="left">You</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
