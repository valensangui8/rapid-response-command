import "server-only";
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { Output } from "ai";
import { z } from "zod";
import { gen } from "./gen";
import { llmAvailable } from "./llm";
import { AVES, briefing, STATION_IDS, STATIONS, type KJudgment, type KReport, type Segment } from "./knicks";

let client: TypeSafeClient | null = null;
const getClient = () => {
  if (!process.env.TYPESAFE_API_KEY) return null;
  client ??= new TypeSafeClient();
  return client;
};

export const KINDS = {
  road_closed: "A street or avenue is closed, barricaded, or blocked by police or vehicles",
  crowd: "A street is packed or hard to walk through because of crowds or celebration, but not formally closed",
  station_closed: "A subway, PATH or rail station or its entrances are closed, or trains are skipping it",
  station_crowded: "A station is open but entry is metered, packed, or has long waits",
  reopened: "A street or station that was closed is now open again",
  hazard: "A safety incident on a street: fireworks, fire, injury, fight, flipped or burning car",
  info: "A question, rumor about the whole city, opinion, or chatter with no specific street or station status",
};

/** Jev: what kind of report this is, and whether it is a first-hand / official observation. */
export async function judgeK(r: KReport): Promise<KJudgment> {
  const c = getClient();
  if (!c) return mockK(r);
  try {
    const res = await c.systemOne({
      state: { situation: briefing, report: { text: r.text, channel: r.source, author: r.author, minutes_ago: r.minutesAgo } },
      questions: {
        kind: choice("What does `report.text` say about getting around Midtown? The report may be in any language.", KINDS),
        credible: noul("Is `report.text` a specific, first-hand or official observation of a street or station (as opposed to hearsay, exaggeration, or rumor)?", {
          true: "Names a concrete street, intersection or station and describes what the author sees or what an agency announces",
          false: "Vague, second-hand ('I heard'), sweeping ('all of midtown'), all-caps panic, or unverifiable",
        }),
      },
    });
    const a = res.answers as Record<string, any>;
    return { kind: a.kind.choice, kindProbs: a.kind.probabilities, kindConfidence: a.kind.confidence, credible: a.credible.noul, mock: false };
  } catch (e) {
    console.error("Jev failed, keyword fallback:", (e as Error).message);
    return mockK(r);
  }
}

export function mockK(r: KReport): KJudgment {
  const t = r.text.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const station = has("station", "entrance", "path", "trains");
  const kind: KJudgment["kind"] = has("reopen", "is open")
    ? "reopened"
    : has("heard", "all of midtown", "?")
      ? "info"
      : has("firework", "flipped", "burn", "fight")
        ? "hazard"
        : station && has("metered", "packed", "wait")
          ? "station_crowded"
          : station && has("closed", "shut", "bypass")
            ? "station_closed"
            : has("sea of", "can't move", "packed")
              ? "crowd"
              : has("closed", "blocked", "bloquead", "barricade")
                ? "road_closed"
                : "info";
  const credible = r.source === "official" ? 0.97 : has("heard", "!!!", "dont even try", "all of") ? 0.15 : 0.82;
  return { kind, kindProbs: { [kind]: 0.7 }, kindConfidence: 0.5, credible, mock: true };
}

const segSchema = z.object({
  avenueSegments: z.array(z.object({ avenue: z.enum(AVES), fromStreet: z.number(), toStreet: z.number() })).describe("Stretches ALONG an avenue, between two cross streets (numbers only, e.g. 33, 35)"),
  streetSegments: z.array(z.object({ street: z.number(), fromAve: z.enum(AVES), toAve: z.enum(AVES) })).describe("Stretches ALONG a numbered cross street, between two avenues"),
  stations: z.array(z.enum(STATION_IDS as [string, ...string[]])).describe("Stations the report is about"),
  summary: z.string().describe("<=10 word English summary"),
});

/** LLM geocoder for live reports: free text → grid segments (single intersections become a 1-block stretch). */
export async function extractK(r: KReport): Promise<{ segments: Segment[]; stations: string[]; summary?: string }> {
  if (r.segments || r.stations) return { segments: r.segments ?? [], stations: r.stations ?? [] };
  if (!llmAvailable()) return { segments: [], stations: [] };
  try {
    const { output } = await gen({
      output: Output.object({ schema: segSchema }),
      prompt: `Map this Midtown Manhattan report to street segments on the grid (avenues ${AVES.join(", ")}; streets 23–45). If a single intersection is given (e.g. "8th Ave at 34th"), use the avenue from street-1 to street+1. Ignore places outside the grid. Stations: ${STATIONS.map((s) => `${s.id}=${s.name} (${s.lines})`).join("; ")}.\nReport: """${r.text}"""`,
    });
    const o = output as z.infer<typeof segSchema>;
    return { segments: [...o.avenueSegments, ...o.streetSegments], stations: o.stations, summary: o.summary };
  } catch (e) {
    console.error("extractK failed:", (e as Error).message);
    return { segments: [], stations: [] };
  }
}
