# MMT-ADR-0004 — Mobile billing via RevenueCat IAP; Stripe kept dormant for web

**Status:** Accepted (Epic 9, 2026-03-27) · **Formalized:** 2026-06-03 (Phase-C seed) · **Scope:** Billing / payments provider · **Deciders:** PM + Claude

> **Provenance note:** this decision was made and shipped in Epic 9 (2026-03-27) but never had a record in canon — it lived only in `.claude/memory/billing-payments.md` (Claude-only, invisible to Codex) while `docs/architecture.md` and `docs/PRD.md` still implied Stripe. This ADR formalizes it from that contemporaneous memory record (not reverse-engineered) and is one of the three Phase-C seed ADRs proving the decisions layer. It is a **MUST**-extract case: memory-only **and** drifting across ≥2 sources.

## Context

The original architecture (`docs/architecture.md`) and PRD specified **Stripe** as the sole payment provider; the entire billing stack — routes, services, webhook handler, Inngest jobs — was built around Stripe web checkout.

**Stripe web checkout is rejected by both the Apple App Store and Google Play for digital services** (AI tutoring must use native in-app purchase). A web-checkout-only billing stack could not ship in the mobile binaries that are the launch surface.

## Decision

- **Mobile (live):** RevenueCat (`react-native-purchases`) wrapping Apple StoreKit 2 + Google Play Billing is the payment path for the mobile launch.
- **Web (future, dormant):** Stripe code is **kept in place, not deleted.** It activates when a web client is added post-launch (2.9% fee vs. 30% IAP), and is also the path for future B2B/school licensing and promotional credits. No abstraction layer is built now — Stripe simply stays dormant.
- **Strategy:** mobile-first launch; add the web client only if the product succeeds.

## Consequences

- **Top-up credits are granted server-side only** — never from the client purchase callback. Credits are granted on the RevenueCat **webhook** confirmation (Apple/Google can delay confirmations). A client-side grant is a double-spend / fraud vector.
- **Family billing works around a platform limitation:** Apple Family Sharing does **not** support consumable IAP, so top-ups are purchased individually and the API credits them to a **shared family pool** by family-group membership. *(This intersects the Payer / Organization model — see MMT-ADR-0002; the clean cut must keep the shared-pool crediting expressible on the new Organization seam.)*
- **Grace periods are platform-controlled** — the PRD's "3-day grace period" is invalid for IAP (Apple 16–60 days configurable, Google up to 30). Entitlement logic must read the platform grace state, not a fixed window.
- **The isolation point is quota metering:** `middleware/metering.ts` is payment-provider-agnostic — it reads entitlement/quota from KV and does not care about the payment source. This is what lets Stripe stay dormant without a compatibility shim, and what a future cross-platform entitlement-sync story will build on.
- **Do not** provision Stripe secrets for mobile staging/production billing; **do not** remove Stripe code.

## Alternatives considered

1. **Stripe web checkout only (the original spec).** Rejected — rejected by both app stores for digital goods; cannot ship in the mobile launch binaries.
2. **Delete Stripe, RevenueCat only.** Rejected — discards the cheaper web rail (2.9% vs. 30%) and the B2B/promo paths for no present benefit; dormant code costs nothing while no web client exists.
3. **Build a payment-provider abstraction layer now.** Rejected — speculative; there is one live provider. The provider-agnostic *metering* boundary is the only isolation actually needed today.
