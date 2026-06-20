## Completion Summary — WI-860 ([QA-05/06/07] reconcile covered regression rows to evidence-backed)

**What was done:** Closed the QA-07 tab-bar-leak gap (Bug 763) with a regression
test, reconciled QA-05 and QA-06 from pass-with-issues to evidence-backed Pass, and
exported `HIDDEN_TAB_ROUTES` to make the leak testable.

**What changed:** `apps/mobile/src/app/(app)/_layout.tsx` — export `HIDDEN_TAB_ROUTES`
(the only production-code change, purely enabling the test).
`apps/mobile/src/app/(app)/_layout.test.tsx` (+39): asserts every dynamic/nested route
surfaced by Bug 763 (shelf, subject, pick-book, child, session, quiz, homework,
dictation, practice, vocabulary, topic, my-notes) is in the hidden set, and none of
the five real tab routes are. `docs/flows/plans/flow-revision-plan-2026-06-17.md` —
QA-05/06/07 → Pass with reconciliation notes.

**Verification:** Delivered via PR #1254 (author `crowka`), squash-merged to `main`
as `eb47bf617`. `main` branch-protection required checks green at merge. Commit carries
a Verified-By table: Bug 763/QA-07 by the new `_layout.test.tsx` asserts; QA-05
(create-subject BUG-236/237) and QA-06 (subject.test.ts + j09 E2E) pre-existing.

**Caveats / Follow-ups:** Single one-line production change (export only); rest is
test + flow-doc. No follow-ups.
