import { extractK, judgeK, mockK } from "@/lib/knicksAi";
import type { KReport } from "@/lib/knicks";

const timeout = <T,>(p: Promise<T>, ms: number, fb: () => T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb()), ms))]);

export async function POST(req: Request) {
  const { report } = (await req.json()) as { report: KReport };
  const t0 = Date.now();
  const [judgment, geo] = await Promise.all([
    timeout(judgeK(report), 9000, () => mockK(report)),
    timeout(extractK(report), 12000, () => ({ segments: [], stations: [] })),
  ]);
  return Response.json({ judgment, ...geo, ms: Date.now() - t0 });
}
