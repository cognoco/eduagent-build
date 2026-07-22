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
