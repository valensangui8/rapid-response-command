import "server-only";
import { generateText } from "ai";

/**
 * Free-tier AI Gateway limits each model to ~5 req/min. Rotate across free models and fall through on errors.
 * Set LLM_MODEL to pin one model (e.g. anthropic/claude-sonnet-5.5 once credits are added).
 */
const POOL = process.env.LLM_MODEL
  ? [process.env.LLM_MODEL]
  : ["google/gemini-2.5-flash", "openai/gpt-oss-120b", "mistral/mistral-small", "meta/llama-4-scout"];
let cursor = 0;

export async function gen<T extends Parameters<typeof generateText>[0]>(opts: Omit<T, "model">) {
  const start = cursor++ % POOL.length;
  let lastErr: unknown;
  for (let i = 0; i < POOL.length; i++) {
    const model = POOL[(start + i) % POOL.length];
    try {
      return await generateText({ ...(opts as T), model, maxRetries: 0 });
    } catch (e) {
      lastErr = e;
      console.error(`gen: ${model} failed (${(e as Error).message.slice(0, 80)}), trying next`);
    }
  }
  throw lastErr;
}
