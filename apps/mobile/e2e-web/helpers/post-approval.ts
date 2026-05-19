import { expect, type Page } from '@playwright/test';

export async function dismissPostApprovalIfVisible(
  page: Page,
  timeoutMs = 2_000,
): Promise<boolean> {
  const postApproval = page.getByTestId('post-approval-continue');
  const appeared = await postApproval
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return false;
  }

  await postApproval.click();
  await expect(postApproval).toBeHidden({ timeout: timeoutMs });
  return true;
}

/**
 * Wait for a target screen to become visible, dismissing the post-approval
 * landing overlay if it appears first. This happens when switching to a
 * profile whose `postApprovalSeen_` key is absent from SecureStore/localStorage.
 */
export async function waitForScreenDismissingPostApproval(
  page: Page,
  targetTestId: string,
  timeoutMs = 60_000,
): Promise<void> {
  const postApproval = page.getByTestId('post-approval-continue');
  const target = page.getByTestId(targetTestId);

  const first = await Promise.race([
    postApproval
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => 'post-approval' as const)
      .catch(() => null),
    target
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => 'target' as const)
      .catch(() => null),
  ]);

  if (first === 'post-approval') {
    await postApproval.click();
    await expect(target).toBeVisible({ timeout: timeoutMs });
    return;
  }

  await expect(target).toBeVisible({ timeout: timeoutMs });
}
