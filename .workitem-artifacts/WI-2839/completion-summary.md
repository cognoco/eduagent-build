## What was done

Made weekly-progress parent eligibility use the cron's existing replay-stable,
memoized evaluation instant instead of reading an independent wall clock.

## What changed

The `resolve-week-window` step now runs before both timezone-sensitive eligibility
queries. Parent selection and self-report selection reconstruct and reuse the same
`nowUtc`. A separate database-backed same-hour control calls `executeCronSteps()`
without injecting a window and therefore exercises the real window callback. The
rollover regression injects a memoized instant exactly one hour behind the process
wall clock, proving the created matching parent is still queued and the deliberately
non-matching parent remains excluded.

## Verification

The named regression failed before the production change with `queuedParents=0`
and passed afterward. A deliberate mutation restoring the old parent wall-clock
read left the same-hour control green and failed the rollover regression at the
exact created-parent assertion. At the verified implementation commit recorded
in the evidence manifest, the focused pair passed 2/2, the
full weekly-progress-push integration file passed 10/10 with V2 identity enabled,
and the companion unit file passed 29/29. API typecheck, targeted ESLint, and
targeted Prettier passed. A separate deliberate mutation that queued the excluded
parent failed at the corrected negative assertion, proving the identity exclusion
is genuine even when the event data also carries `reportWeekStart`. Exact PR-head
CI, fresh automated review, and governed merge evidence will be added before landing.

## Caveats / Follow-ups

No cadence, timezone policy, assertion tolerance, retry, or timeout changed. The
originating failure was independently captured and formally admitted as WI-2839;
no additional independently deliverable residue was found.
