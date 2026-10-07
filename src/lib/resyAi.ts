import "server-only";
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { generateText, Output } from "ai";
import { z } from "zod";
import { FAST_MODEL, llmAvailable } from "./llm";
import { restaurant, type Message } from "./resy";

export const INTENTS = {
  existing_booking: "Evidence of a reservation for TONIGHT that already exists: a booking confirmation email, a phone booking a staff member took, or a guest saying they already have a reservation",
  new_request: "Someone asking for a NEW table tonight that they don't have yet",
  modify: "Guest with an existing reservation tonight wants to change time, party size, or table",
  cancel: "A reservation for tonight is cancelled",
  question: "General question (walk-ins, hours, menu) with no specific booking",
  irrelevant: "Not about tonight's guests: marketing, vendors, other dates",
} as const;
export type Intent = keyof typeof INTENTS;

export type BookRef = { id: string; summary: string };
export type MessageJudgment = {
  intent: Intent;
  intentProbs: Record<string, number>;
  intentConfidence: number;
  matchOf: string | null;
  matchConfidence: number;
  manager: number;
  urgency: number;
  plausible: number;
  referral: number;
  mock: boolean;
};
export type MessageExtraction = { name: string | null; partySize: number | null; time: string | null; phone: string | null; notes: string; language: string };

let client: TypeSafeClient | null = null;
const getClient = () => (process.env.TYPESAFE_API_KEY ? (client ??= new TypeSafeClient()) : null);

export async function judgeMessage(m: Message, book: BookRef[]): Promise<MessageJudgment> {
  const c = getClient();
  if (!c) return mockJudge(m);
  const matchCriteria: Record<string, string | null> = { none: "This message is not about any reservation in `tonights_book`" };
  for (const b of book.slice(-40)) matchCriteria[b.id] = `It is about this reservation: ${b.summary}`;
  try {
    const res = await c.systemOne({
      state: {
        situation: `Restaurant ${restaurant.name}. Our reservation system (Resy) has been down since ${restaurant.outageSince}. It is ${restaurant.now}. We are rebuilding tonight's book from emails, texts, voicemails and DMs. We also posted on Instagram, Google and X: guests who had a reservation tonight and message us their details get ${restaurant.perk}. And if you know SOMEONE ELSE who has a reservation tonight, tell us and you both get ${restaurant.referralPerk}.`,
        message: { channel: m.channel, from: m.from, received: m.received, text: m.text },
        tonights_book: book.slice(-40),
      },
      questions: {
        intent: choice("What is `message` about, regarding tonight's reservations? It may be in any language.", INTENTS),
        ...(book.length
          ? { match: choice("Is `message` about one of the reservations already in `tonights_book`? Match by guest name, phone number, or the same party/time details.", matchCriteria) }
          : {}),
        manager: noul("Does `message` need the manager's personal attention: a VIP or business client, a large party (7+), a severe allergy, a special occasion, or an upset guest?"),
        plausible: noul("If `message` claims a reservation for tonight, is it a plausible genuine claim with specific verifiable details (guest name AND time or party size, or a confirmation code or phone)? Vague claims only seeking the free perk are not plausible.", {
          true: "Specific: name plus time/party size, confirmation number, or phone",
          false: "Vague or freeloading: no name/time/size, or just asking for the freebie",
        }),
        referral: noul("Is `message` written by someone telling us about ANOTHER person's reservation (a friend, relative or coworker), rather than their own?"),
        urgency: score("How soon must the restaurant respond to `message`?", [
          "Never / no reply needed",
          "Sometime today",
          "Before dinner service starts at 5 PM",
          "Right now: guest is anxious, waiting on a callback, or the booking may be lost",
        ]),
      },
    });
    const a = res.answers as Record<string, any>;
    const match = a.match;
    return {
      intent: a.intent.choice,
      intentProbs: a.intent.probabilities,
      intentConfidence: a.intent.confidence,
      matchOf: match && match.choice !== "none" && match.probabilities[match.choice] > 0.55 ? match.choice : null,
      matchConfidence: match ? match.confidence : 1,
      manager: a.manager.noul,
      urgency: a.urgency.score,
      plausible: a.plausible.noul,
      referral: a.referral.noul,
      mock: false,
    };
  } catch (e) {
    console.error("Jev resy failed:", (e as Error).message);
    return mockJudge(m);
  }
}

export function mockJudge(m: Message): MessageJudgment {
  const t = m.text.toLowerCase();
  const intent: Intent = t.includes("cancel") ? "cancel" : t.includes("new reservation") || t.includes("booked") || t.includes("booking") ? "existing_booking" : t.includes("make it") ? "modify" : t.includes("table for") || t.includes("any chance") ? "new_request" : t.includes("walk-in") ? "question" : t.includes("tasting") ? "irrelevant" : "existing_booking";
  return { intent, intentProbs: { [intent]: 0.7 }, intentConfidence: 0.5, matchOf: null, matchConfidence: 0.5, manager: /allergy|client|8 at/.test(t) ? 0.9 : 0.1, urgency: 2, plausible: /\d/.test(t) ? 0.9 : 0.1, referral: /coworker|sister|friend|brother/.test(t) ? 0.9 : 0.05, mock: true };
}

const schema = z.object({
  name: z.string().nullable().describe("Name of the person the reservation is UNDER (if someone writes about a friend's booking, the friend's name), or null"),
  partySize: z.number().nullable().describe("Number of guests (the NEW number if they are changing it), or null"),
  time: z.string().nullable().describe("Reservation time tonight in 24h HH:MM, e.g. 19:30, or null"),
  phone: z.string().nullable().describe("Phone number formatted (XXX) XXX-XXXX, or null"),
  notes: z.string().describe("Allergies, occasions, seating requests; empty string if none"),
  language: z.string().describe("Language of the message"),
});

export async function extractMessage(m: Message): Promise<MessageExtraction> {
  const fallback: MessageExtraction = { name: null, partySize: null, time: null, phone: /\(\d{3}\)/.test(m.from) ? m.from : null, notes: "", language: "unknown" };
  if (!llmAvailable()) return fallback;
  try {
    const { output } = await generateText({
      model: FAST_MODEL,
      output: Output.object({ schema }),
      prompt: `Extract reservation details from this message a restaurant received today.\nChannel: ${m.channel}\nFrom: ${m.from}\nMessage: """${m.text}"""`,
    });
    return { ...output, phone: output.phone ?? fallback.phone };
  } catch (e) {
    console.error("extractMessage failed:", (e as Error).message);
    return fallback;
  }
}

export async function draftReply(kind: string, guest: { name: string; partySize: number; time: string; notes?: string }, language: string, extra: string) {
  const fallback = `Hi ${guest.name}, this is ${restaurant.name}. Our reservation system is temporarily down, so we're confirming by text: ${guest.partySize} guests at ${guest.time} tonight. Reply YES to confirm or call us. ${extra}`.trim();
  if (!llmAvailable()) return fallback;
  try {
    const { text } = await generateText({
      model: FAST_MODEL,
      prompt: `You are the host at ${restaurant.name}. Resy (our booking system) is down. Write ONE warm, short SMS (max 300 chars) in ${language === "unknown" ? "English" : language}. Purpose: ${kind}. Guest: ${guest.name}, party of ${guest.partySize}, ${guest.time} tonight. ${guest.notes ? `Notes: ${guest.notes}.` : ""} ${extra} Ask them to reply YES if relevant. No emojis overload, no promises beyond the facts. Output only the SMS.`,
    });
    return text.trim();
  } catch {
    return fallback;
  }
}

const campaignSchema = z.object({
  instagram_story: z.string().describe("Instagram story text, punchy, max 180 chars, with a call to DM"),
  google_post: z.string().describe("Google Business update, max 300 chars"),
  x_post: z.string().describe("Post for X, max 240 chars"),
  website_banner: z.string().describe("One-line website banner, max 120 chars"),
  door_sign: z.string().describe("Printed sign at the door / QR caption, max 120 chars"),
  referral_post: z.string().describe("Second Instagram post: know someone with a reservation tonight? Tag them / send their name → you both get the referral reward. Max 200 chars"),
});
export type Campaign = z.infer<typeof campaignSchema>;

export async function draftCampaign(): Promise<Campaign> {
  const perk = restaurant.perk;
  const fallback: Campaign = {
    instagram_story: `Our booking system is down 😬 Had a table with us tonight? DM your name + time and we'll save your seat — plus ${perk} on us 🥂`,
    google_post: `Resy is temporarily down. If you have a reservation at ${restaurant.name} tonight, message us your name, time and party size — we'll confirm by text and treat you to ${perk}.`,
    x_post: `Resy is down but dinner isn't. Booked at ${restaurant.name} tonight? Reply/DM name + time → confirmed + ${perk} 🥂`,
    website_banner: `Booked tonight? Resy is down — text us your name & time for ${perk}.`,
    door_sign: `Had a reservation tonight? Scan to confirm and get ${perk}.`,
    referral_post: `Know someone with a table at ${restaurant.name} tonight? Tag them or DM us their name — ${restaurant.referralPerk} 🍰`,
  };
  if (!llmAvailable()) return fallback;
  try {
    const { output } = await generateText({
      model: FAST_MODEL,
      output: Output.object({ schema: campaignSchema }),
      prompt: `Restaurant ${restaurant.name} in NYC. Our reservation system Resy has been down since ${restaurant.outageSince}. Write a recovery campaign so guests who had a reservation TONIGHT message us their name, time and party size. Reward: ${perk}. Also a referral post: anyone who tells us about a FRIEND with a reservation tonight gets ${restaurant.referralPerk}. Warm, confident, a little playful, never blame Resy harshly. Each piece must clearly ask for: name + time + party size.`,
    });
    return output;
  } catch {
    return fallback;
  }
}
