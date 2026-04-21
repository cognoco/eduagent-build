import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
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

  await page.goto('/quiz', { waitUntil: 'commit' });
  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);

  await page.getByTestId('sign-in-email').fill(seeded.email);
  await page.getByTestId('sign-in-password').fill(seeded.password);
  await page.getByTestId('sign-in-button').click();

  await waitForScreenDismissingPostApproval(page, 'quiz-index-screen', 60_000);
  await expect(page).toHaveURL(/\/quiz(?:\?.*)?$/);
});
