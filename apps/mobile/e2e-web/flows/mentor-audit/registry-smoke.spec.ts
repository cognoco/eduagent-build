import { test, expect } from '@playwright/test';
import {
  mentorAuditScenarios,
  type MentorAuditScenario,
} from '../../fixtures/scenarios';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { seedScenario } from '../../helpers/test-seed';
import { applyMentorAuditStorageStateMutator } from '../../helpers/mentor-audit-storage-state';
import { buildSeedEmail } from '../../helpers/runtime';

/**
 * Mentor Chrome audit — registry smoke
 * (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md, Task 5)
 *
 * One spec per registry entry. Seeds the scenario, signs in (or applies the
 * scenario's storage-state mutator for pre-shell entries), and asserts the
 * documented `landingTestId` is visible on the first screen.
 *
 * **Why this exists:** the audit re-run procedure depends on every
 * `mentor-audit-*` scenario landing the user on the expected screen. When a
 * navigation contract change re-routes a learner to the parent shell, or a
 * paywall is moved behind a different route, the audit silently goes stale —
 * blocked rows get marked "still blocked" when they should be marked
 * "regressed". This smoke project converts that drift into a CI failure.
 *
 * **Opt-in only.** Not part of the default Playwright run; invoke explicitly
 * via `--project=mentor-audit-registry-smoke` (see playwright.config.ts).
 *
 * **Flag matrix.** Plan §"Navigation Contract Flag Matrix" requires the
 * guardian-shell scenarios to be exercised under both V0 and V1. The smoke
 * project flips `EXPO_PUBLIC_ENABLE_MODE_NAV_V1` via the
 * `MENTOR_AUDIT_NAV_V1` env var; CI runs the suite twice (once per flag
 * position). Pre-shell entries (`empty-adult`, `session-expired`,
 * `session-revoked`, `mfa-totp`) are flag-independent and only run once.
 */

const includeChromeOnly = process.env.PLAYWRIGHT_INCLUDE_CHROME_ONLY === '1';

const entries: Array<[string, MentorAuditScenario]> = Object.entries(
  mentorAuditScenarios,
).filter(([, scenario]) =>
  scenario.requiresChromeOnly ? includeChromeOnly : true,
);

for (const [registryName, scenario] of entries) {
  test(`mentor-audit landing: ${scenario.key}`, async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'mentor-audit-scenario',
      description: registryName,
    });

    if (scenario.storageStateMutator) {
      // Pre-shell scenarios capture a normal storage state first, then run
      // the named mutator. The signed-in capture step uses the regular
      // `seedAndSignIn` flow to produce a base state at a temp path, after
      // which the mutator writes the derived file the spec consumes via
      // `context.storageState()`.
      const baseSeeded = await seedAndSignIn(page, {
        scenario: scenario.seedScenario,
        alias: `${scenario.key}-base`,
        landingTestId: 'learner-screen',
        landingPath: '/home',
      });
      const basePath = testInfo.outputPath(
        `mentor-audit-base-${scenario.key}.json`,
      );
      await page.context().storageState({ path: basePath });

      const derivedPath = await applyMentorAuditStorageStateMutator({
        mutator: scenario.storageStateMutator,
        baseStorageStatePath: basePath,
        scenarioKey: scenario.key,
      });

      // Re-open the page with the mutated storage state and assert the
      // pre-shell landing testID renders.
      await page.context().clearCookies();
      const newContext = await page.context().browser()?.newContext({
        storageState: derivedPath,
      });
      if (!newContext) {
        throw new Error(
          'Browser context unavailable when applying mentor-audit storage-state mutator',
        );
      }
      const mutatedPage = await newContext.newPage();
      await mutatedPage.goto(scenario.landingPath);
      await expect(
        mutatedPage.getByTestId(scenario.landingTestId),
      ).toBeVisible();
      await newContext.close();
      // Verify the seed result is still available for downstream debugging.
      expect(baseSeeded.email).toBe(
        scenario.email.replace(/-base-[a-f0-9]+/, ''),
      );
      return;
    }

    if (scenario.seedScenario === 'mentor-audit-post-approval-redirect') {
      // The audit opens the consent-approve URL directly (mirrors the link a
      // parent clicks from email). Seed first, then navigate to the URL with
      // the returned token.
      const seeded = await seedScenario({
        scenario: scenario.seedScenario,
        email: buildSeedEmail(scenario.key),
      });
      const consentToken = seeded.ids.consentToken;
      expect(consentToken).toBeTruthy();
      await page.goto(
        `${scenario.landingPath}?token=${encodeURIComponent(consentToken)}`,
      );
      await expect(page.getByTestId(scenario.landingTestId)).toBeVisible();
      return;
    }

    await seedAndSignIn(page, {
      scenario: scenario.seedScenario,
      alias: scenario.key,
      landingTestId: scenario.landingTestId,
      landingPath: scenario.landingPath,
    });

    await expect(page.getByTestId(scenario.landingTestId)).toBeVisible();
  });
}
