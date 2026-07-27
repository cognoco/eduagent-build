import type { Page } from '@playwright/test';

export async function emulateNativeTopSafeArea(
  page: Page,
  top: number,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top, right: 0, bottom: 0, left: 0 },
  });
}
