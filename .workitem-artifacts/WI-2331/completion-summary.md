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
