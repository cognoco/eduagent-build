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
    await expect(approvalPage.locator('body')).toContainText(
      /family account ready|you may now close this tab/i,
      { timeout: 30_000 },
    );
    await expect(
      approvalPage.getByRole('link', { name: /open mentomate|progress/i }),
    ).toHaveAttribute('href', /mentomate:\/\/home/);
    await expect(
      approvalPage.getByRole('link', { name: /google play/i }),
    ).toBeVisible();
    await expect(
      approvalPage.getByRole('link', { name: /app store/i }),
    ).toBeVisible();

    await pressableClick(page.getByTestId('consent-check-again'));

    const postApproval = page.getByTestId('post-approval-continue');
    // [WI-879] A freshly-approved solo learner now lands on the Mentor home
    // (`mentor-screen` — app/(app)/mentor.tsx, rendering the `mentorHome.title`
    // "Mentor" feed) — the current post-approval app shell. The legacy
    // `create-subject-name` destination encoded the old onboarding funnel and
    // no longer applies (the approved learner is never auto-routed into
    // create-subject). Verified against staging Chrome: the post-approval page
    // snapshot renders the Mentor feed, not the legacy learner/create-subject
    // screen.
    const postApprovalDestination = page.getByTestId('mentor-screen');
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
