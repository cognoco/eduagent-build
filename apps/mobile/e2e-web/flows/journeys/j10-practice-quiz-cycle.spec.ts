import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { pressableClick } from '../../helpers/pressable';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-10 learner → Practice → Quiz → launch → play → results → home', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(page.getByTestId('home-action-practice'));
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId('practice-quiz'));
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });

  // Launch capitals quiz — a general-knowledge activity always available
  await pressableClick(page.getByTestId('quiz-capitals'));
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

    const firstOption = quizScreen.getByTestId('quiz-option-0');
    await expect(
      firstOption.or(page.getByTestId('quiz-results-screen')),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => {
        const results = document.querySelector(
          '[data-testid="quiz-results-screen"]',
        );
        const option = document.querySelector(
          '[data-testid="quiz-play-screen"] [data-testid="quiz-option-0"]',
        );
        const isVisible = (element: Element | null) => {
          if (!element) return false;
          const style = window.getComputedStyle(element);
          return (
            element.getClientRects().length > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        };

        return (
          isVisible(results) ||
          (isVisible(option) &&
            !option.hasAttribute('disabled') &&
            option.getAttribute('aria-disabled') !== 'true')
        );
      },
      null,
      { timeout: 30_000 },
    );

    if (await page.getByTestId('quiz-results-screen').isVisible()) break;

    await expect(firstOption).toBeEnabled({
      timeout: 30_000,
    });

    await pressableClick(firstOption);
    await expect(page.getByTestId('quiz-answer-feedback')).toBeVisible({
      timeout: 30_000,
    });

    const nextQuestion = page.getByTestId('quiz-next-question');
    const seeResults = page.getByTestId('quiz-final-see-results');
    const resultsScreen = page.getByTestId('quiz-results-screen');

    await expect(nextQuestion.or(seeResults).or(resultsScreen)).toBeVisible({
      timeout: 30_000,
    });

    if (await resultsScreen.isVisible().catch(() => false)) break;
    if (await seeResults.isVisible().catch(() => false)) {
      await pressableClick(seeResults);
      continue;
    }
    if (await nextQuestion.isVisible().catch(() => false)) {
      await pressableClick(nextQuestion);
      continue;
    }

    await pressableClick(quizScreen);
  }

  // Results screen
  await expect(page.getByTestId('quiz-results-screen')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('quiz-results-done'));

  // Back on practice screen, then navigate home
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('practice-back'));
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
});
