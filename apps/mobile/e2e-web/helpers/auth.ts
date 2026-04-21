import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';

export interface SignInOptions {
  email: string;
  password: string;
  landingTestId: string;
  landingPath?: string;
}

export interface PersistedSignInOptions extends SignInOptions {
  storageStatePath: string;
}

// [BUG-531] Sentinel values that indicate the token was never actually set.
const INVALID_TOKEN_SENTINELS = new Set([
  'notsetyet',
  'changeme',
  'placeholder',
  'todo',
  '',
]);

/**
 * Inject Clerk testing token into the page if CLERK_TESTING_TOKEN is set.
 * This bypasses Clerk's bot detection and rate limiting for E2E.
 * @see https://clerk.com/docs/testing/overview#testing-tokens
 */
async function injectClerkTestingToken(page: Page): Promise<void> {
  const token = process.env.CLERK_TESTING_TOKEN;
  if (!token) {
    console.warn(
      '[E2E] CLERK_TESTING_TOKEN is not set — Clerk may rate-limit sign-in attempts.\n' +
        '  Fix: set CLERK_TESTING_TOKEN in Doppler (dev + stg) from Clerk Dashboard → API Keys → Testing Token.'
    );
    return;
  }
  if (INVALID_TOKEN_SENTINELS.has(token.trim().toLowerCase())) {
    console.warn(
      `[E2E] CLERK_TESTING_TOKEN is set to "${token}" which is a placeholder, not a real token.\n` +
        '  Fix: set CLERK_TESTING_TOKEN in Doppler (dev + stg) from Clerk Dashboard → API Keys → Testing Token.'
    );
    return;
  }
  await page.addInitScript((t) => {
    (window as Record<string, unknown>).__clerk_testing_token = t;
  }, token);
}

export async function signIn(
  page: Page,
  options: SignInOptions
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

  await injectClerkTestingToken(page);
  await page.goto('/sign-in', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('sign-in-email').fill(options.email);
  await page.getByTestId('sign-in-password').fill(options.password);
  await page.getByTestId('sign-in-button').click();

  try {
    // Tap through the post-approval landing if it appears (fresh SecureStore)
    const postApproval = page.getByTestId('post-approval-continue');
    const landing = page.getByTestId(options.landingTestId);
    const errorBoundary = page.getByTestId('error-boundary-fallback');
    const first = await Promise.race([
      postApproval
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'post-approval' as const),
      landing
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'landing' as const),
      errorBoundary
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'error-boundary' as const),
    ]);

    if (first === 'error-boundary') {
      const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
      throw new Error(
        diagnostics
          ? `Sign-in landed on the app error boundary: ${diagnostics}`
          : 'Sign-in landed on the app error boundary.'
      );
    }

    if (first === 'post-approval') {
      await postApproval.click();
      const second = await Promise.race([
        landing
          .waitFor({ state: 'visible', timeout: 60_000 })
          .then(() => 'landing' as const),
        errorBoundary
          .waitFor({ state: 'visible', timeout: 60_000 })
          .then(() => 'error-boundary' as const),
      ]);

      if (second === 'error-boundary') {
        const diagnostics = [...pageErrors, ...consoleErrors].join(' | ');
        throw new Error(
          diagnostics
            ? `Post-approval flow landed on the app error boundary: ${diagnostics}`
            : 'Post-approval flow landed on the app error boundary.'
        );
      }
    }

    if (options.landingPath) {
      await page.waitForURL((url) => url.pathname === options.landingPath, {
        timeout: 60_000,
      });
    }
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

export async function signInAndPersistStorageState(
  page: Page,
  options: PersistedSignInOptions
): Promise<void> {
  await signIn(page, options);

  await mkdir(path.dirname(options.storageStatePath), { recursive: true });
  await page.context().storageState({ path: options.storageStatePath });
}
