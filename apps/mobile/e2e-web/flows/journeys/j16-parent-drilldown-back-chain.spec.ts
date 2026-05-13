import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
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
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId(`subject-card-${subjectId}`));
  const topicLink = page.getByTestId(`accordion-topic-${topicId}`);
  await expect(topicLink).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(topicLink);
  await expect(page.getByTestId('topic-detail-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 30_000,
  });
});
