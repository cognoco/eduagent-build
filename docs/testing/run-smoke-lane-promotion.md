# Legacy Playwright lane promotion

The legacy Playwright projects are split into a required-stable `core` lane and
a visible, non-gating `advisory` lane. Project membership is declared once in
`tools/quarantine/run-smoke-lanes.cjs`. An absent or expired quarantine entry
puts a project in core; only a valid, unexpired entry moves it to advisory.

This is separate from file quarantine. `tools/quarantine/quarantine.json` skips
one flaky test file from the PR gate while a report lane observes it.
`run-smoke-quarantine.json` never skips a Playwright project: it temporarily
changes which legacy lane runs that project.

## Promotion contract

The linked Work Item is the decision record. Its accountable owner must attach:

- at least seven consecutive days and 20 runs on the current staging target;
- the run URLs and a failure-class summary showing no product-class failure;
- the staging canary state for any ambient failure excluded from the evidence;
- the proposed expiry instant and rollback owner.

The MentoMate PM authorizes the quarantine entry and its expiry through review of
the repository PR. That approval authorizes automatic promotion at expiry:
the resolver returns the project to core without a workflow or branch-protection
edit. Before expiry, the owner either records that the stability window passed
or opens a new, independently reviewed proposal with fresh evidence and a new
bounded expiry. Editing an existing expiry silently is not an approval.

Record the decision, evidence links, owner, and authorization in the entry's
`wi`. The committed ledger records the project, owner, reason, and expiry.

## Rollback

Rollback is triggered when a newly core project has a reproducible product-class
failure while the staging canary is healthy. The owner opens a PR adding a new
quarantine entry with a new Work Item, evidence, reason, and bounded expiry.
PM approval is required before that PR lands. Do not rename checks or modify
branch protection as part of rollback.

## Required-check boundary

PR [#2273](https://github.com/cognoco/eduagent-build/pull/2273) /
WI-2228 established the existing `Playwright web smoke` required context and
the V2 release gate. The
[WI-2452 deferred note](../../_wip/run-smoke-gate-hygiene/deferred-gate-structure-note.md)
explains why the legacy resolver originally landed unwired.

WI-2458 wires only the legacy project partition into the existing `run-smoke`
job. It does not add, rename, or remove a required context. A read-only check on
2026-07-21:

```sh
gh api repos/cognoco/eduagent-build/branches/main/protection/required_status_checks
```

reported `main`, `Playwright web smoke`, `API Quality Gate`, and
`Merge completeness check`. Only an authorized repository operator may change
that configuration.
