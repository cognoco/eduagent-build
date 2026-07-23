import { expect, test, type Request } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

test.use({ storageState: { cookies: [], origins: [] } });

test('WI-2234 returning learner: unfinished session resumes, exchanges, and returns to refreshed Mentor', async ({
  page,
}) => {
  const initialNowResponsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      const url = new URL(response.url());
      return (
        response.ok() &&
        request.method() === 'GET' &&
        url.pathname.endsWith('/v1/now') &&
        url.searchParams.get('scope') === 'self'
      );
    },
    { timeout: 60_000 },
  );
  const seeded = await seedAndSignIn(page, {
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
  await expect
    .poll(() => new URL(page.url()).searchParams.get('sessionId'))
    .toBe(seeded.ids.sessionId);
  await expect(
    page
      .getByTestId('chat-messages')
      .getByText('They connected cities, trade, armies, and new ideas.', {
        exact: true,
      }),
  ).toBeVisible();

  await fillTextInput(
    chatInput,
    'How did Roman roads help people exchange ideas?',
  );
  await pressableClick(page.getByTestId('send-button'));
  const exactLearnerMessage = page.getByTestId(/^message-bubble-user-/).filter({
    hasText: /^How did Roman roads help people exchange ideas\?$/,
  });
  await expect(exactLearnerMessage).toHaveCount(1);
  const completedReplyBelowExactMessage = exactLearnerMessage.locator(
    'xpath=following::*[starts-with(@data-testid, "assistant-response-complete-")][1]',
  );
  await expect(completedReplyBelowExactMessage).toBeVisible({
    timeout: 60_000,
  });
  await expect(completedReplyBelowExactMessage).not.toHaveText(/^\s*$/);

  // Hold the self-scoped Now response caused by Back. The Session route must
  // remain active until this exact response is allowed through; the tab
  // navigator keeps Mentor mounted underneath the pushed Session route.
  let capturePostBackNowRequest = false;
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
      !capturePostBackNowRequest
    ) {
      await route.continue();
      return;
    }

    capturePostBackNowRequest = false;
    observePostBackNowRequest(request);
    await allowPostBackNowResponse;
    await route.continue();
  });

  await pressableClick(page.getByTestId('chat-shell-back'), {
    beforeDispatch: () => {
      capturePostBackNowRequest = true;
      return () => {
        capturePostBackNowRequest = false;
      };
    },
  });
  const heldPostBackNowRequest = await postBackNowRequest;
  await expect(page).toHaveURL(/\/session(?:\?|$)/);
  await expect(page.getByTestId('session-screen')).toBeVisible();
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
  await expect(page).toHaveURL(/\/mentor(?:\?|$)/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('now-card-unfinished_session')).toBeVisible();
  await expect(page.getByTestId('now-card-retention_due')).toBeVisible();
});
