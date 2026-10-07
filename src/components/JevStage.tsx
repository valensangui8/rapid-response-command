"use client";
import { useEffect, useState } from "react";
import { scenario } from "@/lib/scenario";
import type { TriagedReport } from "@/lib/types";
import { priorityColor } from "@/lib/ui";

export type StageItem = {
  key: string;
  triaged: TriagedReport;
  incidentId: string | null;
  priority: number | null;
  resource: string | null;
};

const SEV = ["Info", "Menor", "Moderado", "Serio", "Crítico"];
const TIMING = { read: 900, decide: 1700, verdict: 1300 }; // ms per phase
type Phase = "idle" | "read" | "decide" | "verdict";
type Mood = "calm" | "concerned" | "alarm" | "skeptical";

/** Plays judged reports one at a time so the audience can watch Jev decide. */
export default function JevStage({ queue, onConsumed, live }: { queue: StageItem[]; onConsumed: () => void; live: boolean }) {
  const [current, setCurrent] = useState<StageItem | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  // Pull the next item when idle.
  useEffect(() => {
    if (phase !== "idle" || !queue.length) return;
    setCurrent(queue[0]);
    onConsumed();
    setPhase("read");
  }, [phase, queue, onConsumed]);

  // Phase timeline (faster when there's a backlog).
  useEffect(() => {
    if (phase === "idle") return;
    const speed = queue.length > 3 ? 0.5 : 1;
    const t = setTimeout(
      () => setPhase(phase === "read" ? "decide" : phase === "decide" ? "verdict" : "idle"),
      TIMING[phase] * speed,
    );
    return () => clearTimeout(t);
  }, [phase, queue.length]);

  const j = current?.triaged.judgment;
  const mood: Mood = !j || phase === "read"
    ? "calm"
    : j.credible < 0.4
      ? "skeptical"
      : j.lifeThreat > 0.6 || j.severity >= 3.2
        ? "alarm"
        : j.severity >= 1.8
          ? "concerned"
          : "calm";
  const done = phase === "verdict" || (phase === "idle" && !!current); // keep last verdict on screen while waiting
  const show = phase === "decide" || done;
  const cats = j ? Object.entries(j.categoryProbs).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold">Jev en vivo · decisiones con probabilidad</span>
        <span className="text-slate-500">
          {live ? "TypeSafe System One" : "modo simulado"} {queue.length > 0 && `· ${queue.length} en espera`}
        </span>
      </div>

      <div className="flex gap-4">
        {/* Character + speech bubble */}
        <div className="flex w-40 shrink-0 flex-col items-center">
          <JevFace mood={mood} thinking={phase === "read"} idle={phase === "idle"} />
          <div className="mt-1 text-center text-[11px] text-slate-400">
            {phase === "idle" && !current && "Esperando reportes…"}
            {phase === "read" && "Leyendo…"}
            {phase === "decide" && "Decidiendo…"}
            {done && moodLine(mood)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div key={current.key} className="jev-pop mb-2 rounded-lg bg-slate-800/80 p-2 text-xs text-slate-200">
                <span className="mr-1 rounded bg-slate-700 px-1 text-[10px] uppercase">{current.triaged.report.source}</span>
                {current.triaged.extraction.language !== "English" && current.triaged.extraction.language !== "unknown" && (
                  <span className="mr-1 rounded bg-sky-900 px-1 text-[10px] text-sky-200">{current.triaged.extraction.language}</span>
                )}
                “{current.triaged.report.text}”
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <Question label="¿Qué tipo de emergencia?" delay={0} show={show}>
                  {cats.map(([k, v], i) => (
                    <Meter key={k} label={k} value={v} show={show} delay={i * 120} strong={i === 0} />
                  ))}
                </Question>
                <div className="space-y-2">
                  <Question label="Gravedad" delay={250} show={show}>
                    <SeverityGauge value={j!.severity} show={show} />
                  </Question>
                  <Question label="¿Duplicado?" delay={450} show={show}>
                    <span className={j!.duplicateOf ? "text-violet-300" : "text-slate-400"}>
                      {j!.duplicateOf ? `Sí → se une a ${j!.duplicateOf}` : "No, incidente nuevo"}
                    </span>
                  </Question>
                </div>
                <YesNo label="¿Riesgo de vida?" p={j!.lifeThreat} show={show} delay={350} />
                <YesNo label="¿Persona vulnerable?" p={j!.vulnerable} show={show} delay={450} />
                <YesNo label="¿Es creíble (no rumor)?" p={j!.credible} show={show} delay={550} />

                <div className={`flex items-center transition-all duration-500 ${done ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}>
                  {current.priority !== null && (
                    <div className="jev-stamp rounded-lg border-2 px-3 py-1.5 text-center" style={{ borderColor: priorityColor(current.priority) }}>
                      <div className="text-lg font-black" style={{ color: priorityColor(current.priority) }}>P{current.priority}</div>
                      <div className="text-[10px] text-slate-300">
                        {current.resource ? `→ ${current.resource}` : scenario.routing[j!.category] ? "sin unidad libre" : "solo comunicación"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-slate-500">
              Dale ▶ para ver cómo Jev evalúa cada reporte
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function moodLine(m: Mood) {
  return { calm: "Tranqui, baja prioridad", concerned: "Hay que atender esto", alarm: "¡Vidas en riesgo!", skeptical: "Mmm… huele a rumor" }[m];
}

function Question({ label, children, show, delay }: { label: string; children: React.ReactNode; show: boolean; delay: number }) {
  return (
    <div className={`transition-all duration-500 ${show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="mb-0.5 text-slate-400">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Meter({ label, value, show, delay, strong }: { label: string; value: number; show: boolean; delay: number; strong?: boolean }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className={strong ? "font-semibold text-white" : "text-slate-400"}>{label}</span>
        <span className="tabular-nums text-slate-400">{show ? Math.round(value * 100) : 0}%</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800">
        <div
          className={`h-1.5 rounded transition-all duration-700 ease-out ${strong ? "bg-sky-400" : "bg-slate-600"}`}
          style={{ width: show ? `${value * 100}%` : "0%", transitionDelay: `${delay + 200}ms` }}
        />
      </div>
    </div>
  );
}

function YesNo({ label, p, show, delay }: { label: string; p: number; show: boolean; delay: number }) {
  const yes = p >= 0.5;
  const color = label.includes("creíble") ? (yes ? "bg-emerald-500" : "bg-amber-500") : yes ? "bg-red-500" : "bg-emerald-600";
  return (
    <Question label={label} show={show} delay={delay}>
      <div className="flex items-center gap-2">
        <div className="relative h-2 flex-1 rounded bg-slate-800">
          <div className={`h-2 rounded transition-all duration-700 ease-out ${color}`} style={{ width: show ? `${p * 100}%` : "0%", transitionDelay: `${delay + 200}ms` }} />
          <div className="absolute top-[-2px] h-3 w-px bg-slate-500" style={{ left: "50%" }} />
        </div>
        <span className={`w-14 text-right font-semibold tabular-nums ${yes ? "text-white" : "text-slate-400"}`}>
          {yes ? "SÍ" : "NO"} {show ? Math.round(p * 100) : 0}%
        </span>
      </div>
    </Question>
  );
}

function SeverityGauge({ value, show }: { value: number; show: boolean }) {
  const pct = (value / 4) * 100;
  return (
    <div>
      <div className="relative h-2 rounded bg-gradient-to-r from-slate-600 via-amber-500 to-red-500">
        <div
          className="absolute -top-1 h-4 w-1.5 rounded bg-white shadow transition-all duration-1000 ease-out"
          style={{ left: show ? `calc(${pct}% - 3px)` : "0%", transitionDelay: "400ms" }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>Info</span>
        <span className="font-semibold text-white">{show ? `${SEV[Math.round(value)]} (${value.toFixed(1)})` : "…"}</span>
        <span>Crítico</span>
      </div>
    </div>
  );
}

/** Jev: a friendly round bot. Eyes scan while reading; face reacts to the verdict. */
export function JevFace({ mood, thinking, idle }: { mood: Mood; thinking: boolean; idle: boolean }) {
  const color = { calm: "#38bdf8", concerned: "#f59e0b", alarm: "#ef4444", skeptical: "#a78bfa" }[mood];
  const mouth = {
    calm: "M38 66 Q50 74 62 66",
    concerned: "M38 69 L62 69",
    alarm: "M40 70 Q50 60 60 70 Q50 76 40 70",
    skeptical: "M38 70 Q46 66 62 66",
  }[mood];
  return (
    <svg viewBox="0 0 100 100" className={`h-28 w-28 ${idle ? "jev-bob" : ""} ${mood === "alarm" && !thinking ? "jev-shake" : ""}`}>
      {/* antenna */}
      <line x1="50" y1="14" x2="50" y2="4" stroke="#475569" strokeWidth="2" />
      <circle cx="50" cy="4" r="3.5" fill={color} className={thinking ? "jev-blink-fast" : ""} />
      {/* glow */}
      <circle cx="50" cy="52" r="40" fill={color} opacity="0.12" className="transition-colors duration-500" />
      {/* head */}
      <rect x="14" y="16" width="72" height="66" rx="30" fill="#1e293b" stroke={color} strokeWidth="2.5" className="transition-colors duration-500" />
      {/* visor */}
      <rect x="22" y="30" width="56" height="26" rx="13" fill="#0f172a" />
      {/* eyes */}
      <g className={thinking ? "jev-scan" : ""}>
        <g className="jev-eyeblink">
          <circle cx="38" cy="43" r={mood === "alarm" ? 7 : 6} fill={color} className="transition-all duration-300" />
          <circle cx="62" cy="43" r={mood === "alarm" ? 7 : 6} fill={color} className="transition-all duration-300" />
        </g>
        <circle cx="40" cy="41" r="2" fill="white" opacity="0.8" />
        <circle cx="64" cy="41" r="2" fill="white" opacity="0.8" />
      </g>
      {/* skeptical brow */}
      {mood === "skeptical" && <line x1="54" y1="31" x2="70" y2="27" stroke={color} strokeWidth="2.5" strokeLinecap="round" />}
      {/* mouth */}
      <path d={thinking ? "M42 68 L58 68" : mouth} stroke={color} strokeWidth="3" fill={mood === "alarm" && !thinking ? color : "none"} strokeLinecap="round" className="transition-all duration-300" />
      {/* thinking dots */}
      {thinking && (
        <g fill="#94a3b8">
          <circle cx="80" cy="14" r="2.5" className="jev-dot" style={{ animationDelay: "0ms" }} />
          <circle cx="88" cy="9" r="3" className="jev-dot" style={{ animationDelay: "150ms" }} />
          <circle cx="96" cy="3" r="3.5" className="jev-dot" style={{ animationDelay: "300ms" }} />
        </g>
      )}
    </svg>
  );
}
