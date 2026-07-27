# WI-2840 verification

Verified on 2026-07-27 in `.worktrees/WI-2840`.

| Command | Result |
|---|---|
| `pnpm exec jest --config scripts/jest.config.cjs scripts/claude-review-scope-workflow.test.ts scripts/check-github-workflow-security.test.ts --runInBand --no-coverage` | PASS — 2 suites, 49 tests |
| `bash scripts/check-change-class.sh --run --fast` | PASS — 3/3: full `tsc --build`, no-Gemini ratchet, workflow-security guard |
| `pnpm exec jest --config scripts/jest.config.cjs --runInBand --no-coverage` | PASS — 59 suites, 1,033 tests |
| `pnpm check:github-workflow-security` | PASS |
| `pnpm exec prettier --check .github/workflows/claude-code-review.yml scripts/check-github-workflow-security.ts scripts/check-github-workflow-security.test.ts scripts/claude-review-scope-workflow.test.ts` | PASS |
| `git diff --check` | PASS |
| live read-only PR #2664 probe described in `incident-evidence.md` | 8 authoritative files; all 3 parsed finding paths out of scope |

`actionlint` was not installed on this machine. The workflow YAML was parsed by the structural and behavioral Jest suites, and the actual `run:` blocks were executed by the behavioral suite under Bash with `set -u -o pipefail` (manifest additionally under `set -e`).

Manual security/deploy check: no deployment target or environment credential changed. New API reads use the existing `github.token` inside the existing job permissions (`contents: read`, `pull-requests: write`, `issues: read`, `id-token: write`); no permission was widened. Trusted-base rules remain under `.trusted-actions`, manifest path strings are explicitly untrusted, and no PR-workspace script is executed by the new gate.
