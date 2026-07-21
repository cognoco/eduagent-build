import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

/**
 * J-32 [WI-2243] supporter self-learning doorway + Me-scope persistence:
 * Support hub -> Me scope (equal scope, reached via the scope chip once the
 * supporter has own learning state) -> resume own subject -> Subjects tab ->
 * relaunch (page reload) preserves Me -> switch to the accepted supportee ->
 * switch back to Me, walls holding both directions.
 *
 * Seeded with `v2-supporter-self-learning-active` (test-seed-v2-supporter.ts)
 * — an accepted supportee edge PLUS a real subject+session already on the
 * supporter's own personId, so `resolveScopesForPerson` already lists 'me'
 * (scope-resolution.ts's `hasFirstRealLearningState`) and the scope chip's
 * Me option is reachable from the very first render — the "becomes an equal
 * scope thereafter" state (V2 shell spec §4.2), which also means the
 * SupporterSelfLearningDoorway itself must NOT render here (AC-1's gate:
 * `!availableScopes.some(s => s.kind === 'me')`) — its own activation flow
 * (first tap, no prior learning) is covered directly by
 * `SupporterSelfLearningDoorway.test.tsx` (RTL, real component, executed)
 * and the coexistence seam by `SupportHubMentorTab.test.tsx`'s
 * `[WI-2243] SupporterColdStart + SupporterSelfLearningDoorway coexistence`
 * suite (RTL, real mounted tree, executed — red/green evidence in
 * `apps/mobile/src/components/support/wi2243-rgr-evidence.md`). This journey
 * instead proves the state those unit tests can't reach: real navigation,
 * a real page reload, and the scope-isolation walls, end to end.
 *
 * [Disclosure] The Playwright web E2E harness does not run in this build
 * environment (no dev-server/staging DB reachable) — same constraint
 * documented in J-29/J-31 (`j29-supporter-scope-journey.spec.ts`,
 * `j31-supporter-coldstart-mount.spec.ts`). This spec is written and
 * testID-verified against the source it exercises
 * (SupportHubMentorTab.tsx, ScopeChip.tsx, scope-context.tsx, subjects.tsx,
 * test-seed-v2-supporter.ts's seedV2SupporterSelfLearningActive) but has NOT
 * been executed here — do not read a green run into this PR. The seed
 * itself and the scope-isolation walls it asserts here (own subject absent
 * from the supportee's structural/shared-record reads; the supportee never
 * resolves as a profile on the supporter's own org) ARE proven against a
 * real DB by `test-seed-v2-supporter.integration.test.ts`'s
 * `[WI-2243] v2-supporter-self-learning-active seed — Me-scope isolation`
 * suite. AC-3's no-flash convergence-window property is proven directly by
 * `scope-context.test.tsx`'s `AC-3 no-flash convergence window` suite (RTL,
 * executed, drives the transient interval itself rather than only the
 * settled state this journey's reload step exercises).
 */
test('J-32 supporter: Support hub -> Me scope (equal, chip-reachable) -> resume own subject -> Subjects -> relaunch preserves Me -> supportee and back, walls hold', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-supporter-self-learning-active',
    alias: 'j32-self-learning',
    landingTestId: 'support-hub-mentor-tab',
    landingPath: '/mentor',
  });

  const supporteePersonId = seeded.ids.supporteePersonId;
  const ownSubjectId = seeded.ids.ownSubjectId;

  // --- The doorway is a first-time entry point only — with 'me' already in
  // scopes (own learning exists), it must not render, and Me is reachable
  // as an ordinary, equal scope-chip option instead (AC-1's gate; V2 shell
  // spec §4.2 "becomes an equal scope thereafter").
  await expect(page.getByTestId('supporter-self-learning-doorway')).toHaveCount(
    0,
  );
  const meChipOption = page.getByTestId('scope-chip-option-me');
  await expect(meChipOption).toBeVisible();

  // --- Switch to Me: the ordinary learner Mentor screen renders (reused
  // learner flow, not a bespoke doorway destination).
  await pressableClick(meChipOption);
  await expect(page.getByTestId('support-hub-mentor-tab')).not.toBeVisible();
  await expect(page.getByTestId('mentor-screen')).toBeVisible();

  // --- Subjects tab: the supporter's own seeded subject is there to resume
  // (AC-2's "create or resume" — resume path, since it already exists).
  await pressableClick(page.getByTestId('tab-subjects'));
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByTestId('subjects-screen')).toBeVisible();
  await expect(
    page.getByTestId(`subjects-browse-row-${ownSubjectId}`),
  ).toBeVisible();

  // --- Relaunch: reload mid-journey and confirm Me is still the active
  // scope (scope-context.tsx persists activeScope via SecureStore keyed on
  // profileId) — not reverted to the Support hub.
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByTestId('subjects-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId(`subjects-browse-row-${ownSubjectId}`),
  ).toBeVisible();

  // --- Switch to the accepted supportee: person scope, strict separation
  // direction 1 — the supporter's own Me-scope subject never appears here.
  // Await the person-scope structural-subjects container FIRST — a positive
  // marker proving the screen actually re-rendered under the new scope —
  // before the negative assertions below. Without it, those negative
  // assertions could pass vacuously on the prior (Me-scope) screen if the
  // scope switch silently no-oped, which would make this test useless as an
  // isolation guard.
  await pressableClick(
    page.getByTestId(`scope-chip-option-person-${supporteePersonId}`),
  );
  await expect(
    page.getByTestId('person-scope-structural-subjects'),
  ).toBeVisible();
  await expect(
    page.getByTestId(`person-scope-subject-${ownSubjectId}`),
  ).toHaveCount(0);
  const bodyTextInPersonScope = (await page.textContent('body')) ?? '';
  expect(bodyTextInPersonScope).not.toContain('Supporter Own Subject');

  // --- Switch back to Me: direction 2 — no supportee-private content
  // leaked into Me (forward-regression canary; the actual authorization
  // proof is the integration suite cited in the file header).
  await pressableClick(page.getByTestId('scope-chip-option-me'));
  await expect(
    page.getByTestId(`subjects-browse-row-${ownSubjectId}`),
  ).toBeVisible();
  const bodyTextBackInMe = (await page.textContent('body')) ?? '';
  expect(bodyTextBackInMe).not.toContain('PRIVATE');
});
