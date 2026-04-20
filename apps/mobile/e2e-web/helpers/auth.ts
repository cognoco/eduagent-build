import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';

export interface SignInOptions {
  email: string;
  password: string;
  storageStatePath: string;
  landingTestId: string;
  landingPath?: string;
}

/**
 * Inject Clerk testing token into the page if CLERK_TESTING_TOKEN is set.
 * This bypasses Clerk's bot detection and rate limiting for E2E.
 * @see https://clerk.com/docs/testing/overview#testing-tokens
 */
async function injectClerkTestingToken(page: Page): Promise<void> {
  const token = process.env.CLERK_TESTING_TOKEN;
  if (!token) return;
  await page.addInitScript((t) => {
    (window as Record<string, unknown>).__clerk_testing_token = t;
  }, token);
}

export async function signInAndPersistStorageState(
  page: Page,
  options: SignInOptions
): Promise<void> {
  await injectClerkTestingToken(page);
  await page.goto('/sign-in', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('sign-in-email').fill(options.email);
  await page.getByTestId('sign-in-password').fill(options.password);
  await page.getByTestId('sign-in-button').click();

  // Tap through the post-approval landing if it appears (fresh SecureStore)
  const postApproval = page.getByTestId('post-approval-continue');
  const landing = page.getByTestId(options.landingTestId);
  const first = await Promise.race([
    postApproval
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'post-approval' as const),
    landing
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'landing' as const),
  ]);
  if (first === 'post-approval') {
    await postApproval.click();
    await expect(landing).toBeVisible({ timeout: 60_000 });
  }

  if (options.landingPath) {
    await page.waitForURL((url) => url.pathname === options.landingPath, {
      timeout: 60_000,
    });
  }

  await mkdir(path.dirname(options.storageStatePath), { recursive: true });
  await page.context().storageState({ path: options.storageStatePath });
}
