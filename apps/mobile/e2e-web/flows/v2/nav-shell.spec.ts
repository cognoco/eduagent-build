import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

/**
 * V2 (supporter shell) nav-shell — WI-2223 AC-3's e2e prong.
 *
 * AC-3 (verbatim, PM-ratified 2026-07-19): "Back navigation from the
 * support-hub Mentor surface has defined scope behavior and does not
 * duplicate support content into the Me scope. Evidence: co-located jest on
 * the return path; any visible layout claim via a named full nav-shell.spec.ts
 * case." The co-located jest (mentor.support-hub-return.test.tsx) proves the
 * return-to-Me switch through the real ScopeContextProvider. This file is the
 * "any visible layout claim" half — a real browser, real Tabs mount, real
 * `page.goBack()` — which a component-render jest structurally cannot drive
 * (`ScopeContextProvider` mounts once above the Tabs navigator; nothing in
 * scope-context.tsx reacts to navigation events, so only a real nav stack can
 * show what the visible layout actually does after Back).
 *
 * CAVEAT (verified at runtime, not assumed): the `v2-supporter-accepted` seed
 * scenario gives the supporter zero learning state of their own, so 'me'
 * never enters the server-resolved scope list (scope-resolution.ts:85-87
 * `hasFirstRealLearningState`), and the one client-side path that can reach
 * 'me' regardless (SupporterSelfLearningDoorway, scope-context.tsx:132-136's
 * "'me' is always valid" exemption) is not mounted by any screen — confirmed
 * below by asserting its testid and the 'me' scope chip are both absent. So
 * the specific "support.hub pointer pressed from Me scope" journey the
 * product code guards against (now-feed.ts:459-474's `support_hub_pointer`
 * card, `scope==='self'`-only) is not reachable with the current seed
 * fixture, and this file cannot exercise the "into the Me scope" half of
 * AC-3 end-to-end — that half stays evidenced by the co-located jest. What IS
 * real-navigation-reachable, and is exercised below, is the surface AC-3
 * actually names: Back FROM the support-hub Mentor surface.
 *
 * Navigation-depth note (verified empirically, not assumed): a single real
 * tab press away from the landing route, then Back, reliably returns to the
 * landing route/content. TWO tab presses that round-trip back to the SAME
 * route the landing started on (e.g. Mentor -> Subjects -> Mentor) instead
 * make `page.goBack()` exit the whole SPA to `about:blank` — reproduced
 * identically on a plain solo-learner account with the identical sequence,
 * so it is a pre-existing Expo Router web tab-history characteristic (see
 * w04-browser-history-stack.spec.ts's own header comment: "tab entries are
 * replaced rather than pushed"), not something WI-2223's fix introduced or
 * should be judged against. This file only ever does ONE real navigation
 * away from a landing route before Back, to stay on the property AC-3 is
 * actually about (scope-correctness after Back) rather than that unrelated
 * platform quirk.
 *
 * Invoke: EXPO_PUBLIC_ENABLE_MODE_NAV=true EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true
 * EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true doppler run -c stg -- \
 *   pnpm exec playwright test -c apps/mobile/playwright.config.ts \
 *   --project=v2-release -g "support-hub"
 */
// The v2-release project's default storageState is solo-learner.json (an
// already-authenticated session) — override to a blank context so this
// spec's own seedAndSignIn (a different identity, v2-supporter-accepted)
// actually reaches /sign-in instead of an auto-redirect past it.
test.use({ storageState: { cookies: [], origins: [] } });

test('V2 nav shell: real Back from the support-hub Mentor surface keeps the supporter-hub surface, no learner-surface bleed-through', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-supporter-accepted',
    alias: 'wi2223-navshell',
    landingTestId: 'support-hub-mentor-tab',
    landingPath: '/mentor',
  });
  const richPersonId = seeded.ids.supporteePersonId;

  // --- Caveat, proven not assumed: 'me' scope is unreachable for this seed
  // fixture. No chip, no doorway CTA — the AC-3 "into Me" journey has no real
  // entry point here.
  await expect(page.getByTestId('scope-chip-option-me')).toHaveCount(0);
  await expect(page.getByTestId('supporter-self-learning-doorway')).toHaveCount(
    0,
  );

  // --- One real cross-tab navigation away from the landing surface (an
  // actual Pressable tap on the tab bar, the same mechanism a user drives).
  await pressableClick(page.getByTestId('tab-subjects'));
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByTestId('support-hub-subjects-tab')).toBeVisible();

  // --- Real browser Back — returns to the support-hub Mentor surface that
  // was the landing route.
  await page.goBack();

  // Defined scope behavior, visible-layout claim: whatever the resulting
  // route, the supporter-hub scope's OWN surface renders — never the learner
  // Mentor surface (mentor-screen, LearnerMentorScreen's testid) the
  // pre-fix bug rendered instead when scope and route disagreed. activeScope
  // is unchanged by Back (scope-context.tsx has no navigation listener), so
  // this is the real-mechanism proof that the fixed invariant (scope-correct
  // surface, not the wrong learner one) survives a real Back, not just a
  // fresh push.
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible();
  await expect(page.getByTestId('mentor-screen')).toHaveCount(0);

  // --- Second real path: switch into a person scope (real tap, not a direct
  // setter call), navigate to Journal (real cross-tab push), switch back to
  // supporter-hub via the real ScopeChip (a scope switch with no navigation
  // — confirmed source-side: ScopeChip's onPress only calls setActiveScope),
  // then Back. Same defined-behavior claim from a second reachable state.
  await pressableClick(
    page.getByTestId(`support-hub-mentor-open-${richPersonId}`),
  );
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await pressableClick(page.getByTestId('tab-journal'));
  await expect(page).toHaveURL(/\/journal$/);
  await pressableClick(page.getByTestId('scope-chip-option-supporter-hub'));
  await expect(page.getByTestId('support-hub-journal-tab')).toBeVisible();

  await page.goBack();

  // AC-2: positive surface assertion required — the negatives below alone pass
  // on a blank/errored route (see docs/evidence/wi2524-staging-navshell-verification.md §3)
  await expect(page).toHaveURL(/\/mentor$/);
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible();

  await expect(page.getByTestId('mentor-screen')).toHaveCount(0);
  await expect(
    page.getByTestId('person-scope-journal-placeholder'),
  ).not.toBeVisible();
});
