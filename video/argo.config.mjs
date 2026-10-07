import { defineConfig } from '@argo-video/cli';

// Records the REAL app (production build) in ?demo=replay mode:
// every Jev/LLM response was captured live once and is replayed so takes are repeatable.
export default defineConfig({
  baseURL: process.env.BASE_URL || 'http://localhost:3210',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: { defaultVoice: 'af_heart', defaultSpeed: 1.06 },
  video: {
    width: 1536,
    height: 864,
    fps: 30,
    browser: 'chromium',
    captureMode: 'jpeg-stitch',
    deviceScaleFactor: 2,
    cursorHighlight: { mode: 'click' },
  },
  export: {
    preset: 'slow',
    crf: 18,
    outputWidth: 1920,
    outputHeight: 1080,
    speedRamp: { gapSpeed: 2.0 },
  },
  overlays: { autoBackground: true },
});
