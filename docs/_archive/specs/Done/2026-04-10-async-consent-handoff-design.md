# ACCOUNT-20: Async Child-to-Parent Consent Handoff

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` ACCOUNT-20

## Problem

The consent flow requires the child to physically hand their phone to a parent ("Hand your phone to your parent or guardian"). The parent enters their email on the child's device, and a consent link is emailed. In reality, families are often not in the same room when the child signs up. The physical handoff is an unnecessary bottleneck — the child usually knows their parent's email.

## Current Flow

1. Child creates profile → `consentStatus: 'PENDING'` → redirected to `/consent`
2. Phase 1 ('child'): "Hand your phone to your parent" + "I'm the parent" button
3. Phase 2 ('parent'): Parent enters email, taps "Send consent link"
4. Phase 3 ('success'): "Hand back to your child" + done
5. Parent receives email → web consent page → approve/deny

The only thing the parent does on-device is **type their email**. The actual consent decision happens async via the email link. The phone handoff adds no security — it's ceremony.

## Solution

### 1. Let the child enter the parent's email directly

Replace the two-phase handoff with a single screen:

- Title: "Almost there!"
- Copy: "We need your parent or guardian to say it's OK. Enter their email and we'll send them a quick link."
- `TextInput` for parent email (with same-email validation — can't use child's own email)
- "Send link to my parent" primary button
- Subtext: "Your parent will get an email with a link to approve your account."

This eliminates the awkward "hand your phone" step entirely. The consent link and web consent page are unchanged — the security model (email verification + web decision page) is identical.

### 2. Keep the "I'm here with my parent" option

Below the email input, add a secondary link: "My parent is here with me" which opens the current Phase 2 (parent enters email themselves). This preserves the existing flow for families who ARE together.

**Why keep both:** Some parents may prefer to enter their own email (trust/verification). Making it optional rather than removing it is the safer UX choice.

### 3. Messaging adjustments

**After email is sent (success state):**

Current: "Hand back to your child"

New: "Link sent! Your parent will get an email at {email}. We'll let you know as soon as they approve."

CTA: "Got it" → navigates to the consent pending gate (which already has the waiting UI, polling, and preview surfaces).

## Scope Exclusions

- **QR code / deep link sharing** — over-engineered for this flow. Email is the consent mechanism; the parent needs to verify via email anyway.
- **Push notification to parent** — would require the parent to already have the app installed and a profile. Not applicable during initial consent.
- **SMS consent** — would require phone number collection and SMS infrastructure. Not justified.

## Files Touched

- `apps/mobile/src/app/consent.tsx` — restructure phases: child can enter email directly, optional "parent is here" toggle
- `apps/mobile/src/app/consent.test.tsx` — tests for child-enters-email flow, parent-is-here fallback

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Child enters wrong email | Typo or wrong parent | Consent link goes to wrong address | "Send to a different email" on consent pending gate (already exists, max 3 resends per email) |
| Child enters own email | Same-email validation | Inline warning, submit blocked | Must enter a different email |
| Email delivery fails | Resend API error | Error toast + retry | "Resend email" button on pending gate |
| Parent never responds | Email ignored | Reminder emails at day 7/14/25 (already implemented via Inngest cron) | Auto-deletion at day 30 |
