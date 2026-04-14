Recommended Execution Order                                                                                                                                     
   
  Tier 1 — Quick wins & reliability (this week)                                                                                                                   
                                                                                                                                                                
  ┌─────┬─────────────────────────────────┬─────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │              Work               │ Effort  │                                                Why first                                                │
  ├─────┼─────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1   │ Progressive disclosure (NOT     │ ~1 day  │ Small, self-contained, and directly improves first-time UX. No dependencies. New users currently see    │
  │     │ STARTED)                        │         │ empty charts and meaningless stats — that's a bad first impression.                                     │
  ├─────┼─────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 2   │ Conversation-first:             │ ~2      │ One missing Inngest function. Without it, a failed freeform filing silently drops the session from the  │
  │     │ freeform-filing retry           │ hours   │ library. Easy to write, high reliability payoff.                                                        │
  ├─────┼─────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 3   │ Home UX Part 2 decision         │ ~30 min │ Was deliberately reverted. Decide: is the subtitle gone for good, or just deferred? If gone, update the │
  │     │                                 │         │  plan and close it. Don't carry phantom work.                                                           │
  └─────┴─────────────────────────────────┴─────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Tier 2 — Test debt & correctness (next sprint)

  ┌─────┬────────────────────────────────────┬────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │                Work                │ Effort │                                                  Why                                                  │
  ├─────┼────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │     │                                    │ ~2     │ ~90% of planned tests are missing. The memory system works but has almost no regression safety net.   │
  │ 4   │ Epic 16 test gaps                  │ days   │ Cap eviction, stale demotion, struggle resolution — these are the edge cases that break silently in   │
  │     │                                    │        │ production.                                                                                           │
  ├─────┼────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 5   │ Epic 16 Task 26 (struggle          │ ~1 day │ Two-tier notifications + resolution celebration. Requires the test foundation from #4 to be           │
  │     │ notifications)                     │        │ meaningful.                                                                                           │
  ├─────┼────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 6   │ Plan-code-review-fixes: missing    │ ~1 day │ review-due-scan and daily-reminder-scan are HIGH priority items — they drive the spaced repetition    │
  │     │ crons (2C.1/2C.2)                  │        │ loop. Without them, REVIEW_DUE books sit unnoticed.                                                   │
  └─────┴────────────────────────────────────┴────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Tier 3 — Security hardening (before launch)

  ┌─────┬────────────────────────────────┬─────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │              Work              │ Effort  │                                                   Why                                                   │
  ├─────┼────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │     │                                │ ~3-5    │ Defense-in-depth. The app already has application-level scoping (createScopedRepository), so this isn't │
  │ 7   │ S-06: Row-Level Security       │ days    │  an active vulnerability — but it's the safety net if a service ever forgets the scope. The 5-phase     │
  │     │                                │         │ plan exists; it just needs execution.                                                                   │
  ├─────┼────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 8   │ BD-10: Billing scoped repo     │ ~1 day  │ 31 direct db.query.* calls in billing.ts. Closely related to S-06 — do them together.                   │
  │     │ migration                      │         │                                                                                                         │
  ├─────┼────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 9   │ 2A.10: Row lock on             │ ~2      │ Race condition under concurrent seat additions. Low probability but high severity if hit.               │
  │     │ addProfileToSubscription       │ hours   │                                                                                                         │
  └─────┴────────────────────────────────┴─────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Tier 4 — Feature screens & polish (when bandwidth allows)

  ┌─────┬────────────────────────────────────┬─────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │                Work                │ Effort  │                                                 Why                                                 │
  ├─────┼────────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 10  │ Missing mobile screens (3E.1-3E.4) │ ~2-3    │ Teach-back, evaluate-challenge, word summaries, knowledge decay viz. These are learning experience  │
  │     │                                    │ days    │ enrichments — valuable but not blocking core flows.                                                 │
  ├─────┼────────────────────────────────────┼─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 11  │ Remaining plan-code-review Phase 4 │ ~2 days │ Missing test files, partial integration tests. Quality debt, not blocking.                          │
  │     │  (test gaps)                       │         │                                                                                                     │
  └─────┴────────────────────────────────────┴─────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Tier 5 — Major feature (next epic)

  ┌─────┬─────────────┬─────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │    Work     │ Effort  │                                                          Why last                                                          │
  ├─────┼─────────────┼─────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │     │ Epic 17:    │ ~2-3    │ 30 tasks, entirely new subsystem (Deepgram, VAD, waveform, voice schemas). This is the biggest single body of work. Stores │
  │ 12  │ Voice Input │ weeks   │  are currently blocked anyway, so shipping this isn't urgent — but it's the next transformative feature for the learning   │
  │     │             │         │ experience.                                                                                                                │
  └─────┴─────────────┴─────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  ★ Insight ─────────────────────────────────────
  The ordering principle: reliability of existing features > test coverage of existing features > security hardening > new screens > new epic. Progressive
  disclosure is #1 despite being a new feature because it's tiny and directly affects every new user's first session. Voice (#12) is last because it's the largest
   effort with the most unknowns, and store publishing is still blocked — there's no rush to ship native changes.

  The 3 doc issues (DOC-01/02/03 from bug-fix-plan) and the low-priority items (LP-01, BLP-01) can be handled opportunistically — they're not blocking anything.
  ─────────────────────────────────────────────────
