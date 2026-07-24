import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { installSeededProfileBootstrap } from '../../helpers/profile-bootstrap';
import { emulateNativeTopSafeArea } from '../../helpers/native-safe-area';
import { pressableClick } from '../../helpers/pressable';

test.describe.configure({ mode: 'serial' });

const LOCALIZED_SUPPORT_HUB_LABELS = fs
  .readdirSync(
    path.join(process.cwd(), 'apps', 'mobile', 'src', 'i18n', 'locales'),
  )
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'apps',
          'mobile',
          'src',
          'i18n',
          'locales',
          file,
        ),
        'utf8',
      ),
    ) as { scopeChip?: { supportHub?: unknown } };
    const hubLabel = catalog.scopeChip?.supportHub;
    if (typeof hubLabel !== 'string' || hubLabel.length === 0) {
      throw new Error(`${file} is missing scopeChip.supportHub`);
    }
    return { code: path.basename(file, '.json'), hubLabel };
  })
  .sort((left, right) => left.code.localeCompare(right.code));

let restoreSeedBoundary: (() => void) | undefined;

test.beforeEach(() => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    if (method === 'POST' && new URL(url).pathname === '/v1/__test/seed') {
      return new Response('error code: 1015 (synthetic parent seed limit)', {
        status: 429,
        statusText: 'Too Many Requests',
      });
    }

    return realFetch(input, init);
  };
  restoreSeedBoundary = () => {
    globalThis.fetch = realFetch;
  };
});

test.afterEach(() => {
  restoreSeedBoundary?.();
  restoreSeedBoundary = undefined;
});

async function openSeededParent(page: Page): Promise<void> {
  await installSeededProfileBootstrap(page, 'owner-with-children');
  await page.goto('/mentor', { waitUntil: 'commit' });
}

async function installLongSupporterScopes(page: Page): Promise<void> {
  await page.route('**/v1/scopes*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        shape: 'supporter',
        scopes: [
          { kind: 'supporter-hub' },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000201',
            edgeId: '00000000-0000-7000-a000-000000000301',
            displayName: 'Alexandria-Cassandra',
          },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000202',
            edgeId: '00000000-0000-7000-a000-000000000302',
            displayName: 'Maximilian-Theodore',
          },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000203',
            edgeId: '00000000-0000-7000-a000-000000000303',
            displayName: 'Christopher-Jonathan',
          },
          { kind: 'me' },
        ],
        defaultScopeIndex: 4,
      }),
    });
  });
}

async function applyScopeTextScale(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-testid^="scope-chip-option-"] * {
        font-size: 32px !important;
        line-height: 52px !important;
      }
    `,
  });
}

function relativeLuminance(rgb: string): number {
  const channels = rgb
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an rgb color, received ${rgb}`);
  }
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function textContrastRatio(control: Locator): Promise<number> {
  const colors = await control.evaluate((element) => {
    type Rgba = { red: number; green: number; blue: number; alpha: number };

    const parseColor = (value: string): Rgba => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) {
        throw new Error(`Expected an rgb color, received ${value}`);
      }
      return {
        red: channels[0],
        green: channels[1],
        blue: channels[2],
        alpha: channels[3] ?? 1,
      };
    };

    const composite = (front: Rgba, back: Rgba): Rgba => {
      const alpha = front.alpha + back.alpha * (1 - front.alpha);
      if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
      return {
        red:
          (front.red * front.alpha +
            back.red * back.alpha * (1 - front.alpha)) /
          alpha,
        green:
          (front.green * front.alpha +
            back.green * back.alpha * (1 - front.alpha)) /
          alpha,
        blue:
          (front.blue * front.alpha +
            back.blue * back.alpha * (1 - front.alpha)) /
          alpha,
        alpha,
      };
    };

    const text = [...element.querySelectorAll<HTMLElement>('*')].find(
      (candidate) =>
        candidate.children.length === 0 &&
        Boolean(candidate.textContent?.trim()),
    );
    if (!text) throw new Error('control does not contain rendered text');

    let resolvedBackground: Rgba = {
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0,
    };
    let current: HTMLElement | null = text.parentElement;
    while (current) {
      resolvedBackground = composite(
        resolvedBackground,
        parseColor(getComputedStyle(current).backgroundColor),
      );
      if (resolvedBackground.alpha >= 0.999) break;
      current = current.parentElement;
    }
    if (resolvedBackground.alpha < 0.999) {
      throw new Error('rendered text has no opaque painted background chain');
    }

    return {
      foreground: getComputedStyle(text).color,
      background: `rgb(${resolvedBackground.red}, ${resolvedBackground.green}, ${resolvedBackground.blue})`,
    };
  });
  const foreground = relativeLuminance(colors.foreground);
  const background = relativeLuminance(colors.background);
  return (
    (Math.max(foreground, background) + 0.05) /
    (Math.min(foreground, background) + 0.05)
  );
}

async function expectTopmostAtCenter(locator: Locator): Promise<void> {
  await expect
    .poll(async () => {
      return locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const topmost = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return Boolean(
          topmost && (topmost === element || element.contains(topmost)),
        );
      });
    })
    .toBe(true);
}

test('J-03 seeded parent lands on the V2 mentor shell @smoke', async ({
  page,
}) => {
  await openSeededParent(page);

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('account-avatar-shell')).toBeVisible();
  await expect(page.getByTestId('tab-mentor')).toBeVisible();
  await expect(page.getByTestId('tab-subjects')).toBeVisible();
  await expect(page.getByTestId('tab-journal')).toBeVisible();
});

test('J-03 parent V2 shell does not render the retired mode switcher @smoke', async ({
  page,
}) => {
  await openSeededParent(page);

  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mode-switcher')).toHaveCount(0);
  await expect(page.getByTestId('parent-home-screen')).toHaveCount(0);
});

test('J-03 360px long supporter scopes remain operable and clear pushed content @smoke', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 760 });
  await emulateNativeTopSafeArea(page, 47);
  await installLongSupporterScopes(page);
  await openSeededParent(page);
  await applyScopeTextScale(page);

  const scopeShell = page.getByTestId('scope-chip-shell');
  const scopeChip = page.getByTestId('scope-chip');
  const avatarShell = page.getByTestId('account-avatar-shell');
  const avatarButton = page.getByTestId('account-avatar-button');
  await expect(scopeChip).toBeVisible({ timeout: 60_000 });

  const overflow = await scopeChip.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: window.getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.overflowX).toMatch(/auto|scroll/);

  const [scopeShellBox, avatarShellBox] = await Promise.all([
    scopeShell.boundingBox(),
    avatarShell.boundingBox(),
  ]);
  expect(scopeShellBox).not.toBeNull();
  expect(avatarShellBox).not.toBeNull();
  expect(scopeShellBox!.y).toBeCloseTo(55, 0);
  expect(avatarShellBox!.y).toBeCloseTo(55, 0);
  expect(scopeShellBox!.x + scopeShellBox!.width).toBeLessThanOrEqual(
    avatarShellBox!.x - 8,
  );
  const avatarButtonBox = await avatarButton.boundingBox();
  expect(avatarButtonBox).not.toBeNull();
  expect(avatarButtonBox!.width).toBeGreaterThanOrEqual(44);
  expect(avatarButtonBox!.height).toBeGreaterThanOrEqual(44);
  await expectTopmostAtCenter(avatarButton);
  await expect(scopeShell).toHaveCSS('z-index', '40');
  await expect(avatarShell).toHaveCSS('z-index', '40');

  const options = page.locator('[data-testid^="scope-chip-option-"]');
  await expect(options).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const option = options.nth(index);
    await option.scrollIntoViewIfNeeded();
    const optionBox = await option.boundingBox();
    expect(optionBox).not.toBeNull();
    expect(optionBox!.width).toBeGreaterThanOrEqual(44);
    expect(optionBox!.height).toBeGreaterThanOrEqual(44);
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(
      avatarShellBox!.x,
    );
    await option.click();
    await expect(option).toHaveClass(/bg-primary/);
    await expect(
      page.locator('[data-testid^="scope-chip-option-"].bg-primary'),
    ).toHaveCount(1);
  }

  const selectedScope = page.locator(
    '[data-testid^="scope-chip-option-"].bg-primary',
  );
  await expectTopmostAtCenter(selectedScope);
  expect(await textContrastRatio(selectedScope)).toBeGreaterThanOrEqual(3);
  expect(await textContrastRatio(avatarButton)).toBeGreaterThanOrEqual(3);

  await avatarButton.click();
  await expect(page).toHaveURL(/\/account(?:\?.*)?$/);
  await expect(page.getByTestId('account-screen')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId('account-back').click();
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.goto('/more/account', { waitUntil: 'commit' });
  await applyScopeTextScale(page);
  const accountHeading = page.getByRole('heading', { name: 'Account' });
  const accountContent = page.getByTestId('more-account-scroll');
  await expect(accountHeading).toBeVisible({ timeout: 60_000 });
  await expect(accountContent).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(
      async () => {
        const [chipBox, avatarBox, headingBox, contentBox] = await Promise.all([
          scopeShell.boundingBox(),
          avatarShell.boundingBox(),
          accountHeading.boundingBox(),
          accountContent.boundingBox(),
        ]);
        if (!chipBox || !avatarBox || !headingBox || !contentBox) return null;
        const chromeBottom = Math.max(
          chipBox.y + chipBox.height,
          avatarBox.y + avatarBox.height,
        );
        return {
          contentClearsHeader:
            contentBox.y >= headingBox.y + headingBox.height - 0.5,
          headingClearsChrome: headingBox.y >= chromeBottom - 0.5,
          tallerThanAvatar: chipBox.height > avatarBox.height,
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({
      contentClearsHeader: true,
      headingClearsChrome: true,
      tallerThanAvatar: true,
    });
});

test('J-03 360px longest localized supporter labels clear native chrome and Mentor copy @smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await emulateNativeTopSafeArea(page, 47);
  await installLongSupporterScopes(page);
  await openSeededParent(page);

  for (const locale of LOCALIZED_SUPPORT_HUB_LABELS) {
    await page.goto('/more/account', { waitUntil: 'commit' });
    await expect(page.getByTestId('more-account-scroll')).toBeVisible({
      timeout: 60_000,
    });
    await pressableClick(page.getByTestId('settings-app-language'));
    await expect(page.getByTestId('app-language-backdrop')).toBeVisible({
      timeout: 15_000,
    });
    await pressableClick(page.getByTestId(`language-option-${locale.code}`));
    await expect(page.getByTestId('app-language-backdrop')).not.toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/mentor', { waitUntil: 'commit' });
    await applyScopeTextScale(page);

    const hubOption = page.getByTestId('scope-chip-option-supporter-hub');
    await expect(hubOption).toBeVisible({ timeout: 60_000 });
    await expect(hubOption).toHaveAccessibleName(locale.hubLabel);
    await expect(hubOption).toContainText(locale.hubLabel);
    await pressableClick(hubOption);

    const scopeShell = page.getByTestId('scope-chip-shell');
    const avatarShell = page.getByTestId('account-avatar-shell');
    const heading = page.getByTestId('support-hub-mentor-heading');
    const subtitle = page.getByTestId('support-hub-mentor-subtitle');
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(subtitle).toBeVisible();

    await expect
      .poll(async () => {
        const [scopeBox, avatarBox, hubBox, headingBox, subtitleBox] =
          await Promise.all([
            scopeShell.boundingBox(),
            avatarShell.boundingBox(),
            hubOption.boundingBox(),
            heading.boundingBox(),
            subtitle.boundingBox(),
          ]);
        if (!scopeBox || !avatarBox || !hubBox || !headingBox || !subtitleBox) {
          return null;
        }
        const chromeBottom = Math.max(
          scopeBox.y + scopeBox.height,
          avatarBox.y + avatarBox.height,
        );
        return {
          headingClearsChrome: headingBox.y >= chromeBottom - 0.5,
          hubClearsAvatar: hubBox.x + hubBox.width <= avatarBox.x - 8,
          hubTargetHeight: hubBox.height >= 44,
          subtitleClearsHeading:
            subtitleBox.y >= headingBox.y + headingBox.height - 0.5,
        };
      })
      .toEqual({
        headingClearsChrome: true,
        hubClearsAvatar: true,
        hubTargetHeight: true,
        subtitleClearsHeading: true,
      });
  }
});

test('J-03 normal-width tablet and desktop scope strips remain one vertically-contained row @smoke', async ({
  page,
}) => {
  const viewports = [
    { height: 1024, surface: 'tablet', width: 768 },
    { height: 1080, surface: 'desktop', width: 1440 },
  ];
  await page.setViewportSize(viewports[0]);
  await installLongSupporterScopes(page);
  await openSeededParent(page);

  const scopeChip = page.getByTestId('scope-chip');
  const scopeShell = page.getByTestId('scope-chip-shell');
  const avatarShell = page.getByTestId('account-avatar-shell');
  const options = page.locator('[data-testid^="scope-chip-option-"]');
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(scopeChip).toBeVisible({ timeout: 60_000 });
    await expect(options).toHaveCount(5);

    const rowGeometry = await options.evaluateAll((elements) => {
      const boxes = elements.map((element) => element.getBoundingClientRect());
      const top = Math.min(...boxes.map((box) => box.top));
      const bottom = Math.max(...boxes.map((box) => box.bottom));
      return {
        bottomSpread:
          Math.max(...boxes.map((box) => box.bottom)) -
          Math.min(...boxes.map((box) => box.bottom)),
        rowHeight: bottom - top,
        topSpread:
          Math.max(...boxes.map((box) => box.top)) -
          Math.min(...boxes.map((box) => box.top)),
      };
    });
    expect(rowGeometry.topSpread, viewport.surface).toBeLessThanOrEqual(1);
    expect(rowGeometry.bottomSpread, viewport.surface).toBeLessThanOrEqual(1);

    const chipGeometry = await scopeChip.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(
      chipGeometry.scrollHeight - chipGeometry.clientHeight,
      viewport.surface,
    ).toBeLessThanOrEqual(1);
    expect(rowGeometry.rowHeight, viewport.surface).toBeLessThanOrEqual(
      chipGeometry.clientHeight + 1,
    );

    const [scopeBox, avatarBox] = await Promise.all([
      scopeShell.boundingBox(),
      avatarShell.boundingBox(),
    ]);
    expect(scopeBox, viewport.surface).not.toBeNull();
    expect(avatarBox, viewport.surface).not.toBeNull();
    expect(scopeBox!.y, viewport.surface).toBeCloseTo(avatarBox!.y, 0);
    expect(scopeBox!.x + scopeBox!.width, viewport.surface).toBeLessThanOrEqual(
      avatarBox!.x - 8,
    );
    await expectTopmostAtCenter(options.first());
  }
});
