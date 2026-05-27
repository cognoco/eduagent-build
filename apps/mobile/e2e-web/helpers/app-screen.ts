import { type Locator, type Page } from '@playwright/test';
import { pressableClick } from './pressable';

type TestId = string | RegExp;

interface WaitForAppScreenOptions {
  timeout?: number;
  childProfileRetries?: number;
  profileLoadRetries?: number;
  familyRouteRecovery?: (() => Promise<void>) | null;
  screenRetryTestId?: string;
  screenRetries?: number;
}

function describeTestId(testId: TestId): string {
  return typeof testId === 'string' ? testId : testId.toString();
}

/**
 * Wait for an authenticated app screen while tolerating transient profile
 * bootstrap failures from staging. If the app shows its profile-load fallback,
 * click the real retry action and keep waiting for the intended screen.
 */
export async function waitForAppScreen(
  page: Page,
  testId: TestId,
  options: WaitForAppScreenOptions = {},
): Promise<Locator> {
  const timeout = options.timeout ?? 60_000;
  const maxChildProfileRetries = options.childProfileRetries ?? 2;
  const maxProfileRetries = options.profileLoadRetries ?? 3;
  const maxScreenRetries = options.screenRetries ?? 2;
  const deadline = Date.now() + timeout;
  const target = page.getByTestId(testId);
  let childProfileRetryCount = 0;
  let profileRetryCount = 0;
  let screenRetryCount = 0;

  while (Date.now() < deadline) {
    if (await target.isVisible().catch(() => false)) {
      return target;
    }

    const profileLoadError = page.getByTestId('profile-load-error');
    if (
      profileRetryCount < maxProfileRetries &&
      (await profileLoadError.isVisible().catch(() => false))
    ) {
      profileRetryCount += 1;
      await pressableClick(page.getByTestId('profile-load-error-retry'));
      await page.waitForTimeout(500);
      continue;
    }

    const childProfileUnavailable = page.getByTestId(
      'child-profile-unavailable',
    );
    if (
      childProfileRetryCount < maxChildProfileRetries &&
      (await childProfileUnavailable.isVisible().catch(() => false))
    ) {
      const childProfileRetry = page.getByTestId('child-profile-retry');
      if (await childProfileRetry.isVisible().catch(() => false)) {
        childProfileRetryCount += 1;
        await pressableClick(childProfileRetry);
        await page.waitForTimeout(500);
        continue;
      }
    }

    if (options.screenRetryTestId && screenRetryCount < maxScreenRetries) {
      const screenRetry = page.getByTestId(options.screenRetryTestId);
      if (await screenRetry.isVisible().catch(() => false)) {
        screenRetryCount += 1;
        await pressableClick(screenRetry);
        await page.waitForTimeout(500);
        continue;
      }
    }

    if (options.familyRouteRecovery) {
      const familyRouteBlocked = page.getByTestId('family-route-blocked');
      const learnerScreen = page.getByTestId('learner-screen');
      const modeSwitcherError = page.getByTestId('mode-switcher-error');
      if (
        (await familyRouteBlocked.isVisible().catch(() => false)) ||
        (await childProfileUnavailable.isVisible().catch(() => false)) ||
        (await learnerScreen.isVisible().catch(() => false)) ||
        (await modeSwitcherError.isVisible().catch(() => false))
      ) {
        await options.familyRouteRecovery();
        await page.waitForTimeout(500);
        continue;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for ${describeTestId(testId)} after ${timeout}ms` +
      ` (child profile retries: ${childProfileRetryCount}/${maxChildProfileRetries},` +
      ` profile load retries: ${profileRetryCount}/${maxProfileRetries},` +
      ` screen retries: ${screenRetryCount}/${maxScreenRetries})`,
  );
}
