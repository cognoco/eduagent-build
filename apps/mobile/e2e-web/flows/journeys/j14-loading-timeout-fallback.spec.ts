import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-14 profile loading resolves without dead-end', async ({ page }) => {
  // On web, (app)/_layout.tsx shows a profile-loading spinner before the
  // Home tab mounts. This test verifies the loading state resolves to a
  // usable screen — no infinite spinner / dead-end.
  //
  // Note: _layout.tsx currently has no timeout fallback on profile-loading.
  // When a TimeoutLoader is added (UX resilience rule: 15-30s timeout),
  // extend this test to verify fallback actions (retry, go home) work.
  await page.goto('/home', { waitUntil: 'commit' });

  // The app should resolve past profile-loading to a real screen.
  // Accept learner home, learner screen, or consent gate as valid states.
  const learnerScreen = page.getByTestId('learner-screen');
  const parentHome = page.getByTestId('learner-screen');
  const consentGate = page.getByTestId('consent-pending-gate');
  const profileLoading = page.getByTestId('profile-loading');

  await expect(learnerScreen.or(parentHome).or(consentGate)).toBeVisible({
    timeout: 60_000,
  });

  // The profile-loading spinner should no longer be visible
  await expect(profileLoading).not.toBeVisible();
});
