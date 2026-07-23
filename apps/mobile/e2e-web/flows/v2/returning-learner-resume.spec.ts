import { expect, test, type Request } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

test.use({ storageState: { cookies: [], origins: [] } });

test('WI-2234 returning learner: unfinished session resumes, exchanges, and returns to refreshed Mentor', async ({
  page,
}) => {
  const initialNowResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return (
      response.ok() &&
      request.method() === 'GET' &&
      url.pathname.endsWith('/v1/now') &&
      url.searchParams.get('scope') === 'self'
    );
  });
  await seedAndSignIn(page, {
    scenario: 'v2-returning-learner',
    alias: 'wi2234-returning',
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });
  const initialNowResponse = await initialNowResponsePromise;
  const initialNowFeed = (await initialNowResponse.json()) as {
    generatedAt?: unknown;
  };
  expect(typeof initialNowFeed.generatedAt).toBe('string');

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

  // Hold the self-scoped Now response caused by Back. Mentor must stay
  // unmounted until this exact response is allowed through; otherwise the
  // journey could pass by painting the warm pre-return cards first.
  let backStartedAt = Number.POSITIVE_INFINITY;
  let releasePostBackNowResponse!: () => void;
  let observePostBackNowRequest!: (request: Request) => void;
  const postBackNowRequest = new Promise<Request>((resolve) => {
    observePostBackNowRequest = resolve;
  });
  const allowPostBackNowResponse = new Promise<void>((resolve) => {
    releasePostBackNowResponse = resolve;
  });
  await page.route('**/v1/now?*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() !== 'GET' ||
      url.searchParams.get('scope') !== 'self' ||
      request.timing().startTime < backStartedAt
    ) {
      await route.continue();
      return;
    }

    backStartedAt = Number.POSITIVE_INFINITY;
    observePostBackNowRequest(request);
    await allowPostBackNowResponse;
    await route.continue();
  });

  backStartedAt = Date.now();
  await pressableClick(page.getByTestId('chat-shell-back'));
  const heldPostBackNowRequest = await postBackNowRequest;
  await expect(page.getByTestId('mentor-screen')).toHaveCount(0);
  const postBackNowResponsePromise = page.waitForResponse(
    (response) => response.request() === heldPostBackNowRequest,
  );
  releasePostBackNowResponse();
  const postBackNowResponse = await postBackNowResponsePromise;
  expect(postBackNowResponse.ok()).toBe(true);
  const postBackNowFeed = (await postBackNowResponse.json()) as {
    generatedAt?: unknown;
  };
  expect(typeof postBackNowFeed.generatedAt).toBe('string');
  expect(postBackNowFeed.generatedAt).not.toBe(initialNowFeed.generatedAt);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('now-card-unfinished_session')).toBeVisible();
  await expect(page.getByTestId('now-card-retention_due')).toBeVisible();
});
