# Fallback Host: when Resy goes down, Jev rebuilds tonight's book

> When Resy goes down, Fallback Host rebuilds tonight's reservations from emails, texts, voicemails, DMs and payments. Jev verifies each one; a voice agent and AI drafts confirm guests.

Built in 45 minutes at the **Plug and Play × PMAI Hackathon: Rapid Response (#AIWeekNY)**, Challenge 1: *"Resy goes offline. How can you reach customers, verify availability and confirm bookings for tonight?"*

- ▶️ **Watch the demo on YouTube:** https://youtu.be/Erd6mEMeFRY
- 🎬 **Demo video file (2 min):** [demo-video/fallback-host.mp4](https://github.com/valensangui8/rapid-response-command/blob/main/demo-video/fallback-host.mp4) · subtitles: [`.srt`](demo-video/fallback-host.srt) · [`.vtt`](demo-video/fallback-host.vtt) · [narration script](demo-video/script.md)
- 🌐 **Live app:** https://rapid-response-command.vercel.app/resy
- ▶️ **Reproducible demo run:** https://rapid-response-command.vercel.app/resy?demo=replay

## The problem
It's 2 PM, dinner service starts at 5, and the reservation system is down. The restaurant can't see who's coming tonight. The bookings aren't gone, though. They're scattered across Resy confirmation emails, texts, voicemails, Instagram and Google DMs, staff notes, the POS and payment records.

## What Fallback Host does
| Feature | How it works |
|---|---|
| **Rebuild the book** | Ingests every channel. **Jev** (TypeSafe System One) classifies each message (existing booking / new request / change / cancel / question / ignore), matches it to bookings already recovered, flags what the manager must see, and scores urgency, all as typed answers with **calibrated probabilities**. Code assigns tables, merges duplicates across channels and languages, and catches conflicts (e.g. a party size change with no table). |
| **Voice agent** | Answers the phone all day (Web Speech API): transcribes the caller, Jev finds the booking, and it confirms out loud, offering a free dessert for the trouble. |
| **Recovery campaign** | One click drafts posts for Instagram, Google, X, the website and the door: *"Had a table tonight? Message us → free prosecco."* A **referral** post rewards friends who tell us about someone else's booking. Jev scores each claim's **plausibility** and filters freeloaders. |
| **Payment validation** | Jev matches Stripe prepayments (amount, time, cardholder, last 4, never full card numbers) to bookings, ignores lunch bills and gift cards, and recovers bookings that exist nowhere else. **Door check:** last 4 digits → instant confirmation. |
| **Ghost covers & waitlist** | Compares recovered covers with the typical Tuesday to hold buffer tables. Cancellations instantly offer the freed table to the waitlist. |
| **Human in the loop** | The AI drafts every SMS in the guest's language and the host approves before anything is sent. |
| **Never again** | Continuous backups outside Resy, plus a "Resy is back" sync plan (enter offline bookings first so nothing is double-booked). |

## Architecture
```
messages ─▶ Jev (Choice / Noul / Score, parallel, calibrated) ─┐
        └─▶ LLM extraction (name, party, time, language) ──────┴─▶ code policy: book, tables, conflicts ─▶ outreach queue (human approves)
```
- `src/lib/resyAi.ts`: Jev questions + LLM extraction and drafting
- `src/lib/resyBook.ts`: reconciliation policy (tables, conflicts, waitlist, perks)
- `src/components/ResyDashboard.tsx`, `VoiceAgent.tsx`, `Pixel.tsx`: UI, voice agent, pixel-art Jev
- `src/lib/gen.ts`: rotates across free AI Gateway models (free tier is ~5 req/min per model)

## Run it
```bash
npm install
vercel env pull .env.local          # AI Gateway auth (VERCEL_OIDC_TOKEN)
echo "TYPESAFE_API_KEY=..." >> .env.local   # optional
npm run dev                         # http://localhost:3000/resy
```
**No Jev key? Nothing stops.** Without `TYPESAFE_API_KEY`, every judgment is simulated: recorded real Jev answers for the demo messages, keyword rules for anything else. All model calls have timeouts and fallbacks.

Demo modes: `?demo=capture` runs live and records every response; `?demo=replay` replays recorded real responses for repeatable takes.

## Regenerate the video
Recorded with [Argo](https://github.com/shreyaskarnik/argo) (Playwright + local Kokoro TTS, no API keys):
```bash
npm run build && npx next start -p 3210
cd video && npm install && npx playwright install chromium
npx argo pipeline fallback-host     # → video/videos/fallback-host.mp4 (+ .srt/.vtt)
```

## Simulated in the demo
The demo messages, Stripe charges and Toast POS records are sample data. Posting to social channels, sending SMS, emailing backups and Resy sync are shown in the UI, not executed. The Jev judgments, LLM extractions and drafts in the video are real model outputs, recorded once and replayed.

---
Other prototype in this repo: an emergency-triage command center at `/` (same Jev + LLM pattern).
