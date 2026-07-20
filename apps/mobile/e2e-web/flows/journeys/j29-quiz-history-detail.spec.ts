import { expect, test } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-29 completed quiz history opens persisted graded detail [WI-2190]', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'quiz-completed-history-detail',
    alias: 'quiz-history-detail',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const roundId = seeded.ids.roundId;
  if (!roundId) {
    throw new Error(
      'quiz-completed-history-detail seed did not return roundId',
    );
  }

  await page.goto('/quiz/history', { waitUntil: 'commit' });
  await expect(page.getByTestId('quiz-history-screen')).toBeVisible({
    timeout: 60_000,
  });

  const historyRow = page.getByTestId(`quiz-history-row-${roundId}`);
  await expect(historyRow).toBeVisible();
  await expect(historyRow.getByText('Capitals', { exact: true })).toBeVisible();
  await pressableClick(historyRow);

  await expect(page.getByTestId('round-detail-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(new RegExp(`/quiz/${roundId}(?:\\?.*)?$`));

  const gradedQuestion = page.getByTestId('round-detail-question-0');
  await expect(gradedQuestion).toBeVisible();
  await expect(
    gradedQuestion.getByText('Your answer: Berlin', { exact: true }),
  ).toBeVisible();
  await expect(
    gradedQuestion.getByText('Correct answer: Paris', { exact: true }),
  ).toBeVisible();
  await expect(
    gradedQuestion.getByText('Wrong', { exact: true }),
  ).toBeVisible();
});
