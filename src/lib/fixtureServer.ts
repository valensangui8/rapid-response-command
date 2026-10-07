import "server-only";
import fx from "./resyFixture.json";

/** Recorded real Jev/LLM responses, used as the mock when no TYPESAFE_API_KEY is configured. */
export const recorded = <T>(key: string): T | undefined => (fx as Record<string, unknown>)[key] as T | undefined;
export const jevConfigured = () => !!process.env.TYPESAFE_API_KEY;
