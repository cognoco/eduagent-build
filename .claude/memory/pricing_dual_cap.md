---
name: Pricing — Dual-Cap Free Tier + Plus tier quota (2026-04-09)
description: Free tier: 10/day + 100/month. Plus tier: 700/month, no daily limit. Confirmed via integration test fix 2026-04-09.
type: project
---

Free tier uses a **dual-cap model: 10 questions/day AND 100 questions/month** (changed from 50/month on 2026-03-25).

**Plus tier: 700 questions/month, no daily limit** — confirmed 2026-04-09 when integration test expected 500 but account had 700. User explicitly stated "699 for plus program" (meaning X-Quota-Remaining shows 699 after 1 message consumed from 700).

**Why free tier dual-cap:**
- 50 monthly was too stingy for users to experience the "aha" moment (needs ~7-10 exchanges)
- Daily cap creates habit formation ("come back tomorrow") rather than binge-and-done
- Monthly cap still protects against unlimited free usage
- 10/day lets students complete a full rung 1→3 learning arc per session
- Daily limit users (~day 10) become the best conversion candidates

**Tier config:**
- Free tier: `monthlyQuota: 100, dailyLimit: 10`
- Plus: `monthlyQuota: 700, dailyLimit: null`
- Family/Pro: `dailyLimit: null` (specific monthly quotas TBD)
- Daily reset via Inngest cron at 01:00 UTC

**How to apply:**
- 402 responses include `reason: 'daily' | 'monthly'` for client-side differentiation
- Response headers: `X-Quota-Remaining` (only set when dailyLimit is non-null)
- Integration test seed accounts use Plus tier (700) — expect `X-Quota-Remaining: '699'` after 1 message
- This is A/B testable — numbers can change without architectural changes
