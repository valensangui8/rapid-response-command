import { draftSitrep } from "@/lib/llm";
import { scenario } from "@/lib/scenario";
import type { Incident } from "@/lib/types";

export async function POST(req: Request) {
  const { incidents } = (await req.json()) as { incidents: Incident[] };
  return Response.json({ text: await draftSitrep(incidents, scenario.briefing) });
}
