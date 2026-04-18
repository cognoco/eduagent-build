# Home Screen & Navigation IA Simplification

**Status:** Design spec — approved for implementation planning
**Author:** Product + Claude brainstorm, 2026-04-18
**Relates to:** [Home screen IA v1 (Notion)](https://www.notion.so/cognix/Home-screen-IA-v1-three-intents-only-3458bce91f7c818c920efc4d5a6578da)

## Problem

The current information architecture has ~9 duplicated top-level paths for 3 core intents (resume, start new, practice). A new user needs ~5 minutes to map the mental model of which CTA does what. Key symptoms:

- "Continue where you left off" appears on 3 screens (Home, `/learn-new`, `/create-subject`)
- "Continue with {Subject}" appears on 2 screens (`/learn-new`, `/create-subject`)
- `/learn-new` is an intermediate hub that mostly duplicates Home and `/create-subject`
- `/learn` and `/learn-new` are two routes for the same intent (ParentGateway vs LearnerScreen)
- Topic detail can show up to 6 action buttons with overlapping names
- Practice "Review topics" dumps users in Library when nothing is due

For a product aimed at 11-15-year-olds, this is too much scaffolding. Target users pattern-match, they don't read labels. 3-4 big cards = 1 pattern. 6+ cards with subtle distinctions = no pattern.

## Design Principles

### Intent vs Method

- **Intents** are what the user wants: resume, start new, practice, ask a question, get homework help. Intents belong at the top level.
- **Methods** are how they do it: quiz, dictation, recall check, relearn, teach-back. Methods belong inside a subject or topic context, or inside the Practice hub.

### The Gate (governance rule)

Any new top-level CTA, screen, or tab bar entry must answer both:

1. **Which intent does this serve?** If the answer is "none" or "a new intent," the proposer must write an argument for adding it.
2. **Which existing surface does this replace?** If the answer is "none, it's additive," the default answer is no.

Default is no. Top-level destination count must not exceed ~5 without explicit justification. If any top-level destination is a method rather than an intent, treat it as a design smell.

**Tab bar freeze:** The tab bar is frozen at 4 tabs (Home / Library / Progress / More). Adding a tab requires a separate spec with its own justification. This gate applies to both Home cards and tab bar entries.

### Voice & Copy Principles

All user-facing copy written or changed in this spec must follow these principles:

- **No punishment framing.** Empty states describe the state, not the user's failure. "No reviews due yet" not "You haven't earned any reviews." "Let's start fresh" not "You haven't completed anything."
- **No loss-aversion mechanics.** No streaks, no "don't lose your progress," no countdown timers. Progress is gained, never lost.
- **Describe capability, not constraint.** "Works at your pace" not "slow mode." "Audio-first" not "reduced text."

### Scope

This spec covers top-level navigation simplification and related onboarding improvements. Contextual actions within Library, Progress, Topic detail, and Book detail views stay — they are not duplicates, they are contextual affordances that appear after the user has already committed to a subject/book/topic.

**Out of scope:** Parent dashboard / parent visibility features. These require a separate spec that first answers data-model questions (what does `family_links` expose today, what are the privacy boundaries for child session data).

---

## Section 1: Home Screen Redesign

### Current state

`LearnerScreen.tsx` builds 2-4 intent cards dynamically. "Start learning" navigates to `/learn-new`, which offers 3-5 more cards. Many paths overlap.

### New state

3 always-visible + 1 conditional card. No intermediate screens. Each card maps to exactly one intent.

**Card labels:** Verb-framed for instant scannability. Subtitles carry warmth and context.

**Card order (top to bottom):**

| # | Title | Subtitle | Visibility | Navigation target |
|---|---|---|---|---|
| 1 | **Continue** | "{Subject} · {context}" | Conditional: shown at top when user has a recent session or overdue review topics | `/(app)/session` with resume/review params |
| 2 | **Learn** | "Start a new subject or pick one" | Always | `/create-subject` (merged picker) |
| 3 | **Ask** | "Get answers to any question" | Always | `/(app)/session?mode=freeform` |
| 4 | **Practice** | "Games and reviews to sharpen what you know" | Always | `/(app)/practice` |
| 5 | **Homework** | "Snap a photo, get help" | Always | `/(app)/homework/camera` |

**Continue card smartness (priority order — first match wins):**
1. `recoveryMarker` exists (crash recovery): show "{Subject} . resume" with highlight variant
2. `continueSuggestion` exists (API-driven): show "{Subject} . {time ago}"
3. Overdue review topics exist: show "{Subject} . {N} topics to review"
4. None of the above: hide the card entirely

**First-run (0 subjects):** Continue hidden. Practice always visible — cross-subject activities (Capitals, Guess Who, Dictation) are accessible with zero subjects. Subject-specific activities (Vocabulary quiz, Review topics) appear conditionally when the user has relevant data. Home shows 4 cards.

**Visual differentiation:** Each card gets a distinct icon. No color hierarchy or size variation between the always-visible cards.

**ParentGateway:** Unchanged in this spec. Parent accounts continue to see "Check child's progress" and "Learn something." The "Learn something" route is updated per Section 2.

### Files affected

- `apps/mobile/src/components/home/LearnerScreen.tsx` — rebuild intent card list
- `apps/mobile/src/components/home/IntentCard.tsx` — add icon prop support

---

## Section 2: Delete `/learn-new`, Unify `/learn`

### Current state

- `/learn-new` (`apps/mobile/src/app/(app)/learn-new.tsx`) is an intermediate hub with 5 cards: Pick a subject, Just ask anything, Practice, Continue with {Subject}, Continue where you left off. All duplicate other surfaces.
- ParentGateway routes to `/learn` which may be a different route from `/learn-new`.

### Change

- **Delete** `apps/mobile/src/app/(app)/learn-new.tsx` entirely. No redirect — it's an internal route, not a deep-linkable URL.
- **Verify** what `/learn` resolves to. If it's an alias or redirect to `/learn-new`, delete it too. Update ParentGateway's "Learn something" card to route to `/(app)/home` or directly to `/create-subject`.
- **Update** any remaining references to `/learn-new` in the codebase (back buttons, test files, etc.).
- **Update** `/(app)/practice.tsx` back button — currently routes to `/(app)/learn-new`. Change to `/(app)/home`.

### Redistribution of `/learn-new` functionality

| `/learn-new` CTA | Where it goes |
|---|---|
| "Pick a subject" | Home **Learn** card → `/create-subject` |
| "Just ask anything" | Home **Ask** card → `/(app)/session?mode=freeform` |
| "Practice" | Home **Practice** card → `/(app)/practice` |
| "Continue with {Subject}" | Home **Continue** card |
| "Continue where you left off" | Home **Continue** card |

### Files affected

- `apps/mobile/src/app/(app)/learn-new.tsx` — delete
- `apps/mobile/src/app/learn.tsx` (if exists) — delete or redirect
- `apps/mobile/src/components/home/ParentGateway.tsx` — update "Learn something" route
- `apps/mobile/src/app/(app)/practice.tsx` — update back button target
- Test files referencing `/learn-new`

---

## Section 3: Merge `/create-subject` Lists

### Current state

`create-subject.tsx` shows two separate groups when input is empty:
- "Or continue with" horizontal pills for existing subjects (lines 443-477), labeled "Continue {name}"
- Starter chips for new subjects (lines 480-504), labeled "Choose {name}"

Same subject can appear in both groups with different labels. Confusing.

### Change

One unified list. Label adapts per subject:

- **Existing subject:** "Continue {name}" with last-activity context (e.g. "3 days ago"). Tapping routes to `/(app)/session` with `subjectId` and `mode: 'learning'`.
- **New subject (starter chip):** "Start {name}". Tapping triggers the existing `resolveInput` flow.

Visual treatment is consistent — same component, same size. The list is sorted with existing subjects first (most recent activity on top), then starter chips below.

### Files affected

- `apps/mobile/src/app/create-subject.tsx` — merge the two lists into one adaptive component

---

## Section 4: Topic Detail Button Consolidation

### Current state

`topic/[topicId].tsx` can show up to 6 action buttons with overlapping names:

| Button | Session mode | Condition |
|---|---|---|
| Start Learning / Continue Learning | `freeform` | Based on completion status |
| Start Review Session | `practice` | in_progress or completed |
| Recall Check / Review and Re-test | recall-test route | Always (label changes at failureCount >= 3) |
| Relearn Topic | `relearn` | failureCount >= 3 OR struggleStatus = 'needs_deepening' |
| Challenge yourself | `evaluate` | evaluateEligibility.eligible |
| Teach it back | `teach_back` | repetitions > 0 AND easeFactor >= 2.3 |

A user cannot distinguish "Continue Learning" from "Start Review Session" from "Relearn Topic."

### Change

Collapse to **1 smart primary + expandable secondary:**

**Primary action (always 1 button):** System picks the most appropriate action based on topic state:

| Topic state | Primary button label | Session mode |
|---|---|---|
| `not_started` | "Start learning" | `freeform` |
| `in_progress` | "Continue learning" | `freeform` |
| `completed` + overdue for review | "Review" | `practice` |
| `completed` + not overdue | "Continue learning" | `freeform` |
| Struggling (failureCount >= 3 or needs_deepening) | "Relearn" | `relearn` |

**Secondary actions (collapsed under "More ways to practice"):**

Expandable section, only shown when there are applicable secondary actions:

| Action | Condition | One-line explanation |
|---|---|---|
| Recall Check | Always available | "Test your memory without hints" |
| Challenge yourself | `evaluateEligibility.eligible` | "Test yourself with tough questions" |
| Teach it back | `repetitions > 0 AND easeFactor >= 2.3` | "Explain this topic in your own words" |

**Naming consistency:**
- Drop the "Review and Re-test" alias. Always "Recall Check" regardless of failure count.
- The label change at `failureCount >= 3` was a signal to the user that they're struggling — this is now handled by the primary button switching to "Relearn" instead.

### Files affected

- `apps/mobile/src/app/(app)/topic/[topicId].tsx` — restructure action buttons

---

## Section 5: Onboarding Back-Navigation Fix

### Current state

The onboarding flow has 4 steps: interview → language-setup → analogy-preference → curriculum-review. The analogy-preference screen's Back button calls `goBackOrReplace(router, '/(app)/home')`, dropping the user out of the entire flow. No step indicator exists.

### Change

- **Back navigation:** Each onboarding step's Back button returns to the previous onboarding step. Only the first step (interview) exits to Home on Back.
  - analogy-preference Back → interview
  - curriculum-review Back → analogy-preference (or language-setup, depending on which preceded it)
  - language-setup Back → interview
  - interview Back → Home (exit flow)

- **Step indicator:** Add a simple progress indicator across all onboarding screens (e.g. dots or "Step 2 of 4"). The total step count adapts based on which steps are applicable (language subjects skip analogy-preference, non-language subjects skip language-setup).

### Files affected

- `apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx` — fix Back target
- `apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx` — fix Back target
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — verify Back target
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — verify Back target
- All onboarding screens — add step indicator component

---

## Section 6: Practice "Review Topics" Empty State

### Current state

`practice.tsx` "Review topics" card routes to `/(app)/topic/relearn` if an overdue topic exists, or falls back to `/(app)/library` if none are due. The user asked for review and gets dumped in their full library with no context.

### Change

When no overdue topics exist, show an inline empty state instead of routing to Library:

- **Message:** "Nothing to review right now"
- **Subtitle:** "Your next review is in {time}" (computed from the nearest `nextReviewAt` across all retention cards)
- **Secondary action:** "Browse your topics" → `/(app)/library` (explicit, not a silent redirect)

If the user has no retention cards at all (brand new), the "Review topics" card shows: "Complete some topics first to unlock review" with no action.

### Files affected

- `apps/mobile/src/app/(app)/practice.tsx` — add empty state handling for review card
- API may need a new field in the review-summary endpoint: `nextReviewAt` (earliest upcoming review time)

---

## Section 7: Accommodations First-Class in Onboarding

### Current state

Learning accommodations (None / Short-Burst / Audio-First / Predictable) are buried in the More tab under settings. A neurodivergent family has to complete onboarding, find the More tab, scroll past notifications and learning mode, and discover accommodation options — after they've already had a misaligned first experience.

This is a differentiator most competitors don't have. It shouldn't be buried.

### Change

Move accommodation selection into the onboarding flow, between interview and curriculum-review:

- **Prompt:** "Some kids learn best with shorter explanations, audio-first, or very predictable steps. Pick what fits, or skip."
- **Options:** None (default, pre-selected) / Short-Burst / Audio-First / Predictable — same as current More screen.
- **Skip is explicit:** A visible "Skip" or "None of these" option, not an implied default.
- **Editable later:** Accommodation remains editable in More tab. The onboarding step is the first-touch entry point, not the only one.

This means accommodation is set BEFORE the first session, so content generation respects the setting from the start.

### Step indicator update

The onboarding step count from Section 5 now includes the accommodation step. Example sequences:

- Language subject: interview → language-setup → accommodations → curriculum-review (4 steps)
- Non-language subject: interview → analogy-preference → accommodations → curriculum-review (4 steps)
- Both applicable: interview → language-setup → analogy-preference → accommodations → curriculum-review (5 steps)

### Files affected

- New onboarding screen: `apps/mobile/src/app/(app)/onboarding/accommodations.tsx`
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — route to accommodations after interview (or after analogy-preference/language-setup)
- `apps/mobile/src/app/(app)/more.tsx` — accommodation section stays but is no longer the primary entry point
- Step indicator component — updated step count

---

## What Stays Unchanged

- **Tab bar:** Home / Library / Progress / More — all four tabs remain
- **Library screen:** All 3 sub-tabs (Shelves, Books, Topics), management features, "Add subject" buttons
- **Progress screen:** All views and contextual actions (SubjectCard review/continue/explore)
- **Session flow:** `/(app)/session` routing, mode handling, session lifecycle
- **Book detail:** Start learning, continue actions
- **Shelf navigation:** Subject → Shelf → Book hierarchy
- **Quiz/Dictation/Recitation internals:** No changes to content selection, question generation, or session modes
- **Practice screen structure:** Review, Quiz, Dictation, Recitation cards stay. Only the empty state for Review changes.
- **Homework flow:** Camera → OCR → session unchanged

## Related Bug Tracker Items

The following bugs (observed in the Notion bug tracker) may become N/A after this IA consolidation, as the surfaces they exist on are deleted or restructured:

- "Continue {Subject} on /create-subject navigates to /library instead of starting a session" — resolved by merging create-subject lists
- "Cancel button on /create-subject page does not navigate back" — verify after /learn-new deletion
- "/learn route renders Home with spurious Go back" — resolved by deleting /learn route

These should be verified post-implementation and closed with a reference to this spec.

## Implementation Notes

- **Ship as one PR.** This is a deletion-heavy change. The diff should be net-negative (more lines removed than added).
- **Delete first, then adjust.** Remove `/learn-new` and its references before rebuilding Home cards. This avoids conflicting routes during development.
- **Paper-prototype the 5-second rule BEFORE code.** Print the Home card layout, hand it to a 12-year-old with 3 task cards ("start a new math topic," "keep going with geography," "get help with tonight's homework"). If they can't point to the right card in 5 seconds, fix the design before writing code. ~30 minutes, prevents a rebuild.
- **Re-run the 5-second rule after implementation.** Same test, real app. If it fails post-implementation, the IA is still wrong.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Continue card shows stale data | Session data not refreshed | "Geography . 3 days ago" for a deleted subject | Continue card falls back to next valid option or hides |
| Practice shows no activities | Cross-subject activities should always be available | Should not happen — Capitals/Guess Who/Dictation need no subjects | If it does happen, show "Something went wrong" + retry |
| Accommodation not persisted after onboarding | API failure during save | First session uses default (None) | Accommodation is editable in More; toast on save failure |
| Subject picker has 0 existing + 0 starter chips | Edge case: chips not loaded | Empty screen below input | Input field is always available — user can type freely |
| Onboarding step indicator shows wrong count | Step sequence varies by subject type | "Step 2 of 3" when there are 4 steps | Compute step count dynamically from the actual applicable steps |
| Back from onboarding loses interview state | Interview has a 7-day expiry | "After 7 days away, we start fresh" | Restart Interview card (existing behavior, unchanged) |
