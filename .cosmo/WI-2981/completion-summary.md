# WI-2981 completion summary

## What was done

Changed CI workflow concurrency so pull-request heads retain PR-scoped
cancellation while main pushes use an independently attributable commit-SHA
group; OTA preview publication is separately serialized and guarded against a
stale main tip.

## What changed

- Updated `.github/workflows/ci.yml` concurrency group and explanatory comments.
- Added job-level `ota-preview` cancellation and a live-main-tip check before
  the OTA publish step.
- Strengthened `scripts/ci-concurrency-contract.test.ts` with an exact group
  contract, deterministic A-D scheduling model, OTA serialization, and live-tip
  publication assertions.
- Captured deterministic RED/GREEN and revert/restoration evidence in
  `red-green.md` and `evidence.json`.

## Verification

- Focused contract suite: correction RED failed on the missing OTA guard; GREEN
  and restored candidate passed all 6 tests.
- Historical cancelled zero-job runs recorded: `30688886377`, `30688890531`,
  and `30688912863`.
- Workflow security and YAML checks remained green; no deployment authority,
  permissions, triggers, required checks, or merge gates changed.

## Caveats

GitHub-hosted rapid-merge and OTA race execution were not reproduced in this
branch; the deterministic contract proves the concurrency-key, serialization,
and live-tip invariants.

## Follow-ups

The shepherd should review the opened PR and retain the contract suite as the
regression guard for future CI concurrency edits.
