import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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
  await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: path.join(shotDir, `${name}.png`),
    fullPage: true,
  });
}

test('single learner UX screenshot crawl', async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(shotDir, { recursive: true });
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await capture(page, '01-home');

  await page.goto('/practice', { waitUntil: 'commit' });
  await capture(page, '02-practice-entry');

  await page.goto('/home', { waitUntil: 'commit' });
  await page.goto('/create-subject', { waitUntil: 'commit' });
  await capture(page, '03-study-new-click');

  await page.goto('/library', { waitUntil: 'commit' });
  await expect(page.getByTestId(`shelf-row-header-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '04-library');

  await page.goto(`/shelf/${subjectId}`, { waitUntil: 'commit' });
  await capture(page, '05-subject-shelf');

  await page.goto('/progress', { waitUntil: 'commit' });
  await expect(page.getByText('My Learning Journey')).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, '06-progress-overview');

  await page.goto(`/progress/${subjectId}`, { waitUntil: 'commit' });
  await capture(page, '07-progress-subject');

  await page.goto(`/progress/${subjectId}/sessions`, { waitUntil: 'commit' });
  await capture(page, '08-progress-sessions');

  await page.goto('/quiz', { waitUntil: 'commit' });
  await capture(page, '09-quiz-home');

  await page.goto('/quiz/history', { waitUntil: 'commit' });
  await capture(page, '10-quiz-history');

  await page.goto('/practice', { waitUntil: 'commit' });
  await capture(page, '11-practice');

  await page.goto('/practice/assessment', { waitUntil: 'commit' });
  await capture(page, '12-assessment');

  await page.goto('/dictation', { waitUntil: 'commit' });
  await capture(page, '13-dictation');

  await page.goto('/homework/camera', { waitUntil: 'commit' });
  await capture(page, '14-homework-camera');

  await page.goto('/mentor-memory', { waitUntil: 'commit' });
  await capture(page, '15-mentor-memory');

  await page.goto('/own-learning', { waitUntil: 'commit' });
  await capture(page, '16-own-learning');

  await page.goto('/more', { waitUntil: 'commit' });
  await capture(page, '17-more');

  await page.goto('/more/account', { waitUntil: 'commit' });
  await capture(page, '18-more-account');

  await page.goto('/more/privacy', { waitUntil: 'commit' });
  await capture(page, '19-more-privacy');

  await page.goto('/more/notifications', { waitUntil: 'commit' });
  await capture(page, '20-more-notifications');

  await page.goto('/more/help', { waitUntil: 'commit' });
  await capture(page, '21-more-help');

  await page.goto('/profiles', { waitUntil: 'commit' });
  await capture(page, '22-profiles');

  await page.goto('/create-subject', { waitUntil: 'commit' });
  await capture(page, '23-create-subject');

  await page.goto('/subscription', { waitUntil: 'commit' });
  await capture(page, '24-subscription');
});
