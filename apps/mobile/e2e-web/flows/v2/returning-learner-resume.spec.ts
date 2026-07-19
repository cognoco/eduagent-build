import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

test.use({ storageState: { cookies: [], origins: [] } });

test('WI-2234 returning learner: unfinished session resumes, exchanges, and returns to refreshed Mentor', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'v2-returning-learner',
    alias: 'wi2234-returning',
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });

  const unfinishedCard = page.getByTestId('now-card-unfinished_session');
  const dueReviewCard = page.getByTestId('now-card-retention_due');
  await expect(unfinishedCard).toBeVisible();
  await expect(dueReviewCard).toBeVisible();

  await pressableClick(unfinishedCard.getByTestId('now-card-continue'));
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 30_000 });

  const completedAssistantResponses = page.getByTestId(
    /^assistant-response-complete-/,
  );
  const completedResponsesBeforeExchange =
    await completedAssistantResponses.count();
  await fillTextInput(
    chatInput,
    'How did Roman roads help people exchange ideas?',
  );
  await pressableClick(page.getByTestId('send-button'));
  await expect
    .poll(async () => completedAssistantResponses.count(), { timeout: 60_000 })
    .toBeGreaterThan(completedResponsesBeforeExchange);
  await expect(
    completedAssistantResponses.nth(completedResponsesBeforeExchange),
  ).not.toHaveText(/^\s*$/);

  const refreshedNowFeed = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/v1/now?') &&
      response.url().includes('scope=self'),
  );
  await pressableClick(page.getByTestId('chat-shell-back'));
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  expect((await refreshedNowFeed).ok()).toBe(true);

  await expect(page.getByTestId('now-card-unfinished_session')).toBeVisible();
  await expect(page.getByTestId('now-card-retention_due')).toBeVisible();
});
