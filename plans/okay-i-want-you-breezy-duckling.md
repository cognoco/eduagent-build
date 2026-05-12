# Archon Cleanup-PR Workflow Audit — Execution Plan

## Context

A previous session ran the first batch of cleanup-plan PRs through both `execute-cleanup-pr-claude.yaml` and `execute-cleanup-pr-codex.yaml` Archon workflows in parallel — 9 plan-PRs × 2 flavors = 18 runs, all open as PRs on GitHub.

That session produced:
- **`.archon/bake-off-findings.md`** — pair-by-pair verdicts (Claude won 5, Codex won 4) plus a floor analysis showing Codex has the higher consistent-merge-worthiness floor (2 real-bug Claude losses vs 1 real-bug Codex loss).

This audit's purpose:
1. **Hone the existing workflow steps** — tune cost, runtime, and failure-recovery posture (especially: are expensive steps running before cheap validators that could fail-fast?).
2. **Produce a single merged workflow** with per-step provider+model selection grounded in observed run telemetry, replacing the current two-flavor split.

Both **cosmetic** (model tuning, parallelism, caching) and **structural** (collapse/replace steps, redesign scripts) optimizations are in scope.

Inputs available to this audit:
- The two YAML workflows (`.archon/workflows/execute-cleanup-pr-{claude,codex}.yaml`).
- 15 shell scripts in `.archon/scripts/` + their delegates under `~/.archon/scripts/`.
- Logfire telemetry for all 18 runs (and the 3 dev-draft PRs #179, #184, #185 that never merged).
- SQLite at `~/.archon/archon.db` for node-timeline correlation.
- `archon-ops` skill at `~/.claude/plugins/cache/zdx-claude-code-plugins/archon-ops/0.1.1/skills/archon-ops/`.

---

## Verified Prerequisites

**Logfire access is confirmed working from this shell.**

```bash
# Read token retrieval (ZAF Global / prod / /observability)
export LOGFIRE_READ_TOKEN=$(infisical secrets get LOGFIRE_READ_TOKEN \
    --projectId 9ec75f86-d604-4cfa-902c-57cb1e372adc \
    --env prod --path /observability --plain 2>/dev/null)

# Base URL
export LOGFIRE_BASE_URL=https://logfire-eu.pydantic.dev

# Query pattern (MUST be GET with --data-urlencode, not POST)
curl -s -G "$LOGFIRE_BASE_URL/v1/query" \
  -H "Authorization: Bearer $LOGFIRE_READ_TOKEN" \
  --data-urlencode "sql=<SQL HERE>"
```

The `LOGFIRE_TOKEN` env var is a write/ingest token — it returns 401 against `/v1/query`. Always use `LOGFIRE_READ_TOKEN` from Infisical.

Volume check (last 3 days, by environment label):
- `archon-execute-cleanup-pr-codex`: 542,482 records
- `archon-execute-cleanup-pr-claude`: 44,745 records
- The 12× delta is itself a finding to investigate — see Phase B § "Token & record-volume per flavor".

---

## Critical Caveat — Codex spans may have `deployment_environment = NULL`

`archon-ops/observability.md` documents this as a known issue. The Logfire `deployment_environment` filter works for Claude-flavor spans (which are tagged by `init-tracing.sh` via `.claude/settings.json`) but Codex SDK spans bypass that mechanism.

The 542,482-record count under `archon-execute-cleanup-pr-codex` suggests SOME codex spans ARE tagged — likely because Archon's outer DAG layer emits its own spans regardless of the inner SDK. But inner codex tool calls may appear with `service_name = 'codex_sdk_ts'` and null environment.

**Correlation strategy when Codex spans aren't tagged:**
1. Use `~/.archon/archon.db` SQLite for node-start/node-end timestamps per run.
2. Window Logfire by `start_timestamp BETWEEN <node_start> AND <node_end>` + `service_name = 'codex_sdk_ts'`.
3. Attribute by time window. Parallel nodes (e.g., code-review + test-coverage) require approximate attribution.

Pattern documented in `archon-ops/observability.md` § "Logfire + SQLite Correlation".

---

## Phase A — Static Analysis (DONE by prior session, summarized here)

### Workflow structure — both flavors are 21-step isomorphic

The two YAMLs are **structurally identical** in step count and order. The only step that differs is **#12 `adversarial-review`**, which is intentionally cross-provider (Claude flavor calls Codex; Codex flavor calls Claude).

| # | Step | Type | Claude provider/model | Codex provider/model | Notes |
|---|---|---|---|---|---|
| 1 | init-tracing | bash | — | — | writes `.claude/settings.json` env label |
| 2 | extract | bash | — | — | `cleanup-extract.sh` parses plan into work-order |
| 3 | install | bash | — | — | `install.sh` runs pnpm install (**slowest single step**) |
| 4 | plan-review | llm | claude / sonnet, medium | codex / gpt-5.5, medium | added 0bdc54ec (Stage 3) — verifies claimed files exist |
| 5 | implement | llm loop | claude / opus-4-6, high | codex / gpt-5.5, high | up to 15 iterations |
| 6 | scope-guard-post-implement | bash | — | — | hard-stop on file drift |
| 7 | validate | llm | claude / sonnet, low | codex / gpt-5.5, low | fresh-context validation pass |
| 8 | risk-class | bash | — | — | tiny/normal/risky verdict, gates 10/11 |
| 9 | review-scope | llm | claude / sonnet, medium | codex / gpt-5.5, medium | scope re-check |
| 10 | code-review | llm | claude / sonnet, medium | codex / gpt-5.5, medium | skipped if `tiny` |
| 11 | test-coverage | llm | claude / sonnet, medium | codex / gpt-5.5, medium | skipped if `tiny` |
| 12 | **adversarial-review** | **llm (cross-provider)** | **codex / gpt-5.5, high** | **claude / opus-4-6, high** | the only step that differs |
| 13 | synthesize | bash | — | — | `cleanup-synthesize.sh` merges findings |
| 14 | fix-locally | llm | claude / opus-4-6, high | codex / gpt-5.5, high | applies fixes from findings |
| 15 | scope-guard-post-fix | bash | — | — | second hard-stop on drift |
| 16 | re-validate | llm | claude / sonnet, low | codex / gpt-5.5, low | fresh-context post-fix check |
| 17 | push | bash | — | — | `push.sh` |
| 18 | create-pr | bash | — | — | `cleanup-create-pr-body.sh` + `create-pr.sh` |
| 19 | post-review-comments | bash | — | — | posts findings as PR comments |
| 20 | ci-watch-and-fix | llm loop | claude / sonnet, medium | codex / gpt-5.5, medium | 3-iter, same-fail-twice early stop, 30-min timeout |
| 21 | summary | bash | — | — | final report |

### Script inventory (15 files, prior-session findings)

**Slowest scripts (by estimated runtime, not measured):**
1. **`install.sh`** (10-30s) — `pnpm install --frozen-lockfile` + retry without flag. Single biggest time sink. No node_modules caching across runs.
2. **`cleanup-compare-runs.sh`** (5-10s) — 10+ sequential sqlite queries. Used ONLY when comparing two runs (will become irrelevant in merged workflow).
3. **`cleanup-synthesize.sh`** (2-3s) — 9 separate jq invocations counting findings per severity × source. Could be 1 jq pass.
4. **`cleanup-extract.sh`** (2-3s) — nested grep/sed chains over cleanup-plan.md.
5. **`gather-review-context.sh`** (2-3s) — 2 separate git-diff invocations + optional fd full-FS scan.

**Cross-script redundancy (Phase B should quantify):**
- `work-order.md` re-parsed by 4 scripts (create-pr-body, scope-guard, summary, synthesize) using different grep patterns.
- `git diff` invoked 6+ times across risk-class, scope-guard, gather-review-context.
- `findings.json` re-parsed 2-3 times (synthesize → create-pr-body → summary).
- `risk-class.txt` verdict re-extracted via different paths (synthesize reads the file; compare-runs re-parses bash stderr).

**Scripts that may become dead code in merged workflow:**
- `cleanup-compare-runs.sh` — only used post-bake-off.
- Possibly portions of `cleanup-synthesize.sh` if the merged design folds findings differently.

---

## Recent Fixes — Cross-Reference Against Telemetry

**Critical guidance from user:** "Some failures visible in Logfire may have already been fixed in latest commits on this branch." When analyzing failure clusters, cross-reference the run timestamp against these fix dates and EXCLUDE failures pre-dating the fix.

| SHA | Date (UTC) | What was fixed |
|---|---|---|
| `cc8b5585` | 2026-05-11 10:31 | plan-review blast-radius false positives (plans/ dir excluded) |
| `2fd5508d` | 2026-05-11 09:03 | scope-guard extension regex (accepts CLAUDE.md and other top-level files; rejects glob tokens) |
| `467fed1a` | 2026-05-10 22:27 | extract.sh nounset-safe empty arrays + tighter extension regex |
| `0084c485` | 2026-05-10 21:25 | **scope-guard fail-closed on malformed work-order** (was silently dying mid-pipeline) |
| `328d6da3` | 2026-05-10 21:11 | append-followup.sh surfaces doppler stderr (was swallowed) |
| `61736ece` | 2026-05-10 21:08 | scope-guard recognizes validate-phase test infra fixes via `.validate-allowed-extras` |
| `0bdc54ec` | 2026-05-09 11:53 | **Stage 3 major:** added `plan-review` (#4), `risk-class` (#8), `ci-watch-and-fix` (#20) |
| `d7766fd0` | 2026-05-08 17:49 | **Stage 2 major:** replaced LLM-based extract/synthesize/create-pr/summary with deterministic shell |
| `76da9965` | 2026-05-09 20:20 | 13 fail-closed fixes (gh checks, scope-guard empty + git errors, GC1 git-diff, etc.) |
| `c73237ee` | 2026-05-09 19:17 | SQL injection fix in cleanup-compare-runs.sh; CI classifier gate; boundary check |
| `8b6df7b1` | 2026-05-09 18:54 | Explicit effort levels in YAMLs; risk-class artifact format; ci-watch order-of-ops |
| `a411059d` | 2026-05-09 10:29 | scope-guard allow test-sibling files of claimed sources |
| `4ac500e0` | 2026-05-09 10:17 | scope-guard diff base from `.pre-implement-sha` (was crashing on full branch diff) |
| `3a2cb5ab` | 2026-05-09 15:32 | Graceful Notion P1 handoff on scope-guard violation |

**Implication for Phase B:** Many of the 18 runs we have telemetry for were executed BEFORE several of these fixes. Failure patterns in pre-fix runs are not actionable — they're already addressed. Focus actionable findings on:
- Runs after `2026-05-11 09:03` (latest scope-guard fix) for failure-cluster analysis.
- All 18 runs for cost/duration analysis (those metrics aren't affected by the fixes).

---

## Phase B — Telemetry Analysis (Logfire-driven, MANDATORY)

### B.1 — Identify the 18 runs in telemetry

The PR-to-run mapping (from prior session's pairing table; verified):

| Plan PR | Claude PR# | Claude branch (thread) | Codex PR# | Codex branch (thread) |
|---|---|---|---|---|
| PR-01 | 191 | thread-03a7e11d | 200 | thread-ebe068ad |
| PR-02 | 198 | thread-d5d70dcb | 190 | thread-baa6d343 |
| PR-03 | 199 | thread-a6792e02 | 192 | thread-6430ced7 |
| PR-04 | 201 | thread-2d3f444d | 205 | thread-6acd5d6c |
| PR-06 | 210 | thread-da95c16b | 209 | thread-f3fbb272 |
| PR-07 | 202 | thread-b152341b | 204 | thread-bf799550 |
| PR-08 | 196 | thread-ff870c31 | 197 | thread-d2352287 |
| PR-09 | 207 | thread-addcd4d8 | 208 | thread-b11117b1 |
| PR-10 | 206 | thread-71c303d3 | 203 | thread-f84b224d |

Plus the 3 dev-draft PRs for PR-08: #179, #184, #185 (never merged, may be failure-cluster gold).

Use the Archon SQLite DB to map thread IDs to workflow_run_ids:
```bash
sqlite3 ~/.archon/archon.db "SELECT id, workflow, created_at, status FROM workflow_runs WHERE created_at > '2026-05-09' ORDER BY created_at DESC LIMIT 30"
```

Then for each run get its node timeline:
```bash
sqlite3 ~/.archon/archon.db "SELECT step_name, event_type, created_at FROM events WHERE workflow_run_id = '<id>' ORDER BY created_at"
```

### B.2 — Per-step duration aggregation

For each of the 21 steps, compute across all 18 runs:
- median duration
- p95 duration
- mean duration
- count of runs that executed it (some are conditional — code-review/test-coverage skip when `risk-class=tiny`)

SQL template (Claude side, environment-tagged):
```sql
SELECT
  attributes->>'step_name' AS step,
  COUNT(*) AS samples,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
  AVG(duration_ms) AS mean_ms
FROM records
WHERE deployment_environment = 'archon-execute-cleanup-pr-claude'
  AND start_timestamp > '2026-05-09'
  AND attributes->>'step_name' IS NOT NULL
GROUP BY step
ORDER BY p50_ms DESC
```

Repeat for Codex flavor. Combine into one table for comparison.

**Expected output**: a per-step duration table that surfaces:
- The 3-5 slowest steps overall.
- Steps where one flavor is meaningfully slower than the other.
- Steps with high variance (p95 ≫ p50) — those are candidates for timeout tuning.

### B.3 — Per-step token & cost aggregation

For LLM steps, aggregate gen_ai usage:
```sql
SELECT
  attributes->>'step_name' AS step,
  SUM(attributes->'gen_ai'->'usage'->>'input_tokens')::bigint AS input,
  SUM(attributes->'gen_ai'->'usage'->'cache_read'->>'input_tokens')::bigint AS cache_read,
  SUM(attributes->'gen_ai'->'usage'->>'output_tokens')::bigint AS output,
  SUM(attributes->>'operation.cost')::float AS total_cost_usd,
  COUNT(*) AS calls
FROM records
WHERE deployment_environment = 'archon-execute-cleanup-pr-claude'
  AND attributes->>'step_name' IS NOT NULL
  AND attributes->'gen_ai'->'usage'->>'output_tokens' IS NOT NULL
GROUP BY step
ORDER BY total_cost_usd DESC
```

Pricing reference (from `archon-ops/observability.md`):
- Claude Opus 4.6: $15 input / $1.50 cached / $75 output (per million)
- Claude Sonnet 4.6: $3 / $0.30 / $15
- OpenAI gpt-5.5: $5 / $0.50 / $30 (standard); $2.50 / $0.25 / $15 (batch)

**Expected output**: per-step cost table; identification of:
- The 3 most expensive steps per flavor.
- Steps where cache hit rate is low (input ≫ cache_read) — caching opportunities.
- Per-run total cost averaged across the 9 pairs.

### B.4 — Loop iteration analysis (`implement` and `ci-watch-and-fix`)

For each `implement` invocation across the 18 runs:
- How many iterations actually executed (max 15)?
- Distribution: did most runs use 1-2 iterations, or push toward 10+?
- Token cost per iteration — does it climb (context buildup) or stay flat?
- Per-iteration tool-call count (from `attributes->>'tool.name'` aggregation).

For `ci-watch-and-fix`:
- How often did it run at all? (only triggered when CI fails)
- Iteration distribution (max 3)
- Early-stop hits (same-fail-twice)
- Did any hit the 30-min timeout?

### B.5 — Failure-cluster analysis (post-fix only)

Filter to runs started AFTER `2026-05-11 09:03` (most recent scope-guard fix). For each failure event:
- Which step failed?
- Cumulative tokens spent in prior steps before failure ("cost-to-failure").
- Was it a scope-guard hard-stop? Notion P1 escalation? Circuit-breaker block? CI-watch giveup?

Cross-reference with `~/.archon/archon.db` `events` table for explicit failure event types.

For the 3 dev-draft PR-08 runs (#179, #184, #185) — check when they were started. If pre-fix, exclude from actionable findings but note in audit doc for historical context.

### B.6 — The 12× telemetry volume mystery

Codex deployment_environment has 542,482 records vs Claude's 44,745 over 3 days. Investigate:
- Is one provider emitting more granular spans (per tool call vs per step)?
- Is Codex looping more aggressively (more `implement` iterations)?
- Is one flavor's instrumentation double-counting?

Query both flavors for `span_name` distribution:
```sql
SELECT deployment_environment, span_name, COUNT(*)
FROM records
WHERE deployment_environment LIKE 'archon-execute-cleanup-pr-%'
  AND start_timestamp > '2026-05-09'
GROUP BY deployment_environment, span_name
ORDER BY COUNT(*) DESC
LIMIT 50
```

**Actionable if:** Codex is double-emitting (instrumentation bug) — there's a real saving in cleanup. If the difference is real activity (more iterations or finer-grained), that's a model-behavior signal feeding Phase D.

### B.7 — Wall-clock per run

For each of the 18 runs:
- Total wall-clock from `init-tracing` start to `summary` end.
- Critical-path step durations (the sum of step-durations along the longest path).
- Idle time between steps (wall-clock minus step-durations sums) — surfaces orchestration overhead.

Cross-reference with bake-off-findings.md `bake-off-time` if recorded.

---

## Phase C — Frontloading & Failure Analysis

### C.1 — Cost-to-reach mapping

For each step, compute the median cumulative token-spend BEFORE that step starts. Build a table:

| Step | Median tokens spent before this step | Recovery posture |
|---|---|---|
| extract | 0 | retry |
| install | ~few hundred | retry |
| plan-review | several thousand | **hard stop on BLOCK** ← cheap, blocks early — good frontload |
| implement | ~tens of thousands | retry (up to 15 iterations); circuit-breaker block after 3 same-failure |
| scope-guard-post-implement | hundreds of thousands | **hard stop on drift** ← expensive but unavoidable |
| validate | ~more | retry; may produce `.validate-allowed-extras` |
| risk-class | + a tiny bit | gates downstream |
| review-scope | ~more | retry; finding-class |
| code-review | ~lots | retry |
| test-coverage | ~lots (parallel with 10) | retry |
| adversarial-review | ~lots (parallel-ish) | retry |
| synthesize | ~almost all | rare-fail (deterministic) |
| fix-locally | ~all | retry; may re-trigger scope-guard |
| scope-guard-post-fix | a lot | **hard stop on drift** |
| re-validate | almost-all-plus-a-bit | rare-fail |
| push / create-pr / etc | almost all | rare-fail |
| ci-watch-and-fix | total-PR + CI loop | giveup → Notion P1 |

**Question for the data:** are the two scope-guards firing too late? They run AFTER expensive implement/fix work. Can a cheaper pre-flight scope-check run after `extract` (before `implement`) so we fail-fast when the work-order itself is malformed?

Note: `plan-review` (step 4, post-Stage 3) already does a pre-flight check that claimed files exist on origin/main. Confirm what fraction of failures would have been caught by it vs the later guards.

### C.2 — Failure-cluster table

For each post-fix-date failure observed in B.5, fill:

| Run | Step that failed | Tokens spent before | Failure class | Could-it-have-failed-earlier? |
|---|---|---|---|---|
| ... | ... | ... | scope-guard hard stop / circuit-breaker / Notion P1 / CI giveup / other | yes/no + which step would have caught it |

### C.3 — Parallelism opportunities

In the current sequential flow, several LLM steps could run in parallel:
- Steps 9-12 (review-scope, code-review, test-coverage, adversarial-review) all operate on the same `diff` input. Could they run concurrently?
- Step 7 (validate) and step 8 (risk-class) could be parallel (validate is LLM, risk-class is shell).

Identify which sequential serializations are necessary (output-feeds-input) and which are accidental.

---

## Phase D — Merged Workflow Design

### D.1 — Per-step model selection rubric

For each LLM step, pick provider+model based on Phase B data + the bake-off findings:

| Step | Cognitive load | Recommended provider+model | Why |
|---|---|---|---|
| plan-review | low (validate file existence + plan parse) | small/cheap | mechanical |
| implement | high (write spec-compliant code) | **see D.2 — data-driven** | core synthesis |
| validate | low (does diff match spec?) | small/cheap, low reasoning | quick check |
| review-scope | medium | small-medium | quick review |
| code-review | medium-high | **data-driven** | per-pair quality varied |
| test-coverage | medium | similar to code-review | |
| adversarial-review | high (find what others missed) | premium, **opposite** of implement provider | cross-provider value preserved |
| fix-locally | high (apply findings correctly) | match implement | |
| re-validate | low | small/cheap | |
| ci-watch-and-fix | medium-low (classify failure, apply targeted fix) | small-medium | bounded loop |

### D.2 — Data-driven choices

From the bake-off floor analysis (`.archon/bake-off-findings.md`):
- **`implement` model:** Codex had a higher floor on this batch (1 real-bug vs Claude's 2). But Claude was better on PR-03 (spec-literal compliance, no scope creep). Provisional pick: **Codex (gpt-5.5)** for implement, with adversarial-review on **Claude (opus)** to catch the scope-creep / spec-deviation failure mode that Codex's implement is more prone to.
- **`code-review` and `test-coverage`:** Need to look at per-PR review quality from the 18 runs (which reviewer caught more real issues). Phase B step.
- **`fix-locally`:** Same model as `implement` (the fix is implementation work).

Final recommendations require Phase B data — DO NOT lock these in before running the queries.

### D.3 — Step changes (cosmetic)

Likely candidates surfaced by Phase A:
- **Cache the plan extract** so `extract` runs once, not implicitly re-parsed by 4 downstream scripts.
- **Single `git diff` per run** with output piped to a fixture file; risk-class / scope-guard / gather-review-context all read from the fixture.
- **Collapse the 9 jq calls in synthesize** into one pass.
- **Cache pnpm node_modules** across worktrees if the Archon worktree-lifecycle allows (check whether worktrees share or duplicate node_modules).
- **Parallelize steps 9-12** (review-scope, code-review, test-coverage, adversarial-review) — they all read the same diff.

### D.4 — Step changes (structural)

- Move `cleanup-extract.sh` from shell to a small Node/Python tool with proper plan parsing. (Cosmetic-disguised-as-structural — only worth it if Phase B shows extract is hot or buggy.)
- Consider whether `plan-review` (LLM step) and `cleanup-extract` (shell step) can merge — currently extract is purely deterministic shell and plan-review is LLM-validated. If plan-review's role is just "verify extract output is well-formed", a shell assertion could replace it.
- `cleanup-compare-runs.sh` becomes dead code in a single-flavor workflow — confirm and delete or repurpose for per-run-vs-baseline comparison.
- Consider folding `validate` and `re-validate` if data shows they catch the same class of issues.

### D.5 — Estimated savings

Per merged-workflow run vs current dual-flavor:
- **Direct saving from removing one flavor:** ~50% on total cost and wall-clock (we no longer run both).
- **Per-step optimizations:** estimate from Phase B data (e.g., if synthesize's 9-jq pattern is 2s and a single pass is 0.2s, that's a small absolute win but a 90% step saving).
- **Parallelism:** if steps 9-12 run concurrently and currently take ~Xs sequential, expect ~max(X)s instead of sum(X).

Produce a before/after table with three columns: current-claude-flavor wall-clock, current-codex-flavor wall-clock, projected-merged wall-clock.

### D.6 — Draft merged workflow YAML

Output: `.archon/workflows/execute-cleanup-pr-merged.draft.yaml`

Schema:
- Same 21-step skeleton as the current flavors.
- Explicit `provider:` and `model:` on each LLM step (no inheritance).
- Cross-provider preserved at `adversarial-review` only.
- Annotated comments referencing the audit findings for each non-default model choice.

This is a **draft for review**, not a replacement. The current two workflows stay intact until the merged one is reviewed and approved.

---

## Deliverables

Two files to write at end of audit:

1. **`.archon/workflow-audit.md`** — comprehensive single doc with sections corresponding to Phase A/B/C/D:
   - Executive summary (1 page)
   - Step-by-step duration + cost table
   - Failure-cluster table (post-fix runs)
   - Frontloading analysis with re-order recommendations
   - Per-step model selection rationale
   - List of cosmetic + structural step changes
   - Estimated savings (tokens, $, wall-clock)
   - Open questions / future audit topics

2. **`.archon/workflows/execute-cleanup-pr-merged.draft.yaml`** — proposed merged workflow as a separate, complete YAML file for diff against the current two. Header comment links to the audit doc.

**Do NOT:**
- Edit existing `.archon/workflows/execute-cleanup-pr-{claude,codex}.yaml`.
- Edit `.archon/scripts/*.sh`.
- File Notion follow-ups (separate decision).
- Run any new Archon workflow execution.

---

## Verification

End-state checks after the audit:

1. `cat .archon/workflow-audit.md | wc -l` — should be 300-600 lines (concise but complete).
2. `cat .archon/workflows/execute-cleanup-pr-merged.draft.yaml | grep -E '^(name|provider|model):'` — every LLM step has explicit provider and model.
3. The audit doc cites specific run IDs or PR numbers for every claim about cost/duration/failure ("step X took median Yms across N runs").
4. The merged workflow draft's model choices reference Phase B data for any non-default choice.
5. The audit identifies at least 3 cosmetic and 1 structural change recommendation, each with estimated savings.
6. Failure analysis is filtered to post-`2026-05-11 09:03` runs (per fix-date rule).
7. The Codex `deployment_environment = NULL` correlation strategy is applied wherever Codex spans are involved.

---

## Open Decisions to Surface to User

Use `AskUserQuestion` only if Phase B data forces a fork. Default behavior:

- **If `code-review` and `test-coverage` skill quality is bimodal across the 9 pairs** (some pairs both reviewers caught issues, others both missed): consider whether to merge them into one step. Surface to user before locking the merged-YAML choice.
- **If the 12× telemetry-volume mystery turns out to be Codex double-emitting:** surface as a separate bug to file (don't block the audit on fixing it).
- **If a structural change recommendation has a >2× wall-clock or cost improvement:** surface before drafting it into the merged YAML so the user can decide aggressiveness.

No need to surface anything before Phase B starts. The plan is self-contained.

---

## Estimated Effort

~3-4 hours total in the fresh session, assuming Logfire access works (it did in this session).

Time budget:
- Phase A: skipped (this doc captures it)
- Phase B: 1.5-2 hours (most of the actual SQL work)
- Phase C: 45 min (depends on B's output)
- Phase D: 1 hour (drafting recommendations + YAML)

The deliverables themselves are concise — most time is in the analysis, not the writing.
