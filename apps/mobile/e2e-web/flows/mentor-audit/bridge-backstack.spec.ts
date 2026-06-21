import { test, expect, type Page } from '@playwright/test';
import { mentorAuditScenarios } from '../../fixtures/scenarios';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { pressableClick } from '../../helpers/pressable';

/**
 * Mentor Chrome audit — BRIDGE-04 backstack contract
 * (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md §14)
 *
 * For each of the three Family Mentor entry surfaces (child topic, child
 * session, child recap):
 *   1. Deep-link into the child surface.
 *   2. Tap **Add to my learning** — confirms the bridge POST succeeds and
 *      the success toast renders.
 *   3. Tap the toast's **Open** action — opens the adult copy at
 *      `/topic/relearn`.
 *   4. `page.goBack()` — the user must land back on the original Family
 *      child/recap surface they came from, not on the Tabs first-route
 *      (`learner-screen`) and not on a proxy/child active-profile state.
 *
 * Why this exists separately from `registry-smoke.spec.ts`:
 * - The registry smoke verifies *landing* — what testID renders on first
 *   navigation after sign-in. BRIDGE-04 is about *back navigation* after
 *   a stack push, which the landing smoke cannot exercise.
 * - A regression here (e.g. the bridge stack push becomes `router.replace`,
 *   or the relearn screen rewrites the back target) would silently break
 *   the audit's BRIDGE-04 row without failing the landing smoke.
 *
 * Flag matrix: the back-target testIDs live on the entry screens themselves
 * (not the tab shell), so they are stable across V0 and V1 nav-contract
 * positions. CI runs the suite twice via `MENTOR_AUDIT_NAV_V1`; both
 * positions are expected to pass with no per-flag branching here.
 */

interface EntrySurface {
  key: 'topic' | 'session' | 'recap';
  /** Builds the deep-link URL from the seed ids. */
  buildPath(ids: Record<string, string>): string;
  /** TestID rendered on the entry screen — assertion target for both the
   *  initial load and the back-target after opening the adult copy. */
  entryTestId: string;
}

const ENTRY_SURFACES: EntrySurface[] = [
  {
    key: 'topic',
    buildPath: (ids) =>
      `/child/${ids.childProfileId}/topic/${ids.childTopicId}`,
    entryTestId: 'topic-detail-screen',
  },
  {
    key: 'session',
    buildPath: (ids) =>
      `/child/${ids.childProfileId}/session/${ids.childSessionId}`,
    entryTestId: 'session-metadata',
  },
  {
    key: 'recap',
    buildPath: (ids) => `/recaps/${ids.childRecapId}`,
    entryTestId: 'recap-detail-screen',
  },
];

async function exerciseBridgeBackstack(
  page: Page,
  surface: EntrySurface,
  ids: Record<string, string>,
): Promise<void> {
  const entryPath = surface.buildPath(ids);
  const entrySurface = page.getByTestId(surface.entryTestId);

  await page.goto(entryPath);
  if (!(await entrySurface.isVisible().catch(() => false))) {
    const switchCta = page.getByTestId('family-route-switch-cta');
    if (
      await switchCta
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await pressableClick(switchCta);
    }
  }
  await expect(
    entrySurface,
    `entry surface ${surface.key} did not render at ${entryPath}`,
  ).toBeVisible();
  const entryUrl = new URL(page.url()).pathname;

  // The bridge button is rendered conditionally on the navigation contract's
  // `showLearnThisToo` gate — make sure it's actually here before tapping it,
  // otherwise a regression in the gate would surface as a misleading
  // "toast never appeared" failure.
  const bridgeButton = page.getByTestId('add-to-my-learning-button');
  await expect(
    bridgeButton,
    `Add-to-my-learning button missing on ${surface.key} — bridge gate regressed?`,
  ).toBeVisible();
  await pressableClick(bridgeButton);

  // Success toast must render with the Open action — the action's testID is
  // the contract for the back-stack push we then unwind.
  const toast = page.getByTestId('add-to-my-learning-toast');
  await expect(toast).toBeVisible();
  const openAction = page.getByTestId('clone-toast-open');
  await expect(openAction).toBeVisible();
  await pressableClick(openAction);

  // Adult copy lives at /(app)/topic/relearn — verified at
  // apps/mobile/src/hooks/use-clone-from-child.ts:201-220. Asserting on the
  // URL (not a testID) keeps the probe robust against relearn screen
  // restructures that don't change the route.
  await expect(page).toHaveURL(/\/topic\/relearn(?:[/?]|$)/);

  // The hinge of BRIDGE-04: backing out of the adult copy must restore the
  // Family child/recap context, not the Tabs first-route. Use the browser
  // back button — the same surface a real user hits — rather than tapping
  // an in-screen back affordance.
  await page.goBack();

  // Back-target assertions:
  //   1. URL is the original entry path (not /home, not /library).
  //   2. The entry testID is visible (not learner-screen alone).
  await expect(page).toHaveURL((url) => url.pathname === entryUrl);
  await expect(
    entrySurface,
    `back-target regressed on ${surface.key}: expected ${surface.entryTestId}, found something else`,
  ).toBeVisible();
}

test.describe('Mentor audit BRIDGE-04 — bridge backstack contract', () => {
  // Each surface gets its own test + its own seed. Sharing a single seed
  // across surfaces would pollute the adult library after the first
  // Add-to-my-learning click, so the second + third surfaces would silently
  // exercise the "already exists" toast branch instead of the "new clone"
  // branch this contract cares about. Splitting also re-asserts the Family-mode
  // prerequisite per surface. The local seed now persists Family mode, while
  // deployed staging can still land in Study until that seed change ships.
  for (const surface of ENTRY_SURFACES) {
    test(`Add-to-my-learning → Open → goBack lands on the originating ${surface.key} surface`, async ({
      page,
    }) => {
      const scenario = mentorAuditScenarios.bridgeBackstack;

      const seeded = await seedAndSignIn(page, {
        scenario: scenario.seedScenario,
        // Per-surface alias prevents Clerk email collisions when the project
        // runs serially (fullyParallel: false on this Playwright project).
        alias: `${scenario.key}-${surface.key}`,
        landingTestId: ['parent-home-screen', 'learner-screen'],
        landingPath: scenario.landingPath,
      });

      await exerciseBridgeBackstack(page, surface, seeded.ids);
    });
  }
});
