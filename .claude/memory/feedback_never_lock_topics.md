---
name: Never lock or block topics — guide, don't gate
description: Prerequisites must be advisory (recommend), never hard-lock topics. Never delete prerequisite edges — soft-skip only. Periodic suggestive quizzes instead of forced repetition.
type: feedback
---

Prerequisites are recommendations, not gates. Never lock or block a topic behind prerequisite completion.

**Ruled 2026-06-11 (WI-587, PM):** this posture is now canon. The PRD's contradicting REQUIRED definition ("locked until 'strong' retention", old PRD:1371) was rewritten to advisory wording consistent with FR124; see docs/PRD.md § Concept Map — Prerequisite Relationship Types. Code check (2026-06-11): no locking logic exists anywhere — `topic_prerequisites` is not even a DB table yet; the only live prerequisite reference is advisory LLM prompt context (`apps/api/src/services/exchange-prompts.ts:1002`).

**Why:** The AI tutor's strength is adaptability and freedom. Hard-locking topics frustrates students (especially those who learned prerequisites outside the app). Deleting edges is irreversible and kids don't understand the consequence. Forced repetitive review kills motivation.

**How to apply:**
- Epic 7: REQUIRED relationship type behaves like RECOMMENDED with stronger signaling — surface warnings, inject LLM context, but never prevent the student from starting a topic (ratified in PRD § Prerequisite Relationship Types, ruled WI-587)
- Skip should soft-mark edges (not delete them) so the system can still reference skipped prerequisites
- Instead of re-locking topics when retention decays, prompt periodic low-stakes quizzes: "You did great on X, but you might want to revisit Y" — suggestive, not mandatory
- This applies to all future features: the system guides, it never gates learning
