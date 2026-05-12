# Archon Workflow Issues

Lightweight tracker for Archon workflow / scaffolding issues that are real but deferred for follow-up. Code-level findings only — for plan-content findings (cluster phases, decisions), use `docs/audit/cleanup-plan.md` directly.

**ID scheme:** `AW-NNN` (Archon Workflow). Allocate sequentially. Distinct from `D-`, `DEV-`, `BUG-`, `PR-`, `ADV-` used elsewhere in this repo.

**Status values:** `open` → `in-progress` → `resolved` (with PR/commit ref) | `wontfix` (with reason).

## Open

| ID | Severity | Surface | Summary | Source |
|---|---|---|---|---|
| AW-002 | MEDIUM | `.archon/scripts/gather-review-context.sh:29-35` | Cached diff file path is `${artifacts_dir}/.diff` with no commit-hash suffix. If `artifacts_dir` is reused across runs and HEAD changed between them, subsequent invocations read a stale diff (the "New Abstractions" scan downstream then reports stale data). Needs verification: in current Archon, does `artifacts_dir` ever persist across runs? If never, this is a non-issue and can be closed `wontfix`. | PR #217 review (coderabbitai) |
| AW-005 | LOW | `.archon/workflows/execute-cleanup-pr.yaml:109` | The implement node specifies `model: gpt-5.5`. claude[bot] flagged that `gpt-5.5` may not be a documented OpenAI model identifier. The DRAFT workflow has not been activated yet, so this has never been validated. Verify before activation: try a one-shot Archon call with this model name and confirm it resolves; if not, swap to the correct identifier (likely `gpt-5.5-preview` or whatever Archon's model registry maps it to). | PR #217 review (claude[bot] round 2) |

## Resolved

| ID | Resolved | Commit / PR | Notes |
|---|---|---|---|
| AW-001 | 2026-05-12 | PR #217 (round 3) | `cleanup-scope-guard.sh` now snapshots `claimed_files="$allowed_files"` immediately after the work-order extraction (before the `.validate-allowed-extras` union), and the `.reverted-files` detection loop iterates `claimed_files` instead of the mutated `allowed_files`. The "Allowed Files (from work-order)" violation-report header at line 167 still uses `allowed_files` because that section semantically wants the full allowed set including validate-extras. |
| AW-003 | 2026-05-12 | PR #217 (round 3) | `command -v doppler` check moved from the unconditional pre-flight section into the `else` branch of the `NOTION_API_KEY` env-var check. Machines with `NOTION_API_KEY` set but no doppler installed now succeed; only the Doppler-fallback path requires the binary. Error message updated to mention both prerequisites. |
| AW-004 | 2026-05-12 | PR #221 | Obsolete. The shadowing concern was specific to a moment when `execute-cleanup-pr-{claude,codex}.yaml` and the merged draft coexisted. The `-claude`/`-codex` variants have since been retired and the merged workflow IS canonical, so the `name:` field rightly matches the filename (`execute-cleanup-pr`). PR #221 finished the rename across Usage text, description body, and init-tracing arg. |

## Won't fix

(none yet)
