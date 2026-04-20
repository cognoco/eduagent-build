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

export async function signInAndPersistStorageState(
  page: Page,
  options: SignInOptions
): Promise<void> {
  await page.goto('/sign-in', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('sign-in-email').fill(options.email);
  await page.getByTestId('sign-in-password').fill(options.password);
  await page.getByTestId('sign-in-button').click();

  await expect(page.getByTestId(options.landingTestId)).toBeVisible({
    timeout: 60_000,
  });

  if (options.landingPath) {
    await page.waitForURL((url) => url.pathname === options.landingPath, {
      timeout: 60_000,
    });
  }

  await mkdir(path.dirname(options.storageStatePath), { recursive: true });
  await page.context().storageState({ path: options.storageStatePath });
}
