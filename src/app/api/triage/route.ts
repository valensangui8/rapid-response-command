import { judgeReport, type OpenIncidentRef } from "@/lib/jev";
import { extractReport } from "@/lib/llm";
import type { RawReport, TriagedReport } from "@/lib/types";

export async function POST(req: Request) {
  const { report, openIncidents } = (await req.json()) as { report: RawReport; openIncidents: OpenIncidentRef[] };
  const started = Date.now();
  // Jev judgments and LLM extraction are independent -> run in parallel.
  const [judgment, extraction] = await Promise.all([judgeReport(report, openIncidents), extractReport(report)]);
  const result: TriagedReport = { report, judgment, extraction };
  return Response.json({ ...result, ms: Date.now() - started });
}
