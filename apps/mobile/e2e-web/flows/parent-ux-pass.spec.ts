import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { readSeedData } from '../helpers/seed-data';

// Parent-persona screenshot crawl (ad-hoc dogfooding, not a CI gate).
// Focused second pass: capture the GUARDIAN surfaces that the first pass either
// caught mid-spinner (recaps), mid-splash (parent home), or skipped due to a
// seed-key mismatch (subject detail). Writes to a dir OUTSIDE Playwright's
// outputDir so screenshots survive across runs (outputDir is wiped each run).

const shotDir = path.join(
  process.cwd(),
  'apps',
  'mobile',
  'e2e-web',
  'parent-ux-shots',
);

async function capture(
  page: Page,
  name: string,
  settleSelector?: string,
): Promise<void> {
  await page
    .waitForLoadState('networkidle', { timeout: 20_000 })
    .catch(() => undefined);
  if (settleSelector) {
    await page
      .locator(settleSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(1_200);
  await page
    .screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
    .catch(() => undefined);
}

async function go(
  page: Page,
  url: string,
  name: string,
  settleSelector?: string,
): Promise<void> {
  await page.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
  await capture(page, name, settleSelector);
}

test('parent guardian surfaces', async ({ page }) => {
  test.setTimeout(280_000);
  await mkdir(shotDir, { recursive: true });

  const seed = await readSeedData('owner-with-children');
  console.log(`PARENT_SEED_IDS=${JSON.stringify(seed.ids)}`);

  const child = seed.ids.child1ProfileId;
  const subject = seed.ids.subject1Id ?? seed.ids.subjectId;

  // Force guardian ("Children") audience. Persisted mode defaults
  // non-deterministically across reseeds; in study mode /recaps redirects to
  // /home, so without this we never see the guardian recaps surface.
  await page.goto('/home', { waitUntil: 'commit' }).catch(() => undefined);
  await page
    .waitForLoadState('networkidle', { timeout: 20_000 })
    .catch(() => undefined);
  const familyPill = page
    .locator('[data-testid="mode-switcher-family"]')
    .first();
  await familyPill
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);
  await familyPill.click({ timeout: 8_000 }).catch(() => undefined);
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(2_000);

  await go(
    page,
    '/home',
    '01-parent-home',
    '[data-testid^="parent-home-child-card-"]',
  );

  await go(
    page,
    '/recaps',
    '02-recaps-list',
    '[data-testid="recaps-empty"], [data-testid^="recap-row-"], [data-testid="recaps-error"], [data-testid="recaps-timeout-retry"]',
  );
  for (const id of [
    'recaps-empty',
    'recaps-error',
    'recaps-timeout-retry',
    'recaps-loading',
    'recaps-screen',
  ]) {
    const visible = await page
      .locator(`[data-testid="${id}"]`)
      .first()
      .isVisible()
      .catch(() => false);
    console.log(`RECAPS_STATE ${id}=${visible}`);
  }
  const rowCount = await page
    .locator('[data-testid^="recap-row-"]')
    .count()
    .catch(() => 0);
  console.log(`RECAPS_ROW_COUNT=${rowCount}`);

  if (child && subject) {
    await go(
      page,
      `/child/${child}/subjects/${subject}`,
      '10-child-subject-detail',
    );
  }
});
