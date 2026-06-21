import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  dismissPostApprovalIfVisible,
  waitForScreenDismissingPostApproval,
} from '../../helpers/post-approval';
import { readSeedData } from '../../helpers/seed-data';

const shotDir = path.join(
  process.cwd(),
  'apps',
  'mobile',
  'e2e-web',
  'test-results',
  'manual-learner-ux',
);

async function capture(page: Page, name: string): Promise<void> {
  await dismissPostApprovalIfVisible(page);
  await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: path.join(shotDir, `${name}.png`),
    fullPage: true,
  });
}

async function gotoScreen(
  page: Page,
  url: string,
  targetTestId: string,
): Promise<void> {
  await page.goto(url, { waitUntil: 'commit' });
  await waitForScreenDismissingPostApproval(page, targetTestId);
}

test('single learner UX screenshot crawl', async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(shotDir, { recursive: true });
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await gotoScreen(page, '/mentor', 'mentor-screen');
  await capture(page, '01-home');

  await gotoScreen(page, '/practice', 'practice-screen');
  await capture(page, '02-practice-entry');

  await gotoScreen(page, '/mentor', 'mentor-screen');
  await gotoScreen(page, '/create-subject', 'create-subject-name');
  await capture(page, '03-study-new-click');

  await page.goto('/library', { waitUntil: 'commit' });
  // Wait for the subjects query + /library/retention to settle before asserting.
  // Without this, the shelf-row testID poll can race the first paint on slow CI.
  await page.waitForLoadState('networkidle');
  await waitForScreenDismissingPostApproval(
    page,
    `shelf-row-header-${subjectId}`,
    30_000,
  );
  await capture(page, '04-library');

  await gotoScreen(page, `/shelf/${subjectId}`, 'shelf-screen');
  await capture(page, '05-subject-shelf');

  await gotoScreen(page, '/progress', 'progress-screen');
  await capture(page, '06-progress-overview');

  await page.goto(`/progress/${subjectId}`, { waitUntil: 'commit' });
  await waitForScreenDismissingPostApproval(
    page,
    'progress-subject-bar',
    30_000,
  );
  await capture(page, '07-progress-subject');

  await page.goto(`/progress/${subjectId}/sessions`, { waitUntil: 'commit' });
  await expect(
    page
      .getByTestId('subject-sessions-empty')
      .or(page.getByTestId('subject-sessions-error'))
      .or(page.locator('[data-testid^="subject-session-"]').first()),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, '08-progress-sessions');

  await gotoScreen(page, '/quiz', 'quiz-index-screen');
  await capture(page, '09-quiz-home');

  await page.goto('/quiz/history', { waitUntil: 'commit' });
  await expect(
    page
      .getByTestId('quiz-history-screen')
      .or(page.getByTestId('quiz-history-empty'))
      .or(page.getByTestId('quiz-history-error')),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, '10-quiz-history');

  await gotoScreen(page, '/practice', 'practice-screen');
  await capture(page, '11-practice');

  await gotoScreen(
    page,
    '/practice/assessment-picker',
    'assessment-picker-screen',
  );
  await capture(page, '12-assessment');

  await gotoScreen(page, '/dictation', 'dictation-choice-screen');
  await capture(page, '13-dictation');

  await page.goto('/homework/camera', { waitUntil: 'commit' });
  await expect(
    page
      .getByTestId('camera-view')
      .or(page.getByTestId('manual-entry-button'))
      .or(page.getByTestId('grant-permission-button'))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, '14-homework-camera');

  await page.goto('/mentor-memory', { waitUntil: 'commit' });
  await expect(page.getByText('Mentor memory')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '15-mentor-memory');

  await gotoScreen(page, '/own-learning', 'learner-screen');
  await capture(page, '16-own-learning');

  await page.goto('/more', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-row-account')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '17-more');

  await page.goto('/more/account', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-account-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '18-more-account');

  await page.goto('/more/privacy', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-privacy-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '19-more-privacy');

  await page.goto('/more/notifications', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-notifications-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '20-more-notifications');

  await page.goto('/more/help', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-help-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '21-more-help');

  await gotoScreen(page, '/profiles', 'profiles-screen');
  await capture(page, '22-profiles');

  await gotoScreen(page, '/create-subject', 'create-subject-name');
  await capture(page, '23-create-subject');

  await gotoScreen(page, '/subscription', 'subscription-screen');
  await capture(page, '24-subscription');
});
