import { type Locator, type Page } from '@playwright/test';
import { pressableClick } from './pressable';

type TestId = string | RegExp;

interface WaitForAppScreenOptions {
  timeout?: number;
  profileLoadRetries?: number;
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
  const maxProfileRetries = options.profileLoadRetries ?? 3;
  const maxScreenRetries = options.screenRetries ?? 2;
  const deadline = Date.now() + timeout;
  const target = page.getByTestId(testId);
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

    if (options.screenRetryTestId && screenRetryCount < maxScreenRetries) {
      const screenRetry = page.getByTestId(options.screenRetryTestId);
      if (await screenRetry.isVisible().catch(() => false)) {
        screenRetryCount += 1;
        await pressableClick(screenRetry);
        await page.waitForTimeout(500);
        continue;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for ${describeTestId(testId)} after ${timeout}ms` +
      ` (profile load retries: ${profileRetryCount}/${maxProfileRetries},` +
      ` screen retries: ${screenRetryCount}/${maxScreenRetries})`,
  );
}

export async function ensureFamilyHome(
  page: Page,
  options: WaitForAppScreenOptions = {},
): Promise<Locator> {
  const timeout = options.timeout ?? 60_000;
  const deadline = Date.now() + timeout;
  const parentHome = page.getByTestId('parent-home-screen');
  const familySwitch = page.getByTestId('mode-switcher-family');
  const modeSwitchRetry = page.getByTestId('mode-switcher-error-retry');
  const familyRouteSwitch = page.getByTestId('family-route-switch-cta');

  async function switchToFamily(target: Locator): Promise<Locator | null> {
    const remaining = Math.max(deadline - Date.now(), 1);
    const appContextPersisted = page
      .waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/v1/profiles/') &&
          response.url().includes('/app-context'),
        { timeout: Math.min(remaining, 20_000) },
      )
      .catch(() => null);

    await pressableClick(target);

    const response = await appContextPersisted;
    if (!response?.ok()) {
      return null;
    }

    return waitForAppScreen(page, 'parent-home-screen', {
      ...options,
      timeout: Math.max(deadline - Date.now(), 1),
    });
  }

  while (Date.now() < deadline) {
    if (await parentHome.isVisible().catch(() => false)) {
      return parentHome;
    }

    if (await modeSwitchRetry.isVisible().catch(() => false)) {
      const switched = await switchToFamily(modeSwitchRetry);
      if (switched) {
        return switched;
      }
      await page.waitForTimeout(500);
      continue;
    }

    if (await familySwitch.isVisible().catch(() => false)) {
      const switched = await switchToFamily(familySwitch);
      if (switched) {
        return switched;
      }
      await page.waitForTimeout(500);
      continue;
    }

    if (await familyRouteSwitch.isVisible().catch(() => false)) {
      const switched = await switchToFamily(familyRouteSwitch);
      if (switched) {
        return switched;
      }
      await page.waitForTimeout(500);
      continue;
    }

    await page.waitForTimeout(250);
  }

  return waitForAppScreen(page, 'parent-home-screen', {
    ...options,
    timeout: 1,
  });
}
