# WI-2226 RGR evidence — SupporterColdStart mount regression guard

Bug-type RGR (red-green-revert) evidence for the guard test:

`apps/mobile/src/components/support/SupportHubMentorTab.test.tsx` →
`[WI-2226] mounted SupporterColdStart` → `[WI-2226 RGR] renders the
managed-family cold-start card from the mounted Support hub tree`

Base commit: `171fec45d` (origin/main at build time). Command used for both
runs:

```
pnpm exec jest --testPathPatterns 'components/support/SupportHubMentorTab\.test\.tsx$' -t "WI-2226 RGR" --no-coverage --verbose
```

## Why a content-bearing fixture, not the empty one

The test uses the `managed` cold-start card fixture (a supportee with
`hasOwnAccount: false`), not the empty-cards fixture. `SupporterColdStart`
renders `null` for the empty state regardless of whether it is mounted at
all — an empty fixture can't distinguish "mounted but nothing to show" from
"never mounted", which would make the guard vacuous. The `managed` fixture
renders visible content (`testID="supporter-cold-start-managed-<personId>"`),
so its absence can only mean the component isn't reachable from the mounted
tree.

## RED — `SupporterColdStart` unmounted from `SupportHubMentorTab`

Reproduced by temporarily reverting the mount in
`apps/mobile/src/components/support/SupportHubMentorTab.tsx` (removing the
`{!activePersonScope ? <SupporterColdStart /> : null}` line and its import),
then re-running the same guard test.

```
FAIL @eduagent/mobile src/components/support/SupportHubMentorTab.test.tsx
    [WI-2226] mounted SupporterColdStart
      ✕ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree (1080 ms)

  ● SupportHubMentorTab › [WI-2226] mounted SupporterColdStart › [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree

    Unable to find an element with testID: supporter-cold-start-managed-550e8400-e29b-41d4-a716-446655440301

    <RCTScrollView
      testID="support-hub-mentor-tab"
    >
      <RCTScrollContentView>
        <RCTView>
          <RCTView>
            <RCTText accessible={true}>Support hub</RCTText>
            <RCTText accessible={true}>Shared signals and next steps for the learners you support.</RCTText>
          </RCTView>
          <RCTView accessibilityLabel="Start supporting" accessibilityRole="button" accessible={true} testID="support-hub-mentor-add-supporter">
            <RCTText accessible={true}>Start supporting</RCTText>
          </RCTView>
        </RCTView>
        <RCTView>
          <RCTView testID="support-hub-mentor-person-550e8400-e29b-41d4-a716-446655440101">
            ...
      (no supporter-cold-start-* element anywhere in the rendered tree)

Tests:       1 failed, 9 skipped, 10 total
```

The rendered tree contains the header and Emma's person card (from
`personScopes`), but nothing under `supporter-cold-start-*` — proving the
component genuinely does not render when unmounted, not merely that the test
assertion is weak.

## GREEN — `SupporterColdStart` mounted (restored)

Mount line restored verbatim; same test, same command:

```
PASS @eduagent/mobile src/components/support/SupportHubMentorTab.test.tsx
    [WI-2226] mounted SupporterColdStart
      ✓ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree (132 ms)

Tests:       9 skipped, 1 passed, 10 total
```

Full suite re-run after restore (all 10 tests in the file, not just the RGR
one), confirming the revert-and-restore left no other regression:

```
PASS @eduagent/mobile src/components/support/SupportHubMentorTab.test.tsx
    ✓ renders visibility-backed cockpit cards with Mentor, Subjects, and Journal actions (199 ms)
    ✓ shows the initial loading card while shared-record facts are pending (65 ms)
    ✓ shows empty-card copy when the shared record has no supporter-visible facts (75 ms)
    ✓ shows an error card and refetches when retry is pressed (124 ms)
    ✓ opens the eligible-person picker from the header anchor and forwards the selection (49 ms)
    ✓ degrades the cold-start empty state to add-a-child when there are no eligible persons (29 ms)
      ✓ [WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree (67 ms)
      ✓ shows the cold-start loading state before the query resolves (39 ms)
      ✓ shows a retryable cold-start error state distinct from loading (75 ms)
      ✓ renders no cold-start section when every managed child already has real learning state (empty per-child cards) (60 ms)
Tests:       10 passed, 10 total
```
