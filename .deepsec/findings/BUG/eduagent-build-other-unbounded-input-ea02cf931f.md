# [BUG] Uncapped chunks/chunksWithPunctuation arrays in dictation review input DTO

**File:** [`packages/schemas/src/dictation.ts`](https://github.com/cognoco/eduagent-build//blob/main/packages/schemas/src/dictation.ts#L29-L31) (lines 29, 31)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-unbounded-input`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

dictationSentenceSchema declares `chunks: z.array(z.string()).optional()` (L29) and `chunksWithPunctuation: z.array(z.string()).optional()` (L31) with no cap on either the array length or per-element string length. This schema is embedded in dictationReviewInputSchema.sentences (L110-113), which validates untrusted POST /dictation/review request bodies. Every other field in this module is deliberately bounded (text/withPunctuation capped at DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS=500, sentences capped at DICTATION_REVIEW_MAX_SENTENCES=50, imageBase64 at IMAGE_BASE64_MAX), and the module header comment states caps exist explicitly to bound attacker-controlled payload. The chunks fields are an inconsistency in that contract: an attacker passing schema validation can attach arbitrarily large chunks arrays (up to 50 sentences each carrying an unbounded array of unbounded strings), bounded only by the platform HTTP body limit. IMPORTANT — this is NOT an LLM cost-abuse bypass: I traced services/dictation/review.ts and confirmed the review prompt is built solely from s.text (review.ts:196); chunks/chunksWithPunctuation are never forwarded to routeAndCall, and dictationReviewPromptCharCount over-counts (text+withPunctuation) relative to the actual prompt, so the documented prompt-char budget protection holds. The residual impact is limited to extra parse/memory cost for an oversized-but-ignored field, hence BUG severity rather than a security finding.

## Recommendation

Bound both fields to match the module's other caps, e.g. `chunks: z.array(z.string().max(DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS)).max(DICTATION_REVIEW_MAX_SENTENCES).optional()` (and likewise for chunksWithPunctuation). Since these fields are only meaningful for client-side TTS playback and are ignored by the review service, an alternative is to define a separate, leaner input schema for /dictation/review that omits chunks entirely.

## Revalidation

**Verdict:** true-positive

Verified the defect exists exactly as described. dictationSentenceSchema declares chunks (L29) and chunksWithPunctuation (L31) as z.array(z.string()).optional() with no cap on array length or element length, while every sibling field is deliberately bounded (text/withPunctuation max 500, sentences max 50, imageBase64 at IMAGE_BASE64_MAX = 2MB). The schema is embedded in the untrusted dictationReviewInputSchema.sentences (L110-113). I traced reviewDictation (services/dictation/review.ts:195-206) and confirmed only s.text is mapped into the prompt — chunks/chunksWithPunctuation are never read, never forwarded to routeAndCall, and never persisted (the route at routes/dictation.ts:290-303 only returns the review result). dictationReviewPromptCharCount (L124-131) counts only text+withPunctuation, so the LLM-cost budget is unaffected, confirming this is NOT a cost-abuse bypass. The route additionally requires authentication and enforces a 10-req/min rate limit (dictation.ts:227-241), so the residual impact is limited to trivial extra JSON.parse/Zod/memory cost on an oversized-but-ignored field, bounded by the platform body limit and dwarfed by the 2MB image cap. The finding's own BUG classification and impact assessment are accurate; the inconsistency with the module's explicit cap contract is real, so this is a legitimate (if very low-impact) hardening/consistency true-positive. No severity change.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-25)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
