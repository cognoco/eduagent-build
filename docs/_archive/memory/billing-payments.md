---
name: Billing & Payments — Mobile IAP + Stripe dormant
description: Mobile uses RevenueCat (StoreKit 2 + Google Play Billing). Stripe code kept dormant for future web. Epic 9 COMPLETE.
type: project
---

# Billing & Payments — Architecture Gap

## The Problem

The architecture (docs/architecture.md) and PRD (docs/prd.md) originally specified **Stripe** as the sole payment provider. The entire billing stack — routes, services, webhook handler, Inngest jobs — was built around Stripe web checkout.

**Stripe web checkout will be rejected by both Apple App Store and Google Play Store** for digital services (AI tutoring).

## Solution: Mobile IAP + Stripe Dormant for Web

- **Mobile:** RevenueCat (`react-native-purchases`) wrapping Apple StoreKit 2 + Google Play Billing
- **Web (future):** Stripe activates when web client is added post-launch (2.9% fee vs 30% IAP)
- **Strategy:** Mobile-first launch. Web client added if product succeeds.

## Critical IAP Edge Cases

1. **Top-up credits — server-side only:** Never grant credits from client-side purchase callback. Wait for RevenueCat webhook confirmation. Apple/Google can delay confirmations.
2. **Family billing — consumable IAP limitation:** Apple Family Sharing does NOT support consumable purchases. Top-ups purchased individually; API routes credit to shared pool based on family group membership.
3. **Grace periods — platform-controlled:** PRD's "3-day grace period" is invalid for IAP. Apple offers 16-60 days (configurable), Google up to 30 days.
4. **Keep Stripe dormant:** Don't delete Stripe code. Needed for future web client, B2B/school licensing, promotional credits.

## Important Context for Future Agents

- Do NOT set up Stripe secrets for staging/production mobile billing. Mobile uses RevenueCat + native IAP.
- Do NOT remove Stripe code. It stays dormant for the future web client. No abstraction layer needed yet — just leave it in place.
- Strategy: **mobile-first launch** → add web client if product succeeds → Stripe activates for web at that point.
- When web is added, a cross-platform entitlement sync story is needed so users subscribing on one platform are recognized on the other.
- Quota metering (`middleware/metering.ts`) is payment-provider agnostic — reads from KV, doesn't care about payment source. This is the key architectural isolation point.
- See `docs/epics.md` Epic 9 — **COMPLETE** (2026-03-27). RevenueCat SDK integrated, store connections blocked by account issues (see `project_revenuecat_setup.md`).
