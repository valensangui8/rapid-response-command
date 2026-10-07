"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Incident, Resource } from "@/lib/types";
import { priorityColor } from "@/lib/ui";


export default function IncidentMap({
  incidents,
  resources,
  selected,
  onSelect,
}: {
  incidents: Incident[];
  resources: Resource[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <MapContainer center={[40.69, -73.99]} zoom={12} className="h-full w-full rounded-lg" zoomControl={false}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri'
      />
      {resources.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={4} pathOptions={{ color: "#38bdf8", fillOpacity: 0.9, weight: 1 }}>
          <Tooltip>{r.name}</Tooltip>
        </CircleMarker>
      ))}
      {incidents
        .filter((i) => i.status !== "dismissed")
        .map((i) => (
          <CircleMarker
            key={i.id}
            center={[i.lat, i.lng]}
            radius={6 + i.priority / 8 + (i.reports.length - 1) * 2}
            eventHandlers={{ click: () => onSelect(i.id) }}
            pathOptions={{
              color: selected === i.id ? "#fff" : priorityColor(i.priority),
              fillColor: priorityColor(i.priority),
              fillOpacity: i.status === "dispatched" ? 0.25 : 0.65,
              weight: selected === i.id ? 3 : 1,
              dashArray: i.needsHuman ? "4 3" : undefined,
            }}
          >
            <Tooltip>
              <b>{i.id}</b> P{i.priority} · {i.category}
              <br />
              {i.summary}
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
