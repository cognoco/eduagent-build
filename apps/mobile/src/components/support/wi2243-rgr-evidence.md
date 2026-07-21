# WI-2243 RGR evidence — SupporterSelfLearningDoorway mount regression guard

Feature-type RGR (red-green-revert) evidence for the AC-7(i) executable
fail-if-unreachable gate. Anchor test:

`apps/mobile/src/components/support/SupportHubMentorTab.test.tsx` →
`[WI-2243] SupporterColdStart + SupporterSelfLearningDoorway coexistence` →
`renders BOTH the managed-child cold-start card and the self-learning
doorway when a child needs attention and the supporter has no own learning`

## Why a content-bearing, coexistence-asserting fixture, not the empty one

Mirrors the WI-2226 RGR's own reasoning
(`wi2226-rgr-evidence.md`): a fixture with nothing to show can't
distinguish "mounted but nothing to render" from "never mounted", which
would make the guard vacuous. This test also specifically asserts the
doorway renders ALONGSIDE a content-bearing `SupporterColdStart` card
(`supporter-cold-start-managed-<personId>`) in the same tree, so it proves
both the mount AND the coexistence property (AC-1's flagged bounce vector)
in one guard — not merely that the doorway can render in isolation
(`SupporterSelfLearningDoorway.test.tsx` already proves that, but never
through the real production mount site).

Base commit: `bafb03071` (origin/main at branch point). Command used for
both runs:

```
pnpm exec jest --testPathPatterns 'components/support/SupportHubMentorTab\.test\.tsx$' -t "coexistence" --no-coverage --verbose
```

## RED (SupportHubMentorTab.tsx mount reverted via `git stash`)

```
    > 565 |       screen.getByTestId('supporter-self-learning-doorway');
          |              ^
      at Object.getByTestId (apps/mobile/src/components/support/SupportHubMentorTab.test.tsx:565:14)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 10 skipped, 1 passed, 12 total
```

The `renders BOTH...` test fails on the doorway `getByTestId` lookup —
`SupporterSelfLearningDoorway` is not reachable from the mounted
Support-hub tree with the mount change reverted. (The sibling
`suppresses the doorway...` test still passes here, as expected — a doorway
that never renders trivially "stays suppressed"; it is not the RGR anchor.)

## GREEN (mount restored)

```
[WI-2243] SupporterColdStart + SupporterSelfLearningDoorway coexistence
  ✓ renders BOTH the managed-child cold-start card and the self-learning doorway when a child needs attention and the supporter has no own learning (124 ms)
  ✓ suppresses the doorway once the supporter already has their own learning state (Me scope present) (61 ms)

Test Suites: 1 passed, 1 total
Tests:       10 skipped, 2 passed, 12 total
```

Cycle executed pre-completion (RED confirmed → REVERTED to restore the fix
→ GREEN confirmed), matching the documented `git stash push` / `git stash
pop` mechanics — no destructive git operations used.
