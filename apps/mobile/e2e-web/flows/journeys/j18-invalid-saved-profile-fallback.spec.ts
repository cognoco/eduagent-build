import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-18 invalid saved profile falls back to the owner Study profile', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'parent-multi-child',
    alias: 'j18',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const parentProfileId = seed.ids.parentProfileId;

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mentomate_active_profile_id',
      '00000000-0000-4000-8000-000000000999',
    );
    window.localStorage.removeItem('parent-proxy-active');
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mode-switcher')).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.localStorage.getItem('mentomate_active_profile_id'),
        ),
      { timeout: 30_000 },
    )
    .toBe(parentProfileId);
});
