# Adaptive Home Screen — Design Spec

**Date:** 2026-04-04
**Status:** Draft
**Epic:** Home Screen Redesign (replaces current empty-state UX)

## Problem

The current home screen entry point shows "Add your first subject" for new users — a cold, app-centric prompt. It doesn't adapt to the user's actual state (library content, linked children) and forces subject creation as the only path forward. The experience should feel like a friendly guide asking "what do you want to do right now?" rather than an onboarding form.

## Design Principles

1. **State-driven, not persona-driven.** The screen adapts based on what the user has (library content, linked children), not who they are (age, persona type).
2. **Intent-first navigation.** Each screen asks one question: "why are you here?" and offers 2-3 clear choices.
3. **Universal learner screen.** Once a user (parent or not) chooses to learn, they get the exact same experience.
4. **Minimal depth.** Maximum 2 taps from app open to starting an activity.

## Architecture: Approach B — Gateway + Universal Learner Screen

Three distinct screens replace the current monolithic `home.tsx`:

```
home.tsx (intent router)
├── hasLinkedChildren → Parent Gateway (rendered inline)
│   ├── "Check child's progress" → /(parent)/dashboard (existing)
│   └── "Learn something" → learn.tsx
│
└── no linked children → learn.tsx (directly)

learn.tsx (universal learner screen)
├── "Learn something new!" → learn-new.tsx
├── "Help with assignment?" → homework session flow (existing)
└── "Repeat & review" (only if library has content) → Library screen

learn-new.tsx (learning fork)
├── "Pick a subject" → /create-subject (existing)
├── "Just ask anything" → freeform session (existing)
└── "Continue where you left off" (only if recovery marker exists) → resume session
```

## Screen Specifications

### Screen 1: `home.tsx` — Intent Router

**Purpose:** Determine what the user sees first when they open the app.

**Logic:**
- Fetch family links for the active profile (existing API: `GET /v1/family-links`)
- If `linkedChildren.length > 0` → render Parent Gateway inline
- Otherwise → render `<LearnerScreen />` component directly (no navigation, no stack push — the learner UI IS the home tab)

**Component reuse pattern:** The learner UI is extracted into a shared `<LearnerScreen />` component (e.g., `components/home/LearnerScreen.tsx`). This component is rendered in two places:
- Inline inside `home.tsx` for non-parent users (home tab = learner screen, no back button)
- As the content of the `/learn` route for parent users who tap "Learn something" (pushed onto stack, back button returns to gateway)

This avoids the dual-identity problem where a single route file is both inline and navigated-to. React Navigation stack stays clean: non-parents have no extra stack entry, parents get a natural push/pop.

**Parent Gateway UI:**
- Time-aware greeting header (see Greetings section below)
- Profile switcher (top-right, existing component)
- Two large cards/buttons, vertically stacked:
  - **"Check child's progress"** → navigates to `/(parent)/dashboard`
    - Includes a single-line highlight beneath the button: latest child activity summary (e.g., "Emma practiced 12 min today", "No activity today"). Source: `GET /v1/dashboard` → most recent child's `totalTimeThisWeek` or today's session data. If multiple children, show the most recently active child. If no activity data yet, show "See how they're doing".
  - **"Learn something"** → navigates to `/learn` route (which renders `<LearnerScreen />`)
- No other elements beyond these two cards + highlight. Intentionally minimal.

**Size target:** ~50-100 lines (down from current 883).

### Screen 2: `<LearnerScreen />` component + `/learn` route — Universal Learner Screen

**Purpose:** "What do you want to do right now?" — the core entry point for all learners.

**State detection:**
- `useSubjects()` → check if `activeSubjects.length > 0` (library has content)
- No persona checks, no age checks, no family link checks

**Cards rendered:**

| Condition | Cards shown |
|---|---|
| Empty library | "Learn something new!" + "Help with assignment?" |
| Has library content | "Learn something new!" + "Help with assignment?" + "Repeat & review" |

**Card behaviour:**
- **"Learn something new!"** → navigates to `learn-new.tsx`
- **"Help with assignment?"** → launches homework session flow (camera capture, existing). Subtitle on card: "Take a picture and we'll look at it together"
- **"Repeat & review"** → navigates to Library screen (existing)

**Header:** Time-aware greeting (see Greetings section) + profile switcher (top-right).

**What does NOT appear here:**
- Server-ranked coaching cards (move deeper or remove from entry point)
- Subject list / retention strip (these live in Library)
- "Add your first subject" empty state (replaced by the card layout)
- Resume session card (moved to `learn-new.tsx`)

### Screen 3: `learn-new.tsx` — Learning Fork

**Purpose:** "What kind of learning?" — shown after tapping "Learn something new!"

**Cards rendered:**

| Condition | Cards shown |
|---|---|
| Always | "Pick a subject" + "Just ask anything" |
| Recovery marker exists | + "Continue where you left off" |

**Card behaviour:**
- **"Pick a subject"** → navigates to `/create-subject` (existing subject creation flow)
- **"Just ask anything"** → starts a freeform learning session (existing)
- **"Continue where you left off"** → resumes recovered session (existing crash recovery logic)

**Header:** Back arrow + title "What would you like to learn?" — no greeting repetition.

## Greetings

Time-of-day + day-of-week greetings. Pure client-side, computed on render using `new Date()`.

**Utility function:** `getGreeting(name: string): { title: string; subtitle: string }`

### Time-of-day greetings

| Time | Greeting |
|---|---|
| 5:00–11:59 | "Good morning, {name}!" |
| 12:00–16:59 | "Good afternoon, {name}!" |
| 17:00–20:59 | "Good evening, {name}!" |
| 21:00–4:59 | "Hey, {name}!" |

### Day-of-week overrides

Day-of-week flavour replaces the subtitle (not the main greeting) when applicable:

| Day | Subtitle override |
|---|---|
| Monday | "Fresh week ahead!" |
| Friday | "Happy Friday!" |
| Saturday/Sunday | "Weekend learning? Nice!" |
| Other days | Default subtitle based on time-of-day |

### Default subtitles (when no day override applies)

| Time | Subtitle |
|---|---|
| 5:00–11:59 | "Fresh mind, fresh start" |
| 12:00–16:59 | "Let's keep going" |
| 17:00–20:59 | "Winding down or powering through?" |
| 21:00–4:59 | "Burning the midnight oil?" |

**Same greetings used on both parent gateway and learner screen.**

## Navigation & Back Behaviour

- The parent gateway **is** what the Home tab renders for users with linked children
- Bottom nav stays unchanged: Home, Library, More
- Back behaviour:
  - **Parent gateway → "Learn something" → `/learn` route:** Back pops stack, returns to parent gateway (home tab)
  - **Direct learner (no linked children) → `<LearnerScreen />` inline in home.tsx:** No back (this is the root — no stack entry)
  - **`<LearnerScreen />` → learn-new.tsx:** Back returns to learner screen
  - **`<LearnerScreen />` → Library:** Back returns to learner screen

## State Detection Summary

Two boolean signals drive all UI decisions:

| Signal | Source | Used by |
|---|---|---|
| `hasLinkedChildren` | `GET /v1/family-links` → `children.length > 0` | `home.tsx` — gateway vs direct learner |
| `hasLibraryContent` | `useSubjects()` → `activeSubjects.length > 0` | `learn.tsx` — show/hide "Repeat & review" |
| `hasRecoveryMarker` | SecureStore crash recovery marker | `learn-new.tsx` — show/hide "Continue where you left off" |

## What Happens to Current Code

### Moves to `learn.tsx`
- Greeting header (rewritten with time-aware logic)
- Profile switcher
- Homework session entry point

### Moves to `learn-new.tsx`
- Resume session card (crash recovery)
- Subject creation entry point
- Freeform session entry point

### Stays in existing screens
- `dashboard.tsx` — parent child progress (unchanged)
- `create-subject` flow — subject onboarding (unchanged)
- Homework camera flow — camera capture/OCR (unchanged)
- Library screen — subject/topic browsing (unchanged)

### Removed from home entry point
- Server-ranked coaching cards at top level (could be surfaced deeper, e.g., inside learn-new or after subject selection)
- "Add your first subject" empty state card
- Subject list / retention strip
- "Your subjects" section with error state

## Out of Scope

- Usage-pattern-aware greetings (last session timestamp) — deferred post-launch
- Coaching cards integration into new screens — separate follow-up
- Any persona-type or age-based branching
