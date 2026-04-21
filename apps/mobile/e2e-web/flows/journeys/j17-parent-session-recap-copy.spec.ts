import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-17 parent opens a session recap and copies the conversation prompt', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const subjectId = seed.ids.subject1Id;
  const topicId = seed.ids.child1TopicId;
  const sessionId = seed.ids.session1Id;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('gateway-check-progress').click();
  await page.getByTestId(`dashboard-child-${childProfileId}`).click();
  await page.getByTestId(`subject-card-${subjectId}`).click();
  await page.getByTestId(`topic-card-${topicId}`).click();
  const topicDetail = page.getByTestId('topic-detail-screen');
  await expect(
    topicDetail.getByTestId(`session-card-${sessionId}`)
  ).toBeVisible({
    timeout: 30_000,
  });

  await topicDetail.getByTestId(`session-card-${sessionId}`).click();
  await expect(page.getByTestId('copy-conversation-prompt')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('narrative-unavailable')).toHaveCount(0);

  await page.getByTestId('copy-conversation-prompt').click();
  await expect(page.getByText(/copied/i)).toBeVisible({ timeout: 30_000 });
});
