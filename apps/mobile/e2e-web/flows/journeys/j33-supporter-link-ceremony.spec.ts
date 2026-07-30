import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { signIn } from '../../helpers/auth';
import { pressableClick } from '../../helpers/pressable';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';

/**
 * J-33 [WI-2242] supporter <-> supportee link ceremony: two independent
 * logins (browser contexts, J-13's two-context pattern) prove initiate-screen
 * reachability, then drive both sides of the service-created pending contract
 * through acceptance via the UI and chain into J-29's post-acceptance shape.
 *
 * Seeded with `v2-supporter-pending-link` (test-seed-v2-supporter.ts) — a
 * supporter + ONE independent supportee identity with a contract already
 * initiated via the real `initiateLink` write path (status='pending', both
 * `supporter/supporteeAcceptedAt` null). Pre-acceptance, the supporter has
 * `shape:'learner'` (resolveScopesForPerson — zero ACCEPTED contracts, per
 * `acceptedVisibilityCondition`), so sign-in lands on the ordinary Mentor
 * screen, not the Support hub.
 *
 * [REACHABILITY GAP, WI-2242 map §E] No in-app affordance pushes a CROSS-ORG
 * *existing* supportee into `/link/initiate` — the picker's "existing teen"
 * option routes to family-join (WI-1753, gated `MODE_NAV_V2_ENABLED`), whose
 * accept surface does not exist yet. `initiate.tsx` places no org
 * restriction on a pre-filled `supporteePersonId` route param, so a deep
 * link is the only route reaching this screen for an existing supportee
 * today. This is a real product gap (PM's topology domain), scoped OUT of
 * WI-2242 (test-only, no new navigation) — this spec proves the CEREMONY
 * mechanism itself (initiateLink/acceptLink) is reachable and correct via
 * that deep link, which is what this AC's happy path names.
 *
 * [Disclosure] This journey is intended for the staging-backed explicit
 * Playwright lane. It covers the two-party ceremony plus browser history,
 * transport retry, terminal/foreign/invalid recovery, and safe V2 returns.
 * Real DB-backed scenario-state assertions live in
 * `test-seed-v2-supporter.integration.test.ts`; concurrent acceptance and
 * audit side-effect invariants live in `linking-ceremony.integration.test.ts`.
 */
test('J-33 supporter <-> supportee: reach the link ceremony via deep-link initiate, both sides accept, chain into Support hub', async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  const suffix = randomBytes(2).toString('hex');
  const seeded = await seedScenario({
    scenario: 'v2-supporter-pending-link',
    email: buildSeedEmail(`j33-link-ceremony-${suffix}`),
  });
  const foreignSeed = await seedScenario({
    scenario: 'v2-supporter-pending-link',
    email: buildSeedEmail(`j33-foreign-contract-${suffix}`),
  });

  const supporterPersonId = seeded.profileId;
  const supporteePersonId = seeded.ids.supporteePersonId;
  const supporteeEmail = seeded.ids.supporteeEmail;
  const supporteePassword = seeded.ids.supporteePassword;
  const contractId = seeded.ids.contractId;
  const lapsedContractId = seeded.ids.lapsedContractId;
  const foreignContractId = foreignSeed.ids.contractId;
  // Literal displayName set in test-seed-v2-supporter.ts's
  // seedV2SupporterPendingLink — used below to prove the SAME person/edge is
  // active post-acceptance, matching J-29's convention.
  const supporteeDisplayName = 'Test Supportee';

  // --- Supporter signs in and lands on the ordinary Mentor screen — the
  // pending contract seeded above grants no scope yet (shape:'learner').
  await signIn(page, {
    email: seeded.email,
    password: seeded.password,
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
    activeProfileId: supporterPersonId,
  });

  // --- REACHABILITY: deep-link into the initiate screen with the existing
  // supportee pre-filled. Screen-render only — the pending fixture already
  // exercised the real `initiateLink` write path and supplies the deterministic
  // contract ID used across both independent logins below.
  await page.goto(
    `/link/initiate?supporteePersonId=${supporteePersonId}&relation=other`,
  );
  await expect(
    page.getByTestId('visibility-link-initiate-screen'),
  ).toBeVisible();
  await expect(page.getByTestId('visibility-link-create')).toBeVisible();

  // --- CEREMONY: open the seeded pending contract and accept as supporter.
  // status stays 'pending' until the supportee also accepts
  // (linking-ceremony.ts's acceptLink flips status only once BOTH
  // supporterAcceptedAt/supporteeAcceptedAt are set).
  await page.goto(`/link/${contractId}`);
  await expect(page.getByTestId('visibility-link-screen')).toBeVisible();
  await pressableClick(page.getByTestId('visibility-contract-accept'));
  await expect(page.getByTestId('visibility-link-review')).toHaveCount(0);

  // --- Cross-login: the supportee signs in on an independent browser
  // context (J-13's two-context pattern, `journeys/
  // j13-consent-pending-parent-approval.spec.ts`) and accepts their own side.
  const supporteeContext = await browser.newContext();
  const supporteePage = await supporteeContext.newPage();
  try {
    await signIn(supporteePage, {
      email: supporteeEmail,
      password: supporteePassword,
      landingTestId: 'mentor-screen',
      landingPath: '/mentor',
      activeProfileId: supporteePersonId,
    });

    let failContractRequest = true;
    const contractRequestPattern = new RegExp(
      `/visibility/links/${contractId}/contract(?:\\?|$)`,
    );
    await supporteePage.route(contractRequestPattern, async (route) => {
      if (failContractRequest) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    // RECOVERY — network retry: the first contract read fails at transport,
    // then the same visible retry action succeeds after connectivity returns.
    await supporteePage.goto(`/link/${contractId}`);
    await expect(
      supporteePage.getByTestId('visibility-link-error'),
    ).toBeVisible();
    failContractRequest = false;
    await pressableClick(
      supporteePage.getByTestId('visibility-link-error-retry'),
    );
    await expect(
      supporteePage.getByTestId('visibility-link-screen'),
    ).toBeVisible();
    await pressableClick(
      supporteePage.getByTestId('visibility-contract-accept'),
    );
    await expect(
      supporteePage.getByTestId('visibility-contract-accept'),
    ).toHaveCount(0);
    await expect(
      supporteePage.getByTestId('visibility-link-review'),
    ).toBeVisible();
    await expect(
      supporteePage.getByTestId('visibility-contract-revoke'),
    ).toBeVisible();

    // RECOVERY — lapsed invite: the terminal contract is readable by the
    // party but cannot be accepted or treated as active, and Back returns to
    // the safe V2 Mentor root.
    await supporteePage.goto('/mentor');
    await supporteePage.goto(`/link/${lapsedContractId}`);
    await expect(
      supporteePage.getByTestId('visibility-link-screen'),
    ).toBeVisible();
    await expect(
      supporteePage.getByTestId('visibility-contract-accept'),
    ).toHaveCount(0);
    await expect(
      supporteePage.getByTestId('visibility-link-review'),
    ).toHaveCount(0);
    await pressableClick(supporteePage.getByTestId('visibility-link-back'));
    await expect(supporteePage).toHaveURL(/\/mentor$/);

    // RECOVERY — existing foreign and nonexistent contracts both fail closed
    // and offer the same safe V2 return.
    for (const inaccessibleId of [
      foreignContractId,
      '00000000-0000-7000-8000-000000000099',
    ]) {
      await supporteePage.goto(`/link/${inaccessibleId}`);
      await expect(
        supporteePage.getByTestId('visibility-link-error'),
      ).toBeVisible();
      await pressableClick(
        supporteePage.getByTestId('visibility-link-error-back'),
      );
      await expect(supporteePage).toHaveURL(/\/mentor$/);
      await expect(supporteePage.getByTestId('mentor-screen')).toBeVisible();
    }
  } finally {
    await supporteeContext.close();
  }

  // --- Back on the supporter's own context: reload to force a fresh GET
  // (the supportee's acceptance happened in a separate session/cache) and
  // confirm both sides now see the accepted contract.
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByTestId('visibility-link-review')).toBeVisible({
    timeout: 30_000,
  });

  // --- Chain into J-29's post-acceptance shape
  // (`j29-supporter-scope-journey.spec.ts`): the newly accepted supportee is
  // now reachable from the Support hub (resolveScopesForPerson's shape flips
  // 'learner' -> 'supporter' once >=1 accepted contract exists). This
  // fixture seeds no learning data for the supportee (identity spine only),
  // so the Journal renders the SAME honest empty state J-29 asserts for its
  // own empty-record supportee.
  await page.goto('/mentor');
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId(`support-hub-mentor-person-${supporteePersonId}`),
  ).toBeVisible();
  await pressableClick(
    page.getByTestId(`support-hub-mentor-open-${supporteePersonId}`),
  );
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await expect(
    page.getByTestId(`scope-chip-option-person-${supporteePersonId}`),
  ).toBeVisible();

  await pressableClick(page.getByTestId('tab-journal'));
  await expect(page).toHaveURL(/\/journal$/);
  const personJournal = page.getByTestId('person-scope-journal');
  await expect(personJournal).toBeVisible();
  await expect(
    personJournal.getByText(supporteeDisplayName, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('visibility-shared-record')).toHaveCount(0);
  await expect(
    page.getByTestId('person-scope-journal-empty-lamp'),
  ).toBeVisible();

  // NAVIGATION — a real browser Back/Forward round trip preserves the
  // completed ceremony's active person scope instead of falling into a
  // legacy Home/Recaps route.
  await page.goBack();
  await expect(page).toHaveURL(/\/mentor$/);
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await expect(
    page.getByTestId(`scope-chip-option-person-${supporteePersonId}`),
  ).toBeVisible();
  await expect(page.getByTestId('support-hub-mentor-tab')).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(journalPlaceholder).toBeVisible();

  // RECOVERY — revoke through the production supportee action, then prove
  // both the supportee's safe return and the supporter's fail-closed scope.
  const revocationContext = await browser.newContext();
  const revocationPage = await revocationContext.newPage();
  try {
    await signIn(revocationPage, {
      email: supporteeEmail,
      password: supporteePassword,
      landingTestId: 'mentor-screen',
      landingPath: '/mentor',
      activeProfileId: supporteePersonId,
    });
    await revocationPage.goto(`/link/${contractId}`);
    await expect(
      revocationPage.getByTestId('visibility-contract-revoke'),
    ).toBeVisible();
    await pressableClick(
      revocationPage.getByTestId('visibility-contract-revoke'),
    );
    await expect(revocationPage).toHaveURL(/\/mentor$/);
    await expect(revocationPage.getByTestId('mentor-screen')).toBeVisible();
    await expect(revocationPage.getByTestId('home-screen')).toHaveCount(0);
    await expect(revocationPage.getByTestId('recaps-screen')).toHaveCount(0);
  } finally {
    await revocationContext.close();
  }

  await page.goto('/mentor');
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('support-hub-mentor-tab')).toHaveCount(0);
});
