import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { fillTextInput } from '../../helpers/text-input';

test('BILLING-13 owner sees in-chat daily quota card and can open subscription', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'daily-limit-reached',
    alias: 'j26-billing13',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(page.getByTestId('home-coach-band-continue'));
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);

  await fillTextInput(
    page.getByTestId('chat-input'),
    'Can you explain quadratic equations?',
  );
  await pressableClick(page.getByTestId('send-button'));

  await expect(page.getByTestId('quota-exceeded-card')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Daily limit reached')).toBeVisible();
  await expect(
    page.getByText("You've used 10 of 10 questions today."),
  ).toBeVisible();
  await expect(page.getByTestId('quota-upgrade-btn')).toBeVisible();
  await expect(page.getByTestId('input-disabled-banner')).toBeVisible();

  await pressableClick(page.getByTestId('quota-upgrade-btn'));
  await expect(page.getByTestId('subscription-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/subscription(?:\?.*)?$/);
});
