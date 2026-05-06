---
name: Audit deleted concepts before governance
description: Before recommending governance posture for an apparent rule violation, check whether the underlying concept still exists — it may have been removed by an epic, in which case the question is dead-code cleanup, not governance.
type: feedback
---

Literal-string grep is a proxy for architectural intent, not a test of it. Deleted concepts survive under boolean aliases, renamed functions, and stale comments.

**Why:** Epic 12 deleted `personaType` and decomposed it into three axes (age/role/intent). Story 12.5's sweep grepped for literal `personaType` and declared success — but the boolean alias `isLearner` survived in `RemediationCard.tsx` and `relearn.tsx`. Two audit cycles (MOBILE-1, MOBILE-2) then asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all?" Both recommended governance postures (allow/refactor) for a concept that had already been architecturally deleted.

**How to apply:** Before recommending governance posture for any apparent rule violation in a shared component:
1. Identify the underlying concept (here: "persona")
2. Grep `docs/specs/epics.md` for that concept — was it removed by an epic?
3. If removed: the correct action is dead-code cleanup + forward-only guard, NOT governance discussion about whether the pattern is "allowed"
4. If still active: proceed with governance as normal
5. When sweeping a deleted concept, broaden the regex beyond literal names to include boolean aliases, function names, string literals, and comments
