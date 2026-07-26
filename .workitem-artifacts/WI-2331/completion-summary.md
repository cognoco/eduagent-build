# WI-2331 — Restore V2 wayfinding and active-profile orientation on pushed screens

## What was done

Restored V2 wayfinding on ordinary pushed screens to the PM-amended scope (bug/feature
split, ruling on clacks mentomate-pgm seq 39322, 2026-07-23): the owning Mentor / Subjects
/ Journal tab highlights again on pushed and deep-linked screens, and root-level Back
controls name and reach their semantic destination instead of the retired V0 home
fallback. Every change is gated behind the V2 nav flag, so the shipped V0/V1 states are
unchanged. Per the ruling, the net-new identity UI (AC-4) and the exhaustive semantic-Back
sweep (the tail of AC-2) were split to follow-up items rather than built here.

## What changed

- Central owning-tab contract: resolveV2TabIsActive in the app tab layout resolves the
  active tab from the pathname rather than React Navigation focus, which reports false for
  all three real tab buttons while a hidden-sibling pushed screen is active. Wired into the
  three tab icons/labels, V2-gated. [AC-1]
- homeHrefForReturnTo in lib/navigation gained a v2Enabled parameter; its catch-all now
  routes through the owning-tab contract under V2 instead of the dead V0 home. Named tokens
  above the catch-all and the V2-off default are untouched. [AC-2, narrowed]
- Root Back controls on the mentor-memory and session screens route to the owning tab or a
  named destination under V2 instead of the dead V0 home. [AC-2 / AC-3]
- One central route-to-owning-tab, return-label, and active-context contract now backs both
  the tab highlight and every Back target, so they cannot disagree; the full back-route
  audit is enumerated as in-repo evidence. [AC-5]
- All changes are v2Enabled-gated; the V0/V1 legacy paths are byte-for-byte unchanged.

## Verification

- Red-green-revert evidence for all three central defects in
  docs/evidence/wi2331-rgr-v2-wayfinding.md: revert the fix, watch the targeted guard fail,
  restore, watch it pass again.
- origin/main was forward-merged into the branch to clear a conflict; the landed WI-2234
  returning-learner and WI-2239 Journal-paper-trail changes touched the same handleBack /
  handleChatBackPress / summaryHomeHref sites, and both sides were preserved. The merged
  head was re-verified on Node 22: the related-test run over the reconciled files plus the
  nav core is green, and mobile typecheck is clean, covering both the WI-2331 guards and the
  WI-2234/WI-2239 additions.
- V0/V1 must-not-regress is asserted by the flag-off unit assertions in navigation.test.ts.

## Caveats / Follow-ups

- AC-4 removed as a type correction (net-new own/supporting identity UI is a Feature, not a
  Bug deviation) — split to WI-2678 (Feature).
- The AC-2 exhaustive semantic-Back sweep across the remaining audited back-nav files —
  split to WI-2677 (Enhancement).
- Both follow-ups were minted and linked before completion (mint-before-complete) and
  orchestrator-verified (clacks seq 40193); WI-2331 Related Items include WI-2677 and
  WI-2678.
- Scope reconciliation and the PM-ruling provenance are recorded in
  docs/evidence/wi2331-rgr-v2-wayfinding.md.

## Rework — independent-reviewer findings addressed (2026-07-25)

The independent reviewer returned the item to rework with two substantive findings; both
are resolved, stacking on the original landed fix (unchanged).

- Finding 1a (AC-1/2/5, multi-origin route): the owning-tab resolver was pathname-only, so a
  my-notes screen reached from the Journal tab wrongly highlighted Mentor and its Back label
  read "Back to Mentor" while actually returning to Journal. The resolver is now returnTo-aware
  (a definitive Subjects/Journal pathname owner still wins; the Mentor catch-all defers to the
  same returnTo→tab mapping the Back destination already used), and the my-notes hub label is
  derived from returnTo. Red-green-revert proven.
- Finding 1b (AC-2, remaining generic Back labels): every "fixed this pass" screen was
  re-audited across its chevron, loading-state, and error-state controls; the remaining generic
  Back labels — including the reviewer-named progress and quiz launch screens — now name their
  semantic destination, V2-gated, V0/V1 copy unchanged. Deliberately-different controls
  (phase-stepping chevrons, in-flight Cancel, icon-only camera buttons) were left as-is.
- Finding 2 (AC-5 coverage): representative regression coverage is now identified per axis —
  all three tabs, own vs supporting context, deep links, dark/light themes (the semantic
  accent-token mechanism), and small-phone layout (tab bar stays visible and highlighted, and a
  representative named Back control stays usable, at a small viewport) — rather than asserted in
  the aggregate. The per-axis mapping is in the red-green-revert evidence document.

Verification: mobile typecheck clean; the full related-test run across every changed file is
green on Node 22; lint is clean apart from two warnings confirmed pre-existing in untouched
code. The small-phone axis was retained (not treated as vestigial to the removed AC-4) per the
orchestrator's KEEP recommendation, since bottom-nav visibility/highlight and Back-label
usability are layout outcomes that can regress at a small viewport even when route resolution
takes no size input.

## Rework #2 — independent-reviewer findings addressed (2026-07-26)

The independent reviewer returned the item a second time on one finding: the AC-5 per-axis
regression tests were structural proxies rather than genuine coverage. Resolved as follows,
stacking on the landed fix (unchanged, still on the base branch).

- Dark/light axis: the theme mock now reads the real design-tokens table keyed by a mutable
  colour-scheme, and both tab components are asserted under each theme, proving the unfocused
  colour differs between light and dark. Red-green proven.
- Own/supporting axis: the test now builds real profile fixtures, distinguishes them via the
  real isGuardianProfile helper, renders the real app layout, drives the active returnTo through
  the real search-params seam, and asserts the Back destination differs by context. Red-green
  proven with two independent breaks.
- Small-phone axis: resolved by operator scope ruling. The V2 tab-bar layout reads only
  safe-area insets floored by a minimum height and takes no window-dimension input, so a
  viewport mock would be inert. The ruling records that the inset plus height-floor guarantee is
  the genuine small-phone signal for this inset-driven layout; the covering test asserts the
  floored height and surviving owning-tab highlight at a zero bottom inset. Recorded as an
  in-repo provenance note; the Cosmo AC field is unchanged.

Verification: mobile suite over the touched files green on Node 22; mobile typecheck and eslint
clean; production source byte-identical (test-only change). Full red-green detail in
docs/evidence/wi2331-rgr-v2-wayfinding.md under "Rework #2".
