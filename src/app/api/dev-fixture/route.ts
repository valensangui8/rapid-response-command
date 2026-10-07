import { writeFile } from "node:fs/promises";
import path from "node:path";

/** Dev-only: persist a ?demo=capture run as the replay fixture. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("dev only", { status: 403 });
  const body = await req.text();
  await writeFile(path.join(process.cwd(), "src/lib/resyFixture.json"), JSON.stringify(JSON.parse(body), null, 1));
  return Response.json({ ok: true, bytes: body.length });
}
