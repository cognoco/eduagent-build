import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { signIn } from '../../helpers/auth';
import { pressableClick } from '../../helpers/pressable';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';

/**
 * J-33 [WI-2242] supporter <-> supportee link ceremony: two independent
 * logins (browser contexts, J-13's two-context pattern) drive the real
 * create -> accept -> accept sequence end to end via the UI, then chain into
 * J-29's post-acceptance shape.
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
 * [Disclosure] The Playwright web E2E harness does not run in this build
 * environment (no dev-server/staging DB reachable) — same constraint
 * documented in J-29/J-31/J-32 (`j29-supporter-scope-journey.spec.ts`,
 * `j31-supporter-coldstart-mount.spec.ts`,
 * `j32-supporter-self-learning-doorway.spec.ts`). This spec is written and
 * testID-verified against the source it exercises (`initiate.tsx`,
 * `[contractId].tsx`, `ContractCard.tsx`, `linking-ceremony.ts`,
 * `test-seed-v2-supporter.ts`'s `seedV2SupporterPendingLink`) but has NOT
 * been executed here — do not read a green run into this PR. The real,
 * DB-backed proof of the create -> accept -> accept sequence (including the
 * NO-EARLY-AUTH boundary and recovery variants) is
 * `test-seed-v2-supporter.integration.test.ts`'s
 * `[WI-2242] v2-supporter-pending-link seed` suite (runnable in CI against a
 * real DB); this journey proves the UI-level walk those server-side
 * assertions back.
 */
test('J-33 supporter <-> supportee: reach the link ceremony via deep-link initiate, both sides accept, chain into Support hub', async ({
  page,
  browser,
}) => {
  const suffix = randomBytes(2).toString('hex');
  const seeded = await seedScenario({
    scenario: 'v2-supporter-pending-link',
    email: buildSeedEmail(`j33-link-ceremony-${suffix}`),
  });

  const supporterPersonId = seeded.profileId;
  const supporteePersonId = seeded.ids.supporteePersonId;
  const supporteeEmail = seeded.ids.supporteeEmail;
  const supporteePassword = seeded.ids.supporteePassword;
  const contractId = seeded.ids.contractId;
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
  // supportee pre-filled. Screen-render only — the create this AC's happy
  // path names is exercised against the already-seeded pending contract
  // below, not resubmitted here (a second `initiateLink` call for the same
  // pair would just mint an unrelated, unused second edge).
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

    await supporteePage.goto(`/link/${contractId}`);
    await expect(
      supporteePage.getByTestId('visibility-link-screen'),
    ).toBeVisible();
    await pressableClick(
      supporteePage.getByTestId('visibility-contract-accept'),
    );
    await expect(
      supporteePage.getByTestId('visibility-link-review'),
    ).toBeVisible();
    await expect(
      supporteePage.getByTestId('visibility-contract-revoke'),
    ).toBeVisible();
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
  const journalPlaceholder = page.getByTestId(
    'person-scope-journal-placeholder',
  );
  await expect(journalPlaceholder).toBeVisible();
  await expect(
    journalPlaceholder.getByText(supporteeDisplayName),
  ).toBeVisible();
  await expect(page.getByTestId('visibility-shared-record')).toHaveCount(0);
  await expect(
    page.getByTestId('person-scope-journal-empty-lamp'),
  ).toBeVisible();
});
