import { randomUUID } from 'node:crypto';
import { expect, test, type APIResponse } from '@playwright/test';
import {
  createHeldNowRequestDiscriminator,
  fetchAndFulfillHeldNowResponse,
  isHeldNowCaptureCandidate,
  type HeldNowRequestDiscriminator,
  waitForHeldNowResponse,
} from '../../helpers/held-now-request';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';
import { observeSeededTranscript } from '../../helpers/transcript-observation';

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

  const transcriptObservationPromise = observeSeededTranscript(page, {
    sessionId: seeded.ids.sessionId,
    exchanges: [
      {
        role: 'user',
        content: 'Why did the Romans build so many roads?',
      },
      {
        role: 'assistant',
        content: 'They connected cities, trade, armies, and new ideas.',
      },
    ],
  });
  await pressableClick(unfinishedCard.getByTestId('now-card-continue'));
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => new URL(page.url()).searchParams.get('sessionId'))
    .toBe(seeded.ids.sessionId);
  await transcriptObservationPromise;
  await expect(
    page
      .getByTestId('chat-messages')
      .getByText('They connected cities, trade, armies, and new ideas.', {
        exact: true,
      }),
    '[transcript:hydration] API returned the exact persisted exchange, but the assistant message was not rendered',
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
  let observePostBackNowRequest!: (
    discriminator: HeldNowRequestDiscriminator,
  ) => void;
  const postBackNowRequest = new Promise<HeldNowRequestDiscriminator>(
    (resolve) => {
      observePostBackNowRequest = resolve;
    },
  );
  const allowPostBackNowResponse = new Promise<void>((resolve) => {
    releasePostBackNowResponse = resolve;
  });
  let observePostBackNowResponse!: (response: APIResponse) => void;
  let rejectPostBackNowResponse!: (error: unknown) => void;
  const postBackNowResponsePromise = new Promise<APIResponse>(
    (resolve, reject) => {
      observePostBackNowResponse = resolve;
      rejectPostBackNowResponse = reject;
    },
  );
  const postBackNowCorrelation = `wi-2234-${randomUUID()}`;
  await page.route('**/v1/now?*', async (route) => {
    const request = route.request();
    if (!isHeldNowCaptureCandidate(request, capturePostBackNowRequest)) {
      await route.continue();
      return;
    }

    capturePostBackNowRequest = false;
    const discriminator = createHeldNowRequestDiscriminator(
      request,
      postBackNowCorrelation,
    );
    observePostBackNowRequest(discriminator);
    await allowPostBackNowResponse;
    try {
      const response = await fetchAndFulfillHeldNowResponse(
        route,
        discriminator,
      );
      observePostBackNowResponse(response);
    } catch (error) {
      rejectPostBackNowResponse(error);
      throw error;
    }
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
  const boundedPostBackNowResponsePromise = waitForHeldNowResponse(
    postBackNowResponsePromise,
  );
  releasePostBackNowResponse();
  const postBackNowResponse = await boundedPostBackNowResponsePromise;
  expect(postBackNowResponse.url()).toBe(heldPostBackNowRequest.url);
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
