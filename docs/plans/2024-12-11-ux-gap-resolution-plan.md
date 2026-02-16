# UX Gap Resolution Plan

> **Created:** 2024-12-11
> **Source:** Party mode review + Persona walkthroughs (Emma 14yo, Marcus 28yo, Dr. Chen 45yo parent)
> **Total Gaps:** 28 + 4 contradictions
> **Documents Affected:** PRE_MVP_PROTOTYPE.md, PRD.md, MVP_DEFINITION.md, DATA_MODEL.md

---

## Executive Summary

Three persona walkthroughs revealed 28 UX gaps and 4 logical contradictions. This plan organizes fixes into 7 phases by solution type for efficient batch editing.

**Critical blockers (5):** Security, legal compliance, missing wireframes
**High priority (6):** Significant UX/functionality gaps
**Medium priority (9):** UX improvements
**Low priority (8):** Polish and clarifications

---

## Gap Inventory (Prioritized)

### CRITICAL - Blocks MVP Launch

| # | Gap | Type | Resolution |
|---|-----|------|------------|
| 20 | Subject Input Screen wireframe MISSING | Contradiction | Create new wireframe |
| 27 | Profile switch has no authentication | Security | Add PIN/biometric screen |
| 4 | Apple Private Relay emails unhandled | iOS blocker | Define handling strategy |
| 14 | Parent email = user email not validated | Security | Add validation rule |
| 8 | GDPR consent revocation missing | Legal | Add revocation mechanism |

### HIGH - Significant Functionality Gaps

| # | Gap | Type | Resolution |
|---|-----|------|------------|
| 13 | Multi-profile subscription lapse undefined | Flow | Define lapse behavior |
| 10 | "Problems worked through" placement unclear | Contradiction | Add to Learning Book wireframe |
| 3 | Pending consent state not in state machine | Flow | Add state diagram |
| 11 | Consent token expiry (day 8+) unhandled | Flow | Define expiry rules |
| 25 | Parent-created child consent UX unclear | Flow | Add consent checkbox |
| 22 | Recall email deep link handling undefined | Flow | Define deep link behavior |

### MEDIUM - UX Improvements

| # | Gap | Type | Resolution |
|---|-----|------|------------|
| 7 | Active path + homework in different subject | Contradiction | Define coexistence rules |
| 18 | Intent Screen shown too often (fatigue) | UX | Define when to show |
| 15 | No preview mode while awaiting consent | UX | Add limited preview |
| 23 | XP decay on failed recall undefined | Gamification | Define decay rules |
| 24 | Cancel subscription flow missing | Wireframe | Create flow |
| 26 | Under-11 child profile creation policy | Policy | Define age rules for family |
| 28 | Parent notifications for child activity | Feature | Define notification types |
| 9 | Parent email storage location undefined | Schema | Add to data model |

### LOW - Polish & Clarifications

| # | Gap | Type | Resolution |
|---|-----|------|------------|
| 1 | Photo upload error handling | UX | Add error states |
| 2 | Progressive disclosure (8+ screens) | UX | Add note |
| 5 | Terms before Avatar (wrong order) | Order | Swap screens |
| 6 | Timeline re-estimation needed | Planning | Recalculate |
| 12 | Photo upload limits undefined | Spec | Add limits |
| 16 | Subject dropdown unclear (free-text vs select) | Spec | Clarify |
| 17 | Photo processing loading state missing | UX | Add state |
| 19 | Google/Apple photo vs Avatar screen logic | Flow | Clarify |
| 21 | Summary character limit undefined | Spec | Add limit |

---

## Contradictions to Resolve

| # | Contradiction | Resolution |
|---|---------------|------------|
| C1 | Subject Input Screen referenced but not defined | Create Screen 7 wireframe |
| C2 | Age 11+ enforced but parent creates profiles | Family profiles follow same 11+ rule |
| C3 | "Problems worked through" location unclear | Add dedicated section to Learning Book |
| C4 | Intent Screen vs Quick Actions redundant | Quick Actions bypass Intent Screen |

---

## Execution Plan

### Phase 1: Critical Blockers (MUST DO FIRST)

**Gaps:** #20, #27, #4, #14, #8

#### Task 1.1: Create Subject Input Screen Wireframe
**File:** PRE_MVP_PROTOTYPE.md (after Intent Screen ~line 3400)

```
Screen: Subject Input (Route: /learn/new)

PURPOSE: Capture what user wants to learn before starting interview

WIREFRAME:
┌─────────────────────────────────────────────────────────────────┐
│  What would you like to learn?                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Type any subject...                               🔍   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  POPULAR SUBJECTS:                                               │
│  [Python] [JavaScript] [Spanish] [Math] [Physics]                │
│  [Chemistry] [History] [Economics] [Machine Learning]            │
│                                                                  │
│  RECENT (if returning user):                                     │
│  [📚 Python Fundamentals - continue]                             │
│                                                                  │
│              [Let's Go →]                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

IMPLEMENTATION:
• Free-text input (NOT dropdown) - any subject accepted
• Popular subjects as quick-tap suggestions
• Validate: minimum 2 characters
• After submit → Interview Screen
```

#### Task 1.2: Add Profile Switch Authentication
**File:** PRE_MVP_PROTOTYPE.md (after Profile Switcher ~line 3678)

```
Screen: Profile Switch PIN (Route: /profiles/switch)

PURPOSE: Prevent unauthorized profile access (child accessing parent profile)

WIREFRAME:
┌─────────────────────────────────────────────────────────────────┐
│  Switch to [Parent Name]'s Profile                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Enter PIN to continue:                                          │
│                                                                  │
│           ┌───┐ ┌───┐ ┌───┐ ┌───┐                               │
│           │ • │ │ • │ │   │ │   │                               │
│           └───┘ └───┘ └───┘ └───┘                               │
│                                                                  │
│  ┌───┐ ┌───┐ ┌───┐                                              │
│  │ 1 │ │ 2 │ │ 3 │                                              │
│  └───┘ └───┘ └───┘                                              │
│  ┌───┐ ┌───┐ ┌───┐                                              │
│  │ 4 │ │ 5 │ │ 6 │                                              │
│  └───┘ └───┘ └───┘                                              │
│  ┌───┐ ┌───┐ ┌───┐                                              │
│  │ 7 │ │ 8 │ │ 9 │                                              │
│  └───┘ └───┘ └───┘                                              │
│  ┌───┐ ┌───┐ ┌───┐                                              │
│  │ ← │ │ 0 │ │ ✓ │                                              │
│  └───┘ └───┘ └───┘                                              │
│                                                                  │
│  [Use Face ID / Touch ID instead]                                │
│                                                                  │
│  [← Back to Profile Selection]                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

RULES:
• PIN required ONLY when switching TO adult/parent profiles
• Switching TO child profiles: No PIN required (parent can access freely)
• PIN set during account creation (default: none, prompt on first child profile creation)
• 3 failed attempts → locked for 1 minute
• Biometric auth available if device supports
```

#### Task 1.3: Define Apple Private Relay Handling
**File:** PRE_MVP_PROTOTYPE.md (new section after OAuth Complete Profile)

```
┌─────────────────────────────────────────────────────────────────┐
│  APPLE PRIVATE RELAY HANDLING                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM:                                                        │
│  Apple Sign-In allows users to hide their real email.            │
│  User gets: xyz123@privaterelay.appleid.com                      │
│  Our emails to this address ARE delivered (Apple forwards them). │
│                                                                  │
│  IMPACT ON PARENTAL CONSENT:                                     │
│  If child signs up with Apple + Private Relay, then enters       │
│  parent email, we can still send consent email to parent.        │
│  → No special handling needed for consent flow.                  │
│                                                                  │
│  IMPACT ON USER COMMUNICATION:                                   │
│  • Marketing emails: Work via Private Relay                      │
│  • Recall reminders: Work via Private Relay                      │
│  • Password reset: Works via Private Relay                       │
│                                                                  │
│  RECOMMENDATION:                                                 │
│  No special handling required for MVP.                           │
│  Apple Private Relay forwards all emails correctly.              │
│                                                                  │
│  EDGE CASE:                                                      │
│  If user's Apple email = parent's Apple email (same person),     │
│  validation catches this (Task 1.4).                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 1.4: Add Parent Email Validation
**File:** PRE_MVP_PROTOTYPE.md (in Parental Consent screen ~line 3220)

```
VALIDATION RULES (add to existing):
• parent_email ≠ user_email (case-insensitive)
  - Error: "Please enter your parent's email, not your own"
• parent_email must be different domain if user used gmail/apple relay
  - Warning (not blocking): "This looks like your email. Are you sure?"
• No validation that parent is actually a parent (impossible to verify)
```

#### Task 1.5: Add GDPR Consent Revocation Mechanism
**File:** PRE_MVP_PROTOTYPE.md (new section after Parental Consent)
**File:** PRD.md (add to Epic 0)
**File:** DATA_MODEL.md (add consent_revoked field)

```
┌─────────────────────────────────────────────────────────────────┐
│  GDPR CONSENT REVOCATION (Article 7.3)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REQUIREMENT:                                                    │
│  "The data subject shall have the right to withdraw consent      │
│   at any time... It shall be as easy to withdraw as to give."    │
│                                                                  │
│  IMPLEMENTATION:                                                 │
│                                                                  │
│  1. PARENT EMAIL FOOTER:                                         │
│     Every email to parent includes:                              │
│     "Manage consent: [Revoke consent for {child_name}]"          │
│                                                                  │
│  2. REVOCATION LINK FLOW:                                        │
│     Parent clicks link → Confirmation page:                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  Revoke consent for [Mia]'s EduAgent account?        │     │
│     │                                                      │     │
│     │  This will:                                          │     │
│     │  • Immediately suspend [Mia]'s access                │     │
│     │  • Delete all learning data within 30 days           │     │
│     │  • Cannot be undone                                  │     │
│     │                                                      │     │
│     │  [Revoke Consent]     [Cancel]                       │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                  │
│  3. AFTER REVOCATION:                                            │
│     • Child profile status → "consent_revoked"                   │
│     • Child sees: "Your parent has revoked access. Talk to them."│
│     • Data deletion scheduled (30 days, per GDPR)                │
│     • Parent can re-consent within 30 days to restore            │
│                                                                  │
│  4. SCHEMA:                                                      │
│     users table:                                                 │
│     + parental_consent_revoked_at: timestamp (nullable)          │
│     + parental_consent_revoked_by: email                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 2: State Machine & Flow Logic

**Gaps:** #3, #11, #13, #7, #18, #26

#### Task 2.1: Add User State Machine Diagram
**File:** PRE_MVP_PROTOTYPE.md (new section in Technical Specification)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ACCOUNT STATE MACHINE                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │   signup     │ (User begins registration)                    │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │   active     │◄───│pending_consent│ (11-15 + EU)            │
│  └──────┬───────┘    └──────┬───────┘                          │
│         │                   │                                    │
│         │                   │ consent_declined OR                │
│         │                   │ consent_expired (7 days)           │
│         │                   ▼                                    │
│         │            ┌──────────────┐                           │
│         │            │consent_denied│ → data deleted 30 days    │
│         │            └──────────────┘                           │
│         │                                                        │
│         │ subscription_lapsed                                    │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │  free_tier   │ (downgraded, all profiles affected)          │
│  └──────┬───────┘                                               │
│         │                                                        │
│         │ consent_revoked (parent action)                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   revoked    │ → data deleted 30 days                        │
│  └──────────────┘                                               │
│                                                                  │
│  VALID STATES:                                                   │
│  • signup: Registration in progress                              │
│  • pending_consent: Waiting for parental approval (11-15 EU)     │
│  • consent_denied: Parent declined or token expired              │
│  • active: Full access (free or premium)                         │
│  • free_tier: Subscription lapsed, limited access                │
│  • revoked: Parent revoked consent post-approval                 │
│  • deleted: Account deletion requested                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 2.2: Define Consent Token Expiry Handling
**File:** PRE_MVP_PROTOTYPE.md (in Parental Consent section)

```
CONSENT TOKEN LIFECYCLE:

Day 0: Token created, email sent to parent
Day 3: Reminder email #1 if not acted
Day 6: Reminder email #2 (final warning)
Day 7: Token expires
Day 8+:
  • Child sees: "Your parent didn't respond in time"
  • Options: [Resend to same email] [Use different email]
  • Resend creates NEW 7-day token
  • Old token invalidated

EXPIRED TOKEN CLICK:
If parent clicks expired link:
  "This link has expired. Ask [child_name] to resend the request."

MAXIMUM ATTEMPTS:
• 3 consent request attempts per email address
• After 3 failures: "Contact support@eduagent.com"
```

#### Task 2.3: Define Multi-Profile Subscription Lapse
**File:** PRE_MVP_PROTOTYPE.md (in Multi-Profile section)

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION LAPSE HANDLING (Multi-Profile)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIGGER: Payment fails, grace period ends                       │
│                                                                  │
│  IMPACT:                                                         │
│  • ALL profiles under the account downgrade to free tier         │
│  • Account owner (parent) sees: "Update payment to restore"      │
│  • Child profiles see: "Ask [Parent Name] to update payment"     │
│                                                                  │
│  FREE TIER LIMITS (apply to ALL profiles):                       │
│  • 3 sessions/day per profile                                    │
│  • No new learning paths (existing continue)                     │
│  • Homework help still available (core value)                    │
│                                                                  │
│  DATA PRESERVED:                                                 │
│  • All progress, XP, summaries retained                          │
│  • Learning paths paused, not deleted                            │
│  • Restore payment → immediate full access                       │
│                                                                  │
│  NOTIFICATION:                                                   │
│  • Email to account owner (parent)                               │
│  • In-app banner for all profiles                                │
│  • Push notification to account owner device                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 2.4: Define Active Path + Homework Coexistence
**File:** PRE_MVP_PROTOTYPE.md (after Homework Help Entry)

```
┌─────────────────────────────────────────────────────────────────┐
│  LEARNING PATH + HOMEWORK HELP COEXISTENCE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Q: Can user have Python learning path while doing Math homework?│
│  A: YES - these are independent.                                 │
│                                                                  │
│  STRUCTURE:                                                      │
│  User can have:                                                  │
│  • Multiple LEARNING PATHS (structured curricula)                │
│  • Multiple HOMEWORK SESSIONS (ad-hoc, no curriculum)            │
│                                                                  │
│  EXAMPLE:                                                        │
│  Emma's profile:                                                 │
│  ├── Learning Paths:                                             │
│  │   ├── Python Fundamentals (42% complete)                      │
│  │   └── Spanish Basics (10% complete)                           │
│  └── Homework Sessions:                                          │
│      ├── Math - Quadratics (Dec 10)                              │
│      └── Physics - Forces (Dec 8)                                │
│                                                                  │
│  HOME SCREEN DISPLAY:                                            │
│  • "Continue Learning" → most recent learning path               │
│  • "Recent Homework" → last 3 homework sessions                  │
│  • "Homework Help" button → new homework session                 │
│                                                                  │
│  HOMEWORK SESSIONS:                                              │
│  • Not counted as "learning paths"                               │
│  • Stored separately in homework_sessions table                  │
│  • Visible in "Problems you worked through"                      │
│  • Subject tagged for organization                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 2.5: Define Intent Screen Display Logic
**File:** PRE_MVP_PROTOTYPE.md (in Intent Screen section)

```
WHEN TO SHOW INTENT SCREEN:

SHOW Intent Screen:
• New user: After Welcome Message (first time ever)
• Returning user: After tapping "➕ New Subject" in Quick Actions

DO NOT SHOW Intent Screen:
• "Homework Help" quick action → straight to Homework Entry
• "Continue Session" → straight to Chat
• "Quiz Me" → straight to Quiz selection
• "Review Notes" → straight to Learning Book

RATIONALE:
Quick Actions are shortcuts. If user explicitly taps "Homework Help",
they've already made the intent choice - don't ask again.
```

#### Task 2.6: Define Under-11 Child Profile Policy
**File:** PRE_MVP_PROTOTYPE.md (in Create New Profile section)

```
AGE POLICY FOR FAMILY PROFILES:

RULE: All profiles must be 11+ (no exceptions)

RATIONALE:
• App designed for 11+ cognitive level
• COPPA compliance (US) requires different handling for <13
• Simpler to enforce consistent age minimum
• Parents can't circumvent with child profiles

UX FOR REJECTION:
If parent enters DOB for child under 11:
┌─────────────────────────────────────────────────────────────┐
│  [Child Name] isn't quite ready yet                          │
│                                                              │
│  EduAgent is designed for learners 11 and older.             │
│  The AI tutor uses concepts and language suited for          │
│  this age group.                                             │
│                                                              │
│  We'd love to have [Child Name] join when they're ready!     │
│                                                              │
│  [← Back]                                                    │
└─────────────────────────────────────────────────────────────┘

FUTURE: Consider EduAgent Kids (6-10) as separate product/mode
```

---

### Phase 3: Wireframe Additions

**Gaps:** #10, #24, #17, #15, #25

#### Task 3.1: Add "Problems Worked Through" to Learning Book
**File:** PRE_MVP_PROTOTYPE.md (update Topic Review wireframe ~line 440)

```
Add this section to Learning Book / Topic Review wireframe:

│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  🎯 PROBLEMS YOU WORKED THROUGH                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  Dec 10: Quadratic equation homework                     │    │
│  │    ✓ AI guided through factoring steps                   │    │
│  │    ✓ You found the solution: x = 3, x = -2               │    │
│  │    ✓ No answers were given — you did the work!           │    │
│  │    [View Session →]                                      │    │
│  │                                                          │    │
│  │  Dec 8: Python function debugging                        │    │
│  │    ✓ AI asked questions about your logic                 │    │
│  │    ✓ You identified the bug in line 12                   │    │
│  │    ✓ No code was written for you                         │    │
│  │    [View Session →]                                      │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ℹ️ These are homework help sessions, not learning path topics   │
│                                                                  │

PLACEMENT:
• Learning Book main view: Separate section at bottom
• Also accessible via Home Screen → "Recent Homework"
```

#### Task 3.2: Add Cancel Subscription Flow
**File:** PRE_MVP_PROTOTYPE.md (after Settings screen)

```
┌─────────────────────────────────────────────────────────────────┐
│  CANCEL SUBSCRIPTION FLOW                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Settings → Subscription → Cancel                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  Are you sure you want to cancel?                        │    │
│  │                                                          │    │
│  │  Your subscription: Premium (€30/month)                  │    │
│  │  Renews: January 15, 2025                                │    │
│  │                                                          │    │
│  │  If you cancel:                                          │    │
│  │  • Access continues until Jan 15                         │    │
│  │  • Then downgrade to free tier (3 sessions/day)          │    │
│  │  • All your progress and data is preserved               │    │
│  │  • You can resubscribe anytime                           │    │
│  │                                                          │    │
│  │  [Keep My Subscription]                                  │    │
│  │                                                          │    │
│  │  [Cancel Subscription →]                                 │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  STEP 2: Quick feedback (optional)                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  We're sorry to see you go!                              │    │
│  │                                                          │    │
│  │  Help us improve — why are you canceling?                │    │
│  │                                                          │    │
│  │  ○ Too expensive                                         │    │
│  │  ○ Not using it enough                                   │    │
│  │  ○ Found a better alternative                            │    │
│  │  ○ Technical issues                                      │    │
│  │  ○ Other: [________________]                             │    │
│  │                                                          │    │
│  │  [Skip]     [Submit & Cancel]                            │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  STEP 3: Confirmation                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  ✓ Subscription canceled                                 │    │
│  │                                                          │    │
│  │  You have premium access until January 15, 2025.         │    │
│  │                                                          │    │
│  │  Changed your mind?                                      │    │
│  │  [Resubscribe] — available anytime                       │    │
│  │                                                          │    │
│  │  [Back to Settings]                                      │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 3.3: Add Photo Processing Loading State
**File:** PRE_MVP_PROTOTYPE.md (in Homework Help Entry ~line 3445)

```
PHOTO UPLOAD STATES:

STATE 1: Uploading
┌─────────────────────────────────────────────────────────┐
│  📷 Uploading photo...                                   │
│  ████████████░░░░░░░░░░ 60%                             │
└─────────────────────────────────────────────────────────┘

STATE 2: Processing
┌─────────────────────────────────────────────────────────┐
│  🔍 Reading your problem...                              │
│  ⏳ This takes a few seconds                             │
└─────────────────────────────────────────────────────────┘

STATE 3: Success
┌─────────────────────────────────────────────────────────┐
│  ✅ Found your problem!                                  │
│  ┌───────────────────────────────────────────────┐      │
│  │  [Thumbnail of uploaded image]                 │      │
│  └───────────────────────────────────────────────┘      │
│  I see: "Solve for x: 2x² + 5x - 3 = 0"                 │
│  Is this correct? [Yes] [No, let me retype]             │
└─────────────────────────────────────────────────────────┘

STATE 4: Error - Unreadable
┌─────────────────────────────────────────────────────────┐
│  ⚠️ Couldn't read this clearly                           │
│                                                          │
│  The photo might be:                                     │
│  • Too blurry                                            │
│  • Too dark                                              │
│  • At an angle                                           │
│                                                          │
│  [📷 Take Another Photo]  [✏️ Type It Instead]           │
└─────────────────────────────────────────────────────────┘

STATE 5: Error - No Problem Found
┌─────────────────────────────────────────────────────────┐
│  🤔 I don't see a problem to solve                       │
│                                                          │
│  Make sure the photo shows the problem clearly.          │
│                                                          │
│  [📷 Try Again]  [✏️ Type It Instead]                    │
└─────────────────────────────────────────────────────────┘
```

#### Task 3.4: Add Preview Mode for Pending Consent
**File:** PRE_MVP_PROTOTYPE.md (in Pending Consent screen)

```
PENDING CONSENT: LIMITED PREVIEW MODE

While waiting for parent approval, child can:
• Browse the app UI (see what it looks like)
• Read "How it works" content
• See sample learning path (read-only)
• NOT start any learning sessions
• NOT chat with AI

PENDING CONSENT SCREEN (Updated):
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  📧 Waiting for approval                                 │
│                                                          │
│  We sent a consent request to:                           │
│  parent@email.com                                        │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │     ⏳ Waiting for your parent/guardian...       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  While you wait, you can:                                │
│  [👀 Preview the App]                                    │
│                                                          │
│  Haven't received the email?                             │
│  [Resend Email]  •  [Change Email Address]               │
│                                                          │
│  ℹ️ Close the app — we'll notify you when approved!      │
│                                                          │
└─────────────────────────────────────────────────────────┘

PREVIEW MODE BEHAVIOR:
• All interactive buttons show tooltip: "Available after approval"
• Sample curriculum displayed with [Locked] badges
• Chat input disabled with message: "Start learning after approval"
```

#### Task 3.5: Add Parent-Created Child Consent Checkbox
**File:** PRE_MVP_PROTOTYPE.md (in Create New Profile flow)

```
UPDATE Create Profile Step 1 for child in EU:

If new profile is 11-15 AND account is EU:

┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Create New Profile                                      │
│                                                          │
│  Name: [Mia]                                             │
│  Born: [March 15, 2012] (12 years old)                   │
│  Type: [📚 School student]                               │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  ☑️ I am this child's parent or legal guardian           │
│     and I consent to their use of EduAgent               │
│     under the terms of our Privacy Policy.               │
│     [Read Privacy Policy]                                │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│              [Create Profile →]                          │
│                                                          │
└─────────────────────────────────────────────────────────┘

NOTE: This checkbox = auto-approval of GDPR consent
(No email verification needed - parent is creating the profile)
```

---

### Phase 4: Clarifications & Polish

**Gaps:** #16, #21, #12, #1, #19, #5, #2

#### Task 4.1: Clarify Subject Input Type
**File:** PRE_MVP_PROTOTYPE.md

```
Add to Subject Input Screen:

INPUT TYPE: Free-text (NOT dropdown)

• User types any subject they want to learn
• Auto-complete suggestions appear after 2 characters
• Popular subjects shown as quick-tap chips
• No restriction on what can be entered
• AI validates viability during interview
```

#### Task 4.2: Define Summary Character Limit
**File:** PRE_MVP_PROTOTYPE.md (in Session End flow)

```
USER SUMMARY REQUIREMENTS:

• Guideline: 3-5 sentences (shown to user)
• Technical limit: 50-1000 characters
• Under 50: "Please write a bit more about what you learned"
• Over 1000: "Great detail! Consider focusing on key points"
• AI evaluates UNDERSTANDING, not length
• Emoji allowed (counts as characters)
```

#### Task 4.3: Add Photo Upload Specifications
**File:** PRE_MVP_PROTOTYPE.md (in Homework Help section)

```
PHOTO UPLOAD SPECIFICATIONS:

File types: JPEG, PNG, HEIC (iOS)
Max size: 10MB
Max dimensions: 4096x4096 (auto-resize larger)
Min dimensions: 200x200 (reject smaller)

Processing:
• Claude Vision API (claude-3-sonnet)
• Timeout: 10 seconds
• Retry once on failure

Error handling:
• Blurry: "Photo is too blurry to read"
• Dark: "Photo is too dark — try better lighting"
• No text found: "I don't see a problem in this photo"
• Multiple problems: "I see several problems — which one?"
```

#### Task 4.4: Clarify OAuth Photo → Avatar Logic
**File:** PRE_MVP_PROTOTYPE.md (in Avatar screen)

```
OAUTH PHOTO HANDLING:

If user signed up with Google/Apple AND has profile photo:
• Avatar screen shows their photo as FIRST option
• "Use my Google/Apple photo" button prominent
• Still show emoji/preset avatars as alternatives
• Photo auto-populated if user doesn't choose

If no OAuth photo available:
• Standard avatar selection (presets + upload)
```

#### Task 4.5: Reorder Terms Before Avatar
**File:** PRE_MVP_PROTOTYPE.md

```
CURRENT ORDER (incorrect):
Screen 3: Learner Profile
Screen 4: Avatar         ← personalization
Screen 5: Terms          ← commitment

CORRECT ORDER (swap 4 and 5):
Screen 3: Learner Profile
Screen 4: Terms          ← commitment FIRST
Screen 5: Avatar         ← personalization after commitment

RATIONALE:
• Get legal commitment before fun personalization
• Prevents users customizing then bouncing at Terms
• Industry standard: terms before optional customization
```

#### Task 4.6: Add Progressive Disclosure Note
**File:** PRE_MVP_PROTOTYPE.md (in Sign-Up Flow section)

```
PROGRESSIVE DISCLOSURE NOTE:

The signup flow has 6-8 screens (depending on GDPR consent).
This is intentional — each screen has ONE focused task.

Research supports:
• Single-task screens have higher completion rates
• Progress indicator ("Step 3 of 6") reduces abandonment
• Each screen < 30 seconds to complete

If user drops off mid-signup:
• Email reminder after 24 hours (if email collected)
• Resume from last completed screen on return
```

---

### Phase 5: New Feature Specifications

**Gaps:** #22, #23, #28

#### Task 5.1: Define Recall Email Deep Links
**File:** PRE_MVP_PROTOTYPE.md (new section in Technical Specification)

```
┌─────────────────────────────────────────────────────────────────┐
│  RECALL EMAIL DEEP LINKS                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EMAIL CONTENT:                                                  │
│  Subject: "Quick check: Do you still remember Functions?"        │
│                                                                  │
│  Body:                                                           │
│  "Hi [Name],                                                     │
│                                                                  │
│   It's been 2 weeks since you learned Functions.                │
│   Take a 2-minute recall check to strengthen your memory.        │
│                                                                  │
│   [Take the Quiz →]                                              │
│                                                                  │
│   Your streak: 🔥 14 days"                                       │
│                                                                  │
│  DEEP LINK FORMAT:                                               │
│  https://app.eduagent.com/quiz/{topic_id}?token={auth_token}     │
│                                                                  │
│  FLOW:                                                           │
│  1. User clicks link                                             │
│  2. If logged in → straight to Quiz screen                       │
│  3. If not logged in:                                            │
│     a. Token valid → auto-login, then Quiz                       │
│     b. Token expired → Login screen, then Quiz                   │
│  4. Quiz completes → show results + "Continue Learning" CTA      │
│                                                                  │
│  TOKEN SECURITY:                                                 │
│  • One-time use (invalidate after click)                         │
│  • Expires after 7 days                                          │
│  • Scoped to specific quiz only                                  │
│  • If expired: "Link expired. Log in to take the quiz."          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 5.2: Define XP Decay on Failed Recall
**File:** PRE_MVP_PROTOTYPE.md (in Gamification section)
**File:** PRD.md (update F6: Gamification)

```
XP DECAY RULES:

CONTEXT:
• User earns XP when completing topics
• XP is "pending" until verified by recall quiz
• Recall quiz at 2 weeks and 6 weeks

PASS RECALL (≥70% correct):
• 2-week recall: +30 Verified XP
• 6-week recall: +50 Verified XP
• Topic status: "Strong" → "Verified"

FAIL RECALL (<70% correct):
• Pending XP remains pending (not lost)
• Topic status: "Weak" / "Needs Review"
• Topic added to daily review queue
• Re-quiz available immediately
• Pass re-quiz → earn original XP

DECAY OVER TIME (if no quiz taken):
• Week 2: No action → reminder email
• Week 3: No action → XP still pending
• Week 4+: Visual decay shown in progress bar
• XP never "lost" — always recoverable via quiz

VISUAL DECAY BARS:
████████████ (100%) - Just learned
████████░░░░ (70%)  - 2 weeks, no quiz
████░░░░░░░░ (40%)  - 4 weeks, no quiz
██░░░░░░░░░░ (20%)  - 6+ weeks, needs review
```

#### Task 5.3: Define Parent Notifications for Child Activity
**File:** PRE_MVP_PROTOTYPE.md (new section after Settings)

```
┌─────────────────────────────────────────────────────────────────┐
│  PARENT NOTIFICATIONS (for child profiles)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MVP SCOPE: Email digest only (no real-time push)                │
│                                                                  │
│  WEEKLY DIGEST EMAIL (sent Sunday evening):                      │
│  ─────────────────────────────────────────────────────────────  │
│  Subject: "[Mia]'s learning this week"                           │
│                                                                  │
│  "Hi [Parent Name],                                              │
│                                                                  │
│   Here's what [Mia] accomplished this week:                      │
│                                                                  │
│   📚 Learning:                                                   │
│   • Completed 3 topics in Python                                 │
│   • 2 hours 15 minutes total learning time                       │
│   • Current streak: 🔥 5 days                                    │
│                                                                  │
│   🎯 Homework Help:                                              │
│   • 4 problems worked through                                    │
│   • Math (2), Physics (1), Chemistry (1)                         │
│   • AI guided — no answers given                                 │
│                                                                  │
│   💪 Areas of strength: Variables, Data Types                    │
│   📖 Needs review: Functions (hasn't practiced in 2 weeks)       │
│                                                                  │
│   [View Full Progress →]                                         │
│                                                                  │
│   To stop these emails: [Unsubscribe]"                           │
│                                                                  │
│  SETTINGS (in parent's profile):                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Child Activity Notifications                            │    │
│  │                                                          │    │
│  │  Send weekly digest for:                                 │    │
│  │  ☑️ Mia's progress                                       │    │
│  │  ☑️ Marek's progress                                     │    │
│  │                                                          │    │
│  │  Frequency: [Weekly ▼]                                   │    │
│  │  Options: Weekly, Never                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  FUTURE (post-MVP):                                              │
│  • Real-time push for milestones                                 │
│  • Daily summary option                                          │
│  • Achievement notifications                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 6: Schema Updates

**Gaps:** #9 (parent email storage)

#### Task 6.1: Add Parent Email to Schema
**File:** DATA_MODEL.md

```sql
-- Add to users table or create separate table

-- Option A: Add to users table (simpler)
ALTER TABLE users ADD COLUMN parent_email VARCHAR(255);
ALTER TABLE users ADD COLUMN parent_consent_given_at TIMESTAMP;
ALTER TABLE users ADD COLUMN parent_consent_revoked_at TIMESTAMP;

-- Option B: Separate consents table (more flexible)
CREATE TABLE parental_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  parent_email VARCHAR(255) NOT NULL,
  consent_requested_at TIMESTAMP DEFAULT NOW(),
  consent_given_at TIMESTAMP,
  consent_revoked_at TIMESTAMP,
  consent_token VARCHAR(255) UNIQUE,
  token_expires_at TIMESTAMP,
  ip_address VARCHAR(45),  -- For audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recommendation: Option B for audit trail
```

---

### Phase 7: Timeline Re-estimation

**Gap:** #6

```
ORIGINAL TIMELINE: 8 weeks build + 4 weeks beta

SCOPE ADDITIONS FROM GAP FIXES:
• 5 new wireframe screens
• 1 state machine diagram
• 3 new feature specs
• 1 schema migration
• ~15 documentation updates

ESTIMATED ADDITIONAL EFFORT:
• Design/wireframes: +4 hours
• Documentation: +6 hours
• Schema migration: +2 hours
• Implementation buffer: +8 hours
• Total: +20 hours (~1 week at 20 hrs/week)

REVISED TIMELINE:
• Build: 9 weeks (was 8)
• Beta: 4 weeks (unchanged)
• Total: 13 weeks (was 12)

OR: Keep 8 weeks, but cut scope elsewhere
```

---

## Execution Checklist

### Phase 1: Critical Blockers
- [ ] 1.1 Create Subject Input Screen wireframe
- [ ] 1.2 Add Profile Switch PIN screen
- [ ] 1.3 Document Apple Private Relay handling
- [ ] 1.4 Add parent email validation rules
- [ ] 1.5 Add GDPR consent revocation mechanism

### Phase 2: State Machine & Flow Logic
- [ ] 2.1 Add user state machine diagram
- [ ] 2.2 Define consent token expiry rules
- [ ] 2.3 Define multi-profile subscription lapse
- [ ] 2.4 Define learning path + homework coexistence
- [ ] 2.5 Define Intent Screen display logic
- [ ] 2.6 Define under-11 child profile policy

### Phase 3: Wireframe Additions
- [ ] 3.1 Add "Problems worked through" to Learning Book
- [ ] 3.2 Add cancel subscription flow
- [ ] 3.3 Add photo processing states
- [ ] 3.4 Add preview mode for pending consent
- [ ] 3.5 Add parent-created child consent checkbox

### Phase 4: Clarifications & Polish
- [ ] 4.1 Clarify subject input type (free-text)
- [ ] 4.2 Define summary character limits
- [ ] 4.3 Add photo upload specifications
- [ ] 4.4 Clarify OAuth photo → Avatar logic
- [ ] 4.5 Reorder Terms before Avatar
- [ ] 4.6 Add progressive disclosure note

### Phase 5: New Feature Specs
- [ ] 5.1 Define recall email deep links
- [ ] 5.2 Define XP decay rules
- [ ] 5.3 Define parent notifications

### Phase 6: Schema Updates
- [ ] 6.1 Add parental_consents table design

### Phase 7: Timeline
- [ ] 7.1 Update timeline in PRE_MVP_PROTOTYPE.md

---

## Document Update Summary

| Document | Updates Required |
|----------|------------------|
| PRE_MVP_PROTOTYPE.md | 20+ sections (wireframes, flows, specs) |
| PRD.md | Epic 0 additions, F6 gamification updates |
| MVP_DEFINITION.md | Timeline, feature list updates |
| DATA_MODEL.md | parental_consents table |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2024-12-11 | Initial plan created from party mode + persona walkthrough gaps | Claude + Zuzka |
