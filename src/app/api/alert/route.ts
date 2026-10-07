import { verifyAlerts } from "@/lib/jev";
import { draftAlerts } from "@/lib/llm";
import type { Incident } from "@/lib/types";

export async function POST(req: Request) {
  const { incidents, audience, languages } = (await req.json()) as { incidents: Incident[]; audience: "public" | "responders"; languages: string[] };
  const { alerts, facts } = await draftAlerts(incidents, audience, languages);
  const unsupported = await verifyAlerts(alerts, facts);
  return Response.json({ alerts: alerts.map((a, i) => ({ ...a, unsupported: unsupported[i] })) });
}
