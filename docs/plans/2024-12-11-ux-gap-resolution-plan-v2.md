# UX Gap Resolution Plan v2 — Persona Walkthrough Findings

> **Created:** 2024-12-11
> **Source:** Party Mode persona walkthroughs (Emma 14yo, Marcus 28yo, Dr. Chen 45yo parent)
> **Status:** ✅ COMPLETE (all 15 tasks implemented)

---

## Account vs Profile Model Clarification

**IMPORTANT: Before implementing, clarify the data model:**

### Terms
- **Account** = Email + password (or OAuth). The paying entity. Has a `users` table row.
- **Profile** = A learning persona under an account. Has a `profiles` table row.
- **Account Owner** = The person who pays. Can be parent OR adult learner.

### Two Signup Scenarios

| Scenario | Flow | Account Owner | Profiles |
|----------|------|---------------|----------|
| **A: Parent-first (typical)** | Parent signs up → adds child profiles | Parent | Parent profile + child profiles |
| **B: Child-first (GDPR)** | Child signs up → parent approves → parent claims ownership | **Transfers to parent** | Child profile (original) + parent can add more |

### Scenario B Resolution (GDPR Child-First)

When a child (11-15, EU) signs up:
1. Child creates account with THEIR email
2. Child's account is in `pending_consent` state
3. Parent receives consent email
4. **On approval:** Parent has option to:
   - **Option A:** "Become the account owner" → Parent adds their email, becomes owner, child becomes a profile
   - **Option B:** "Just approve" → Child keeps their account, parent gets NO ongoing access (except what child shares)

**Recommendation:** Option A is better for family use. Parent becomes owner, manages subscription, can add siblings.

---

## Executive Summary

After implementing 28 gaps from the first review, persona walkthroughs revealed **14 additional gaps** and **2 contradictions**. These fall into 4 categories:

1. **Parent Experience (CRITICAL)** — Missing email templates, confirmation pages, account ownership transfer
2. **Pending Consent UX** — What child sees while waiting
3. **Flow Clarity** — Language selector, OAuth pre-fill, interview duration
4. **Technical Completeness** — Deep links, multi-path priority

---

## Gap Inventory

### CRITICAL (Must fix before launch)

| # | Gap | Persona | Impact |
|---|-----|---------|--------|
| 1 | Parent consent EMAIL TEMPLATE missing | Dr. Chen | Parents can't make informed decision |
| 2 | Parent confirmation PAGE after approval missing | Dr. Chen | Dead-end UX after clicking approve |
| 3 | Parent account creation/linking flow missing | Dr. Chen | Can't access child profile later |
| 4 | Preview mode wireframe missing | Emma | Child in pending state sees nothing |

### HIGH Priority

| # | Gap | Persona | Impact |
|---|-----|---------|--------|
| 5 | Language selector not shown in Welcome wireframe | Emma | Non-English users confused |
| 6 | OAuth name pre-fill behavior undefined | Emma | Inconsistent UX |
| 7 | Age checkbox redundant after birthdate collection | Emma | Asks same question twice |
| 8 | Multiple in-progress paths priority rule missing | Marcus | Which "Continue" shows first? |
| 9 | Universal/deep link mobile app handling missing | Marcus | Email links might not open app |

### MEDIUM Priority

| # | Gap | Persona | Impact |
|---|-----|---------|--------|
| 10 | Interview duration not shown to user | Marcus | User doesn't know time commitment |
| 11 | "Why this order?" explanation display undefined | Marcus | Modal vs inline unclear |
| 12 | Summary box placeholder text undefined | Marcus | Minor UX detail |
| 13 | Welcome Message doesn't preview both paths | Marcus | User doesn't know about homework help |
| 14 | Subject viability check handoff unclear | Marcus | When does check happen? |

### Contradictions

| # | Issue | Details |
|---|-------|---------|
| C1 | Parent access model incomplete | Says "switch into child profile" but no flow for parent to HAVE an account first |
| C2 | Age confirmation redundant | Birthdate collected in Screen 2, checkbox asks again in Screen 4 |

---

## Resolution Plan

### Phase 1: Parent Experience (CRITICAL)

**Estimated effort:** 3-4 hours

#### Task 1.1: Parent Consent Email Template
**File:** PRE_MVP_PROTOTYPE.md

```
┌─────────────────────────────────────────────────────────────────┐
│  PARENT CONSENT EMAIL TEMPLATE                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FROM: EduAgent <consent@eduagent.com>                           │
│  SUBJECT: [Child Name] wants to join EduAgent — your approval    │
│           needed                                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  Hi there,                                               │    │
│  │                                                          │    │
│  │  [Child Name] ([child_email]) has signed up for          │    │
│  │  EduAgent, an AI-powered learning app.                   │    │
│  │                                                          │    │
│  │  Because they're under 16 and in [Country], EU law       │    │
│  │  (GDPR Article 8) requires your consent.                 │    │
│  │                                                          │    │
│  │  WHAT EDUAGENT DOES:                                     │    │
│  │  • AI tutor for any subject (homework help, learning)    │    │
│  │  • Personalized curriculum based on their level          │    │
│  │  • You can see their progress anytime                    │    │
│  │                                                          │    │
│  │  DATA WE COLLECT:                                        │    │
│  │  • Name, email, birthdate, country                       │    │
│  │  • Learning progress and conversations with AI           │    │
│  │  • We never sell data. See Privacy Policy.               │    │
│  │                                                          │    │
│  │  YOUR RIGHTS:                                            │    │
│  │  • Withdraw consent anytime (in app or reply to email)   │    │
│  │  • Request data deletion (GDPR Article 17)               │    │
│  │  • Access all data we store (GDPR Article 15)            │    │
│  │                                                          │    │
│  │  ┌───────────────────┐  ┌───────────────────┐           │    │
│  │  │  ✓ I Approve      │  │  ✗ I Decline      │           │    │
│  │  └───────────────────┘  └───────────────────┘           │    │
│  │                                                          │    │
│  │  This link expires in 7 days.                            │    │
│  │                                                          │    │
│  │  Questions? Reply to this email or contact               │    │
│  │  support@eduagent.com                                    │    │
│  │                                                          │    │
│  │  —The EduAgent Team                                      │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  BUTTON LINKS:                                                   │
│  • Approve: https://app.eduagent.com/consent/approve?token=xxx   │
│  • Decline: https://app.eduagent.com/consent/decline?token=xxx   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 1.2: Parent Confirmation Pages (Approve/Decline)
**File:** PRE_MVP_PROTOTYPE.md

```
┌─────────────────────────────────────────────────────────────────┐
│  PARENT CONSENT CONFIRMATION — APPROVED                          │
│  (Route: /consent/approved)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  ✅ You've approved [Child Name]'s learning!             │    │
│  │                                                          │    │
│  │  WHAT WOULD YOU LIKE TO DO?                              │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  👨‍👩‍👧 BECOME THE ACCOUNT OWNER (Recommended)   │        │    │
│  │  │                                              │        │    │
│  │  │  • You'll manage the subscription            │        │    │
│  │  │  • See [Child Name]'s progress anytime       │        │    │
│  │  │  • Add more family members later             │        │    │
│  │  │                                              │        │    │
│  │  │  [Set Up Family Account →]                   │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  ✓ JUST APPROVE (Child manages own account)  │        │    │
│  │  │                                              │        │    │
│  │  │  • [Child Name] keeps their own account      │        │    │
│  │  │  • They manage their own subscription later  │        │    │
│  │  │  • You won't have ongoing access             │        │    │
│  │  │                                              │        │    │
│  │  │  [Approve & Close]                           │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  IF "Set Up Family Account" CLICKED:                             │
│  → Parent Account Takeover Flow (Task 1.3)                       │
│                                                                  │
│  IF "Approve & Close" CLICKED:                                   │
│  → Child's account activated, parent session ends                │
│  → Child notified: "Your parent approved! You can start learning"│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PARENT CONSENT CONFIRMATION — DECLINED                          │
│  (Route: /consent/declined)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  You've declined [Child Name]'s request.                 │    │
│  │                                                          │    │
│  │  We've let them know. Their account will remain          │    │
│  │  inactive, and we'll delete their data within 30 days.   │    │
│  │                                                          │    │
│  │  Changed your mind? Ask them to sign up again and        │    │
│  │  you'll receive a new consent request.                   │    │
│  │                                                          │    │
│  │  Questions? Contact support@eduagent.com                 │    │
│  │                                                          │    │
│  │              [Close This Page]                           │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 1.3: Parent Account Takeover Flow (GDPR Scenario)
**File:** PRE_MVP_PROTOTYPE.md

```
┌─────────────────────────────────────────────────────────────────┐
│  PARENT ACCOUNT TAKEOVER (Route: /consent/family-setup)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONTEXT: Parent chose "Become the Account Owner" after consent  │
│                                                                  │
│  WHAT HAPPENS:                                                   │
│  • Parent becomes the OWNER of the account                       │
│  • Child's email becomes just a profile under parent's account   │
│  • Parent can add more children as profiles                      │
│  • Subscription is managed by parent                             │
│                                                                  │
│  STEP 1: PARENT AUTHENTICATION                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  Set up your family account                              │    │
│  │                                                          │    │
│  │  You'll be the account owner. [Child Name] will be       │    │
│  │  your first family member.                               │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │          [Continue with Google]              │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │          [Continue with Apple]               │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ─── or ───                                              │    │
│  │                                                          │    │
│  │  Email: [________________________]                       │    │
│  │  Password: [____________________]                        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │          [Create Account]                    │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────┘        │    │
│                                                                  │
│  STEP 2: ACCOUNT TRANSFER COMPLETE                               │
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
│  │  You can now:                                            │    │
│  │  • Switch into [Child]'s profile to see their progress   │    │
│  │  • Add more family members                               │    │
│  │  • Manage subscription when ready                        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │    [Go to [Child Name]'s Profile →]          │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────┘        │    │
│                                                                  │
│  DATA MODEL CHANGES:                                             │
│  • `users` table: account_owner_id updated to parent's user_id   │
│  • `profiles` table: child becomes a profile, parent profile added│
│  • Original child email stored for their login (profile login)   │
│  • Parent email is now the account email                         │
│                                                                  │
│  CHILD NOTIFICATION:                                             │
│  "Great news! Your parent approved and set up a family account.  │
│   You can keep learning — nothing changes for you!"              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 1.4: Preview Mode for Pending Consent
**File:** PRE_MVP_PROTOTYPE.md

```
┌─────────────────────────────────────────────────────────────────┐
│  PREVIEW MODE (Pending Consent State)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONTEXT: Child has signed up but parent hasn't approved yet     │
│                                                                  │
│  HOME SCREEN IN PREVIEW MODE:                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  🕐 Waiting for your parent's approval                   │    │
│  │                                                          │    │
│  │  We sent an email to [parent_em***@***.com]              │    │
│  │  They have 7 days to approve your account.               │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │        [Resend Email to Parent]              │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │  Last sent: 2 hours ago                                  │    │
│  │                                                          │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │                                                          │    │
│  │  WHILE YOU WAIT, EXPLORE:                                │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  📚 Browse Subjects                          │        │    │
│  │  │  See what you could learn (40+ subjects!)    │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────┐        │    │
│  │  │  🎯 How EduAgent Works                       │        │    │
│  │  │  Watch a quick demo (2 min)                  │        │    │
│  │  └─────────────────────────────────────────────┘        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  BROWSE SUBJECTS (Preview Only):                                 │
│  • User can see subject categories                               │
│  • Tapping a subject shows: "Start learning [X] once approved!"  │
│  • NO learning sessions, NO chat, NO data collection             │
│                                                                  │
│  EMAIL PRIVACY:                                                  │
│  • Parent email partially masked: first 2 chars + ***@domain     │
│  • Protects parent email from child sharing screen               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 2: High Priority Fixes

**Estimated effort:** 2 hours

#### Task 2.1: Add Language Selector to Welcome Screen Wireframe
**File:** PRE_MVP_PROTOTYPE.md (Welcome Screen wireframe)

Add to wireframe:
```
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🌐 [English ▼]                                    Top-right   │
│  │                                                          │    │
│  │                      🎓 EduAgent                         │    │
```

#### Task 2.2: Define OAuth Name Pre-fill Behavior
**File:** PRE_MVP_PROTOTYPE.md (Complete Profile OAuth screen)

Add to implementation notes:
```
OAUTH DATA PRE-FILL:
• If Google/Apple provides name → pre-fill "What should we call you?"
• User CAN edit (some prefer nickname)
• If no name provided → field is empty
• Pre-filled fields show: "From your Google account" hint text
```

#### Task 2.3: Fix Age Confirmation Redundancy
**File:** PRE_MVP_PROTOTYPE.md (Terms & Privacy screen)

Change from checkbox to text:
```
BEFORE:
☑️ I confirm I am 11 years or older

AFTER (derived from birthdate):
✓ Based on your birthdate, you're [age] years old
  (Must be 11+ to use EduAgent)
```

#### Task 2.4: Define Multi-Path Priority Rule
**File:** PRE_MVP_PROTOTYPE.md (Returning User Home Screen)

Add to implementation notes:
```
MULTIPLE IN-PROGRESS PATHS — DISPLAY PRIORITY:
1. Most recently accessed path shown as primary "Continue" card
2. Other active paths shown in "Your Learning Paths" section below
3. If >3 active paths → "See all paths" link
4. Sorting: last_session_at DESC
```

#### Task 2.5: Define Universal/Deep Link Mobile Handling
**File:** PRE_MVP_PROTOTYPE.md (Recall Email Deep Links section)

Add:
```
MOBILE APP DEEP LINKING:

iOS (Universal Links):
• App associated domain: app.eduagent.com
• apple-app-site-association file on server
• Link clicked → opens native app if installed, else web

Android (App Links):
• Intent filter in AndroidManifest.xml
• assetlinks.json file on server
• Same behavior as iOS

FALLBACK FLOW:
If app not installed:
1. Link opens web app
2. Web app detects mobile
3. Shows: "Get the app for the best experience [App Store] [Play Store]"
4. User can continue in web OR install app
```

---

### Phase 3: Medium Priority Fixes

**Estimated effort:** 1.5 hours

#### Task 3.1: Add Interview Duration Notice
**File:** PRE_MVP_PROTOTYPE.md (Interview Screen)

Add to wireframe:
```
│  │  Let's find the perfect starting point for you.          │    │
│  │  ⏱️ This takes about 3 minutes                            │    │
```

#### Task 3.2: Define "Why this order?" Display
**File:** PRE_MVP_PROTOTYPE.md (Curriculum Review screen)

Add:
```
"WHY THIS ORDER?" INTERACTION:
• Display: Inline expansion (not modal)
• Tapping reveals explanation below curriculum list
• AI-generated text: "I ordered your curriculum this way because..."
• Collapse button: "Got it" or tap elsewhere
```

#### Task 3.3: Define Summary Box Placeholder
**File:** PRE_MVP_PROTOTYPE.md (Session End flow)

Add:
```
SUMMARY INPUT FIELD:
• Placeholder text: "What did you learn? Write in your own words..."
• Character counter appears after first character typed
• No pre-filled text (user must write from scratch)
```

#### Task 3.4: Update Welcome Message to Preview Both Paths
**File:** PRE_MVP_PROTOTYPE.md (Welcome Message screen)

Update wireframe content:
```
│  │  TWO WAYS TO LEARN:                                      │    │
│  │                                                          │    │
│  │  📚 Learn Something New                                  │    │
│  │  Pick any subject and I'll create a personalized path    │    │
│  │                                                          │    │
│  │  📝 Get Homework Help                                    │    │
│  │  Stuck on a problem? I'll guide you through it           │    │
│  │  (I won't give you the answer!)                          │    │
```

#### Task 3.5: Clarify Subject Viability Check Handoff
**File:** PRE_MVP_PROTOTYPE.md (Subject Input Screen)

Add:
```
VIABILITY CHECK TIMING:
• User types subject and taps "Let's Go"
• BEFORE Interview: Quick viability check (1-2 seconds)
• If viable → proceed to Interview
• If needs clarification → show prompt (same screen)
• If not suitable → show message with suggestions
• Interview Agent handles DEEP viability (scope, curriculum potential)
```

---

### Phase 4: Data Model Addition

**Estimated effort:** 30 minutes

#### Task 4.1: Add profile_links Table
**File:** DATA_MODEL.md

```sql
CREATE TABLE public.profile_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(20) DEFAULT 'parent'
        CHECK (relationship IN ('parent', 'guardian')),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One parent can link to multiple children
    -- One child can have multiple linked parents
    UNIQUE(parent_user_id, child_user_id)
);

CREATE INDEX idx_profile_links_parent ON profile_links(parent_user_id);
CREATE INDEX idx_profile_links_child ON profile_links(child_user_id);

COMMENT ON TABLE profile_links IS 'Links parent accounts to child accounts for profile switching';
```

---

## Implementation Checklist

### Phase 1: Parent Experience (CRITICAL) ✅ COMPLETE
- [x] 1.1 Add parent consent email template (PRE_MVP_PROTOTYPE.md:3637-3704)
- [x] 1.2 Add parent confirmation pages (PRE_MVP_PROTOTYPE.md:3829-3910)
- [x] 1.3 Add parent account creation & linking flow (PRE_MVP_PROTOTYPE.md:3912-4004)
- [x] 1.4 Add preview mode wireframe for pending consent (PRE_MVP_PROTOTYPE.md:4050-4118)

### Phase 2: High Priority ✅ COMPLETE
- [x] 2.1 Add language selector to Welcome screen wireframe (PRE_MVP_PROTOTYPE.md:3263, 3293-3299)
- [x] 2.2 Define OAuth name pre-fill behavior (PRE_MVP_PROTOTYPE.md:3345-3351)
- [x] 2.3 Fix age confirmation redundancy (PRE_MVP_PROTOTYPE.md:3519-3520, 3536-3540)
- [x] 2.4 Define multi-path priority rule (PRE_MVP_PROTOTYPE.md:5829-5834)
- [x] 2.5 Define universal/deep link mobile handling (PRE_MVP_PROTOTYPE.md:750-774)

### Phase 3: Medium Priority ✅ COMPLETE
- [x] 3.1 Add interview duration notice (PRE_MVP_PROTOTYPE.md:285)
- [x] 3.2 Define "Why this order?" display (PRE_MVP_PROTOTYPE.md:378-382)
- [x] 3.3 Define summary box placeholder (PRE_MVP_PROTOTYPE.md:5378, 5386-5390)
- [x] 3.4 Update Welcome Message to preview both paths (PRE_MVP_PROTOTYPE.md:4133-4150)
- [x] 3.5 Clarify subject viability check handoff (PRE_MVP_PROTOTYPE.md:4256-4271)

### Phase 4: Data Model ✅ COMPLETE
- [x] 4.1 Add profile_links table to DATA_MODEL.md (DATA_MODEL.md:258-286, 2078-2125)

---

## Timeline Impact

**Total estimated effort:** 7-8 hours

**Recommendation:** These are primarily documentation/wireframe updates. No change to overall project timeline needed — can be completed within existing build phase.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2024-12-11 | Initial plan from persona walkthrough party mode | Claude + Zuzka |
| 2024-12-11 | ✅ All 15 tasks verified complete in PRE_MVP_PROTOTYPE.md and DATA_MODEL.md | Claude + Zuzka |
