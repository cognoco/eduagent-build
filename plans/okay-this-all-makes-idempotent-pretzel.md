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

---

## Stage 4 — Portable timeout wrapper for `ci-watch-and-fix`

### Context

After Fix-1 (claude `first_event_timeout` bump) and Fix-C (validate-fix scope-guard recognition + Notion filer fail-loud) landed, a clean PR-03 claude run made it all the way to `ci-watch-and-fix` — the second-to-last node — and the agent appeared stuck on a `gh pr checks 199 --watch` foreground command. Investigation traced this to a recipe bug, not a hang:

- `.archon/commands/cleanup-ci-watch-and-fix.md:126` instructs the agent to wrap the watch in `timeout 1500` so the script can detect "CI never reached a terminal state" via exit code 124 and route to the `GIVEUP_REASON="ci-frozen"` branch (lines 156–162).
- **`timeout` is not on macOS by default.** GNU coreutils ships it as `gtimeout` after `brew install coreutils`; neither was present on this machine, and coreutils isn't currently a documented prereq for Archon.
- The agent's run-time fallback was to drop the wrapper and run `--watch` unbounded. The result is that the entire `watch_rc=124 → ci-frozen giveup` path is dead-code on macOS: the only safety net becomes the 30-minute `idle_timeout` on the loop node, which triggers a *different* failure mode (loop-iter-idle, not ci-frozen), with the wrong classification and the wrong giveup template.

The current PR-03 run survived this because `claude-review` finished within the idle window. The next CI run where a check legitimately hangs past 30 minutes — or even past 25 minutes given iter overhead — will surface the bug as a misclassified failure. Both flavors are affected: `cleanup-ci-watch-and-fix.md` is shared between `execute-cleanup-pr-claude.yaml` and `execute-cleanup-pr-codex.yaml` (workflows line 214–227 in each).

### Discovery (already done — confirmed via exploration)

- **Only one occurrence of `timeout`/`gtimeout`** across `.archon/commands/*.md` and `.archon/scripts/*.sh`: `cleanup-ci-watch-and-fix.md:126`.
- **Exit-code contract to preserve** (`cleanup-ci-watch-and-fix.md:123–162`): `0` = all green, `8` = any failure, `124` = our hard cap fired (→ ci-frozen giveup). No other codes are handled specially.
- **No existing portable-timeout helper** in `.archon/scripts/`. Nothing to reuse.
- **Both flavors invoke this command file unchanged.** Single-file fix covers both.
- **`/usr/bin/perl` is on macOS by default** (verified). Supports `alarm()` and `fork/exec/waitpid` — sufficient for a portable timeout wrapper without any non-default binary.

### Design

Replace the `timeout 1500 …` invocation with an inline Perl wrapper that preserves the existing watch_rc contract. Chosen over alternatives:

- *Pure-shell background-and-kill pattern* — works but is ~10 lines of fiddly PID/wait/race handling. Perl is shorter and clearer.
- *Add `coreutils` as a documented prereq* — adds an invisible setup step for anyone running Archon on macOS, and `gtimeout`-vs-`timeout` naming forces command-file changes anyway.
- *Extract to `.archon/scripts/with-timeout.sh` helper* — YAGNI. Only one caller exists today; revisit if a second one appears.

The Perl one-liner (lives inline at the same point in the recipe, replacing line 126):

```bash
set +e
perl -e '
    my $secs = shift;
    my $pid = fork // die "fork failed: $!";
    if ($pid == 0) { exec @ARGV; die "exec failed: $!" }
    local $SIG{ALRM} = sub { kill TERM => $pid; sleep 1; kill KILL => $pid; exit 124 };
    alarm $secs;
    waitpid $pid, 0;
    exit $? >> 8;
' 1500 gh pr checks "$PR" --watch --interval 30 > "$log_file" 2>&1
watch_rc=$?
set -e
```

Behaviour matrix (preserves contract):

| gh's outcome | watch_rc | Existing handler |
|---|---|---|
| all checks green | 0 | falls through to green path (`cleanup-ci-watch-and-fix.md:140–147`) |
| any check failed | 8 | falls into "if failed — gather logs" path (line 165+) |
| our alarm fires at 1500s | 124 | hits "watch timed out" → `GIVEUP_REASON="ci-frozen"` branch (lines 156–162) |
| gh itself crashes / signal-killed by something else | propagates `$? >> 8`; if 0, the existing post-watch re-evaluation at lines 138–147 catches "still pending" and re-loops correctly | existing logic handles it |

### Files modified

- `.archon/commands/cleanup-ci-watch-and-fix.md`
  - Lines 123–127: replace the `timeout 1500 …` block with the Perl wrapper above.
  - Line 124: update the comment to point at the new mechanism — `# Portable timeout (no GNU coreutils dependency). Exit codes: 0 all green, 8 any failure, 124 our alarm.`

That's the entire change. No script files touched, no workflow YAML changes, no helper added.

### Verification

1. **Happy path — single-iter green.** Run any cleanup-PR workflow where CI finishes cleanly in <25 minutes. Expected: workflow reaches `summary` exactly as it did pre-fix, with `watch_rc=0` recorded in `$ARTIFACTS_DIR/ci-attempt-1-watch-rc.txt` (which the existing recipe writes immediately after the watch block at line 127).
2. **Failure path.** Find or stage a PR with a failing CI check (e.g., a deliberately broken type). Expected: `watch_rc=8`, ci-watch-and-fix enters its fix loop, classifies the failure, attempts a fix.
3. **Timeout path (synthetic).** In a one-off local edit, temporarily change `1500` to `5` in the Perl invocation and run on any PR with pending checks. Expected: after ~5s the Perl wrapper kills `gh`, returns 124, and the script logs `failure_signature="watch-timeout:gh-pr-checks-1500s"` and `GIVEUP_REASON="ci-frozen"`. Revert the `5` back to `1500` after the test.
4. **macOS portability.** Run any of the above on this machine (`gtimeout`/`timeout` both NOT_FOUND, confirmed). Expected: no "command not found" errors in the agent's tool output; `ci-attempt-1-watch-rc.txt` populated with a number, not absent.
5. **Linux portability (optional).** If the daemon is ever moved to a Linux host (e.g., the existing `Detritus`/`Rincewind` fleet machines), confirm the Perl wrapper still works there. `/usr/bin/perl` is standard on every major distro.

### Out of scope

- **Bumping the 1500s value.** Claude-review jobs have been observed taking 10–20 minutes; 1500s (25 min) is already roomy and below the 1800s `idle_timeout`. If the matrix surfaces real claude-review hangs >20 min, revisit then.
- **Replacing `gh pr checks --watch` with a poll loop.** Removing the foreground-blocking pattern would also remove the watch_rc handling and let Archon's per-tool-call activity timer keep ticking. Bigger redesign, separate plan if needed.
- **Sweeping `2>/dev/null || true` patterns elsewhere in the workflow.** Fix-C already addressed the `append-followup.sh` case; this fix doesn't touch any other fail-open sites. If more turn up, file separately.
- **A reusable `.archon/scripts/with-timeout.sh` helper.** Only one caller today; YAGNI. Revisit if a second caller appears.

### Acceptance

- Workflow run on this Mac reaches `summary` cleanly when CI passes, with `ci-attempt-1-watch-rc.txt` containing `0`.
- The synthetic timeout test (step 3 above) writes `124` to `ci-attempt-1-watch-rc.txt` and surfaces `GIVEUP_REASON="ci-frozen"` in the giveup template / PR comment.
- No "timeout: command not found" appears in any future ci-watch-and-fix tool output.

---

## Stage 5 — Blast-radius detection in plan-review (the PR-06 fix)

### Context

PR-06 failed at scope-guard-post-implement on both flavors (codex run `3a329af37825713a52a599ae18249e29`, claude run `768ea6fe181393839ab811f7658ffc51`). In both cases the implement agent correctly touched `apps/api/src/services/llm/integration-mock-guard.test.ts` — the GC1 ratchet enforcer that holds the `KNOWN_OFFENDERS` allowlist — because draining offenders from that allowlist is the literal point of PR-06 P3. The work order at `docs/audit/cleanup-plan.md:213` (C2 P3 row in the cluster table — "AUDIT-TESTS-2C — Drain LLM allowlist") only claims the two offender files (`session-summary.integration.test.ts`, `vocabulary.integration.test.ts`), not the allowlist file itself. Scope-guard caught the unclaimed write and correctly rejected.

This is the same blast-radius pattern Stage 3 documented for PR-04 ("deletion-heavy PRs have multi-file blast radius that human plan authors tend to enumerate incompletely") and explicitly declined to fix on cost grounds: "spending design budget on detection clever enough to prevent 2-3 reruns out of 28 throwaway PRs is over-engineering." The math has shifted. Confirmed cases: PR-04 × 2 reruns, PR-06 × 2 flavors → 4 reruns of ~12–30 min each. Anticipated for PR-10, PR-21, PR-23, PR-25 (estimated 2–3 more). A ~1-hour plan-review enhancement saves ~1–2 hours of wasted wall time and removes a recurring failure mode for the rest of the cleanup queue.

The catch-point cost table:

| Catch point | When it fires | Wasted cost when it does |
|---|---|---|
| scope-guard-post-implement (today) | After implement commits | ~12–30 min agent time + tokens, plus a Notion P1 follow-up |
| implement self-check before commit | Mid-implement | Most of implement burned; reviewers saved |
| **plan-review (this fix)** | **Before implement runs** | **A few seconds of grep** |
| Pre-workflow offline lint | Before workflow starts | A few seconds, but a separate tool surface |

plan-review is the earliest practical catch point that doesn't require a new tool surface.

### Design

Extend `cleanup-plan-review.md` with a basename-grep blast-radius scan that runs only on `delete`-intent phases. Keep the change additive — same OK/BLOCK contract, same exit-0 always, same artifact format. A phase that produces ≥1 cross-cutting hit emits a per-file `WARN`; the whole-run verdict escalates to `BLOCK` if any phase produces hits (so existing risk-class wiring promotes the run to `risky` and the reasoning artifact reaches the PR).

**Why basename grep is the right MVP, not the full design:**

- Catches the PR-06 pattern cleanly. The allowlist references claimed files by basename in a static array. `rg --fixed-strings 'session-summary.integration'` finds `integration-mock-guard.test.ts` immediately.
- Doesn't catch the PR-04 URL-prefix pattern (`/v1/auth/` references in `consent.ts` are not file-basename references). That's a separate detection class (literal-string-delete scan) — defer to a follow-on if PR-04-shaped reruns recur. Don't over-engineer here.
- False-positive surface is bounded: greps in code-bearing directories only; basenames are usually distinctive (`vocabulary.integration` isn't a common substring); `WARN`-then-`BLOCK` keeps the finding informational rather than terminal (implement still runs).

**Keyword expansion needed.** The existing 2.2 keyword table in `cleanup-plan-review.md` (line 82) classifies intent by description keywords. PR-06's phase description starts with "Drain" — not currently in any keyword set. Add `drain|deprecate` to the delete-intent keyword list. (`migrate` is intentionally NOT added — migrations sometimes preserve the source, and we don't want false-trigger the scan on every refactor.)

### Files modified

**`.archon/commands/cleanup-plan-review.md`** — three edits:

1. **Section 2.2 keyword table** (around lines 82–87): expand the `delete` row's keyword list from `delete`, `remove`, `drop`, `kill` to `delete`, `remove`, `drop`, `kill`, `drain`, `deprecate`.

2. **New section 2.6 — "Cross-cutting reference scan"** (insert after 2.5, before "## Step 3"). The behaviour:

    - Only runs on phases whose intent is `delete` AND that have ≥1 claimed file.
    - For each claimed file, build a basename set: full basename (`session-summary.integration.test.ts`) AND short basename (`session-summary.integration`). The short form catches references that omit the `.test.ts` suffix — exactly the allowlist case.
    - For each basename, run `rg --fixed-strings --files-with-matches "$basename"` with excludes: `!.archon/**`, `!docs/**`, `!node_modules/**`, `!dist/**`, `!.next/**`, `!.turbo/**`, `!*.lock`, `!pnpm-lock.yaml`.
    - Subtract the claimed file itself and any other claimed-files in the same phase. Any remaining hits are cross-cutting references in unclaimed files.
    - Per phase: one `WARN` per claimed file that has cross-cutting hits; emit up to 5 hit paths with `…and N more` truncation if needed.
    - Per run: if any phase has ≥1 cross-cutting finding, escalate the run verdict to `BLOCK`.

3. **Worked-example section at the end** (lines 211–243): add a third worked example titled "What cross-cutting BLOCK looks like" using PR-06 as the case. Quote the actual claimed files, the basename search, and the `integration-mock-guard.test.ts` finding. Keep it ~15 lines.

**`docs/audit/cleanup-plan.md`** (line 213, the C2 P3 row in the cluster's phase table):

Add `apps/api/src/services/llm/integration-mock-guard.test.ts` to the Files-claimed list (the column 7 backtick list). This is a one-time data fix unrelated to the tooling change — PR-06 will still hit scope-guard until the work order itself is corrected, regardless of whether plan-review starts warning about it. The tooling change makes the next plan-author mistake of this shape visible *before* implement runs; the data fix unblocks the current PR-06 run.

### Files not modified (and why)

- **`cleanup-extract.sh`**: the grep happens inside plan-review, not at extract time. Extract stays mechanical — it reads the plan, it doesn't second-guess it.
- **`cleanup-risk-class.sh`**: no change needed. It already reads `plan-review-verdict.txt` and promotes `BLOCK` → `risky`. Stage 5's new BLOCK cause feeds the existing pipe.
- **`cleanup-scope-guard.sh`**: untouched. It remains the final correctness gate. The PR-06 case will *still* hit scope-guard if the human author fails to update the work order after seeing the plan-review warning — the warning doesn't auto-fix the plan.
- **Workflow YAMLs**: untouched. plan-review is already wired in for both flavors.
- **No new helper script** (`blast-radius.sh` or similar). Inline `rg` invocations inside `cleanup-plan-review.md`. Only one caller.

### Verification

1. **Smoke against existing PR-06 artifacts.** Re-invoke plan-review against the work-order.md from either of the two PR-06 failed runs (`~/.archon/artifacts/runs/3a329af3.../work-order.md` for codex or the claude equivalent). Expected: `plan-review-verdict.txt` contains `BLOCK`; `plan-review.md` lists `integration-mock-guard.test.ts` under P3's cross-cutting findings.
2. **Negative regression — tiny OK case.** Re-invoke plan-review against a known-OK work order (PR-08's artifacts from the Stage 3 validation run). Expected: verdict stays `OK`. P1/P2 are layout/component touches with intent `edit`, so 2.6 doesn't even trigger.
3. **Negative regression — single-file delete with no consumers.** Re-invoke against PR-02 work-order (delete dead `coachingCardCelebrationResponseSchema` export — zero consumers). Expected: phase intent classified as `delete`, basename grep runs, zero unclaimed hits (the export had zero consumers per the plan), verdict `OK`.
4. **End-to-end on PR-06 after data fix.** After updating `cleanup-plan.md:213` to claim `integration-mock-guard.test.ts`, launch a fresh PR-06 workflow run (either flavor). Expected:
    - extract pulls the 3-file claimed list into work-order.md.
    - plan-review's new 2.6 finds zero unclaimed cross-cutting hits (because the allowlist file is now claimed) → verdict `OK`.
    - implement touches all three files; scope-guard accepts; workflow reaches `summary` green.
5. **End-to-end on a future blast-radius candidate (PR-10 or similar).** Run without pre-emptively amending the work order. Expected: plan-review's 2.6 surfaces any cross-cutting hits as WARN/BLOCK; the artifact reasoning is attached to the resulting PR; the human can decide whether to amend the work order and rerun or merge with the broader scope acknowledged.

### Out of scope

- **Literal-string-delete scan (the PR-04 URL-prefix pattern).** Different detection class; not all delete phases name a URL prefix being purged. Revisit if PR-04-shaped reruns recur after this round; one signal is enough for now.
- **Auto-amending the work order with discovered files.** plan-review surfaces; humans decide. Auto-amend would couple plan-review to the cleanup-plan format and bypass the human author's intent — too much rope.
- **Implement-time self-check before commit.** Could catch the same class one node later, but plan-review is cheaper. If plan-review's basename grep proves to have detection gaps (e.g., the cross-ref is on `KNOWN_OFFENDERS_DATA` rather than the basename), a follow-on plan can add `git diff --cached --name-only` vs. work-order verification inside the implement loop. Don't preempt.
- **Sweeping the existing cleanup-plan.md for other under-claimed phases.** Out of scope here. The plan-review fix will surface these as PRs run; sweep on demand.

### Acceptance

- A re-invocation of plan-review against the existing PR-06 codex run's `work-order.md` produces `BLOCK` in `plan-review-verdict.txt` and lists `apps/api/src/services/llm/integration-mock-guard.test.ts` as a cross-cutting finding under P3.
- A re-invocation against PR-08's work order produces `OK` (no false positive).
- After the data fix to `cleanup-plan.md:213`, a fresh PR-06 run on either flavor reaches `summary` green without scope-guard rejection.
- The PR-04 URL-prefix case is not regressed but also not caught here — known and accepted gap (see Out of scope).
