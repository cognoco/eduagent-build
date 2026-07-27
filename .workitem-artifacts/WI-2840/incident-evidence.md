# WI-2840 incident evidence

Source: [PR #2664](https://github.com/cognoco/eduagent-build/pull/2664), [Claude comment 5085911705](https://github.com/cognoco/eduagent-build/pull/2664#issuecomment-5085911705).

- Exact PR head: `a9d5f5ed6524d503f953844fce3cd5f96a816a7f`.
- GitHub's pull-files API returns 8 authoritative paths at that head:
  - `.workitem-artifacts/WI-2838/completion-summary.md`
  - `.workitem-artifacts/WI-2838/evidence.json`
  - `.workitem-artifacts/WI-2838/red-green.md`
  - `.workitem-artifacts/WI-2838/verification.md`
  - `.workitem-artifacts/WI-2838/workitem.json`
  - `apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts`
  - `apps/mobile/e2e-web/helpers/held-now-request.test.ts`
  - `apps/mobile/e2e-web/helpers/held-now-request.ts`
- The fresh trusted-bot comment reports `Files in diff: 31` and requests changes solely on these paths, none of which is in the authoritative manifest:
  - `apps/api/src/services/persisted-learning-text-guard.guard.test.ts`
  - `apps/api/src/services/learning-text-safety/gate.ts`
  - `apps/api/src/services/session/session-exchange.ts`
- The PR's history includes normal merges from `origin/main`; the cited API paths came from the base-side WI-2628 work, not WI-2838's PR diff.

## Live read-only probe — 2026-07-27

The probe fetched `pulls/2664/files`, `pulls/2664.head.sha`, and issue comment `5085911705` with `gh api`, parsed the finding-table file column with the same grammar as the repaired evaluator, and subtracted the authoritative paths.

Result: head `a9d5f5ed6524d503f953844fce3cd5f96a816a7f`; author `claude[bot]`; 8 authoritative paths; 3 parsed finding paths; all 3 out of scope.
