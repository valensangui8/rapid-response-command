import { draftCampaign } from "@/lib/resyAi";

export async function POST() {
  return Response.json(await draftCampaign());
}
