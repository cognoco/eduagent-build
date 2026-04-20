import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
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

  const postApproval = page.getByTestId('post-approval-continue');
  const quizScreen = page.getByTestId('quiz-index-screen');
  await expect(postApproval.or(quizScreen)).toBeVisible({ timeout: 60_000 });

  if (await postApproval.isVisible().catch(() => false)) {
    await postApproval.click({ force: true });
  }

  await expect(quizScreen).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/quiz(?:\?.*)?$/);
});
