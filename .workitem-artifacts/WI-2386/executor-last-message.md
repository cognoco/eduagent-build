# WI-2386 executor handoff

`WI-2386` is claimed by `builder:codex:WI-2386`, implemented on branch
`WI-2386`, and remains intentionally unmerged and uncompleted in Cosmo.

Draft PR: https://github.com/cognoco/eduagent-build/pull/2527

The granular guardian/non-adult consent purpose set is implemented across the
complete state machine with metadata-only migration 0152, fail-closed legacy
data semantics, atomic set transitions, an executable whole-repo guard, and the
required regression matrix. The initial draft PR reached strict green and
`mergeStateStatus=CLEAN` before a final thread audit surfaced CodeRabbit
comments that were not represented as failed checks.

Valid follow-up findings are fixed locally with focused red/green evidence:

- the guard now rejects whole-consent proxies for both canonical purposes;
- rollback SQL restores a plain text default without a nonexistent enum cast;
- the basis-explicit family batch performs four real DB round trips instead of
  24 for four children;
- the child-detail grant timestamp read is organization-scoped.

The two complete real-database consent suites pass 98/98, and the executable
guard passes 17/17 plus a clean production-tree scan. The remaining work is to
rerun the named local gates, commit/push through the repo commit skill, resolve
the review threads, and wait for the draft PR to return to strict green/CLEAN.
