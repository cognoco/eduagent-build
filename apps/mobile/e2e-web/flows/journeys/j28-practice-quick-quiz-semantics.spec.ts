import { expect, test, type Locator, type Page } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test.use({ hasTouch: true });

async function openPractice(page: Page) {
  await page.goto('/practice', { waitUntil: 'commit' });
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
}

async function expectDirectLaunch(
  page: Page,
  activityType: 'capitals' | 'guess_who',
) {
  await expect(page).toHaveURL(
    new RegExp(`/quiz/launch\\?.*activityType=${activityType}(?:&|$)`),
  );
}

async function expectMinimumTouchTarget(action: Locator) {
  const box = await action.boundingBox();
  expect(box, 'the localized action has a rendered box').not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ page }) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-complete',
    alias: 'wi-2191',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
});

for (const viewport of [
  { name: 'narrow', width: 320, height: 800 },
  { name: 'wide', width: 1440, height: 1080 },
]) {
  test(`[WI-2191] ${viewport.name} web layout has a labelled group with non-nested 44px actions`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openPractice(page);

    const group = page.getByRole('group', { name: 'Quick quiz' });
    const browse = page.getByTestId('practice-quiz');
    const capitals = page.getByTestId('practice-quiz-capitals');
    const guessWho = page.getByTestId('practice-quiz-guess-who');

    await expect(group).toBeVisible();
    await expect(browse).toHaveRole('button');
    await expect(capitals).toHaveRole('button');
    await expect(guessWho).toHaveRole('button');
    await expectMinimumTouchTarget(capitals);
    await expectMinimumTouchTarget(guessWho);

    expect(
      await group
        .locator('button button, [role="button"] [role="button"]')
        .count(),
    ).toBe(0);
    expect(
      await group
        .locator('[data-testid^="practice-quiz"]')
        .evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute('data-testid'))
            .filter(
              (testID) =>
                testID === 'practice-quiz' ||
                testID === 'practice-quiz-capitals' ||
                testID === 'practice-quiz-guess-who',
            ),
        ),
    ).toEqual([
      'practice-quiz',
      'practice-quiz-capitals',
      'practice-quiz-guess-who',
    ]);
  });
}

test('[WI-2191] pointer, keyboard, and touch launch only the chosen quick-quiz route', async ({
  page,
}) => {
  await openPractice(page);

  await pressableClick(page.getByTestId('practice-quiz-capitals'));
  await expectDirectLaunch(page, 'capitals');

  await openPractice(page);
  await page.getByTestId('practice-quiz-guess-who').press('Enter');
  await expectDirectLaunch(page, 'guess_who');

  await openPractice(page);
  await page.getByTestId('practice-quiz').press('Space');
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/quiz(?:\?|$)/);

  await openPractice(page);
  await page.getByTestId('practice-quiz-guess-who').tap();
  await expectDirectLaunch(page, 'guess_who');
});
