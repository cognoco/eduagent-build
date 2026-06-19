import { expect, test, type Dialog } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('BILLING-08 family owner removes a child from the family pool', async ({
  page,
}) => {
  test.setTimeout(150_000);

  const seeded = await seedAndSignIn(page, {
    scenario: 'mentor-audit-family-pool-members',
    alias: 'billing-family-pool-removal',
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  });
  const childProfileId = seeded.ids.childProfileId1;
  const remainingChildProfileId = seeded.ids.childProfileId2;
  expect(childProfileId).toBeTruthy();
  expect(remainingChildProfileId).toBeTruthy();

  await page.goto('/subscription');
  await waitForAppScreen(page, 'subscription-screen');
  await expect(page.getByTestId('family-pool-section')).toBeVisible({
    timeout: 30_000,
  });

  const removedMember = page.getByTestId(`family-member-${childProfileId}`);
  const removeButton = page.getByTestId(
    `remove-family-member-${childProfileId}`,
  );
  await expect(removedMember).toBeVisible();
  await expect(removeButton).toBeVisible();

  let confirmMessage = '';
  let successMessage = '';
  const dialogsHandled = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      page.off('dialog', handleDialog);
      reject(new Error('Timed out waiting for family-pool removal dialogs'));
    }, 15_000);

    const finish = () => {
      clearTimeout(timeout);
      page.off('dialog', handleDialog);
      resolve();
    };

    const fail = (error: unknown) => {
      clearTimeout(timeout);
      page.off('dialog', handleDialog);
      reject(error);
    };

    async function handleDialog(dialog: Dialog) {
      try {
        if (dialog.type() === 'confirm') {
          confirmMessage = dialog.message();
          await dialog.accept();
          return;
        }

        if (dialog.type() === 'alert') {
          successMessage = dialog.message();
          await dialog.dismiss();
          finish();
          return;
        }

        fail(new Error(`Unexpected dialog type: ${dialog.type()}`));
      } catch (error) {
        fail(error);
      }
    }

    page.on('dialog', handleDialog);
  });

  await pressableClick(removeButton);
  await dialogsHandled;

  expect(confirmMessage).toContain('Remove from family?');
  expect(successMessage).toContain('Family updated');

  await expect(removedMember).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByTestId(`family-member-${remainingChildProfileId}`),
  ).toBeVisible();
});
