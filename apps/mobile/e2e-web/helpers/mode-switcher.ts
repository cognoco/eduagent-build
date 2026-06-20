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

    await activateMode(toggle, mode);

    const settleTimeout = Math.min(remaining, SWITCH_SETTLE_TIMEOUT_MS);
    const outcome = await waitForSwitchOutcome(page, mode, settleTimeout);

    if (outcome === 'success') {
      return;
    }

    if (outcome === 'error') {
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
