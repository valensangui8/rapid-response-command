import { charges } from "@/lib/resy";
import { judgeCharges, type BookRef, type ChargeJudgment } from "@/lib/resyAi";
import { jevConfigured, recorded } from "@/lib/fixtureServer";

export async function POST(req: Request) {
  const { book } = (await req.json()) as { book: BookRef[] };
  if (!jevConfigured()) {
    const rec = recorded<{ results: ChargeJudgment[] }>("payments");
    if (rec) return Response.json({ charges, results: rec.results.map((r) => ({ ...r, mock: true })) });
  }
  const results = await Promise.race([
    judgeCharges(charges, book),
    new Promise<ChargeJudgment[]>((r) => setTimeout(() => r(charges.map((ch) => ({ chargeId: ch.id, isReservation: ch.description.includes("Resy") ? 0.95 : 0.05, matchOf: null, matchProb: 0, mock: true }))), 12000)),
  ]);
  return Response.json({ charges, results });
}
