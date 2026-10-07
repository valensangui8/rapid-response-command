# ▶️ [Watch the demo video on YouTube](https://youtu.be/Erd6mEMeFRY)

# Fallback Host: when Resy goes down, Jev rebuilds tonight's book

> When Resy goes down, Fallback Host rebuilds tonight's reservations from emails, texts, voicemails, DMs and payments. Jev verifies each one; a voice agent and AI drafts confirm guests.

Built in 45 minutes at the **Plug and Play × PMAI Hackathon: Rapid Response (#AIWeekNY)**, Challenge 1: *"Resy goes offline. How can you reach customers, verify availability and confirm bookings for tonight?"*

## In 60 seconds: what the app does, step by step
It's 2 PM, Resy is down, and dinner starts at 5. Fallback Host walks the restaurant from *"we don't know who's coming"* to *"every table confirmed"*:

1. **Collect.** It gathers every place tonight's bookings still exist: Resy confirmation emails, guest texts, voicemails, Instagram/Google/X DMs, staff notes, the Toast POS guestbook and Stripe prepayments.
2. **Understand (Jev).** For each message, **Jev** (TypeSafe's decision model) answers typed questions with **calibrated probabilities**. Is it an existing booking, a new request, a change, a cancellation, a question, or noise? Does it match a guest we already have? Does the manager need to see it (VIP, Amex Platinum, severe allergy, large party)? How urgent is it? An LLM extracts name, party size, time and language.
3. **Rebuild the floor.** Code turns those answers into tonight's book. It assigns tables, merges duplicates across channels and languages (an English email and a Spanish voicemail from the same guest become one booking), and marks bookings as **verified** (2+ sources) or **unverified** (1 source).
4. **Catch problems early.** It flags conflicts hours before service: a party grows from 4 to 5 and there's no table, an 8-top is double-promised. Each conflict gets alternative times. It also estimates the **"ghost covers"** still missing against a typical Tuesday and holds buffer tables for them.
5. **Answer the phone.** A **voice agent** picks up calls all day. It finds the caller in the rebuilt book, confirms out loud and offers a free dessert for the trouble. New requests get a held table or a waitlist spot.
6. **Bring back the rest.** One click launches a **recovery campaign** on Instagram, Google, X, the website and a door QR: *"Had a table tonight? Message us → free prosecco."* A **referral** post rewards people who tell us about a friend's booking. Jev scores each claim's **plausibility** and blocks freeloaders with no real details.
7. **Prove it with payments.** Jev matches Stripe prepayments to bookings. It ignores lunch bills and gift cards, and recovers a booking that existed *nowhere else*. At the door, the **last 4 digits** of a card confirm a guest instantly.
8. **Confirm everyone, with a human in the loop.** Every guest gets a drafted SMS in their language (reconfirm + free dessert, alternatives, cancellation acknowledged, waitlist table freed). **The host approves before anything is sent.**
9. **Recover cleanly.** When Resy comes back, a **sync plan** lists what to enter first (bookings taken offline), what to update and what to cancel, so nothing gets double-booked.
10. **Never again.** From now on the book is **backed up outside Resy** (email to the manager, Google Sheet, offline iPad copy, printed run sheet, CSV download).

**Result:** a lost afternoon becomes a one-minute recovery. Guests end up happier than if nothing had happened, and the AI never acts without the host's approval.

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

## Challenge 2: Clear Path Home (Knicks win chaos)
*"The Knicks win the championship and Midtown floods with fans. Can official alerts, social media and public reports map street closures and plan alternate routes home?"*

- 🎬 **Demo video (1:53):** [demo-video/knicks.mp4](https://github.com/valensangui8/rapid-response-command/blob/main/demo-video/knicks.mp4) · subtitles: [`.srt`](demo-video/knicks.srt) · [`.vtt`](demo-video/knicks.vtt) · [narration script](demo-video/knicks-script.md)
- 📱 **Live app (mobile-first):** https://rapid-response-command.vercel.app/knicks · operator console: https://rapid-response-command.vercel.app/knicks/ops

How it works:
1. **Collect.** On open, the app pulls NYPD / Notify NYC alerts, MTA status, DOT traffic sensors, social posts and 311 reports. The map fills in from your location: street congestion by color, station load in %.
2. **Verify (Jev).** Jev classifies each report (road closed, crowd, station closed or metered, reopened, hazard, rumor) and scores its credibility. Code fuses the evidence: an official source counts in full, a public report counts by credibility, two credible reports confirm a closure, and an official "reopened" clears earlier reports. A single unverified report only slows routes down until a human confirms it.
3. **Route.** Choose a destination and a mode (🚗 drive, 🚇 transit, 🚶 walk). You get 3 options per mode with ETAs. Drive shows congested blocks, transit adds walk + wait (from station load) + ride. The recommendation prefers time, but penalizes crowds above 70%.
4. **Spread the crowd.** Every user who follows a recommendation adds load to that station or road, so the next riders get shifted elsewhere instead of herded into one crush. If your option is packed, it suggests a nearby place to wait it out.
5. **Navigate.** Waze-style turn-by-turn directions with a live ETA.

Mocked for the demo: traffic, station load, the crowd simulation and Midtown grid routing (14th–59th St, 10th–1st Ave). Jev's judgments are live.

---
Other prototype in this repo: an emergency-triage command center at `/` (same Jev + LLM pattern).
