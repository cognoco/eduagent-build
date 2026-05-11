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
  const sessionId = seed.ids.session1Id;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId(`parent-home-check-child-${childProfileId}`).click();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId(`subject-card-${subjectId}`).click();
  await page
    .getByRole('link', { name: /view mathematics topic 1 details/i })
    .click();
  const topicDetail = page.getByTestId('topic-detail-screen');
  await expect(
    topicDetail.getByTestId(`session-card-${sessionId}`),
  ).toBeVisible({
    timeout: 30_000,
  });

  await topicDetail.getByTestId(`session-card-${sessionId}`).click();
  const copyConversation = page.getByRole('button', {
    name: /copy conversation/i,
  });
  await expect(copyConversation).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('narrative-unavailable')).toHaveCount(0);

  await copyConversation.click();
  await expect(page.getByTestId('session-recap-copy-prompt-toast')).toBeVisible(
    { timeout: 30_000 },
  );
});
