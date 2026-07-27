# WI-2840 verification

Verified on 2026-07-27 in `.worktrees/WI-2840`.

| Command | Result |
|---|---|
| `pnpm exec jest --config scripts/jest.config.cjs --runInBand scripts/claude-review-scope-workflow.test.ts scripts/check-github-workflow-security.test.ts` | PASS — 2 suites, 52 tests, including writable-review manifest tampering |
| `BASE_REF=main bash scripts/check-change-class.sh --branch --run --fast` | PASS — 3/3: full `tsc --build`, no-Gemini ratchet, workflow-security guard |
| `pnpm exec jest --config scripts/jest.config.cjs --runInBand` | PASS — 59 suites, 1,038 tests after the post-review refresh repair |
| `pnpm check:github-workflow-security` | PASS |
| `pnpm exec prettier --check .github/workflows/claude-code-review.yml scripts/check-github-workflow-security.ts scripts/check-github-workflow-security.test.ts scripts/claude-review-scope-workflow.test.ts` | PASS |
| `git diff --check` | PASS |
| live read-only PR #2664 probe described in `incident-evidence.md` | 8 authoritative files; all 3 parsed finding paths out of scope |

`actionlint` was not installed on this machine. The workflow YAML was parsed by the structural and behavioral Jest suites, and the actual `run:` blocks were executed by the behavioral suite under Bash with `set -u -o pipefail` (manifest additionally under `set -e`).

Manual security/deploy check: no deployment target or environment credential changed. Both manifest captures use the existing `github.token` inside the existing job permissions (`contents: read`, `pull-requests: write`, `issues: read`, `id-token: write`); no permission was widened. Trusted-base rules remain under `.trusted-actions`, manifest path strings are explicitly untrusted, the post-review refresh runs after every writable Claude action and before evaluation, and no PR-workspace script is executed by the new gate.
