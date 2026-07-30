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
 * SCOPE VARIANT (verified at runtime, not assumed): the
 * `v2-supporter-accepted` seed gives the supporter zero learning state of
 * their own, so 'me' never enters the server-resolved scope list
 * (scope-resolution.ts:85-87 `hasFirstRealLearningState`) and no Me scope chip
 * renders. WI-2243 deliberately mounts SupporterSelfLearningDoorway on this
 * exact unfiltered Support Hub surface: it is the first-time entry into Me,
 * using scope-context.tsx:132-136's "'me' is always valid" exemption. The
 * doorway therefore remains visible before and after Back while the supporter
 * has no Me scope; it is absent in person scope and after entering the Me
 * learner surface. The Me-already-available Support Hub variant is covered by
 * J-32 and the WI-2243 component tests. This case keeps AC-3's two real Back
 * paths and also proves the remaining reachable doorway surfaces.
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

  // --- WI-2822 surface: support-hub/no-Me — initial. The server-resolved Me
  // chip is absent, but WI-2243's first-time doorway is intentionally present.
  await expect(page.getByTestId('support-hub-mentor-tab')).toBeVisible();
  await expect(page.getByTestId('mentor-screen')).toHaveCount(0);
  await expect(page.getByTestId('scope-chip-option-me')).toHaveCount(0);
  await expect(
    page.getByTestId('supporter-self-learning-doorway'),
  ).toBeVisible();

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
  await expect(
    page.getByTestId('supporter-self-learning-doorway'),
  ).toBeVisible();

  // --- Second real path: switch into a person scope (real tap, not a direct
  // setter call), navigate to Journal (real cross-tab push), switch back to
  // supporter-hub via the real ScopeChip (a scope switch with no navigation
  // — confirmed source-side: ScopeChip's onPress only calls setActiveScope),
  // then Back. Same defined-behavior claim from a second reachable state.
  await pressableClick(
    page.getByTestId(`support-hub-mentor-open-${richPersonId}`),
  );
  // --- WI-2822 surface: person. The self-learning doorway belongs only to
  // the unfiltered Support Hub, never a supportee's person scope; next,
  // navigate to Journal through the real tab bar.
  await expect(page.getByTestId('person-scope-mentor-tab')).toBeVisible();
  await expect(page.getByTestId('supporter-self-learning-doorway')).toHaveCount(
    0,
  );
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

  // --- WI-2822 surface: Me/learner. With both Back contracts established,
  // use the intentional first-time doorway and prove the learner surface owns
  // the route: neither the Support Hub nor its doorway remains mounted.
  await pressableClick(page.getByTestId('supporter-self-learning-doorway'));
  await expect(page.getByTestId('mentor-screen')).toBeVisible();
  await expect(page.getByTestId('support-hub-mentor-tab')).not.toBeVisible();
  await expect(page.getByTestId('supporter-self-learning-doorway')).toHaveCount(
    0,
  );
  // WI-2822 contract end.
});
