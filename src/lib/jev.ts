import "server-only";
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { scenario } from "./scenario";
import type { Judgment, RawReport } from "./types";

/**
 * Jev (TypeSafe System One) = fast, calibrated, typed judgments.
 * We ask ALL independent questions about a report in ONE request (they run in parallel).
 * Code owns the policy (priority formula, thresholds, routing).
 */

let client: TypeSafeClient | null = null;
const getClient = () => {
  if (!process.env.TYPESAFE_API_KEY) return null;
  client ??= new TypeSafeClient();
  return client;
};

export const SEVERITY_LEVELS = [
  "Informational only: a question, rumor, or report with no physical danger to anyone",
  "Minor: property damage or inconvenience, nobody hurt or at risk in the next hours",
  "Moderate: people need help soon (no power, displaced, minor injury) but no danger to life right now",
  "Serious: injury or risk that could become life-threatening within the hour if nobody responds",
  "Critical: immediate threat to life right now (trapped in rising water, unconscious, fire with people inside, life-support failing)",
] as const;

export type OpenIncidentRef = { id: string; summary: string; location: string };

export async function judgeReport(report: RawReport, openIncidents: OpenIncidentRef[]): Promise<Judgment> {
  const c = getClient();
  if (!c) return mockJudge(report, openIncidents);
  try {
    return await jevJudge(c, report, openIncidents);
  } catch (e) {
    console.error("Jev failed, using keyword fallback:", (e as Error).message);
    return mockJudge(report, openIncidents);
  }
}

async function jevJudge(c: TypeSafeClient, report: RawReport, openIncidents: OpenIncidentRef[]): Promise<Judgment> {
  const state = {
    situation: scenario.briefing,
    report: { text: report.text, channel: report.source, minutes_ago: report.minutesAgo },
    open_incidents: openIncidents.slice(-25),
  };

  const dupCriteria: Record<string, string | null> = { new: "This report describes a different event than every open incident" };
  for (const inc of openIncidents.slice(-25)) dupCriteria[inc.id] = `The same real-world event as: ${inc.summary} (location: ${inc.location})`;

  const res = await c.systemOne({
    state,
    questions: {
      category: choice("What kind of emergency need does `report.text` describe? The report may be in any language.", scenario.categories),
      severity: score("How severe is the situation described in `report.text` for the people involved?", [...SEVERITY_LEVELS]),
      life_threat: noul("Is any person's life in immediate danger according to `report.text`?", {
        true: "Someone could die or be gravely injured in the next minutes without help",
        false: "No immediate danger to life",
      }),
      vulnerable: noul("Does `report.text` involve a vulnerable person: elderly, child, disabled, pregnant, or dependent on medical equipment or treatment?"),
      credible: noul("Is `report.text` a specific, first-hand or official observation (as opposed to hearsay, rumor, or speculation)?", {
        true: "Concrete location or details, witnessed directly, or from responders/sensors",
        false: "Vague, second-hand ('heard', 'someone said'), sensational, or unverifiable claim",
      }),
      ...(openIncidents.length
        ? { duplicate: choice("Does `report` describe the same real-world event as one of `open_incidents`? It is the same event only if it is the same specific place (same building, street, or station) AND the same situation, even if worded differently or in another language. Similar situations in different or unknown places are different events.", dupCriteria) }
        : {}),
    },
  });

  const a = res.answers as Record<string, any>;
  const dup = a.duplicate;
  return {
    category: a.category.choice,
    categoryProbs: a.category.probabilities,
    categoryConfidence: a.category.confidence,
    severity: a.severity.score,
    severityConfidence: a.severity.confidence,
    lifeThreat: a.life_threat.noul,
    vulnerable: a.vulnerable.noul,
    credible: a.credible.noul,
    duplicateOf: dup && dup.choice !== "new" && dup.probabilities[dup.choice] > 0.6 ? dup.choice : null,
    duplicateConfidence: dup ? dup.confidence : 1,
    mock: false,
  };
}

/** Keyword fallback so the demo still runs without a TypeSafe key. */
export function mockJudge(report: RawReport, openIncidents: OpenIncidentRef[]): Judgment {
  const t = report.text.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const category = has("oxygen", "oxigeno", "bleeding", "dialysis", "fever", "lafyèv", "panic")
    ? "medical"
    : has("stuck", "trapped", "inside", "stalled", "platform")
      ? "rescue"
      : has("spark", "gas", "fire", "smoke", "burning")
        ? "fire"
        : has("flood", "water", "sensor")
          ? "flooding"
          : has("power", "luz", "电")
            ? "power"
            : has("shelter", "where can", "go?")
              ? "shelter"
              : "info";
  const lifeThreat = has("oxygen", "oxigeno", "child", "trapped", "gas", "stalled", "bleeding") ? 0.85 : 0.15;
  const credible = has("heard", "someone said", "?", "!!") ? 0.2 : 0.85;
  const severity = category === "info" ? 0.2 : lifeThreat > 0.5 ? 3.6 : 2;
  return {
    category,
    categoryProbs: { [category]: 0.7 },
    categoryConfidence: 0.5,
    severity,
    severityConfidence: 0.5,
    lifeThreat,
    vulnerable: has("grandmother", "abuela", "child", "kids", "wheelchair", "коляске", "老人", "timoun", "dialysis") ? 0.9 : 0.1,
    credible,
    duplicateOf: openIncidents.find((i) => i.summary.toLowerCase().includes("chambers") && t.includes("chambers"))?.id ?? null,
    duplicateConfidence: 0.5,
    mock: true,
  };
}

/** Verify pattern: Jev checks each generated alert against the verified facts before it goes out. */
export async function verifyAlerts(alerts: { language: string; text: string }[], facts: string) {
  const c = getClient();
  if (!c) return alerts.map(() => null);
  return Promise.all(
    alerts.map(async (al) => {
      const res = await c.systemOne({
        state: { verified_facts: facts, alert: al.text, alert_language: al.language },
        questions: {
          unsupported: noul("Does `alert` state anything (a place, number, hazard, or instruction) that is not supported by `verified_facts`? The alert may be in another language."),
        },
      });
      return res.answers.unsupported.noul;
    }),
  );
}
