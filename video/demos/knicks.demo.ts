import { test, showOverlay, withOverlay, zoomTo, createHumanCursor } from '@argo-video/cli';

// Records the REAL app live (production build). The only model call is Jev on /api/knicks/judge,
// which finishes during the 8.5 s opening scan.
test('knicks', async ({ page, narration }) => {
  test.setTimeout(240_000);
  await page.goto('/knicks');
  await page.locator('#boot').waitFor();
  await narration.startRecording(page);
  const cursor = await createHumanCursor(page, { seed: 'knicks', size: 28 });

  // 1. Problem (card over the app)
  narration.mark('problem');
  await showOverlay(page, 'problem', narration.durationFor('problem'));

  // 2. Opening scan: sources come online, map fills in with traffic + station load
  narration.mark('scan');
  await page.reload();
  await page.locator('#boot').waitFor();
  await page.waitForTimeout(narration.durationFor('scan'));
  await page.locator('#modes').waitFor({ timeout: 30_000 });

  // 3. Jev: signals list, scrolled to the Herald Sq rumor
  narration.mark('jev');
  await cursor.click(page.getByRole('button', { name: /⚠/ }));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#sheet div')].find((d) => d.textContent?.startsWith('📱 @bxdave'));
    el?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await zoomTo(page, '#sheet', { scale: 1.6, holdMs: narration.durationFor('jev') - 1200, narration });
  await page.waitForTimeout(narration.durationFor('jev'));

  // 4. Transit options for Brooklyn
  narration.mark('transit');
  await cursor.click(page.getByRole('button', { name: /⚠/ }));
  await page.waitForTimeout(800);
  await zoomTo(page, '#phone', { scale: 1.25, holdMs: narration.durationFor('transit') - 1500, narration });
  await page.waitForTimeout(narration.durationFor('transit'));

  // 5. Drive: congestion + 3 routes
  narration.mark('drive');
  await cursor.click(page.getByRole('button', { name: /Drive/ }));
  await page.waitForTimeout(narration.durationFor('drive'));

  // 6. Self-reinforcing load: fast-forward the crowd on transit
  narration.mark('herd');
  await cursor.click(page.getByRole('button', { name: /Transit/ }));
  const step = narration.durationFor('herd') / 4;
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(step * 0.7);
    await cursor.click(page.getByRole('button', { name: /\+8m/ }));
  }
  await page.waitForTimeout(step * 1.9);

  // 7. Navigation
  narration.mark('nav');
  await cursor.click(page.getByRole('button', { name: /^Go/ }));
  await page.waitForTimeout(narration.durationFor('nav'));

  // 8. Close
  narration.mark('close');
  await withOverlay(page, 'close', async () => {
    await page.waitForTimeout(narration.durationFor('close') - 500);
  });
});
