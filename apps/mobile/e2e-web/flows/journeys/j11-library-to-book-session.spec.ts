import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

test('J-11 learner → Library → shelf → book → start learning', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'onboarding-complete',
    alias: 'j11',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(page.getByTestId('tab-library'));
  await expect(page.getByTestId(`shelf-row-header-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId(`shelf-row-header-${subjectId}`));
  await expect(page.getByTestId('shelf-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.locator('[data-testid^="book-card-"]').first());
  await expect(page.getByTestId('book-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId('book-start-learning'));
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chat-input')).toBeEditable({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);

  await fillTextInput(
    page.getByTestId('chat-input'),
    'Can you explain the first idea in simple words?',
  );
  await pressableClick(page.getByTestId('send-button'));
  await expect(page.getByTestId('thinking-bulb-animation')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByText('Session screen crashed')).toBeHidden();
  await expect(page.getByTestId('chat-input')).toBeEditable({
    timeout: 30_000,
  });

  await fillTextInput(
    page.getByTestId('chat-input'),
    'Can you show me an example?',
  );
  await expect(page.getByTestId('send-button')).toBeEnabled({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('send-button'));
  await page
    .getByTestId('thinking-bulb-animation')
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {
      // Fast responses can finish before Playwright observes the spinner.
    });
  await expect(page.getByTestId('thinking-bulb-animation')).toBeHidden({
    timeout: 60_000,
  });

  await expect(page.getByText('Session screen crashed')).toBeHidden();
  await expect(page.getByTestId('quick-chip-explain_differently')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator('[data-testid^="message-feedback-helpful-"]').first(),
  ).toBeVisible({ timeout: 30_000 });
});
