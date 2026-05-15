import { expect, test } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-22 recall-test direct route opens recall and remediation surfaces', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'failed-recall-3x',
    alias: 'retention-recall',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = seed.ids.subjectId;
  const topicId = seed.ids.topicId;
  if (!subjectId || !topicId) {
    throw new Error('failed-recall-3x seed did not return subjectId/topicId');
  }

  await page.goto(
    `/topic/recall-test?topicId=${topicId}&subjectId=${subjectId}`,
    { waitUntil: 'commit' },
  );

  await expect(page.getByTestId('recall-test-screen')).toBeVisible({
    timeout: 60_000,
  });
  await pressableClick(page.getByTestId('recall-dont-remember-button'));
  await expect(page.getByTestId('remediation-card')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('relearn-topic-button')).toBeVisible();
});

test('J-22 relearn and progress retention direct routes show review surfaces', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'retention-due',
    alias: 'retention-due',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = seed.ids.subjectId;
  if (!subjectId) {
    throw new Error('retention-due seed did not return subjectId');
  }

  await page.goto('/topic/relearn', { waitUntil: 'commit' });
  await expect(
    page
      .getByTestId('relearn-subjects-phase')
      .or(page.getByTestId('relearn-topics-phase')),
  ).toBeVisible({ timeout: 60_000 });

  await page.goto(`/progress/${subjectId}`, { waitUntil: 'commit' });
  await expect(page.getByTestId('progress-subject-retention-card')).toBeVisible(
    { timeout: 60_000 },
  );
});
