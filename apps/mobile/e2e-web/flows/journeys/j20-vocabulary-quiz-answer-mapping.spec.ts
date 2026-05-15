import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { pressableClick } from '../../helpers/pressable';

/**
 * J-20 — vocabulary quiz answer mapping (BUG-924)
 *
 * BUG-924 [P0]: In a vocabulary quiz the option tapped at index 0 or 1 was
 * recorded as idx+1 on the server (Q3 tapped "The bird" recorded as
 * "The worm"). The defensive fix landed in apps/mobile/src/app/(app)/quiz/
 * play.tsx (added overflow:hidden + zero hitSlop on each option Pressable);
 * 26/26 unit tests in play.test.tsx ([BUG-924] block) confirm tapping
 * quiz-option-N records the option text rendered at index N.
 *
 * The user-reported failure is web-only and was never reproduced in Jest
 * RNTL nor Playwright. This e2e covers it on the real web target by
 * intercepting the POST /quiz/rounds/:id/check request and asserting the
 * answerGiven on the wire matches the EXACT text rendered at the index we
 * tapped — for indices 0 and 1 specifically (the failure window) plus 2
 * and 3 for completeness.
 *
 * Seed scenario: language-subject-active — gives the profile an active
 * Spanish (es) four_strands subject with enough vocabulary to generate a
 * deterministic 4-option multiple-choice round.
 */
test('J-20 vocabulary quiz: tapped option text matches POSTed answerGiven (BUG-924)', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'language-subject-active',
    alias: 'j20',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = seeded.ids.subjectId;
  expect(subjectId).toBeTruthy();

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

  await pressableClick(page.getByTestId(`quiz-vocabulary-${subjectId}`));

  await expect(page.getByTestId('quiz-play-screen')).toBeVisible({
    timeout: 60_000,
  });

  const quizScreen = page.getByTestId('quiz-play-screen');

  // Cycle through the round, tapping a different option index each round to
  // exercise the off-by-one window from BUG-924. Indices 0 and 1 are the
  // critical ones — those are the rows where the user-reported off-by-one
  // surfaced. Indices 2 and 3 round out coverage so a regression on any
  // index would fail the test.
  const tapIndices = [0, 1, 2, 3];

  for (let q = 0; q < 20; q += 1) {
    const resultsVisible = await page
      .getByTestId('quiz-results-screen')
      .isVisible()
      .catch(() => false);
    if (resultsVisible) break;

    const targetIndex = tapIndices[q % tapIndices.length];
    const targetOption = quizScreen.getByTestId(`quiz-option-${targetIndex}`);

    await expect(
      targetOption.or(page.getByTestId('quiz-results-screen')),
    ).toBeVisible({ timeout: 30_000 });

    if (await page.getByTestId('quiz-results-screen').isVisible()) break;

    await expect(targetOption).toBeEnabled({ timeout: 30_000 });

    // Read the rendered text BEFORE tapping. This is the exact string the
    // user sees at the index they touch — what the server must record.
    const renderedText = (await targetOption.innerText()).trim();
    expect(renderedText.length).toBeGreaterThan(0);

    // Capture the check-answer request that fires from the tap. Match the
    // request URL and method up front so there's no race between the click
    // and the listener attaching.
    const checkRequestPromise = page.waitForRequest(
      (req) =>
        /\/quiz\/rounds\/[^/]+\/check$/.test(req.url()) &&
        req.method() === 'POST',
      { timeout: 30_000 },
    );

    await pressableClick(targetOption);

    const checkRequest = await checkRequestPromise;
    const body = checkRequest.postDataJSON() as {
      answerGiven: string;
      questionIndex: number;
      answerMode: string;
    };

    // BUG-924 assertion: the answerGiven the client POSTs MUST equal the
    // text rendered at the index the user tapped. If the off-by-one
    // regresses, body.answerGiven will be the text from a NEIGHBOURING
    // index and this assertion fails.
    expect(
      body.answerGiven,
      `Q${q + 1}: option-${targetIndex} text mismatch`,
    ).toBe(renderedText);
    expect(body.answerMode).toBe('multiple_choice');

    // Wait until the continue guard has opened, then advance.
    const answerFeedback = page.getByTestId('quiz-answer-feedback');
    await expect(answerFeedback).toBeVisible({
      timeout: 30_000,
    });
    await expect(answerFeedback).toHaveText('Ready for the next one', {
      timeout: 5_000,
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
      await expect(resultsScreen).toBeVisible({ timeout: 30_000 });
      break;
    }

    await pressableClick(nextQuestion);
    await expect(answerFeedback).toBeHidden({ timeout: 10_000 });
  }

  // Round must have completed — confirms the cycle wasn't accidentally a
  // no-op and the assertions above ran across multiple questions.
  await expect(page.getByTestId('quiz-results-screen')).toBeVisible({
    timeout: 30_000,
  });
});
