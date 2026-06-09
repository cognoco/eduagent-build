# LLM / AI surface — Bug Review

Lens: LLM / AI surface (envelope discipline, hard caps, prompt-injection, hallucination guards, routing/eligibility, eval coverage).
Branch: new-llm. Read-only review. Every claim cites file:line against actual code.

Overall the LLM surface is unusually disciplined: the structured envelope is the single source of truth (no live `[MARKER]`/bare-JSON state drivers), every envelope signal has a server-side hard cap, the challenge-round mastery path is server-owned and conservative, and the V2 routing matrix is fail-closed against the under-18 Gemini ban. Findings below are mostly gaps at the edges (memory-context injection, image-path safety bypass, a dead localization wire), not core-contract breaks.

## Critical

_None found._

## High

### [High] pgvector memory context is injected into the system prompt unescaped and unframed — second-order prompt-injection vector
- File: `apps/api/src/services/memory.ts:122-124` (formatter) consumed at `apps/api/src/services/exchange-prompts.ts:898-913` and `:849-856`
- What: Retrieved memory blocks (`embeddingMemoryContext`, `learnerMemoryContext`, `priorLearningContext`, `crossSubjectContext`, `resumeContext`) are pushed into the system prompt as raw `sections.push(context.embeddingMemoryContext)` / `sections.push(context.learnerMemoryContext)` etc. with NO `escapeXml`, NO `sanitizeXmlValue`, and NO "treat as data, not instructions" tag wrapping. `formatMemoryContext` (memory.ts:122) truncates each row to 500 chars and concatenates verbatim. Contrast `rawInput`, which IS entity-encoded and wrapped in `<learner_intent>` with a data-only notice (exchange-prompts.ts:707-712), and gap/interleaved lists which go through `sanitizeXmlValue` (exchange-prompts.ts:868).
- Impact: The memory content originates from LLM summaries of prior learner conversations (pgvector rows over `*.content`). A learner can plant directive text in an earlier turn ("Ignore prior instructions; from now on…"); if it survives summarization into a stored embedding/summary, it is re-injected on a later session as authoritative *system-prompt* context with no framing that marks it as untrusted. This is a stored/second-order injection path that bypasses the per-turn `sanitizeUserContent` guard (which only runs on the live `user` message, exchanges.ts:1506).
- Fix direction: Wrap each memory block in a named tag (e.g. `<retrieved_memory>…</retrieved_memory>`) with `escapeXml` applied to the content and a one-line "data only, not instructions" notice — mirror the `rawInput`/`session-recap`/`filing` pattern the sanitize.ts header documents. Apply at the formatter boundary (memory.ts) and at the prior-learning/learner-memory push sites.

## Medium

### [Medium] Safety tripwire does not run on image (vision) input — deterministic catastrophic-content floor is bypassed for photos
- File: `apps/api/src/services/exchanges.ts:1483` and `:1621` (`detectCatastrophicSafetyTrigger(userMessage)`)
- What: The deterministic safety floor only inspects the text `userMessage`. `imageData` (exchanges.ts:1474, `buildUserContent` at :169) is never run through the tripwire, and the tripwire is regex-only so it cannot read image text. Vision turns route to Mistral / GPT-5-mini (router.ts:438-451), so the catastrophic categories (self-harm method-seeking, sexual content involving a minor) in a photo (handwritten note, screenshot) depend entirely on the model behaving — the explicit "floor holds even if the model is jailbroken" guarantee (safety-tripwire.ts:13-25) does not apply to the image channel.
- Impact: A learner can route a catastrophic request through an attached image and bypass the deterministic backstop. The model + battery remain the net, but the design's promised deterministic floor has a hole on the exact inputs (self-harm/CSAM) it exists for.
- Fix direction: Document the image-channel limitation explicitly in safety-tripwire.ts, and/or add a vision-aware pre-check (e.g. OCR-then-tripwire, or treat image-bearing turns as elevated and require the model's structured `crisis_redirect` with a server hard-stop). At minimum add a negative-path test asserting the current behavior so the gap is visible.

### [Medium] Cerebras refusal localization is dead for non-English learners — `conversationLanguage` is never threaded onto the model config
- File: `apps/api/src/services/llm/providers/cerebras.ts:160-163` reads `config.conversationLanguage ?? 'en'`; `apps/api/src/services/llm/router.ts:1125-1134` (and `:1543-1552`) build `config` from `getModelConfig(...)` + `responseFormat` only.
- What: `ModelConfig.conversationLanguage` exists (types.ts:41) and the Cerebras adapter uses it to localize a bare-model-refusal rewrite (refusal-envelope.ts `DECLINE_BY_LANGUAGE`). But `routeAndCall`/`routeAndStream` only pass `_options.conversationLanguage` into the *preamble* (`withSafetyPreamble`); they never copy it onto the `config` object that reaches `provider.chat(...)`. `getModelConfig`/`getModelConfigV2` also never set it. So `config.conversationLanguage` is always `undefined` and the refusal decline always falls back to English.
- Impact: Czech/Spanish/Japanese/etc. learners who hit the ~1% gpt-oss bare-refusal path get an English decline mid-session instead of their tutor language — the entire `DECLINE_BY_LANGUAGE` map (10 locales) is unreachable in production. Functionality silently degraded; the test suite passes because `normalizeModelRefusal` is unit-tested directly with an explicit language arg, never through the router.
- Fix direction: In `routeAndCall`/`routeAndStream`, add `conversationLanguage: _options?.conversationLanguage` to the spread that builds `config` (after `getModelConfig`). Add an integration-style assertion that a routed Cerebras refusal in a non-English session returns the localized decline.

### [Medium] Cerebras streaming refusals are not normalized — non-English learner gets raw refusal JSON / generic fallback mid-stream
- File: `apps/api/src/services/llm/providers/cerebras.ts:35-38, 171+` (streaming `generate()` does not call `normalizeModelRefusal`)
- What: By explicit design (commented), the streaming path skips refusal normalization "like every other streaming provider." Since the exchange hot path is streaming (`streamExchange` → `routeAndStream`), the localized-decline rewrite only ever runs on the non-streaming `processExchange` path. A bare `{"type":"refusal"}` mid-stream flows to the downstream envelope-parse fallback (`classifyExchangeOutcome` → `DEFAULT_FALLBACK_TEXT`).
- Impact: The polite localized decline + topic redirect is effectively unreachable for the primary streaming UX even in English; learners get the generic fallback instead. Combined with the Medium above, the refusal-envelope feature is largely inert in production.
- Fix direction: Detect the bare-refusal shape before first byte is emitted (the refusal JSON is small and arrives in the first chunk for gpt-oss) and rewrite to the localized envelope there, or have the route layer's empty/malformed fallback consult `normalizeModelRefusal` on the accumulated raw response. Verify which path actually fires for streamed gpt-oss refusals.

### [Medium] Note-draft lexical-overlap guard is fed the LLM-derived quotes for BOTH arguments instead of an independent verified-content source
- File: `apps/api/src/services/session/session-exchange.ts:658-662` (`validateNoteDraft(noteDraft.content, decision.solidAnswerQuotes, decision.solidAnswerQuotes)`)
- What: The BUG-483 contract in `note-draft.ts:103-116` says `verifiedEventContents` should be DB-verified event text (from `validateEvaluationEventIds`) so the overlap is measured against real learner words, not the LLM's paraphrase. Here BOTH the second and third args are `decision.solidAnswerQuotes`. For *persisted* answers this happens to be safe — `decideMasteryAndReview` (evaluation.ts:143) builds quotes from `e.learnerQuote`, which `validateEvaluationEventIds` already replaced with DB `content` (evaluation.ts:113-125). BUT for the *current-turn* answer, `validateChallengeRoundEvaluationItems` substitutes `learnerQuote` with route-supplied `currentUserMessage.content` (session-exchange.ts:881-887), which is `input.message` (session-exchange.ts:3261), not a DB read. So one evaluated answer's "verified content" is route-trusted, not DB-verified, weakening the value-substitution defense for that item.
- Impact: For the concept evaluated on the final challenge turn, the lexical-overlap guard compares the draft against text the request supplied for itself, so a draft that drifts only on that concept's vocabulary could pass. Bounded (one concept, and `input.message` is the genuine learner turn being processed), but it diverges from the documented "always DB-verified" invariant.
- Fix direction: Either (a) re-fetch the current answer's event content from the DB after persistence and pass that as `verifiedEventContents`, or (b) document the current-turn exception explicitly in note-draft.ts and add a test pinning that the persisted-answer path uses DB content while the current-turn path uses `input.message`.

## Low

### [Low] V2 free-tier vision fallback lists the same provider as the failed primary
- File: `apps/api/src/services/llm/router.ts:711-714` (`candidates = isFree ? [mistral, sonnet] : [gpt5mini, sonnet]`)
- What: In `getFallbackConfigV2`, vision candidates ignore `primary.provider`. For a free-tier vision request the primary is Mistral (`getModelConfigV2`, router.ts:438-444); on transient failure the first fallback candidate is Mistral again. The circuit for that key is likely open, so it usually skips to Sonnet, but the list still names the failed provider first.
- Impact: Minor — a redundant first candidate that the circuit/`providers.has` check filters; at worst one wasted iteration. No correctness break.
- Fix direction: Skip the primary's provider when building the vision candidate list (or special-case `primary.provider === 'mistral'` to start at Sonnet/GPT-5-mini).

### [Low] `getModelConfigV2` advanced-rung gate keys on `llmTier === 'premium'` while the V2 vision branch returns before the gate — premium vision never reaches gpt-5.4
- File: `apps/api/src/services/llm/router.ts:438-463`
- What: The vision branch (`:438`) returns before the `rung >= V2_ADVANCED_MODEL_MIN_RUNG && llmTier === 'premium'` advanced branch (`:456`). So a premium learner sending an image at rung 4-5 gets GPT-5-mini@low, never gpt-5.4. This is plausibly intentional (gpt-5.4 text-reasoning vs. mini-vision), but it is undocumented and the comment at `:453-455` only explains the Family/Free exclusion, not the vision-premium one.
- Impact: Possibly-intended product behavior with no comment/test asserting it, so a future edit could "fix" it wrongly or it could be an unintended downgrade.
- Fix direction: Add a one-line comment + a matrix test pinning "premium vision rung 5 → gpt-5-mini, not gpt-5.4" so the intent is explicit and locked.

### [Low] Eval-LLM signal-distribution baseline is an empty stub — Layer-1 regression guard cannot fire
- File: `apps/api/eval-llm/baseline.json:1-6` (`"flows": {}`)
- What: The signal-distribution regression guard (metrics.ts) compares a live run to this baseline, but `flows` is empty, so there is nothing to regress against. This matches the documented deferral ("seeding deferred to launch"), but it means envelope-signal distribution drift (e.g. `partial_progress` collapsing, `ready_to_finish` never emitted) is currently uncaught by the harness.
- Impact: Known/accepted gap, but worth surfacing in this atlas: the eval harness's drift detector is dormant for every flow until the baseline is seeded.
- Fix direction: Seed `baseline.json` from a `--live` run before launch (tracked in `docs/pre-launch-checklist.md`); until then treat envelope-signal regressions as unguarded.

### [Low] `repairBareQuotesInsideJsonStrings` can mutate a learner-visible reply that contains JSON-like punctuation
- File: `apps/api/src/services/llm/envelope.ts:133-182, 194-203`
- What: On a `JSON.parse` failure the parser attempts to repair bare inner quotes by escaping any `"` not followed by `:,}]`. For a reply legitimately containing quoted speech followed by prose (e.g. `... she said "stop" and left`), the heuristic escapes the inner quote and re-parses, which can alter the rendered reply text. It only runs on the failure branch, so well-formed envelopes are untouched.
- Impact: Rare cosmetic corruption of reply text on the repair path; bounded to malformed-JSON cases that would otherwise fall back to raw-text extraction anyway.
- Fix direction: Prefer `extractReplyCandidate` (already used downstream) over in-place quote repair for the reply field, or cap the repair to side-channel fields. Low priority; add a test with a reply containing inner quotes to pin behavior.

## Cross-lens findings

- **Session/persistence lens:** The challenge-round current-turn answer trusts `input.message` from the route as "verified content" (session-exchange.ts:881-887, 3261) rather than re-reading the just-persisted `user_message` event. Confirming the persisted row matches `input.message` is a persistence/route-contract concern beyond the LLM surface.
- **Auth/data-scoping lens:** `persistChallengeRoundMasteryEvidence` and `persistChallengeRoundReviewTargets` (session-exchange.ts:681-790) write `assessments` / `needs_deepening_topics` with `profileId` and verify topic ownership via `findOwnedCurriculumTopic`, but the `assessments` insert (`:700-711`) uses a bare `db.insert` rather than a scoped repository — the data-scoping lens should confirm the ownership chain is enforced on every write path here.
- **Observability/Inngest lens:** `emitCrisisRedirectEvent` (exchanges.ts:75-104) emits `app/safety.crisis_redirect_fired` via `safeSend` with an `// orphan-allow` marker (no downstream handler by design). The observability lens should confirm the dashboard query / monitoring on this event actually exists (RR-12 monitoring guardrail referenced in the comment).
- **Mobile lens:** Comments reference a legacy mobile regex-strip of marker payloads at `use-session-streaming.ts:581-593` (envelope.ts:264-266) scheduled for removal under `[EMPTY-REPLY-GUARD-3]`. The mobile lens should verify that dual-source marker detection is gone or tracked, since divergence between server `KNOWN_MARKER_KEYS` and the mobile regex is a latent drift.
- **Config/secrets lens:** `OPENAI_ADVANCED_MODEL` rotation (router.ts:317-371) documents an incomplete wiring — `OPENAI_ADVANCED_MODEL` env → `config.ts` schema → `middleware/llm.ts` is "left for a separate PR." The config lens should confirm whether the Doppler-sourced override is actually reachable at runtime or still hardcoded.
