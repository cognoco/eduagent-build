# Vetting record — T10 challenge-round grader bake-off

**Register:** llm-models · **Change:** judge-row resolution (T10, plan
`2026-06-26-challenge-round-grader-judge.md`) · **Date of vetting:** 2026-07-11 ·
**Deciders:** operator + Claude (WI-1438) · **Status:** RATIFIED — operator ruling
2026-07-11.

## Trigger

`master.md`'s judge row carried "Eval-selected (T10 bake-off pending), default
Sonnet 4.6 non-reasoning" since the 2026-06-06 iteration-1 record
([`2026-06-06-launch-set-iteration-1.md`](2026-06-06-launch-set-iteration-1.md)).
Haiku 4.5 was flagged as a demotion candidate *only if* it passed the bake-off
on both the format and judgment axes. This record resolves that pending state.

## Candidates tested

Live, `apps/api/eval-llm --flow challenge-grader --live`, each candidate run in
isolation via the `--openrouter-model` override; snapshots restored after each
run (`git checkout -- apps/api/eval-llm/snapshots`); `git status` confirmed
clean after every run.

| Candidate | OpenRouter slug | Wall time (5 fixtures) | Format axis | Judgment axis |
|---|---|---|---|---|
| **Sonnet 4.6** (incumbent `GRADER_MODEL`) | `anthropic/claude-sonnet-4-6` → `claude-4.6-sonnet-20260217` | ~27s (~5.4s/call) | clean, 0 warn/fail | CGR02 correctly labeled `misconception` — 0 warnings, 0 failures across all 5 fixtures |
| **Haiku 4.5** (demotion candidate) | `anthropic/claude-haiku-4-5` → `claude-4.5-haiku-20251001` | ~16s (~3.2s/call) | 0 fail; output markdown-fenced (harness's lenient parser tolerated it, production parser untested against this) | CGR02 mislabeled `partial` (soft warning). Did **not** over-credit `solid` anywhere — the hard false-mastery guard held |
| **GPT-5-mini, default reasoning** (operator-authorized optional candidate) | `openai/gpt-5-mini` (verified against the live OpenRouter catalog — the harness comment previously mapped this candidate to the stale/wrong slug `openai/gpt-4o-mini`, fixed in this PR, see Reference) | ~64s (~12.9s/call) | clean, 0 warn/fail | CGR02 correctly labeled `misconception` |
| **GPT-5-mini, `reasoning_effort=minimal`** (follow-up probe, isolating whether default latency was a reasoning-effort artifact) | same slug + `--openrouter-reasoning-effort minimal` | ~14s (~2.8s/call, fastest overall) | clean | CGR02 mislabeled `partial` — same miss as Haiku 4.5 |

Command pattern:
```
doppler run -c stg -- pnpm eval:llm -- --flow challenge-grader --live \
  --openrouter-model <slug> [--openrouter-reasoning-effort minimal]
```

List prices (OpenRouter, $/M tokens, prompt·completion) at time of testing:
Sonnet 4.6 $3·$15, Haiku 4.5 $1·$5, GPT-5-mini $0.25·$2 (list price only —
the 64s default-reasoning run likely billed hidden reasoning tokens as
completion tokens; no per-run dollar figure is published here since it would
be false precision built on guessed token counts).

## Governing constraint

The grader call is `await`ed synchronously inside `session-exchange.ts:1340`,
under the register's 25s Cloudflare-Workers wall for the request. GPT-5-mini's
default-reasoning config (~13s/call) eats roughly half that budget on a single
judge call alone, before any of the rest of the exchange's work.

## Outcome

**Winner: Sonnet 4.6 — RETAINED. No `GRADER_MODEL` change (AC-5's
explicit-no-change path).** Operator-ruled 2026-07-11.

Sonnet 4.6 is the only candidate clean on both axes across all 5 fixtures.
Haiku 4.5 and GPT-5-mini at `reasoning_effort=minimal` both mislabeled the
same misconception fixture (CGR02) as `partial` — a **correlated** soft miss
across both fast/cheap configurations, not independent noise, on a P1 item
that gates the false-mastery guard in the Challenge Round grader
(`decideMasteryAndReview()` — any non-`solid` evaluation blocks mastery).
GPT-5-mini's default-reasoning config gets the label right but at ~2.4x
Sonnet 4.6's latency, which the 25s synchronous wall does not comfortably
absorb.

**Explicit override of the harness's own selection rule.** The harness's
written rule (`challenge-grader.ts` §"RECORDING THE WINNER") is: pass =
`quality_failures == 0`; if multiple candidates pass, pick the cheapest
(Haiku before Sonnet). Haiku 4.5's CGR02 miss is a *warning*, not a
`quality_failure`, so Haiku mechanically passes and would win that rule
on cost alone. The operator ruling overrides this mechanical
cheapest-passing-candidate selection on misconception-detection grounds:
a P1 misconception fixture graded `partial` instead of `misconception` is a
real quality regression the harness's binary pass/fail axis does not
capture, even though it is not currently coded as a `quality_failure`.

**Caveat — N=1.** Every candidate's CGR02 result above is a single sample;
LLM grading is stochastic. This ruling is made on N=1 evidence per candidate.
A post-launch reevaluation with N=3–5 resamples per candidate on CGR02 is
tracked as **WI-1799** — re-litigate there if resampling changes the picture,
not by editing this record.

## Reference

T10 (plan `2026-06-26-challenge-round-grader-judge.md`); WI-1438; harness
source `apps/api/eval-llm/flows/challenge-grader.ts` (stale `openai/gpt-4o-mini`
slug comment corrected to `openai/gpt-5-mini` in this same change); follow-up
reevaluation tracked as WI-1799.

---
*Immutable record. A later change to the judge model is a new record in this
folder, never an edit to this one.*
