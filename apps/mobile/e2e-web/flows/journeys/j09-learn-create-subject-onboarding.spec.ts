import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-09 learner → Learn → create subject → interview → curriculum → start session', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'j09',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });

  // Empty learner home → create-subject screen
  await expect(page.getByTestId('home-empty-subjects')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByText('Add a subject').click();
  await expect(page.getByTestId('create-subject-name')).toBeVisible({
    timeout: 30_000,
  });

  // Type a focused subject name and submit — real API resolves it and creates
  // the focused-book path that proceeds directly to interview.
  await page
    .getByTestId('create-subject-name')
    .fill('Italian verb conjugation - essere and avere');
  await page.getByTestId('create-subject-submit').click();
  await expect(page.getByText(/shall we go with that/i)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /accept suggestion/i }).click();

  // Interview screen: wait for the chat input to appear
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });

  // First exchange — send a message and wait for the streamed response
  await page
    .getByTestId('chat-input')
    .fill('I want to learn about stars and the moon.');
  await page.getByTestId('send-button').click();
  await expect(page.getByTestId('thinking-bulb-animation')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });

  // Second exchange — after this the skip-interview-button becomes available
  // (it appears once exchangeCount >= 2 per the BUG-464 escape hatch)
  await page
    .getByTestId('chat-input')
    .fill('I find the phases of the moon interesting.');
  await page.getByTestId('send-button').click();
  await expect(page.getByTestId('thinking-bulb-animation')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });

  // Use the deterministic escape hatch: skip interview after 2+ exchanges.
  // This forces curriculum generation immediately rather than waiting on the
  // LLM to emit isComplete in the done envelope.
  await expect(page.getByTestId('skip-interview-button')).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId('skip-interview-button').click();

  // Some completions route through the explicit "view curriculum" handoff,
  // while others advance directly to the analogy-preference step.
  await expect(
    page
      .getByTestId('view-curriculum-button')
      .or(page.getByTestId('analogy-preference-title'))
  ).toBeVisible({ timeout: 30_000 });
  if ((await page.getByTestId('view-curriculum-button').count()) > 0) {
    await page.getByTestId('view-curriculum-button').click();
    await expect(page.getByTestId('analogy-preference-title')).toBeVisible({
      timeout: 30_000,
    });
  }

  // Analogy preference step — skip it
  await page.getByTestId('analogy-skip-button').click();

  // Accommodation step — skip it
  await expect(page.getByTestId('accommodation-skip')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('accommodation-skip').click();

  // Curriculum screen with start button
  await expect(page.getByTestId('start-learning-button')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('start-learning-button').click();

  // Session screen is open
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);
});
