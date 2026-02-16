# UX Gap Resolution Plan v3 — Persona Walkthrough Audit

**Date:** 2024-12-11
**Source:** Party Mode persona walkthrough (Emma 14yo German, Marcus 28yo US, Dr. Chen 45yo parent)
**Previous Plans:** v1 (28 gaps), v2 (14 gaps) — both implemented

---

## Executive Summary

Three personas walked the complete app flow from Welcome screen through learning, quizzing, and close/reopen. Found **3 critical gaps**, **2 high-priority inconsistencies**, and **2 medium observations**.

---

## Gaps Found

### CRITICAL (Missing Screens/Flows)

| # | Gap | Persona | Impact |
|---|-----|---------|--------|
| C1 | **Post-Approval Landing Screen for Child** | Emma | After parent approves GDPR consent, child gets notification but no wireframe shows what screen they land on |
| C2 | **Account Owner Home Screen** | Dr. Chen | Parent who takes over account has nowhere to land; flow ends at "Go to Child's Profile" |
| C3 | **Child-Triggered Paywall Alternative** | Emma/Dr. Chen | When trial expires for family account, child sees adult paywall instead of "Ask Parent to Subscribe" |

### HIGH PRIORITY (Inconsistencies)

| # | Gap | Location | Issue |
|---|-----|----------|-------|
| H1 | **Preview Mode Button Missing** | Pending Consent Screen (line 3571) vs Preview Mode (line 3890) | Two wireframes don't connect |
| H2 | **Language Selector Default** | Welcome Screen | Not specified if defaults to device locale or English |

### MEDIUM (Observations)

| # | Observation | Discussion |
|---|-------------|------------|
| M1 | **Welcome + Intent Screen Redundancy** | Welcome shows two paths but requires extra tap to Intent Screen |
| M2 | **Gender Question Value** | Marked "analytics only" but analytics value unclear |

---

## Resolution Plan

### Task C1: Post-Approval Landing Screen

**Location:** Add after Parent Consent Confirmation section (line ~3942)

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────┐
│  POST-APPROVAL: CHILD LANDING SCREEN                             │
│  (Route: /approved-welcome)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONTEXT: Child opens app after parent approved GDPR consent     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  🎉 You're approved!                                     │    │
│  │                                                          │    │
│  │  Your parent gave the green light.                       │    │
│  │  Time to start learning!                                 │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │           [Let's Go! →]                      │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  BEHAVIOR:                                                       │
│  • Shown ONCE when child first opens app after approval          │
│  • Tapping "Let's Go" → Intent Screen (normal flow continues)    │
│  • If child already saw Welcome Message → skip to Intent Screen  │
│  • Flag in user record: post_approval_seen = true                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Task C2: Account Owner Landing Options

**Location:** Update Parent Account Takeover Flow (line ~3870)

**Change:** After "Family account ready!" screen, provide TWO buttons:

```
┌─────────────────────────────────────────────────────────────────┐
│  PARENT ACCOUNT TAKEOVER: STEP 2 (Updated)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  ✅ Family account ready!                                │    │
│  │                                                          │    │
│  │  YOUR FAMILY:                                            │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │    │
│  │  │    👤      │  │    🦊      │  │    ➕      │         │    │
│  │  │   You      │  │  [Child]   │  │    Add     │         │    │
│  │  │  (Owner)   │  │            │  │   More     │         │    │
│  │  └────────────┘  └────────────┘  └────────────┘         │    │
│  │                                                          │    │
│  │  What would you like to do?                              │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  [See [Child]'s Progress →]                  │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  [Start My Own Learning →]                   │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  [Close — I'll explore later]                │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  BUTTON BEHAVIOR:                                                │
│  • "See Child's Progress" → Switch to child profile, Home Screen │
│  • "Start My Own Learning" → Stay as parent, Intent Screen       │
│  • "Close" → End web session, parent can open app later          │
│                                                                  │
│  NOTE: Parent opened this from EMAIL LINK in browser.            │
│  If they want the app, show smart banner:                        │
│  "📱 Download the app for the best experience"                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Task C3: Child-Friendly Paywall

**Location:** Add after Soft Paywall section (line ~6365)

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────┐
│  FAMILY ACCOUNT PAYWALL (Child Profile View)                     │
│  (Route: /paywall — shown when profile.is_child = true)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONTEXT: Trial expired, child profile tries to start session    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  📚 Your free trial has ended                            │    │
│  │                                                          │    │
│  │  You learned 4 topics and earned 120 XP — nice work!    │    │
│  │                                                          │    │
│  │  To keep learning, ask your parent to subscribe.         │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │       [Notify My Parent →]                   │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ────────────────────────────────────────────────────   │    │
│  │                                                          │    │
│  │  While you wait, you can:                                │    │
│  │  • Review your Learning Book (read-only)                 │    │
│  │  • See your progress and achievements                    │    │
│  │                                                          │    │
│  │  [Go to Learning Book]                                   │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  "NOTIFY PARENT" BEHAVIOR:                                       │
│  1. Sends push notification to account owner (parent)            │
│  2. Also sends email: "[Child] wants to keep learning!"          │
│  3. Email contains direct link to subscription page              │
│  4. Child sees: "We've let your parent know! ✓"                  │
│  5. Rate limit: 1 notification per 24 hours                      │
│                                                                  │
│  PARENT EMAIL CONTENT:                                           │
│  Subject: "[Child Name] wants to keep learning on EduAgent!"     │
│  Body:                                                           │
│  - Child's learning stats (topics, XP, time spent)               │
│  - "Their free trial has ended. Subscribe to continue."          │
│  - [Subscribe Now] button → Stripe Checkout                      │
│                                                                  │
│  DETECTION LOGIC:                                                │
│  IF subscription_status = 'expired' OR 'trialing_ended'          │
│  AND profile has account_owner_id != profile.id (child profile)  │
│  THEN show Child-Friendly Paywall                                │
│  ELSE show standard Soft Paywall                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Task H1: Connect Preview Mode to Pending Consent Screen

**Location:** Update Pending Consent Screen (line ~3571)

**Change:** Add Preview Mode button to the existing wireframe:

```
Replace lines 3586-3593:

OLD:
│  │  Haven't received the email?                            │    │
│  │  [Resend Email]  •  [Change Email Address]              │    │
│  │                                                          │    │
│  │  ℹ️ You can close this app — we'll notify you when       │    │
│  │     your account is approved!                            │    │

NEW:
│  │  While you wait:                                         │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  [👀 Preview the App]                        │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │  Browse subjects, see how it works (read-only)           │    │
│  │                                                          │    │
│  │  ────────────────────────────────────────────────────   │    │
│  │                                                          │    │
│  │  Haven't received the email?                             │    │
│  │  [Resend Email]  •  [Change Email Address]               │    │
│  │                                                          │    │
│  │  ℹ️ Close the app — we'll notify you when approved!      │    │
```

---

### Task H2: Language Selector Default Behavior

**Location:** Update Welcome Screen notes (line ~3264)

**Add to NOTES section:**

```
│  LANGUAGE SELECTOR BEHAVIOR:                                     │
│  • Default: Device locale if supported (DE/EN/ES/FR/PL)          │
│  • Fallback: English if device locale not in supported list      │
│  • User can change anytime; persists in ui_language field        │
│  • First-time detection: navigator.language or device settings   │
```

---

### Task M1: Welcome + Intent Screen (Document Decision)

**Decision:** Keep separate screens.

**Rationale:**
- Welcome Message is a "celebration moment" after signup
- Intent Screen is a "decision point" that returns for every new subject
- Combining would make Intent Screen too heavy for returning users
- Progressive disclosure research supports single-task screens

**Action:** Add note to Welcome Message wireframe explaining this is intentional.

---

### Task M2: Gender Question (Document Decision)

**Decision:** Keep as optional, document analytics use.

**Rationale:**
- Some users expect to see this (establishes trust)
- Analytics: Conversion rates by gender, learning style correlations
- Marked optional and "skip" is prominent
- Not used for AI behavior (documented)

**Action:** No wireframe change needed. Already documented as "analytics only."

---

## Implementation Order

| Priority | Task | Effort | Files |
|----------|------|--------|-------|
| 1 | C3: Child-Friendly Paywall | Medium | PRE_MVP_PROTOTYPE.md |
| 2 | C1: Post-Approval Landing | Low | PRE_MVP_PROTOTYPE.md |
| 3 | C2: Account Owner Landing | Low | PRE_MVP_PROTOTYPE.md |
| 4 | H1: Preview Mode Connection | Low | PRE_MVP_PROTOTYPE.md |
| 5 | H2: Language Selector Default | Low | PRE_MVP_PROTOTYPE.md |
| 6 | M1/M2: Document Decisions | Low | PRE_MVP_PROTOTYPE.md |

---

## Positive Findings (No Action Needed)

These aspects of the UX were validated as working well:

1. **Interview Duration Notice** — "~3 minutes" helps set expectations
2. **Session Resume Flow** — AI correctly remembers context when returning
3. **OAuth Pre-fill** — Name and photo handling is smooth
4. **Age-Derived Confirmation** — Eliminates redundant checkbox
5. **Adult Flow (Marcus)** — Complete walkthrough had no issues
6. **Multi-path Home Screen** — Priority rules work correctly

---

## Document History

| Date | Version | Change |
|------|---------|--------|
| 2024-12-11 | 3.0 | Persona walkthrough audit: 3 critical gaps, 2 high priority, 2 medium observations |
