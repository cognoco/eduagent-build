import { expect, type Page } from '@playwright/test';

/**
 * Wait for a target screen to become visible, dismissing the post-approval
 * landing overlay if it appears first. This happens when switching to a
 * profile whose `postApprovalSeen_` key is absent from SecureStore/localStorage.
 */
export async function waitForScreenDismissingPostApproval(
  page: Page,
  targetTestId: string,
  timeoutMs = 60_000
): Promise<void> {
  const postApproval = page.getByTestId('post-approval-continue');
  const target = page.getByTestId(targetTestId);

  const first = await Promise.race([
    postApproval
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => 'post-approval' as const),
    target
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => 'target' as const),
  ]);

  if (first === 'post-approval') {
    await postApproval.click();
    await expect(target).toBeVisible({ timeout: timeoutMs });
  }
}
