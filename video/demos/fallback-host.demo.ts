import { test, showOverlay, withOverlay, zoomTo, createHumanCursor } from '@argo-video/cli';
import type { Page } from '@playwright/test';

// Center-column panels live in a scrollable section: bring them into view smoothly.
const reveal = (page: Page, id: string) =>
  page.evaluate((sel) => document.getElementById(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), id);

test('fallback-host', async ({ page, narration }) => {
  test.setTimeout(240_000);
  await page.goto('/resy?demo=replay');
  await page.getByRole('button', { name: /Scan inbox/ }).waitFor();
  await narration.startRecording(page);
  const cursor = await createHumanCursor(page, { seed: 'fallback-host', size: 28 });

  // 1. Problem
  narration.mark('problem');
  await showOverlay(page, 'problem', narration.durationFor('problem'));

  // 2. Scan: Jev rebuilds the book (replayed real Jev responses, ~15s)
  narration.mark('scan');
  await cursor.click(page.getByRole('button', { name: /Scan inbox/ }));
  await page.waitForTimeout(narration.durationFor('scan'));
  await page.getByRole('button', { name: /Scan inbox/ }).waitFor({ timeout: 60_000 }); // run finished

  // 3. Jev panel close-up
  narration.mark('jev');
  await zoomTo(page, '#jev-panel', { scale: 1.6, holdMs: narration.durationFor('jev') - 800, narration });
  await page.waitForTimeout(narration.durationFor('jev'));

  // 4. Floor + conflicts
  narration.mark('floor');
  await zoomTo(page, '#floor', { scale: 1.45, holdMs: narration.durationFor('floor') * 0.55, narration });
  await page.waitForTimeout(narration.durationFor('floor') * 0.6);
  await cursor.moveTo(page.locator('#outreach li', { hasText: "Can't fit change" }).first(), { durationMs: 900 });
  await page.waitForTimeout(narration.durationFor('floor') * 0.4);

  // 5. Voice agent call
  narration.mark('voice');
  await cursor.click(page.getByRole('button', { name: /Minh confirms/ }));
  await zoomTo(page, '#voice', { scale: 1.5, holdMs: narration.durationFor('voice') - 1200, narration });
  await page.waitForTimeout(narration.durationFor('voice'));

  // 6. Recovery campaign
  narration.mark('campaign');
  await withOverlay(page, 'campaign', async () => {
    await cursor.click(page.getByRole('button', { name: /Launch recovery campaign/ }));
    await page.waitForTimeout(1500);
    await reveal(page, 'campaign');
    await page.waitForTimeout(narration.durationFor('campaign') * 0.5);
    await reveal(page, 'jev-panel');
    await page.waitForTimeout(narration.durationFor('campaign') * 0.5 - 1500);
  });

  // 7. Payments + door check
  narration.mark('payments');
  await withOverlay(page, 'payments', async () => {
    await reveal(page, 'payments');
    await page.waitForTimeout(800);
    await cursor.click(page.getByRole('button', { name: /Match Resy prepayments/ }));
    await page.waitForTimeout(narration.durationFor('payments') * 0.55);
    await cursor.click(page.getByPlaceholder('last 4 of card'));
    await page.getByPlaceholder('last 4 of card').pressSequentially('4242', { delay: 120 });
    await cursor.click(page.getByRole('button', { name: 'Verify' }));
    await page.waitForTimeout(narration.durationFor('payments') * 0.35);
  });

  // 8. Resy is back + backups, close
  narration.mark('close');
  await withOverlay(page, 'close', async () => {
    await reveal(page, 'resy-back');
    await page.waitForTimeout(700);
    await cursor.click(page.getByRole('button', { name: /Resy is back online/ }));
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('resy-back')?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    await page.waitForTimeout(narration.durationFor('close') - 1000);
  });
});
