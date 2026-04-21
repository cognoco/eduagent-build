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
  const topicId = seed.ids.child1TopicId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('gateway-check-progress').click();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId(`dashboard-child-${childProfileId}`).click();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId(`subject-card-${subjectId}`).click();
  await expect(page.getByTestId('subject-topics-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId(`topic-card-${topicId}`).click();
  await expect(page.getByTestId('topic-detail-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.goBack();
  await expect(page.getByTestId('subject-topics-scroll')).toBeVisible({
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
