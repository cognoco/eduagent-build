# Archon Workflow Issues

Lightweight tracker for Archon workflow / scaffolding issues that are real but deferred for follow-up. Code-level findings only — for plan-content findings (cluster phases, decisions), use `docs/audit/cleanup-plan.md` directly.

**ID scheme:** `AW-NNN` (Archon Workflow). Allocate sequentially. Distinct from `D-`, `DEV-`, `BUG-`, `PR-`, `ADV-` used elsewhere in this repo.

**Status values:** `open` → `in-progress` → `resolved` (with PR/commit ref) | `wontfix` (with reason).

## Open

| ID | Severity | Surface | Summary | Source |
|---|---|---|---|---|
| AW-001 | MEDIUM | `.archon/scripts/cleanup-scope-guard.sh:56-64` (and 228-236) | `allowed_files` is unioned with `.validate-allowed-extras` early, then the `.reverted-files` detection later iterates the unioned set, treating validate-only files as "claimed but not delivered." Causes inaccurate PR-body reporting on which claimed files were reverted by fix-locally. | PR #217 review (coderabbitai) |
| AW-002 | MEDIUM | `.archon/scripts/gather-review-context.sh:29-35` | Cached diff file path is `${artifacts_dir}/.diff` with no commit-hash suffix. If `artifacts_dir` is reused across runs and HEAD changed between them, subsequent invocations read a stale diff (the "New Abstractions" scan downstream then reports stale data). Needs verification: in current Archon, does `artifacts_dir` ever persist across runs? If never, this is a non-issue and can be closed `wontfix`. | PR #217 review (coderabbitai) |
| AW-003 | MEDIUM | `.archon/scripts/append-followup.sh:73-76` (and 87-90) | `command -v doppler` check runs unconditionally before the `NOTION_API_KEY` env-var fallback. Defeats the purpose of commit `23da9f4c` which added the env-var fallback — script still hard-fails on machines without Doppler even when `NOTION_API_KEY` is set. Fix: gate doppler-required checks behind `[[ -z "${NOTION_API_KEY:-}" ]]`. | PR #217 review (coderabbitai) |
| AW-004 | LOW | `.archon/workflows/execute-cleanup-pr.yaml` (filename vs `name:` field) | The merged DRAFT workflow file is `execute-cleanup-pr.yaml` on disk but its `name:` field was renamed to `execute-cleanup-pr-merged` in PR #217 (F1) so it no longer shadows the canonical invocation target. Open question: does Archon's workflow runner discover by `name:` field (in which case F1 fully resolved the shadowing concern) or by filename (in which case the file should be renamed too — e.g. `execute-cleanup-pr-merged.yaml` — to fully avoid accidental discovery)? Verify before activating the merged variant. | PR #217 review (claude[bot] round 2) |
| AW-005 | LOW | `.archon/workflows/execute-cleanup-pr.yaml:109` | The implement node specifies `model: gpt-5.5`. claude[bot] flagged that `gpt-5.5` may not be a documented OpenAI model identifier. The DRAFT workflow has not been activated yet, so this has never been validated. Verify before activation: try a one-shot Archon call with this model name and confirm it resolves; if not, swap to the correct identifier (likely `gpt-5.5-preview` or whatever Archon's model registry maps it to). | PR #217 review (claude[bot] round 2) |

## Resolved

(none yet)

## Won't fix

(none yet)
