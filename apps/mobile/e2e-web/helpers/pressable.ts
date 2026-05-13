import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Click a React Native Web Pressable reliably.
 *
 * RN-Web's PressResponder wires onPress to pointerdown/pointerup events
 * via its synthetic responder system. Playwright's `.click()` should
 * dispatch those, but on this Expo build standard clicks intermittently
 * hang or no-op — typically when navigation tears down the source button
 * mid-click, or when an invisible-but-present overlay (e.g. animated
 * splash) sits on the click target.
 *
 * Dispatching the events directly on the underlying <button> bypasses the
 * mouse/hit-testing layer and goes straight to the responder, which is the
 * exact path React Native Web listens on. Equivalent UX, reliable in e2e.
 */
export async function pressableClick(target: Locator): Promise<void> {
  const page = target.page();
  const splash = page.getByTestId('animated-splash');

  await splash.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {
    // Most app states do not render the splash at all. If it is still visible,
    // the post-click assertion in the calling test will catch the blocked UI.
  });

  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.scrollIntoViewIfNeeded();
  await target.dispatchEvent('pointerdown');
  await target.dispatchEvent('pointerup');
  await target.dispatchEvent('click');
}

export async function pressableClickByTestId(
  page: Page,
  testId: string,
): Promise<void> {
  await pressableClick(page.getByTestId(testId));
}
