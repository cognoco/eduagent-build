# WI-2386 adversarial review checkpoint

## Round 1 — fresh-context, different runtime

Two read-only Claude review attempts produced usable reports (one constrained by
its tool mode, one complete). Valid findings and dispositions:

- **BLOCKER/MUST — legacy active grants were deletion-eligible.** Fixed the
  abandonment and archive-cleanup predicates so any active recorded purpose
  prevents destructive deletion while the global processing aggregate remains
  fail-closed until the complete purpose set is re-consented.
- **BLOCKER/MUST — legacy single-purpose events could not be withdrawn,
  generation-checked, archived, restored, or grace-deleted.** Event-wide
  operations now act atomically on the non-empty purpose set actually recorded
  for that event. They never fabricate `llm_disclosure`; restore therefore
  resolves to `PENDING` for a legacy event.
- **SHOULD — request/resend writes relied only on application checks.** Restored
  database predicates for terminal immutability and requested-only resend,
  preserving the one explicit legacy incomplete re-consent exception.
- **SHOULD — guard missed `inArray` and raw-SQL literal selectors.** Extended
  the AST guard and executable self-test for both forms.
- **SHOULD — outstanding pre-deploy email links reported “already processed.”**
  Added an explicit `ConsentReconsentRequiredError`, mapped by both consent
  routes to a new-request response; no purpose is granted or denied.
- **SHOULD — pending creation could produce a mixed terminal/pending legacy
  set.** Serialized the operation, leaves a terminal partial set unchanged,
  and verifies the full purpose-set write count.

TDD proof: the seven legacy state-machine regressions and two migration-window
regressions failed before their fixes and pass after them. The complete
`consent-v2.integration.test.ts` suite passes 77/77 after the fixes. The guard
self-test passes 10/10.

## Round 2

Fresh-context Claude Sonnet, xhigh effort, safe mode, read-only tools. Verdict:
**NO VALID FINDINGS**.

The reviewer inspected the full diff against
`9a4ae7c06357925969beee66d482b4cca4dbb3a0`, including the reducers and SQL
twin, all state-machine writes, three deletion predicates, migration, routes,
guard/CI wiring, concurrency coverage, and test assertion changes. It
independently confirmed complete-set processing gates, recorded-event legacy
transitions, non-destructive partial-grant handling, exact token supersession,
org/basis isolation, adult purpose-specific behavior, metadata-only migration,
and a non-vacuous guard. No round 3 is required.

## Draft-PR automated review follow-up

The GitHub Claude review found one valid **SHOULD FIX**: complete-set reminder
reads suppressed legacy or internally inconsistent request rows without an
operational escalation. The fix preserves fail-closed delivery while emitting
a PII-free Sentry message with the suppression reason, expected/actual row
counts, and contact/token consistency counts.

TDD proof: the focused regression failed with zero captures before the fix and
passes afterward (21/21 reminder tests). API lint, API typecheck, and the
consent-purpose contract guard also pass. The review's two **CONSIDER** items
were documentation suggestions for already-tested invariants, not correctness
findings; no production behavior changed for them.

## Draft-PR CodeRabbit follow-up

A final thread audit found five valid comments despite a green review status:

- Replaced the stale pre-claim executor handoff with the current claimed,
  implemented, draft-PR state.
- Corrected migration 0152's rollback SQL for the actual text column and added
  an executable rollback-contract assertion.
- Replaced the basis-explicit family dashboard's per-person fan-out with four
  set-based queries (grant + request for each canonical purpose). A pass-through
  real-pool counter failed at 24 round trips before the fix and passes at 4.
- Added the missing organization predicate to the child-detail grant timestamp
  read. A real-DB regression with a newer foreign-org grant fails without the
  predicate and now returns only the in-org timestamp.
- Extended the AST and migration guard from `platform_use` alone to both
  canonical purpose literals. The six new negative samples and rollback check
  failed before the fixes; the complete guard now passes 17/17 and the
  production scan is clean.

The review-body request to replace the session-exchange ordering test with a
database integration was not accepted as a valid defect. That test deliberately
runs the real `processMessage` and `streamMessage` entry points against a
controlled query seam to prove the consent gate precedes session lookup and LLM
dispatch. The complete-set persistence/reducer semantics it consumes are
separately exercised by the real database suites; those suites pass 98/98 after
the follow-up fixes.
