/**
 * J-26 (QUIZ-02 / QUIZ-16): Quiz loading timeout/retry + discovery-card routing
 *
 * Deterministic Chrome coverage for two P0 quiz surfaces that otherwise have no
 * browser-level evidence (flow-revision-plan-2026-06-17 QUIZ-02 / QUIZ-16):
 *
 *   QUIZ-02 — quiz/launch.tsx round-loading recovery. POST /v1/quiz/rounds is
 *     stalled indefinitely via page.route(). A Playwright fake clock (installed
 *     AFTER sign-in, BEFORE the launch navigation — sign-in itself needs real
 *     timers) drives the screen's own setTimeout watchdogs:
 *       - quiz-launch-loading + rotating loading copy while pending,
 *       - quiz-launch-timed-out soft hint at 20s,
 *       - quiz-launch-error-fallback hard panel at 30s (ROUND_GENERATION_TIMEOUT_MS),
 *       - quiz-launch-retry re-arms the watchdog so a SECOND stalled attempt
 *         times out again (regression guard for BUG-271: the first fire must not
 *         latch).
 *
 *   QUIZ-16 — LearnerScreen quiz-discovery coaching card. GET /v1/coaching-card
 *     is stubbed to force a quiz_discovery card; tapping home-coach-band-continue
 *     must (a) POST /v1/quiz/missed-items/mark-surfaced with the card's
 *     activityType, and (b) route non-vocabulary cards (capitals/guess_who) to
 *     /quiz/launch carrying activityType, while vocabulary intentionally routes
 *     to the /quiz picker (it needs a language subject the card doesn't carry).
 *
 * The later-phases Playwright project regex (journeys/(j08|j09|j[1-9][0-9])-)
 * matches this file with no project storageState, so each test self-seeds via
 * seedAndSignIn (same pattern as j26-in-chat-quota-card.spec.ts).
 */

import { expect, test, type Page, type Route } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

const QUIZ_ROUNDS_GLOB = '**/v1/quiz/rounds**';
const COACHING_CARD_GLOB = '**/v1/coaching-card**';
const MARK_SURFACED_GLOB = '**/v1/quiz/missed-items/mark-surfaced**';

const TEST_UUID = '11111111-1111-4111-8111-111111111111';

type DiscoveryActivityType = 'capitals' | 'vocabulary' | 'guess_who';

/**
 * Stub GET /v1/coaching-card to return a forced quiz_discovery card so the
 * LearnerScreen coach band renders the discovery branch deterministically (no
 * quiz_discovery seed scenario exists server-side).
 */
async function stubQuizDiscoveryCard(
  page: Page,
  activityType: DiscoveryActivityType,
): Promise<void> {
  await page.route(COACHING_CARD_GLOB, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coldStart: false,
        card: {
          id: TEST_UUID,
          profileId: TEST_UUID,
          type: 'quiz_discovery',
          title: 'Try a quick capitals round',
          body: 'You missed a few — want another go?',
          priority: 5,
          expiresAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          activityType,
          missedItemCount: 3,
        },
        fallback: null,
      }),
    });
  });
}

test.describe('[QUIZ-02] quiz launch loading timeout + retry', () => {
  test('stalled round generation shows loading, soft timeout (20s), then hard fallback (30s)', async ({
    page,
  }) => {
    // Stall the round POST forever so the launch screen stays pending and its
    // own 20s/30s watchdogs fire against the fake clock.
    await page.route(QUIZ_ROUNDS_GLOB, () => {
      // Intentionally never continue/fulfill — keeps generateRound.isPending
      // true so both timeout effects stay armed.
    });

    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 'j26-quiz02-fallback',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });
    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // Install the fake clock AFTER sign-in (which needs real timers/network)
    // and BEFORE the launch navigation so the screen's setTimeout(20_000) and
    // setTimeout(30_000) run against the controlled clock.
    await page.clock.install({ time: Date.now() });
    await page.goto('/quiz/launch?activityType=capitals', {
      waitUntil: 'commit',
    });

    // Loading state renders while the round POST is stalled.
    await expect(page.getByTestId('quiz-launch-loading')).toBeVisible({
      timeout: 30_000,
    });
    // Static heading + the rotating loading copy line are present. The clock
    // is frozen, so the rotation stays at index 0 ("Shuffling questions...") —
    // asserting that exact string proves the rotating-copy element rendered,
    // not just the static heading.
    await expect(page.getByText('Building your round')).toBeVisible();
    await expect(page.getByText('Shuffling questions...')).toBeVisible();

    // Cross the 20s soft-timeout boundary → "taking longer" hint appears.
    await page.clock.fastForward(20_500);
    await expect(page.getByTestId('quiz-launch-timed-out')).toBeVisible({
      timeout: 10_000,
    });

    // Cross the 30s hard-timeout boundary → full error fallback panel + retry.
    await page.clock.fastForward(11_000);
    await expect(page.getByTestId('quiz-launch-error-fallback')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('quiz-launch-retry')).toBeVisible();
    // The soft loading state must be gone once the hard panel takes over.
    await expect(page.getByTestId('quiz-launch-loading')).not.toBeVisible();
  });

  test('retry re-arms the hard-timeout watchdog so a second stalled attempt times out again [BUG-271]', async ({
    page,
  }) => {
    // Keep the round POST stalled for BOTH the initial attempt and the retry,
    // so the only thing that can make the fallback reappear is the watchdog
    // re-arming (regression guard: the first hard-timeout fire must not latch).
    await page.route(QUIZ_ROUNDS_GLOB, () => {
      // never resolve
    });

    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 'j26-quiz02-retry',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });
    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    await page.clock.install({ time: Date.now() });
    await page.goto('/quiz/launch?activityType=capitals', {
      waitUntil: 'commit',
    });

    await expect(page.getByTestId('quiz-launch-loading')).toBeVisible({
      timeout: 30_000,
    });

    // First stall → cross 30s → hard fallback.
    await page.clock.fastForward(31_000);
    await expect(page.getByTestId('quiz-launch-error-fallback')).toBeVisible({
      timeout: 10_000,
    });

    // Retry: clears hardTimedOut and bumps hardTimeoutAttempt, re-firing the
    // (still-stalled) round POST and re-arming the watchdog.
    await pressableClick(page.getByTestId('quiz-launch-retry'));

    // The fallback clears and we return to the loading state.
    await expect(page.getByTestId('quiz-launch-loading')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId('quiz-launch-error-fallback'),
    ).not.toBeVisible();

    // Cross 30s again → the SECOND stalled attempt must time out, proving the
    // watchdog re-armed rather than latching on the first fire.
    await page.clock.fastForward(31_000);
    await expect(page.getByTestId('quiz-launch-error-fallback')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('quiz-launch-retry')).toBeVisible();
  });
});

test.describe('[QUIZ-16] quiz-discovery coaching card routing', () => {
  test('non-vocabulary (capitals) card routes to /quiz/launch and POSTs mark-surfaced with activityType', async ({
    page,
  }) => {
    await stubQuizDiscoveryCard(page, 'capitals');

    // Capture the mark-surfaced POST body, then fulfill it so the fire-and-forget
    // mutation resolves cleanly.
    let markSurfacedBody: { activityType?: string } | null = null;
    await page.route(MARK_SURFACED_GLOB, async (route: Route) => {
      if (route.request().method() === 'POST') {
        markSurfacedBody = route.request().postDataJSON() as {
          activityType?: string;
        };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ markedCount: 1 }),
      });
    });

    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 'j26-quiz16-capitals',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });
    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // The forced quiz_discovery card renders the coach band.
    await expect(page.getByTestId('home-coach-band-continue')).toBeVisible({
      timeout: 30_000,
    });
    await pressableClick(page.getByTestId('home-coach-band-continue'));

    // Non-vocabulary → /quiz/launch carrying the card's activityType.
    await expect(page).toHaveURL(/\/quiz\/launch(?:\?.*)?$/, {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/[?&]activityType=capitals\b/);

    // mark-surfaced POST fired with the card's activityType.
    await expect.poll(() => markSurfacedBody?.activityType).toBe('capitals');
  });

  test('vocabulary card routes to the /quiz picker (documented branch) and still POSTs mark-surfaced', async ({
    page,
  }) => {
    await stubQuizDiscoveryCard(page, 'vocabulary');

    let markSurfacedBody: { activityType?: string } | null = null;
    await page.route(MARK_SURFACED_GLOB, async (route: Route) => {
      if (route.request().method() === 'POST') {
        markSurfacedBody = route.request().postDataJSON() as {
          activityType?: string;
        };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ markedCount: 1 }),
      });
    });

    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 'j26-quiz16-vocab',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });
    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    await expect(page.getByTestId('home-coach-band-continue')).toBeVisible({
      timeout: 30_000,
    });
    await pressableClick(page.getByTestId('home-coach-band-continue'));

    // Vocabulary intentionally routes to the /quiz picker (it needs a language
    // subject the discovery card doesn't carry) — NOT /quiz/launch.
    await expect(page).toHaveURL(/\/quiz(?:\?.*)?$/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/quiz\/launch/);

    await expect.poll(() => markSurfacedBody?.activityType).toBe('vocabulary');
  });
});
