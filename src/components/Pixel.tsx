"use client";
import { useEffect, useState } from "react";
import { restaurant, type Booking } from "@/lib/resy";
import { fmt } from "@/lib/resyBook";

export type Mood = "calm" | "concerned" | "alarm" | "skeptical";

/* ───────────── Pixel Jev: 16×16 sprite drawn cell by cell ───────────── */
export function PixelJev({ mood, thinking, size = 112 }: { mood: Mood; thinking: boolean; size?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), thinking ? 180 : 400);
    return () => clearInterval(t);
  }, [thinking]);

  const cells: [number, number, string][] = []; // x, y, color
  const px = (x: number, y: number, c = "#000") => cells.push([x, y, c]);
  // antenna (tip blinks while thinking)
  px(7, 2); px(8, 2); px(7, 1); px(8, 1);
  if (!thinking || frame % 2) { px(6, 0); px(7, 0); px(8, 0); px(9, 0); }
  // head outline with rounded corners
  for (let x = 4; x <= 11; x++) { px(x, 3); px(x, 12); }
  px(3, 4); px(12, 4); px(3, 11); px(12, 11);
  for (let y = 5; y <= 10; y++) { px(2, y); px(13, y); }
  // ears
  px(1, 7); px(1, 8); px(14, 7); px(14, 8);
  // eyes
  const blink = !thinking && frame % 9 === 0;
  const dx = thinking ? [0, 1, 0, -1][frame % 4] : 0;
  const eye = (cx: number) => {
    if (blink) { px(cx + dx, 7); px(cx + 1 + dx, 7); return; }
    if (mood === "alarm") { for (let y = 5; y <= 7; y++) for (let x = cx - 1; x <= cx + 1; x++) px(x + dx, y); return; }
    px(cx + dx, 6); px(cx + 1 + dx, 6);
    if (!(mood === "skeptical" && cx > 8)) { px(cx + dx, 7); px(cx + 1 + dx, 7); }
  };
  eye(5); eye(9);
  if (mood === "skeptical") { px(9, 4); px(10, 4); px(11, 5); }
  if (mood === "concerned") { px(4, 5); px(5, 4); px(10, 4); px(11, 5); }
  // mouth
  if (thinking) { for (let x = 6; x <= 9; x++) if ((x + frame) % 2) px(x, 10); }
  else if (mood === "calm") { px(5, 9); px(10, 9); for (let x = 6; x <= 9; x++) px(x, 10); }
  else if (mood === "concerned") { for (let x = 6; x <= 9; x++) px(x, 10); }
  else if (mood === "alarm") { for (let x = 6; x <= 9; x++) { px(x, 9); px(x, 11); } px(6, 10); px(9, 10); }
  else { px(6, 10); px(7, 10); px(8, 9); px(9, 9); }
  // body + feet (bob when idle)
  for (let x = 5; x <= 10; x++) px(x, 13);
  px(5, 14); px(10, 14); px(4, 15); px(5, 15); px(10, 15); px(11, 15);

  const bob = !thinking && frame % 2 ? 0.5 : 0;
  return (
    <svg viewBox="0 -1 16 17" width={size} height={size} shapeRendering="crispEdges" className={mood === "alarm" && !thinking ? "jev-shake" : ""}>
      <g transform={`translate(0 ${bob})`}>
        {cells.map(([x, y, c], i) => (
          <rect key={i} x={x} y={y} width={1} height={1} fill={c} />
        ))}
      </g>
    </svg>
  );
}

/* ───────────── Pixel floor plan: tables + chairs fill up live ───────────── */
const LAYOUT: Record<string, [number, number]> = {
  T1: [0, 0], T2: [1, 0], T3: [2, 0], T4: [3, 0],
  T5: [0, 1], T6: [1, 1], T7: [2, 1], T8: [3, 1],
  T9: [0, 2], T10: [2, 2],
};
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function TableSprite({ seats, guests, state }: { seats: number; guests: number; state: Booking["status"] | "free" }) {
  const w = seats <= 2 ? 2 : seats / 2 + 1; // table width in cells
  const top = seats <= 2 ? 0 : seats / 2;
  const W = seats <= 2 ? w + 4 : w + 2;
  const H = seats <= 2 ? 4 : 6;
  const tx = seats <= 2 ? 2 : 1;
  const ty = seats <= 2 ? 1 : 2;
  const chairs: [number, number][] = [];
  if (seats <= 2) chairs.push([0, 1], [W - 1, 1]);
  else for (let i = 0; i < top; i++) chairs.push([tx + i + (w - top) / 2, 0], [tx + i + (w - top) / 2, H - 1]);
  const fillTable = state === "verified" ? "#000" : state === "unverified" ? "url(#check)" : state === "requested" ? "url(#hatch)" : "#fff";
  return (
    <svg viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`} width={(W + 1) * 9} height={(H + 1) * 9} shapeRendering="crispEdges">
      <defs>
        <pattern id="check" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="0.5" height="0.5" fill="#000" /><rect x="0.5" y="0.5" width="0.5" height="0.5" fill="#000" />
        </pattern>
        <pattern id="hatch" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="0.34" fill="#000" />
        </pattern>
      </defs>
      <rect x={tx} y={ty} width={w} height={seats <= 2 ? 2 : 2} fill={fillTable} stroke="#000" strokeWidth={0.25} />
      {chairs.slice(0, seats).map(([x, y], i) => (
        <rect key={i} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} fill={i < guests ? "#000" : "#fff"} stroke="#000" strokeWidth={0.2} className={i < guests ? "chair-pop" : ""} style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </svg>
  );
}

export function PixelFloor({ book }: { book: Booking[] }) {
  const [time, setTime] = useState("19:00");
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setTime((cur) => {
        const i = restaurant.slots.indexOf(cur);
        return restaurant.slots[(i + 1) % restaurant.slots.length];
      });
    }, 1100);
    return () => clearInterval(t);
  }, [playing]);

  const at = toMin(time);
  const seated = (tableId: string) =>
    book.find((b) => b.table === tableId && b.status !== "cancelled" && b.status !== "waitlist" && toMin(b.time) <= at && at < toMin(b.time) + restaurant.turnMinutes);
  const tonight = (tableId: string) => book.filter((b) => b.table === tableId && b.status !== "cancelled" && b.status !== "waitlist").length;
  const covers = restaurant.tables.reduce((s, t) => s + (seated(t.id)?.partySize ?? 0), 0);
  const seats = restaurant.tables.reduce((s, t) => s + t.seats, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
        <button onClick={() => setPlaying(!playing)} className="rounded bg-slate-700 px-2 py-0.5 font-semibold">{playing ? "■ pause" : "▶ play service"}</button>
        {restaurant.slots.map((s) => (
          <button key={s} onClick={() => (setPlaying(false), setTime(s))} className={`px-1.5 py-0.5 ${s === time ? "bg-sky-600 font-bold" : "bg-slate-800"}`}>
            {fmt(s).replace(":00", "").replace(" PM", "")}
          </button>
        ))}
        <span className="ml-auto font-semibold">{fmt(time)} · {covers}/{seats} seats</span>
      </div>
      <div className="mb-1 h-2 w-full border border-slate-700">
        <div className="h-full bg-sky-600 transition-all duration-700" style={{ width: `${(covers / seats) * 100}%` }} />
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3 pt-2">
        {restaurant.tables.map((t) => {
          const b = seated(t.id);
          const [col, row] = LAYOUT[t.id];
          return (
            <div key={`${t.id}-${b?.id ?? "free"}`} className="jev-pop flex flex-col items-center" style={{ gridColumn: `${col + 1} / span ${t.seats >= 6 ? 2 : 1}`, gridRow: row + 1 }}>
              <TableSprite seats={t.seats} guests={b?.partySize ?? 0} state={b?.status ?? "free"} />
              <div className="text-center text-[11px] leading-tight">
                <b>{t.id}</b> {b ? `· ${b.paid ? "💳" : ""}${b.vip ? "★" : ""}${b.dessert ? "🍰" : ""}${b.perk === "granted" ? "🎁" : ""}${b.name.split(" ")[0]} ${b.partySize}` : <span className="text-slate-500">free</span>}
                <div className="text-slate-500">{tonight(t.id)} booking{tonight(t.id) === 1 ? "" : "s"} tonight</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
