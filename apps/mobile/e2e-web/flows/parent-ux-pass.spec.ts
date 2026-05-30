import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { readSeedData } from '../helpers/seed-data';

// Parent-persona screenshot crawl (ad-hoc dogfooding, not a CI gate).
// Soft captures: navigate each parent surface by URL and screenshot whatever
// renders — no hard testID assertions, so a single missing element never
// aborts the crawl. Deep child routes are reached by direct URL so the V1
// parent-home child-card selector cannot block the walk.

const shotDir = path.join(
  process.cwd(),
  'apps',
  'mobile',
  'e2e-web',
  'test-results',
  'parent-ux',
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
    // Wait for a TERMINAL state to render (content / empty / error), not the
    // transient spinner, so the screenshot reflects what the user ends up on.
    await page
      .locator(settleSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
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

test('parent UX screenshot crawl', async ({ page }) => {
  test.setTimeout(300_000);
  await mkdir(shotDir, { recursive: true });

  const seed = await readSeedData('owner-with-children');
  // Surface every available ID so a second pass can reach subject/topic/report
  // routes we don't yet have keys for.
  console.log(`PARENT_SEED_IDS=${JSON.stringify(seed.ids)}`);

  const child = seed.ids.child1ProfileId;
  const child2 = seed.ids.child2ProfileId;
  const session = seed.ids.session1Id;
  const subject = seed.ids.subject1Id ?? seed.ids.subjectId;
  const topic = seed.ids.child1TopicId ?? seed.ids.topicId;
  const reportId = seed.ids.reportId ?? seed.ids.child1ReportId;
  const weeklyReportId =
    seed.ids.weeklyReportId ?? seed.ids.child1WeeklyReportId;
  const recapId = seed.ids.recapId ?? seed.ids.child1RecapId;

  // Force the guardian ("Children") audience so the guardian surfaces (parent
  // home + recaps) are what we screenshot. The persisted mode defaults
  // non-deterministically across reseeds, so without this the crawl can land in
  // the parent's own "My Learning" study mode and /recaps redirects to /home.
  await page.goto('/home', { waitUntil: 'commit' }).catch(() => undefined);
  await page
    .waitForLoadState('networkidle', { timeout: 20_000 })
    .catch(() => undefined);
  const familyPill = page
    .locator('[data-testid="mode-switcher-family"]')
    .first();
  await familyPill
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  await familyPill.click({ timeout: 10_000 }).catch(() => undefined);
  // Wait for the mode switch to settle into guardian (Recaps tab appears).
  await page
    .locator('[data-testid="recaps-screen"], text=Recaps')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_500);

  // Settle on a terminal state for the two screens that caught a spinner/splash
  // in the first pass, and LOG which terminal state recaps reaches.
  await go(
    page,
    '/home',
    '01-parent-home',
    '[data-testid^="parent-home-child-card-"], [data-testid="learner-home-screen"]',
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
  ]) {
    const visible = await page
      .locator(`[data-testid="${id}"]`)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) console.log(`RECAPS_TERMINAL_STATE=${id}`);
  }
  const rowCount = await page
    .locator('[data-testid^="recap-row-"]')
    .count()
    .catch(() => 0);
  console.log(`RECAPS_ROW_COUNT=${rowCount}`);
  if (recapId) await go(page, `/recaps/${recapId}`, '03-recap-detail');
  await go(page, '/progress', '04-parent-progress');
  await go(page, '/more', '05-parent-more');

  if (child) {
    await go(page, `/child/${child}`, '06-child-detail');
    await go(page, `/child/${child}/curriculum`, '07-child-curriculum');
    await go(page, `/child/${child}/reports`, '08-child-reports');
    await go(page, `/child/${child}/mentor-memory`, '09-child-mentor-memory');
    if (subject)
      await go(
        page,
        `/child/${child}/subjects/${subject}`,
        '10-child-subject-detail',
      );
    if (topic)
      await go(page, `/child/${child}/topic/${topic}`, '11-child-topic-detail');
    if (session)
      await go(
        page,
        `/child/${child}/session/${session}`,
        '12-child-session-detail',
      );
    if (reportId)
      await go(
        page,
        `/child/${child}/report/${reportId}`,
        '13-child-report-detail',
      );
    if (weeklyReportId)
      await go(
        page,
        `/child/${child}/weekly-report/${weeklyReportId}`,
        '14-child-weekly-report',
      );
  }

  if (child2) await go(page, `/child/${child2}`, '15-second-child-detail');
});
