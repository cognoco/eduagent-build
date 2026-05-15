import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-21 parent manages child consent from child detail', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('consent-section')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('withdraw-consent-button'));

  await expect(page.getByTestId('grace-period-banner')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/deletion scheduled/i)).toBeVisible();

  await pressableClick(page.getByTestId('cancel-deletion-button'));
  await expect(page.getByTestId('withdraw-consent-button')).toBeVisible({
    timeout: 30_000,
  });
});
