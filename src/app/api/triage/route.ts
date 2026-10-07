import { judgeReport, mockJudge, type OpenIncidentRef } from "@/lib/jev";
import { extractReport } from "@/lib/llm";
import type { Extraction, RawReport, TriagedReport } from "@/lib/types";

/** Never let a slow model freeze the live demo: race against a timeout and fall back. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string, fallback: () => T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.error(`${label} timed out after ${ms}ms, using fallback`);
        resolve(fallback());
      }, ms),
    ),
  ]);
}

export async function POST(req: Request) {
  const { report, openIncidents } = (await req.json()) as { report: RawReport; openIncidents: OpenIncidentRef[] };
  const started = Date.now();
  const fallbackExtraction = (): Extraction => ({ summary: report.text.slice(0, 80), language: "unknown", peopleAffected: null, locationHint: "unknown", lat: null, lng: null, mock: true });
  // Jev judgments and LLM extraction are independent -> run in parallel.
  const [judgment, extraction] = await Promise.all([
    withTimeout(judgeReport(report, openIncidents), 9000, "Jev", () => mockJudge(report, openIncidents)),
    withTimeout(extractReport(report), 9000, "LLM extraction", fallbackExtraction),
  ]);
  const result: TriagedReport = { report, judgment, extraction };
  return Response.json({ ...result, ms: Date.now() - started });
}
