import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';

test('J-04 parent taps child card to navigate to Family', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByTestId(/^parent-home-check-child-/).first(),
  ).toBeVisible();

  await pressableClick(page.getByTestId(/^parent-home-check-child-/).first());
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
});
