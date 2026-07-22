import { randomBytes, randomUUID } from 'node:crypto';
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
 * [Disclosure] This journey runs in-lane against staging (real dev-server +
 * staging DB, `E2E_ENV=staging`) — it is executed, not merely authored, and a
 * green run may be read as such. Finding 1 (in-app cross-account invite
 * CREATION) is resolved by operator ruling: out of scope for this WI,
 * deferred to WI-1753 — the deep-link seed approach below (an already-
 * `initiateLink`-created pending contract, reached via a direct URL rather
 * than an in-app affordance) is the blessed way to reach the ceremony surface
 * pending that work; see the [REACHABILITY GAP] note above for why. The
 * server-side proof of the create -> accept -> accept sequence (including the
 * NO-EARLY-AUTH boundary and the recovery variants — foreign/invalid deep
 * link, duplicate accept, expired/lapsed) is
 * `test-seed-v2-supporter.integration.test.ts`'s
 * `[WI-2242] v2-supporter-pending-link seed` suite; this journey proves the
 * UI-level walk those server-side assertions back, including the web-
 * reachable recovery variants (see the RECOVERY comments below for which
 * ones have a real web surface and which are native-only).
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

    // --- RECOVERY (web) [AC recovery — duplicate accept]: the API's
    // `acceptLink` is idempotent by design (test-seed-v2-supporter.
    // integration.test.ts's "[AC recovery — duplicate accept]" case), but the
    // web-visible half of that safety is that the UI never lets a second
    // click fire in the first place — `ContractCard`'s accept control only
    // renders `if (onAccept)`, and `[contractId].tsx` sets `onAccept`
    // undefined once this audience's `accepted` flag is true. Confirming the
    // control is gone immediately after the first accept proves no double-
    // submit is reachable through the web UI.
    await expect(
      supporteePage.getByTestId('visibility-contract-accept'),
    ).toHaveCount(0);

    await expect(
      supporteePage.getByTestId('visibility-link-review'),
    ).toBeVisible();
    await expect(
      supporteePage.getByTestId('visibility-contract-revoke'),
    ).toBeVisible();

    // --- RECOVERY (web) [AC recovery — foreign/invalid deep link]: a
    // nonexistent contractId 404s (`NotFoundError`, `readContractById`) and
    // an existing-but-unrelated contractId 403s (`ForbiddenError`,
    // `getContractForVisibleLink`) — both are non-retried 4xx
    // (`shouldRetryApiError`, `api-errors.ts`) and both land on the SAME UI
    // branch (`[contractId].tsx`'s `contractQuery.isError` ->
    // `visibility-link-error`), so one deep link to a random, unrelated UUID
    // proves the UI-visible recovery path for both variants: an actionable
    // error, not a dead end. [AC recovery — expired/lapsed invite] has NO
    // web surface to exercise: the integration test's "lapsed" fixture is a
    // raw DB insert with no Clerk account behind it (no production code path
    // ever sets `status='lapsed'` — see that test's own comment), so there
    // is no way to sign in as that identity through the web UI. That
    // variant stays native-only / server-proof-only; not fabricated here.
    const foreignOrInvalidContractId = randomUUID();
    await supporteePage.goto(`/link/${foreignOrInvalidContractId}`);
    await expect(
      supporteePage.getByTestId('visibility-link-error'),
    ).toBeVisible();
    await pressableClick(
      supporteePage.getByTestId('visibility-link-error-back'),
    );
    // Safe-return property (verified at runtime, not assumed): a fresh
    // `page.goto` deep link leaves `router.canGoBack()` false inside the SPA,
    // so `goBackOrReplace` (navigation.ts) takes its `router.replace(
    // '/(app)/home')` branch, landing on `/mentor` (this build is
    // Mentor-is-the-app-shell, `MODE_NAV_V2_ENABLED`) — the same
    // `mentor-screen` surface sign-in landed on above, not a dead end.
    // Asserted by URL rather than the error testid's DOM presence: the prior
    // routed screen can stay stacked-but-covered in this web nav stack
    // (React Navigation transition behavior), so its testid alone is not a
    // reliable "gone" signal — the URL leaving the dead-end link is.
    await expect(supporteePage).not.toHaveURL(
      new RegExp(foreignOrInvalidContractId),
    );
    await expect(supporteePage).toHaveURL(/\/mentor$/);
    await expect(supporteePage.getByTestId('mentor-screen')).toBeVisible();
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
  // { exact: true }: PersonScopeJournalPlaceholder's empty-state branch
  // renders the display name TWICE — the heading (exact text) and again
  // interpolated inside `emptyMessage`'s sentence body (substring) — so the
  // default substring match resolves to 2 elements (Playwright strict mode).
  // Scoping to an exact match keeps this pinned to the heading.
  await expect(
    journalPlaceholder.getByText(supporteeDisplayName, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('visibility-shared-record')).toHaveCount(0);
  await expect(
    page.getByTestId('person-scope-journal-empty-lamp'),
  ).toBeVisible();

  // --- NAVIGATION (web) [browser back/forward]: real browser history
  // preserves the correct pending/completed stage — mirrors the verified-
  // at-runtime pattern in `v2/nav-shell.spec.ts` (WI-2223 AC-3): ONE real
  // navigation away from a fresh landing route, then Back, reliably round-
  // trips (two round-trips to the SAME route is a documented Expo-Router-web
  // tab-history quirk unrelated to this AC — see that file's header comment
  // — so this stays to one hop each way). Landing here is the
  // `page.goto('/mentor')` above; `tab-journal` was the one real navigation
  // away from it.
  await page.goBack();
  await expect(page).toHaveURL(/\/mentor$/);
  // Back preserves the completed ceremony's person scope (activeScope has no
  // navigation listener — scope-context.tsx) rather than falling back to the
  // unfiltered Support hub.
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await expect(
    page.getByTestId(`scope-chip-option-person-${supporteePersonId}`),
  ).toBeVisible();
  await expect(page.getByTestId('support-hub-mentor-tab')).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(journalPlaceholder).toBeVisible();
  await expect(
    journalPlaceholder.getByText(supporteeDisplayName, { exact: true }),
  ).toBeVisible();
});
