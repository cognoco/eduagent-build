---
title: 'Study And Family Mode Navigation — v0 Experiment Slice'
slug: 'study-and-family-mode-navigation-v0'
created: '2026-05-19'
status: 'draft'
supersedes: null
upgrade_path: 'docs/specs/2026-05-19-study-and-family-mode-navigation.md'
tech_stack:
  - Expo Router
  - React Native
  - TanStack Query
files_to_modify:
  - apps/mobile/src/app/(app)/_layout.tsx
  - apps/mobile/src/app/(app)/home.tsx
  - apps/mobile/src/app/(app)/progress/index.tsx
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/lib/profile.ts
  - apps/mobile/src/lib/analytics.ts
code_patterns:
  - Mode state lives in a single React context provider; never in SecureStore.
  - Tab visibility resolves from app context, not from guardian identity alone.
  - Mode switch uses `router.replace()` to canonical roots; never `push`.
  - Query keys for progress/family surfaces include explicit mode + effective profile/child id.
test_patterns:
  - Co-located Jest tests for tab visibility, mode gating, progress filtering, and query-key isolation.
  - Navigation-contract tests for mode switch (replace, not push) and detail-screen fallback.
---

# Tech-Spec: Study And Family Mode Navigation — v0 Experiment Slice

**Created:** 2026-05-19
**Relationship to v1:** This is a client-only experiment slice. The full v1 design at `docs/specs/2026-05-19-study-and-family-mode-navigation.md` is the upgrade path once v0 proves the mental model is right. v1 is **not** deleted or superseded — v0 is the cheap probe; v1 is the durable architecture.

## Overview

### Problem Statement

Today's parent shell mixes "I am studying as myself" and "I am supporting my child" in one tab bar. Library and Progress are ambiguous, and the parent has to infer whose learning they are looking at. v1 proposes a full server-backed split with a new Recaps feed, onboarding intent, push-routing rewrite, and migration. Before paying that cost, we want to learn whether the split itself feels right.

### Solution

Ship the Study/Family split as a **client-only experiment**:

- Mode state lives in React context; resets to the capability-driven default on app restart. Acceptable for validation.
- No DB column, no migration, no new API endpoint, no onboarding intent screen, no push-routing change, no `Learn this too` bridge, no Recaps tab.
- Reuse existing data: surface recent child sessions inside the Family home using hooks/endpoints that already exist.
- Hard rules around data leak and navigation are non-negotiable even in v0 — that is the whole point of doing this carefully.

### Why v0 First

- No users yet (`project_pre_launch_no_users.md`). Migration + API + deploy ordering is a cost we should not pay for a UX hypothesis we have not validated.
- v1 keeps its full design as the upgrade path. If v0 validates, every v1 task slots in. If v0 disproves the model, we have not spent weeks on a migration we now need to roll back.

## Scope

### In Scope

- Client-side mode state for family-capable adults: `appContext: 'study' | 'family'`.
- Family-capable adults default to `family` on each app load; everyone else is `study`-only with no switch.
- Family-mode visible tabs: `home` (labelled Children), `progress`, `more`. **No Recaps tab in v0.**
- Study-mode visible tabs: `home` (labelled My Learning), `library`, `progress`, `more`.
- Family home surfaces a "Recent child sessions" section using the existing parent session recap data already reachable at `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`. List → tap → existing detail route.
- Progress mode filtering: Family Progress = child/family profiles only; Study Progress = adult self only.
- Mode switch entry point visible only to dual-capable adults (owner, 18+, has linked children). Other users see no switch.
- Hide proxy from normal parent UX paths (Phase 1 of v1 proxy hide-out). Synthetic/internal proxy paths remain.
- Mode-aware query keys for progress/family surfaces to prevent cross-context cache leak.
- Tight navigation rules: mode switch uses `router.replace` to canonical roots; detail screens use `goBackOrReplace` with explicit same-context fallback.

### Out of Scope

- `profiles.default_app_context` column, migration, rollback markdown.
- `PATCH /profiles/:id` app-context mutation.
- New `/recaps` route, `apps/api/src/routes/recaps.ts`, `apps/api/src/services/recaps.ts`.
- New parent recap feed endpoint or aggregator.
- First-run intent screen (`/(app)/onboarding/intent.tsx`).
- `Learn this too` bridge and `StudySourceContext`.
- Push notification routing rewrite for context-aware deep links.
- Cross-device mode persistence.
- Analytics for `mode_intent_chosen`, `learn_this_too_*` (these belong to v1 surfaces that do not exist in v0).
- Any `X-App-Context` request header. Same constraint as v1.

## Glossary

| Term | Meaning (v0) |
| ---- | ------------ |
| Study mode | Adult's own learning context. Same surfaces as today's solo-learner experience. |
| Family mode | Adult family-support context. Children-first home; child/family progress. |
| Family capability | Same predicate as v1: `activeProfile.isOwner === true`, `computeAgeBracket(activeProfile.birthYear) === 'adult'`, and at least one `family_links` row where the owner is `parent_profile_id` and the linked `child_profile_id` references a non-archived `profiles` row (`profiles.archived_at IS NULL`). v0 evaluates this on the client from already-loaded profile data; no new endpoint. |
| App context | Client-side React context value: `'study' | 'family'`. Resets to capability-driven default on app load. |

For full v1 terms (AI mentor, Recaps as a tab, parent proxy chrome, `StudySourceContext`), see the upgrade path doc.

## Context For Development

| File | Purpose in v0 |
| ---- | ------------- |
| `apps/mobile/src/app/(app)/_layout.tsx` | Tab visibility resolves from app context; remove top-level `own-learning` from Family-mode visible set; keep `library` only in Study. |
| `apps/mobile/src/app/(app)/home.tsx` | Mode-aware home: Family context renders Children + Recent child sessions; Study context renders LearnerScreen. |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Filter selectable profiles by mode. Family = child/family only. Study = self only. |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Add "Recent child sessions" section reusing existing data hook. |
| `apps/mobile/src/lib/profile.ts` | Add `isFamilyCapableProfile()` helper. |
| `apps/mobile/src/lib/analytics.ts` | Track `mode_switched` only (with hashed profile id, previous + next context). |

No API, schema, or migration files are touched in v0.

## Mode State (Client-Only)

- Implement a single `AppContextProvider` (React context) under `apps/mobile/src/lib/app-context.tsx` (or equivalent location).
- Provider value: `{ mode: 'study' | 'family'; setMode: (m) => void }`.
- Initial value: `'family'` if `isFamilyCapableProfile(activeProfile)` is true, else `'study'`.
- Provider is mounted inside the existing `FeedbackProvider` block in `(app)/_layout.tsx`, after the active profile has resolved.
- On `switchProfile` success, the provider re-derives the default from the new active profile's capability. The previous profile's mode is **not** carried across.
- On sign-out, the provider unmounts with the app shell; no persistence cleanup needed because there is no persistence.
- v0 explicitly does not read or write SecureStore for mode state. If any persistence is added during implementation, fail review and extend `signOutWithCleanup` first.

## Hard Rules

These are the rules that make v0 worth shipping. None of them depend on v1's API/DB work.

1. **Family mode never renders parent self-progress.** Progress index reads app context; in Family mode the self-profile is excluded from the picker and not used as a default scope.
2. **Study mode never renders child data.** No child profile is fetched, displayed, or used as a query scope while Study is active. Family-only hooks (recent child sessions, child progress) are gated by mode and unmount when mode flips.
3. **Mode switch lands on a canonical root.** Mode toggle calls `setMode(next)` followed by `router.replace('/(app)/home')`. Never `router.push`. Never bare `router.back` to leave a different mode's stack.
4. **Detail-screen back behavior is mode-scoped.** Any detail route reachable from a Family surface (e.g. `/(app)/child/[id]/session/[id]`) uses `goBackOrReplace(router, '/(app)/home')` so deep-linking still lands on Family home. Same rule for Study detail screens fallback to `/(app)/home` while Study mode is active.
5. **Proxy is not the normal parent review path.** Remove profile-row "view as child" entry points. Synthetic/internal proxy paths remain (Phase 1 of v1 proxy hide-out). Sign-out already clears proxy state via `setProxyMode(false)` — do not regress that.
6. **Query keys include mode + effective profile/child id.** Progress queries and the new Recent-child-sessions hook take `['progress', mode, profileId, childFilter?]` shape so a stale Family cache cannot bleed into Study and vice versa.
7. **Mode switch invalidates context-scoped queries.** On `setMode`, invalidate progress + family-recent-sessions + any dashboard/family query that could carry the other mode's data. This is the v0 equivalent of v1's leak invariants.
8. **No `X-App-Context` header.** Same constraint as v1. App context is presentation-only on the client; authorization remains profile-scoped via existing `X-Profile-Id`.
9. **Single source of truth for capability.** `isFamilyCapableProfile()` is the only predicate that gates the switch. Do not reintroduce `isGuardianProfile()` checks for mode UI.

## Family Home — Recent Child Sessions (No New Endpoint)

- Add a "Recent child sessions" section to `ParentHomeScreen.tsx` rendered only when app context is Family.
- Data: reuse whatever hook `(app)/child/[profileId]/session/[sessionId].tsx` and `ParentHomeScreen.tsx` already load for the parent's children. If that data is not already aggregated, list per-child cards with a "View recent sessions" affordance that opens the existing child session list. **Do not add a new feed endpoint** in v0 — that work belongs to v1.
- If no children have recent sessions, show a named empty state with a gentle next action (matching existing copy patterns).
- Cards link to the existing session-recap detail route. No new routes added.

## Progress Filtering

- `progress/index.tsx` reads `mode` from `useAppContext()`.
- Family mode:
  - profile picker exposes child profiles only;
  - default selection is the most-recently-active child;
  - the parent's own profile is hidden from the picker.
- Study mode:
  - profile picker is hidden (only one option — self);
  - data scope is the adult's own profile.
- The mode-filtered profile picker is the v0 surface that proves "Progress is clearer when mode is explicit." Track whether parents actually use the new picker shape before investing in v1's split Progress design.

## Navigation Rules

- Mode switch: `setMode(next)` → `router.replace('/(app)/home')`.
- Profile switch (existing flow): after `switchProfile` succeeds, re-derive mode from new active profile's capability; then existing navigation reset rules apply.
- Detail screens inside a mode: `goBackOrReplace(router, '/(app)/home')` as fallback.
- Cross-mode jumps from a notification tap: out of scope for v0 — notifications keep current routing. If a tap lands the user on the "wrong" mode's detail page, the back fallback returns them to home; the mode chip lets them re-enter Family explicitly.

## Implementation Plan

1. **Capability helper.**
   - Add `isFamilyCapableProfile(activeProfile)` in `apps/mobile/src/lib/profile.ts`, requiring `isOwner`, adult age bracket from `@eduagent/schemas` `computeAgeBracket`, and at least one linked non-archived child.
   - Tests: under-18 owner with non-owner sibling is **not** family-capable; adult owner with one linked non-archived child **is**; adult owner with only archived children is **not**.

2. **App context provider.**
   - Add `AppContextProvider` exposing `{ mode, setMode }`.
   - Mount inside `(app)/_layout.tsx` after profile resolution. Initial value derived from capability helper.
   - On `switchProfile` success, recompute the default.

3. **Tab shell update.**
   - Resolve visible tabs from app context.
   - Study visible tabs: `home`, `library`, `progress`, `more`.
   - Family visible tabs: `home`, `progress`, `more`.
   - Family home tab label: Children. Study home tab label: My Learning.
   - Remove top-level `own-learning` and `library` from Family visible set. `own-learning.tsx` route file remains (deep-link compatibility); when opened from a deep link in Family mode by an eligible adult, switch mode to Study and route to Study home (Route Survival rule from v1 still applies).

4. **Mode switch UI.**
   - Visible only when `isFamilyCapableProfile(activeProfile)` is true.
   - Recommended placement: header chip on home, or single row inside More. Pick one; do not ship both in v0.
   - Switch action: `setMode(next)` → `router.replace('/(app)/home')`.
   - Track `mode_switched` analytics with `{ from, to, profileIdHash }`.

5. **Family home — Recent child sessions.**
   - Add the section to `ParentHomeScreen.tsx`, mode-gated.
   - Reuse existing child session data; no new endpoint.
   - Empty state with named copy.

6. **Progress filtering.**
   - Read `mode` from `useAppContext()` in `progress/index.tsx`.
   - Family: child profiles only; default to most-recent child; hide self.
   - Study: self only; hide picker.

7. **Leak hardening.**
   - Update query keys: progress, family recent sessions, any home-tab data that varies by mode.
   - On `setMode`, invalidate the affected query keys.
   - Add tests that flipping mode does not surface the previous mode's cached data.

8. **Proxy normal-path hide-out (Phase 1 from v1).**
   - Remove profile-row "view as child" entries from normal UX.
   - Synthetic proxy paths and `setProxyMode` cleanup in `signOutWithCleanup` remain unchanged.

## Acceptance Criteria

1. Given the active profile has no family capability, when the tab shell renders, then Study tabs are visible and no mode switch UI is shown.
2. Given an adult owner under 18 with a non-owner sibling on the account, when capability is computed, then `isFamilyCapableProfile` returns false.
3. Given a family-capable adult opens the app, when the shell mounts, then mode defaults to `'family'`.
4. Given `computeVisibleTabs('family')` is called, then it returns exactly `home`, `progress`, and `more`.
5. Given `computeVisibleTabs('study')` is called, then it returns exactly `home`, `library`, `progress`, and `more`.
6. Given Family mode is active, when Progress opens, then the adult self profile is not selectable.
7. Given Study mode is active, when Progress opens, then no child profile is selectable.
8. Given Family mode is active, when Family home renders, then "Recent child sessions" is visible and uses existing child session data.
9. Given a parent taps a recent-child-session card, when navigation completes, then the existing session recap detail route renders.
10. Given a recap detail is opened via deep link, when Back is pressed, then the app lands on `/(app)/home` in Family mode.
11. Given a family-capable adult taps the mode switch, when the switch completes, then `router.replace('/(app)/home')` was called and the previous mode's detail routes are not in the back stack.
12. Given the user switches mode, when prior mode's cached queries exist, then they are invalidated and the new mode does not render stale data from the previous mode.
13. Given the user signs out, when the app reloads, then mode is recomputed from the next active profile's capability — no persisted mode value survives.
14. Given the normal profile picker is used, when a child profile is selected/reviewed, then the app does not route through proxy mode.
15. Given a Study-mode user has the `own-learning` deep link opened, when the route resolves, then it renders the Study learner experience (no Family chrome).
16. Given a Family-mode eligible adult deep-links into `own-learning`, when the route resolves, then mode is switched to Study via the Route Survival rule and the learner home renders.
17. Given the user toggles mode rapidly, when both setMode calls complete, then only the final state is rendered (no half-mixed tab set is observable).

## Failure Modes

| State | Trigger | User sees | Recovery |
| ----- | ------- | --------- | -------- |
| Family-capable adult opens app | Default capability path | Family home with Children, recent child sessions section, Progress, More | Tap mode switch to enter Study |
| Family default after restart | App relaunch | Family mode again (no persistence) | Acceptable for v0; v1 adds server-backed memory |
| Adult without family capability | No linked children or under-18 | Study tabs only, no mode switch UI | Add a child profile (existing flow) → next reload exposes Family |
| Adult adds a child mid-session | Existing add-child flow completes | Capability helper sees new linked profile on next render; mode switch UI appears | User can switch immediately |
| Adult is in Study mode and a child finishes a session | Push notification arrives | Existing notification routing (out of scope for v0 — may land on detail page); Back returns to `/(app)/home` in current mode | v1 will rewrite push routing to switch context first |
| Parent is in Family mode, opens own-learning deep link | Eligible adult | Mode flips to Study via Route Survival, lands on learner home | Use the mode chip to return to Family |
| Mode switch fires while in a detail route | User taps switch from a child detail screen | `router.replace('/(app)/home')` lands on the target mode's home; no stale child detail in stack | Standard back behavior from home |
| Family home recent-sessions section is empty | No completed child sessions or no visible children | Named empty state pointing to add/link child or invite to wait for child to study | Existing add-child flow |
| Stale cache leak | Old Family progress data appears briefly while Study mode is active | This is a regression that must fail tests | Fix the query-key shape; do not ship until invalidation is verified |
| User has multiple children, some archived | Capability helper sees archived child rows | Archived children are excluded from picker and capability count | Helper checks `profiles.archived_at IS NULL` on the linked child |

## Tests

- **Unit (Jest, co-located):**
  - `isFamilyCapableProfile` — adult/under-18, archived/non-archived linked child, no linked children, non-owner profile.
  - `computeVisibleTabs('study' | 'family')` — exact tab set per mode.
  - Progress picker filtering per mode.
  - Mode-switch invalidates expected query keys.
  - Mode switch calls `router.replace`, not `push`.
  - Family home rendering of Recent child sessions section (mounted only in Family mode).
  - `own-learning` deep-link Route Survival in both modes.
  - Capability re-derivation on `switchProfile` success.

- **Integration / behavioural:**
  - Rapid toggle test: mode flips Family → Study → Family within a render frame produces no half-mixed tab set.
  - Cache leak test: mount Family, prime cache, switch to Study, assert no child data renders and Family-only queries are invalidated.
  - Detail back-fallback test: open child session detail directly, press Back, land on `/(app)/home` (Family).

- **Out of scope for v0:**
  - Playwright web journeys (deferred to v1; v0 is mobile-first validation).
  - API tests (no API changes).
  - Push notification routing tests (no handler change).

## Upgrade Path To v1

Once v0 ships and we have a few weeks of usage data, the question to answer is:

1. Do family-capable adults actually use the mode chip, or do they stay in one mode?
2. Is Recent-child-sessions on Family home enough, or do parents ask for a dedicated Recaps feed?
3. Is Progress clearer once mode-filtered, measured by reduced "wrong profile" reports?
4. Does the lack of cross-device persistence hurt? (Likely irrelevant pre-launch.)

When v1 is greenlit:

- Add `profiles.default_app_context` migration (v1 §Data Model And API).
- Replace the React context default with the server-backed value (v1 §Mode Mutation Contract).
- Add `/recaps` tab, route, service, feed (v1 §Recaps Surface) if Recent-child-sessions proved insufficient.
- Add `/(app)/onboarding/intent.tsx` first-run intent (v1 §First-Run Intent).
- Add `Learn this too` bridge (v1 §Learn This Too Contract).
- Rewrite push notification routing for context-aware tap behavior (v1 §Technical Decisions).

Every v0 surface (capability helper, tab resolver, mode-aware Progress, leak-hardened query keys, navigation rules) survives the upgrade — v1 adds persistence and new surfaces, it does not replace v0 work.

## Notes

- v0 is a deliberately small probe. Resist scope creep: if a v1 task feels easy to bundle, defer it. The cost of v0 is supposed to be days, not weeks.
- The hard rules in §Hard Rules are not optional even in v0. They are the leak/navigation regressions the v1 review (rounds 1–4) caught; v0 must not reintroduce them.
- v0 success criteria are qualitative (does the split feel right?) before quantitative (does it reduce dead-end reports?). Plan to revisit this spec after 2–4 weeks of usage with at least one round of user feedback.
