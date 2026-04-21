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

  // Wait for the first option to render (real API generates questions)
  const quizScreen = page.getByTestId('quiz-play-screen');
  await expect(quizScreen.getByTestId('quiz-option-0')).toBeVisible({
    timeout: 30_000,
  });

  // Pick the first option — we don't know if it's correct, both outcomes
  // ("Correct" / "Not quite") are valid and lead to the same continue path
  await quizScreen.getByTestId('quiz-option-0').click();
  await expect(page.getByText(/Correct|Not quite/i)).toBeVisible({
    timeout: 30_000,
  });

  // "Tap anywhere to continue" appears shortly after the answer feedback
  await expect(page.getByText('Tap anywhere to continue')).toBeVisible({
    timeout: 30_000,
  });
  await quizScreen.click();

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
