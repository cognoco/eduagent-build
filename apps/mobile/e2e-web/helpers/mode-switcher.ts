import { expect, type Locator, type Page } from '@playwright/test';

import { domClick, pressableClick } from './pressable';

type AppMode = 'study' | 'family';

const SWITCH_SETTLE_TIMEOUT_MS = 5_000;

function modeToggle(page: Page, mode: AppMode): Locator {
  return page.getByTestId(
    mode === 'study' ? 'mode-switcher-study' : 'mode-switcher-family',
  );
}

function targetScreen(page: Page, mode: AppMode): Locator {
  return page.getByTestId(
    mode === 'study' ? 'learner-screen' : 'parent-home-screen',
  );
}

function selectedModeTab(page: Page, mode: AppMode): Locator {
  return page.getByRole('tab', {
    name: mode === 'study' ? 'My Learning' : 'Family',
  });
}

async function modeIsVisible(page: Page, mode: AppMode): Promise<boolean> {
  return (
    (await targetScreen(page, mode)
      .isVisible()
      .catch(() => false)) ||
    (await selectedModeTab(page, mode)
      .isVisible()
      .catch(() => false))
  );
}

async function retryModeSwitchIfNeeded(
  page: Page,
  timeout = 1_500,
): Promise<boolean> {
  const retry = page.getByTestId('mode-switcher-error-retry');

  if (
    !(await retry
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false))
  ) {
    return false;
  }

  await page.waitForTimeout(250);
  await pressableClick(retry);
  return true;
}

async function activateMode(toggle: Locator, mode: AppMode): Promise<void> {
  if (mode === 'study') {
    await domClick(toggle);
    return;
  }

  await pressableClick(toggle);
}

async function waitForSwitchOutcome(
  page: Page,
  mode: AppMode,
  timeout: number,
): Promise<'success' | 'error' | 'timeout'> {
  const error = page.getByTestId('mode-switcher-error');
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await modeIsVisible(page, mode)) {
      return 'success';
    }

    if (await error.isVisible().catch(() => false)) {
      return 'error';
    }

    await page.waitForTimeout(200);
  }

  return 'timeout';
}

/**
 * Wait for the server to persist the mode switch.
 *
 * Under the V1 nav contract, `setMode('family')` shows the target screen
 * *optimistically* (an in-memory override) while it PATCHes
 * `/v1/profiles/:id/app-context` to persist `defaultAppContext` in the
 * background (apps/mobile/src/lib/app-context.tsx). The optimistic screen is
 * visible before that PATCH commits.
 *
 * Callers that immediately `page.goto()` after switching (e.g. the BRIDGE-04
 * backstack probe deep-linking into a child surface) reload the whole app,
 * wiping the in-memory override; the post-reload profile refetch then derives
 * the mode from the *persisted* `defaultAppContext`. If that PATCH had not yet
 * committed, the reload silently reverts to Study mode and the Family-gated
 * child surfaces never render (WI-878).
 *
 * Awaiting the PATCH response before returning closes that race. It is purely
 * additive: callers that don't reload are unaffected, and the wait is a no-op
 * timeout for the legacy V0 path (transient-only switch, no PATCH) — which is
 * why a failed wait is swallowed rather than thrown.
 */
async function waitForModePersisted(
  page: Page,
  timeout: number,
): Promise<boolean> {
  if (timeout <= 0) return false;
  return page
    .waitForResponse(
      (response) =>
        /\/profiles\/[^/]+\/app-context(?:[/?]|$)/.test(response.url()) &&
        response.request().method() === 'PATCH' &&
        response.ok(),
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
}

async function waitForProfilesRead(page: Page, timeout: number): Promise<void> {
  if (timeout <= 0) return;
  await page
    .waitForResponse(
      (response) =>
        /\/profiles(?:[/?]|$)/.test(response.url()) &&
        response.request().method() === 'GET' &&
        response.ok(),
      { timeout },
    )
    .catch(() => undefined);
}

export async function switchAppMode(
  page: Page,
  mode: AppMode,
  timeout = 15_000,
): Promise<void> {
  const toggle = modeToggle(page, mode);
  const target = targetScreen(page, mode);
  await expect(toggle).toBeVisible({ timeout });

  if (await modeIsVisible(page, mode)) {
    return;
  }

  const deadline = Date.now() + timeout;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    // Arm the persisted-mode listener BEFORE activating the toggle so the
    // PATCH response can't fire-and-vanish between the click and the wait.
    const persisted = waitForModePersisted(
      page,
      Math.min(remaining, SWITCH_SETTLE_TIMEOUT_MS),
    );
    await activateMode(toggle, mode);

    const settleTimeout = Math.min(remaining, SWITCH_SETTLE_TIMEOUT_MS);
    const outcome = await waitForSwitchOutcome(page, mode, settleTimeout);

    if (outcome === 'success') {
      // Block on server-confirmed persistence so a subsequent page.goto()
      // reload derives the switched mode from the persisted profile, not a
      // stale pre-switch default. No-op (times out harmlessly) on the
      // transient V0 path where no PATCH is sent.
      if (await persisted) {
        await waitForProfilesRead(page, Math.min(deadline - Date.now(), 5_000));
      }
      return;
    }

    if (outcome === 'error') {
      // Arm the persisted-mode listener before the retry tap (which re-fires
      // setMode → a fresh app-context PATCH), same race window as above.
      const retryPersisted = waitForModePersisted(
        page,
        Math.min(deadline - Date.now(), SWITCH_SETTLE_TIMEOUT_MS),
      );
      const retryTapped = await retryModeSwitchIfNeeded(
        page,
        Math.min(remaining, 1_500),
      );

      if (retryTapped) {
        const retryOutcome = await waitForSwitchOutcome(
          page,
          mode,
          Math.min(deadline - Date.now(), SWITCH_SETTLE_TIMEOUT_MS),
        );

        if (retryOutcome === 'success') {
          if (await retryPersisted) {
            await waitForProfilesRead(
              page,
              Math.min(deadline - Date.now(), 5_000),
            );
          }
          return;
        }
      }
    }
  }

  await expect(target.or(selectedModeTab(page, mode)).first()).toBeVisible({
    timeout: Math.max(deadline - Date.now(), 1_000),
  });
}

export async function expectAppMode(
  page: Page,
  mode: AppMode,
  timeout = 15_000,
): Promise<void> {
  await expect(
    targetScreen(page, mode).or(selectedModeTab(page, mode)).first(),
  ).toBeVisible({
    timeout,
  });
}
