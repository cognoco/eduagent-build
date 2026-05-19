---
title: 'Study And Family Mode Navigation'
slug: 'study-and-family-mode-navigation'
created: '2026-05-19'
status: 'draft'
tech_stack:
  - Expo Router
  - React Native
  - TanStack Query
  - Hono API
  - Drizzle
files_to_modify:
  - apps/mobile/src/app/(app)/_layout.tsx
  - apps/mobile/src/app/(app)/home.tsx
  - apps/mobile/src/app/(app)/progress/index.tsx
  - apps/mobile/src/app/(app)/recaps.tsx
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/components/home/LearnerScreen.tsx
  - apps/mobile/src/app/profiles.tsx
  - apps/mobile/src/lib/sign-out.ts
  - apps/api/src/routes/dashboard.ts
  - apps/api/src/services/dashboard.ts
  - packages/schemas/src/profile.ts
code_patterns:
  - Keep exactly two TabShape values: guardian and learner.
  - Family mode replaces the current guardian/hybrid visible tabs.
  - Study mode uses the learner visible tabs.
  - Parent review uses parent-native Recaps/Progress, not proxy mode.
test_patterns:
  - Co-located React Native Jest tests for tab visibility, mode gating, and progress filtering.
  - API service/route tests for parent recap feed scoping.
  - Playwright role journeys for Study-only, Family-only/default, and dual-context adult accounts.
---

# Tech-Spec: Study And Family Mode Navigation

**Created:** 2026-05-19

## Overview

### Problem Statement

MentoMate is a study app for learners of any age, with a family layer for adults who support child learners. The current parent navigation mixes family support and the parent's own learning in one shell, which makes tabs like Library and Progress ambiguous. Parents can study too, but the app needs to make the current job unmistakable: studying as myself, supporting my family, or viewing a specific child.

### Solution

Introduce two clear app contexts without adding a third tab shape. **Study mode** uses the existing learner shape: My Learning, Library, Progress, More. **Family mode** replaces the current guardian/hybrid shape: Family, Recaps, Progress, More. Adults with family capability can switch between Study and Family after both contexts are available, but the app never mixes both jobs in one tab bar.

Parent review should be parent-native. The normal parent path for child session summaries is the new Recaps tab, not "view as child" proxy mode. Proxy mode remains technically available only as an internal/exception path until it is audited and safely removed or hidden completely.

### Scope

**In Scope:**

- First-run intent choice offering Study or Family to everyone, without treating the choice as a permanent identity.
- No durable pre-auth intent storage. Before account/profile creation, intent is ephemeral UI state only.
- Post-registration capability resolution:
  - Under-18 users get Study only.
  - Adults without child/family capability get Study only.
  - Adults with child/family capability can use Family.
  - Adults who activate both Study and Family can switch between the two clear contexts.
- Study mode navigation using the existing learner shape:
  - My Learning
  - Library
  - Progress
  - More
- Family mode navigation replacing the current guardian/hybrid visible tabs:
  - Family
  - Recaps
  - Progress
  - More
- Recaps as a first-class Family tab from v1.
- Family Progress keeps today's child/family progress behavior, but removes the parent's own progress from Family mode.
- Parent-to-study bridge from Recaps or child session surfaces, such as "Learn this too", switching the same adult account into Study mode as themselves.
- The same person/account remains linked across modes; switching modes must not create a separate identity.
- Hide proxy/view-as-child from normal end-user paths once Recaps covers parent review.

**Out of Scope:**

- Adding a third `TabShape` value.
- Keeping the current guardian/hybrid visible tab set after Family mode ships.
- Family challenges, competitions, leaderboards, team points, or quiz contests.
- Rebuilding the learning engine or learner home.
- Replacing the existing Progress implementation beyond context-specific filtering/labeling.
- Forcing every app open through a mode chooser.
- Treating Study/Family as permanent account types.
- Fully deleting proxy mode before a usage audit confirms it is safe.
- Assuming every child learner has a linked account.
- Assuming learner accounts are adult-only or age-gated.

## Glossary

| Term | Meaning |
| ---- | ------- |
| Study mode | The user's own learning context. Progress, Library, and sessions are for the active user/profile. |
| Family mode | The adult family-support context. Recaps and Progress are about child learners the adult can support. |
| AI mentor | The LLM/tutor voice and conversation behavior. This is unrelated to Family mode; avoid using "mentor" as a technical mode name. |
| Parent proxy / view-as-child | Existing preview context where a parent sees a child learner surface with proxy chrome. This should not be the normal parent review UX. |
| Child learner/profile | A child learning record. It may be parent-managed only or linked to the child's own learner account. |

## Context for Development

### Codebase Patterns

- Mobile authenticated routes live under `apps/mobile/src/app/(app)/`.
- The current tab shell is implemented in `apps/mobile/src/app/(app)/_layout.tsx`.
- Current `TabShape` is exactly `guardian | learner`; this spec must preserve that invariant.
- Current tab visibility sets:
  - Guardian: `home`, `own-learning`, `library`, `progress`, `more`.
  - Learner: `home`, `library`, `progress`, `more`.
  - Parent proxy visibility subset: `home`, `library`, `progress`.
- The parent proxy visibility subset is not a third `TabShape`.
- The current guardian home tab presents as Family Hub through `resolveHomeTabPresentation()`.
- Parent home/family surface lives through `apps/mobile/src/components/home/ParentHomeScreen.tsx`.
- Parent's own learning currently routes through `apps/mobile/src/app/(app)/own-learning.tsx`.
- Learner home is already reusable through `apps/mobile/src/components/home/LearnerScreen.tsx`.
- Parent-visible child session recaps already exist under `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`.
- Parent proxy/viewing-child chrome exists through `ProxyBanner` in `(app)/_layout.tsx`.
- Existing specs already separate child profile, progress, and reports surfaces; this spec should build on that direction rather than duplicate it.
- Mobile uses React Context for auth/profile state and TanStack Query for server state.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/mobile/src/app/(app)/_layout.tsx` | Current tab shape resolution, visible tabs, proxy banner, and tab labels |
| `apps/mobile/src/app/(app)/home.tsx` | Current landing route that chooses parent vs learner home content |
| `apps/mobile/src/app/(app)/own-learning.tsx` | Current parent path into their own learner experience |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Current Family Hub / parent dashboard surface and child actions |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Current Study mode learner home |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Existing Progress behavior, including parent/child/self profile selection |
| `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` | Existing parent-facing session recap detail and possible "Learn this too" source |
| `apps/mobile/src/app/profiles.tsx` | Existing profile switching and child account/profile entry points |
| `apps/mobile/src/hooks/use-parent-proxy.ts` | Existing parent-viewing-child context detection |
| `apps/mobile/src/hooks/use-active-profile-role.ts` | Existing role detection for child/owner/proxy contexts |
| `apps/mobile/src/hooks/use-mentor-language-sync.ts` | Existing "mentor" language meaning; do not collide with this terminology |
| `apps/mobile/src/lib/sign-out.ts` | Central sign-out cleanup; extend only if client-persisted mode state is introduced |
| `docs/specs/2026-05-13-parent-child-surfaces-information-architecture.md` | Related IA spec separating parent child surfaces |
| `docs/plans/2026-05-11-progress-reports-first.md` | Related Progress/report behavior and self-learning report support |
| `.claude/memory/project_product_roles_students_any_age.md` | Product model: students of any age, parent/family layer, child accounts optional |

### Technical Decisions

- **No third tab shape.** Keep `TabShape = 'guardian' | 'learner'`.
- **Family replaces guardian/hybrid.** The `guardian` shape remains the internal shape name if desired, but its visible tabs become Family, Recaps, Progress, More. The old `Family Hub + My Learning + Library + Progress + More` set is removed.
- **Study uses learner.** Study mode uses the existing learner tab shape and learner home/library/progress surfaces.
- **No durable pre-auth storage.** The first-run Study/Family choice can exist before registration only as in-memory UI flow state or route state. If the auth flow reloads, asking again is acceptable. Do not write pre-auth intent to SecureStore.
- **Persist durable default mode server-side.** Once a profile exists and capability is known, store the adult's default/last-used app context on the profile/account server-side, then mirror it through the profile query/TanStack cache. Do not persist mode in SecureStore.
- **Proxy mode override.** If `isParentProxy` is true, proxy chrome wins. The app shows the child learner preview with proxy banner and hides normal Study/Family switching. Switching back returns the adult to their server-backed last-used/default mode. Normal parent review should route to Recaps/Progress instead of proxy mode.
- **Switch profile behavior.** Switching to a different real profile loads that profile's allowed/default context. Switching into a child proxy must not mutate the adult's default mode.
- **Family Progress is child/family only.** Remove the parent's own profile from the Family Progress picker. Parent self-progress belongs to Study mode only.
- **Study Progress is self only.** In Study mode, Progress shows the active user's own learning only.
- **Recaps is parent-native.** Recaps lists child learning summaries the adult is allowed to see. It is not a child-account preview.
- **"Learn this too" is same-account study.** Tapping it switches the adult into Study mode as themselves and opens a seeded learning entry point based on the child recap context.
- **Family challenges are deferred.**

### Mode State Table

| User/account state | Default context | Visible tabs | Mode switch visible? | Notes |
| ---- | ---- | ---- | ---- | ---- |
| Under 18 learner account | Study | My Learning, Library, Progress, More | No | If they chose Family during first-run intent, discard it after age/profile validation and continue to Study. |
| Adult with no child/family capability | Study | My Learning, Library, Progress, More | No | If they later add a child profile or family link, surface Family activation. |
| Adult with family capability, Family default | Family | Family, Recaps, Progress, More | Yes | Family Progress excludes parent self-progress. |
| Adult with family capability, Study default | Study | My Learning, Library, Progress, More | Yes | Study Progress is parent self-progress only. |
| Adult currently proxy-viewing a child | Proxy child preview | Existing proxy visibility subset while retained | No | Proxy banner wins. Return exits proxy and restores adult's last-used/default context. |
| Consent pending/withdrawn active child context | Consent gate | No normal tabs | No | Existing consent gates continue to own the surface. |

## Recaps Surface

### Route

- Add `apps/mobile/src/app/(app)/recaps.tsx` as the Family-mode Recaps tab root.
- If a nested detail route is added later under `recaps/`, its `_layout.tsx` must export `unstable_settings = { initialRouteName: 'index' }` when it contains both `index` and deeper dynamic children.

### UX Shape

- Header: "Recaps" plus a short parent-facing purpose line.
- Child filter chips at the top:
  - All
  - one chip per visible child learner/profile
- Feed sorted by most recent completed learning session.
- One card per child session recap:
  - child name
  - subject
  - topic/title
  - date/time and active duration
  - parent-facing summary
  - highlight, if available
  - suggested conversation prompt, if available
  - CTA: Learn this too
  - secondary action: Open recap/session detail
- Empty state:
  - all children empty: explain that recaps appear after a child studies.
  - one child empty: name the child and point to a gentle next action.

### Data Contract

Add or extend a parent-scoped API endpoint that returns a paginated recap feed. Exact route name can be finalized during implementation, but the contract must be parent-native and must not require switching active profile into the child.

Suggested response item:

```ts
type ParentRecapFeedItem = {
  id: string;
  childProfileId: string;
  childDisplayName: string;
  sessionId: string;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  topicTitle: string | null;
  completedAt: string;
  activeDurationMinutes: number | null;
  summary: string | null;
  highlight: string | null;
  conversationPrompt: string | null;
  engagementLabel: string | null;
};
```

Endpoint requirements:

- Enforce parent/child visibility through existing family-link/consent rules.
- Support `childProfileId` filter.
- Support cursor pagination.
- Return only recaps the parent is allowed to see; do not expose private chat turns.
- Work for both parent-managed child profiles and linked child learner accounts.

## Learn This Too Contract

The v1 bridge should be explicit and testable:

1. Parent taps `Learn this too` on a Recaps card or child session recap.
2. App switches the same adult profile into Study mode.
3. App opens the learner entry point with source context:

```ts
type StudySourceContext = {
  source: 'child-recap';
  childProfileId: string;
  childSessionId: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicTitle?: string;
};
```

4. If the adult already has matching subject/topic context, continue there.
5. If not, show a lightweight "Learn the basics" entry using the subject/topic title. Do not silently create a full subject/book without user confirmation.
6. The adult studies as themselves. Quota, reports, history, and progress attach to the adult profile, not the child.

## Implementation Plan

### Tasks

1. **Rename and terminology cleanup**
   - Use Study/Family in docs, code, and tests for app modes.
   - Avoid `mentorMode` naming because "mentor" already means AI mentor language/tutor behavior.

2. **Mode capability and persistence**
   - Add a server-backed profile/account field for default/last-used app context if no existing equivalent exists.
   - Expose the field through the profile query/schema.
   - Do not use SecureStore for durable mode state.
   - If any temporary client persistence is introduced during implementation, extend `signOutWithCleanup` and document the key.

3. **Tab shell update**
   - Keep `TabShape = 'guardian' | 'learner'`.
   - Change guardian visible tabs to `home`, `recaps`, `progress`, `more`.
   - Keep learner visible tabs as `home`, `library`, `progress`, `more`.
   - Add Recaps tab icon/label/testID.
   - Remove top-level own-learning/library tabs from guardian/Family mode.
   - Ensure route hiding still prevents phantom tabs.

4. **Mode switch entry points**
   - Add a clear switch from Family to Study for eligible adults.
   - Add a clear switch from Study to Family for adults with family capability.
   - Do not show mode switch for Study-only users or while proxy-viewing a child.

5. **First-run intent**
   - Offer Study/Family intent early in onboarding/sign-up flow.
   - Keep pre-auth choice ephemeral.
   - After profile creation, validate age/capability and set allowed default mode server-side.
   - If a disallowed user chose Family, route to Study with a plain explanation.

6. **Parent-native Recaps**
   - Add `recaps.tsx`.
   - Add hook(s) for parent recap feed.
   - Add or extend API service/route for paginated parent recap feed.
   - Add child chips/filter and empty states.
   - Reuse existing parent session recap detail where appropriate.

7. **Hide proxy from normal parent UX**
   - Remove normal profile-row "View account" paths that enter proxy mode.
   - Replace parent child review paths with Recaps, Progress, and child settings/profile routes.
   - Keep proxy implementation untouched behind internal/exception entry points until audited.

8. **Progress context filtering**
   - Family mode: child/family profiles only, no parent self picker.
   - Study mode: self only.
   - Add explicit headers/copy: Family Progress vs My Progress, or equivalent.

9. **Learn this too**
   - Add CTA to Recaps cards.
   - Implement same-account Study mode switch with `StudySourceContext`.
   - Add safe fallback when the adult has not created any own learning subjects yet.

10. **Tests**
   - Add tab-shape/visibility unit tests.
   - Add mode capability tests.
   - Add Progress filtering tests.
   - Add Recaps feed render/empty-state tests.
   - Add API scoping tests for parent recap feed.
   - Add Playwright web journeys for the updated Study/Family paths.

### Acceptance Criteria

1. Given the app resolves a learner-only user, when the tab shell renders, then only Study tabs are visible: My Learning, Library, Progress, More.
2. Given the app resolves an adult with family capability in Family mode, when the tab shell renders, then only Family tabs are visible: Family, Recaps, Progress, More.
3. Given Family mode is active, when the user opens Progress, then the parent's own profile is not selectable and child/family progress is the only progress context.
4. Given Study mode is active for an adult parent, when the user opens Progress, then only the adult's own progress is shown.
5. Given a parent opens Recaps, when multiple children have completed sessions, then the feed shows a latest-first list and child filter chips.
6. Given a parent opens Recaps for a child with no sessions, then the empty state names the child and explains what will make recaps appear.
7. Given a parent taps Learn this too, when Study mode opens, then the adult remains the active learner and the child session context is passed as `StudySourceContext`.
8. Given a parent taps Learn this too without an existing matching subject, then the app offers a lightweight study entry instead of silently creating a subject/book.
9. Given a parent has access to a child profile without a linked child account, when Recaps and Progress load, then both surfaces still work.
10. Given a parent has a linked child learner account, when Recaps and Progress load, then both surfaces respect family-link/consent visibility and do not require proxy mode.
11. Given `isParentProxy` is true through a legacy/internal path, when the tab shell renders, then proxy chrome wins and Study/Family mode switching is hidden.
12. Given any new nested Recaps layout contains both `index` and dynamic children, then it exports `unstable_settings = { initialRouteName: 'index' }`.

## Failure Modes

| State | Trigger | User sees | Recovery |
| ---- | ------- | --------- | -------- |
| Under-18 user chooses Family during first-run intent | Age/profile validation happens after registration | A plain message that family tools are for adults, then Study mode opens | User can study; parent/family setup can happen through the appropriate guardian flow later |
| Adult chooses Study, then later adds a child profile | Add-child/profile link succeeds | Study remains active, with a clear prompt that Family mode is now available | User can switch to Family immediately or keep studying |
| Adult chooses Family but has no child yet | First family setup not complete | Family setup empty state with Add child / Link child action | Complete child setup or switch to Study |
| Adult has children but none are consented/visible | Consent pending/withdrawn for every child | Family surfaces show protected/empty state explaining that child learning appears after consent/access is resolved | Resolve consent or add a visible child learner |
| Parent is proxy-viewing a child through a legacy/internal path | `isParentProxy` is true | Proxy banner and child learner preview; no Study/Family switch | Switch back exits proxy and restores adult's last-used/default mode |
| Only active profile is a child on a shared parent account | Child profile is active | Study tabs only; Family/Recaps hidden | Switch back to adult profile through allowed profile switch path |
| Parent taps Learn this too before starting own learning | Recap has subject/topic context, adult has no matching subject | Lightweight "learn the basics" entry with confirmation, not silent subject creation | Confirm to start studying as adult or cancel back to Recaps |
| Recaps endpoint returns no rows | No completed child sessions or no visible child data | Named empty state for all children or selected child | Child studies, consent is resolved, or parent changes filter |
| Recaps endpoint fails | Network/server error | Reusable error fallback with retry and secondary back/home action | Retry fetch; Family tab remains available |
| Mode state update fails | Server update for default/last-used context fails | The visible switch reverts or shows retry copy; no partial identity switch | Retry mode switch; current context remains unchanged |
| User signs out on shared device | Sign-out cleanup runs | No client-persisted mode state remains | Next sign-in loads mode from server profile data |

## Additional Context

### Review Response

| Finding | Resolution in this spec |
| ------- | ----------------------- |
| CRITICAL-1: third tab shape risk | Resolved by keeping `TabShape = 'guardian' | 'learner'`. Family replaces the current guardian/hybrid visible tabs; no new `TabShape` value is introduced. |
| CRITICAL-2: pre-registration intent storage undefined | Resolved by making pre-auth intent ephemeral only. Durable mode/default is stored only after account/profile creation and capability validation. No pre-auth SecureStore key. |
| CRITICAL-3: mode persistence unspecified | Resolved by requiring server-backed default/last-used context on the profile/account, mirrored through the profile query. Proxy mode and `switchProfile` interactions are covered in Technical Decisions and the Mode State Table. |
| HIGH-1: Recaps tab lacks route/data contract | Resolved by adding a Recaps Surface section with route, UX shape, suggested response item, parent scoping, child filter, and pagination requirements. |
| HIGH-2: missing Failure Modes table | Resolved by adding the Failure Modes table with under-18 choice, childless Family choice, consent, proxy, Learn this too, Recaps failure, mode-update failure, and sign-out/shared-device cases. |
| HIGH-3: Progress behavior silently changes | Resolved by explicitly deciding Family Progress is child/family only and Study Progress is self only, with mode-specific tests and copy. |
| HIGH-4: "Mentor" term collides with AI mentor language | Resolved by renaming the app context to Family mode and adding a glossary distinction for AI mentor. |
| MEDIUM-1: proxy visibility mislabeled as shape | Resolved by calling proxy a visibility subset, not a third shape. |
| MEDIUM-2: nested layout safety | Resolved by adding an acceptance criterion for `unstable_settings = { initialRouteName: 'index' }` if Recaps later gets nested index/dynamic routes. |
| MEDIUM-3: Learn this too contract undefined | Resolved by adding `StudySourceContext` and expected behavior for matching/missing adult study context. |
| MEDIUM-4: sign-out cleanup | Resolved by banning SecureStore mode persistence and calling out `signOutWithCleanup` only if any client persistence is introduced during implementation. |
| MEDIUM-5: web parity | Resolved by adding Playwright/web journeys to Testing Strategy. |
| LOW-1: child profile model already exists | Resolved by moving parent-managed/linked child learner support to Dependencies instead of treating it as new model work. |
| LOW-2: pending sections in draft | Resolved by replacing pending implementation/AC sections with initial tasks and acceptance criteria. Status remains `draft` until deep investigation validates exact files and endpoint names. |

### Dependencies

- Existing profile/family link model.
- Existing parent home and learner home surfaces.
- Existing progress and child session recap data.
- Existing profile switching/proxy logic.
- Child learner/profile model already supports parent-managed child profiles and linked child learner accounts.

### Testing Strategy

- Mobile unit tests:
  - `resolveTabShape` still returns only `guardian | learner`.
  - guardian/Family visible tabs are Family, Recaps, Progress, More.
  - learner/Study visible tabs are My Learning, Library, Progress, More.
  - mode switch hidden for Study-only and proxy contexts.
  - Family Progress excludes the adult self profile.
  - Study Progress excludes child profiles.
  - Recaps renders all-child feed, child-filtered feed, and empty state.
  - Learn this too passes `StudySourceContext`.
- API tests:
  - parent recap feed returns only children the parent can see.
  - child filter cannot access another family's child.
  - parent-managed child profile and linked child account both produce visible recap rows when allowed.
  - consent/visibility rejection returns the existing protected-data error shape.
- Web/Playwright:
  - Study-only account lands in Study tabs.
  - Adult with family capability lands in default mode and can switch modes.
  - Family Recaps opens and filters by child.
  - Learn this too switches into Study as the adult.

### Notes

- Final labels can be polished later. The technical model should use Study/Family to avoid the existing AI mentor terminology.
- Keep the user-facing model simple: everyone can study; adults with family capability can support child learners.
- The active context must always be obvious enough that Library and Progress do not require the user to infer whose learning they are seeing.
