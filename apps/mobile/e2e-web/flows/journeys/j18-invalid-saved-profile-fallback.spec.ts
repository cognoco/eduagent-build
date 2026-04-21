import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-18 invalid saved profile falls back to the owner profile', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const parentProfileId = seed.ids.parentProfileId;

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mentomate_active_profile_id',
      '00000000-0000-4000-8000-000000000999'
    );
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.localStorage.getItem('mentomate_active_profile_id')
        ),
      { timeout: 30_000 }
    )
    .toBe(parentProfileId);
});
