# WI-2226 RGR evidence — SupporterColdStart mount regression guard

Bug-type RGR (red-green-revert) evidence for the guard test:

`apps/mobile/src/components/support/SupportHubMentorTab.test.tsx` →
`[WI-2226] mounted SupporterColdStart` → `[WI-2226 RGR] renders the
managed-family cold-start card from the mounted Support hub tree, and its
CTA performs a real switch`

## 2026-07-21 update (bounce-recovery)

The WI-2226 reviewer bounce found the original managed-card CTA
(`setActiveScope`) was a no-op/403 in production for a real managed child —
the isolated component test masked it by manually granting a person scope.
The fix re-wires the CTA to `switchProfile` and owner-gates the coldstart
resolver (`resolveSupporterColdStart`) so the managed card only renders for a
supportee actually on the supporter's own org. This RGR test was extended in
the same change to also press the CTA and assert a real `switchProfile` call
from the mounted production tree — not just that the card renders — so the
guard now covers both "is the component reachable" (original RGR) and "does
its CTA actually call the real switch mechanism" (bounce-recovery addition).

Base commit: `3adb80d19` (origin/main at build time). Command used for both
runs:

```
pnpm exec jest --testPathPatterns 'components/support/SupportHubMentorTab\.test\.tsx$' -t "WI-2226 RGR" --no-coverage --verbose
```

### Why a content-bearing fixture, not the empty one

The test uses the `managed` cold-start card fixture (a supportee with
`hasOwnAccount: false`), not the empty-cards fixture. `SupporterColdStart`
renders `null` for the empty state regardless of whether it is mounted at
all — an empty fixture can't distinguish "mounted but nothing to show" from
"never mounted", which would make the guard vacuous. The `managed` fixture
renders visible content (`testID="supporter-cold-start-managed-<personId>"`)
and an actionable CTA, so its absence can only mean the component isn't
reachable from the mounted tree.

### RED — `SupporterColdStart` unmounted from `SupportHubMentorTab`

Reproduced by temporarily short-circuiting the mount in
`apps/mobile/src/components/support/SupportHubMentorTab.tsx` (line 251,
`{!activePersonScope ? <SupporterColdStart /> : null}` → `{false &&
!activePersonScope ? <SupporterColdStart /> : null}`), then re-running the
same guard test.

```
FAIL  src/components/support/SupportHubMentorTab.test.tsx
  SupportHubMentorTab
    [WI-2226] mounted SupporterColdStart
      ✕ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree, and its CTA performs a real switch (1465 ms)

  ● SupportHubMentorTab › [WI-2226] mounted SupporterColdStart › [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree, and its CTA performs a real switch

    Unable to find an element with testID: supporter-cold-start-managed-550e8400-e29b-41d4-a716-446655440301

    <RCTScrollView
      testID="support-hub-mentor-tab"
    >
      ...
      (no supporter-cold-start-* element anywhere in the rendered tree)

Tests:       1 failed, 9 skipped, 10 total
```

The rendered tree contains the header and Emma's person card (from
`personScopes`), but nothing under `supporter-cold-start-*` — proving the
component genuinely does not render when unmounted, not merely that the test
assertion is weak.

### GREEN — `SupporterColdStart` mounted (restored)

Mount line restored verbatim; same test, same command:

```
PASS  src/components/support/SupportHubMentorTab.test.tsx
  SupportHubMentorTab
    [WI-2226] mounted SupporterColdStart
      ✓ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree, and its CTA performs a real switch (278 ms)

Tests:       9 skipped, 1 passed, 10 total
```

Full suite re-run after restore (all 10 tests in the file, not just the RGR
one), confirming the revert-and-restore left no other regression:

```
PASS  src/components/support/SupportHubMentorTab.test.tsx
    ✓ renders visibility-backed cockpit cards with Mentor, Subjects, and Journal actions (124 ms)
    ✓ shows the initial loading card while shared-record facts are pending (60 ms)
    ✓ shows empty-card copy when the shared record has no supporter-visible facts (60 ms)
    ✓ shows an error card and refetches when retry is pressed (114 ms)
    ✓ opens the eligible-person picker from the header anchor and forwards the selection (42 ms)
    ✓ degrades the cold-start empty state to add-a-child when there are no eligible persons (16 ms)
    [WI-2226] mounted SupporterColdStart
      ✓ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree, and its CTA performs a real switch (76 ms)
      ✓ shows the cold-start loading state before the query resolves (14 ms)
      ✓ shows a retryable cold-start error state distinct from loading (60 ms)
      ✓ renders no cold-start section when every managed child already has real learning state (empty per-child cards) (59 ms)
Tests:       10 passed, 10 total
```

## Original 2026-07 evidence (mount-only, pre bounce-recovery)

For reference, the original mount-reachability RGR cycle (before the CTA
assertion was added) was run against base commit `171fec45d` with the same
RED/GREEN mechanics and the pre-bounce-recovery test name (`renders the
managed-family cold-start card from the mounted Support hub tree`, without
the "its CTA performs a real switch" clause). That cycle proved reachability
only; the 2026-07-21 update above supersedes it with a stronger guard and is
the current evidence of record.
