import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

async function expectBelowFixedChrome(
  page: Page,
  content: Locator,
): Promise<void> {
  const chrome = page.getByTestId('account-avatar-shell');
  await expect(chrome).toBeVisible({ timeout: 60_000 });
  await expect(content).toBeVisible({ timeout: 60_000 });

  const [chromeBox, contentBox] = await Promise.all([
    chrome.boundingBox(),
    content.boundingBox(),
  ]);
  expect(chromeBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.y).toBeGreaterThanOrEqual(
    chromeBox!.y + chromeBox!.height - 0.5,
  );
  await expect(page.getByTestId('account-avatar-button')).toBeEnabled();
}

test('W-05 tab URLs render the correct screen on web', async ({ page }) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.goto('/library', { waitUntil: 'commit' });
  await expect(page.getByTestId(`shelf-row-header-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/progress', { waitUntil: 'commit' });
  await expect(page.getByText('My progress')).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/more', { waitUntil: 'commit' });
  await expect(page.getByTestId('more-row-account')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('more-row-privacy')).toBeVisible();
  await expect(page.getByTestId('more-row-help')).toBeVisible();
});

for (const viewport of [
  { name: 'wide', width: 1440, height: 1080 },
  { name: '360x760', width: 360, height: 760 },
]) {
  test(`W-05 pushed V2 routes clear fixed chrome at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    await page.goto('/mentor-memory', { waitUntil: 'commit' });
    const mentorMemoryBack = page.getByRole('button', { name: 'Go Back' });
    await expectBelowFixedChrome(page, mentorMemoryBack);

    await page.reload({ waitUntil: 'commit' });
    await expectBelowFixedChrome(
      page,
      page.getByRole('button', { name: 'Go Back' }),
    );

    await page.goto('/more/accommodation', { waitUntil: 'commit' });
    await expectBelowFixedChrome(page, page.getByTestId('accommodation-back'));

    await page.goto('/subscription', { waitUntil: 'commit' });
    await expectBelowFixedChrome(page, page.getByTestId('subscription-screen'));

    await page.goto('/more', { waitUntil: 'commit' });
    await expectBelowFixedChrome(
      page,
      page.getByText('More', { exact: true }).first(),
    );

    await pressableClick(page.getByTestId('more-row-account'));
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({
      timeout: 30_000,
    });
    await expectBelowFixedChrome(page, page.getByTestId('more-account-scroll'));

    await page.getByRole('link', { name: /back/i }).click();
    await expectBelowFixedChrome(
      page,
      page.getByText('More', { exact: true }).first(),
    );
    await expect(page).toHaveURL(/\/more(?:\?.*)?$/);
  });
}
