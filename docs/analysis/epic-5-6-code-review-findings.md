# Epic 5 + Epic 6 Code Review Findings

Date: 2026-04-02
Updated: 2026-04-02 after implementation follow-up

## Status

Epic 5 review follow-up is closed for the issues that were previously tracked in the mixed gap-analysis document.

Epic 6 remains intentionally deferred to v1.1 and is still not treated as a launch blocker.

## Resolved on 2026-04-02

### 1. Stripe expiry now downgrades entitlements correctly

- `apps/api/src/routes/stripe-webhook.ts` now forces expired subscriptions back to the Free tier and updates the quota pool to Free limits.
- This closes the entitlement leak where an expired Stripe subscription could keep paid monthly limits.

### 2. Family membership no longer re-parents profiles across accounts

- `apps/api/src/services/billing.ts` now rejects cross-account family add/remove flows instead of trusting caller-supplied account IDs.
- That preserves account boundaries until a real invite/claim flow exists.

### 3. Free tier is back at the Epic 5 contract of 50 questions per month

- Free-tier defaults now resolve from `getTierConfig('free')` across billing responses, metering fallbacks, factories, and seed data.
- The learner subscription screen copy was updated to match the shipped 50/month cap.

### 4. Trial reminders now target the owner profile instead of the account id

- `apps/api/src/inngest/functions/trial-expiry.ts` now resolves the account owner profile before sending trial warning and soft-landing push notifications.
- This restores push-token lookup correctness.

### 5. The BYOK waitlist is visible again in the learner subscription screen

- `apps/mobile/src/app/(learner)/subscription.tsx` now exposes the waitlist form and submission flow.
- Coverage was added for success and failure paths.

## Notes

- Epic 5 RevenueCat purchase/restore hooks, top-up credit grants, KV-backed quota reads, and the child-trial paywall remain materially wired up.
- Epic 6 still appears intentionally deferred rather than half-shipped. `docs/epics.md` and `docs/architecture.md` continue to treat language learning as v1.1 work.
- Epic 9 + Epic 10 findings now live in `docs/analysis/epic-9-10-code-review-findings.md`.
