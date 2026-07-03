import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressFamilyHomeAction } from '../../helpers/parent-home';

// WI-1317: real, assertion-bearing coverage for the child-subject route
// (apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx).
// Opt-in project (see playwright.config.ts → 'child-subject-detail') — NOT
// part of test:e2e:web:smoke, so it never runs in the CI-required
// "Playwright web smoke" check. Run manually against staging via:
//   doppler run -c stg -- pnpm exec playwright test \
//     -c apps/mobile/playwright.config.ts --project=child-subject-detail

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('W-06 child-subject route renders the seeded topic list', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const subjectId = seed.ids.subject1Id;

  const enterFamilyHomeForChild = async (): Promise<void> => {
    await pressFamilyHomeAction(
      page,
      page.getByTestId(`parent-home-check-child-${childProfileId}`),
      { timeout: 30_000 },
    );
  };

  // Land on family home and confirm the guardian app-context is active
  // before the direct child-subject navigation below — a cold page.goto
  // straight to a child/ route can race the persisted app-context
  // (mirrors the established pattern in j07-parent-dashboard-drilldown).
  await page.goto('/home', { waitUntil: 'commit' });
  await enterFamilyHomeForChild();
  await waitForAppScreen(page, 'child-detail-scroll', {
    timeout: 30_000,
    familyRouteRecovery: enterFamilyHomeForChild,
  });

  await page.goto(`/child/${childProfileId}/subjects/${subjectId}`, {
    waitUntil: 'commit',
  });
  await waitForAppScreen(page, 'subject-topics-scroll', {
    timeout: 60_000,
    familyRouteRecovery: async () => {
      await enterFamilyHomeForChild();
      await page.goto(`/child/${childProfileId}/subjects/${subjectId}`, {
        waitUntil: 'commit',
      });
    },
  });

  // The seeded "Mathematics" subject (test-seed.ts seedParentMultiChild)
  // has 3 curriculum topics, but getChildSubjectTopics
  // (apps/api/src/services/dashboard.ts) only returns topics with >= 1
  // exchange ("topics with no sessions have no connection to the student").
  // Only "Mathematics Topic 1" has the seeded session (exchangeCount: 10,
  // status 'completed'), so exactly 1 topic card is the real, correct
  // render — not the empty-state fallback. Note: the prior child-detail
  // screen's subject card (also titled "Mathematics") stays mounted in the
  // DOM by React Navigation's web stack, so a bare `getByText('Mathematics')`
  // is ambiguous — the topic title below is unique to this route.
  const topicCards = page.locator('[data-testid^="topic-card-"]');
  await expect(topicCards).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId('topics-empty')).toHaveCount(0);
  await expect(page.getByText('Mathematics Topic 1')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Completed')).toBeVisible({ timeout: 30_000 });
});
