# Commit → PR → Merge: Gate Model (eduagent-build implementation)

**Status:** Implemented (Harness Hygiene program — Cosmo WP WI-398). Gates live on `harness-hygiene`; the first real-PR CI proof rides WI-388. Decided 2026-05-26 via `/grill-with-docs` (D1–D6); slimmed 2026-06-09 to a repo implementation spec (WI-398) — the original strawman with full problem narrative and rationale is in this file's git history.
**Principle (canonical):** `ZDX-ADR-0005` (execution-substrate gate model) — `zdx/adr/ZDX-ADR-0005-execution-substrate-gate-model.md` in the **nexus** repo (`cognoco/nexus`) — *CI is the authoritative gate protecting `main`; local hooks are a fast-feedback subset/mirror; checks stratified by cost + determinism; a flaky check gates nothing; local bypass is safe because CI backstops it.* This doc does not restate the principle — it records how this repo implements it.
**OS policy (canonical):** [`MMT-ADR-0019`](../adr/MMT-ADR-0019-cross-platform-development-os-agnostic-by-default.md) — dev spans Windows (native + WSL), macOS, and Linux; CI is Linux. Default to OS-agnostic tooling; never "remove support" for an OS in use. *(Corrects this spec's original "dev is macOS / remove Windows workarounds" premise — WI-537.)*

## 1. Repo assumptions

- **A1 — agents work in isolated worktrees** (`.worktrees/<branch>/`); shared-tree work is the exception, kept functionally non-overlapping.
- **A2 — OS policy per MMT-ADR-0019** (supersedes the original "fleet is macOS+Linux" assumption): dispositions follow its 5-category taxonomy (make-portable / OS-gate / keep-the-accommodation / keep-the-knowledge / leave).
- **A3 — commit scope defaults to own-work**, never `git add -A`.

## 2. The gate model (as landed)

| Gate | Runs | Cost / determinism | Blocking? |
|---|---|---|---|
| **Local edit (author)** | typecheck/lint in-loop while iterating | cheap | advisory |
| **pre-commit** (`.husky/pre-commit`) | lint-staged (ESLint+Prettier, staged; concurrency OS-gated per MMT-ADR-0019); GC1 Pattern-A; eval-snapshot-staged guard; i18n-staged guard; skills-sync auto-stage; secret/large-file scan. **No whole-tree `tsc`/jest** (moved to pre-push, D1) | cheap, deterministic, **staged-only** | blocking-local (bypassable; CI backstops) |
| **commit-msg** | commitlint + sweep-audit guard | trivial | blocking-local |
| **pre-push** (`scripts/pre-push-tests.sh`) | **primary local type/test gate:** delta `tsc --build` + surgical jest + Tier-1 eval (prompt/harness delta) + i18n, on the push delta | moderate, deterministic | blocking-local (skipped on `main`) |
| **CI — required (PR)** | affected lint/test/typecheck/build (`ci.yml`); **change-class router** (fail-loud, fail-open) gates API integration tests; quarantine-registry validator; G11 ratchets (no-clinical-copy, test-only-exports); API Quality Gate (`api-quality-gate.yml`) with **Tier-1 eval** gated on the router's `eval` class; Playwright web smoke | deterministic | **required to merge** |
| **CI — scheduled / labeled (`main`)** | `eval-live.yml`: Tier-2 `--live` evals + Layer-1 signal-drift, weekly cron + `run-live-evals` label + manual dispatch (portable Doppler, checksum-pinned); quarantined tests report via `quarantine-report.yml`; full e2e (Maestro) nightly | $$ / nondeterministic | non-blocking; alerts (de-duplicated GitHub issue) on failure |
| **PR review** | Claude review **advisory-green** (findings → triage by protocol; red = did-not-run, WI-378); human review required only on CODEOWNERS high-risk paths (D4) | — | policy |

**Routing single-source-of-truth:** `scripts/check-change-class.sh` (the matrix in `docs/change-classes.md`) is both the human-readable "you touched X, run Y" surface and — via `--github-output` — the machine flags (`integration`, `eval`) that gate slow CI suites. PR path uses the router; push-to-`main` keeps the dorny `api` paths-filter (covers `apps/api`, `packages/database`, `packages/schemas`, `packages/retention`, `pnpm-lock.yaml` — the D2 verify item, satisfied on both paths).

## 3. Decisions D1–D6 — disposition index

Principle-level rationale lives in ZDX-ADR-0005; this index records each decision's repo implementation and deltas.

| D | Decision (short) | Implemented by | Notes / repo deltas |
|---|---|---|---|
| **D1** | pre-commit cheap + staged-only; whole-tree `tsc`/jest → pre-push | WI-450 | `scripts/pre-commit-tests.sh` retired; pre-push is the primary local gate |
| **D2** | integration stays a required, change-class-routed CI check; local-run exhortation downgraded to advisory | WI-452 (router) | verify-item satisfied: router classes (`shared-schemas`, `db-schema`, `db-migrations`, `api-*`, `inngest`, `dependencies`) + dorny push filter both cover the package paths |
| **D3** | commit skill: aggressive slim, runtime-neutral, global core + repo overlay | WI-447 (global `/zdx-core:commit`) + WI-388 (repo overlay, 495→85 lines) | secret/large-file scan moved into pre-commit (WI-450); coordinator-doctrine purge from rule files → WI-455 |
| **D4** | LLM review advisory (never required — determinism precondition); human review via CODEOWNERS high-risk paths only | WI-378 (advisory-green + marker-gate) + WI-453 (CODEOWNERS file) | branch-protection enforcement (repo-admin settings) → WI-538 (Manual/HITL, open) |
| **D5** | cache correctness: never restore TS incremental state | WI-451 | `*.tsbuildinfo` excluded from typecheck cache outputs. **Nets (CI nuke-step + `nx reset` dance) stay until several real CI builds prove zero TS6305** — first proof rides WI-388; only then delete the nets + retire `feedback_nx_reset_before_commit` |
| **D6** | `--no-verify` two-level doctrine: deliberate narrow local bypass is safe (CI backstops); repeated need = mis-placed check; the automated commit agent never bypasses autonomously | doctrine rewrite → WI-455 | **Windows escape RETAINED** (MMT-ADR-0019 / WI-537): `nx affected` is broken on Windows by `@nx/expo` upstream, so the ">20 files" bypass is a deliberate, platform-scoped accommodation for human Windows devs; retires only on the upstream fix (watch-item WI-542) |

Struck from scope: **Nx Cloud DTE** (Nx Cloud disconnected 2026-06-01, IID-792 — never enabled). CI speed rides the router + cache correctness.

## 4. Walk-back dispositions (input to WI-455 doc rewrite + WI-387 memory tidy)

| Memory / rule | Root cause | Disposition |
|---|---|---|
| `feedback_agents_commit_push` (subagents don't commit in shared tree) | shared-tree index races | **Obsolete** under A1 → reduce to "agents work in worktrees" |
| `feedback_partial_staging_stash`, `_stash_pop_kept`, `_stash_untracked_protection`, `_git_pathspec_literal_brackets` | R1 (full-tree validation, fixed by D1) + shared tree | **Obsolete/archive** (R1 fixed + A1) |
| `feedback_nx_reset_before_commit`, stale-`dist/` scars | cache-input correctness | **Delete after** D5's CI proof (see D5 nets note) |
| `project_nx_expo_plugin_bug` (`--no-verify` for >20 files) | `@nx/expo` broken on Windows | **KEEP** (Cat-3, MMT-ADR-0019): serves an OS in active use; retire on upstream fix (WI-542) |
| `feedback_precommit_typecheck`, `feedback_batch_pr_fixes`, `feedback_verify_full_ci` | slow CI loop / parity gaps | **Fold into AGENTS.md** as "run what CI runs" |
| `feedback_commit_skip_failing` (relatedness classification) | partial-commit pain | **Keep** (slimmed) |
| `feedback_no_pr_unless_asked`, `_use_gh_cli_for_prs` | user policy | **Folded into AGENTS.md § Pull Requests** (WI-398/G8); memories retire via WI-387 |
| `_never_switch_branch`, `_no_suppression`, `_pr_required_checks` | user policy / hard-won triage | **Keep as policy** |

## 5. Remaining work (tracked)

- **CI proof on a real PR** — WI-388's remaining job; exit-criterion 1 of the Harness Hygiene gate (WI-530). Unlocks D5 net-deletion.
- **Doctrine rewrite** (Required-Validation / Git-Commits sections: `--no-verify` two-level + coordinator purge) — WI-455.
- **Memory archival per §4** — WI-387 (hard-pinned LAST in the program).
- **Branch protection on CODEOWNERS paths** — WI-538 (Manual/HITL).
- **Signal-baseline seed** — `api-quality-gate.yml` validate-baseline step stays `continue-on-error` until the baseline is seeded (WI-556); flip to blocking in the seeding PR.
