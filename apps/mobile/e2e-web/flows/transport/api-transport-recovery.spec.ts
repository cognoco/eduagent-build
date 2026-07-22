import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { installSeededProfileBootstrap } from '../../helpers/profile-bootstrap';
import { apiBaseUrl, authStateDir } from '../../helpers/runtime';

const TRANSPORT_GAP_MS = 6_500;

async function installApiTransportGap(page: Page): Promise<{
  abortedRequests: () => number;
  continuedRequests: () => number;
}> {
  const startedAt = Date.now();
  let abortedRequests = 0;
  let continuedRequests = 0;

  await page.route(`${apiBaseUrl}/v1/**`, async (route) => {
    if (Date.now() - startedAt < TRANSPORT_GAP_MS) {
      abortedRequests += 1;
      await route.abort('failed');
      return;
    }

    continuedRequests += 1;
    await route.fallback();
  });

  return {
    abortedRequests: () => abortedRequests,
    continuedRequests: () => continuedRequests,
  };
}

test.describe('safe request recovery after an api-stg transport gap', () => {
  test.describe('seeded learner core flow', () => {
    test.use({
      storageState: path.join(authStateDir, 'solo-learner.json'),
    });

    test('reaches the intended learner-home assertion after net::ERR_FAILED', async ({
      page,
    }) => {
      await installSeededProfileBootstrap(page);
      const fault = await installApiTransportGap(page);

      await page.goto('/mentor', { waitUntil: 'commit' });

      await expect(page.getByTestId('mentor-screen')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('mentor-on-track-badge')).toBeVisible();
      expect(fault.abortedRequests()).toBeGreaterThan(0);
      expect(fault.continuedRequests()).toBeGreaterThan(0);
    });

    test('stops after the client cap without starting a query-level replay sequence', async ({
      page,
    }) => {
      let profileAttempts = 0;
      await page.route(`${apiBaseUrl}/v1/profiles`, async (route) => {
        profileAttempts += 1;
        await route.abort('failed');
      });

      const firstProfileRequest = page.waitForRequest(
        (request) =>
          request.method() === 'GET' &&
          new URL(request.url()).pathname === '/v1/profiles',
      );
      await page.goto('/mentor', { waitUntil: 'commit' });
      await firstProfileRequest;

      await expect(page.getByTestId('profile-load-error')).toBeVisible({
        timeout: 11_000,
      });
      expect(profileAttempts).toBe(5);
    });
  });

  test.describe('seeded parent core flow', () => {
    test.use({
      storageState: path.join(authStateDir, 'owner-with-children.json'),
    });

    test('reaches the intended parent-shell assertion after net::ERR_FAILED', async ({
      page,
    }) => {
      await installSeededProfileBootstrap(page, 'owner-with-children');
      const fault = await installApiTransportGap(page);

      await page.goto('/mentor', { waitUntil: 'commit' });

      await expect(page.getByTestId('mentor-screen')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('account-avatar-shell')).toBeVisible();
      expect(fault.abortedRequests()).toBeGreaterThan(0);
      expect(fault.continuedRequests()).toBeGreaterThan(0);
    });
  });

  test.describe('quiz-results accessibility core flow', () => {
    test.use({
      storageState: path.join(authStateDir, 'solo-learner.json'),
    });

    test('reaches the intended quiz-results assertion after net::ERR_FAILED', async ({
      page,
    }) => {
      await installSeededProfileBootstrap(page);
      const fault = await installApiTransportGap(page);

      await page.goto('/quiz/dev-only/results?freeze=true', {
        waitUntil: 'commit',
      });

      const screen = page.getByTestId('quiz-results-screen');
      await expect(screen).toBeVisible({ timeout: 30_000 });
      await expect(screen.getByRole('button')).toHaveCount(3);
      expect(fault.abortedRequests()).toBeGreaterThan(0);
      expect(fault.continuedRequests()).toBeGreaterThan(0);
    });
  });
});
