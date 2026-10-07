"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { addToIncidents, assignResources, resetCounter, WEIGHTS } from "@/lib/incidents";
import { scenario } from "@/lib/scenario";
import type { Incident, RawReport, TriagedReport } from "@/lib/types";
import { priorityColor } from "@/lib/ui";
import JevStage, { type StageItem } from "./JevStage";

const IncidentMap = dynamic(() => import("./IncidentMap"), { ssr: false });
const LANGS = ["English", "Spanish", "Mandarin Chinese", "Russian", "Bengali", "Haitian Creole"];
const SEV = ["Info", "Minor", "Moderate", "Serious", "Critical"];

type FeedItem = { report: RawReport; triaged?: TriagedReport; ms?: number; error?: string };

export default function Dashboard() {
  const [status, setStatus] = useState<{ jev: boolean; llm: boolean; model: string } | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const incRef = useRef<Incident[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [langs, setLangs] = useState<string[]>(["English", "Spanish", "Mandarin Chinese"]);
  const [alerts, setAlerts] = useState<{ language: string; text: string; unsupported: number | null }[]>([]);
  const [sitrep, setSitrep] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [stageQueue, setStageQueue] = useState<StageItem[]>([]);
  const consumeStage = useCallback(() => setStageQueue((q) => q.slice(1)), []);

  const toStage = (t: TriagedReport): StageItem => {
    const inc = incRef.current.find((i) => i.reports.some((r) => r.report.id === t.report.id));
    return { key: `${t.report.id}-${Date.now()}`, triaged: t, incidentId: inc?.id ?? null, priority: inc?.priority ?? null, resource: inc?.assignedResource ?? null };
  };

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus);
  }, []);

  const commit = (next: Incident[]) => {
    incRef.current = assignResources(next);
    setIncidents(incRef.current);
  };

  async function triage(report: RawReport) {
    setFeed((f) => [{ report }, ...f]);
    try {
      const openIncidents = incRef.current.filter((i) => i.status !== "dismissed").map((i) => ({ id: i.id, summary: i.summary, location: i.reports[0].extraction.locationHint }));
      const res = await fetch("/api/triage", { method: "POST", body: JSON.stringify({ report, openIncidents }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as TriagedReport & { ms: number };
      setFeed((f) => f.map((x) => (x.report.id === report.id ? { ...x, triaged: data, ms: data.ms } : x)));
      commit(addToIncidents(incRef.current, data));
      setStageQueue((q) => [...q, toStage(data)]);
    } catch (e) {
      setFeed((f) => f.map((x) => (x.report.id === report.id ? { ...x, error: String(e).slice(0, 120) } : x)));
    }
  }

  async function playFeed() {
    setRunning(true);
    stopRef.current = false;
    const queue = [...scenario.reports].sort((a, b) => b.minutesAgo - a.minutesAgo) as RawReport[];
    // Small worker pool: fast enough for a live demo, still mostly de-duplicates against incidents created so far.
    const CONCURRENCY = 3;
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < queue.length && !stopRef.current) {
          const r = queue[next++];
          await triage({ ...r, id: `${r.id}-${Date.now()}` });
        }
      }),
    );
    setRunning(false);
  }

  function reset() {
    stopRef.current = true;
    resetCounter();
    incRef.current = [];
    setIncidents([]);
    setFeed([]);
    setAlerts([]);
    setSitrep("");
    setSelected(null);
    setStageQueue([]);
  }

  const setStatusOf = (id: string, s: Incident["status"]) =>
    commit(incRef.current.map((i) => (i.id === id ? { ...i, status: s } : i)));

  async function genAlerts(audience: "public" | "responders") {
    setBusy("alerts");
    const r = await fetch("/api/alert", { method: "POST", body: JSON.stringify({ incidents, audience, languages: langs }) });
    setAlerts(r.ok ? (await r.json()).alerts : [{ language: "error", text: await r.text(), unsupported: null }]);
    setBusy(null);
  }

  async function genSitrep() {
    setBusy("sitrep");
    const r = await fetch("/api/sitrep", { method: "POST", body: JSON.stringify({ incidents }) });
    setSitrep(r.ok ? (await r.json()).text : await r.text());
    setBusy(null);
  }

  const queue = [...incidents].filter((i) => i.status !== "dismissed").sort((a, b) => b.priority - a.priority);
  const totalReports = feed.filter((f) => f.triaged).length;
  const avgMs = Math.round(feed.filter((f) => f.ms).reduce((s, f) => s + f.ms!, 0) / Math.max(1, feed.filter((f) => f.ms).length));
  const sel = incidents.find((i) => i.id === selected);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
        <div className="mr-auto">
          <div className="text-xs uppercase tracking-widest text-red-400">● Live · Rapid Response Command</div>
          <h1 className="text-lg font-semibold">{scenario.name}</h1>
        </div>
        <Pill ok={status?.jev}>Jev {status?.jev ? "live" : "mock"}</Pill>
        <Pill ok={status?.llm}>LLM {status?.llm ? "live" : "mock"}</Pill>
        <Stat label="reports" value={totalReports} />
        <Stat label="incidents" value={incidents.filter((i) => i.status !== "dismissed").length} />
        <Stat label="dedup'd" value={Math.max(0, totalReports - incidents.length)} />
        <Stat label="avg triage" value={`${(avgMs / 1000).toFixed(1)}s`} />
        <button onClick={running ? () => (stopRef.current = true) : playFeed} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold hover:bg-red-500">
          {running ? "■ Stop" : "▶ Play incoming feed"}
        </button>
        <button onClick={reset} className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">Reset</button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_1fr_420px]">
        {/* Incoming feed */}
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/50">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">Incoming (raw, any language, any channel)</h2>
          <form
            className="flex gap-2 border-b border-slate-800 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!manual.trim()) return;
              triage({ id: `m-${Date.now()}`, text: manual, source: "manual", minutesAgo: 0 });
              setManual("");
            }}
          >
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type a report…" className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm outline-none" />
            <button className="rounded bg-slate-700 px-2 text-sm">Send</button>
          </form>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {feed.map(({ report, triaged, error }) => (
              <li
                key={report.id}
                onClick={() => triaged && setStageQueue((q) => [toStage(triaged), ...q])}
                title={triaged ? "Ver a Jev decidir este reporte" : undefined}
                className={`rounded border border-slate-800 bg-slate-900 p-2 text-xs ${triaged ? "cursor-pointer hover:border-sky-700" : ""}`}
              >
                <div className="mb-1 flex justify-between text-slate-400">
                  <span className="uppercase">{report.source}</span>
                  <span>{triaged ? (triaged.judgment.duplicateOf ? `↳ merged into ${triaged.judgment.duplicateOf}` : triaged.judgment.category) : error ? "error" : "triaging…"}</span>
                </div>
                <p className="text-slate-200">{report.text}</p>
                {error && <p className="mt-1 text-red-400">{error}</p>}
                {triaged && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag>{SEV[Math.round(triaged.judgment.severity)]}</Tag>
                    {triaged.judgment.lifeThreat > 0.6 && <Tag tone="red">life threat {(triaged.judgment.lifeThreat * 100).toFixed(0)}%</Tag>}
                    {triaged.judgment.vulnerable > 0.6 && <Tag tone="amber">vulnerable</Tag>}
                    {triaged.judgment.credible < 0.4 && <Tag tone="slate">rumor?</Tag>}
                    {triaged.extraction.language !== "English" && triaged.extraction.language !== "unknown" && <Tag tone="sky">{triaged.extraction.language}</Tag>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Map + sitrep */}
        <section className="flex min-h-[400px] flex-col gap-3 overflow-y-auto">
          <JevStage queue={stageQueue} onConsumed={consumeStage} live={!!status?.jev} />
          <div className="relative min-h-[260px] flex-1">
            <IncidentMap incidents={incidents} resources={scenario.resources} selected={selected} onSelect={setSelected} />
          </div>
          {sel && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs">
              <div className="mb-2 font-semibold">{sel.id} · Jev judgment breakdown</div>
              {sel.reports.slice(0, 1).map((r) => (
                <div key={r.report.id} className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(r.judgment.categoryProbs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => (
                    <Bar key={k} label={`category: ${k}`} value={v} />
                  ))}
                  <Bar label={`severity ${r.judgment.severity.toFixed(2)}/4`} value={r.judgment.severity / 4} />
                  <Bar label="life threat" value={r.judgment.lifeThreat} />
                  <Bar label="vulnerable" value={r.judgment.vulnerable} />
                  <Bar label="credible" value={r.judgment.credible} />
                </div>
              ))}
              <p className="mt-2 text-slate-500">
                Priority = {WEIGHTS.severity}·sev + {WEIGHTS.lifeThreat}·life + {WEIGHTS.vulnerable}·vuln + {WEIGHTS.corroboration}·corroboration, damped by credibility.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Commander sitrep</h2>
              <button onClick={genSitrep} disabled={!incidents.length || !!busy} className="rounded bg-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {busy === "sitrep" ? "Writing…" : "Generate sitrep"}
              </button>
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-300">{sitrep || "—"}</pre>
          </div>
        </section>

        {/* Priority queue + alerts */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-800 bg-slate-900/50">
            <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-semibold">Priority queue · AI proposes, human approves</h2>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {queue.map((i) => (
                <li
                  key={i.id}
                  onClick={() => setSelected(i.id)}
                  className={`cursor-pointer rounded border p-2 text-xs ${selected === i.id ? "border-white" : "border-slate-800"} ${i.status === "dispatched" ? "opacity-50" : ""} bg-slate-900`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 font-bold text-slate-950" style={{ background: priorityColor(i.priority) }}>P{i.priority}</span>
                    <span className="font-semibold">{i.id}</span>
                    <span className="text-slate-400">{i.category}</span>
                    {i.needsHuman && <Tag tone="amber">review</Tag>}
                    <span className="ml-auto text-slate-500">{i.reports.length} rpt</span>
                  </div>
                  <p className="mt-1 text-slate-200">{i.summary}</p>
                  {!!i.reasons.length && <p className="mt-1 text-slate-400">why: {i.reasons.join(" · ")}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sky-300">→ {i.assignedResource ?? (scenario.routing[i.category] ? "no unit free" : "comms only")}</span>
                    {i.status === "open" ? (
                      <>
                        <button onClick={(e) => (e.stopPropagation(), setStatusOf(i.id, "dispatched"))} className="ml-auto rounded bg-emerald-600 px-2 py-0.5 font-semibold">Approve</button>
                        <button onClick={(e) => (e.stopPropagation(), setStatusOf(i.id, "dismissed"))} className="rounded border border-slate-700 px-2 py-0.5">Dismiss</button>
                      </>
                    ) : (
                      <span className="ml-auto text-emerald-400">dispatched</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <h2 className="mb-2 text-sm font-semibold">Multilingual alerts · verified by Jev</h2>
            <div className="mb-2 flex flex-wrap gap-1">
              {LANGS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLangs((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))}
                  className={`rounded px-2 py-0.5 text-xs ${langs.includes(l) ? "bg-sky-600" : "bg-slate-800"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="mb-2 flex gap-2">
              <button onClick={() => genAlerts("public")} disabled={!incidents.length || !!busy} className="rounded bg-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                {busy === "alerts" ? "Drafting…" : "Public SMS alert"}
              </button>
              <button onClick={() => genAlerts("responders")} disabled={!incidents.length || !!busy} className="rounded bg-slate-700 px-2 py-1 text-xs disabled:opacity-40">
                Responder broadcast
              </button>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {alerts.map((a, k) => (
                <li key={k} className="rounded bg-slate-900 p-2 text-xs">
                  <div className="mb-1 flex justify-between text-slate-400">
                    <span>{a.language}</span>
                    {a.unsupported !== null && (
                      <span className={a.unsupported > 0.5 ? "text-red-400" : "text-emerald-400"}>
                        {a.unsupported > 0.5 ? `⚠ unsupported claim ${(a.unsupported * 100).toFixed(0)}%` : `✓ grounded ${((1 - a.unsupported) * 100).toFixed(0)}%`}
                      </span>
                    )}
                  </div>
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${ok ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>{children}</span>;
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center leading-tight">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}
function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "red" | "amber" | "slate" | "sky" }) {
  const c = { red: "bg-red-900 text-red-200", amber: "bg-amber-900 text-amber-200", slate: "bg-slate-800 text-slate-300", sky: "bg-sky-900 text-sky-200" }[tone];
  return <span className={`rounded px-1.5 py-0.5 ${c}`}>{children}</span>;
}
function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-slate-400">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800">
        <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
    </div>
  );
}
