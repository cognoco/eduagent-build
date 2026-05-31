# [BUG] Out-of-range `private_sources.factual_confidence` rejects the ENTIRE LLM envelope (drops reply + all state signals)

**File:** [`packages/schemas/src/llm-envelope.ts`](https://github.com/cognoco/eduagent-build//blob/main/packages/schemas/src/llm-envelope.ts#L32-L74) (lines 32, 33, 34, 35, 36, 37, 38, 39, 74)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-envelope-hardfail-on-noncritical-field`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

`privateFactualConfidenceSchema` (L32-39) is `z.preprocess(fn, z.number().min(0).max(1).optional())` with NO `.catch()`. Two problems combine: (1) The preprocessor only applies the percentage/over-1 normalization (`parsed > 1 ? parsed/100 : parsed`) on the STRING path. The number path short-circuits at the top: `if (typeof value === 'number') return value;` — so a bare numeric value > 1 is returned verbatim. (2) Because the field has no `.catch()`, when the inner `z.number().max(1)` rejects that value, the parent `privateSourcesSchema` object (L64-77) fails, and therefore the top-level `llmResponseEnvelopeSchema` (L428-488, `private_sources` at L480) fails. In `apps/api/src/services/llm/envelope.ts`, `parseEnvelopeRaw` does `llmResponseEnvelopeSchema.safeParse(parsed)` and on ANY failure returns `{ ok:false, reason:'schema_violation' }`, discarding the whole envelope — including the perfectly valid learner-visible `reply` AND every state-machine signal (`ready_to_finish`, `challenge_round_evaluation`, `retrieval_score`, etc.). The model is instructed to emit 0.0–1.0, but the existence of the string-side `%`/`>1` normalization (and the test fixture `factual_confidence: '91%'` in llm-envelope.test.ts:154) proves the authors expect the model to drift to percentage-style values; a model emitting the bare NUMBER `91` or `5` (e.g. a 0–5 scale or a percentage-as-number) silently tips the entire turn into the schema-violation fallback. This contradicts the field's explicit design — `private_sources` is 'never rendered to the learner' and is non-critical provenance — and is inconsistent with its sibling `privateReliedOnSchema` (L11-17) which uses `.catch([])` precisely to avoid breaking the envelope on bad provenance. Direction is fail-safe (no auth/state is wrongly granted; signals are lost, not forged), so this is a correctness/robustness bug rather than a security hole, but it can intermittently break core LLM flows (interview never concluding via ready_to_finish, Challenge-Round mastery evaluations dropped, note prompts not shown) whenever the model emits a numeric confidence outside [0,1].

## Recommendation

Make this non-critical field degrade gracefully like its sibling: terminate the inner schema with `.catch(undefined)` (e.g. `z.number().min(0).max(1).optional().catch(undefined)`) so a bad value drops only `factual_confidence`, never the whole envelope. Also apply the `>1 → /100` (and any future scaling) normalization on the NUMBER path too, not just the string path, so a numeric `91`/`5` is coerced consistently with the string `'91'`. More broadly, audit the other no-`.catch()` preprocess+min/max fields (e.g. `signals.retrieval_score` L235-238) and decide per-field whether a strict reject-the-envelope policy is intended; for provenance/UI-hint fields it should not be.

## Revalidation

**Verdict:** true-positive

Verified the failure chain end to end. privateFactualConfidenceSchema (L32-39) short-circuits the number path at L33 (`if (typeof value === 'number') return value`), so a bare JSON number like 91 or 5 is returned verbatim and skips the `value.trim().endsWith('%') || parsed > 1 ? parsed/100 : parsed` normalization that only the string path applies (L38). The inner schema z.number().min(0).max(1).optional() (L39) then rejects 91 (and there is no .catch()), so the factual_confidence property fails; that propagates to privateSourcesSchema's inner object (L64-77) failing — .optional() only admits undefined, not a present-but-invalid object — which propagates to private_sources in llmResponseEnvelopeSchema (L480) failing, so the top-level safeParse returns success:false. In services/llm/envelope.ts parseEnvelopeRaw (L205-213) any schema failure returns { ok:false, reason:'schema_violation' }, discarding the entire envelope including the valid learner-visible reply and every state signal (ready_to_finish, challenge_round_evaluation, retrieval_score, etc.). The sibling privateReliedOnSchema uses .catch([]) (L16) — proving graceful degradation on bad provenance was the intended design — and the test suite only exercises the string `'91%'`→0.91 path (test L148-159), with no coverage for a numeric out-of-range value, indicating this is an unintended gap rather than a deliberate strict-reject policy. The model is explicitly instructed to emit 0.0-1.0, but the string-normalization machinery shows the authors expect percentage/scale drift, so a model emitting the JSON number 91 plausibly tips an entire turn into the schema_violation fallback. Direction is fail-safe (signals are lost, never forged), so BUG severity (correctness/robustness, not security) is correct. The finding is the most precise of the set and fully verified — true-positive.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
