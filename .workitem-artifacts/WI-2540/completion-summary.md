# WI-2540 completion summary (re-finalize after review rework)

## What was done

Added the missing zero-active-Subject state to the manual homework entry screen, then addressed both review-bounce findings in a rework. Original root cause: the subject-picker area of apps/mobile/src/app/(app)/homework/manual.tsx rendered only a loading state or the active-Subject list, so a fetch finishing with zero active Subjects left the screen with no empty-state message, no recovery action, and a permanently disabled confirm button. The review bounce then correctly found that the first regression test seeded an archived Subject (exercising only the client-side filter) even though production's subject fetch excludes inactive Subjects server-side, and that no red-green evidence had been recorded.

## What changed

- apps/mobile/src/app/(app)/homework/manual.tsx (landed in the first pull request) — a third render branch for the finished-loading-and-empty case: a subject-picker-empty container naming the condition with existing localized copy and a subject-picker-create escape button routing to Subject creation; confirmation stays disabled because no Subject is selectable.
- apps/mobile/src/app/(app)/homework/manual.test.tsx (rework, landed in the second pull request) — the AC-required regression test now seeds the REAL production loaded-empty shape: the subjects fetch resolves with an empty array, matching the server-side exclusion of inactive Subjects. It asserts the empty container renders, the loading and resolution-ready states are absent, confirm stays disabled after text entry, and the escape routes to Subject creation. The archived-Subject fixture is retained as a separate, explicitly-labelled defense-in-depth test for the client-side filter path — additional coverage, not a substitute for the AC case.
- Zero new i18n keys (reused established homework namespace copy).

## Verification

Red-green evidence recorded during the rework: with manual.tsx reverted to its pre-fix revision, both new tests fail with "Unable to find an element with testID: subject-picker-empty" (two failed, four passed); with the fix restored byte-identical to main, the full suite of six passes. Related jest suites passed with zero failures locally and the pre-push validation completed cleanly on the rework delta. On the rework pull request every check concluded successfully and the automated review verdict was a clean approval with zero findings. Both changes are landed on main: the fix via the first pull request's squash commit, and the rework via the squash commit recorded in Fixed In.

## Caveats / Follow-ups

None. The defense-in-depth test documents in-file why it is not the AC case, so a future reader cannot re-conflate the two shapes.
