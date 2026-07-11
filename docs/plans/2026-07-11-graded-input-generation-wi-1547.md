# WI-1547 — upgrade Four Strands graded input generation beyond seed passages

Builder: claude:builder:WI-1547. Greenfield logic → TDD decomposition per builder.md Phase 2.

## Goal

Replace the deterministic `buildSeedPassage` mad-libs template with an LLM-generated
reading/listening passage tied to known vocabulary, target words, CEFR level,
language code, and learner interests — while keeping `streamLanguageGradedInputSchema`
byte-identical (AC #5) and keeping `knownWordEstimate`/`knownWordRatioTarget`
server-computed exactly as today (deliberate scope boundary, not an oversight).

## Design decisions (locked, do not re-litigate mid-implementation)

1. **New pure prompt module** `apps/api/src/services/graded-input-prompts.ts` —
   `buildGradedInputGenerationPrompt(input): ChatMessage[]`, mirrors
   `teach-back-grader-prompt.ts` shape (data-minimization header, input interface,
   `buildSystemPrompt`/`buildUserPrompt`). Sanitizes every learner-owned free-text
   value (`knownWords`, `targetWords`, `interests`) via `sanitizeXmlValue` from
   `./llm/sanitize` (PROMPT-INJECT convention, matches `language-prompts.ts`).
   Empty-known-vocabulary branch mirrors `formatKnownVocabulary`'s BUG-937 wording
   ("treat the learner as a complete beginner... zero target-language vocabulary").
   Anti-drift instruction: "Use ONLY vocabulary from the lists above, plus basic
   function words (articles, pronouns, conjunctions) required for grammar. Do not
   introduce other content words or names not listed."

2. **New generation service** `apps/api/src/services/graded-input-generation.ts` —
   `generateGradedInputContent(input): Promise<{ text: string; comprehensionQuestions: { prompt: string; answerHint: string }[] } | null>`.
   - Calls `routeAndCall(buildGradedInputGenerationPrompt(input), 2, { flow: 'language.graded_input', ageBracket, responseFormat: 'json' })`.
   - **Deliberately omits `conversationLanguage`.** The router's personalization
     preamble (`router.ts:249-256`) instructs the model to write the JSON `"reply"`
     field in `conversationLanguage` — that's envelope-shaped guidance for the
     conversational tutor reply. My schema has no `reply` field, and the `text`
     field must be in `languageCode` (the target/study language), not the
     learner's conversation/UI language. Passing `conversationLanguage` would
     inject a conflicting, misleading instruction. This flow is NOT added to
     `LEARNER_FACING_FLOWS` for the same reason (that set gates on
     `conversationLanguage` presence). Document this divergence from the
     `dictation.generate` precedent in the PR description.
   - **Threads `ageBracket`** computed fail-closed exactly like the existing
     minor-safety gates in this file (`session-exchange.ts:4038-4044` pattern):
     `!Number.isFinite(birthYear) ? 'child' : computeAgeBracketFromDate(birthYear, birthMonth, birthDay)`.
     This prevents an under-18 learner's passage generation from routing to
     Gemini (`router.ts:772,803-804` `isUnder18AgeBracket` → `approvedTextFallbackConfig`).
     Not a new decision — it's this feature applying the existing, already-ratified
     under-18 Gemini-exclusion fail-closed routing mechanism (**MMT-ADR-0014**,
     "Fail-closed on exhaustion": *"getFallbackConfig drops under-18-banned vendors
     (Gemini/Vertex) and terminates in CircuitOpenError, never in an unfiltered
     default"*). (Note: MMT-ADR-0016 governs the safety/judge architecture broadly
     and explicitly defers the Gemini-exclusion routing mechanism itself to
     MMT-ADR-0014 — cite the latter here.)
   - Parses with `parseStructuredLlmOutput(gradedInputGenerationResultSchema, result.response, 'graded-input-generation')`
     (the documented seam, `llm/parse-structured.ts`) — no bespoke retry loop
     (simpler than `book-suggestion-generation.ts`; matches `homework-summary.ts`'s
     shape).
   - Wrapped in try/catch; any throw or `null` parse result is logged via
     `logger.warn` with a `metric:` field (matches `subject.ts:698-725` convention)
     and the caller falls back to the existing deterministic path. Never throws
     to the caller.
   - New local schema (not exported from `stream-fallback.ts` — this is an
     internal LLM-result shape, not the client contract):
     ```ts
     const gradedInputGenerationResultSchema = z.object({
       text: z.string().min(1),
       comprehensionQuestions: z
         .array(z.object({ prompt: z.string().min(1), answerHint: z.string().min(1) }))
         .min(1)
         .max(2),
     });
     ```

3. **`language-session-engine.ts` changes:**
   - `buildGradedInputArtifact` becomes `async`. On LLM success, uses the LLM's
     `text` + maps `comprehensionQuestions` to `{ id: 'gist-1' | 'gist-2', prompt, answerHint }`.
     On LLM failure (null), falls through to the EXISTING `buildSeedPassage` +
     single generic question — unchanged fallback shape/behavior.
     `knownWordEstimate`/`knownWordRatioTarget` computation is UNCHANGED (still
     the deterministic vocab-count ratio) regardless of which path produced `text`
     — deliberate scope boundary, called out in the PR description.
   - `buildLanguageActivityTelemetry` becomes `async` (awaits the artifact call
     when `strand === 'meaning_input'`).
   - `buildLanguageSessionState` becomes `async` (awaits the telemetry call).
   - New optional inputs threaded through all three: `interests?: string[]`,
     `birthYear?: number | null`, `birthMonth?: number | null`, `birthDay?: number | null`
     (for ageBracket computation inside `buildGradedInputArtifact`).

4. **`session-exchange.ts:2525-2544`** — add `await` to the existing
   `buildLanguageSessionState(...)` call (already inside an async/awaiting
   function — zero other callers exist, confirmed by grep). Thread
   `interests: learningProfile?.interests ?? undefined` and
   `birthYear/birthMonth/birthDay: profile.birthYear/birthMonth/birthDay`
   (`profile` is in scope from `profileRows` at line 2295, well before this call).

5. **Eval coverage (Tier-1 snapshot, non-live only — per brief, never `--live`):**
   new `apps/api/eval-llm/flows/graded-input-prompts.ts` `FlowDefinition`
   snapshotting `buildGradedInputGenerationPrompt()` for 3 fixtures (beginner
   empty-vocab; non-empty vocab + interests + CEFR; no-CEFR/no-language
   fallback), registered in `eval-llm/index.ts`'s `FLOWS` array. Proves the
   anti-drift instruction renders (satisfies AC #3's literal ask). Run
   `pnpm eval:llm` (Tier-1 snapshot generation) — NEVER `pnpm eval:llm --live`
   (explicitly out of scope; noted as deferred/operator-deferred HITL in the
   completion summary).

6. **Tests (`language-session-engine.test.ts`):** register/dispose an LLM
   fixture via `registerLlmProviderFixture` (never `jest.mock`, GC1-clean seam)
   in each test that exercises `buildGradedInputArtifact`/`buildLanguageActivityTelemetry`/`buildLanguageSessionState`.
   - The 2 existing tests that assert exact deterministic passage text
     (`'bonjour'`, `'hola'`/`'agua'`) get a `chatError` fixture (simulates LLM
     unavailable) — converts them into explicit fallback-path coverage, keeping
     their existing assertions meaningful and unchanged.
   - New test: LLM-success path, empty known vocabulary (AC #4 beginner case) —
     fixture returns `llmStructuredJson({ text, comprehensionQuestions })`,
     assert artifact uses the LLM text/questions.
   - New test: LLM-success path, non-empty known + target vocabulary (AC #4
     non-empty case) — same shape, different input.
   - All other existing calls to the now-async functions get `await` added
     (test callbacks marked `async`) — no assertion changes needed since they
     don't touch `gradedInput` content.
   - GC6 boy-scout: scan this file for any pre-existing internal `jest.mock`
     while editing (per AGENTS.md) — none currently present per earlier read.

7. **Route-level check (AC #4 "API tests"):** verify whether
   `apps/api/src/routes/sessions.test.ts` already has gradedInput-adjacent
   coverage; if the route layer is where reviewers expect AC #4, add a thin
   case there too alongside the service-level tests (not a redundant full
   duplicate — one route-level smoke case confirming the field shape survives
   the HTTP boundary).

## Explicit non-goals / deferred (call out in completion summary)

- Tier-2 live LLM eval validation — explicitly out of scope per brief, snapshot-only.
- Latency: this adds a second sequential LLM call inline in the exchange hot
  path (unlike `book-suggestion`/`homework-summary` precedents, which are
  background/session-close). Acceptable for the launch vertical slice; hand
  back "pre-generate/cache graded input" as a follow-up (Workstream: Four
  Strands Language Learning) rather than solving here.
- `knownWordEstimate` staying a vocab-count ratio (not text-derived) — deliberate,
  matches AC scope, not an improvement target for this WI.

## Verification checklist

- [ ] `pnpm exec nx run api:typecheck`
- [ ] `pnpm exec nx run api:lint`
- [ ] `pnpm exec nx run api:test -- language-session-engine` (or targeted jest run)
- [ ] `pnpm exec nx run api:test -- session-exchange` and `sessions.test` (size the
      extra-`.chat()`-call ripple; fix any call-count/index assertions that break)
- [ ] `pnpm eval:llm` (Tier-1 snapshot generation for the new flow)
- [ ] `bash scripts/check-change-class.sh` guidance followed for full validation set
