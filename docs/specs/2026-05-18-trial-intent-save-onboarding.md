---
title: 'Trial Intent Save Onboarding'
slug: 'trial-intent-save-onboarding'
created: '2026-05-18'
status: 'historical — partially implemented'
tech_stack:
  - Expo Router
  - React Native
  - Clerk
  - Hono API
  - Drizzle
  - LLM router
files_to_modify:
  - apps/mobile/src/app/preview/index.tsx
  - apps/mobile/src/app/preview/intent.tsx
  - apps/mobile/src/app/preview/topic.tsx
  - apps/mobile/src/app/preview/lesson.tsx
  - apps/mobile/src/app/preview/parent.tsx
  - apps/mobile/src/app/(app)/preview/save.tsx
  - apps/mobile/src/app/(auth)/sign-up.tsx
  - apps/mobile/src/app/(auth)/_layout.tsx
  - apps/mobile/src/app/(app)/_layout.tsx
  - apps/mobile/src/app/create-profile.tsx
  - apps/mobile/src/app/(app)/session/index.tsx
  - apps/mobile/src/components/session/ChatShell.tsx
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/lib/preview-onboarding-state.ts
  - apps/mobile/src/lib/pending-auth-redirect.ts
  - apps/mobile/src/lib/profile.ts
  - apps/mobile/src/lib/sign-out-cleanup.ts
  - apps/api/src/index.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/routes/preview-onboarding.ts
  - apps/api/src/routes/profiles.ts
  - apps/api/src/services/profile.ts
  - apps/api/src/services/preview-onboarding.ts
  - apps/api/src/routes/subjects.ts
  - apps/api/src/services/subject.ts
  - packages/schemas/src/preview-onboarding.ts
  - packages/schemas/src/profiles.ts
  - packages/schemas/src/subjects.ts
code_patterns:
  - Pre-signup intent is routing context, not account identity.
  - Post-signup save target creates the real profile shape.
  - Parent-intent users land in parent setup/home, not learner chat.
  - Preview lessons are constrained and make no saved-memory claim.
test_patterns:
  - Co-located React Native Jest tests for routing and wizard state.
  - API service/route tests for preview claim, profile creation, and access rules.
  - E2E smoke for learner, parent, both, and not-sure onboarding branches.
---

# Spec: Trial Intent Save Onboarding

**Date:** 2026-05-18

> **STATUS (last verified 2026-07-22): HISTORICAL — PARTIALLY IMPLEMENTED.** The
> save wizard shipped as the inline `SaveWizardGate` in
> `apps/mobile/src/app/(app)/_components/save-wizard/SaveWizardGate.tsx`, mounted by
> `apps/mobile/src/app/(app)/_layout.tsx` and covered by `SaveWizardGate.test.tsx`
> plus `_layout.test.tsx`. The server-backed trial preview lesson remains unbuilt
> and is explicitly OUT in
> `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md` §2; the launch path is the
> honest sample-topic → marketing → signup funnel. This historical spec authorizes
> no remaining build.

## Overview

### Problem

The fastest way to prove MentoMate's value is a short lesson, but not every new user is primarily a learner. Some users arrive as parents who want to monitor and support a child. If every "try it" path drops users into the full app or a learner chat, monitoring parents misread the product as a student-only chat app.

The app needs to do two things at once:

- Let self-learners experience a focused lesson immediately.
- Route parent-intent users toward child setup, linking, and the parent home before they feel misplaced.

### Product Rule

Intent first, identity later.

A pre-signup answer routes the preview. A post-signup save choice creates the account/profile model.

### Solution

Add a lightweight pre-signup intent question and a constrained preview path. After signup, do not restart onboarding. Show a short save-and-personalize wizard that asks where to save the thing the user just tried: my learning, my child's learning, or both. The wizard creates the correct profile structure and lands the user on the correct home surface.

### Reuse-First Constraint

This is not a new app shell, a replacement Home, or a second full onboarding system. Reuse the existing auth, profile creation, session, subject, learner Home, and parent Home machinery wherever possible.

New work should be a thin layer around the current product:

- Signed-out preview routes.
- Preview state handoff through signup.
- Post-auth save wizard.
- Optional bounded preview lesson API.
- Small Parent Home hierarchy adjustments if the current ordering still feels noisy.

Do not create a parallel profile model, a new bottom navigation system, a duplicate parent dashboard, a second subject-creation pipeline, or a broad feature-reveal framework for this spec.

## Scope

### In Scope

- A pre-signup intent screen:
  - Me
  - My child
  - Both
  - Not sure yet
- A contained learner preview lesson for "Me" and optionally "Not sure yet".
- A parent-oriented preview/setup path for "My child".
- A "Both" branch that asks which setup to do first.
- Signup handoff that preserves preview state.
- Post-signup save wizard:
  - Save to my learning
  - Save to my child's learning
  - Save to both
- Profile creation rules for self, child, and both.
- Session style and normal-session length preferences.
- Landing rules after the wizard.
- Failure modes for auth handoff, abandoned preview state, parent/child ambiguity, and consent.
- Reuse of existing Home surfaces, with only a light Parent Home clarity pass if needed.

### Out of Scope

- Replacing the full app onboarding system.
- Showing the full tab shell during preview.
- Homework photo upload during preview.
- Profile switching during preview.
- Library, progress, settings, reports, or saved memory during preview.
- Free-text parent-to-child messages.
- A separate subscription or billing trial change. This spec's "trial lesson" is a product preview, not `services/trial.ts` billing trial state.
- Long subject-list onboarding.
- Making the preview lesson an unlimited support chat.
- Child-to-parent account invite/linking if no existing family-invite backend exists. V1 should support creating a child profile on the parent's account; separate-device invite/link can be a follow-up unless an invite service already exists by implementation time.
- Replacing learner Home, parent Home, the bottom nav, or the current parent dashboard.
- Creating a new progressive feature-unlock system. Existing tabs/features can remain; this spec only changes entry, save, and first-landing emphasis.

## User Journeys

### Self Learner

1. User taps "Try a quick lesson".
2. App asks: "Who are you setting this up for?"
3. User chooses "Me".
4. App asks: "What should we help with?"
5. User enters a topic, for example "fractions".
6. App opens a full-screen preview lesson.
7. Header shows "Trial lesson: 3 questions left".
8. First mentor message starts teaching immediately:

   > Great, let's start with fractions. I'll explain one idea, then ask you a quick question.

9. After 3 to 5 meaningful turns, the lesson stops with:

   > Want me to save this and build your next lesson? Create a profile.

10. User signs up.
11. Save wizard asks where to save the lesson.
12. User chooses "My learning".
13. Wizard asks name, birth date/year, session style, and normal session length.
14. App creates the learner profile, saves the preview topic/lesson, and lands in the learner continuation path.

### Parent Monitoring A Child

1. User taps "Try MentoMate".
2. App asks: "Who are you setting this up for?"
3. User chooses "My child".
4. App does not open learner chat by default.
5. App shows parent-oriented setup preview:
   - Set up your parent account
   - Add a child profile
   - Link a child who has their own device, if supported
   - Preview what a weekly insight looks like
6. Primary CTA is "Create or link child".
7. User signs up.
8. Save wizard asks whether to create a child profile now.
9. Wizard creates parent owner profile first, then child profile.
10. App lands on parent home, not learner home.

### Both

1. User chooses "Both".
2. App asks: "What do you want to set up first?"
3. Options:
   - My child first
   - My learning first
4. Default/recommended option is "My child first".
5. If child first, route through parent setup and land on parent home.
6. If my learning first, route through learner preview and later offer "Add child now" or "Later" in the save wizard.

### Not Sure Yet

1. User chooses "Not sure yet".
2. App gives a low-commitment choice:
   - Try a quick lesson
   - See how parent setup works
3. If they try a lesson, the post-signup save screen still asks where to save it.
4. Their preview answer never locks them into a profile shape.

## UX Requirements

### Pre-Signup Intent Screen

Copy:

> Who are you setting this up for?

Options:

- Me
- My child
- Both
- Not sure yet

Rules:

- This screen is not a legal identity decision.
- Do not say "profile" yet.
- Do not mention account structure.
- Store this as preview routing context only.
- The user can correct it later on the save screen.

### Learner Preview Lesson

The preview lesson looks like chat, but behaves like a guided demo lane.

Required constraints:

- Full-screen surface.
- No tab bar.
- No library, progress, More, settings, profile switching, or saved notes.
- No homework photo upload in v1.
- No mentor memory claims.
- No "I will remember this" copy.
- No open-ended forever chat.
- Counter visible in the header, for example "Trial lesson: 3 questions left".
- Maximum 5 assistant turns.
- Maximum 5 user turns.
- End with a save/signup CTA after 3 to 5 useful turns.

Teaching rules:

- The first assistant message teaches immediately.
- Do not start with "Tell me about your goals."
- The lesson should explain one idea, ask one quick question, respond to the answer, and show a small win.
- The preview should prefer text-first. Voice can be added later after consent and account state are clear.

### Parent Preview Path

The parent preview is not a learner chat by default.

It should show:

- What setup does:
  - create parent account
  - add or link a child
  - see progress and reports after learning happens
- A sample weekly insight with clearly marked sample data.
- A "Create or link child" CTA.
- A secondary "Try a sample lesson first" CTA for parents who want to inspect the learner experience.

Do not show:

- A fake full dashboard that looks live.
- Child data claims before a child profile exists.
- Surveillance-flavored copy.
- A prompt implying the parent must add a child before continuing forever.

### Signup Handoff

When the user starts signup from a preview, the app must preserve:

- intent answer
- preview path: learner, parent, both, not_sure
- entered topic, if any
- preview lesson id, if any
- selected priority for both, if any
- desired save target if already selected

Existing auth redirect behavior lives in `apps/mobile/src/lib/pending-auth-redirect.ts`. Extend or pair it with a preview-onboarding store so signup returns to the save wizard instead of the generic profile gate.

### Post-Signup Save Wizard

Header copy:

> Great, let's save this and make the next session fit.

First wizard step:

> Where should we save this?

Options:

- My learning
- My child's learning
- Both

Rules:

- Preselect based on pre-signup intent, but allow changing.
- If there was a preview topic, show it in the summary, for example "Fractions".
- If there was no preview topic, ask for one first subject only.
- Do not ask for a long subject list.
- Do not call this a new onboarding questionnaire.

### Profile Basics

If saving to my learning:

- Ask display name.
- Ask birth date or birth year, matching current create-profile requirements.
- Create the owner profile.
- Save/import preview to that profile.

If saving to my child's learning:

- Create parent owner profile first:
  - parent display name
  - parent birth date/year
- Then create child profile:
  - child nickname/display name
  - child birth date/year
  - consent-safe copy from the existing child create-profile flow
- Keep active profile as parent after child creation.
- Save/import preview to the child profile only after the child profile exists and consent state allows it.
- Land on parent home.

If saving to both:

- Create the parent/adult learner profile first.
- Ask whether to add the child now or later.
- If add child now, create child profile and save/import the preview to both profiles only if the user explicitly chose "Both".
- If later, save to the owner profile and land on parent-capable home with an "Add child" action.

### Session Preferences

After profile basics, ask only practical preferences:

> How should sessions work?

Options:

- Audio-first
- Text-first
- Step-by-step
- No preference

Copy rule:

- Do not label this "accommodations" in the wizard.
- Later settings may call it "Learning preferences" or "Support needs".

Then ask:

For self:

> How long do you usually want to study?

For child:

> How long do you usually study together?

For both:

> What should a normal session feel like?

Options:

- 10 min
- 20 min
- 30 min
- 40+

### Confirmation

Show a concise plan:

> Your first plan: 20-minute step-by-step sessions for fractions.

CTA variants:

- Self learner: "Continue lesson"
- Parent with child: "Go to parent home"
- Both child-first: "Open parent home"
- Both self-first: "Continue lesson"

### Account Shell And Overwhelm

Current Home already contains much of the command-center behavior:

- Learner Home already exposes homework help, ask anything, practice, study-new actions, and subject continuation.
- Parent Home already exposes add-child setup, child cards, progress, reports, nudges, and tonight prompts.

This spec should not rebuild those surfaces. The overwhelm fix is narrower:

- Route users to the correct existing Home branch earlier.
- Preserve stable bottom-nav anchors after account creation.
- Emphasize one relevant primary action in Home instead of making every feature feel equally urgent.
- Keep secondary actions available but quieter.

For V1, do not hide or unlock major features dynamically. If an area is not useful yet, its empty state should point to an existing next action, such as continuing the first lesson or adding a child.

### Parent Home Clarity Pass

If parent-intent users still land on a visually busy Home after the new front door, adjust `ParentHomeScreen` by reordering and reweighting existing sections rather than adding new parent features.

Preferred hierarchy:

1. **Today**: one primary family action, such as add first child, help a child start, read a report, send a nudge, or inspect an attention item.
2. **Children**: existing child cards with one obvious primary action per child.
3. **Family**: existing family management and account-adjacent actions, quieter than the daily command area.

The goal is a clearer parent Home, not a new dashboard.

## Routing And Landing Rules

| Pre-signup intent | Preview route | Save default | Final landing |
| --- | --- | --- | --- |
| Me | Learner preview lesson | My learning | Learner continuation or Home learner surface |
| My child | Parent setup preview | My child's learning | Parent home |
| Both, child first | Parent setup preview | My child's learning | Parent home |
| Both, me first | Learner preview lesson | Both | Continue lesson, then parent add-child prompt if not added |
| Not sure, lesson | Learner preview lesson | Ask explicitly | Based on save target |
| Not sure, parent preview | Parent setup preview | Ask explicitly | Based on save target |

If the final account has an owner profile but zero linked children, existing app logic should treat the user as a solo learner unless they are in the middle of the child-first wizard. Do not use raw `isOwner` alone to show parent home.

## Data And Architecture

### Existing Surfaces To Reuse

| Surface | Current file |
| --- | --- |
| Signup | `apps/mobile/src/app/(auth)/sign-up.tsx` |
| Auth redirect handoff | `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/lib/pending-auth-redirect.ts` |
| No-profile authenticated gate | `apps/mobile/src/app/(app)/_layout.tsx` |
| Profile creation | `apps/mobile/src/app/create-profile.tsx` |
| Profile context and linked-child helpers | `apps/mobile/src/lib/profile.ts` |
| Learner home and parent home | `apps/mobile/src/components/home/LearnerScreen.tsx`, `ParentHomeScreen.tsx` |
| Session chat | `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/components/session/ChatShell.tsx` |
| Profile API | `apps/api/src/routes/profiles.ts`, `apps/api/src/services/profile.ts` |
| Subject creation | `apps/api/src/routes/subjects.ts`, `apps/api/src/services/subject.ts` |
| Current onboarding dimensions | `apps/mobile/src/app/(app)/onboarding/*`, `apps/api/src/routes/onboarding.ts` |

Reuse rule: prefer adapting these surfaces over creating preview-specific duplicates. Add new components only when the current component cannot safely be used because preview is signed out, intentionally constrained, or must avoid saved-memory/account claims.

### New Mobile State

Add a small preview onboarding state module, for example:

`apps/mobile/src/lib/preview-onboarding-state.ts`

State shape:

```ts
type PreviewIntent = 'self' | 'child' | 'both' | 'not_sure';
type PreviewPath = 'learner_lesson' | 'parent_setup';
type SaveTarget = 'self' | 'child' | 'both';

interface PreviewOnboardingState {
  intent: PreviewIntent;
  path: PreviewPath;
  topicText?: string;
  previewSessionId?: string;
  bothPriority?: 'child_first' | 'self_first';
  preferredSaveTarget?: SaveTarget;
  createdAt: string;
}
```

Storage:

- Use an Expo-safe key such as `mentomate_preview_onboarding_state`.
- TTL: 24 hours.
- Clear after successful save/import.
- Clear on sign-out cleanup.
- Do not store raw child names before signup unless the user typed one in the wizard.

### New Mobile Routes

Suggested route files:

- `apps/mobile/src/app/preview/index.tsx`
- `apps/mobile/src/app/preview/intent.tsx`
- `apps/mobile/src/app/preview/topic.tsx`
- `apps/mobile/src/app/preview/lesson.tsx`
- `apps/mobile/src/app/preview/parent.tsx`
- `apps/mobile/src/app/(app)/preview/save.tsx`

The pre-auth `preview/*` routes live outside `(app)` so they are reachable before auth. The post-auth save route lives inside `(app)`, but `apps/mobile/src/app/(app)/_layout.tsx` must route no-profile users with preview state to the save wizard instead of the generic `CreateProfileGate`.

### Preview Lesson API

Use the internal term "preview lesson", not "billing trial".

Two acceptable implementation modes:

1. Preferred v1 if abuse controls are ready: server-backed preview lesson.
2. Fallback v1 if public LLM risk is too high: deterministic scripted lesson with the same UI and save wizard.

If server-backed, add:

- `packages/schemas/src/preview-onboarding.ts`
- `apps/api/src/routes/preview-onboarding.ts`
- `apps/api/src/services/preview-onboarding.ts`

Public endpoints:

- `POST /v1/preview-onboarding/start`
- `POST /v1/preview-onboarding/:previewId/messages`

Authenticated endpoint:

- `POST /v1/preview-onboarding/:previewId/claim`

Auth middleware:

- Add `/v1/preview-onboarding/` to `PUBLIC_PATHS` only for `start` and `messages`.
- `claim` must require auth.
- If route-level public matching cannot distinguish claim safely, split public and authenticated route prefixes.

Preview lesson constraints:

- Server hard cap: maximum 5 user messages per preview id.
- Server hard cap: maximum 5 assistant responses per preview id.
- Server hard cap: response text length.
- Server hard cap: no tool/upload/image inputs.
- No memory retrieval or memory writes.
- No session, subject, retention, XP, streak, dashboard, or summary writes before claim.
- LLM calls go through `services/llm/router.ts`.
- Prompt and parser live in a dedicated preview service, not in route handlers.
- Public preview calls require rate limiting by hashed device id plus IP fallback.

Preview storage:

- Store only what is needed to continue and claim:
  - preview id
  - intent/path
  - topic text
  - bounded transcript
  - question count
  - createdAt/expiresAt
  - claimedAt
- Do not write to profile-scoped tables until authenticated claim.
- Do not store raw IP addresses.

### Claim And Import

`POST /preview-onboarding/:previewId/claim` receives:

- targetProfileId
- saveTarget
- sessionStyle
- sessionLengthMinutes

It should:

1. Verify the preview exists, is unexpired, and is not already claimed.
2. Verify the target profile belongs to the authenticated account.
3. For child targets, verify the parent owns or is linked to the child.
4. If consent is required and not active, save the topic intent but do not import transcript into learning state until consent is active.
5. Create or reuse a subject using existing subject creation patterns:
   - use `subjectCreateSchema`
   - preserve `rawInput`
   - use `createSubjectWithStructure()` for actual subject setup
6. Optionally create a real learning session with metadata:

```ts
{
  source: 'preview_onboarding',
  previewSessionId: string,
  importedPreview: true,
  saveTarget: 'self' | 'child' | 'both'
}
```

7. Mark preview as claimed.
8. Return next route:
   - continue lesson/session
   - parent home
   - child setup continuation

If the transcript import is deferred, the user-facing copy should say:

> We'll use this topic for the first lesson once setup is complete.

Do not claim that the full chat was saved when it was not.

## Implementation Plan

### Phase 1: Routing And Wizard Shell

1. Add preview intent screens under `apps/mobile/src/app/preview/`.
2. Add `preview-onboarding-state.ts` with TTL and sign-out cleanup.
3. Add signup CTA wiring so preview starts signup with a pending save redirect.
4. Modify `(app)/_layout.tsx` no-profile gate:
   - if preview state exists, render/push the save wizard
   - otherwise keep existing `CreateProfileGate`
5. Add save wizard screens/components.
6. Use existing `/profiles` POST to create owner and child profiles in sequence.
7. Land self users in learner continuation and parent users in parent home.
8. Confirm existing learner Home and parent Home cover the target landing jobs before adding any new Home components.

### Phase 2: Preview Lesson Engine

1. Add schema definitions for preview intent, messages, and claim.
2. Add public preview start/message routes with strict caps.
3. Add preview service with prompt rules and LLM router use.
4. Add rate limiting and observability for public preview calls.
5. Add claim/import endpoint.
6. Import preview topic into subject setup after profile creation.
7. If transcript import is chosen, create a real session only after auth and target profile resolution.

### Phase 3: Parent Link/Invite Upgrade

1. If a separate-device child linking service exists, integrate it into the child-first wizard.
2. If it does not exist, add a future family-invite spec.
3. Keep "Create child profile on this device/account" as the v1 supported path.

### Phase 4: Parent Home Clarity Pass, If Needed

Only run this phase if implementation review or usability testing shows parent Home remains overwhelming after the new routing/save flow.

1. Reorder existing `ParentHomeScreen` sections toward Today -> Children -> Family.
2. Reuse existing child cards, reports, nudge actions, family summary, and add-child actions.
3. Avoid adding new data dependencies unless an existing query already exposes the needed state.
4. Keep learner Home unchanged unless trial/save routing reveals a concrete first-use bug.

## Acceptance Criteria

1. Given a signed-out user taps "Try a quick lesson", when the preview starts, then the first screen asks who they are setting it up for.
2. Given the user chooses "Me", when they enter "fractions", then they enter a full-screen constrained preview lesson with no tab bar and a visible remaining-question counter.
3. Given the user chooses "My child", when the next screen appears, then the default path is parent setup preview, not learner chat.
4. Given the user chooses "Both", when asked what to set up first, then "My child first" is available and recommended.
5. Given a preview lesson reaches its turn cap, when the mentor responds, then it stops with a create-profile/save CTA and does not keep accepting open-ended chat.
6. Given the user signs up from a preview, when auth completes, then the app returns to the save wizard rather than the generic create-profile gate.
7. Given a self learner chooses "Save to my learning", when they complete profile basics, then the owner profile is created and the preview topic is attached to that profile.
8. Given a parent chooses "Save to my child's learning", when they complete setup, then the owner profile is created first, the child profile second, and the active profile remains the parent.
9. Given a parent completes child setup, when the wizard finishes, then the app lands on parent home.
10. Given the user changes their mind on the save screen, when they choose a different save target, then the app creates the profile structure implied by the save target, not by the original pre-signup answer.
11. Given preview state is older than 24 hours, when signup completes, then the app falls back to normal profile creation with a friendly message instead of crashing or looping.
12. Given no preview state exists, when a new signed-in account has no profile, then existing `CreateProfileGate` behavior remains unchanged.
13. Given a user completes signup and profile setup, when they enter the full app, then the existing bottom navigation remains the stable account shell.
14. Given a parent-intent user completes child setup, when they land on Home, then existing parent Home actions are reused and the top area presents one clear next family action.
15. Given an area has no useful data yet, when the user opens it, then it shows a helpful empty state pointing to an existing next action rather than introducing a new feature gate.

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Preview state expires during signup | User starts preview, leaves, returns after TTL, then signs up | "That preview expired, but we can set up your first lesson now." | Fall back to normal save wizard asking for one topic, or normal create-profile gate if no topic is known |
| User chose child pre-signup but now wants self | Save screen target changes from child to self | Self profile setup | Use save target as source of truth; discard child-first routing context |
| Parent creates first child under free tier | First child profile is allowed by existing profile creation exception | Child setup succeeds | Existing `createProfileWithLimitCheck()` first-child allowance remains source of truth |
| Parent tries to import preview to child with restricted consent | Child profile consent is `PENDING`, `PARENTAL_CONSENT_REQUESTED`, or `WITHDRAWN` | Topic is saved as setup intent, transcript is not imported as learning data | Import after consent if supported; otherwise start fresh lesson from saved topic |
| Preview lesson API is abused | Public endpoint receives many starts/messages from same device/IP | Rate-limited preview error | Show "Try again later" and offer signup; log structured metric |
| Public LLM route bypasses quota | Preview routes are public by design | No paid quota decrement happens | Dedicated preview cap/rate limit is mandatory; do not add preview routes to normal metering without an account/profile |
| User refreshes web during preview | Browser loses in-memory state | Preview can restore from session storage if fresh | If restore fails, show intent screen again |
| OAuth signup returns before profiles load | Auth completes but profile query is still loading | Neutral loading state | Existing profile loading timeout remains; save wizard waits for auth/account readiness |
| Duplicate claim request | User double-taps continue or network retries | One claim wins, second gets idempotent claimed response | Claim endpoint is idempotent by preview id plus account id |
| Both save target creates one profile then fails on second | Parent profile created, child creation fails | Wizard shows retryable child setup error | Keep parent profile; retry child creation; do not import preview to child until child exists |
| Parent lands in learner home after child setup | Linked-child query stale after creating child | Parent briefly sees learner home or wrong CTA | Optimistically update profiles cache, invalidate `profiles`, and route to `/(app)/home` after child link exists |
| "Trial" confused with subscription trial | Copy says "trial" near billing screens | User thinks payment trial started | Use internal "preview" in code; visible "Trial lesson" only in lesson header, not subscription surfaces |
| No separate-device child link exists | Parent selects "link child" but backend is absent | Unsupported dead end | V1 should hide or mark link-own-device as "coming soon"; supported path is create child profile |

## Testing Strategy

### Mobile Unit Tests

- `preview-onboarding-state.test.ts`
  - saves, restores, expires, and clears state
  - uses Expo-safe key
  - clears on sign-out cleanup
- `preview/intent.test.tsx`
  - each intent routes to the correct preview path
- `preview/lesson.test.tsx`
  - no tab bar
  - counter visible
  - save CTA appears at cap
  - upload/profile/library controls absent
- `preview/parent.test.tsx`
  - parent intent shows parent setup preview
  - learner chat is not the default CTA
- `(app)/_layout.test.tsx`
  - no-profile plus preview state shows save wizard path
  - no-profile without preview state keeps existing create-profile gate
- `preview/save.test.tsx`
  - save target overrides pre-signup intent
  - child target creates parent then child
  - both target offers add child now/later

### API Tests

If server-backed preview is implemented:

- `preview-onboarding.test.ts`
  - public start route accepts valid intent/topic
  - message route enforces turn cap
  - message route rejects upload/image input
  - rate limit rejects abusive public requests
  - preview messages use LLM router, not direct provider SDK
- `preview-onboarding.claim.test.ts`
  - claim requires auth
  - claim rejects expired preview
  - claim is idempotent
  - self target verifies profile ownership
  - child target verifies parent/child relationship
  - restricted-consent child does not import transcript as learning data

### E2E Smoke

- Self learner: preview lesson -> signup -> save to my learning -> continue lesson.
- Parent: intent child -> signup -> create parent + child -> parent home.
- Both child-first: intent both -> child first -> parent home.
- Not sure: intent not sure -> lesson -> signup -> choose child -> parent home.
- Expired state: seed expired preview state -> signup -> friendly fallback.

## Verification Before Done

- Small-screen pass on Galaxy S10e dimensions for every preview and wizard step.
- Confirm preview surfaces hide the tab bar.
- Confirm no saved-memory copy appears before signup and save.
- Confirm final landing by profile shape:
  - self only -> learner
  - child linked -> parent home
  - both -> according to chosen priority and created profiles
- Confirm no duplicate Home, bottom nav, parent dashboard, profile model, or subject-creation path was introduced.
- Confirm Parent Home changes, if any, reuse existing data and actions.
- Confirm `services/trial.ts` billing behavior is untouched.
- Confirm no direct LLM provider call was added.
- If prompt files are added or changed, run `pnpm eval:llm` and stage snapshots.

## Decision Log

- **2026-05-18:** Chosen pattern is "intent first, identity later." The pre-signup answer routes the preview. The post-signup save target creates the actual profile model.
- **2026-05-18:** Parent-intent users do not default into learner chat. They see parent setup/child-link value first, with sample lesson as a secondary path.
- **2026-05-18:** The preview lesson is internally named "preview" to avoid coupling to billing trial state, even if the visible lesson header can say "Trial lesson".
- **2026-05-18:** Post-signup wizard should feel like saving the thing the user just did, not starting over with a generic onboarding questionnaire.
- **2026-05-18:** Current learner Home and parent Home already contain the main command-center ingredients. This spec should reuse them and change front-door routing, save handoff, and first-landing emphasis before adding new Home surfaces.
