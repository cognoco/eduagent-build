---
name: Open bugs — 10-bug batch closed 2026-04-15. No known P0/P1.
description: All 10 Not-started bugs from Notion closed. BUG-32 Gemini timeout fix committed. RLS/tests/route rebalancing verified. No P0/P1 remaining.
type: project
---

**Bug batch 2026-04-15 (10 bugs, all closed to Done):**
- BUG-32 (P1): Gemini mid-stream stall — added 10s per-chunk readWithTimeout in gemini.ts. Committed 8308f914.
- BUG-133 (P1): RLS Phase 0+1 complete — withProfileScope, migration 0026, integration test. Deploy pending.
- BUG-17 (P1): Email spam — DNS/Resend/Clerk configuration needed. No code fix.
- BUG-29 (P2): Parent email delivery feedback — already implemented in consent.tsx/routes/consent.ts.
- BUG-446 (P2): Epic 9 billing tests — all 12 items verified existing (270 tests pass).
- BUG-430 (P2): DB-backed service tests — all 4 integration suites verified (18 tests pass).
- BUG-33 (P3): Session summary prompts — data-gated by design, Phase 0 done.
- BUG-447 (P3): Epic 1-5/10-13 tests — all 16 items verified existing (266 tests pass).
- BUG-432 (P3): Mobile mock cleanup — all items already fixed (SC-5/5b setError unconditional).
- BUG-431 (P3): Route test rebalancing — 105 route tests properly balanced, 0 deletions needed.

**Prior stabilization fixes still in place:**
- BUG-359/397/311/237 fixed. EP15-C2/C3 CLOSED 2026-04-19 (b16d0616, 0170f81f).

**How to apply:** No P0/P1 to worry about. EP15-C2/C3 closed. EP15-C4 is a minor code review finding, not a runtime bug.
