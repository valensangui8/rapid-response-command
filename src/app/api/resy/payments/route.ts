import { charges } from "@/lib/resy";
import { judgeCharges, type BookRef } from "@/lib/resyAi";

export async function POST(req: Request) {
  const { book } = (await req.json()) as { book: BookRef[] };
  return Response.json({ charges, results: await judgeCharges(charges, book) });
}
