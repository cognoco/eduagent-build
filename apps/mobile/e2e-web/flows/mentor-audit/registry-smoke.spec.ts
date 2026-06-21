import { test, expect } from '@playwright/test';
import {
  mentorAuditScenarios,
  type MentorAuditScenario,
} from '../../fixtures/scenarios';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { seedScenario } from '../../helpers/test-seed';
import { applyMentorAuditStorageStateMutator } from '../../helpers/mentor-audit-storage-state';
import { apiBaseUrl, buildSeedEmail } from '../../helpers/runtime';

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
 * **Flag posture.** Release runs export the app with V2 enabled
 * (`EXPO_PUBLIC_ENABLE_MODE_NAV`, `_V1`, and `_V2` all true). Historical
 * V0/V1 matrix reruns are useful for legacy-shell changes, but the publish
 * gate for the mentor shell is the V2 posture.
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
        landingTestId: 'mentor-screen',
        landingPath: '/mentor',
      });
      const basePath = testInfo.outputPath(
        `mentor-audit-base-${scenario.key}.json`,
      );
      await page.context().storageState({ path: basePath });

      const mutatorResult = await applyMentorAuditStorageStateMutator({
        mutator: scenario.storageStateMutator,
        baseStorageStatePath: basePath,
        scenarioKey: scenario.key,
      });

      // Re-open the page with the mutated storage state and assert the
      // pre-shell landing testID renders.
      await page.context().clearCookies();
      const newContext = await page.context().browser()?.newContext({
        storageState: mutatorResult.storageStatePath,
      });
      if (!newContext) {
        throw new Error(
          'Browser context unavailable when applying mentor-audit storage-state mutator',
        );
      }
      // [BUG-779/780] Install the sessionStorage banner-state seed BEFORE
      // the first navigation. Playwright's storage-state file only carries
      // cookies + localStorage; the in-app peek reads sessionStorage which
      // must be primed via an init script. Without this the spec lands on
      // the home shell because the banner never renders.
      if (mutatorResult.sessionStorageInit) {
        await newContext.addInitScript(mutatorResult.sessionStorageInit);
      }
      const mutatedPage = await newContext.newPage();
      await mutatedPage.goto(scenario.landingPath);
      await expect(
        mutatedPage.getByTestId(scenario.landingTestId),
      ).toBeVisible();
      await newContext.close();
      // Verify the seed result is still available for downstream debugging.
      // `seedAndSignIn` appends a random suffix and `buildSeedEmail` hashes
      // long aliases, so exact email equality is intentionally not stable.
      expect(baseSeeded.scenario).toBe(scenario.seedScenario);
      expect(baseSeeded.email).toContain('@example.com');
      return;
    }

    if (scenario.seedScenario === 'mentor-audit-post-approval-redirect') {
      // [BUG-779] Consent approval is owned by the API consent-web flow
      // (apps/api/src/routes/consent-web.ts) — a server-rendered HTML page
      // at GET /consent-page?token=…, NOT a mobile Expo Router screen. Open
      // the URL against `apiBaseUrl` so the spec exercises the actual surface
      // a parent reaches by clicking the consent email link. The fixture's
      // `landingPath` is the suffix; the heading text in `landingTestId`
      // maps to the deterministic `<h1>Consent required for {child}</h1>`
      // the route emits (consent-web.ts:189) when the token is valid.
      const seeded = await seedScenario({
        scenario: scenario.seedScenario,
        email: buildSeedEmail(scenario.key),
      });
      const consentToken = seeded.ids.consentToken;
      expect(consentToken).toBeTruthy();
      const url = `${apiBaseUrl}${scenario.landingPath}?token=${encodeURIComponent(
        consentToken,
      )}`;
      await page.goto(url);
      // The consent-web HTML page has no testIDs; assert on the heading copy
      // which is the contract between consent-web.ts and this smoke.
      await expect(
        page.getByRole('heading', { name: /Consent required for/i }),
      ).toBeVisible();
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
