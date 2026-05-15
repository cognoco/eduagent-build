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
  await target.evaluate((element) => {
    const eventDefaults = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
    };

    const dispatchPointerEvent = (
      type: 'pointerdown' | 'pointerup',
      buttons: number,
    ) => {
      const PointerEventCtor = window.PointerEvent ?? window.MouseEvent;
      element.dispatchEvent(
        new PointerEventCtor(type, {
          ...eventDefaults,
          buttons,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        } as PointerEventInit),
      );
    };

    dispatchPointerEvent('pointerdown', 1);
    element.dispatchEvent(
      new MouseEvent('mousedown', { ...eventDefaults, buttons: 1 }),
    );
    dispatchPointerEvent('pointerup', 0);
    element.dispatchEvent(
      new MouseEvent('mouseup', { ...eventDefaults, buttons: 0 }),
    );
    element.dispatchEvent(
      new MouseEvent('click', { ...eventDefaults, buttons: 0 }),
    );
  });
}

export async function pressableClickByTestId(
  page: Page,
  testId: string,
): Promise<void> {
  await pressableClick(page.getByTestId(testId));
}
