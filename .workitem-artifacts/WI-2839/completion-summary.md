## What was done

Made weekly-progress parent eligibility use the cron's existing replay-stable,
memoized evaluation instant instead of reading an independent wall clock.

## What changed

The `resolve-week-window` step now runs before both timezone-sensitive eligibility
queries. Parent selection and self-report selection reconstruct and reuse the same
`nowUtc`. The database-backed regression injects a memoized instant exactly one
hour behind the process wall clock, proving the created matching parent is still
queued and the deliberately non-matching parent remains excluded.

## Verification

The named regression failed before the production change with `queuedParents=0`
and passed afterward. The full weekly-progress-push integration file passed 9/9
with V2 identity enabled; the companion unit file passed 29/29. API typecheck,
targeted ESLint, and targeted Prettier passed. A deliberate mutation that queued
the excluded parent failed at the corrected negative assertion, proving the
identity exclusion is genuine even when the event data also carries
`reportWeekStart`. Exact-head CI, fresh automated review, and governed merge
evidence will be added before landing.

## Caveats / Follow-ups

No cadence, timezone policy, assertion tolerance, retry, or timeout changed. The
originating failure was independently captured and formally admitted as WI-2839;
no additional independently deliverable residue was found.
