import { draftCampaign, type Campaign } from "@/lib/resyAi";
import { recorded } from "@/lib/fixtureServer";

export async function POST() {
  const live = draftCampaign(); // already falls back to a template on LLM errors
  const fallback = recorded<Campaign>("campaign");
  if (!fallback) return Response.json(await live);
  // If the LLM is slow, use the recorded draft so the demo never stalls.
  return Response.json(await Promise.race([live, new Promise<Campaign>((r) => setTimeout(() => r(fallback), 10000))]));
}
