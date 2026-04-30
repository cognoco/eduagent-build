---
name: Memory system audit — Story 16.0 SHIPPED, embedding memory now functional
description: Story 16.0 shipped 2026-04-08 (commit e7a0e53). VOYAGE_API_KEY now passed to route handlers. Cross-subject context and prompt updates included. Prerequisite for Epic 16 Phase A satisfied.
type: project
---

## Memory System Audit (2026-04-08)

**Original finding:** The AI mentor's embedding memory was silently broken — `sessions.ts` didn't pass `voyageApiKey` to handlers. `retrieveRelevantMemory()` returned empty.

**Status: FIXED (2026-04-08)**

Commit `e7a0e53 fix(api): enable embedding memory retrieval + cross-subject context + prompt updates [Story-16.0]` addressed all three layers:

1. **Embedding memory:** `voyageApiKey: c.env.VOYAGE_API_KEY` now passed to session handlers ✅
2. **Prompt instructions:** Updated to allow natural memory references ✅
3. **Cross-subject context:** Added (previously only single-subject) ✅

**Why:** Silent degradation — `retrieveRelevantMemory` gracefully returned empty without logging.

**How to apply:** Story 16.0 prerequisite for Epic 16 Phase A is now satisfied. Epic 16 can proceed when prioritized.
