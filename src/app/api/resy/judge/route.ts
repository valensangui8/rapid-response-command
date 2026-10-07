import { extractMessage, judgeMessage, mockJudge, type BookRef } from "@/lib/resyAi";
import type { Message } from "@/lib/resy";

const timeout = <T,>(p: Promise<T>, ms: number, fb: () => T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb()), ms))]);

export async function POST(req: Request) {
  const { message, book } = (await req.json()) as { message: Message; book: BookRef[] };
  const t0 = Date.now();
  const [judgment, extraction] = await Promise.all([
    timeout(judgeMessage(message, book), 9000, () => mockJudge(message)),
    timeout(extractMessage(message), 9000, () => ({ name: null, partySize: null, time: null, phone: null, notes: "", language: "unknown" })),
  ]);
  return Response.json({ judgment, extraction, ms: Date.now() - t0 });
}
