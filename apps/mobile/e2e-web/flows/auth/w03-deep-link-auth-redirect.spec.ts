import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { markWelcomeIntroSeenFromSession } from '../../helpers/auth';
import { waitForScreenDismissingPostApproval } from '../../helpers/post-approval';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';

test('W-03 deep link to authenticated route redirects to sign-in and back', async ({
  page,
}) => {
  const suffix = randomBytes(2).toString('hex');
  const seeded = await seedScenario({
    scenario: 'onboarding-complete',
    email: buildSeedEmail(`w03-${suffix}`),
  });

  await setupClerkTestingToken({ page });
  await page.goto('/quiz', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);

  await page.getByTestId('sign-in-email').fill(seeded.email);
  await page.getByTestId('sign-in-password').fill(seeded.password);
  await page.getByTestId('sign-in-button').click();

  await expect
    .poll(async () => markWelcomeIntroSeenFromSession(page), {
      timeout: 30_000,
    })
    .toBe(true);
  await page.evaluate((profileId) => {
    window.localStorage.setItem('mentomate_active_profile_id', profileId);
    window.localStorage.removeItem('parent-proxy-active');
  }, seeded.profileId);
  if (
    !(await page
      .getByTestId('quiz-index-screen')
      .isVisible()
      .catch(() => false))
  ) {
    await page.goto('/quiz', { waitUntil: 'commit' });
  }

  await waitForScreenDismissingPostApproval(page, 'quiz-index-screen', 60_000);
  await expect(page).toHaveURL(/\/quiz(?:\?.*)?$/);
});
