# How the demo video was made (Argo playbook, about 15 minutes)

This is how the challenge 1 video (`demo-video/fallback-host.mp4`, 2:01, 1080p, English narration and subtitles) was produced. You can copy it for any page of this app, for example `/knicks`.

## 0. Why Argo
- [Argo](https://github.com/shreyaskarnik/argo) is an npm package.
- Playwright records the real app.
- **Kokoro TTS runs locally**, so the voice is free and needs no API key.
- ffmpeg exports MP4 plus `.srt`/`.vtt`.
- Ultrademo was skipped because it needs a repo clone, Remotion, and ElevenLabs for a good voice.

## 1. Make the app repeatable (the key trick)
Live models are slow and rate-limited: the AI Gateway free tier allows about 5 requests/min per model. So: **record real responses once, then replay them.**
- `src/lib/demoFixture.ts` provides `cached(key, liveFn, delayMs)`:
  - `?demo=capture` runs live and stores each response in `window.__fx`.
  - `?demo=replay` returns the stored responses instantly.
- Wrap every client `fetch` to a model route: `await cached("judge:" + text, () => fetch(...).then(r => r.json()))`.
- To capture:
  1. Open `/<page>?demo=capture` and click through the exact demo flow, in the same order you will record.
  2. In the browser console, run `fetch('/api/dev-fixture',{method:'POST',body:JSON.stringify(window.__fx)})`. This dev-only route writes `src/lib/resyFixture.json`. For another page, use a separate fixture file and route, or extend the keys.
- Add stable `id`s to panels you'll zoom or scroll to (e.g. `id="floor"`).
- Mute any in-page speech in replay mode, so the narration is the only audio.

## 2. Run a production build (no Next dev overlay in the video)
```bash
cd app && npm run build && npx next start -p 3210   # port 3100 was taken
```

## 3. Video project (`app/video/`)
```bash
cd app/video            # already set up: package.json, argo.config.mjs, playwright.config.ts
npm install             # @argo-video/cli + kokoro-js
npx playwright install chromium
```
`argo.config.mjs` settings:
- `baseURL: http://localhost:3210`
- video `1536x864` with `deviceScaleFactor: 2`, which gives larger, legible UI
- `captureMode: 'jpeg-stitch'`, chromium
- `cursorHighlight: { mode: 'click' }`
- export `outputWidth/Height: 1920x1080`, `crf: 18`
- `tts.defaultSpeed: 1.06`, voice `af_heart`

## 4. Two files per video
**`demos/<name>.scenes.json`** contains one entry per scene: `{ scene, text (English narration), overlay? }`.
- Total target: about **290 words ≈ 115 s**. Measure, don't guess: each scene's audio duration is in `.argo/<name>/scene-report.json`.
- Structure: problem (headline-card) → main action → Jev close-up → result → 2–3 strongest features → close (headline-card).

**`demos/<name>.demo.ts`** is the Playwright script. Copy `demos/fallback-host.demo.ts`. The pattern:
```ts
await page.goto('/<page>?demo=replay');
await narration.startRecording(page);
const cursor = await createHumanCursor(page, { seed: 'x', size: 28 });
narration.mark('problem');  await showOverlay(page, 'problem', narration.durationFor('problem'));
narration.mark('scan');     await cursor.click(page.getByRole('button', { name: /Start/ }));
                            await page.waitForTimeout(narration.durationFor('scan'));
narration.mark('detail');   await zoomTo(page, '#panel', { scale: 1.5, holdMs: narration.durationFor('detail') - 800, narration });
                            await page.waitForTimeout(narration.durationFor('detail'));
narration.mark('close');    await withOverlay(page, 'close', async () => { /* final clicks */ await page.waitForTimeout(narration.durationFor('close') - 1000); });
```
Gotchas found the hard way:
- **No overlays in `zoomTo` scenes**, because the zoom crops them.
- **The final card must use `withOverlay`.** `showOverlay` at the very end didn't render.
- Overlay placement `bottom-left` or `top-right`. Avoid `bottom-center`, which covers the content.
- Scroll panels into view inside scrollable columns with `el.scrollIntoView({behavior:'smooth'})`.
- Every scene must wait at least `narration.durationFor(scene)`, or the next clip starts late.

## 5. Render and check
```bash
npx argo pipeline <name>      # TTS (cached) → record → align → export, about 2.5 minutes
# output: video/videos/<name>.mp4 + .srt + .vtt ; per-scene timing is printed in the "Scene report"
```
Check before shipping:
- Extract frames with `ffmpeg -ss 36 -i videos/<name>.mp4 -frames:v 1 f.jpg` and look at them.
- Check audio with `ffmpeg -i ... -af volumedetect -f null -` (mean around -23 dB is fine).
- Check duration with `ffprobe`.

## 6. Ship
Copy `mp4`, `srt` and `vtt` into `demo-video/`, generate `script.md`, link everything from the README, then `git push` (use the HTTPS remote; SSH fails here).
