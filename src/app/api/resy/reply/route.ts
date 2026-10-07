import { draftReply } from "@/lib/resyAi";

export async function POST(req: Request) {
  const { kind, guest, language, extra } = await req.json();
  return Response.json({ text: await draftReply(kind, guest, language ?? "English", extra ?? "") });
}
