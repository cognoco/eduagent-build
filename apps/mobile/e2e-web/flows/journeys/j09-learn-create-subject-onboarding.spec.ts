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

  // Learn intent → create-subject screen (no subjects → auto-redirect OR intent tap)
  await page.getByTestId('intent-learn').click();
  await expect(page.getByTestId('create-subject-name')).toBeVisible({
    timeout: 30_000,
  });

  // Type the subject name and submit — real API resolves it and creates the subject
  await page.getByTestId('create-subject-name').fill('Astronomy');
  await page.getByTestId('create-subject-submit').click();

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

  // "Let's Go" / "view-curriculum-button" appears when interviewComplete is set
  await expect(page.getByTestId('view-curriculum-button')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('view-curriculum-button').click();

  // Analogy preference step — skip it
  await expect(page.getByTestId('analogy-preference-title')).toBeVisible({
    timeout: 30_000,
  });
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
