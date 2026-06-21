# WI-907 Plan

## Objective

Investigate why the upstream flow to `apps/mobile/src/app/(app)/dictation/review.tsx`
was unreachable during WI-503 on-device verification, then record a confirmed
root cause with file:line evidence. If the root cause is a code bug, land a
targeted fix plus regression test. If the behavior is intended, record the
diagnosis and the remaining verification path for WI-503.

## Acceptance Checks

1. Characterize the broken path: practice hub -> dictation index -> playback ->
   complete -> review, including the active mode/profile where it fails.
2. Confirm or refute the V2 navigation-contract hypothesis for family-mode
   learning route gating with source citations.
3. Check whether the cause is shared with the #1294/#1316 mentor/family surface
   regression context.
4. Produce one deliverable:
   - targeted fix + regression test, or
   - follow-up fix WI(s) carrying the confirmed root cause, or
   - diagnosis that this is not a bug and WI-503 must verify in study mode.

## Investigation Steps

1. Locate current dictation route files, route pushes, and Expo Router layouts.
2. Locate practice hub entry points and mode/navigation-contract gating for
   dictation routes.
3. Compare family mode vs study mode behavior in source and existing tests.
4. Add or update the narrowest regression test if a code defect is confirmed.
5. Run focused verification for touched files, plus any route/navigation tests
   that directly exercise the diagnosed behavior.

## Notes

- Keep changes inside the WI-907 worktree.
- Do not change lifecycle fields by hand; use Cosmo execute tooling only.
- Do not create a PR unless explicitly instructed by the user or required by the
  shepherd protocol and available tooling permits it after a validated commit.
