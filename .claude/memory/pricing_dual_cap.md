---
name: Pricing — Dual-Cap Free Tier + Plus tier entitlement
description: Free tier: 10/day + 100/month. Plus tier: 700/month, no daily limit. Model routing details are canonical in MMT-ADR-0014 + docs/registers/llm-models/master.md.
type: project
---

Free tier uses a **dual-cap model: 10 questions/day AND 100 questions/month** (changed from 50/month on 2026-03-25).

**Plus tier: 700 questions/month, no daily limit, one serious-study profile.** Quota confirmed 2026-04-09 when integration test expected 500 but account had 700. User explicitly stated "699 for plus program" (meaning X-Quota-Remaining shows 699 after 1 message consumed from 700). Premium profile clarified 2026-05-18: Plus is for one person who wants serious studying.

Model/provider routing is not canonical in this memory. The old Gemini-only / GPT-5.4 rung wording is superseded; use `MMT-ADR-0014` plus `docs/registers/llm-models/master.md` for current per-tier/per-rung model policy.

**Why free tier dual-cap:**
- 50 monthly was too stingy for users to experience the "aha" moment (needs ~7-10 exchanges)
- Daily cap creates habit formation ("come back tomorrow") rather than binge-and-done
- Monthly cap still protects against unlimited free usage
- 10/day lets students complete a full rung 1→3 learning arc per session
- Daily limit users (~day 10) become the best conversion candidates

**Tier config:**
- Free tier: `monthlyQuota: 100, dailyLimit: 10`
- Plus: `monthlyQuota: 700, dailyLimit: null, llmTier: 'standard'`
- Family: `monthlyQuota: 1500, dailyLimit: null, llmTier: 'standard'`
- Pro: `monthlyQuota: 3000, dailyLimit: null, llmTier: 'standard'`
- Per-tier/per-rung model routing: `MMT-ADR-0014` + `docs/registers/llm-models/master.md` are canonical.
- Daily reset via Inngest cron at 01:00 UTC

**How to apply:**
- 402 responses include `reason: 'daily' | 'monthly'` for client-side differentiation
- Response headers: `X-Quota-Remaining` (only set when dailyLimit is non-null)
- Integration test seed accounts use Plus tier (700) — expect `X-Quota-Remaining: '699'` after 1 message
- This is A/B testable — numbers can change without architectural changes
- Product invariant (2026-05-15): quota must count visible learner/user questions or deliberate user-triggered AI actions only. Do not burn quota for invisible reports, book/topic generation, summaries, telemetry, or automatic prefetch/background work. If an internal LLM task needs cost protection, add separate abuse/rate limiting instead of consuming the learner's visible-question pool.
- Parent-proxy invariant (2026-05-15): when a parent is viewing a child profile, metered LLM routes must reject before subscription lookup or quota decrement. A blocked proxy action must not consume the child's or family's visible-question pool.
