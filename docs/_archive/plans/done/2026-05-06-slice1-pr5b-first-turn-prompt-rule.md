# Slice 1 PR 5b — First-Turn Prompt Rule + Remove Fun-Fact Opener

**Date:** 2026-05-06
**Status:** Implemented on `app-ev` (commit `a64d9ed2`). Pending merge to `main`. Tier 2 live-eval pending authorization.
**Branch:** `app-ev`
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` §§ B, F and Slice 1 row 5b
**Wave:** Wave 1 (parallel with 5a, 5d, 5g)
**Size:** S

---

## Goal (from audit)

> When I read the first mentor message, I want to learn one concrete thing and be asked to do something with it, so the app feels like a tutor, not an intake form.

This PR is the **only** Wave 1 owner of `exchange-prompts.ts` and `interview-prompts.ts`. It bundles:

1. The new first-turn rule.
2. Removal of the conflicting unconditional fun-fact opener (audit § F). Without bundling, the first turn would carry both — three things instead of one teach + one action.

Acceptance (verbatim from audit § "First Wave PR Candidates"):

- Prompt rule added: first learning response must teach exactly one concrete idea AND end with exactly one learner action, unless answering an urgent direct question.
- Fun-fact opener block removed from `exchange-prompts.ts`. First-exchange branch retains nothing that asks the model to be conversational/chatty before the active prompt.
- Eval harness Tier 1 captures both changes.
- Tier 2 (`pnpm eval:llm --live`) confirms the rule against real LLM responses.
- Eval rule (or harness assertion) added: first learning response ends with exactly one learner action.
- Out of scope: `EVAL-MIGRATION` TODOs for `evaluate` / `teach_back` envelope migration.

---

## What shipped

### API prompts

- **`apps/api/src/services/exchange-prompts.ts`** — removed the two-branch fun-fact block (originally lines 455–469, gated on `exchangeCount === 0 && learning && !languageMode && !recitation` with a `safeTopicTitle` vs `rawInput` split). Replaced with a single unconditional `FIRST TURN RULE` push:

  > FIRST TURN RULE: Your first response must teach exactly one concrete idea AND end with exactly one learner action (a question to answer, a problem to solve, or an explanation to give back). Do not open with a fun fact, a curiosity hook, or a chatty invitation before teaching. Start teaching immediately. Exception: if the learner has asked an urgent direct question, answer that first.

- **`apps/api/src/services/interview-prompts.ts`** — same rule mirrored into the interview opener.

### Tests

- **`apps/api/src/services/exchanges.test.ts`** — assertion updated to cover the new contract. The freeform case (no topic, no `rawInput`) now also gets the FIRST TURN RULE injection — corrected from the prior "no injection for freeform" assertion (the prior assertion documented the old fun-fact branching, not desirable behavior).
- **`apps/api/eval-llm/flows/exchanges.test.ts`** — flow assertion updated.

### Eval-harness snapshots (Tier 1)

30 snapshot files regenerated under `apps/api/eval-llm/snapshots/`:

- `exchanges/*__S1-rung1-teach-new.md` — 5 profiles
- `interview/*` and `interview-orphan/*` — both subject-only and subject-book-focus variants per profile
- `probes/*` — 11 probe scenarios across the profile matrix

All show the new `FIRST TURN RULE` text; the old fun-fact opener is absent.

---

## Verification (run before commit)

- `pnpm exec nx run api:typecheck` — pass
- `cd apps/api && pnpm exec jest --findRelatedTests src/services/exchange-prompts.ts src/services/interview-prompts.ts` — 814/814 pass
- `pnpm eval:llm` (Tier 1) — 176 snapshots written, 0 errors (8 pre-existing skips unrelated)
- `pnpm exec nx run api:lint` — 0 errors

### Tier 2 (deferred — needs authorization)

`pnpm eval:llm --live` against the new rule. Real LLM cost. Coordinator authorizes separately because the harness charges per scenario.

---

## Out of scope

- `EVAL-MIGRATION` TODOs for `evaluate` / `teach_back` paths in `exchange-prompts.ts` (lines ~687–722) — both still emit JSON blobs in free text instead of using `signals.evaluate_assessment` / `signals.teach_back_assessment`. Separate follow-up.

---

## Commit

`a64d9ed2` — `feat(api): enforce FIRST TURN RULE in exchange + interview prompts [Slice 1 PR 5b]`
