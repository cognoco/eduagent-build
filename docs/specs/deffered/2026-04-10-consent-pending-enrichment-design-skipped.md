# ACCOUNT-22: Consent Pending Gate Enrichment

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` ACCOUNT-22

## Problem

The consent pending gate blocks the entire `(app)` tab navigator. While it has polling (15s interval), "Check again," "Resend email," and two static preview screens (subject browser, sample coaching), it still feels like a dead waiting room. The previews are hardcoded static content, there's no time estimate, and the child has no sense of progress.

## Current State

- Gate renders in `_layout.tsx`, replacing the entire `<Tabs>` navigator
- Two sub-states: PENDING (no email sent yet) and PARENTAL_CONSENT_REQUESTED (waiting)
- Preview screens: `PreviewSubjectBrowser` (4 hardcoded subjects) and `PreviewSampleCoaching` (static mockup)
- 15-second polling interval via `setInterval`
- "Resend email" and "Change email" options available
- Post-approval: celebration screen + "Let's Go" button

## Solution

### 1. Add time expectation messaging

After the email is sent, add a friendly timing cue:

"Most parents respond within a few hours. We'll check automatically — you don't need to keep the app open."

This sets expectations and reduces anxiety about whether the system is working.

### 2. Make preview screens more engaging

**PreviewSubjectBrowser** — expand from 4 hardcoded subjects to 8-10, organized in a simple grid. Add a header: "Here's a taste of what you'll be able to learn." Keep it static (no API calls — the child has no profile access yet).

**PreviewSampleCoaching** — replace the bullet-point feature list with an animated mock conversation (2-3 pre-written message bubbles appearing sequentially with typing indicator animation). This gives a visceral sense of what the learning experience feels like. All content is static/local — no API calls.

### 3. Add a third preview: "How it works" walkthrough

A simple 3-step visual explainer:

1. "Pick what you want to learn" (subject icon)
2. "Chat with your mentor" (chat bubble icon)  
3. "Track your progress" (chart icon)

This gives the child something to anticipate and reduces the "what even is this app?" feeling while they wait.

### 4. Progress indicator on the waiting screen

Show a simple visual status:

- Checkmark: "Account created"
- Checkmark: "Consent link sent to {email}"
- Spinner: "Waiting for parent approval"

This progress ladder gives the child a sense of where they are in the process, even though step 3 is externally blocked.

## Scope Exclusions

- **Real data access while pending** — blocked by design (GDPR). The child cannot access real learning content before consent. Static previews only.
- **Push notification on approval** — would be nice but requires push token registration before full app access. Deferred. The 15-second poll is sufficient for catching approval quickly.
- **Reducing poll interval** — 15 seconds is already aggressive enough. Not changing.

## Files Touched

- `apps/mobile/src/app/(app)/_layout.tsx` — `ConsentPendingGate`: time estimate copy, progress ladder, third preview entry point
- `apps/mobile/src/components/consent/PreviewSubjectBrowser.tsx` — expand subject list (extract from `_layout.tsx` if not already separate)
- `apps/mobile/src/components/consent/PreviewSampleCoaching.tsx` — animated mock conversation
- `apps/mobile/src/components/consent/PreviewHowItWorks.tsx` — new 3-step walkthrough component

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Child gets bored and leaves | App backgrounded | Poll pauses (interval clears on unmount) | Poll resumes on return; push notification possible future enhancement |
| Email never arrives | Spam filter, typo | "Resend email" + "Change email" options (already exist) | Change email resets resend counter |
| Parent denies consent | "Deny" on web page | `ConsentWithdrawnGate` replaces pending gate | "Your account is being closed" message, sign out option |
| Approval happens during preview | Poll fires while child is in PreviewSubjectBrowser | Next return to gate triggers post-approval celebration | Seamless transition |
