import fx from "./resyFixture.json";

/**
 * ?demo=capture → run live (real Jev + LLM) and keep every response in window.__fx
 * ?demo=replay  → replay those recorded real responses instantly (repeatable video takes)
 */
export const demoMode = () => (typeof window === "undefined" ? "live" : (new URLSearchParams(window.location.search).get("demo") ?? "live"));

export async function cached<T>(key: string, live: () => Promise<T>, delayMs = 450): Promise<T> {
  const store = fx as Record<string, unknown>;
  if (demoMode() === "replay" && key in store) {
    await new Promise((r) => setTimeout(r, delayMs));
    return structuredClone(store[key]) as T;
  }
  const v = await live();
  if (demoMode() === "capture") {
    const w = window as unknown as { __fx?: Record<string, unknown> };
    (w.__fx ??= {})[key] = v;
  }
  return v;
}
