import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-16 parent drill-down reaches topic detail and unwinds cleanly', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const subjectId = seed.ids.subject1Id;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('gateway-check-progress').click();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId(`dashboard-child-${childProfileId}-primary`).click();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId(`subject-card-${subjectId}`).click();
  const topicLink = page.getByRole('link', {
    name: /view mathematics topic 1 details/i,
  });
  await expect(topicLink).toBeVisible({
    timeout: 30_000,
  });

  await topicLink.click();
  await expect(page.getByTestId('topic-detail-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.goBack();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await page.goBack();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('dashboard-back')).toBeEnabled();
  await page.getByTestId('dashboard-back').click();
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 30_000,
  });
});
