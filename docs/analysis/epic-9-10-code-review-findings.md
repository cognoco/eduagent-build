# Epic 9 + Epic 10 Code Review Findings

Date: 2026-04-02
Updated: 2026-04-03 — all findings resolved

## Status

All previously tracked Epic 9 + Epic 10 issues are now resolved.

## Resolved on 2026-04-02

### 1. RevenueCat cancellation now preserves cancel-at-period-end behavior

- `apps/api/src/routes/revenuecat-webhook.ts` now keeps cancelled store subscriptions in `active` state with `cancelledAt` set.
- That restores the mobile `Cancelling` badge and `Access until ...` UX path.

### 2. Subscription purchases now refresh API-backed state

- `apps/mobile/src/app/(learner)/subscription.tsx` now refetches subscription and usage data after successful purchase and restore flows.

### 3. Family-plan UI now shows live shared-pool details

- `apps/mobile/src/hooks/use-subscription.ts` now exposes `useFamilySubscription()`.
- `apps/mobile/src/app/(learner)/subscription.tsx` now shows connected-profile count, remaining shared questions, and family members for family subscriptions.
- The static family copy was corrected from 5 child profiles to 4.

### 4. Consent delivery status is now surfaced in mobile

- `packages/schemas/src/consent.ts` now includes `emailStatus`.
- `apps/mobile/src/app/consent.tsx` now branches the success state on `sent` vs `failed` instead of always claiming the email was delivered.

### 5. Expo app config now includes `privacyPolicyUrl`

- `apps/mobile/app.json` now declares a privacy policy URL for App Store compliance.

### 6. The rating-prompt hook is now wired into session-summary

- `apps/mobile/src/app/session-summary/[sessionId].tsx` now calls `useRatingPrompt()` on recall-style summary exits.
- `packages/schemas/src/sessions.ts` and `apps/api/src/services/session.ts` now expose transcript `verificationType` so the summary screen can detect recall sessions.

## Resolved on 2026-04-03

### 7. Ambiguous first-message subject classification now shows disambiguation picker

- Epic/story: Epic 10, Story 10.22.
- When classification returns multiple candidates with `needsConfirmation: true`, the session flow now pauses before `ensureSession`, shows a natural disambiguation prompt ("This sounds like it could be **Math** or **Physics**. Which one are we working on?"), and renders tappable subject candidate buttons.
- Tapping a candidate resolves the subject, adds a user message, and replays the buffered first message to start the session with the correct subject.
- Chat input is disabled during disambiguation to prevent premature messages.
- Single low-confidence candidate still falls back to freeform + "Wrong subject" chip (existing behavior preserved).

## Notes

- Epic 9 RevenueCat SDK usage, restore-purchases flow, manage-billing deep links, and top-up polling remain materially wired up.
- Epic 10 consent unification and age-gated Sentry continue to look materially implemented.
