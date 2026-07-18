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

function subjectHubStateRoot(page: Page): Locator {
  return page
    .locator(
      '[data-testid="subject-hub-screen"], [data-testid="subject-hub-error"], [data-testid="subject-hub-stuck"], [data-testid="subject-hub-pick-book"], [data-testid="subject-hub-preparing"]',
    )
    .first();
}

async function expectNestedNavigatorOnSemanticBackground(
  page: Page,
  screenRoot: Locator,
): Promise<void> {
  await expect(screenRoot).toBeVisible({ timeout: 60_000 });

  const observation = await screenRoot.evaluate((element) => {
    const appRoot = document.querySelector<HTMLElement>(
      '[data-testid="app-root-view"]',
    );
    if (!appRoot) throw new Error('app-root-view is missing');

    const semanticBackground = getComputedStyle(appRoot)
      .getPropertyValue('--color-background')
      .trim();
    const probe = document.createElement('div');
    probe.style.backgroundColor = semanticBackground;
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();

    const backgrounds: Array<{
      tag: string;
      testID: string | null;
      value: string;
      style: string | null;
    }> = [];
    let current = element.parentElement;
    while (current && current !== appRoot) {
      const value = getComputedStyle(current).backgroundColor;
      backgrounds.push({
        tag: current.tagName,
        testID: current.getAttribute('data-testid'),
        value,
        style: current.getAttribute('style'),
      });
      current = current.parentElement;
    }

    const navigatorSceneIndex = backgrounds.findIndex(({ style }) =>
      style?.includes('display: flex'),
    );
    // React Navigation's web native-stack renders
    // Screen(background/display:flex) > content host > contentStyle. Probe the
    // contentStyle layer: when it is transparent, the light default Screen
    // background is what flashes behind a pushed dark-theme screen.
    const navigatorContent = backgrounds[navigatorSceneIndex - 2];
    return { expected, actual: navigatorContent?.value ?? null, backgrounds };
  });

  expect(
    observation.actual,
    `nested navigator scene background chain: ${JSON.stringify(observation.backgrounds)}`,
  ).toBe(observation.expected);
}

async function expectNestedNavigatorTransitionFramesStaySemantic(
  page: Page,
  {
    triggerTestId,
    sourceStateSelector,
    targetStateSelector,
    targetPathname,
  }: {
    triggerTestId: string;
    sourceStateSelector: string;
    targetStateSelector: string;
    targetPathname: string;
  },
): Promise<void> {
  const observation = await page.evaluate(
    async (options) => {
      const appRoot = document.querySelector<HTMLElement>(
        '[data-testid="app-root-view"]',
      );
      if (!appRoot) throw new Error('app-root-view is missing');

      const semanticBackground = getComputedStyle(appRoot)
        .getPropertyValue('--color-background')
        .trim();
      const probe = document.createElement('div');
      probe.style.backgroundColor = semanticBackground;
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();

      const navigatorBackground = (stateRoot: HTMLElement): string => {
        const ancestors: HTMLElement[] = [stateRoot];
        let current = stateRoot.parentElement;
        while (current && current !== appRoot) {
          ancestors.push(current);
          current = current.parentElement;
        }
        const sceneIndex = ancestors.findIndex((element) =>
          element.getAttribute('style')?.includes('display: flex'),
        );
        const navigatorContent = ancestors[sceneIndex - 2];
        if (navigatorContent) {
          return getComputedStyle(navigatorContent).backgroundColor;
        }

        // A top-level tab destination (Mentor) does not have the nested
        // native-stack contentStyle layer used by Account. In that case, sample
        // the first painted ancestor that is actually exposed after Account
        // disappears instead of manufacturing a missing nested layer.
        return (
          ancestors
            .map((element) => getComputedStyle(element).backgroundColor)
            .find(
              (background) =>
                background !== 'rgba(0, 0, 0, 0)' &&
                background !== 'transparent',
            ) ?? 'missing-painted-background'
        );
      };

      const sample = () => {
        const source = document.querySelector<HTMLElement>(
          options.sourceStateSelector,
        );
        const target = document.querySelector<HTMLElement>(
          options.targetStateSelector,
        );
        const roots = [
          ...new Set([source, target].filter(Boolean)),
        ] as HTMLElement[];
        return {
          targetPresent: Boolean(target),
          backgrounds: roots.map(navigatorBackground),
        };
      };

      const startingPathname = window.location.pathname;
      const trigger = document.querySelector<HTMLElement>(
        `[data-testid="${options.triggerTestId}"]`,
      );
      if (!trigger) {
        throw new Error(
          `transition trigger ${options.triggerTestId} is missing`,
        );
      }

      trigger.click();

      const frames: ReturnType<typeof sample>[] = [];
      let observedTargetRoute = false;

      for (let frame = 0; frame < 600; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (
          window.location.pathname !== startingPathname &&
          window.location.pathname === options.targetPathname
        ) {
          observedTargetRoute = true;
        }
        if (!observedTargetRoute) continue;

        frames.push(sample());
        if (frames.length >= 30) break;
      }

      return {
        expected,
        frames,
        observedTargetRoute,
        startingPathname,
        endingPathname: window.location.pathname,
      };
    },
    {
      triggerTestId,
      sourceStateSelector,
      targetStateSelector,
      targetPathname,
    },
  );

  expect(observation.startingPathname).not.toBe(targetPathname);
  expect(observation.observedTargetRoute).toBe(true);
  expect(observation.endingPathname).toBe(targetPathname);
  expect(observation.frames).toHaveLength(30);
  expect(observation.frames.every((frame) => frame.targetPresent)).toBe(true);
  expect(
    observation.frames.every((frame) => frame.backgrounds.length > 0),
  ).toBe(true);
  expect(observation.frames.flatMap((frame) => frame.backgrounds)).toEqual(
    Array(observation.frames.flatMap((frame) => frame.backgrounds).length).fill(
      observation.expected,
    ),
  );
}

async function expectV2ChromeInteractive(page: Page): Promise<void> {
  if (!v2Enabled) return;
  await expect(page.getByTestId('account-avatar-button')).toBeEnabled();
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

for (const colorScheme of ['dark', 'light'] as const) {
  for (const viewport of [
    { name: 'wide web', width: 1440, height: 1080, nativeTop: 0 },
    { name: '360x760 native-safe', width: 360, height: 760, nativeTop: 47 },
  ]) {
    test(`W-05 ${navigationShell} pushed nested scenes follow the system ${colorScheme} theme at ${viewport.name}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      if (viewport.nativeTop > 0) {
        await emulateNativeTopSafeArea(page, viewport.nativeTop);
      }

      const seed = await readSeedData('solo-learner');
      const subjectId = seed.ids.subjectId;
      if (!subjectId) {
        throw new Error('solo-learner seed did not return subjectId');
      }

      await page.goto(`/subject-hub/${subjectId}`, { waitUntil: 'commit' });
      await expectNestedNavigatorOnSemanticBackground(
        page,
        subjectHubStateRoot(page),
      );
      await expectV2ChromeInteractive(page);

      await page.reload({ waitUntil: 'commit' });
      await expectNestedNavigatorOnSemanticBackground(
        page,
        subjectHubStateRoot(page),
      );
      await expectV2ChromeInteractive(page);

      await page.goto('/practice', { waitUntil: 'commit' });
      await expectNestedNavigatorOnSemanticBackground(
        page,
        page.getByTestId('practice-screen'),
      );

      await page.goto('/account', { waitUntil: 'commit' });
      await expectNestedNavigatorOnSemanticBackground(
        page,
        page.getByTestId('account-screen'),
      );

      if (colorScheme === 'dark' && viewport.name === 'wide web') {
        await page.goto('/mentor', { waitUntil: 'commit' });
        await expect(page.getByTestId('mentor-screen')).toBeVisible({
          timeout: 60_000,
        });
        await expectNestedNavigatorTransitionFramesStaySemantic(page, {
          triggerTestId: 'account-avatar-button',
          sourceStateSelector: '[data-testid="mentor-screen"]',
          targetStateSelector: '[data-testid="account-screen"]',
          targetPathname: '/account',
        });
        await expect(page.getByTestId('account-screen')).toBeVisible({
          timeout: 60_000,
        });
        await expectNestedNavigatorTransitionFramesStaySemantic(page, {
          triggerTestId: 'account-back',
          sourceStateSelector: '[data-testid="account-screen"]',
          targetStateSelector: '[data-testid="mentor-screen"]',
          targetPathname: '/mentor',
        });
        await expect(page.getByTestId('mentor-screen')).toBeVisible({
          timeout: 60_000,
        });
      }
    });
  }
}

test('W-05 V2 subject-hub loading deep link keeps the active theme behind fixed chrome', async ({
  page,
}) => {
  test.skip(!v2Enabled, 'fixed V2 chrome is disabled in this shell');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 760 });

  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;
  if (!subjectId) throw new Error('solo-learner seed did not return subjectId');

  let releaseRequests: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseRequests = resolve;
  });
  let routeSettled: (() => void) | undefined;
  const settled = new Promise<void>((resolve) => {
    routeSettled = resolve;
  });
  const holdSubjectRequest: Parameters<typeof page.route>[1] = async (
    route,
  ) => {
    await held;
    try {
      await route.continue();
    } finally {
      routeSettled?.();
    }
  };
  await page.route('**/v1/subjects**', holdSubjectRequest);

  try {
    await page.goto(`/subject-hub/${subjectId}`, { waitUntil: 'commit' });
    const loading = page.getByTestId('subject-hub-error');
    await expect(loading).toHaveAttribute('role', 'progressbar');
    await expectNestedNavigatorOnSemanticBackground(page, loading);
    await expectV2ChromeInteractive(page);
  } finally {
    releaseRequests?.();
    await settled;
    await page.unroute('**/v1/subjects**', holdSubjectRequest);
  }
});

test('W-05 V2 subject-hub error deep link keeps the active theme behind fixed chrome', async ({
  page,
}) => {
  test.skip(!v2Enabled, 'fixed V2 chrome is disabled in this shell');
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.route('**/v1/subjects**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Synthetic failure',
      }),
    });
  });

  await page.goto('/subject-hub/synthetic-error-subject', {
    waitUntil: 'commit',
  });
  const error = page.getByTestId('subject-hub-error');
  await expect(error).toBeVisible({ timeout: 60_000 });
  await expect(error).not.toHaveAttribute('role', 'progressbar');
  await expectNestedNavigatorOnSemanticBackground(page, error);
  await expectV2ChromeInteractive(page);
});
