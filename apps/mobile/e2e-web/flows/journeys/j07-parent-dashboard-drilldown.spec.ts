import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import {
  enterFamilyHome,
  pressFamilyHomeAction,
} from '../../helpers/parent-home';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-07 parent → child progress → session recap → back to parent home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const sessionId = seed.ids.session1Id;

  await page.goto('/home', { waitUntil: 'commit' });

  await pressFamilyHomeAction(
    page,
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
    { timeout: 60_000 },
  );
  await waitForAppScreen(page, 'child-detail-scroll', {
    timeout: 30_000,
    familyRouteRecovery: async () => {
      await pressFamilyHomeAction(
        page,
        page.getByTestId(`parent-home-check-child-${childProfileId}`),
        { timeout: 30_000 },
      );
    },
  });

  await page.goto(`/child/${childProfileId}/session/${sessionId}`, {
    waitUntil: 'commit',
  });
  await waitForAppScreen(page, 'session-detail-ctas', {
    timeout: 90_000,
    familyRouteRecovery: async () => {
      await enterFamilyHome(page, { timeout: 30_000 });
      await page.goto(`/child/${childProfileId}/session/${sessionId}`, {
        waitUntil: 'commit',
      });
    },
    screenRetryTestId: 'retry-session',
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('tab-home'));
  await enterFamilyHome(page, { timeout: 30_000 });
});
