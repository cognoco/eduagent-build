---
title: 'Study And Mentor Mode Navigation'
slug: 'study-and-mentor-mode-navigation'
created: '2026-05-19'
status: 'draft'
tech_stack:
  - Expo Router
  - React Native
  - TanStack Query
files_to_modify: []
code_patterns: []
test_patterns: []
---

# Tech-Spec: Study And Mentor Mode Navigation

**Created:** 2026-05-19

## Overview

### Problem Statement

MentoMate is a study app for learners of any age, with a family layer for adults who support child learners. The current parent navigation mixes family mentoring and the parent's own learning in one shell, which makes tabs like Library and Progress ambiguous. Parents can study too, but the app needs to make the current job unmistakable: studying as myself, mentoring my family, or viewing a specific child.

### Solution

Introduce clear Study and Mentor app contexts. New users are offered a simple starting intent before the app knows who they are: Study or Mentor. After registration/profile setup, the app resolves what they can actually access. Users with only learning capability see Study only. Adults with family/child capability can switch between Study and Mentor once both contexts are active. Mentor mode gets its own clean tab shape focused on family support: Family, Recaps, Progress, More. Study mode keeps the existing learner tab shape: My Learning, Library, Progress, More.

### Scope

**In Scope:**

- Pre-registration/onboarding intent choice offering Study or Mentor to everyone, without treating the choice as a permanent identity.
- Post-registration capability resolution:
  - Under-18 users get Study only.
  - Adults without child/family capability get Study only.
  - Adults with child/family capability can use Mentor.
  - Adults who activate both Study and Mentor can switch between the two clear contexts.
- Study mode navigation:
  - My Learning
  - Library
  - Progress
  - More
- Mentor mode navigation:
  - Family
  - Recaps
  - Progress
  - More
- Recaps as a separate Mentor tab from v1.
- Mentor Progress keeps today's child/family progress behavior, but removes the parent's own progress from Mentor mode.
- Parent-to-study bridge from Recaps or child session surfaces, such as "Learn this too", switching the same adult account into Study mode as themselves.
- The same person/account remains linked across modes; switching modes must not create a separate identity.
- Child learner/profile model supports both parent-managed child profiles and linked child learner accounts.

**Out of Scope:**

- Family challenges, competitions, leaderboards, team points, or quiz contests.
- Rebuilding the learning engine or learner home.
- Replacing the existing Progress implementation beyond context-specific filtering/labeling.
- Forcing every app open through a mode chooser.
- Treating Study/Mentor as permanent account types.
- Assuming every child learner has a linked account.
- Assuming learner accounts are adult-only or age-gated.

## Context for Development

### Codebase Patterns

- Mobile authenticated routes live under `apps/mobile/src/app/(app)/`.
- The current tab shell is implemented in `apps/mobile/src/app/(app)/_layout.tsx`.
- Current tab shapes:
  - Guardian: `home`, `own-learning`, `library`, `progress`, `more`.
  - Learner: `home`, `library`, `progress`, `more`.
  - Parent proxy: `home`, `library`, `progress`.
- The current guardian home tab presents as Family Hub through `resolveHomeTabPresentation()`.
- Parent home/family surface lives through `apps/mobile/src/components/home/ParentHomeScreen.tsx`.
- Parent's own learning currently routes through `apps/mobile/src/app/(app)/own-learning.tsx`.
- Learner home is already reusable through `apps/mobile/src/components/home/LearnerScreen.tsx`.
- Parent-visible child session recaps already exist under `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`.
- Parent proxy/viewing-child chrome exists through `ProxyBanner` in `(app)/_layout.tsx`.
- Existing specs already separate child profile, progress, and reports surfaces; this spec should build on that direction rather than duplicate it.
- Mobile uses React Context for auth/profile state and TanStack Query for server state. Do not introduce a new global store unless investigation proves existing profile/app context cannot support mode state.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/mobile/src/app/(app)/_layout.tsx` | Current tab shape resolution, visible tabs, proxy banner, and tab labels |
| `apps/mobile/src/app/(app)/home.tsx` | Current landing route that chooses parent vs learner home content |
| `apps/mobile/src/app/(app)/own-learning.tsx` | Parent path into their own learner experience |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Current Family Hub / parent dashboard surface and child actions |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Current Study mode learner home |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Existing Progress behavior, including parent/child/self profile selection |
| `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` | Existing parent-facing session recap surface and possible "Learn this too" bridge |
| `apps/mobile/src/app/profiles.tsx` | Existing profile switching and child account/profile entry points |
| `apps/mobile/src/hooks/use-parent-proxy.ts` | Existing parent-viewing-child context detection |
| `apps/mobile/src/hooks/use-active-profile-role.ts` | Existing role detection for child/owner/proxy contexts |
| `docs/specs/2026-05-13-parent-child-surfaces-information-architecture.md` | Related IA spec separating parent child surfaces |
| `docs/plans/2026-05-11-progress-reports-first.md` | Related Progress/report behavior and self-learning report support |
| `.claude/memory/project_product_roles_students_any_age.md` | Product model: students of any age, parent/family layer, child accounts optional |

### Technical Decisions

- Study and Mentor are app contexts/modes, not permanent account types.
- Onboarding can ask for starting intent before registration knows age/family capability, but capability gates are enforced after registration/profile setup.
- Do not ask every dual-capability user to choose on every app open. Use onboarding/default context first, then show clear entry points once both Study and Mentor are active.
- Recaps is a first-class Mentor tab, separate from Progress.
- Mentor Progress means child/family progress only. The parent's own progress belongs to Study mode.
- Study mode is the same learner experience used by solo learners and parents studying as themselves.
- "Learn this too" starts Study mode for the same adult account and may carry source context from a child recap/session.
- Family challenges are deferred to a later spec.

## Implementation Plan

### Tasks

Pending deep investigation.

### Acceptance Criteria

Pending spec generation.

## Additional Context

### Dependencies

- Existing profile/family link model.
- Existing parent home and learner home surfaces.
- Existing progress and child session recap data.
- Existing profile switching/proxy logic.

### Testing Strategy

Pending deep investigation. Expected coverage will include mobile unit tests for tab-shape resolution, mode gating, mode switching, and Progress filtering by context, plus seeded web/mobile journeys for Study-only, Mentor-default, and dual-context adult accounts.

### Notes

- Working labels are Study and Mentor. Final copy can be polished later without changing the model.
- Keep the user-facing model simple: everyone can study; adults with family capability can mentor.
- The active context must always be obvious enough that Library and Progress do not require the user to infer whose learning they are seeing.
