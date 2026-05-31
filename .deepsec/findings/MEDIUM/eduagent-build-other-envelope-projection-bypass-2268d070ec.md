# [MEDIUM] Read projector leaks raw LLM envelope (private_sources / signals) when reply is empty or non-string

**File:** [`apps/api/src/services/llm/project-response.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/llm/project-response.ts#L80-L98) (lines 80, 92, 98)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-envelope-projection-bypass`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

projectAiResponseContent() is the defense-in-depth read projector that is supposed to reduce a stored sessionEvents.ai_response.content envelope down to only the learner-visible `reply` text on every read path. However, in the schema-invalid fallback (Step 4), if the content is a structurally-valid envelope object whose `reply` is missing, empty (""), or non-string, the `(parsed.reply.length > 0)` guard fails and the function returns the ORIGINAL rawContent verbatim (line 98; also line 80 when extractFirstJsonObject returns null on truncated JSON). That rawContent is the full envelope JSON — including `signals` and the `private_sources` block, which the envelope schema (packages/schemas/src/llm-envelope.ts:474-480) explicitly documents as 'Private provenance ... This is never rendered to the learner.' The codebase's own tests encode this leak as expected behavior (project-response.test.ts:149-160, 196-208 assert empty-reply 'returns rawContent'; 278-297 shows a full envelope carrying private_sources.relied_on/reason). The exact rows that trigger this are the pre-[BUG-934] malformed rows this projector was created to defend against, and the consumers surface the result to users and downstream models: export.ts:456 pipes it directly into the user-facing GDPR data export, plus bookmarks.ts, session-context-builders.ts, learner-profile.ts, and embeddings.ts feed it into UI and downstream-LLM prompt context. Net effect: internal tutoring side-channel state (source IDs relied on, factual_confidence, state-machine signals) can be disclosed to the learner/parent (e.g. in a GDPR export) and re-injected into later prompts. Severity is bounded because it requires an empty/non-string-reply envelope row to exist and the leaked data is internal metadata rather than credentials/PII.

## Recommendation

When the only extractable content is an envelope object that yields no usable `reply` string, do NOT return the raw envelope JSON. Return an empty string (or a neutral placeholder), or strip the known side-channel keys (signals, ui_hints, private_sources, confidence) before returning. The 'never silently drop characters' rationale only holds for content the learner already saw render correctly — an empty-reply envelope was never rendered, so returning its raw side-channel is strictly worse than returning empty. Update project-response.test.ts cases 7/8 to assert the sanitized output rather than rawContent.

## Revalidation

**Verdict:** true-positive

Confirmed against source and tests. projectAiResponseContent's Step 4 fallback: when strict parseEnvelope fails (an empty reply fails the schema's `reply: z.string().min(1)` at llm-envelope.ts:439-441; a non-string reply fails the type), it extracts the JSON and applies a `typeof parsed.reply === 'string' && parsed.reply.length > 0` guard (lines 87-93). When that guard fails it executes `return rawContent;` (line 98), returning the FULL envelope JSON verbatim — including the `private_sources` block the schema documents (llm-envelope.ts:474-480) as 'never rendered to the learner.' Line 80 leaks similarly when extractFirstJsonObject returns null. The repo's own tests lock this in: project-response.test.ts cases at lines 149-160, 196-208 ('{"reply": ""}' → returns rawContent), 212-223 ('{"reply": 42}' → rawContent), 225-233 (object reply → rawContent). I verified the consumer claim: export.ts:456 pipes projectAiResponseContent output straight into the GDPR data export for ai_response rows; bookmarks/embeddings/session-context-builders/learner-profile feed it into UI and downstream prompt context. The precondition is a stored row whose ai_response.content is a structurally-valid envelope with empty/non-string reply but populated signals/private_sources — i.e. exactly the pre-[BUG-934] malformed rows this projector exists to defend against (the post-fix write path persists only the clean reply or routes empty/unparseable to a non-persisted fallback, per session-exchange.ts:3152). The projector failing precisely in the case it should sanitize is a real defense-in-depth/info-disclosure gap. Bounded (internal tutoring metadata, disclosed to the data subject's own export, not credentials/PII), so MEDIUM is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-16)
