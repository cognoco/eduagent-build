import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';
import { emulateNativeTopSafeArea } from '../../helpers/native-safe-area';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

const v0Enabled = process.env.EXPO_PUBLIC_ENABLE_MODE_NAV === 'true';
const v1Enabled = process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 === 'true';
const v2Enabled = process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true';
const navigationShell = v2Enabled
  ? 'V2'
  : v1Enabled
    ? 'V1'
    : v0Enabled
      ? 'V0'
      : 'flags-off';

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

function mentorMemoryStateRoot(page: Page): Locator {
  return page
    .locator(
      '[data-testid="mentor-memory-screen"], [data-testid="mentor-memory-loading-screen"], [data-testid="mentor-memory-error-screen"]',
    )
    .first();
}

async function expectChildOwnedScreenAtNativeChromeBottom(
  page: Page,
  screenRoot: Locator,
): Promise<void> {
  const chrome = page.getByTestId('account-avatar-shell');
  await expect(chrome).toBeVisible({ timeout: 60_000 });
  await expect(screenRoot).toBeVisible({ timeout: 60_000 });

  const [chromeBox, screenBox, paddingTop] = await Promise.all([
    chrome.boundingBox(),
    screenRoot.boundingBox(),
    screenRoot.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingTop),
    ),
  ]);
  expect(chromeBox).not.toBeNull();
  expect(screenBox).not.toBeNull();
  expect(chromeBox!.y).toBeCloseTo(55, 0);
  expect(chromeBox!.y + chromeBox!.height).toBeCloseTo(99, 0);
  expect(screenBox!.y).toBeCloseTo(52, 0);
  expect(paddingTop).toBe(47);
  expect(screenBox!.y + paddingTop).toBeCloseTo(
    chromeBox!.y + chromeBox!.height,
    0,
  );
}

async function expectDirectScreenAtNativeSafeArea(
  screenRoot: Locator,
): Promise<void> {
  const screenContent = screenRoot.locator(':scope > *').first();
  await expect(screenRoot).toBeVisible({ timeout: 60_000 });
  await expect(screenContent).toBeVisible({ timeout: 60_000 });

  const [screenBox, contentBox, paddingTop] = await Promise.all([
    screenRoot.boundingBox(),
    screenContent.boundingBox(),
    screenRoot.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingTop),
    ),
  ]);
  expect(screenBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.y).toBeGreaterThanOrEqual(screenBox!.y + 46.5);
  expect(paddingTop).toBe(47);
}

test('W-05 tab URLs render the correct screen on web', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.goto('/library', { waitUntil: 'commit' });
  await expect(page.getByTestId('library-screen')).toBeVisible({
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

test(`W-05 native top=47 composes ${navigationShell} safe-area ownership across pushed routes`, async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await emulateNativeTopSafeArea(page, 47);

  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;
  const topicId = seed.ids.topicId;
  if (!subjectId || !topicId) {
    throw new Error('solo-learner seed did not return subjectId/topicId');
  }

  if (!v2Enabled) {
    await page.goto('/mentor-memory', { waitUntil: 'commit' });
    await expectDirectScreenAtNativeSafeArea(mentorMemoryStateRoot(page));

    await page.goto('/more/accommodation', { waitUntil: 'commit' });
    await expectDirectScreenAtNativeSafeArea(
      page.getByTestId('accommodation-screen'),
    );

    await page.goto('/subscription', { waitUntil: 'commit' });
    await expectDirectScreenAtNativeSafeArea(
      page.getByTestId('subscription-screen'),
    );

    await page.goto(`/subject/${subjectId}`, { waitUntil: 'commit' });
    await expectDirectScreenAtNativeSafeArea(
      page.getByTestId('subject-settings-back').locator('xpath=../..'),
    );

    await page.goto(`/topic/${topicId}?subjectId=${subjectId}`, {
      waitUntil: 'commit',
    });
    await expectDirectScreenAtNativeSafeArea(
      page.getByTestId('topic-detail-back').locator('xpath=../..'),
    );

    await page.goto('/my-notes', { waitUntil: 'commit' });
    await expectDirectScreenAtNativeSafeArea(page.getByTestId('my-notes-hub'));

    await expect(page.getByTestId('account-avatar-shell')).toHaveCount(0);
    return;
  }

  await page.goto('/mentor-memory', { waitUntil: 'commit' });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    mentorMemoryStateRoot(page),
  );

  await page.goto('/more/accommodation', { waitUntil: 'commit' });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    page.getByTestId('accommodation-screen'),
  );

  await page.goto('/subscription', { waitUntil: 'commit' });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    page.getByTestId('subscription-screen'),
  );

  await page.goto(`/subject/${subjectId}`, { waitUntil: 'commit' });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    page.getByTestId('subject-settings-back').locator('xpath=../..'),
  );

  await page.goto(`/topic/${topicId}?subjectId=${subjectId}`, {
    waitUntil: 'commit',
  });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    page.getByTestId('topic-detail-back').locator('xpath=../..'),
  );

  await page.goto('/my-notes', { waitUntil: 'commit' });
  await expectChildOwnedScreenAtNativeChromeBottom(
    page,
    page.getByTestId('my-notes-hub'),
  );

  await page.goto('/more/account', { waitUntil: 'commit' });
  const chrome = page.getByTestId('account-avatar-shell');
  const title = page.getByRole('heading', { name: 'Account' });
  const content = page.getByTestId('more-account-scroll');
  await expect(title).toBeVisible({ timeout: 60_000 });
  await expect(content).toBeVisible({ timeout: 60_000 });

  const [chromeBox, titleBox, contentBox] = await Promise.all([
    chrome.boundingBox(),
    title.boundingBox(),
    content.boundingBox(),
  ]);
  expect(chromeBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(chromeBox!.y).toBeCloseTo(55, 0);
  expect(chromeBox!.y + chromeBox!.height).toBeCloseTo(99, 0);
  expect(titleBox!.y).toBeGreaterThanOrEqual(98.5);
  expect(contentBox!.y).toBeGreaterThanOrEqual(
    titleBox!.y + titleBox!.height - 0.5,
  );
});
