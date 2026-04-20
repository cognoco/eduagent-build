import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { mockJsonForever } from '../../helpers/mock-api';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-10 learner → Practice → Quiz → launch → play → results → home', async ({
  page,
}) => {
  const roundId = '33333333-3333-4333-8333-333333333333';
  const prefetchedRoundId = '33333333-3333-4333-8333-444444444444';
  const topicId = '33333333-3333-4333-8333-555555555555';

  await mockJsonForever(page, {
    method: 'POST',
    pathname: '/v1/quiz/rounds',
    response: {
      body: {
        id: roundId,
        activityType: 'capitals',
        theme: 'World capitals warm-up',
        total: 1,
        questions: [
          {
            type: 'capitals',
            country: 'Norway',
            options: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger'],
            funFact: 'Oslo sits at the top of the Oslofjord.',
            isLibraryItem: false,
            topicId,
          },
        ],
      },
    },
  });
  await mockJsonForever(page, {
    method: 'POST',
    pathname: '/v1/quiz/rounds/prefetch',
    response: {
      body: { id: prefetchedRoundId },
    },
  });
  await mockJsonForever(page, {
    method: 'POST',
    pathname: new RegExp(`/v1/quiz/rounds/${roundId}/check$`),
    response: {
      body: { correct: true },
    },
  });
  await mockJsonForever(page, {
    method: 'POST',
    pathname: new RegExp(`/v1/quiz/rounds/${roundId}/complete$`),
    response: {
      body: {
        score: 1,
        total: 1,
        xpEarned: 10,
        celebrationTier: 'perfect',
        droppedResults: 0,
        questionResults: [
          {
            questionIndex: 0,
            correct: true,
            correctAnswer: 'Oslo',
            answerGiven: 'Oslo',
          },
        ],
      },
    },
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('intent-practice').click();
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('practice-quiz').click();
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('quiz-capitals').click();
  await expect(page.getByTestId('quiz-launch-loading')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('quiz-play-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('quiz-option-0').click();
  await page.waitForTimeout(300);
  await page.getByTestId('quiz-play-screen').click({
    position: { x: 200, y: 300 },
  });

  await expect(page.getByTestId('quiz-results-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('quiz-results-done').click();
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('practice-back').click();
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
});
