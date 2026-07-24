# Audit workspace

`docs/audit/` contains only audits that are active, still needed as a current
code reference, or reusable for future audits. Audit reports are evidence, not
the product backlog and not product canon.

Last reconciled against source code: **2026-07-14**. See
[`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) for
the per-document cleanup ruling and surviving current-code findings.

## Active

| File | Why it remains here | Next action |
|---|---|---|
| [`test-mocks.md`](test-mocks.md) | Internal-mock debt remains; GC1 prevents new debt but does not remove the existing mock boundary. | Recount before the next remediation slice; replace mock-heavy boundaries incrementally. |
| [`2026-07-12-one-way-door-risk-register.md`](2026-07-12-one-way-door-risk-register.md) | Its follow-up plan is still draft and its gate-owner work is not drained. | Execute or explicitly retire tasks in `docs/plans/2026-07-12-one-way-door-risk-drain.md`. |
| [`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) | Current-code reconciliation of the stale audit estate. | Convert the uncaptured survivors into current work items or explicit discard rulings. |

## Current reference

| File | Why it remains here |
|---|---|
| [`2026-07-11-consent-denial-behavior.md`](2026-07-11-consent-denial-behavior.md) | Current destructive denial behavior; follow-up is already captured by **`WI-1761` — consent-denial behavior audit; complete audit feeding the pending counsel ruling and build slice**. |
| [`_audit-report-template.md`](_audit-report-template.md) | Reusable code-first audit template. |

## Archived on 2026-07-14

One hundred stale Markdown documents and 32 supporting artifacts moved intact to
[`docs/_archive/audit/2026-07-14-stale-audit-cleanup/`](../_archive/audit/2026-07-14-stale-audit-cleanup/).
The archive preserves historical evidence but must not be read as current code
status. Its complete per-document action is recorded in the cleanup disposition
report.

## Adding an audit

1. Use `YYYY-MM-DD-<slug>.md` for point-in-time reports.
2. Verify findings from current source code and tests; do not infer status from an older audit.
3. Name the current work item, plan, or owner for every actionable finding.
4. Add the report here as Active or Current reference.
5. Archive it when the work is addressed, superseded, or tracked elsewhere.
