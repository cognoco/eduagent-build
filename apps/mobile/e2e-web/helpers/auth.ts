import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { pressableClick } from './pressable';

export interface SignInOptions {
  email: string;
  password: string;
  landingTestId: string;
  landingPath?: string;
  activeProfileId?: string;
}

export interface PersistedSignInOptions extends SignInOptions {
  storageStatePath: string;
}

async function isAppShellAtPathVisible(
  page: Page,
  landingPath: string | undefined,
): Promise<boolean> {
  if (landingPath) {
    const currentUrl = new URL(page.url());
    if (currentUrl.pathname !== landingPath) {
      return false;
    }
  }

  return page
    .getByRole('tablist')
    .isVisible()
    .catch(() => false);
}

type SignedInReadyState =
  | 'post-approval'
  | 'welcome-intro'
  | 'landing'
  | 'app-shell'
  | 'error-boundary';

async function waitForSignedInReady(
  page: Page,
  options: SignInOptions,
  waitOptions: { allowPostApproval: boolean },
): Promise<SignedInReadyState> {
  const timeout = 60_000;
  const maxProfileLoadRetries = 3;
  const deadline = Date.now() + timeout;
  const postApproval = page.getByTestId('post-approval-continue');
  const welcomeIntro = page.getByTestId('welcome-intro');
  const landing = page.getByTestId(options.landingTestId);
  const errorBoundary = page.getByTestId('error-boundary-fallback');
  const profileLoadError = page.getByTestId('profile-load-error');
  const profileLoadRetry = page.getByTestId('profile-load-error-retry');
  const signInError = page.getByText(
    'Sign-in could not be completed. Please try again.',
  );
  const signInButton = page.getByTestId('sign-in-button');
  let profileRetryCount = 0;
  let signInRetryCount = 0;

  while (Date.now() < deadline) {
    if (
      waitOptions.allowPostApproval &&
      (await postApproval.isVisible().catch(() => false))
    ) {
      return 'post-approval';
    }

    if (await welcomeIntro.isVisible().catch(() => false)) {
      return 'welcome-intro';
    }

    if (await landing.isVisible().catch(() => false)) {
      return 'landing';
    }

    if (await isAppShellAtPathVisible(page, options.landingPath)) {
      return 'app-shell';
    }

    if (await errorBoundary.isVisible().catch(() => false)) {
      return 'error-boundary';
    }

    if (
      profileRetryCount < maxProfileLoadRetries &&
      (await profileLoadError.isVisible().catch(() => false)) &&
      (await profileLoadRetry.isVisible().catch(() => false))
    ) {
      profileRetryCount += 1;
      await pressableClick(profileLoadRetry);
      await page.waitForTimeout(500);
      continue;
    }

    if (
      signInRetryCount < 3 &&
      (await signInError.isVisible().catch(() => false)) &&
      (await signInButton.isVisible().catch(() => false))
    ) {
      signInRetryCount += 1;
      await signInButton.click();
      await page.waitForTimeout(1_000);
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for signed-in app readiness after ${timeout}ms` +
      ` (profile load retries: ${profileRetryCount}/${maxProfileLoadRetries}, ` +
      `sign-in retries: ${signInRetryCount}/3)`,
  );
}

async function completeWelcomeIntro(page: Page): Promise<void> {
  const nextButton = page.getByTestId('welcome-next-button');
  const startButton = page.getByTestId('welcome-start-button');

  for (let step = 0; step < 8; step++) {
    if (await startButton.isVisible().catch(() => false)) {
      await pressableClick(startButton);
      return;
    }

    if (await nextButton.isVisible().catch(() => false)) {
      await pressableClick(nextButton);
      await page.waitForTimeout(250);
      continue;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Timed out advancing welcome intro during sign-in');
}

function decodeJwtPayload(token: string): { sub?: string } | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      sub?: string;
    };
  } catch {
    return null;
  }
}

async function markWelcomeIntroSeenFromSession(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === '__session');
  const userId = sessionCookie
    ? decodeJwtPayload(sessionCookie.value)?.sub
    : undefined;

  if (!userId) return false;

  const key = `intro_seen_v1_${userId}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  await page.evaluate(
    ({ storageKey }) => {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    },
    { storageKey: key },
  );
  return true;
}

export async function signIn(
  page: Page,
  options: SignInOptions,
): Promise<void> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (error: Error) => {
    pageErrors.push(error.message);
  };
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  await setupClerkTestingToken({ page });
  await page.goto('/sign-in', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('sign-in-email').fill(options.email);
  await page.getByTestId('sign-in-password').fill(options.password);
  await page.getByTestId('sign-in-button').click();
  await expect
    .poll(async () => markWelcomeIntroSeenFromSession(page), {
      timeout: 30_000,
    })
    .toBe(true);
  if (options.activeProfileId) {
    await page.evaluate((profileId) => {
      window.localStorage.setItem('mentomate_active_profile_id', profileId);
      window.localStorage.removeItem('parent-proxy-active');
    }, options.activeProfileId);
  }
  await page.goto(options.landingPath ?? '/home', { waitUntil: 'commit' });

  try {
    // Tap through the post-approval landing if it appears (fresh SecureStore)
    const postApproval = page.getByTestId('post-approval-continue');
    const landing = page.getByTestId(options.landingTestId);
    const first = await waitForSignedInReady(page, options, {
      allowPostApproval: true,
    });

    if (first === 'error-boundary') {
      const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
      throw new Error(
        diagnostics
          ? `Sign-in landed on the app error boundary: ${diagnostics}`
          : 'Sign-in landed on the app error boundary.',
      );
    }

    if (first === 'post-approval') {
      await pressableClick(postApproval);
      const second = await waitForSignedInReady(page, options, {
        allowPostApproval: false,
      });

      if (second === 'error-boundary') {
        const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
        throw new Error(
          diagnostics
            ? `Post-approval flow landed on the app error boundary: ${diagnostics}`
            : 'Post-approval flow landed on the app error boundary.',
        );
      }

      if (second === 'welcome-intro') {
        await completeWelcomeIntro(page);
        const third = await waitForSignedInReady(page, options, {
          allowPostApproval: false,
        });

        if (third === 'error-boundary') {
          const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
          throw new Error(
            diagnostics
              ? `Post-welcome flow landed on the app error boundary: ${diagnostics}`
              : 'Post-welcome flow landed on the app error boundary.',
          );
        }
      }
    }

    if (first === 'welcome-intro') {
      await completeWelcomeIntro(page);
      const second = await waitForSignedInReady(page, options, {
        allowPostApproval: false,
      });

      if (second === 'error-boundary') {
        const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
        throw new Error(
          diagnostics
            ? `Post-welcome flow landed on the app error boundary: ${diagnostics}`
            : 'Post-welcome flow landed on the app error boundary.',
        );
      }
    }

    if (options.landingPath) {
      await page.waitForURL((url) => url.pathname === options.landingPath, {
        timeout: 60_000,
      });
    }

    // The approval interstitial can appear just after the landing route becomes
    // visible on freshly seeded accounts. Clear that late arrival before tests
    // start pressing controls underneath it.
    if (
      await postApproval
        .waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await pressableClick(postApproval);
      await landing.waitFor({ state: 'visible', timeout: 60_000 });
      if (options.landingPath) {
        await page.waitForURL((url) => url.pathname === options.landingPath, {
          timeout: 60_000,
        });
      }
    }

    // Bug 36c8bce9-1f7c-8196-a766-c9bc9ce12aad (J03 parent setup): the
    // 'app-shell' branch above returns early as soon as ANY tablist is visible
    // at the landing URL. That accepts the wrong shell when an owner-with-
    // children account lands on My Learning instead of parent-home, then the
    // storage state is captured pointing at the wrong screen and downstream
    // J03 specs fail mysteriously waiting for parent-home-screen.
    //
    // Enforce that the caller's contractual landingTestId is actually rendered
    // before we declare sign-in ready. Failure here surfaces the contract
    // mismatch at setup time with a clear diagnostic instead of letting the
    // mislabelled storage state propagate to every parent-shell spec.
    await expect(landing).toBeVisible({ timeout: 60_000 });
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

export async function signInAndPersistStorageState(
  page: Page,
  options: PersistedSignInOptions,
): Promise<void> {
  await signIn(page, options);

  await mkdir(path.dirname(options.storageStatePath), { recursive: true });
  await page.context().storageState({ path: options.storageStatePath });
}
