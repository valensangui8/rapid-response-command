import { scenario } from "./scenario";
import type { Incident, Resource, TriagedReport } from "./types";

/**
 * POLICY LIVES IN CODE (explainable, tweakable live in the demo).
 * Jev gives raw calibrated judgments; this file turns them into priority + routing.
 */
export const WEIGHTS = { severity: 0.45, lifeThreat: 0.3, vulnerable: 0.15, corroboration: 0.1 };
export const HUMAN_REVIEW_CONFIDENCE = 0.5;

export function scoreIncident(inc: Omit<Incident, "priority" | "needsHuman" | "reasons">) {
  const corroboration = Math.min(1, (inc.reports.length - 1) / 3);
  const raw =
    WEIGHTS.severity * (inc.severity / 4) +
    WEIGHTS.lifeThreat * inc.lifeThreat +
    WEIGHTS.vulnerable * inc.vulnerable +
    WEIGHTS.corroboration * corroboration;
  // Uncorroborated rumors get damped, not deleted.
  const credibility = Math.max(inc.credible, corroboration);
  const priority = Math.round(100 * raw * (0.4 + 0.6 * credibility));

  const reasons: string[] = [];
  if (inc.lifeThreat > 0.6) reasons.push(`life threat ${(inc.lifeThreat * 100).toFixed(0)}%`);
  if (inc.vulnerable > 0.6) reasons.push(`vulnerable person ${(inc.vulnerable * 100).toFixed(0)}%`);
  if (inc.reports.length > 1) reasons.push(`${inc.reports.length} corroborating reports`);
  if (credibility < 0.4) reasons.push(`likely rumor (credibility ${(credibility * 100).toFixed(0)}%)`);

  const first = inc.reports[0].judgment;
  // Uncertainty only matters when the case could matter (a confused rumor about nothing doesn't need a human).
  const matters = inc.severity >= 2 || inc.lifeThreat > 0.4;
  const needsHuman =
    (matters &&
      inc.reports.some((r) => r.judgment.categoryConfidence < HUMAN_REVIEW_CONFIDENCE || r.judgment.severityConfidence < HUMAN_REVIEW_CONFIDENCE)) ||
    (credibility > 0.35 && credibility < 0.65 && inc.severity >= 2.5);
  if (needsHuman) reasons.push(`low model confidence → human review (cat ${(first.categoryConfidence * 100).toFixed(0)}%)`);

  return { priority, needsHuman, reasons };
}

let counter = 0;
export function addToIncidents(incidents: Incident[], t: TriagedReport): Incident[] {
  const lat = t.report.lat ?? t.extraction.lat ?? 40.7128 + (Math.random() - 0.5) * 0.02;
  const lng = t.report.lng ?? t.extraction.lng ?? -74.006 + (Math.random() - 0.5) * 0.02;
  const j = t.judgment;
  const target = j.duplicateOf ? incidents.find((i) => i.id === j.duplicateOf) : undefined;

  if (target) {
    const reports = [...target.reports, t];
    const merged = {
      ...target,
      reports,
      severity: Math.max(target.severity, j.severity),
      lifeThreat: Math.max(target.lifeThreat, j.lifeThreat),
      vulnerable: Math.max(target.vulnerable, j.vulnerable),
      credible: Math.max(target.credible, j.credible),
    };
    return incidents.map((i) => (i.id === target.id ? { ...merged, ...scoreIncident(merged) } : i));
  }

  const base = {
    id: `INC-${String(++counter).padStart(3, "0")}`,
    reports: [t],
    category: j.category,
    severity: j.severity,
    lifeThreat: j.lifeThreat,
    vulnerable: j.vulnerable,
    credible: j.credible,
    summary: t.extraction.summary,
    lat,
    lng,
    status: "open" as const,
    assignedResource: null,
  };
  return [...incidents, { ...base, ...scoreIncident(base) }];
}

const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));

/** Greedy: highest priority first gets the nearest free resource of the right type. */
export function assignResources(incidents: Incident[], resources: Resource[] = scenario.resources): Incident[] {
  const busy = new Set(incidents.filter((i) => i.status === "dispatched" && i.assignedResource).map((i) => i.assignedResource!));
  const sorted = [...incidents].sort((a, b) => b.priority - a.priority);
  const proposals = new Map<string, string | null>();
  for (const inc of sorted) {
    if (inc.status !== "open") continue;
    const type = scenario.routing[inc.category];
    const free = resources.filter((r) => r.type === type && !busy.has(r.id));
    const best = free.sort((a, b) => dist(a, inc) - dist(b, inc))[0];
    proposals.set(inc.id, best?.id ?? null);
    if (best) busy.add(best.id);
  }
  return incidents.map((i) => (i.status === "open" ? { ...i, assignedResource: proposals.get(i.id) ?? null } : i));
}

export function resetCounter() {
  counter = 0;
}
