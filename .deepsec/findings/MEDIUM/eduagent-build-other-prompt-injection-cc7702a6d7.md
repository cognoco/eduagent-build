# [MEDIUM] Preformatted learner context blocks are appended to the system prompt without enforced escaping

**File:** [`apps/api/src/services/exchange-prompts.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/exchange-prompts.ts#L660-L719) (lines 660, 661, 665, 666, 669, 672, 685, 687, 709, 710, 718, 719)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-prompt-injection`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`buildSystemPrompt` directly appends multiple preformatted context strings. Traced sources include learner-authored summaries, topic notes, retrieved memory content, communication notes, and parked questions; some builders escape their fields, but several do not and this function has no typed safe-block boundary. Crafted stored text can therefore enter a future system prompt as persistent instruction-like content rather than data.

## Recommendation

Require context builders to return a typed safe prompt block, escape or sanitize every user/LLM-derived field at the builder boundary, wrap long free text in explicit data-only tags, and add prompt-injection regression tests for stored notes/summaries.

## Revalidation

**Verdict:** true-positive

I traced every context block buildSystemPrompt appends (exchange-prompts.ts:837-901). Most of the named sources ARE now escaped at their builder boundary, contradicting the finding's breadth: buildPriorLearningContext escapes topic.title (sanitizeXmlValue) and topic.summary (escapeXml in <learner_summary>); buildCrossSubjectContext sanitizes both fields; buildMemoryBlock sanitizes/escapes struggles, strengths, interests, communicationNotes (<learner_notes>), urgency reason, lastSessionSummary (<learner_session_summary>), and parkedQuestions (<learner_parked_questions>) — all with explicit PROMPT-INJECT-478 annotations; buildResumeContext and renderBookLearningHistorySections escape every free-text field; buildAccommodationBlock is a pure enum→template lookup with no user content. HOWEVER, one real gap remains: embeddingMemoryContext is built by formatMemoryContext (memory.ts:103) which interpolates retrieved session_embeddings.content WITHOUT escapeXml/sanitizeXmlValue and WITHOUT a data-only tag (plain '[1] <content>' list). That content originates from extractSessionContent (embeddings.ts:205-211), which joins raw user_message text, stored on session-completed and retrieved (profile-scoped, BUG-221) by findSimilarTopics, then appended raw by buildSystemPrompt:886-888 (mergeMemoryContexts does not escape). So crafted learner text can re-enter a future system prompt as un-fenced, instruction-like content — exactly the finding's claim. The exploit is profile-scoped self-injection (a learner steering their own future tutor prompts via stored memory), which bounds impact, but for a children's-education product a persistent self-jailbreak vector is a legitimate MEDIUM and the inconsistency with every sibling builder confirms the architectural point (no typed safe-block boundary). True-positive; the finding overstates 'several' builders but correctly identifies a live unescaped sink.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
