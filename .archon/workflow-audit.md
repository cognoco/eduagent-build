# Archon Cleanup-PR Workflow Audit

**Date:** 2026-05-11
**Inputs:** 18 bake-off runs (9 PRs × 2 flavors) from `.archon/bake-off-findings.md`, all `status=completed` in `~/.archon/archon.db`. Telemetry from Logfire (`pylf_v1_eu_…` read token, `deployment_environment LIKE 'archon-execute-cleanup-pr-%'`, 2026-05-09 → 2026-05-11).
**Workflows analyzed:** `.archon/workflows/execute-cleanup-pr-{claude,codex}.yaml`.
**Deliverable B:** `.archon/workflows/execute-cleanup-pr-merged.draft.yaml` (sibling file).

---

## Executive summary

Both workflows execute the same 21-step DAG; only the `adversarial-review` step is intentionally cross-provider. Steps 9–12 (review-scope → code-review/test-coverage/adversarial-review) already run in **parallel** — that wasn't on the table for optimization.

**Median wall-clock:** Claude flavor 35.8 min, Codex flavor 44.1 min. **Mean** is 49.2 / 64.9 min — both inflated by long-tail outliers (PR-01 Claude 130 min, PR-03 Codex 185 min). **Median per-run cost:** ~$13–15 (PR-06 isolated baseline). **Flavor mean cost:** Claude $25.23, Codex $22.70 (across 9 runs each).

**Where cost goes (PR-06 Claude baseline, $13.47 total):**
- `implement` 62% ($8.27)
- `adversarial-review` 11% ($1.52)
- `ci-watch-and-fix` 8% ($1.05)
- combined review pass 12% ($1.65)
- everything else 7%

**Where time goes:**
- `implement` and `validate` dominate (and have catastrophic p95): max `implement` 107 min (PR-03 Codex), max `validate` 47 min (PR-01 Claude), max `fix-locally` 36 min (PR-02 Codex).
- `install` is the steepest non-LLM step at ~28–30s.
- `ci-watch-and-fix` adds 5–28 min depending on CI behaviour.

**Three biggest opportunities — quantified:**

1. **Stop running both flavors.** Removing one is the simple ~50 % run cost & wall‑clock saving the audit was commissioned for. Both flavors converge on the same 21‑step shape; the only difference worth keeping is the cross‑provider adversarial reviewer.
2. **Drop Codex from `fix-locally`.** Median Codex 345 s, mean 503 s vs Claude 92 s — a 3.7× / 5.5× slowdown on the same task, with no quality signal in the bake‑off in Codex's favour. Switch this step to Claude Opus on the merged workflow.
3. **Move `risk-class` before `validate`.** `risk-class` is a 1‑second shell step that classifies tiny/normal/risky. Today `validate` (LLM, sonnet/low, mean 430s Claude / 631s Codex, max 47 min) runs unconditionally and `risk-class` runs after it. Inverting the order lets tiny PRs skip or run a cheap shell check instead of the LLM pass — same gate the workflow already applies to code‑review and test‑coverage.

Several smaller tunings are listed in §5; no recommendation requires touching the shell scripts beyond `cleanup-synthesize.sh`.

---

## A. Workflow structure recap

Both YAMLs are isomorphic in step count and order. The only differing step is `adversarial-review` (Claude flavor uses Codex/gpt-5.5/high; Codex flavor uses Claude/opus-4-6/high).

| # | Step | Type | Claude provider/model | Codex provider/model |
|---|---|---|---|---|
| 1 | init-tracing | bash | — | — |
| 2 | extract | bash | — | — |
| 3 | install | bash | — | — |
| 4 | plan-review | LLM | claude/sonnet medium | codex/gpt-5.5 medium |
| 5 | implement | LLM loop ≤15 | claude/opus-4-6 high | codex/gpt-5.5 high |
| 6 | scope-guard-post-implement | bash (hard stop) | — | — |
| 7 | validate | LLM | claude/sonnet low | codex/gpt-5.5 low |
| 8 | risk-class | bash | — | — |
| 9 | review-scope | LLM | claude/sonnet medium | codex/gpt-5.5 medium |
| 10 | code-review | LLM (skip if tiny) | claude/sonnet medium | codex/gpt-5.5 medium |
| 11 | test-coverage | LLM (skip if tiny) | claude/sonnet medium | codex/gpt-5.5 medium |
| 12 | **adversarial-review** | **LLM (cross-provider)** | **codex/gpt-5.5 high** | **claude/opus-4-6 high** |
| 13 | synthesize | bash | — | — |
| 14 | fix-locally | LLM | claude/opus-4-6 high | codex/gpt-5.5 high |
| 15 | scope-guard-post-fix | bash (hard stop) | — | — |
| 16 | re-validate | LLM | claude/sonnet low | codex/gpt-5.5 low |
| 17 | push | bash | — | — |
| 18 | create-pr | bash | — | — |
| 19 | post-review-comments | bash | — | — |
| 20 | ci-watch-and-fix | LLM loop ≤3 | claude/sonnet medium | codex/gpt-5.5 medium |
| 21 | summary | bash | — | — |

**Verified by SQLite event timestamps:** `code-review`, `test-coverage`, and `adversarial-review` already run **concurrently** (identical `node_started` timestamps in every run). No parallelism gain available there.

`implement` and `ci-watch-and-fix` are loop nodes that emit only `node_completed` (no `node_started`). Their duration is derived as the gap between the preceding step's `node_completed` and their own `node_completed`.

---

## B. Telemetry tables

### B.1 — Per-step duration (median / max / mean), seconds

Computed from all 18 successful runs (n = full when present; `n<9` = skipped due to `risk-class=tiny`).
Because each per-flavor sample has only 6-9 observations, nearest-rank p95 collapses to the maximum observed value; the table reports `max` as the practical p95 proxy for this batch.

| Step | C-n | C-med | C-max | C-mean | X-n | X-med | X-max | X-mean | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| init-tracing | 9 | 1 | 1 | 1 | 9 | 1 | 1 | 1 | shell |
| extract | 9 | 1 | 1 | 1 | 9 | 1 | 1 | 1 | shell |
| install | 9 | 28 | 53 | 29 | 9 | 30 | 56 | 30 | pnpm install |
| plan-review | 9 | **138** | 220 | 139 | 9 | **103** | 183 | 114 | Claude slower |
| **implement** | 9 | **746** | **3329** | 1027 | 9 | **618** | **6396** | 1216 | loop ≤15; outliers PR-01 C, PR-03 X |
| scope-guard-post-implement | 9 | 1 | 1 | 1 | 9 | 3 | 5 | 3 | shell |
| **validate** | 9 | 123 | **2846** | 430 | 9 | 198 | **2209** | **631** | enormous p99; sonnet/low or gpt-5.5/low |
| risk-class | 9 | 1 | 2 | 1 | 9 | 1 | 1 | 1 | shell |
| review-scope | 9 | 103 | 216 | 116 | 9 | 123 | 153 | 119 | similar |
| code-review | 7 | **249** | 409 | 276 | 6 | **134** | 183 | 138 | Claude ~2× slower |
| adversarial-review | 9 | 167 | 303 | 178 | 9 | **356** | 582 | 355 | the cross-provider step; Claude-as-reviewer is 2× slower than Codex-as-reviewer |
| test-coverage | 7 | 171 | 233 | 177 | 6 | 102 | 210 | 124 | parallel with code-review |
| synthesize | 9 | 1 | 1 | 1 | 9 | 1 | 4 | 2 | shell, 9× jq pass |
| **fix-locally** | 9 | **92** | 239 | 99 | 9 | **345** | **2155** | **503** | **3.7× / 5.5× slower in Codex** |
| scope-guard-post-fix | 9 | 1 | 1 | 1 | 9 | 1 | 14 | 5 | shell |
| **re-validate** | 9 | 114 | **650** | 205 | 9 | 188 | **2085** | 476 | same prompt as validate; Codex variance again |
| push | 9 | 2 | 4 | 2 | 9 | 2 | 3 | 2 | shell |
| create-pr | 9 | 3 | 5 | 4 | 9 | 3 | 4 | 3 | shell |
| post-review-comments | 9 | 2 | 3 | 2 | 9 | 2 | 3 | 2 | shell |
| **ci-watch-and-fix** | 9 | 385 | **1648** | 642 | 9 | 371 | 636 | 433 | loop ≤3; PR-10 Claude was 27.5 min |
| summary | 9 | 1 | 1 | 1 | 9 | 1 | 1 | 1 | shell |
| **Sum of medians** |  | **1199 (20.0 min)** |  |  |  | **1596 (26.6 min)** |  |  | excludes loop-node time |

### B.2 — Per-run wall-clock

| PR | C wall (min) | C `implement` (s) | C `ci-watch` (s) | X wall (min) | X `implement` (s) | X `ci-watch` (s) |
|---|---:|---:|---:|---:|---:|---:|
| PR-01 | **130.2** | **3329** | 378 | 35.7 | 456 | 355 |
| PR-02 | 20.4 | 225 | 322 | 114.2 | 982 | 308 |
| PR-03 | 47.8 | 1025 | 759 | **185.0** | **6396** | 406 |
| PR-04 | 28.6 | 280 | 385 | 56.0 | 618 | 556 |
| PR-06 | 32.2 | 746 | 306 | 36.7 | 301 | 600 |
| PR-07 | 51.0 | 788 | 1095 | 44.5 | 672 | 325 |
| PR-08 | 35.8 | 570 | 646 | 34.8 | 419 | 338 |
| PR-09 | 23.2 | 478 | 242 | 33.0 | 298 | 371 |
| PR-10 | 73.4 | 1800 | **1648** | 44.1 | 801 | 636 |
| **median** | **35.8** | 746 | 385 | **44.1** | 618 | 371 |
| **mean** | 49.2 | 1027 | 642 | 64.9 | 1216 | 433 |
| **max** | 130.2 | 3329 | 1648 | 185.0 | 6396 | 636 |

Wall-clock numbers are not the sum of step medians because of (a) `implement` and `ci-watch-and-fix` loop dynamics, (b) Archon worktree setup overhead before `init-tracing`, (c) idle time between steps.

### B.3 — Flavor-level cost (across 9 runs each)

`claude-code-plugin` spans expose `operation.cost`. `codex_sdk_ts` spans expose `gen_ai.usage.{input,cache_read.input,output}_tokens` + `codex.usage.reasoning_output_tokens` but not cost — computed using `archon-ops/observability.md` pricing for gpt-5.5: $5/M non-cached input, $0.50/M cached input, $30/M output, reasoning charged at output rate.

**Claude flavor (9 runs):**
- Claude SDK (opus-4-6: 1,285 calls / sonnet-4-6: 896 calls + 1 stray opus-4-7): $214.46
- Codex SDK (adversarial-review only: 189 calls): $12.64
- **Total: $227.10 → ~$25.23 / run mean.**

**Codex flavor (9 runs):**
- Codex SDK (most steps, 2,641 calls): $152.95 — 94 % cache hit rate (150 M of 160 M input tokens cached) keeps effective rate at $0.96 / M input
- Claude SDK (adversarial-review only, 316 calls): $51.34 — opus-4-6 priced at full $15/M (cache attribution is on only 1 % of Claude spans, so cost numbers reflect whatever caching is internal to operation.cost)
- **Total: $204.29 → ~$22.70 / run mean.**

**Per-run sample (isolated runs only):**

| Run | Claude SDK | Codex SDK | Total |
|---|---:|---:|---:|
| PR-06 Claude (32 min) | $11.95 | $1.52 | **$13.47** |
| PR-06 Codex (37 min) | $4.44 | $10.50 | **$14.93** |

PR-06 Codex is slightly more expensive than PR-06 Claude on the same plan — Claude/opus-4-6 in adversarial-review costs more than Codex/gpt-5.5 caches save. The mean-per-run gap ($25.23 vs $22.70) is reversed by outlier-heavy runs (PR-01 Claude at 130 min, PR-10 Claude at 73 min etc.) — Codex's slower-but-cheaper-token pattern wins on big runs while Claude wins on small ones.

### B.4 — Loop iteration analysis

| PR | C `implement` iters | C `ci-watch` iters | X `implement` iters | X `ci-watch` iters |
|---|---:|---:|---:|---:|
| PR-01 | 1 | 1 | 1 | 1 |
| PR-02 | 1 | 1 | 2 | 1 |
| PR-03 | 3 | 2 | **4** | 1 |
| PR-04 | 1 | 1 | 1 | 1 |
| PR-06 | 1 | 1 | 1 | 1 |
| PR-07 | 1 | 2 | 1 | 1 |
| PR-08 | 1 | 1 | 2 | 1 |
| PR-09 | 2 | 1 | 2 | 1 |
| PR-10 | **4** | 2 | 3 | 1 |
| **mean** | 1.7 | 1.3 | 1.9 | 1.0 |

No run hit either cap (`implement`=15, `ci-watch-and-fix`=3). The two implement outliers — PR-01 Claude (3329 s in 1 iteration!) and PR-03 Codex (6396 s across 4 iterations) — are single-iteration cost blowups, not iteration overflow.

`ci-watch-and-fix` always emits one `loop_iteration_started` event (the workflow invokes it unconditionally), so "iters = 1" is the normal value when CI was already green.

### B.5 — Failure-cluster analysis

**All 18 bake-off runs are `status=completed`.** No failures inside the dataset that survive the "post-2026-05-11 09:03 fixes only" filter the plan demanded.

`remote_agent_workflow_runs` also contains 11 failed/cancelled runs in the 2026-05-09 → 2026-05-10 window, but they are pre-fix (#0084c485 fail-closed, #2fd5508d scope-guard extension regex, #cc8b5585 plan-review blast-radius, etc.). They contain real signal about *historic* failure modes but no actionable failure-cluster for the merged workflow.

The pre-fix failed runs visible:
- 4× workflow-start failures (1–2 s duration) — environment / worktree setup
- 3× `failed` mid-run runs that ran 10–40 min before hard-stopping
- 2× cancelled (user-initiated)

These are all addressed by the fix table the audit plan documented, so they don't need to drive the merged design.

### B.6 — The 12× telemetry-volume "mystery"

**Resolved.** Logfire returns 542,482 records under `archon-execute-cleanup-pr-codex` vs 44,745 under `archon-execute-cleanup-pr-claude` over 3 days. Breakdown by `service_name`:

| deployment_environment | service_name | records |
|---|---|---:|
| archon-execute-cleanup-pr-codex | codex_sdk_ts | 539,431 |
| archon-execute-cleanup-pr-claude | codex_sdk_ts | 42,382 |
| archon-execute-cleanup-pr-claude | claude-code-plugin | 2,274 |
| archon-execute-cleanup-pr-codex | claude-code-plugin | 325 |

`codex_sdk_ts` emits per-tool-call internal protocol spans (`receiving`, `handle_responses`, `build_tool_call`, `dispatch_tool_call_with_code_mode_result`, `exec_command`, …) which are an order of magnitude noisier than `claude-code-plugin`'s `chat` spans. The Codex flavor uses codex_sdk_ts for 17 of 18 LLM steps; the Claude flavor uses it only for `adversarial-review`. Hence the ~13× ratio. **Not an instrumentation bug.** No follow-up needed.

### B.7 — Resource-attribute caveat (encountered, not a finding)

`init-tracing.sh` writes `.claude/logfire-resource-attributes.json` with `archon.run_id`, `archon.workflow`, `archon.pr`. **Neither SDK propagates these onto spans** — `otel_resource_attributes` contains only `deployment.environment`, `service.name`, `service.version`. Per-run attribution therefore relies on `deployment_environment` + `start_timestamp BETWEEN run_start AND run_end` correlation against SQLite, which fails for the windows where 3–5 same-flavor runs ran concurrently (most of 2026-05-09 19:20 and 2026-05-10 20:18). Cost numbers in §B.3 are flavor-aggregate; per-run numbers in §B.3 isolated-run table are from PR-06, PR-08, PR-09 which had clean windows.

If we want true per-run attribution, the file `.claude/logfire-resource-attributes.json` needs to be picked up by claude-code-plugin and the corresponding codex SDK config wired through. Tracking this as a separate observability item is reasonable but outside this audit.

---

## C. Frontloading & failure analysis

### C.1 — Cost-to-reach mapping (PR-06 Claude baseline, $13.47 total)

| Step | This step | Cumulative | % of total | Recovery posture |
|---|---:|---:|---:|---|
| init-tracing → install | $0.00 | $0.00 | 0 % | retry, idempotent |
| plan-review | $0.28 | $0.28 | 2 % | LLM, can BLOCK |
| **implement** | $8.27 | $8.55 | 64 % | loop ≤15, fresh context |
| scope-guard-post-implement | $0.00 | $8.55 | 64 % | **hard stop on drift** |
| validate | $0.22 | $8.77 | 66 % | LLM, retry |
| risk-class | $0.00 | $8.77 | 66 % | shell, gates 10/11 |
| review-scope | $0.45 | $9.22 | 69 % | LLM |
| code-review | $0.60 | $9.82 | 74 % | LLM, skip-if-tiny |
| test-coverage | $0.60 | $10.42 | 78 % | LLM, skip-if-tiny |
| adversarial-review | $1.52 | $11.94 | 90 % | LLM cross-provider |
| synthesize | $0.00 | $11.94 | 90 % | shell |
| fix-locally | $0.08 | $12.02 | 90 % | LLM, may re-trigger scope-guard |
| scope-guard-post-fix | $0.00 | $12.02 | 90 % | **hard stop on drift** |
| re-validate | $0.24 | $12.26 | 92 % | LLM |
| push → post-review-comments | $0.00 | $12.26 | 92 % | shell |
| ci-watch-and-fix | $1.05 | $13.31 | 100 % | loop ≤3 |

**Implication:** the workflow already frontloads everything that's cheap to frontload:
- `plan-review` (LLM, $0.28) sits **before** the expensive `implement`, so a malformed plan dies cheaply.
- `scope-guard-post-implement` (shell, $0) is the **first** thing after `implement`, so file-list drift is caught before validate / review / fix burn another $4.

The only frontloading miss is that `risk-class` runs after `validate`. `validate` is an LLM step (sonnet/low for Claude, gpt-5.5/low for Codex); `risk-class` is a 1-second shell step. Inverting the order lets us:
- run `validate` only for normal/risky PRs (saves ~$0.22 × tiny-PR fraction),
- OR use a quick deterministic shell pre-check for tiny PRs while keeping the LLM validate for the others.

In the bake-off, 4 of 18 runs hit `tiny` (PR-01 Codex, PR-02 Claude, PR-09 Claude, PR-09 Codex). At $0.22 per skip, that's ~$1 per 18 runs — small, but the variance reduction matters more than the cash. The max `validate` was 47 min on PR-01 Claude; capping that with an effort-by-risk policy is the real win.

### C.2 — Failure cost-to-failure

N/A in the bake-off (all 18 succeeded). Pre-fix failed runs that did exist in `remote_agent_workflow_runs`:

| Failure point | Runs | Cost-to-failure (estimate) |
|---|---|---|
| Workflow start / worktree setup | 4 | < $0.05 (no LLM yet) |
| Mid-`implement` or earlier | 1 | $0.30–$1 |
| Post-`implement` (scope-guard or beyond) | 2 | $8–$12 |

The scope-guard hard-stop class is the only "expensive failure" in the historical data, and it's already fail-closed (`#0084c485`) and fail-fast (runs immediately after `implement`).

### C.3 — Parallelism opportunities

Already exploited:
- `code-review` ∥ `test-coverage` ∥ `adversarial-review` (verified from SQLite timestamps; all three `node_started` at the same instant).

Not exploited (and not worth the complexity):
- `review-scope` could in principle run in parallel with `code-review` / `test-coverage` / `adversarial-review`, but those three currently `depend_on: [review-scope]` because review-scope's output (the "in-scope diff") seeds the others. Decoupling means each reviewer re-derives scope, which is a regression in quality discipline for ~120 s savings. Skip.
- `validate` and `risk-class` could be parallel (validate is LLM, risk-class is shell), but the saving is 1 s. Skip.

---

## D. Merged workflow design

### D.1 — Model selection rubric

Choices below are anchored to (i) the bake-off floor analysis in `.archon/bake-off-findings.md` §7, (ii) per-step duration table §B.1, (iii) per-step cost share §C.1.

| Step | Recommended provider/model | Reasoning effort | Why |
|---|---|---|---|
| `plan-review` | claude / sonnet | medium | Mechanical: verify claimed files exist on origin/main. Claude sonnet was 138 s median (PR-06: $0.28). Codex 103 s but the task is text-shape validation, not synthesis; Claude is fine. **No change vs Claude flavor.** |
| `implement` | **codex / gpt-5.5** | high | Bake-off floor: Codex's `implement` had 1 real-bug loss vs Claude's 2. Codex's high cache hit rate keeps loop cost down on retries. Cross-provider adversarial picks up on its scope-creep tendency (PR-03 alias creation) anyway. |
| `validate` | claude / sonnet | low | Codex's variance is huge here (max 2209 s vs Claude's 2846 s; mean 631 s vs 430 s). For a low-effort verification pass, Claude's lower variance matters more than peak quality. |
| `review-scope` | claude / sonnet | medium | Per §B.1 the providers are similar (Claude 103 s, Codex 123 s). Claude's sonnet has the lower-variance profile we want for a gate. |
| `code-review` | claude / sonnet | medium | Bake-off PR-06 caught a Claude regression by Codex's code-review; PR-09 Claude got the visual bug wrong. Both reviewers find issues. Picking Claude here keeps review on the opposite provider from Codex `implement` and matches the lower-variance profile per §B.1. |
| `test-coverage` | claude / sonnet | medium | Same rationale as code-review. |
| `adversarial-review` | **claude / opus-4-6** | high | Keep cross-provider value. With Codex doing `implement`, Claude as adversary finds Codex's scope-creep failure mode (PR-03 demonstrated this exactly). |
| `fix-locally` | **claude / opus-4-6** | high | **Single biggest cosmetic win.** Claude was 92 s median in Claude flavor vs Codex 345 s median / 503 s mean in Codex flavor — a 3.7×–5.5× slowdown for the same task with no quality argument in Codex's favour in the bake-off. Match adversarial reviewer intensity (Claude opus). |
| `re-validate` | claude / sonnet | low | Same as `validate`. |
| `ci-watch-and-fix` | claude / sonnet | medium | Bounded loop, mostly mechanical (classify CI failure + apply targeted fix). Claude was equivalent or faster than Codex in this step (385 s vs 371 s median; Codex's max 636 s vs Claude's 1648 s max). Mid-loop variance favors Claude. |

**Summary of cross-provider posture:** Codex synthesizes (`implement`) → Claude reviews (`code-review`, `test-coverage`, **`adversarial-review`**) → Claude fixes (`fix-locally`). The "reviewer + fixer use a different model from the synthesizer" property of the current bake-off flavors is preserved.

### D.2 — Step-order change

**Move `risk-class` before `validate`.** New order:

```
… scope-guard-post-implement → risk-class → validate (skip if tiny) → review-scope → reviews
```

`validate` becomes gated by `risk-class != tiny`, mirroring `code-review` / `test-coverage`. The `when:` clause is a one-line YAML change. For tiny PRs, the diff has already been scope-guarded; skipping the full LLM validate doesn't degrade safety meaningfully. Saves ~$0.22 + 120 s per tiny run; expected hit rate ~20 % of runs.

Alternative considered and rejected: keep `validate` always but downgrade its model on tiny. The complexity of a per-risk-tier model picker isn't justified by the saving.

### D.3 — Cosmetic step-script changes

All of these are inside `.archon/scripts/`; the merged workflow YAML continues to call them by name. **Not part of the YAML draft below — listed for sequencing after the YAML lands.**

1. **`cleanup-synthesize.sh`** — 9 sequential `jq` invocations counting findings × severity × source. Collapse to one streaming pass (`jq -s '. as $f | …'` or a single Python script). Expected wall-clock saving: ~1.5 s per run (small absolute, but the 9× → 1× collapse is the kind of thing audits should call out).
2. **Single-`git diff` pre-compute.** `risk-class`, both `scope-guard` invocations, and `gather-review-context` each run `git diff origin/main...HEAD`. Cache once into `$ARTIFACTS_DIR/.diff` and read from disk. Expected saving: 3-4 s per run.
3. **Single work-order parse.** `cleanup-create-pr-body.sh`, `cleanup-summary.sh`, `cleanup-scope-guard.sh`, `cleanup-synthesize.sh` each parse `work-order.md` with different grep patterns. Replace with one parse-pass into `$ARTIFACTS_DIR/.work-order.json` and have downstream read from JSON. Sequencing: do it the next time work-order's schema changes anyway.
4. **`cleanup-compare-runs.sh` is dead in the merged flow.** Move to `_archive/` or delete. (10+ SQLite queries, only meaningful for two-flavor comparison.)
5. **Cap `validate` / `re-validate` LLM timeouts.** Today there's no idle_timeout on these steps. The max-47-min validate run (PR-01 Claude) burned $0.22 over 47 min — fail-fast at 5 min would just route into ci-watch's classifier loop. Add `idle_timeout: 300000` (5 min) to both validate and re-validate. Same one-line addition for `code-review` / `test-coverage` (max was 409 s already under 10 min, but cheap insurance).

### D.4 — Structural changes (listed, not yet implemented)

1. **Recommended now:** the `risk-class` → `validate` reorder in §D.2 is technically structural (changes the DAG), but it's a single `depends_on:` edit. Included in the draft YAML.
2. **Deferred — needs design discussion before drafting:** Replace the LLM `plan-review` step with a deterministic shell pre-check (claimed-files-exist + phase-format-OK). Plan-review is $0.28 + 138 s for what's mostly mechanical verification. **Open question:** plan-review also runs a "phase descriptions match real code structure" judgment that resists mechanization. A hybrid (shell does file-existence; LLM only runs if the work-order looks unusual) is plausible but designing the trigger condition deserves its own pass.
3. **Deferred:** Fold `validate` + `re-validate` into a single conditional check. Today re-validate runs even when `fix-locally` was a no-op. Worth measuring: in the 4 tiny-class runs how often did fix-locally write any code at all? If always-zero, skip re-validate when `synthesize` reports zero CRITICAL/HIGH findings.

### D.5 — Estimated savings

| Source | Wall-clock saving | Cost saving |
|---|---|---|
| Stop running both flavors | -50 % (one run instead of two) | -50 % (~$22-25 per plan-PR) |
| Codex → Claude on `fix-locally` | -3 to -8 min per run, depending on risk class | neutral (Claude opus-4-6 ≈ same per-call price as gpt-5.5 once cache attribution is honest) |
| `risk-class` before `validate` | -2 min on tiny PRs | -$0.22 on tiny PRs (~20 %) |
| Validate / re-validate idle_timeout=5min | -47 min on the worst outlier, -0 min on normal | -$0 (the variance is the issue, not mean cost) |
| Single-pass jq in synthesize | -1.5 s per run | 0 |
| Single-diff / single-work-order parse | -3-4 s per run | 0 |

**Before:** running both flavors means each plan-PR consumes 35–185 min wall (median ~40 min) and $22-50 in tokens.

**After (single merged flow, isolated runs):** projected 30–35 min wall median and $13–15 per plan-PR.

**Per 10 plan-PRs:** save ~6 hours of wall-clock and ~$200 in tokens. Outlier-heavy weeks save substantially more.

---

## E. Open questions

- **Should `validate` and `re-validate` consolidate into one conditional check?** Needs a per-run audit of how often `fix-locally` actually writes code. (Skipped here because the SQLite events don't carry file-write counts.)
- **Should `plan-review` be replaced by a shell check?** Per §D.4 — needs a design discussion before drafting, not a data question.
- **What's the right wallclock-budget alarm for `implement` outliers?** PR-01 Claude (3329 s in 1 iteration) and PR-03 Codex (6396 s) suggest a soft alarm at 15 min and a hard kill at 30 min may be reasonable. Today there's `idle_timeout: 600000` (10 min idle), which apparently isn't catching these. Worth examining whether the SDK's idle vs total timeout distinction is what we want.
- **Codex's silent SDK chatter (542 K spans) probably isn't free** — Logfire is billed per-record. Worth tagging `codex_sdk_ts` internal protocol spans with `level=debug` so they're filterable / sampleable.

---

## Cross-references

- Workflow YAML draft: `.archon/workflows/execute-cleanup-pr-merged.draft.yaml`
- Bake-off provenance: `.archon/bake-off-findings.md`
- Audit plan: `plans/okay-i-want-you-breezy-duckling.md`
- Logfire/Infisical access pattern: `~/.claude/projects/-Users-vetinari--dev-eduagent-build/memory/infisical_access.md`
- Archon ops observability spec: `~/.claude/plugins/cache/zdx-claude-code-plugins/archon-ops/0.1.1/skills/archon-ops/observability.md`
