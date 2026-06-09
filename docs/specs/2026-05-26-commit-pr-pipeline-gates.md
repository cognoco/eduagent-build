# Commit → PR → Merge: Target Gate Model (strawman)

**Status:** Decided 2026-05-26 via `/grill-with-docs`. Six decisions D1–D6 resolved (§7). Implementation pending (§9).
**Date:** 2026-05-26
**Work package:** Dimension 2 (commit→PR pipeline gate redesign) — sibling of WI-386 (Dimension 1: AGENTS.md↔CLAUDE.md reconciliation + sync).
**Authoring assumption:** decisions land here (and ultimately in CLAUDE.md/AGENTS.md), **not** in new memories — memory is the sediment this work walks back.

---

## 1. Problem (the left-shift ratchet)

Over months, CI failures (flaky tests, type drift, prompt drift) were remediated by pushing rigor **left** into pre-commit/pre-push and by accreting rules. Heavy local hooks → slow/failing commits → rework → that pain absorbed by an ever-more-sophisticated commit skill + more CLAUDE.md/AGENTS.md rules + a layer of case-specific memories. Rigor ended up at the wrong gates; the residue is a thick sediment of compensating rules.

### Two root causes that explain most of the sediment

- **R1 — pre-commit validates the full working tree, not the staged snapshot.** `tsc --build` and `jest` run *after* lint-staged restores unstaged files, so any unrelated in-progress file breaks an otherwise-clean partial commit. Root cause of the stash-gymnastics cluster, much of the 496-line commit skill, and the pressure toward `git add -A`.
- **R2 — a Windows-only tooling bug normalized `--no-verify`.** `@nx/expo/plugin` stack-overflows on Windows (`project_nx_expo_plugin_bug`), and the workaround tells agents to `--no-verify`. CI is Ubuntu. ~~dev is macOS. This is dead weight that undermines the gate model.~~ **CORRECTED 2026-06-09 (WI-537; canonical rationale in MMT-ADR-0019): dev spans Windows (native + WSL), macOS, and Linux — Windows is an OS in active use, so this is NOT dead weight. `nx affected` is genuinely broken on Windows; the `--no-verify` escape is load-bearing there and is kept until `@nx/expo/plugin` is fixed upstream (watch-item, WI-542). The defect is "Windows is degraded," not "Windows is unsupported." See A2 (corrected).**

---

## 2. Design assumptions

- **A1 — agents work in isolated worktrees** (≥90% of significant work; `.worktrees/<branch>/`). Shared-tree work is the exception and is kept functionally non-overlapping. ⇒ concurrency-damage-control machinery becomes legacy, not core.
- **A2 — fleet is macOS (dev) + Linux (CI). Windows-specific workarounds are removed, not preserved.** ~~[original assumption]~~ **CORRECTED 2026-06-09 (WI-537; canonical rationale in MMT-ADR-0019): the premise is false. Development spans Windows (native + WSL), macOS, and Linux; CI is Linux. There is no single dev OS.** Policy is therefore inverted — _default to OS-agnostic tooling; where a portable form is genuinely impractical, an OS-specific workaround is accepted and kept, never stripped._ **Never "remove support" for an OS in use.** Disposition by the 5-category taxonomy (full form in MMT-ADR-0019): **(1) incidental non-portable** → make portable; **(2) workaround imposed on all OSes** → OS-gate it; **(3) workaround for a break _on_ an OS in use** → keep (fix the tool, don't remove the accommodation); **(4) OS-specific knowledge/docs** → keep; **(5) already portable / dual-documented** → leave.
- **A3 — commit scope defaults to session/own-work**, never `git add -A`.

---

## 3. Core principle (sharpened)

> **CI is the authoritative gate that protects `main`.** Local hooks are a fast-feedback **subset/mirror** of CI checks, never the sole enforcer of a main-protecting invariant.
>
> **Stratification:** main-protecting checks are stratified by cost + determinism. Cheap + deterministic checks run on every (affected) PR and are mirrored locally; expensive or nondeterministic checks are **routed by change-class** and run only when a diff could violate them — the costliest/nondeterministic ones (live-LLM, full e2e, full integration) run **off the blocking path** on their own cadence (scheduled against `main` + label-triggered).
>
> **Determinism precondition:** a flaky or nondeterministic check gates nothing. Fix or quarantine flakiness; never relocate it.
>
> **Corollary on `--no-verify`:** local bypass is *safe by design* because CI is the backstop. If bypassing a local hook can let a defect reach `main`, the check is **mis-placed** — move it to CI, don't forbid the bypass. "`main` is always green," not "tolerate pre-existing failures."

"Protects `main`" = **every invariant has a CI check that fires whenever a diff could break it** — not that every check runs every time.

---

## 4. Target gate model

| Gate | Runs | Cost / determinism | Blocking? |
|---|---|---|---|
| **Local edit (author)** | typecheck/lint in-loop while iterating | cheap | advisory |
| **pre-commit** | lint-staged (ESLint+Prettier, staged); GC1 Pattern-A; eval-snapshot-staged guard; i18n-staged guard; skills-sync auto-stage. **No whole-tree `tsc`/jest** — moved to pre-push (Q1→2) | cheap, deterministic, **staged-only** | blocking-local (bypassable; CI backstops) |
| **commit-msg** | commitlint + sweep-audit guard | trivial | blocking-local |
| **pre-push** | **primary local type/test gate:** delta `tsc --build` + surgical jest (valid here — working tree ≈ HEAD) + Tier-1 eval + i18n, on push delta | moderate, deterministic | blocking-local (skipped on `main`) |
| **CI — required (PR)** | affected lint/test/typecheck/build; API Quality Gate; Playwright web smoke; **Tier-1 eval (promote from hook-only)**; **integration on affected change-class** | deterministic | **required to merge** |
| **CI — scheduled / labeled (`main`)** | Tier-2 `--live` evals + Layer-1 drift; full e2e (Maestro); full integration; (portability-fixed, Linux) | $$ / nondeterministic | non-blocking; alerts on drift/break |
| **PR review** | automated review findings triage; human review (see Q4) | — | policy |

**Key moves:** (a) promote the `change-class` matrix from advisory (`continue-on-error`) to a **router** that scopes slow suites; (b) promote deterministic **Tier-1 eval** into required CI (closes the `--no-verify`/Codex hole); (c) push **Tier-2 live + Layer-1 drift** to scheduled-against-`main` + label-on-demand (today they run *nowhere* automated, Windows-pathed); (d) ~~enable the **Nx Cloud DTE** already paid for, scoped to long-pole jobs~~ — **STRUCK 2026-06-09: Nx Cloud was disconnected 2026-06-01 (IID-792); DTE was never enabled. CI-speed now rides (a) the change-class router + (e) cache correctness only;** (e) fix **remote-cache input correctness** (kills phantom failures + the `nx reset` dance); (f) **quarantine flaky tests**.

---

## 5. Walk-back dispositions (the sediment)

| Memory / rule | Root cause | Disposition |
|---|---|---|
| `feedback_agents_commit_push` (subagents don't commit in shared tree) | shared-tree index races | **Obsolete** under A1 → reduce to "agents work in worktrees" |
| `feedback_partial_staging_stash`, `_stash_pop_kept`, `_stash_untracked_protection`, `_git_pathspec_literal_brackets` | R1 (full-tree validation) + shared tree | **Obsolete/archive** once R1 fixed + A1 |
| commit-skill batched mode, scope-splitting, `refs/preserved/` stash safety-net | R1 + shared tree | **Collapse** — thin the skill |
| `feedback_nx_reset_before_commit`, stale-`dist/` scars | cache-input correctness | **Delete after** §4(e) fix |
| `project_nx_expo_plugin_bug` (`--no-verify` for >20 files) | R2 (Windows) | ~~**Remove** — Windows not supported~~ → **KEEP (corrected 2026-06-09, WI-537):** Cat-3 — Windows is an OS in active use; the `nx affected` break degrades it. Keep the escape + memory until `@nx/expo` is fixed upstream (watch-item, WI-542). See MMT-ADR-0019. |
| `feedback_precommit_typecheck`, `feedback_batch_pr_fixes`, `feedback_verify_full_ci` | slow CI loop / parity gaps | **Fold into CLAUDE.md** as "run what CI runs"; less needed under fast affected CI + parity |
| `feedback_commit_skip_failing` (relatedness classification) | partial-commit pain | **Keep** (slimmed) — still useful |
| `feedback_no_pr_unless_asked`, `_use_gh_cli_for_prs`, `_never_switch_branch`, `_no_suppression`, `_pr_required_checks` | user policy / hard-won triage | **Keep as policy** |

---

## 6. What this collapses

- **commit skill: 496 → thin.** No batched mode, no scope-splitting, no stash safety-net, no `nx reset` dance once A1 + R1-fix + cache-correctness land. Also resolves the `.agents` (100-line, `git add -A` default) vs `.claude` (496-line, batched) **contradiction** — one unified, isolation-aware skill (runtime-neutral body + Claude-only `context: fork` harness adapter).
- **Stash-hazard memory cluster → archived.**
- ~~**Windows workarounds → removed.**~~ **CORRECTED 2026-06-09 (WI-537): Windows is an OS in active use — workarounds are made OS-agnostic or kept, never blanket-removed. See A2 (corrected) + MMT-ADR-0019.**

---

## 7. Decisions

### Resolved

- **D1 (was Q1) — pre-commit tests → move whole-tree `tsc`/jest to pre-push; pre-commit stays cheap + staged-only.** Rationale: at push, working tree ≈ HEAD so whole-tree `tsc --build` is *valid*; at a partial commit, working tree ≠ index so it is *structurally wrong*. This relocates the checks to the only gate where they hold, removes R1, and dissolves the stash-gymnastics rationale. Not a weakening — pre-push catches type/test breakage before anything leaves the machine; CI is the backstop.
- **D2 (was Q2) — integration tests stay as the required, change-class-routed CI check; downgrade the CLAUDE.md "run integration before committing API changes" rule to advisory.** Correction to §1 framing: integration is *already* gating — `ci.yml:209` runs `nx run api:test:integration` against real Postgres inside the required `main` job, gated to `steps.changes.outputs.api`, no `continue-on-error`. The hard local-run exhortation is redundant with CI **and** locally unreliable (stg-DB schema drift — `worktree-stg-db-integration-drift` says "rely on CI"). Make it advisory. **Verify:** the `api` path-filter also fires for API-affecting changes via `packages/schemas`/`packages/database`, not just `apps/api/**`.

- **D3 (was Q3) — Commit-skill unification (Track A): aggressive slim, one runtime-neutral body, repo overlay.**
  - **Slim to:** commit-only-your-own-changes (+ list any other modified/untracked files in the tree and never touch them — replaces batched-mode/scope-splitting; subsumes old "session-scope default"); anti-history-rewrite **boundary** (no rebase / force-push / amend-pushed / reset-hard-to-non-HEAD; non-ff push → stop+report) stated as a capability boundary with the **incident narrative deleted**; no-PR-unless-asked; conventional message **deriving allowed types from the commitlint config** (do not duplicate the type list) + repo-overlay conventions (finding-IDs, Verified-By, sweep-audit, eval-snapshot pairing); **push-by-default unless an open PR exists for the branch → commit without auto-push** (caller controls the batch boundary per `feedback_batch_pr_fixes`; note `cancel-in-progress` already softens per-push CI); slim handle-failure (related failure → stop+report; drop the "other agents' WIP" branch).
  - **Delete:** scope-splitting/batched machinery, `refs/preserved/` stash safety-net, multi-agent/lint-staged-window warnings, timing instrumentation + **all coordinator/orchestrator framing**.
  - **Keep until D-cache (Q5):** the `nx reset` dance.
  - **Unify:** one runtime-neutral body mastered in `.agents/skills/commit/SKILL.md`; the sync transform injects the Claude harness frontmatter (`context: fork`, `agent`, `model`, `allowed-tools`) when emitting `.claude/`; **remove `commit` from `SKIP_SKILLS`**. Factor as **global core + repo overlay** (supports global reuse).
  - **Ripples (cross-artifact):** (a) move the secret/large-file scan **out of the skill into the pre-commit hook** (always runs regardless of committer); make `.gitignore` the primary control. (b) purge the coordinator/orchestrator doctrine from the CLAUDE.md/AGENTS.md *Git Commits* section and **archive memory `feedback_agents_commit_push`**.

- **D4 (was Q4) — review gating.** Automated LLM review stays **advisory** (never a required blocking check — nondeterministic, violates the determinism precondition); findings triaged via the PR Review protocol. Human review is **not** globally required (would bottleneck autonomous flows / deadlock a solo human); instead a new **CODEOWNERS** routes required human review to high-risk paths only: `**/billing/**`, `**/auth/**`, `**/clerk*`, `packages/database/drizzle/**`, `packages/database/src/schema/**`, `.github/workflows/**`. Everything else is gated by deterministic CI alone.

- **D5 (was Q5) — cache correctness: fix properly, don't paper over.** Root cause = TS6305 false positives from Nx restoring stale `.tsbuildinfo` + composite `dist/*.d.ts` (incremental *state*, not deterministic output). Fix = **never restore TS incremental state from cache**; cache only deterministic, fully-input-keyed outputs. **Payoff:** delete the CI nuke-step (`ci.yml:113-118`) *and* the local `nx reset` dance (retire `feedback_nx_reset_before_commit`; closes D3's "keep `nx reset` until cache fix"). **Sequencing:** fix → verify several CI builds + local commits with zero TS6305 → *then* delete the nets (never remove nets before proving the fix). Exact target/output adjustment is implementation-time diagnosis. Also a CI-time win (restores real incremental `tsc`).

- **D6 (was Q6) — `--no-verify` restatement, two levels.** *Doctrine* (CLAUDE.md/AGENTS.md): local hooks are fast feedback; **CI protects `main`**; default = let hooks run; a *narrow, deliberate* bypass is acceptable **because CI backstops it** (comment/type-only prompt change; broken harness via `SKIP_PRE_PUSH`) and is not a violation; **needing to bypass repeatedly = the check is mis-placed → fix the gate.** *Skill behavior:* the automated commit agent **never bypasses autonomously** (let hooks run; on failure stop+report). ~~The Windows ">20 files → `--no-verify`" escape dies with R2.~~ **CORRECTED 2026-06-09 (WI-537): the Windows ">20 files → `--no-verify`" escape is RETAINED for human Windows devs (an OS in active use) — `nx affected` is broken there by `@nx/expo` upstream. It is a deliberate, platform-scoped bypass (not a violation) and retires only when the upstream bug is fixed (watch-item). The automated agent still never bypasses autonomously.**

### Open

_All resolved._

---

## 8. Sequencing

Dimension-2 decisions (this doc) are **upstream** of Dimension-1 CLAUDE.md content (Required Validation / Git Commits / Code Quality Guards sections). Decide here → write CLAUDE.md against it → fold into AGENTS.md → ship the doc-sync transform + reworked hooks **together** (reviving doc-sync edits `.husky/pre-commit`, a Dim-2 artifact).

## 9. Implementation surface (candidate Dim-2 WP sub-items)

- **`.husky/pre-commit`:** drop whole-tree `tsc --build` + surgical jest (D1); add secret/large-file scan (D3); keep GC1 / eval-snapshot / i18n / skills-sync; (Dim-1) flip the "sync not productionized" comment when doc-sync goes live.
- **`scripts/pre-commit-tests.sh`:** retire (D1).
- **pre-push (`pre-push-tests.sh`):** now the primary local type/test gate — already runs delta `tsc` + surgical jest; confirm + keep.
- **Commit skill:** rewrite slim; master in `.agents/`, transform-inject the Claude frontmatter, remove from `SKIP_SKILLS`; global-core + repo-overlay (D3).
- **`.gitignore`:** list secret patterns as the primary control (D3).
- **`ci.yml`:** change-class matrix advisory→router (stratification); Tier-1 eval required on the prompt change-class; ~~enable scoped Nx DTE~~ (struck — no Nx Cloud, IID-792); fix cache inputs + delete the nuke-step after proof (D5).
- **Live evals:** schedule-against-`main` + label trigger; fix the Windows Doppler paths (portability).
- **CODEOWNERS:** new file, high-risk paths only (D4).
- **Flaky-test quarantine:** mechanism (determinism precondition).
- **Nx cache:** exclude `.tsbuildinfo` from restored outputs (D5).
- **Memories:** archive `feedback_agents_commit_push`, `feedback_nx_reset_before_commit`, the stash cluster (`feedback_partial_staging_stash`, `_stash_pop_kept`, `_stash_untracked_protection`, `_git_pathspec_literal_brackets`), `project_nx_expo_plugin_bug`; fold `feedback_precommit_typecheck` / `_batch_pr_fixes` / `_verify_full_ci` into CLAUDE.md.
- **Dim-1 (downstream):** rewrite the CLAUDE.md Required-Validation / Git-Commits / Code-Quality / Fix-Development sections against this model; purge coordinator doctrine; converge AGENTS.md; build the transform.
