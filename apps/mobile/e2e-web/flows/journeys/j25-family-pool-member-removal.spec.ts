import { expect, test, type Dialog } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('BILLING-08 family owner removes a child from the family pool', async ({
  page,
}) => {
  test.setTimeout(150_000);

  const seeded = await seedAndSignIn(page, {
    scenario: 'wi-2194-stale-family-cycle',
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

  const expectCoherentFamilyQuota = async () => {
    await expect(page.getByText('14 / 1500 questions used')).toBeVisible();
    await expect(page.getByTestId('usage-family-aggregate')).toContainText(
      '14 / 1500',
    );
    await expect(page.getByText('1%')).toBeVisible();
    await expect(
      page.getByText(/1486 shared questions left this cycle/i),
    ).toBeVisible();
    const meter = page.getByRole('progressbar');
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '1500');
    await expect(meter).toHaveAttribute('aria-valuenow', '14');
    await expect(meter).toHaveAttribute(
      'aria-label',
      'Usage: 14 of 1500 questions used',
    );
  };

  await expectCoherentFamilyQuota();
  await page.reload();
  await waitForAppScreen(page, 'subscription-screen');
  await expectCoherentFamilyQuota();

  // Simulate the persisted active-profile switch that occurs on a shared
  // device. A member must not retain the owner's Family arithmetic; restoring
  // the owner after reload must re-fetch one coherent cycle.
  await page.evaluate((profileId) => {
    window.localStorage.setItem('mentomate_active_profile_id', profileId);
  }, childProfileId);
  await page.reload();
  await expect(page).not.toHaveURL(/\/subscription$/, { timeout: 30_000 });
  await expect(page.getByText('14 / 1500 questions used')).toHaveCount(0);
  await page.evaluate((profileId) => {
    window.localStorage.setItem('mentomate_active_profile_id', profileId);
  }, seeded.ids.parentProfileId);
  await page.goto('/subscription');
  await waitForAppScreen(page, 'subscription-screen');
  await expectCoherentFamilyQuota();

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

  // Removal triggers refetches, then a cold reload proves the server-owned
  // cycle remains coherent without transferring the removed child's usage to
  // the owner row.
  await page.reload();
  await waitForAppScreen(page, 'subscription-screen');
  const ownerUsage = page.getByTestId(
    `usage-profile-${seeded.ids.parentProfileId}`,
  );
  await expect(ownerUsage).toContainText('9 questions');
  const formerMemberUsage = page.getByTestId('usage-former-members');
  await expect(formerMemberUsage).toContainText('Former members');
  await expect(formerMemberUsage).toContainText('5 questions');
  await expect(page.getByTestId('usage-family-aggregate')).toContainText(
    '14 / 1500',
  );
  const postRemovalMeter = page.getByRole('progressbar');
  await expect(postRemovalMeter).toHaveAttribute('aria-valuemin', '0');
  await expect(postRemovalMeter).toHaveAttribute('aria-valuemax', '1500');
  await expect(postRemovalMeter).toHaveAttribute('aria-valuenow', '14');
  await expect(postRemovalMeter).toHaveAttribute(
    'aria-label',
    'Usage: 14 of 1500 questions used',
  );
});
