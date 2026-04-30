---
name: F8 memory source IDs — provenance for struggles/strengths
description: Enrich StruggleEntry/StrengthEntry with sourceRef {origin, sessionId, eventId, observedAt} so memory entries carry provenance back-links. Enables GDPR transparency, prompt-injection inspection, and "forget and never re-infer" deletion.
type: project
---

## The gap

`StruggleEntry` and `StrengthEntry` today carry only an `origin` category (`'inferred' | 'learner' | 'parent'`) — no session ID, no event ID. The learner/parent cannot tap through from a memory card to "where did the tutor learn this?"

## The target shape

Both entries get an optional `sourceRef: {origin, sessionId: uuid | null, eventId: uuid | null, observedAt: datetime}`. Legacy entries land with nulls for sessionId/eventId; post-migration entries land fully populated from `session-analysis` writes.

## Why it matters beyond UX

Three reasons this is more than tap-through polish:

1. **GDPR transparency** — parents can audit exactly which session produced each memory claim.
2. **Prompt-injection inspection** (per `feedback_llm_prompt_injection_surfacing.md`) — suspicious memory becomes one-click inspectable.
3. **Source-level suppression** — new DELETE `suppressSource: true` option adds the sourceRef.eventId to `suppressedSourceEventIds` on `learning_profiles`, so future session-analysis skips that event entirely. This closes the "forget and never re-infer" loop.

## How to apply

- The LLM never sees `sourceRef` — it's UI metadata only. The model sees claims, the UI shows provenance. Why: feeding provenance to the model invites injection attacks that claim false provenance.
- Migration is shape-only (JSONB), additive, idempotent. No DDL except one new column `suppressedSourceEventIds` on `learning_profiles`.
- A dangling back-link (source session/event GDPR-deleted) must render gracefully — show origin + date, no tap-through.

## Formal spec

`docs/specs/2026-04-19-memory-sources-f8.md` — Failure Modes table, migration SQL, API changes, Mobile UI states, break test for prompt-injection suppression, acceptance criteria.
