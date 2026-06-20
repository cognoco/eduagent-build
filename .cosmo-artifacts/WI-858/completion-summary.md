## Completion Summary — WI-858 ([SUBJECT-06/22] refresh pick-book coverage evidence + de-stale inventory rows)

**What was done:** Added deterministic pick-book coverage for the missing-param
guard and the BUG-539 slow-loading hint, and refreshed the SUBJECT-06/22 flow-doc
evidence rows so the inventory reflects real current coverage.

**What changed:** `apps/mobile/src/app/(app)/pick-book/[subjectId].test.tsx` (+70):
two missing-param guard tests (guard UI renders with `pick-book-missing-param` /
`-back`, screen not mounted; back replaces to `/(app)/library`) and a BUG-539
fake-timer test (`pick-book-loading-slow` absent before `SLOW_LOADING_HINT_MS`
(5000 ms), present after, held in loading via a never-resolving `/book-suggestions`
fetch, with `afterEach` real-timer restore for fault isolation).
`docs/flows/mobile-app-flow-inventory.md` + `docs/flows/plans/flow-revision-plan-2026-06-17.md`
SUBJECT-06/22 evidence rows updated.

**Verification:** Delivered via PR #1265 (author `crowka`), squash-merged to `main`
as `2490c0a2e`. `main` branch protection requires all required checks green to merge
(main, Playwright web smoke, API Quality Gate, Merge completeness check), so those
passed at merge; claude-review + CodeRabbit fault-isolation findings (timer restore,
never-resolve simplification) were addressed in-PR. No assertions weakened.

**Caveats / Follow-ups:** Test + flow-doc only — no product code changed. No follow-ups.
