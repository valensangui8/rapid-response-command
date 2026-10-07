import { extractMessage, judgeMessage, mockJudge, type BookRef, type MessageExtraction, type MessageJudgment } from "@/lib/resyAi";
import { jevConfigured, recorded } from "@/lib/fixtureServer";
import type { Message } from "@/lib/resy";

const timeout = <T,>(p: Promise<T>, ms: number, fb: () => T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb()), ms))]);
const emptyExtraction = (): MessageExtraction => ({ name: null, partySize: null, time: null, phone: null, notes: "", language: "unknown" });

export async function POST(req: Request) {
  const { message, book } = (await req.json()) as { message: Message; book: BookRef[] };
  const t0 = Date.now();
  // No Jev key → fully simulated: recorded real answers for demo messages, keyword rules otherwise. Never blocks.
  if (!jevConfigured()) {
    const rec = recorded<{ judgment: MessageJudgment; extraction: MessageExtraction }>(`judge:${message.text}`);
    if (rec) return Response.json({ ...rec, judgment: { ...rec.judgment, mock: true }, ms: Date.now() - t0 });
  }
  const [judgment, extraction] = await Promise.all([
    timeout(judgeMessage(message, book), 9000, () => mockJudge(message)),
    timeout(extractMessage(message), 9000, emptyExtraction),
  ]);
  return Response.json({ judgment, extraction, ms: Date.now() - t0 });
}
