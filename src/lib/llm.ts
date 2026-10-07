import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { gen } from "./gen";
import type { Extraction, Incident, RawReport } from "./types";

/**
 * Generative LLM via Vercel AI Gateway (auth: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN from `vercel env pull`).
 * Used for things Jev doesn't do: free-text extraction, translation, drafting.
 * Free-tier gateway blocks Anthropic models: set LLM_MODEL=anthropic/claude-sonnet-5.5 once credits are added.
 */
export const LLM_MODEL = process.env.LLM_MODEL ?? "google/gemini-2.5-flash";
export const FAST_MODEL = process.env.FAST_MODEL ?? "google/gemini-2.5-flash";
// On Vercel the OIDC token is injected per request, so being deployed counts as available.
export const llmAvailable = () => !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);

const extractionSchema = z.object({
  summary: z.string().describe("<=12 word English summary of the event, include place name"),
  language: z.string().describe("Language of the original report, e.g. English, Spanish, Mandarin"),
  peopleAffected: z.number().nullable().describe("Number of people involved if stated or inferable, else null"),
  locationHint: z.string().describe("Most specific location mentioned, or 'unknown'"),
  lat: z.number().nullable().describe("Best-guess NYC latitude for the location, null if unknown"),
  lng: z.number().nullable().describe("Best-guess NYC longitude for the location, null if unknown"),
});

export async function extractReport(report: RawReport): Promise<Extraction> {
  const fallback: Extraction = { summary: report.text.slice(0, 80), language: "unknown", peopleAffected: null, locationHint: "unknown", lat: null, lng: null, mock: true };
  if (!llmAvailable()) return fallback;
  try {
    const { output } = await gen({
      output: Output.object({ schema: extractionSchema }),
      prompt: `Extract structured fields from this emergency report received in New York City.\nChannel: ${report.source}\nReport: """${report.text}"""`,
    });
    return { ...output, mock: false };
  } catch (e) {
    console.error("extractReport failed, using fallback:", (e as Error).message);
    return fallback;
  }
}

export const LANGUAGES = ["English", "Spanish", "Mandarin Chinese", "Russian", "Bengali", "Haitian Creole"];

export async function draftAlerts(incidents: Incident[], audience: "public" | "responders", languages: string[]) {
  const facts = incidents
    .filter((i) => i.status !== "dismissed" && i.credible > 0.5)
    .slice(0, 12)
    .map((i) => `- [${i.category}, severity ${i.severity.toFixed(1)}/4] ${i.summary}`)
    .join("\n");
  const schema = z.object({ alerts: z.array(z.object({ language: z.string(), text: z.string() })) });
  const { output } = await gen({
    output: Output.object({ schema }),
    prompt:
      audience === "public"
        ? `Write a public emergency SMS alert (max 300 chars each, plain words, 6th-grade reading level, concrete actions, NO claims beyond the facts) in each of: ${languages.join(", ")}.\nVerified facts:\n${facts}`
        : `Write a terse responder broadcast (max 400 chars) in English only summarizing priorities and asks.\nVerified incidents:\n${facts}`,
  });
  return { alerts: output.alerts as { language: string; text: string }[], facts };
}

export async function draftSitrep(incidents: Incident[], briefing: string) {
  const lines = incidents
    .map((i) => `- ${i.id} P${i.priority} [${i.category}] ${i.summary} | reports:${i.reports.length} | status:${i.status}${i.assignedResource ? ` -> ${i.assignedResource}` : ""}${i.needsHuman ? " | NEEDS HUMAN REVIEW" : ""}`)
    .join("\n");
  const { text } = await gen({
    prompt: `You are the planning chief. Write a situation report for the Incident Commander. Use markdown, max 180 words, sections: Situation, Top 3 priorities (why), Resource gaps, Rumors to counter, Decisions needed now.\nBackground: ${briefing}\nIncidents:\n${lines}`,
  });
  return text;
}
