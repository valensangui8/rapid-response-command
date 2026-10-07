"use client";
import { useRef, useState } from "react";
import { restaurant, type Booking, type Message } from "@/lib/resy";
import type { MessageExtraction, MessageJudgment } from "@/lib/resyAi";
import { fmt } from "@/lib/resyBook";

type Ingest = (m: Message) => Promise<{ j: MessageJudgment; x: MessageExtraction; outcome: string; book: Booking[] } | null>;
type Line = { who: "agent" | "caller"; text: string };

/** Scripted callers so the demo works even in a loud room. */
const SCRIPTS = [
  { label: "Minh confirms", phone: "(917) 555-0108", text: "Hi, this is Minh Nguyen. I have a table for two at seven thirty tonight, I just want to make sure it's still on since Resy is down." },
  { label: "Unknown booking", phone: "(646) 555-0144", text: "Hey, Carlos Ruiz here, party of four at eight fifteen tonight. I booked last week but I can't see it in the app." },
  { label: "New request", phone: "(212) 555-0190", text: "Hi, do you have a table for two around nine tonight? My name is Grace." },
];

function speak(text: string, caller = false) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    u.voice = (caller ? voices[3] ?? voices[1] : voices.find((v) => /samantha|google us english|female/i.test(v.name)) ?? voices[0]) ?? null;
    u.rate = caller ? 1.08 : 1.02;
    u.pitch = caller ? 0.85 : 1.1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
    setTimeout(resolve, 12000); // safety
  });
}

export default function VoiceAgent({ ingest, treat }: { ingest: Ingest; treat: (id: string) => void }) {
  const [log, setLog] = useState<Line[]>([]);
  const [state, setState] = useState<"idle" | "ringing" | "talking" | "listening" | "thinking">("idle");
  const [muted, setMuted] = useState(false);
  const recRef = useRef<any>(null);

  const say = async (text: string) => {
    setLog((l) => [...l, { who: "agent", text }]);
    setState("talking");
    if (!muted) await speak(text);
  };

  const greeting = `${restaurant.name}, this is Jev, the virtual host. Our booking system is down for a bit, but I can confirm your reservation. What name and time is it under?`;

  async function handleCaller(text: string, phone: string) {
    setLog((l) => [...l, { who: "caller", text }]);
    setState("thinking");
    const r = await ingest({ id: `ph-${Date.now()}`, channel: "phone", from: phone, received: "now", text });
    if (!r) return say("Sorry, let me have the manager call you right back.");
    const { j, x, book } = r;
    const name = (x.name ?? "there").split(" ")[0];
    const b = book.find((bk) => bk.id === j.matchOf) ?? book.filter((bk) => bk.sources.some((s) => s.startsWith("ph-"))).at(-1);
    if (j.intent === "existing_booking" || j.intent === "modify") {
      if (b && b.status !== "cancelled") {
        treat(b.id);
        return say(`Perfect, ${name}. I found you: party of ${b.partySize} at ${fmt(b.time)}${b.table ? `, table ${b.table.slice(1)}` : ""}. You're confirmed, and since our system had a hiccup today, dessert is on us. See you tonight!`);
      }
      return say(`Thanks ${name}. I couldn't find it yet, so I've noted it and the manager will text you within fifteen minutes to confirm.`);
    }
    if (j.intent === "new_request") {
      if (b && b.status === "requested") return say(`Good news, ${name}: I can hold a table for ${b.partySize} at ${fmt(b.time)}. I'll text you a confirmation. Reply yes to lock it in.`);
      return say(`We're full at that time, ${name}, but I've put you on the waitlist and I'll text you the moment a table opens.`);
    }
    if (j.intent === "cancel") return say(`No problem, ${name}, your reservation is cancelled. Hope to see you another night.`);
    return say("Walk-ins are welcome at the bar, first come first served. Anything else I can help with?");
  }

  async function simulate(i: number) {
    const s = SCRIPTS[i];
    setLog([]);
    setState("ringing");
    await new Promise((r) => setTimeout(r, 900));
    await say(greeting);
    setState("listening");
    if (!muted) await speak(s.text, true);
    await handleCaller(s.text, s.phone);
    setState("idle");
  }

  async function live() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return setLog([{ who: "agent", text: "This browser has no speech recognition — use Chrome, or a scripted call." }]);
    setLog([]);
    await say(greeting);
    setState("listening");
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = async (e: any) => {
      const text = e.results[0][0].transcript as string;
      await handleCaller(text, "Live caller");
      setState("idle");
    };
    rec.onerror = () => setState("idle");
    rec.start();
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">☎️ Voice agent · answers the phone all day</h2>
        <span className={`px-1.5 ${state === "idle" ? "" : "pixel-blink"}`}>{{ idle: "● ready", ringing: "☎ RING RING", talking: "🔊 speaking", listening: "🎙 listening", thinking: "… thinking" }[state]}</span>
        <button onClick={() => setMuted(!muted)} className="rounded border border-slate-700 px-2 py-0.5">{muted ? "🔇 muted" : "🔊 sound"}</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {SCRIPTS.map((s, i) => (
          <button key={s.label} disabled={state !== "idle"} onClick={() => simulate(i)} className="rounded bg-slate-700 px-2 py-1 disabled:opacity-40">📞 {s.label}</button>
        ))}
        <button disabled={state !== "idle"} onClick={live} className="rounded bg-red-600 px-2 py-1 font-semibold disabled:opacity-40">🎙 Live call (mic)</button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {log.map((l, i) => (
          <div key={i} className={`jev-pop rounded p-1.5 ${l.who === "agent" ? "bg-slate-800" : "ml-6 border border-slate-700"}`}>
            <b>{l.who === "agent" ? "JEV" : "CALLER"}:</b> {l.text}
          </div>
        ))}
        {!log.length && <div className="text-slate-500">Calls are transcribed, judged by Jev, written into the book, and answered by voice — no host needed.</div>}
      </div>
    </div>
  );
}
