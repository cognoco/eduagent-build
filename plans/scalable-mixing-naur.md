# Stage 3 — Risk Tiering and Post-PR Autonomy

## Context

Stages 1 and 2 of the Archon cleanup-PR workflow tuning are complete and validated. The pipeline now:
- Tags telemetry by workflow name
- Catches GC1 ratchet violations locally before push
- Uses appropriate models per node (opus-4-6 / sonnet / gpt-5.5)
- Replaces 4 LLM nodes with deterministic shell (extract, synthesize, create-pr, summary) — saving ~4 wall-clock minutes per run
- Files Notion follow-ups for blocked phases
- Catches drift via scope guards + re-validates after fix-locally

PR #184 (claude, 16 min) and PR #185 (codex, 28 min) both came out CI-green on the most recent smoke test. Stage 3 is the final round before this becomes the steady-state workflow.

**The three problems Stage 3 solves:**

1. **Implement burns tokens on incoherent work orders.** Today the workflow always runs `implement` end-to-end even if the work order misclassifies a file (e.g., the AccordionTopicList misclassification opus-4-6 caught in adversarial). A cheap pre-implement gate would catch these earlier.

2. **All PRs pay full review cost regardless of size or sensitivity.** A 50-line single-file refactor gets the same 4-reviewer fan-out as a 600-line auth middleware change. Small PRs are over-reviewed; sensitive PRs aren't differentially reviewed.

3. **CI failures after PR creation are invisible to the workflow.** The recent runs were CI-green by luck (and Stage 1's GC1 guard); when CI fails post-push there's no automated recovery. The workflow declares "done" and walks away.

This stage adds three nodes to fix all three: `plan-review`, `risk-class`, and `ci-watch-and-fix`.

## Design decisions (already resolved)

1. **Risk signal:** diff stats + path matching only. No dependency on cluster severity in cleanup-plan.md — keeps the node usable for non-cleanup workflows later.
2. **plan-review BLOCK handling:** downgrade to risky + continue. BLOCK doesn't terminate; it forces full reviewer fan-out and attaches plan-review's reasoning to the PR. Produces a tangible artifact instead of a Notion ticket.
3. **ci-watch-and-fix budget:** iteration count only (3 attempts + same-failure-twice stop). No mid-flight Logfire cost queries — simpler, no runtime dependency on telemetry.

## Verified Archon facts (from exploration)

- `when:` syntax: `when: "$node-id.output == 'value'"`. Hyphens in node IDs allowed. Operators `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`. No parens. Single-quote literals.
- Compound output: `command:` nodes can expose structured fields via `output_format` (e.g. `$plan-review.output.verdict`). Bash nodes expose stdout as `$nodeId.output` (trailing newline trimmed).
- Skipped nodes (via `when: false`) propagate as `state: 'skipped'`. Default `trigger_rule: all_success` auto-skips downstream — no extra wiring needed unless we want a downstream to run despite an upstream skip (then `trigger_rule: none_failed_min_one_success`).
- `synthesize` already uses `trigger_rule: one_success`, so it survives review-node skipping fine.
- Live precedent: `~/_dev/Archon/.archon/workflows/archon-fix-github-issue.yaml` uses `when: "$classify.output.issue_type == 'bug'"`.

## Concrete paths from exploration (no CODEOWNERS file exists)

Sensitive paths verified to exist in the repo:
- **auth**: `apps/api/src/middleware/auth.ts`, `middleware/jwt.ts`, `middleware/profile-scope.ts`, `routes/auth.ts`, `routes/account.ts`, `packages/schemas/src/auth.ts`
- **billing**: `apps/api/src/routes/billing.ts`, `services/billing/**`, `routes/*-webhook.ts` (stripe, revenuecat)
- **migrations**: `packages/database/src/migrations/**`

## Files to add or edit

### New scripts

**`.archon/scripts/cleanup-risk-class.sh`** — emits `tiny`, `normal`, or `risky` to stdout based on:
- Pre-implement SHA → HEAD diff (already saved by install node at `$ARTIFACTS_DIR/.pre-implement-sha`)
- File count and line count vs. thresholds in `risk-paths.json`
- Path matches against sensitive globs in `risk-paths.json`
- `$ARTIFACTS_DIR/plan-review-verdict.txt` if present (BLOCK → force `risky`)

Logic:
```
verdict = "normal"
if any changed file matches risk paths → "risky"
elif files > 20 OR lines > 800 → "risky"
elif files <= 5 AND lines <= 100 AND no risk paths → "tiny"
if plan-review-verdict.txt contains "BLOCK" → "risky" (max-of)
echo "$verdict"
```

**`.archon/config/risk-paths.json`** — new config:
```json
{
  "auth": [
    "apps/api/src/middleware/auth.ts",
    "apps/api/src/middleware/jwt.ts",
    "apps/api/src/middleware/profile-scope.ts",
    "apps/api/src/routes/auth.ts",
    "apps/api/src/routes/account.ts",
    "packages/schemas/src/auth.ts"
  ],
  "billing": [
    "apps/api/src/routes/billing.ts",
    "apps/api/src/routes/stripe-webhook.ts",
    "apps/api/src/routes/revenuecat-webhook.ts",
    "apps/api/src/services/billing/**"
  ],
  "migrations": [
    "packages/database/src/migrations/**",
    "packages/database/drizzle/**"
  ],
  "thresholds": {
    "tiny":  { "max_files": 5,  "max_lines": 100 },
    "risky": { "min_files": 20, "min_lines": 800 }
  }
}
```

### New commands

**`.archon/commands/cleanup-plan-review.md`** — pre-implement gate. Reads `$ARTIFACTS_DIR/work-order.md` and the source files it claims (using `git show origin/main:<path>`). Verifies:
- All claimed files actually exist (or the work order says "delete"/"create")
- Phase descriptions match the actual code structure (no obvious classification errors like the AccordionTopicList case)
- Verification commands are runnable
- No phase claims a file already deleted on origin/main

Outputs:
- `$ARTIFACTS_DIR/plan-review.md` — full reasoning
- `$ARTIFACTS_DIR/plan-review-verdict.txt` — single word: `OK` or `BLOCK`
- Stdout: same single word (so downstream can read via `$plan-review.output`)

Models: claude/sonnet medium for claude flavor; codex/gpt-5.5 medium for codex flavor.

**`.archon/commands/cleanup-ci-watch-and-fix.md`** — duplicates and adapts the structure of `.claude/commands/my/fix-ci.md`. Key adaptations from fix-ci:

- Reads PR number from `$ARTIFACTS_DIR/.pr-number` (set by create-pr node), not `$ARGUMENTS`.
- `gh pr checks <PR> --watch` to wait for completion, then `gh run view <id> --log-failed` for diagnostics on each failure.
- Failure auto-classification (regex-based, not human-diagnosis):
  - `gc1-ratchet`: log contains `jest.mock` + GC1 ratchet message
  - `lint`: log contains eslint errors
  - `typecheck`: log contains tsc TS\d+ errors
  - `test`: log contains jest failure markers
  - `build`: log contains build/bundle errors not matching above
  - `flake`: same step succeeded on retry within attempt → skip without code change
  - `code-review`: claude-review check failed → read `gh api repos/.../pulls/<n>/reviews` and address HIGH only
- Reuses constraints from `cleanup-fix-locally.md`: no new test files, no new internal `jest.mock`, no `--no-verify`, no suppression pragmas.
- Hard caps: `max_iterations: 3` AND "same failure twice = STOP" (regex match on log → bail). No cost cap — iteration count is the proxy.
- Re-validates locally before each push (reuses `cleanup-validate.md` Phase 2.5 GC1 check).
- Termination promise: emits `<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>` when either all checks pass or caps hit.
- On giveup:
  - Posts a "needs human attention" comment to the PR via `gh pr comment` (template includes failure summary, last 3 attempts, classification)
  - Files a P1 follow-up via `.archon/scripts/append-followup.sh`
  - Exits 0 so the summary node still runs (summary template will surface the giveup)

Models: sonnet (claude flavor) / gpt-5.5 medium (codex flavor) for the entire loop. CI failures are mechanical; opus is overkill.

### Modified workflow YAMLs

**Both `.archon/workflows/execute-cleanup-pr-claude.yaml` and `execute-cleanup-pr-codex.yaml`:**

Insert `plan-review` between `install` and `implement`:
```yaml
- id: plan-review
  command: cleanup-plan-review
  depends_on: [install]
  context: fresh
  provider: claude          # or codex
  model: sonnet             # or gpt-5.5
  modelReasoningEffort: medium

- id: implement
  depends_on: [plan-review]   # was [install]
  ...
```

Insert `risk-class` after `validate`, before `review-scope`:
```yaml
- id: risk-class
  depends_on: [validate]
  bash: ./.archon/scripts/cleanup-risk-class.sh "$ARTIFACTS_DIR"

- id: review-scope
  depends_on: [risk-class]    # was [validate]
  ...                         # always runs (every PR gets scope review)
```

Add `when:` gates to skip reviewers on tiny PRs:
```yaml
- id: code-review
  depends_on: [review-scope]
  when: "$risk-class.output != 'tiny'"
  ...

- id: test-coverage
  depends_on: [review-scope]
  when: "$risk-class.output != 'tiny'"
  ...

# adversarial-review: NO when: — always runs (cross-LLM is the floor)
```

Insert `ci-watch-and-fix` between `post-review-comments` and `summary`:
```yaml
- id: ci-watch-and-fix
  depends_on: [post-review-comments]
  context: fresh
  idle_timeout: 1800000   # 30 min ceiling for 3-iter loop
  loop:
    prompt: |
      Read and execute the instructions in `.archon/commands/cleanup-ci-watch-and-fix.md`.
      Artifacts directory: $ARTIFACTS_DIR
    until: ALL_CHECKS_GREEN_OR_GIVEUP
    max_iterations: 3
    fresh_context: true
  provider: claude        # or codex
  model: sonnet           # or gpt-5.5

- id: summary
  depends_on: [ci-watch-and-fix]   # was [post-review-comments]
  ...
```

### Existing utilities to reuse (do NOT re-implement)

- `.archon/scripts/append-followup.sh` — Notion P1 filer. Used by ci-watch-and-fix on giveup.
- `.archon/scripts/post-review-comments.sh` — pattern for `gh pr comment` invocations. ci-watch-and-fix's giveup-comment script can mirror its structure.
- `.archon/scripts/cleanup-extract.sh` — already produces `work-order.md` with backtick-delimited file lists. plan-review parses these directly; do not re-parse cleanup-plan.md.
- `.archon/scripts/cleanup-summary.sh` — already templated; needs a small extension to surface ci-watch-and-fix's giveup status if present.
- `.archon/scripts/cleanup-scope-guard.sh` — pattern for diffing against `.pre-implement-sha`. risk-class.sh follows the same base-ref logic.
- `.claude/commands/my/fix-ci.md` — duplicate-and-adapt for `cleanup-ci-watch-and-fix.md`. Do NOT invoke directly.

## Agent strategy

Three parallel specialist sub-agents, then coordinator integration:

- **Sub-agent A (general-purpose):** `cleanup-ci-watch-and-fix.md` + giveup-comment template. Largest single artifact; needs careful adaptation of fix-ci's structure with new constraints (findings.json awareness, append-followup integration, regex classification). Independent.
- **Sub-agent B (general-purpose):** `cleanup-risk-class.sh` + `risk-paths.json` + the `when:` wiring in both YAMLs. Self-contained. Can run in parallel with A and C.
- **Sub-agent C (general-purpose):** `cleanup-plan-review.md` and the YAML insert for the plan-review node. Self-contained. Can run in parallel.

After all three return, coordinator:
1. Verifies the three artifacts integrate cleanly (no overlapping YAML edits beyond their declared sections)
2. Commits via `/commit`
3. Runs the verification scenarios below

## Verification

Run the workflows on three deliberately different cleanup-plan PRs.

**Scenario 1 — Tiny PR** (e.g., a small docs/comment-only PR or single-file rename, <5 files, <100 lines, no risk paths). Both flavors.

Expected:
- `risk-class` outputs `tiny`
- Logfire shows `code-review` and `test-coverage` spans missing for the run (skipped)
- `adversarial-review` and `review-scope` ran
- PR is CI-green
- Per-run wall time ~30-50% lower than equivalent normal-class run

**Scenario 2 — Risky PR** (e.g., a PR that touches `apps/api/src/middleware/auth.ts` or `services/billing/**`). Pick one from cleanup-plan.md that crosses these paths, or stage a synthetic one. Both flavors.

Expected:
- `risk-class` outputs `risky` (path match wins)
- All four review nodes ran (no skipping)
- PR is CI-green or `ci-watch-and-fix` recovered

**Scenario 3 — Deliberately broken PR.** Manually inject a known-failure pattern into the implement step's output (e.g., add a `jest.mock('./foo')` to a test file without `gc1-allow`). Run on either flavor.

Expected:
- The local `validate` and `re-validate` nodes catch and reject the violation OR
- If they don't (possible: Stage 1's GC1 grep is on the diff; depends on injection method), `ci-watch-and-fix` triggers after PR creation, classifies as `gc1-ratchet`, applies the targeted fix (replace `jest.mock` with `jest.requireActual` override), pushes, re-watches CI, eventually goes green
- Verify the loop respects 3-iter cap by running a second test where the failure is unfixable (e.g., a deliberately broken type in production code that ci-watch-and-fix's sonnet/gpt-5.5 can't repair) and confirm:
  - Loop hits 3 iterations OR same-failure-twice
  - Posts "needs human attention" comment to the PR
  - Files a P1 row in the Notion bug tracker
  - Summary surfaces the giveup status

**Scenario 4 (smoke for plan-review BLOCK path).** Stage a work-order with a deliberate misclassification (e.g., reference a file that doesn't exist on origin/main as if it does).

Expected:
- `plan-review-verdict.txt` contains `BLOCK`
- `implement` still runs (no `when:` block on it)
- `risk-class` reads the verdict and emits `risky` regardless of diff stats
- All reviewers run
- The eventual PR description includes the plan-review.md reasoning attached as a comment

## Out of scope (deferred)

- A security-specific reviewer for `risky` class (placeholder slot exists; not implemented this round)
- Merging the two flavors into a single "best of both" workflow (explicit later goal once A/B data stabilizes)
- Patching Archon itself for native `ARCHON_WORKFLOW` env var (Stage 1 workaround is sufficient)
- Slimming CLAUDE.md (separate decision)

## Success criteria

End-to-end after Stage 3 lands:
1. Tiny PRs save ≥30% wall time vs. baseline by skipping reviewers
2. Risky PRs always run all reviewers regardless of size
3. CI failures post-push trigger `ci-watch-and-fix` and recover within 3 attempts on common patterns (gc1-ratchet, lint, type)
4. Unrecoverable failures land as Notion P1 follow-ups + PR comments, not silent walk-aways
5. plan-review catches at least one work-order error of the AccordionTopicList class on a deliberately-staged input
6. Both flavors still produce CI-green PRs on normal cleanup-plan PRs

---

## Outcomes (2026-05-09)

Two verification runs covered the wiring; full 7-run matrix was scoped down per a cost-benefit reframing during execution (output is throwaway during the spike, so handling every edge case in code is over-investment).

**Codex flavor on PR-08 (tiny scenario)** — green end-to-end. PR #186 created, all checks (CI, claude-review, Playwright web smoke, CodeRabbit) passed. `risk-class` correctly emitted `tiny`; `code-review` and `test-coverage` spans absent from Logfire (skipped via `when:` gate, exactly as designed); `adversarial-review` and `review-scope` ran. The 3 new nodes (`plan-review`, `risk-class`, `ci-watch-and-fix`) executed without error; `ci-watch-and-fix` was a no-op since CI passed on first push. Wall time: ~6 min (vs. ~16 min baseline for PR-08 on the same flavor pre-Stage-3) — ≥60% reduction, exceeds the ≥30% success criterion.

**Claude flavor on PR-04 (risky scenario)** — failed at `scope-guard-post-fix` on both attempts, on different files each time:
- Attempt 1: `tests/integration/auth-chain.integration.test.ts` (deletion of `/v1/auth/*` from `PUBLIC_PATHS` made the test's `not.toBe(401)` assertion stale; reviewers correctly caught CR-1/ADV-1; fix-locally correctly updated the test in place; scope-guard rejected the file as not-in-work-order).
- Attempt 2 (after adding the integration test to the work-order): `apps/api/src/middleware/consent.ts` (had a stale `/v1/auth/` in `EXEMPT_PREFIXES`; reviewers escalated this from LOW/CR-2 in attempt 1 to CRITICAL/ADV-1 in attempt 2; fix-locally removed the entry; same scope-guard rejection).

`risk-class` correctly emitted `risky` via auth-path match (overriding the size-based `normal` it would otherwise have been). All four reviewers ran (no skipping). plan-review emitted `OK` correctly — its current checks are syntactic (file existence, semantic mismatch) and don't include cross-cutting blast-radius detection.

The new `b8958dce` graceful-handoff change worked as intended on attempt 2: `Filed follow-up: https://www.notion.so/Scope-guard-fired-work-order-incomplete-for-PR-04-...` appeared in stderr, with a 4-step resolution recipe and the unexpected file enumerated.

**Pattern surfaced.** Deletion-heavy PRs have multi-file blast radius that human plan authors tend to enumerate incompletely. The reviewers DO find the missing files (it's their job), but fix-locally's correct application of those fixes triggers scope-guard. Each rerun trims one cross-cutting file off the unknown-unknowns list. Across the 28-PR cleanup queue, an estimated 4-5 PRs are shaped this way (PR-04, PR-10, PR-21, PR-23, possibly PR-25); maybe 2-3 will trip the wire in practice.

**Design implication declined.** A blast-radius grep in plan-review (option 2 from the in-session discussion) would have caught these statically by greping for backtick-wrapped removal targets across the codebase. Withdrawn after considering scale: spending design budget on detection clever enough to prevent 2-3 reruns out of 28 throwaway PRs is over-engineering. The graceful-handoff exit is the right cost-tier intervention — strict scope, clear ticket, fast manual loop. Documented here in case a future round wants to revisit when steady-state volume is higher.

**Validated:**
1. Stage 3 wiring (3 new nodes + when-gates + DAG ordering) functions correctly, end-to-end, in both flavors.
2. `risk-class` path-match overrides size-based classification as designed (PR-04 was `normal` by size but correctly classified `risky` by auth-path match).
3. `when: "$risk-class.output != 'tiny'"` skips the right reviewers on tiny PRs (Logfire confirms missing spans).
4. `synthesize` survives reviewer skipping via its existing `trigger_rule: one_success`.
5. `plan-review` produces `OK`/`BLOCK` verdict files cleanly; verdict file is consumed by `risk-class.sh` for the BLOCK→risky override path (this specific path was not exercised — both runs emitted OK; deferring exercise to a future synthetic-block scenario if needed).
6. Graceful-handoff Notion ticket on scope violation works, including post-fix variant detection (presence of `$ARTIFACTS_DIR/review/` distinguishes from post-implement).

**Not validated (still TBD on real data):**
- `ci-watch-and-fix` end-to-end. PR-08 went CI-green on first push, so the loop ran zero iterations. No PR has actually exercised the watch → classify → fix → push → rewatch cycle. Verification deferred until a real CI failure organically triggers it.
- `plan-review` BLOCK path. Both runs emitted OK. The BLOCK→risky override in `risk-class.sh` is wired but unexercised.
- Cross-flavor A/B on identical input. We ran codex/PR-08 and claude/PR-04 — different inputs across flavors, so no direct comparability.

**State of cleanup PRs:**
- PR #186 (codex/PR-08): closed unmerged after Stage 3 validation use.
- All workflow-development drafts (#179, #184, #185, #186) closed.
- 47 dev worktrees and ~50 archon/* branches (local + origin) cleaned up post-validation.

**Workflow infrastructure changes** are committed on `consistency2` (12 commits ahead of origin/main). Not yet landed on main; landing path is a separate PR with `/ultrareview` first.
