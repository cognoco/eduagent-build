import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({
  storageState: path.join(authStateDir, 'non-owner-child.json'),
});

async function expectTestChildSubjectsScope(
  page: Page,
  subjectId: string,
): Promise<void> {
  await expect(page.getByTestId('subjects-screen')).toBeVisible();
  await expect(page.getByTestId('tab-subjects')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('account-avatar-button')).toHaveAttribute(
    'aria-label',
    'Open account settings for Test Child',
  );
  const subject = page.getByTestId(`subjects-browse-row-${subjectId}`);
  await expect(subject).toBeVisible();
  await expect(
    subject.getByText('Child Learning Data', { exact: true }),
  ).toBeVisible();
}

test('V2 credentialed non-owner child keeps permitted Account rows and has no owner-only administration', async ({
  page,
}) => {
  const seed = await readSeedData('v2-account-non-owner-child');
  const subjectId = seed.ids.subjectId;

  await page.goto('/subjects', { waitUntil: 'commit' });
  await expect(page.getByTestId('subjects-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expectTestChildSubjectsScope(page, subjectId);

  await page.getByTestId('account-avatar-button').click();
  await expect(page.getByTestId('account-screen')).toBeVisible();
  await expect(page.getByText('Test Child', { exact: true })).toBeVisible();

  for (const permittedRow of [
    'account-admin-learning-preferences',
    'account-admin-mentor-memory',
    'account-admin-mentor-language',
    'account-admin-profile',
    'account-admin-notifications',
    'account-admin-privacy',
    'account-admin-help',
    'account-admin-sign-out',
  ]) {
    await expect(page.getByTestId(permittedRow)).toBeVisible();
  }
  for (const ownerOnlyRow of [
    'account-admin-security',
    'account-admin-subscription',
    'account-admin-add-child',
    'account-admin-family-settings',
  ]) {
    await expect(page.getByTestId(ownerOnlyRow)).toHaveCount(0);
  }

  await page.getByTestId('account-back').click();
  await expect(page).toHaveURL(/\/subjects(?:\?.*)?$/);
  await expectTestChildSubjectsScope(page, subjectId);
});
