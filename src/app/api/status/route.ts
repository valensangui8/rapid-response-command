import { connection } from "next/server";
import { llmAvailable, LLM_MODEL } from "@/lib/llm";

export async function GET() {
  await connection(); // read env at request time, not build time
  return Response.json({ jev: !!process.env.TYPESAFE_API_KEY, llm: llmAvailable(), model: LLM_MODEL });
}
