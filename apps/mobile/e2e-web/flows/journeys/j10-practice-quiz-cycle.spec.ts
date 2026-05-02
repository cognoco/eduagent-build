import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-10 learner → Practice → Quiz → launch → play → results → home', async ({
  page,
}) => {
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

  // Launch capitals quiz — a general-knowledge activity always available
  await page.getByTestId('quiz-capitals').click();
  await expect(page.getByTestId('quiz-play-screen')).toBeVisible({
    timeout: 30_000,
  });

  const quizScreen = page.getByTestId('quiz-play-screen');

  // Answer every question in the round until the results screen appears
  for (let q = 0; q < 20; q++) {
    const resultsVisible = await page
      .getByTestId('quiz-results-screen')
      .isVisible()
      .catch(() => false);
    if (resultsVisible) break;

    await expect(quizScreen.getByTestId('quiz-option-0')).toBeVisible({
      timeout: 30_000,
    });

    await quizScreen.getByTestId('quiz-option-0').click();
    await expect(page.getByTestId('quiz-answer-feedback')).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText('Tap anywhere to continue')).toBeVisible({
      timeout: 30_000,
    });
    await quizScreen.click();
  }

  // Results screen
  await expect(page.getByTestId('quiz-results-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('quiz-results-done').click();

  // Back on practice screen, then navigate home
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('practice-back').click({ force: true });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
});
