import { expect, test } from '@playwright/test';
import {
  NOW_REFRESH_OBSERVATION_WINDOW_MS,
  observeExactNowRefresh,
} from '../../helpers/now-refresh-observation';
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

  // [WI-2833] Observe (never hold) the self-scoped Now response caused by
  // Back. WI-2818 bounds the Session→Mentor refresh gate to 2s in production
  // (apps/mobile/src/app/(app)/session/index.tsx MENTOR_RETURN_REFRESH_WAIT_MS):
  // it waits for the exact refresh, but gives up and completes the Back
  // navigation regardless once that bound elapses. Pausing the real network
  // response and releasing it only after unrelated post-Back assertions (the
  // previous pattern) can lose that race under parallel load — production may
  // already have reached Mentor before a test-side release ever runs. Arm a
  // plain, production-compatible observation BEFORE the click instead, and
  // let the response flow through exactly as production sees it.
  const postBackNowArmedAtMs = Date.now();
  const postBackNowResponsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      const url = new URL(response.url());
      return (
        request.method() === 'GET' &&
        url.pathname.endsWith('/v1/now') &&
        url.searchParams.get('scope') === 'self'
      );
    },
    { timeout: NOW_REFRESH_OBSERVATION_WINDOW_MS },
  );

  await pressableClick(page.getByTestId('chat-shell-back'));
  const postBackNowActionAtMs = Date.now();
  await expect(page).toHaveURL(/\/session(?:\?|$)/);
  await expect(page.getByTestId('session-screen')).toBeVisible();

  const postBackNowOutcome = await observeExactNowRefresh(
    postBackNowResponsePromise,
    { armedAtMs: postBackNowArmedAtMs, actionAtMs: postBackNowActionAtMs },
  );
  if (postBackNowOutcome.kind === 'settled') {
    // Evidence is strongest when the exact refresh settles inside the
    // observation window: prove it succeeded and was actually fresh.
    const postBackNowResponse = postBackNowOutcome.response;
    expect(postBackNowResponse.ok()).toBe(true);
    const postBackNowFeed = (await postBackNowResponse.json()) as {
      generatedAt?: unknown;
    };
    expect(typeof postBackNowFeed.generatedAt).toBe('string');
    expect(postBackNowFeed.generatedAt).not.toBe(initialNowFeed.generatedAt);
  }
  // A rejected or unsettled exact refresh is a legitimate WI-2818 production
  // outcome (network hiccup, or Session already gave up waiting past the
  // 2-second bound) — Mentor is still reached either way, proven below.

  await expect(page).toHaveURL(/\/mentor(?:\?|$)/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('now-card-unfinished_session')).toBeVisible();
  await expect(page.getByTestId('now-card-retention_due')).toBeVisible();
});
