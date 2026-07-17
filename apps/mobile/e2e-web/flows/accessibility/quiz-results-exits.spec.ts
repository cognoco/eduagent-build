import { expect, test, type Locator, type Page } from '@playwright/test';

const HOST_PATH = '/quiz/dev-only/results';
const NAVIGATION_LOG_KEY = 'e2e:quiz-results:navigation-log';

type ActivationMethod = 'Enter' | 'Space' | 'pointer';

interface NavigationCall {
  href: string | { pathname: string; params: Record<string, string> };
  method: 'push' | 'replace';
}

const actions = [
  {
    label: 'Play Again',
    testId: 'quiz-results-play-again',
    expectedCall: {
      href: '/(app)/quiz/launch',
      method: 'replace',
    },
    expectedPath: '/quiz/launch',
  },
  {
    label: 'Done',
    testId: 'quiz-results-done',
    expectedCall: {
      href: '/(app)/practice',
      method: 'replace',
    },
    expectedPath: '/practice',
  },
  {
    label: 'View History',
    testId: 'quiz-results-history',
    expectedCall: {
      href: {
        pathname: '/(app)/quiz/history',
        params: { returnTo: 'practice' },
      },
      method: 'push',
    },
    expectedPath: '/quiz/history',
    expectedReturnTo: 'practice',
  },
] as const;

const methods: ActivationMethod[] = ['Enter', 'Space', 'pointer'];

async function openHost(page: Page, freezeNavigation: boolean): Promise<void> {
  await page.goto(`${HOST_PATH}?freeze=${String(freezeNavigation)}`, {
    waitUntil: 'commit',
  });
  await expect(page.getByTestId('quiz-results-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(
    (key) => window.sessionStorage.removeItem(key),
    NAVIGATION_LOG_KEY,
  );
}

async function activate(
  target: Locator,
  method: ActivationMethod,
): Promise<void> {
  if (method === 'pointer') {
    await target.click();
    return;
  }

  await target.press(method);
}

async function dispatchDisabledRepeat(
  target: Locator,
  method: ActivationMethod,
): Promise<void> {
  await target.evaluate((element, activationMethod) => {
    if (activationMethod === 'pointer') {
      (element as HTMLElement).click();
      return;
    }

    const key = activationMethod === 'Enter' ? 'Enter' : ' ';
    element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }),
    );
    element.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key }),
    );
  }, method);
}

async function readNavigationCalls(page: Page): Promise<NavigationCall[]> {
  return page.evaluate(
    (key) =>
      JSON.parse(
        window.sessionStorage.getItem(key) ?? '[]',
      ) as NavigationCall[],
    NAVIGATION_LOG_KEY,
  );
}

test('quiz-results exits are real named buttons with exact-once web activation', async ({
  page,
}) => {
  await openHost(page, true);

  const screen = page.getByTestId('quiz-results-screen');
  const buttons = screen.getByRole('button');
  await expect(buttons).toHaveCount(3);
  const renderedButtons = await buttons.all();
  expect(
    await Promise.all(
      renderedButtons.map((button) => button.getAttribute('data-testid')),
    ),
  ).toEqual(actions.map((action) => action.testId));

  const playAgain = screen.getByRole('button', { name: 'Play Again' });
  const done = screen.getByRole('button', { name: 'Done' });
  const history = screen.getByRole('button', { name: 'View History' });
  await expect(playAgain).toHaveCount(1);
  await expect(done).toHaveCount(1);
  await expect(history).toHaveCount(1);

  await screen.evaluate((element) => {
    element.setAttribute('tabindex', '-1');
    (element as HTMLElement).focus();
  });
  await page.keyboard.press('Tab');
  await expect(playAgain).toBeFocused();
  const focusStyle = await playAgain.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).not.toBe('0px');
  await page.keyboard.press('Tab');
  await expect(done).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(history).toBeFocused();

  for (const action of actions) {
    for (const method of methods) {
      await test.step(`${action.label}: ${method} disables repeats`, async () => {
        await openHost(page, true);
        const target = page.getByRole('button', { name: action.label });
        await expect(target).toHaveCount(1);

        await activate(target, method);

        await expect(target).toHaveAttribute('aria-disabled', 'true');
        expect(await readNavigationCalls(page)).toEqual([action.expectedCall]);

        await dispatchDisabledRepeat(target, method);
        expect(await readNavigationCalls(page)).toEqual([action.expectedCall]);
      });

      await test.step(`${action.label}: ${method} reaches the intended route`, async () => {
        await openHost(page, false);
        const target = page.getByRole('button', { name: action.label });
        await expect(target).toHaveCount(1);

        await activate(target, method);

        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(action.expectedPath);
        if ('expectedReturnTo' in action) {
          await expect
            .poll(() => new URL(page.url()).searchParams.get('returnTo'))
            .toBe(action.expectedReturnTo);
        }
        expect(await readNavigationCalls(page)).toEqual([action.expectedCall]);
      });
    }
  }
});
