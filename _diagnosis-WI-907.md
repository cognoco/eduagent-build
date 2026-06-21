# WI-907 Diagnosis

## Conclusion

The dictation review/correction screen is not broken. The unreachable path is
an upstream entry-surface mismatch:

- In V1 family mode, learning routes such as `dictation` are intentionally not
  surfaced from the family shell even though an owner may still enter them by a
  bridge/deep link.
- In V2, the old learner-home -> practice-hub path is no longer the default
  visible shell. V2 sends post-auth users to Mentor and exposes only the
  `mentor`, `subjects`, and `journal` tabs, so the existing dictation review
  Maestro flow can time out while waiting for `learner-screen` /
  `home-action-practice` before it ever reaches dictation.

For WI-503 verification, use a learner/study entry surface:

- V1/non-V2: verify from Study mode using Learner Home -> Practice ->
  Dictation.
- V2: verify from the learner `Me` scope on Mentor via the light-practice
  `Dictation` action, or run the existing home/practice Maestro flow with V2
  disabled.

## Evidence

### Navigation contract

- `apps/mobile/src/lib/navigation-contract.ts:176-185` defines `dictation`,
  `practice`, and sibling learning flows as `LEARNING_ROUTES`.
- `apps/mobile/src/lib/navigation-contract.ts:413-415` permits learning routes
  in family shape only for an owner role.
- `apps/mobile/src/lib/navigation-contract.ts:443-448` deliberately returns
  `isSurfaced=false` for all learning routes in family shape.
- `apps/mobile/src/lib/navigation-contract.test.ts:655-676` already locks this:
  family routes are surfaced while `session`, `homework`, `dictation`, `quiz`,
  `practice`, and `mentor-memory` remain enterable but not surfaced.

This confirms the WI hypothesis as intentional V1 behavior, not a dictation
layout bug.

### Dictation route gate and route chain

- `apps/mobile/src/app/(app)/dictation/_layout.tsx:60-66` blocks only when
  `useEntryGate('dictation')` says the active contract cannot enter.
- `apps/mobile/src/hooks/use-entry-gate.ts:25-33` implements that split:
  V1 uses `!contract.canEnter(route)`, while V1-off blocks only parent-proxy.
- `apps/mobile/src/app/(app)/practice/index.tsx:427-431` gates the practice
  hub similarly.
- `apps/mobile/src/app/(app)/practice/index.tsx:888-892` pushes the dictation
  choice screen from the practice card.
- `apps/mobile/src/app/(app)/dictation/index.tsx:85` and
  `apps/mobile/src/app/(app)/dictation/text-preview.tsx:73` push playback.
- `apps/mobile/src/app/(app)/dictation/playback.tsx:57` replaces to complete.
- `apps/mobile/src/app/(app)/dictation/complete.tsx:260` pushes review after a
  successful handwriting review response.

The internal dictation stack is wired; the observed failure happens before the
review screen when the upstream shell does not expose the old home/practice path.

### V2 shell behavior

- `apps/mobile/src/app/(app)/_lib/auth-redirect.ts:5-7` makes V2 post-auth
  default to `/(app)/mentor` instead of `/(app)/home`.
- `apps/mobile/src/hooks/use-navigation-contract.ts:22` defines V2 tabs as only
  `mentor`, `subjects`, and `journal`.
- `apps/mobile/src/hooks/use-navigation-contract.ts:185-195` returns those V2
  tabs whenever `MODE_NAV_V2_ENABLED` is true.
- `apps/mobile/src/app/(app)/_layout.tsx:649` hides the older global
  `ModeSwitcher` while V2 is enabled.
- `apps/mobile/src/components/chrome/ScopeChip.tsx:36-66` provides scope
  selection, not a Study/Family mode switch.
- `apps/mobile/src/app/(app)/mentor.tsx:337-361` renders supporter hub/person
  views for supporter scopes and the learner mentor screen only for `Me`.
- `apps/mobile/src/app/(app)/mentor.tsx:169-180` and `:312-321` wire the
  learner mentor light-practice affordance, including `dictation`, to
  `/(app)/dictation`.

So, under V2, the replacement learner entry is Mentor -> light practice ->
Dictation, not Learner Home -> Practice -> Dictation.

### E2E flow mismatch

- `apps/mobile/e2e/flows/dictation/dictation-review-flow.yaml:54-79` waits for
  `learner-screen`, taps `home-action-practice`, waits for `practice-screen`,
  and taps `practice-dictation`.
- `apps/api/src/services/test-seed.ts:4355-4399` confirms
  `dictation-with-mistakes` seeds an active learner profile, not a family-owner
  profile.
- `.github/workflows/ci.yml:516-518` bakes V0, V1, and V2 navigation flags into
  preview OTA updates, so a preview-channel V2 run can use the V2 mentor shell
  even though the older flow still expects the home/practice shell.

## Relation to #1294 / #1316

The root cause is related to the V2 mentor/family surface work because that work
changed the visible shell and first entry surface. It is not the same as a
family-bridge backstack bug, and it is not a broken dictation review screen.

## Outcome

No production code fix is recommended for WI-907. WI-503 verification is
unblocked by running the dictation review path from the correct learner/study
surface for the flag state under test.
