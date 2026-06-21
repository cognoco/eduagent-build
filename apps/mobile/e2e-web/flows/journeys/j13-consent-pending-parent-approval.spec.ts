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
    // [WI-879] A freshly-approved learner lands on the Mentor home feed
    // (`mentor-screen` — app/(app)/mentor.tsx:233, rendering the `mentorHome.title`
    // "Mentor" header + "What do you want to work on?" composer). Verified
    // empirically against staging Chrome under the e2e-web V2 nav posture
    // (EXPO_PUBLIC_ENABLE_MODE_NAV + _V1 + _V2 = true, injected by the local
    // `doppler run -c stg` flow and the CI e2e-web job): the post-approval page
    // snapshot renders the Mentor feed (title "Mentor", "useful next steps",
    // homework/teach/question prompts), NOT the LearnerScreen (which would show
    // `home-action-homework`/`home-action-study-new`) and NOT the legacy
    // `create-subject-name` onboarding funnel. The previous
    // `create-subject-name | learner-screen` destination is the stale V0 contract.
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
