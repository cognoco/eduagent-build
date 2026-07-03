DOC: docs/plans/2026-06-26-challenge-round-grader-judge.md (2026-06-26, 431 lines)

CLAIMS:
- Move `challenge_round_evaluation` signal emission from tutor-inline (unreliable under gpt-oss V2 tutor) to a dedicated judge/grader call (T1-T8).
- Default `GRADER_MODEL` to Sonnet 4.6 non-reasoning, demote to Haiku only after a Tier-2 bake-off proves it clean on format + judgment axes (T10).
- Add server-side terminal guard so a grader stall (fail-open `[]`) can't wedge a Challenge Round open forever (T9).
- Keep `decideMasteryAndReview` / `validateEvaluationEventIds` byte-identical — only the evaluation *source* changes.
- Amend MMT-ADR-0016 + reconcile `docs/registers/llm-models/master.md` (Judge row + gate H4) with the new capability (T11).

TECH VALIDITY: none — all internal corrections the plan itself made (vendor-independence guard, capability routing, guard-relaxation) are reflected in code; no broken assumptions found against current source.

IMPLEMENTED:
- T1-T9 (schema, flag, router capability, grader service, session-exchange wiring, terminal guard): complete — `apps/api/src/services/challenge-round/grader.ts`, `grader-prompt.ts` exist; `apps/api/src/config.ts:202` `CHALLENGE_ROUND_GRADER_ENABLED` now defaults `'true'` (shipped past the plan's "default false" rollout stage); `apps/api/src/services/llm/router.ts:355` `GRADER_MODEL = 'claude-sonnet-4-6'`; `evaluation.ts` untouched per plan.
- T10 (Tier-2 bake-off, model-selection gate): **partial** — eval flow exists (`apps/api/eval-llm/flows/challenge-grader.ts`, snapshots under `apps/api/eval-llm/snapshots/challenge-grader/`), but `docs/registers/llm-models/vetting/` contains only `2026-06-06-launch-set-iteration-1.md` — no bake-off vetting entry recorded for the grader model decision. `master.md:49` still literally says "Eval-selected (T10 bake-off pending), default Sonnet 4.6."
- T11 (ADR amendment + register reconciliation): complete — `docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md:47` "Amendment (2026-06-26)"; `master.md:49` (Judge row) and `:120` (H4 row, "Partially advanced") both reconciled to the grader capability, no contradiction with `GRADER_MODEL` remains.

CANDIDATE WIs:
- WI-1438 "Record challenge-grader model vetting + reconcile GRADER_MODEL with the LLM model register/ADR": **adopt (narrowed)** — the register/ADR reconciliation half (T11) is already done; the real residual scope is running T10's live bake-off and filing the `vetting/` entry (currently absent). Retitle to "Run T10 grader model bake-off + file vetting/ entry" so it isn't closed as a doc no-op.

VERDICT: partially-implemented

MVP RECOMMENDATION: in — the grader is load-bearing for mastery verification on the V2 (Cerebras/gpt-oss) tutor, which is the north-star shell's model path; shipping without the T10 bake-off means production runs on an eval-selected-in-name-only Sonnet default with no format/judgment evidence on file. Finish T10 before/at V2 minor-traffic cutover (it also gates H4, which gates the Gemini-removal cutover — see row 21).

CONFIDENCE: high + 2 decidable Zuzka questions:
1. Is running the T10 bake-off + filing the vetting/ entry pre-MVP-launch blocking, or can Sonnet 4.6 ship un-vetted with a fast-follow ticket?
2. Should WI-1438 be split (kill the reconciliation half as done, adopt only the bake-off half) or kept as one item?
