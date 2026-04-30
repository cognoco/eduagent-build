---
name: Never lock or block topics — guide, don't gate
description: Prerequisites must be advisory (recommend), never hard-lock topics. Never delete prerequisite edges — soft-skip only. Periodic suggestive quizzes instead of forced repetition.
type: feedback
---

Prerequisites are recommendations, not gates. Never lock or block a topic behind prerequisite completion.

**Why:** The AI tutor's strength is adaptability and freedom. Hard-locking topics frustrates students (especially those who learned prerequisites outside the app). Deleting edges is irreversible and kids don't understand the consequence. Forced repetitive review kills motivation.

**How to apply:**
- Epic 7: REQUIRED relationship type should behave like RECOMMENDED — surface warnings, inject LLM context, but never prevent the student from starting a topic
- Skip should soft-mark edges (not delete them) so the system can still reference skipped prerequisites
- Instead of re-locking topics when retention decays, prompt periodic low-stakes quizzes: "You did great on X, but you might want to revisit Y" — suggestive, not mandatory
- This applies to all future features: the system guides, it never gates learning
