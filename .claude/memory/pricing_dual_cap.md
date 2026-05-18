---
name: Pricing — Dual-Cap Free Tier + Plus tier entitlement
description: Free tier: 10/day + 100/month. Plus tier: 700/month, no daily limit, advanced help from rung 4+; GPT-5.4 default OpenAI candidate only rung 5+.
type: project
---

Free tier uses a **dual-cap model: 10 questions/day AND 100 questions/month** (changed from 50/month on 2026-03-25).

**Plus tier: 700 questions/month, no daily limit, one serious-study profile with advanced help from rung 4+** — quota confirmed 2026-04-09 when integration test expected 500 but account had 700. User explicitly stated "699 for plus program" (meaning X-Quota-Remaining shows 699 after 1 message consumed from 700). Premium profile clarified 2026-05-18: Plus is for one person who wants serious studying, but easy and medium turns remain on Gemini; advanced help starts at rung 4, while GPT-5.4 is the default OpenAI candidate and is reserved for rung 5+ only.

**Why free tier dual-cap:**
- 50 monthly was too stingy for users to experience the "aha" moment (needs ~7-10 exchanges)
- Daily cap creates habit formation ("come back tomorrow") rather than binge-and-done
- Monthly cap still protects against unlimited free usage
- 10/day lets students complete a full rung 1→3 learning arc per session
- Daily limit users (~day 10) become the best conversion candidates

**Tier config:**
- Free tier: `monthlyQuota: 100, dailyLimit: 10`
- Plus: `monthlyQuota: 700, dailyLimit: null, premiumModelProfiles: 1, llmTier: 'standard'`; session exchange routing promotes Plus to advanced help from rung 4, but the OpenAI candidate defaults to GPT-5.4 and is only eligible from rung 5.
- Family: `monthlyQuota: 1500, dailyLimit: null, premiumModelProfiles: 0, llmTier: 'standard'`; Gemini-only including fallback unless the optional $15/profile advanced add-on is active, which follows the same rung 4+ advanced-help rule and the same OpenAI rung 5+ restriction.
- Pro: `monthlyQuota: 3000, dailyLimit: null, premiumModelProfiles: 2, llmTier: 'standard'`; advanced seats follow the same rung 4+ / OpenAI rung 5+ rule.
- Daily reset via Inngest cron at 01:00 UTC

**How to apply:**
- 402 responses include `reason: 'daily' | 'monthly'` for client-side differentiation
- Response headers: `X-Quota-Remaining` (only set when dailyLimit is non-null)
- Integration test seed accounts use Plus tier (700) — expect `X-Quota-Remaining: '699'` after 1 message
- This is A/B testable — numbers can change without architectural changes
- Product invariant (2026-05-15): quota must count visible learner/user questions or deliberate user-triggered AI actions only. Do not burn quota for invisible reports, book/topic generation, summaries, telemetry, or automatic prefetch/background work. If an internal LLM task needs cost protection, add separate abuse/rate limiting instead of consuming the learner's visible-question pool.
- Parent-proxy invariant (2026-05-15): when a parent is viewing a child profile, metered LLM routes must reject before subscription lookup or quota decrement. A blocked proxy action must not consume the child's or family's visible-question pool.
