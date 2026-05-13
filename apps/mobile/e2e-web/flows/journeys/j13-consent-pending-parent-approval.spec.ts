import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { apiBaseUrl } from '../../helpers/runtime';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-13 pending consent blocks app until parent approval completes', async ({
  page,
  browser,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'consent-pending',
    alias: 'j13',
    landingTestId: 'consent-pending-gate',
    landingPath: '/home',
  });
  const consentToken = seeded.ids.consentToken;

  await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
    timeout: 60_000,
  });

  const approvalContext = await browser.newContext();
  const approvalPage = await approvalContext.newPage();
  try {
    await approvalPage.goto(
      `${apiBaseUrl}/v1/consent-page?token=${consentToken}`,
    );
    await expect(
      approvalPage.getByRole('button', { name: 'Approve' }),
    ).toBeVisible({ timeout: 30_000 });
    await approvalPage.getByRole('button', { name: 'Approve' }).click();
    await expect(approvalPage.getByText(/family account ready!/i)).toBeVisible({
      timeout: 30_000,
    });

    await pressableClick(page.getByTestId('consent-check-again'));

    const postApproval = page.getByTestId('post-approval-continue');
    const postApprovalDestination = page
      .getByTestId('create-subject-name')
      .or(page.getByTestId('learner-screen'));
    await expect(postApproval.or(postApprovalDestination)).toBeVisible({
      timeout: 30_000,
    });
    if (await postApproval.isVisible()) {
      await expect(postApproval).toBeEnabled();
      await pressableClick(postApproval);
    }

    await expect(postApprovalDestination).toBeVisible({ timeout: 30_000 });
  } finally {
    await approvalContext.close();
  }
});
