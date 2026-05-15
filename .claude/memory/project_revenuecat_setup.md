---
name: RevenueCat project setup status
description: RevenueCat project "MentoMate" created with Premium entitlement. Store accounts are available; remaining work is product, connection, webhook, and Doppler setup.
type: project
---

RevenueCat project created on 2026-03-27:
- **Project name:** MentoMate
- **Entitlement:** `Premium` (one entitlement for all paid tiers — API resolves specific tier from product ID)
- **Store connections:** Account access is available as of 2026-05-15; connect App Store and Google Play when products/service credentials are ready.

**Product ID mapping (must match code exactly):**
Code reference: `apps/api/src/routes/revenuecat-webhook.ts:81-104`

Subscriptions (6):
- `com.eduagent.plus.monthly[.android]` → Plus
- `com.eduagent.plus.yearly[.android]` → Plus
- `com.eduagent.family.monthly[.android]` → Family
- `com.eduagent.family.yearly[.android]` → Family
- `com.eduagent.pro.monthly[.android]` → Pro
- `com.eduagent.pro.yearly[.android]` → Pro

Consumable (1):
- `com.eduagent.topup.500[.android]` → 500 credits

**Remaining setup:**
1. Connect Google Play (needs service account JSON from Play Console)
2. Connect App Store
3. Create products in store dashboards matching above IDs
4. Create offerings with 6 subscription packages + 1 consumable
5. Configure webhook URL → `https://api-domain/v1/revenuecat/webhook`
6. Add to Doppler: `REVENUECAT_WEBHOOK_SECRET`, `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`, `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`

**How to apply:** Product IDs are non-negotiable — they must match `PRODUCT_TIER_MAP` exactly. After connecting stores, validate real sandbox purchase → RevenueCat webhook → API entitlement/quota sync before publishing.
