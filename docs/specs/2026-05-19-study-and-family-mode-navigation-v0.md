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
  - apps/mobile/src/app/(app)/own-learning.tsx
  - apps/mobile/src/app/(app)/progress/index.tsx
  - apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx
  - apps/mobile/src/components/home/LearnerScreen.tsx
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/hooks/use-dashboard.ts
  - apps/mobile/src/hooks/use-progress.ts
  - apps/mobile/src/lib/profile.ts
  - apps/mobile/src/lib/navigation.ts
  - apps/mobile/src/lib/analytics.ts
  - apps/mobile/src/lib/query-keys.ts
new_files:
  - apps/mobile/src/lib/app-context.tsx
  - apps/mobile/src/lib/mode-scoped-keys.ts
  - apps/mobile/src/components/guards/RequireFamilyContext.tsx
code_patterns:
  - Mode state lives in a single React context provider; never in SecureStore.
  - Tab visibility resolves from app context, not from guardian identity alone.
  - Mode switch uses `router.replace()` to canonical roots; never `push`.
  - Query keys for progress/family surfaces include explicit mode + effective profile/child id.
  - Child-route guard is enforced once in the `child/[profileId]/_layout.tsx` chokepoint, not per-route.
test_patterns:
  - Co-located Jest tests for tab visibility, mode gating, progress filtering, and query-key isolation.
  - Navigation-contract tests for mode switch (replace, not push) and detail-screen fallback.
last_revised: '2026-05-19'
revision_notes: 'Adversarial review pass 1+2 applied — see §Adversarial Review Changes at end.'
---

# Tech-Spec: Study And Family Mode Navigation — v0 Experiment Slice

**Created:** 2026-05-19
**Relationship to v1:** This is a client-only experiment slice. The full v1 design at `docs/specs/2026-05-19-study-and-family-mode-navigation.md` is the upgrade path once v0 proves the mental model is right. v1 is **not** deleted or superseded — v0 is the cheap probe; v1 is the durable architecture.

## Overview

### Problem Statement

Today's parent shell mixes "I am studying as myself" and "I am supporting my child" in one tab bar. Library and Progress are ambiguous, and the parent has to infer whose learning they are looking at. v1 proposes a full server-backed split with a new Recaps feed, onboarding intent, push-routing rewrite, and migration. Before paying that cost, we want to learn whether the split itself feels right.

### Solution

Ship the Study/Family split as a **client-only experiment**:

- Mode state lives in React context; resets to the capability-driven default each time profiles resolve. Acceptable for validation.
- No DB column, no migration, no new API endpoint, no onboarding intent screen, no push-routing change, no `Learn this too` bridge, no Recaps tab.
- Reuse existing data: surface recent child activity inside the Family home using the existing `useDashboard()` hook (already wired in `ParentHomeScreen.tsx`). No new endpoint and no fan-out of per-child requests.
- Hard rules around data leak and navigation are non-negotiable even in v0 — that is the whole point of doing this carefully.

**Capability is linkage-driven, not subscription-driven.** Today, `LearnerScreen.tsx:456-466` shows `ParentHomeScreen` when `hasLinkedChildren || isFamilyPlanOwner`. v0 narrows the gate to `hasLinkedChildren` (via `isFamilyCapableProfile`) — a Family/Pro subscriber who has not yet added a child profile sees Study chrome until they add one. This is the cleaner mental model: Family mode exists to support a linked child, not to validate a paid tier. The add-child entry point must remain visible on Study home (existing flow, `More → Add child`) so the subscription-funnel completion path is preserved. See §Failure Modes "Family/Pro subscriber without linked children."

### Why v0 First

- No users yet (`project_pre_launch_no_users.md`). Migration + API + deploy ordering is a cost we should not pay for a UX hypothesis we have not validated.
- v1 keeps its full design as the upgrade path. If v0 validates, every v1 task slots in. If v0 disproves the model, we have not spent weeks on a migration we now need to roll back.
- v0 validates whether the **clarity split** works: Family vs My Learning, child progress vs self progress, and predictable navigation. It does **not** validate the full adult-learner activation loop because onboarding intent, `Learn this too`, Recaps-as-tab, push routing, and persistence are deferred to v1.

## Scope

### In Scope

- Client-side mode state for family-capable adults: `appContext: 'study' | 'family'`.
- Family-capable adults resolve to `family` once profiles load; everyone else resolves to `study`-only with no switch. During the boot frame before profiles resolve, mode is `null` and no mode-specific chrome renders.
- Family-mode visible tabs: `home` (labelled Children), `progress`, `more`. **No Recaps tab in v0.**
- Study-mode visible tabs: `home` (labelled My Learning), `library`, `progress`, `more`.
- Family home surfaces a "Recent child activity" section sourced from the existing `useDashboard()` aggregate. `DashboardChild` (verified: `packages/schemas/src/progress.ts:310-340`) carries per-child weekly aggregates but **no per-session array and no `lastActivityAt` field**, so v0 renders per-child summary tiles ordered by `sessionsThisWeek` desc then `totalTimeThisWeek` desc — not a per-session list. Each tile links to that child's existing session list (`/(app)/child/[profileId]/session/[sessionId]` or `/(app)/child/[profileId]/reports`). No new endpoint, no fan-out.
- Progress mode filtering: Family Progress = child/family profiles only; Study Progress = adult self only.
- Mode switch entry point visible only to dual-capable adults (owner, 18+, has linked children). Other users see no switch. In v0, the primary switch lives in the home header, not hidden in More.
- Family home includes a quiet adult-study activation card for family-capable adults: "Want to study too?" with a single action to My Learning. It uses the same mode switch behavior as the header chip.
- Hide proxy from normal parent UX paths (Phase 1 of v1 proxy hide-out). Synthetic/internal proxy paths remain.
- Mode-aware query keys for progress/family surfaces to prevent cross-context cache leak.
- Tight navigation rules: mode switch uses `router.replace` to canonical roots; detail screens use `goBackOrReplace` with explicit same-context fallback.
- Minimal family-route guard: if a Family-only child route or child detail opens while Study mode is active, v0 must either switch to Family via `replace` or show a no-access/family-context fallback before rendering child data.

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
- Any profile-response/schema/API change. v0 computes capability from already-loaded `isOwner`, `birthYear`, and the `profiles` array. No new field is needed and none must be added without first amending this spec. Explicitly excluded: `profiles.archivedAt`, `hasFamilyLinks`, or any other capability-shortcut field.
- Archive semantics for linked children. `profileSchema` has no `archivedAt`; v1 owns that contract.

## Glossary

| Term | Meaning (v0) |
| ---- | ------------ |
| Study mode | Adult's own learning context. Same surfaces as today's solo-learner experience. |
| Family mode | Adult family-support context. Children-first home; child/family progress. |
| Family capability | Computed client-side from already-loaded profile data: `activeProfile.isOwner === true`, `computeAgeBracket(activeProfile.birthYear) === 'adult'`, and the loaded `profiles` array contains at least one entry where `p.id !== activeProfile.id && p.isOwner === false`. v0 deliberately does **not** check archived state — `profileSchema` in `@eduagent/schemas` has no `archivedAt` field today, and adding one is v1's contract change. If a child has been removed mid-session, the next profile refetch will drop them from the array. v1 owns explicit archive semantics. |
| App context | Client-side React context value: `'study' | 'family'`. Resets to capability-driven default on app load. |

For full v1 terms (AI mentor, Recaps as a tab, parent proxy chrome, `StudySourceContext`), see the upgrade path doc.

## Context For Development

| File | Purpose in v0 |
| ---- | ------------- |
| `apps/mobile/src/app/(app)/_layout.tsx` | Add `computeModeVisibleTabs(mode)` next to the existing `computeVisibleTabs(shape, isParentProxy)` at lines 114-126 — do not shadow the existing name. Mount `AppContextProvider` after `ProfileProvider`. Compose visible tabs per the precedence rule in §Hard Rules (proxy > mode-for-family-capable > shape). Toggle `Tabs.Screen` `href` per the composed set using the existing pattern at `_layout.tsx:1738-1740`. |
| `apps/mobile/src/app/(app)/home.tsx` | Render the mode chip in this wrapper component (single source — see Step 4). Pass `mode` from `useAppContext()` into `LearnerScreen`. No new branching inside `home.tsx` itself beyond the chip placement — keeps the route file thin and matches the existing `own-learning.tsx` pattern. |
| `apps/mobile/src/app/(app)/own-learning.tsx` | Add Route Survival: when `isFamilyCapableProfile()` is true and `mode === 'family'`, call `setMode('study')` on mount (via `useEffect`) before rendering. Existing `resolveTabShape() !== 'guardian'` redirect stays as the non-capable fallback. |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Filter selectable profiles by mode. Family = child profiles only. Study = self only. Mode read from `useAppContext()`. |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | Single chokepoint for the family-route guard. Wrap children with `RequireFamilyContext` so every nested child route (index, mentor-memory, reports, report/[reportId], session/[sessionId], subjects/[subjectId], topic/[topicId], weekly-report/[weeklyReportId]) is gated once. |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Accept a `mode: 'study' \| 'family'` prop (or read from `useAppContext()`). Internal `showParentHome` branch becomes mode-driven. Current condition is `showParentHome && !isParentProxy && (hasLinkedChildren || isFamilyPlanOwner)` (line 456-466) — v0 replaces the `(hasLinkedChildren \|\| isFamilyPlanOwner)` clause with `mode === 'family'`. Family/Pro subscribers without linked children intentionally drop to Study chrome per the Overview note. |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Add "Recent child activity" section using `useDashboard()` (already loaded — surfaces `children[].sessionsThisWeek`, `totalTimeThisWeek`, `currentStreak`, `trend`). Order tiles by `sessionsThisWeek` desc then `totalTimeThisWeek` desc. No new fan-out hook. |
| `apps/mobile/src/hooks/use-dashboard.ts` | Thread `mode` through to query keys per the §Step 8 factory table. Adult-root dashboard key gets mode segmentation; child-detail keys get mode segmentation. |
| `apps/mobile/src/hooks/use-progress.ts` | Same — thread `mode` through every progress factory listed as mode-scoped in §Step 8. |
| `apps/mobile/src/lib/profile.ts` | Add `isFamilyCapableProfile()` helper. Expose a subscription path so `AppContextProvider` can recompute mode whenever active profile identity or linked-children count changes. |
| `apps/mobile/src/lib/navigation.ts` | No signature change to `goBackOrReplace`. Add a small `useGuardFamilyRoute()` helper used by child detail routes. |
| `apps/mobile/src/lib/analytics.ts` | Add a `mode_switched` event. Verified: `track(event: string, properties: AnalyticsProperties)` at `analytics.ts:34-47`. Call site: `track('mode_switched', { from, to, profileIdHash: hashProfileId(activeProfile.id) })`. |
| `apps/mobile/src/lib/query-keys.ts` | Add `mode` segment to every factory listed as mode-scoped in §Step 8 factory table. `queryKey[0]` strings stay unchanged so existing `PROFILE_SCOPED_KEYS` invalidation continues to work. |

No API, schema, or migration files are touched in v0.

> Note on `sign-out.ts`: not in `files_to_modify`. `signOutWithCleanup` already wipes the query cache (`queryClient.clear()` at line 80) and resets api-client identity (line 67-68). `AppContextProvider`'s identity subscription handles mode reset on the next sign-in. If any future change adds SecureStore-based mode persistence, that file moves into `files_to_modify` and `signOutWithCleanup` gains an explicit mode-clear step.

## Mode State (Client-Only)

- Implement a single `AppContextProvider` (React context) at `apps/mobile/src/lib/app-context.tsx`.
- Provider value: `{ mode: 'study' | 'family' | null; setMode: (m: 'study' | 'family') => void }`. `null` is reserved for the boot frame before capability is computable.
- **Initial value resolution.** The provider holds `mode = null` until `profiles` has resolved (read `isLoading` from `useProfile()`). Once profiles are loaded, derive: `'family'` if `isFamilyCapableProfile(activeProfile, profiles)` is true, else `'study'`. Consumers render a splash/loading state for `mode === null` — never render Family chrome before capability is known, and never default to `'family'` during the boot frame (parallels `resolveTabShape`'s least-privilege default at `_layout.tsx:108`).
- **Subscription, not callback.** The provider uses a `useEffect` keyed on `[activeProfile?.id, activeProfile?.isOwner, activeProfile?.birthYear, linkedChildren.length]` (or equivalent identity signature) to recompute mode whenever profile identity OR capability inputs change. This covers `switchProfile`, add-child mid-session, profile refetch, and sign-in-as-different-user without trusting any single mutation path.
- **Reset-before-recompute on identity loss.** The effect body must follow this order: (1) if `useProfile().isLoading === true` OR `activeProfile === null`, set `mode = null` and return — do not retain the previous mode value. (2) Only when `activeProfile` is non-null, derive `'family'` vs `'study'` from `isFamilyCapableProfile()`. This rule is what prevents the previous user's `'family'` mode from being visible against the new user's data during the sign-out → sign-in transition window. The cross-account leak class (`project_cross_account_leak_2026_05_10.md`) is unresolved at the profile-id layer; mode state must not add to it.
- **Cross-account safety.** Because `(app)/_layout.tsx` does not remount on sign-out (`key={themeKey}` is intentionally disabled to avoid the Android Fabric crash documented in `MEMORY.md → project_themekey_removed.md`), the React context survives sign-out → sign-in-as-other-user. The identity subscription above is the recovery path. Add an explicit Jest test that asserts mode recomputes when `activeProfile?.id` changes across an auth boundary, mirroring the unresolved cross-account profile leak (`project_cross_account_leak_2026_05_10.md`).
- v0 explicitly does not read or write SecureStore for mode state. If any persistence is added during implementation, fail review and extend `signOutWithCleanup` first.
- The previous profile's mode is **not** carried across a profile switch. Identity subscription handles this; no manual reset call needed.

## Hard Rules

These are the rules that make v0 worth shipping. None of them depend on v1's API/DB work.

1. **Family mode never renders parent self-progress.** Progress index reads app context; in Family mode the self-profile is excluded from the picker and not used as a default scope.
2. **Study mode never renders child data.** No child profile is fetched, displayed, or used as a query scope while Study is active. Family-only hooks (recent child sessions, child progress) are gated by mode and unmount when mode flips. If a deep link or notification opens a child/family route while Study is active, the route must switch to Family or show a fallback before rendering child data.
3. **Mode switch lands on a canonical root.** Mode toggle calls `setMode(next)` followed by `router.replace('/(app)/home')`. Never `router.push`. Never bare `router.back` to leave a different mode's stack.
4. **Detail-screen back behavior is mode-scoped.** Any detail route reachable from a Family surface (e.g. `/(app)/child/[id]/session/[id]`) uses `goBackOrReplace(router, '/(app)/home')` so deep-linking still lands on Family home. Same rule for Study detail screens fallback to `/(app)/home` while Study mode is active.
5. **Proxy is not the normal parent review path.** Remove profile-row "view as child" entry points. Synthetic/internal proxy paths remain (Phase 1 of v1 proxy hide-out). Sign-out already clears proxy state via `setProxyMode(false)` — do not regress that.
6. **Query keys include mode + effective profile/child id.** Progress queries and dashboard queries take `['progress', mode, profileId, ...]` / `['dashboard', mode, profileId]` / `['dashboard', mode, 'child', childProfileId, ...]` shape so a stale Family cache cannot bleed into Study and vice versa. `queryKey[0]` stays the same string (`'progress'`, `'dashboard'`) so the existing `PROFILE_SCOPED_KEYS` predicate in `switchProfile` (`apps/mobile/src/lib/profile.ts:252-280` — array at 252-276, consuming `resetQueries` at 277-280) still invalidates correctly.
7. **Mode switch invalidates context-scoped queries via a shared list.** Define `MODE_SCOPED_KEYS` in `apps/mobile/src/lib/mode-scoped-keys.ts` as the single source of truth. `setMode` invalidates by predicate `query => MODE_SCOPED_KEYS.includes(String(query.queryKey[0]))`. A guard test asserts the list is non-empty and that every key in `MODE_SCOPED_KEYS` is also present in `PROFILE_SCOPED_KEYS` (so a profile switch does not undershoot a mode switch). v0 ships exactly these `queryKey[0]` strings, verified against `apps/mobile/src/lib/query-keys.ts:26-210`: `'progress'`, `'dashboard'`, `'session'`, `'session-transcript'`, `'session-summary'`, `'parking-lot'`. Note the `'session'` singular — there is **no** query whose `queryKey[0] === 'sessions'`; that string in `PROFILE_SCOPED_KEYS` (line 254) is a latent dead entry. v0 does **not** fix the dead entry in `PROFILE_SCOPED_KEYS` (out of scope), but v0 also does **not** propagate it — `MODE_SCOPED_KEYS` ships the real prefixes. Since `MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS` must hold, the four session-domain prefixes must be added to `PROFILE_SCOPED_KEYS` in this PR as a forward-only bug fix to the latent invalidation gap.
8. **No `X-App-Context` header.** Same constraint as v1. App context is presentation-only on the client; authorization remains profile-scoped via existing `X-Profile-Id`.
9. **Single source of truth for capability.** `isFamilyCapableProfile()` is the only predicate that gates the mode switch UI. Do not reintroduce `isGuardianProfile()` checks for the mode switch (note: `isGuardianProfile()` and `resolveTabShape()` continue to exist as the **tab-shape** primitives for non-family-capable users — see Rule #11 for the composition order).
10. **Visible-tab precedence is fixed.** The visible-tab set is computed in this exact order: (a) if `isParentProxy`, return `PARENT_PROXY_TABS`; (b) else if `mode === null` (boot frame), return an empty set / suppress mode-specific tabs; (c) else if `isFamilyCapableProfile(activeProfile, profiles)` is true, return `computeModeVisibleTabs(mode)`; (d) else return `computeVisibleTabs(resolveTabShape(...), isParentProxy)` (the legacy path). For a family-capable adult, mode tabs **fully replace** guardian-shape tabs — the 5th tab (`own-learning`) is replaced by the mode chip in the header. Non-family-capable users continue to use the legacy shape path; mode for them is permanently `'study'` and the mode-chip UI is hidden.
11. **Capability is computed from already-loaded data; no new API field required.** v0 derives capability from `activeProfile.isOwner`, `activeProfile.birthYear`, and the existing `profiles` array. Archive state is intentionally **not** checked — `profileSchema` has no `archivedAt` and v1 owns that contract change. Do not introduce a hidden API field or a guessed archival inference (e.g., `consentStatus === 'WITHDRAWN'`).

## Family Home — Recent Child Activity (Reuse `useDashboard()`)

- Add a "Recent child activity" section to `ParentHomeScreen.tsx` rendered only when app context is Family.
- **Data source:** `useDashboard()` — already called by `ParentHomeScreen.tsx`. Verified against `packages/schemas/src/progress.ts:310-340`: `DashboardChild` carries `sessionsThisWeek`, `sessionsLastWeek`, `totalTimeThisWeek`, `totalTimeLastWeek`, `currentStreak`, `trend`, `subjects[]`, `currentlyWorkingOn[]`, `totalSessions`. It does **not** carry `lastActivityAt`, and it does **not** carry a per-session array. v0 does not need either.
- **Shape:** per-child summary tiles (one tile per child), ordered `sessionsThisWeek` desc, then `totalTimeThisWeek` desc as tiebreaker. Each tile shows the child's display name, this-week session count, and `trend` indicator, and links to that child's existing route — primary target `/(app)/child/[profileId]` (the child's index landing), where the existing reports / sessions affordances already live.
- If no children have any this-week activity (all children have `sessionsThisWeek === 0`), show a named empty state with a gentle next action ("waiting for first session this week" — match existing `ParentHomeScreen` copy patterns).
- **Do not add a new feed endpoint in v0** — that work belongs to v1's Recaps surface.

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
- Cross-mode notification handler rewrite is out of scope for v0, but route-level safety is not. If an existing notification or deep link lands on a child/family route while Study mode is active, that route must switch to Family via `replace` or show a Family-context/no-access fallback before rendering child data. This keeps v0 from validating a muddy version of the split.

## Implementation Plan

### Preflight (must complete before coding)

- Confirm `profileSchema` exposes `isOwner` and `birthYear` (verified: `packages/schemas/src/profiles.ts:92-109`).
- Confirm the mobile client already loads the full `profiles` array (verified: `useLinkedChildren()` at `apps/mobile/src/lib/profile.ts:85-104` filters on the array).
- Confirm `useDashboard()` is already wired in `ParentHomeScreen.tsx` (verified: query key `['dashboard', profileId]` in `apps/mobile/src/lib/query-keys.test.ts:192-196`).
- **No API or schema change is required for v0.** If implementation discovers any of the above is incorrect, pause and amend this spec before writing code — do not infer a hidden predicate or add an undocumented field.

### Steps

1. **Capability helper.**
   - Add `isFamilyCapableProfile(activeProfile, profiles)` in `apps/mobile/src/lib/profile.ts`. Returns true iff: `activeProfile.isOwner === true`, `computeAgeBracket(activeProfile.birthYear) === 'adult'`, and `profiles.some(p => p.id !== activeProfile.id && p.isOwner === false)`.
   - v0 deliberately does **not** check archived state. `profileSchema` has no `archivedAt` field; adding one is v1's contract change. If a child is removed mid-session, the next profile refetch drops them from the array and capability re-evaluates.
   - v0 deliberately does **not** check subscription tier. The current `LearnerScreen` condition (`hasLinkedChildren || isFamilyPlanOwner`) shows `ParentHomeScreen` to Family/Pro subscribers without linked children — v0 narrows that. See §Overview "Capability is linkage-driven" and the Failure Modes row "Family/Pro subscriber without linked children." Add-child entry on Study home (existing `More → Add child` flow) is the documented path back to Family capability.
   - Tests: under-18 owner with non-owner sibling is **not** family-capable; adult owner with one linked non-owner profile **is**; adult owner with no linked profiles is **not** (even with `subscription.tier === 'family'`); non-owner is **not**; `activeProfile = null` returns `false`.

2. **App context provider.**
   - Create `apps/mobile/src/lib/app-context.tsx` exporting `AppContextProvider` and `useAppContext()`.
   - Value shape: `{ mode: 'study' | 'family' | null; setMode: (m: 'study' | 'family') => void }`. `null` is the boot value, valid until profiles resolve.
   - Mount inside the existing provider stack in `(app)/_layout.tsx`, after `ProfileProvider`.
   - **Subscription, not callback.** Use a `useEffect` keyed on `[activeProfile?.id, activeProfile?.isOwner, activeProfile?.birthYear, linkedChildren.length]`. When inputs change, recompute mode from `isFamilyCapableProfile()`. This covers `switchProfile`, add-child mid-session, profile refetch, **and sign-in-as-different-user** without trusting any single mutation path.
   - **Reset-before-recompute on identity loss.** The effect body must follow this exact order: (1) if `useProfile().isLoading === true` OR `activeProfile === null`, set `mode = null` (do not retain the previous value) and return; (2) only when `activeProfile` is non-null, derive `'family'` vs `'study'` from `isFamilyCapableProfile()`. This is the rule that prevents the previous user's `'family'` mode from rendering against the new user's data during sign-out → sign-in. See §Mode State and the matching Failure Modes row.
   - **Cross-account safety.** Because `(app)/_layout.tsx` does not remount on sign-out (`key={themeKey}` is intentionally disabled per `MEMORY.md → project_themekey_removed.md`), the React context survives sign-out. The identity subscription + reset-before-recompute is the recovery path. Mirrors the still-open `project_cross_account_leak_2026_05_10.md` — do not reintroduce that leak class for mode state.
   - **Boot frame.** While `useProfile().isLoading === true`, hold `mode = null`. Consumers gate Family chrome behind `mode === 'family'` (never `mode !== 'study'`), so a `null` mode shows neither set. Mirrors `resolveTabShape` least-privilege default at `_layout.tsx:108`.
   - v0 explicitly does not read or write SecureStore for mode state. If any persistence is added during implementation, fail review and extend `signOutWithCleanup` first.
   - Tests: identity change (simulated `activeProfile?.id` swap) recomputes mode; add-linked-child flips capability false → true; boot frame holds `mode = null` rather than defaulting to `'family'`; **identity loss (`activeProfile` → null) synchronously resets `mode` to `null` before the next user's profile resolves**.

3. **Tab shell update.**
   - **Name-collision guard.** `_layout.tsx:114-126` already exports `computeVisibleTabs(shape: TabShape = 'guardian', isParentProxy = false): Set<string>`. Do **not** shadow that name. Add a new helper:
     - `computeModeVisibleTabs(mode: 'study' | 'family' | null): ReadonlySet<string>` colocated with the existing whitelists.
     - Returns Study: `{ 'home', 'library', 'progress', 'more' }`; Family: `{ 'home', 'progress', 'more' }`; null (boot frame): empty set.
   - **Composition.** Compose the visible-tab set per the precedence rule in §Hard Rules #10: `isParentProxy ? PARENT_PROXY_TABS : (mode === null ? ∅ : isFamilyCapable ? computeModeVisibleTabs(mode) : computeVisibleTabs(resolveTabShape(...), isParentProxy))`. Each `Tabs.Screen` toggles `screenOptions.href` to `null` when its name is not in the composed set (mirrors the existing pattern at `_layout.tsx:1738-1740`).
   - Family home tab label: Children. Study home tab label: My Learning.
   - **Proxy precedence** is already baked into the composition order above. Add an `_layout.tsx`-level comment documenting it and assert it in a test.
   - `own-learning.tsx` route file is edited in Step 3a (next bullet). For non-family-capable users it continues to redirect via `resolveTabShape() !== 'guardian'`. For a family-capable adult, it calls `setMode('study')` then renders — Route Survival.

3a. **`own-learning.tsx` Route Survival.**
   - Edit `apps/mobile/src/app/(app)/own-learning.tsx`. Before the existing `<Redirect>` guard, add: `useEffect(() => { if (isFamilyCapableProfile(activeProfile, profiles) && mode === 'family') setMode('study'); }, [...])`.
   - Keep the existing `resolveTabShape() !== 'guardian'` redirect for non-capable users (it already covers the solo learner and the child-on-parent-account cases).

4. **Mode switch UI.**
   - Visible only when `isFamilyCapableProfile(activeProfile, profiles)` is true AND `mode !== null`.
   - **Placement: render the chip inside `apps/mobile/src/app/(app)/home.tsx`** — the route-wrapper component — above the `<LearnerScreen>` render and before the celebration overlay. Single source of truth, so the chip appears in both Family and Study modes without being duplicated inside `LearnerScreen` / `ParentHomeScreen`. The chip reads `mode` from `useAppContext()` directly.
   - Family home header shows current context label `Family` and a switch chip/action labelled `My Learning`.
   - Study home header shows current context label `My Learning` and a switch chip/action labelled `Family`.
   - Do not hide the only switch in More for v0. More may include a secondary entry later, but the home header is the discoverable control for the experiment.
   - Switch action: `setMode(next)` → invalidate `MODE_SCOPED_KEYS` (see step 8) → `router.replace('/(app)/home')`. Wrap the body in a `useRef` reentrancy guard so a second rapid call before the first completes is a no-op (covers AC #21 / rapid-toggle).
   - **Analytics signature verified.** `apps/mobile/src/lib/analytics.ts:34-47` exports `track(event: string, properties: AnalyticsProperties = {})`. Call site: `track('mode_switched', { from, to, profileIdHash: hashProfileId(activeProfile.id), accountAgeBucket: bucketAccountAge(activeProfile.createdAt) })`. `hashProfileId` and `bucketAccountAge` are already exported from the same module.

5. **Family home — adult-study activation card.**
   - Add a quiet card/row on Family home for family-capable adults, below the main child/family summary content.
   - Suggested copy shape: "Want to study too?" / "Build your own progress alongside your child." / action `Go to My Learning`.
   - The action uses the same switch behavior as the header: `setMode('study')` → `router.replace('/(app)/home')`.
   - Do not show this card to Study-only users, child profiles, or while proxy-viewing a child.
   - Keep the card visually calm; this is an entry point, not a marketing hero.

6. **Family home — Recent child activity.**
   - Add the section to `ParentHomeScreen.tsx`, mode-gated via `useAppContext()`.
   - **Data source:** the existing `useDashboard()` result already in scope (`ParentHomeScreen.tsx` already calls it). `DashboardData.children: DashboardChild[]` carries `sessionsThisWeek`, `totalTimeThisWeek`, `currentStreak`, `trend` (verified `packages/schemas/src/progress.ts:310-340`). No `lastActivityAt`, no per-session array — and v0 does not need them.
   - **Shape:** per-child summary tiles, ordered `sessionsThisWeek` desc then `totalTimeThisWeek` desc as tiebreaker. Each tile links to `/(app)/child/[profileId]` (the child's index landing).
   - Empty state when all children have `sessionsThisWeek === 0`, with named copy.

7. **Progress filtering.**
   - Read `mode` from `useAppContext()` in `progress/index.tsx`. If `mode === null`, defer rendering until it resolves.
   - Family: child profiles only; default to most-recent child; hide self.
   - Study: self only; hide picker.

8. **Leak hardening.**
   - Create `apps/mobile/src/lib/mode-scoped-keys.ts` exporting `MODE_SCOPED_KEYS: readonly string[]`. v0 ships exactly these `queryKey[0]` strings (verified against `apps/mobile/src/lib/query-keys.ts:26-210`):
     ```ts
     export const MODE_SCOPED_KEYS = [
       'progress',          // every progress.* factory
       'dashboard',          // every dashboard.* factory (adult root + child detail)
       'session',            // sessions.detail
       'session-transcript', // sessions.transcript
       'session-summary',    // sessions.summary
       'parking-lot',        // sessions.parkingLot + sessions.topicParkingLot
     ] as const;
     ```
     Note `'session'` is singular. There is no query whose `queryKey[0] === 'sessions'`; the plural string in `PROFILE_SCOPED_KEYS` (line 254) is a latent dead entry.
   - **Companion fix to `PROFILE_SCOPED_KEYS`:** because `MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS` must hold (guard test below), add `'session'`, `'session-transcript'`, `'session-summary'`, `'parking-lot'` to `PROFILE_SCOPED_KEYS` in `profile.ts:252-276` as a forward-only bug fix. The latent `'sessions'` entry stays for now — out of scope to remove in v0.
   - **Factory mode-segmentation table.** Update `apps/mobile/src/lib/query-keys.ts` so each factory below gains a `mode` positional segment **after** the leading domain string:

     | Factory | New shape | Rationale |
     |---|---|---|
     | `progress.subject` | `['progress', mode, 'subject', subjectId, profileId]` | self vs child progress |
     | `progress.overview` | `['progress', mode, 'overview', profileId]` | self vs child overview |
     | `progress.continue` | `['progress', mode, 'continue', profileId]` | resume target differs by mode |
     | `progress.resumeTarget` | `['progress', mode, 'resume-target', profileId, ...]` | same |
     | `progress.activeSessionForTopic` | `['progress', mode, 'topic', topicId, 'active-session', profileId]` | same |
     | `progress.resolveTopicSubject` | `['progress', mode, 'topic', topicId, 'resolve', profileId]` | same |
     | `progress.reviewSummary` | `['progress', mode, 'review-summary', profileId]` | same |
     | `progress.overdueTopics` | `['progress', mode, 'overdue-topics', profileId]` | same |
     | `progress.topicProgress` | `['progress', mode, 'topic', subjectId, topicId, profileId]` | same |
     | `progress.inventory` | `['progress', mode, 'inventory', profileId]` | same |
     | `progress.history` | `['progress', mode, 'history', profileId, query]` | same |
     | `progress.milestones` | `['progress', mode, 'milestones', profileId, limit]` | same |
     | `progress.profileSessions` | `['progress', mode, 'profile', profileId, 'sessions', activeProfileId]` | parent-viewing-child surface |
     | `progress.profileReports` | `['progress', mode, 'profile', profileId, 'reports', activeProfileId]` | same |
     | `progress.profileWeeklyReports` | `['progress', mode, 'profile', profileId, 'weekly-reports', activeProfileId]` | same |
     | `progress.profileReportDetail` | `['progress', mode, 'profile', activeProfileId, 'report', reportId]` | same |
     | `progress.profileWeeklyReportDetail` | `['progress', mode, 'profile', activeProfileId, 'weekly-report', reportId]` | same |
     | `dashboard.root` | `['dashboard', mode, profileId]` | adult-root dashboard render differs by mode |
     | `dashboard.childDetail` | `['dashboard', mode, 'child', childProfileId]` | child detail accessible only in Family mode |
     | `dashboard.childSubject` | `['dashboard', mode, 'child', childProfileId, 'subject', subjectId]` | same |
     | `dashboard.childSessions` | `['dashboard', mode, 'child', childProfileId, 'sessions']` | same |
     | `dashboard.childSessionDetail` | `['dashboard', mode, 'child', childProfileId, 'session', sessionId]` | same |
     | `dashboard.childMemory` | `['dashboard', mode, 'child', childProfileId, 'memory']` | same |
     | `dashboard.childInventory` | `['dashboard', mode, 'child', childProfileId, 'inventory']` | same |
     | `dashboard.childHistory` | `['dashboard', mode, 'child', childProfileId, 'history', query]` | same |
     | `dashboard.childProgressSummary` | `['dashboard', mode, 'child', childProfileId, 'progress-summary']` | same |
     | `dashboard.childReports` | `['dashboard', mode, 'child', childProfileId, 'reports']` | same |
     | `dashboard.childReportDetail` | `['dashboard', mode, 'child', childProfileId, 'report', reportId]` | same |
     | `dashboard.childWeeklyReports` | `['dashboard', mode, 'child', childProfileId, 'weekly-reports']` | same |
     | `dashboard.childWeeklyReportDetail` | `['dashboard', mode, 'child', childProfileId, 'weekly-report', reportId]` | same |
     | `sessions.detail` | `['session', mode, sessionId, profileId]` | session detail viewed via Family vs Study path |
     | `sessions.transcript` | `['session-transcript', mode, sessionId, profileId]` | same |
     | `sessions.summary` | `['session-summary', mode, sessionId, profileId]` | same |
     | `sessions.parkingLot` | `['parking-lot', mode, sessionId, profileId]` | same |
     | `sessions.topicParkingLot` | `['parking-lot', mode, 'topic', subjectId, topicId, profileId]` | same |

     Each call site that consumes these factories must pass `mode` from `useAppContext()`. While `mode === null`, the hook returns `enabled: false` so no query fires.
   - `setMode` invalidates by predicate `query => MODE_SCOPED_KEYS.includes(String(query.queryKey[0]))`.
   - **Guard test (forward-only):** every entry in `MODE_SCOPED_KEYS` is also present in `PROFILE_SCOPED_KEYS`. A profile switch must never undershoot a mode switch.
   - **Leak test:** mount Family → prime caches → flip to Study → assert no child data renders and Family-only queries are invalidated.

9. **Proxy normal-path hide-out (Phase 1 from v1).**
   - Enumerate and remove "view as child" entry points from normal UX. v0 explicitly touches:
     - All user-facing `setProxyMode(true)` call sites reachable from a profile-row tap, profile picker, settings, or more screens. Grep `setProxyMode(true)` and delete those call sites.
     - Profile-row affordances that visually offer "view as child" — verify against current `apps/mobile/src/components/profile/*` and `apps/mobile/src/app/(app)/more/*` shape during implementation.
   - **Preserved (synthetic/internal):** `setProxyMode` function itself, `signOutWithCleanup`'s `setProxyMode(false)` (`apps/mobile/src/lib/sign-out.ts:68`), `PARENT_PROXY_KEY` SecureStore behavior, `PARENT_PROXY_TABS` whitelist, and `onSwitchBack` in `_layout.tsx:1685`.
   - **Forward-only test:** no user-facing component in `apps/mobile/src/components/profile/*` or `apps/mobile/src/app/(app)/more/*` calls `setProxyMode(true)` directly.

10. **Family route guard — single chokepoint.**
    - Create `apps/mobile/src/components/guards/RequireFamilyContext.tsx` (wrapper) and `useGuardFamilyRoute()` in `apps/mobile/src/lib/navigation.ts`. Behavior: if `mode !== 'family'`, either call `setMode('family')` + `router.replace` to a safe family root (capable adult) or render a no-access fallback (non-capable user reached this route via deep link or notification).
    - **Wrap once at `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`.** That layout is the single chokepoint for every nested child route (verified via filesystem: `index.tsx`, `mentor-memory.tsx`, `reports.tsx`, `report/[reportId].tsx`, `session/[sessionId].tsx`, `subjects/[subjectId].tsx`, `topic/[topicId].tsx`, `weekly-report/[weeklyReportId].tsx`). Wrapping the layout protects all of them in one edit. Do **not** wrap individual route files — that path drifts as new routes are added.
    - **Tests:** at least three distinct child routes covered by deep-link-while-Study integration tests (proving the layout-level guard fires for every nested route, not just the one wrapped manually). Asserting on one route is insufficient — the guard's purpose is route-class coverage.
    - Any future progress drill-down that takes a non-self `profileId` outside the `child/[profileId]/` subtree must use the same `useGuardFamilyRoute()` hook at its own layout level.

## Acceptance Criteria

1. Given the active profile has no family capability, when the tab shell renders, then Study tabs are visible and no mode switch UI is shown.
2. Given an adult owner under 18 with a non-owner sibling on the account, when capability is computed, then `isFamilyCapableProfile` returns false.
3. Given a family-capable adult opens the app, when profiles have resolved, then mode resolves to `'family'`. During the boot frame (while `useProfile().isLoading === true`) the provider holds `mode === null` and no Family chrome is rendered — there is no observable flicker between Study and Family tab sets.
4. Given `computeVisibleTabs('family')` is called, then it returns exactly `home`, `progress`, and `more`.
5. Given `computeVisibleTabs('study')` is called, then it returns exactly `home`, `library`, `progress`, and `more`.
6. Given a family-capable adult is on Family home, when the header renders, then the current context reads Family and the primary switch action is labelled My Learning.
7. Given a family-capable adult is on Study home, when the header renders, then the current context reads My Learning and the primary switch action is labelled Family.
8. Given Family mode is active for a family-capable adult, when Family home renders, then a quiet "Want to study too?" card appears with a Go to My Learning action.
9. Given the adult-study activation card action is tapped, when the switch completes, then it uses the same `setMode('study')` + `router.replace('/(app)/home')` behavior as the header switch.
10. Given Family mode is active, when Progress opens, then the adult self profile is not selectable.
11. Given Study mode is active, when Progress opens, then no child profile is selectable.
12. Given Family mode is active, when Family home renders, then "Recent child activity" is visible, sourced from the existing `useDashboard()` result, with per-child tiles ordered by `sessionsThisWeek` desc then `totalTimeThisWeek` desc.
13. Given a parent taps a recent-child-activity tile, when navigation completes, then the route `/(app)/child/[profileId]` renders for that tile's child profile.
14. Given `/(app)/child/[profileId]/session/[sessionId]` is opened via deep link in Family mode, when Back is pressed, then the app lands on `/(app)/home` in Family mode via `goBackOrReplace`. The same Back behavior applies to `report/[reportId]` and `weekly-report/[weeklyReportId]`.
15. Given a family-capable adult taps the mode switch, when the switch completes, then `router.replace('/(app)/home')` was called and the previous mode's detail routes are not in the back stack.
16. Given the user switches mode, when prior mode's cached queries exist, then they are invalidated and the new mode does not render stale data from the previous mode.
17. Given a sign-out followed by sign-in as a different user (without app restart), when the next user's profile resolves, then mode is recomputed from their capability — the previous user's mode does not persist in the React context.
18. Given the normal profile picker is used, when a child profile is selected/reviewed, then the app does not route through proxy mode.
19. Given a Study-mode user has the `own-learning` deep link opened, when the route resolves, then it renders the Study learner experience (no Family chrome).
20. Given a Family-mode eligible adult deep-links into `own-learning`, when the route resolves, then mode is switched to Study via the Route Survival rule and the learner home renders.
21. Given the user toggles mode rapidly, when a second `setMode` fires before the first completes, then the reentrancy guard makes the second call a no-op and no half-mixed tab set is observable.
22. Given Family home renders Recent child sessions, when implementation reads its data, then it sources from the existing `useDashboard()` result — no new endpoint, no fan-out of per-child requests.
23. Given Study mode is active and any nested child route (`child/[profileId]/index`, `…/session/[sessionId]`, `…/reports`, `…/report/[reportId]`, `…/mentor-memory`, `…/subjects/[subjectId]`, `…/topic/[topicId]`, `…/weekly-report/[weeklyReportId]`) is opened directly by deep link or notification, then child data does not render until the layout-level guard at `child/[profileId]/_layout.tsx` switches mode to Family or displays the family-context fallback. Coverage asserted via at least three distinct nested routes — the guard's purpose is route-class coverage proving the layout chokepoint works.
24. Given proxy mode is active, when the tab shell renders, then `PARENT_PROXY_TABS` is applied regardless of `mode` (proxy precedence rule).
25. Given every entry in `MODE_SCOPED_KEYS`, when checked against `PROFILE_SCOPED_KEYS` in `apps/mobile/src/lib/profile.ts`, then every mode-scoped key is also profile-scoped — a profile switch never undershoots a mode switch.
26. Given an adult owner has an active Family/Pro subscription but no linked child profile, when the home renders, then Study mode chrome is shown (not ParentHomeScreen), the mode chip is hidden, and the existing add-child entry on Study More remains visible. Adding a child immediately flips capability and surfaces the mode chip on the next render.
27. Given `activeProfile` transitions to `null` (sign-out path), when the `AppContextProvider` effect runs, then `mode` is set to `null` **synchronously in the same effect tick** — the previous user's mode value is never visible against the new user's profile. Mirrors the still-open cross-account profile-id leak pattern.

## Failure Modes

| State | Trigger | User sees | Recovery |
| ----- | ------- | --------- | -------- |
| Family-capable adult opens app | Default capability path | Family home with Children, recent child sessions section, Progress, More, header switch to My Learning, and quiet study activation card | Tap header switch or study activation card to enter Study |
| Family default after restart | App relaunch | Family mode again (no persistence) | Acceptable for v0; v1 adds server-backed memory |
| Adult without family capability | No linked children or under-18 | Study tabs only, no mode switch UI | Add a child profile (existing flow) → next reload exposes Family |
| Family/Pro subscriber without linked children | Adult owner with `subscription.tier === 'family' \| 'pro'` but no `profiles.some(p => !p.isOwner)` | Study chrome on home. **Regression vs. current code**: today this user sees ParentHomeScreen via the `isFamilyPlanOwner` branch at `LearnerScreen.tsx:457`. v0 narrows capability to linkage-driven. Add-child entry remains visible on Study More. | Tap More → Add child (existing flow). After child link, capability flips on next render and Family chrome appears. |
| Adult adds a child mid-session | Existing add-child flow completes | Capability helper sees new linked profile on next render; mode switch UI appears | User can switch immediately |
| Adult is in Study mode and a child finishes a session | Push notification arrives | Existing notification handler may still target the child route, but the route guard switches to Family or shows a family-context fallback before child data renders | v1 will rewrite push routing to switch context first |
| Child/family deep link opens while Study mode is active | Notification or external link targets an existing child route | Family context is applied via replace, or a no-access/family-context fallback appears before child data renders | Route-level guard prevents child data rendering inside Study chrome |
| Parent is in Family mode, opens own-learning deep link | Eligible adult | Mode flips to Study via Route Survival, lands on learner home | Use the mode chip to return to Family |
| Mode switch fires while in a detail route | User taps switch from a child detail screen | `router.replace('/(app)/home')` lands on the target mode's home; no stale child detail in stack | Standard back behavior from home |
| Family home recent-activity shape | `DashboardChild` has no per-session array and no `lastActivityAt` | Per-child summary tiles only — never a per-session list. Tiles ordered `sessionsThisWeek` desc, `totalTimeThisWeek` desc tiebreaker. No new endpoint, no fan-out. | v1 decides whether a dedicated Recaps endpoint is worth building |
| Family home recent-activity section is empty | All children have `sessionsThisWeek === 0` | Named empty state with copy "waiting for first session this week" + link to existing add-child / family-management screen | Existing add-child flow |
| Stale cache leak (rare regression) | Bug in `MODE_SCOPED_KEYS` predicate or a query-key factory missed in §Step 8 table | Old mode's data renders briefly until next refetch | Pull-to-refresh forces refetch (existing). The §Tests "Leak test" must catch this before ship — engineering recovery is to add the missing key to `MODE_SCOPED_KEYS` or the missing factory to the §Step 8 mode-segmentation table. |
| Boot frame race | App cold-boots; profiles not yet loaded | `mode === null`; no Family chrome and no Study chrome render the mode-specific bits — existing loading/splash patterns cover the gap | Wait one render frame for profiles to resolve |
| Sign-in as a different user without app restart | Auth flow swaps account but `(app)/_layout.tsx` does not remount | Identity-keyed `useEffect` in `AppContextProvider` follows reset-before-recompute: `activeProfile === null` collapses `mode` to `null` synchronously; new user's profile resolves → capability recomputes → new mode applied. Previous user's mode value is never visible against new data. | Subscription is the recovery path; tested against the `project_cross_account_leak_2026_05_10.md` pattern (AC #27) |
| Child removed mid-session | User removes a linked child from the account | Capability re-derives on next profile refetch; child disappears from picker and Family home | Profile refetch cycle (existing) |
| Adult turns 18 mid-session | `computeAgeBracket` reads `new Date().getFullYear()` per call (`packages/schemas/src/age.ts:43`); capability does not re-fire purely on clock advance | Capability flip is observed only on next profile refetch or app relaunch — accepted limitation for v0 | v1 may add a clock-tick recompute if it matters |
| Proxy precedence collision | Proxy mode active while mode = `'family'` | `PARENT_PROXY_TABS` wins; proxy chrome renders regardless of mode | Exit proxy via `onSwitchBack` (existing) |

## Tests

- **Unit (Jest, co-located):**
  - `isFamilyCapableProfile` — adult/under-18, with/without linked non-owner profile, non-owner active profile, null active profile. Also: adult owner with `subscription.tier === 'family'` but no linked children returns `false` (linkage-driven, not subscription-driven).
  - `computeModeVisibleTabs('study' | 'family' | null)` — exact tab set per mode; `null` returns empty set.
  - Visible-tab precedence (Hard rule #10): proxy > null > family-capable mode > legacy shape, verified in that order.
  - Progress picker filtering per mode.
  - `MODE_SCOPED_KEYS ⊆ PROFILE_SCOPED_KEYS` guard test (forward-only — every mode-scoped key is also profile-scoped).
  - Mode-switch invalidates queries by `MODE_SCOPED_KEYS` predicate.
  - Mode switch calls `router.replace`, not `push`.
  - Mode switch reentrancy guard — second `setMode` before first completes is a no-op.
  - Home header renders Family → My Learning and My Learning → Family switch labels for family-capable adults.
  - Family home renders the quiet adult-study activation card only for family-capable adults in Family mode.
  - Adult-study activation card uses the same switch/navigation path as the header switch.
  - Family home renders Recent child activity sourced from `useDashboard()`, ordered `sessionsThisWeek` desc then `totalTimeThisWeek` desc (mounted only in Family mode).
  - `own-learning` deep-link Route Survival: family-capable adult in Family mode hits `own-learning` → `setMode('study')` fires before render → learner experience renders without flicker.
  - Child/family route guard at `child/[profileId]/_layout.tsx` chokepoint prevents Study chrome from rendering child data on direct child detail open — covered across at least three distinct nested routes (e.g. `index`, `session/[sessionId]`, `reports`).
  - Capability re-derivation on identity change (simulated `activeProfile?.id` swap) — mirrors the cross-account leak pattern.
  - Identity-loss reset (AC #27): `activeProfile` transitions to `null` → `mode` becomes `null` synchronously in the same effect run.
  - Family/Pro subscriber without linked children (AC #26): `subscription.tier === 'family'` + zero linked non-owners renders Study chrome, no mode chip, add-child entry still visible on More.
  - Boot frame: while `useProfile().isLoading === true`, `mode === null` and consumers do not render mode-specific chrome.
  - Analytics: `track('mode_switched', { from, to, profileIdHash, accountAgeBucket })` matches the `track(event, properties)` signature at `analytics.ts:34-47`.

- **Integration / behavioural:**
  - Rapid toggle test: mode flips Family → Study → Family within a render frame produces no half-mixed tab set.
  - Cache leak test: mount Family, prime cache, switch to Study, assert no child data renders and `MODE_SCOPED_KEYS` queries are invalidated.
  - Detail back-fallback test: open child session detail directly, press Back, land on `/(app)/home` (Family).
  - Direct child route while Study is active: assert route switches/falls back before child data renders — across the enumerated route set.
  - Sign-in-as-different-user without app restart: previous user's `'family'` mode does not carry into the next user's session.

- **Out of scope for v0:**
  - Playwright web journeys (deferred to v1; v0 is mobile-first validation).
  - API tests (no API changes).
  - Push notification handler-routing tests (no handler change). Route-level child/family guard tests are in scope.

## Upgrade Path To v1

Once v0 ships and we have a few weeks of usage data, the question to answer is:

1. Do family-capable adults actually use the mode chip, or do they stay in one mode?
2. Is Recent-child-sessions on Family home enough, or do parents ask for a dedicated Recaps feed?
3. Is Progress clearer once mode-filtered, measured by reduced "wrong profile" reports?
4. Does the lack of cross-device persistence hurt? (Likely irrelevant pre-launch.)

v0 does not answer whether parent-to-adult-learning activation works. That requires `Learn this too`, onboarding intent, and/or a Recaps tab, which are v1 questions.

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

## Adversarial Review Changes (2026-05-19)

Pass 1 + 2 of the adversarial-review skill applied. Findings folded into the spec:

| ID | Issue | Resolution |
|---|---|---|
| CRITICAL-1 | `computeVisibleTabs` name collision with existing `_layout.tsx:114-126` function | Renamed new helper to `computeModeVisibleTabs`; documented composition order in Hard Rule #10 |
| CRITICAL-2 | `query-keys.ts`, `use-dashboard.ts`, `use-progress.ts` missing from `files_to_modify` | Added to front-matter and Context table |
| CRITICAL-3 | `'sessions'` is a phantom queryKey prefix; guard test passes trivially | Replaced with real prefixes (`'session'`, `'session-transcript'`, `'session-summary'`, `'parking-lot'`); added forward-only `PROFILE_SCOPED_KEYS` companion fix in §Step 8 |
| HIGH-1 | Family/Pro subscriber without linked children regresses from ParentHomeScreen to LearnerScreen | Documented in §Overview, AC #26, Failure Modes row; predicate intentionally linkage-driven |
| HIGH-2 | `own-learning.tsx` not in `files_to_modify` despite AC #20 | Added to front-matter; new Step 3a |
| HIGH-3 | Per-route guard wrapping leaves coverage holes | Single chokepoint at `child/[profileId]/_layout.tsx`; Step 10 rewritten; AC #23 updated |
| HIGH-4 | Identity-loss boot state (`activeProfile === null`) underspecified | Added reset-before-recompute rule in §Mode State, Step 2, AC #27, Failure Modes |
| MEDIUM-1 | `progress.*` / `dashboard.*` mode-scoped factories not enumerated | Full factory table added to §Step 8 |
| MEDIUM-2 | `DashboardChild` has no `lastActivityAt`; section name misleading | Renamed to "Recent child activity"; ordering pinned to `sessionsThisWeek` desc then `totalTimeThisWeek` desc |
| MEDIUM-3 | AC #14 deep-link target ambiguous | Bound to `child/[profileId]/session/[sessionId]`, with note on `report/[reportId]` and `weekly-report/[weeklyReportId]` |
| MEDIUM-4 | Tab-shape vs mode composition fuzzy | New Hard Rule #10 pins precedence: proxy > null > family-capable mode > legacy shape |
| MEDIUM-5 | `sign-out.ts` in `files_to_modify` but no edit needed | Removed from front-matter; standing note kept as tripwire |
| LOW-1 | `profile.ts:277-280` citation imprecise | Updated to `profile.ts:252-280` |
| LOW-2 | Mode chip placement not anchored | Pinned to `home.tsx` wrapper (single source) |
| LOW-3 | "Stale cache leak" recovery was engineering process | Rewritten as UX (pull-to-refresh) with engineering note separated |
