import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';

test('J-04 parent opens child progress detail from child action', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await waitForAppScreen(page, 'parent-home-screen', {
    timeout: 60_000,
  });
  const childCard = page.getByTestId(/^parent-home-check-child-/).first();
  await expect(childCard).toBeVisible();

  const childId =
    (await childCard.getAttribute('data-testid'))?.replace(
      'parent-home-check-child-',
      '',
    ) ?? '';
  expect(childId).not.toBe('');

  await pressableClick(
    page.getByTestId(`parent-home-child-progress-${childId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(new RegExp(`/child/${childId}(?:\\?.*)?$`));
});
