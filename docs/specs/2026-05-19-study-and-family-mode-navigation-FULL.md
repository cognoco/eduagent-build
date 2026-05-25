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
  - apps/mobile/src/app/(app)/onboarding/intent.tsx
  - apps/mobile/src/app/(app)/progress/index.tsx
  - apps/mobile/src/app/(app)/recaps.tsx
  - apps/mobile/src/components/home/ParentHomeScreen.tsx
  - apps/mobile/src/components/home/LearnerScreen.tsx
  - apps/mobile/src/app/profiles.tsx
  - apps/mobile/src/hooks/use-notification-response-handler.ts
  - apps/mobile/src/hooks/use-profiles.ts
  - apps/mobile/src/lib/analytics.ts
  - apps/mobile/src/lib/profile.ts
  - apps/api/drizzle/0089_ancient_naoko.sql
  - apps/api/src/routes/profiles.ts
  - apps/api/src/routes/recaps.ts
  - apps/api/src/services/profile.ts
  - apps/api/src/services/recaps.ts
  - packages/database/src/schema/profiles.ts
  - packages/schemas/src/profiles.ts
  - packages/schemas/src/recaps.ts
  - packages/schemas/src/index.ts
code_patterns:
  - Keep exactly two tab context shapes: study and family.
  - Resolve visible tabs from app context, not from guardian identity alone.
  - Recaps and Progress are parent-native family surfaces; normal parent review must not require proxy mode.
test_patterns:
  - Co-located React Native Jest tests for tab visibility, mode gating, and progress filtering.
  - API service/route tests for profile mode persistence and parent recap feed scoping.
  - Playwright role journeys for Study-only, Family setup/default, and dual-context adult accounts.
---

# Tech-Spec: Study And Family Mode Navigation

**Created:** 2026-05-19

> **Status (2026-05-23):** Foundation complete (migration `0089_ancient_naoko.sql`, `profiles.default_app_context`, `hasFamilyLinks` schema, `navigation-contract.ts` scaffolding, Recaps route+API). Task 1 (V0 `TabShape` rename) NOT executed — V0 still uses `'guardian'|'learner'`, V1 uses parallel `computeModeVisibleTabs()` path behind `MODE_NAV_V1_ENABLED`. `FAMILY_MODE_TABS` in `(app)/_layout.tsx` still `{home, progress, more}` (missing `recaps`). Tasks 6, 12, 13, 16-20 status varies; see implementation notes.

> **Hard constraint (added 2026-05-22).** Today's 5-tab production mode (active when `MODE_NAV_V0_ENABLED=false` in Doppler) **must keep working** across every PR in this migration. V0 helpers and V0-off short-circuits stay alive when V1 ships; the new contract is gated behind a separate `MODE_NAV_V1_ENABLED` flag. See the "Hard Constraint — Preserve 5-Tab Mode Across All Increments" section of `docs/specs/2026-05-21-navigation-contract.md` for the full flag matrix, load-bearing files, and the required regression test.

## Overview

### Problem Statement

MentoMate is a study app for learners of any age, with a family layer for adults who support child learners. The current parent navigation mixes family support and the parent's own learning in one shell, which makes tabs like Library and Progress ambiguous. Parents can study too, but the app needs to make the current job unmistakable: studying as myself, supporting my family, or viewing a specific child.

### Solution

Introduce two clear app contexts and keep exactly two tab shapes. **Study mode** is the user's own learning context: My Learning, Library, Progress, More. **Family mode** is the adult family-support context: Children, Recaps, Progress, More. Family mode replaces the current guardian/hybrid visible tab set; it is not a third shape.

The active tab shape is driven by the current app context, not by guardian identity alone. An adult with family capability can be in Study mode and should see Study tabs. The same adult can switch to Family mode and see Family tabs. The profile remains the same person/account in both contexts.

Parent review should be parent-native. The normal parent path for child session summaries is Recaps, not "view as child" proxy mode. Proxy mode remains technically available only through synthetic tests or explicitly retained internal/debug paths until it is audited and removed or permanently hidden before public release.

## Scope

### In Scope

- First-run Study/Family intent choice after sign-up and before profile setup completes, without treating the choice as a permanent identity.
- No durable pre-auth or pre-profile intent storage. Intent before profile creation is ephemeral UI/route state only.
- Concrete family capability predicate:
  - an active owner profile,
  - age 18 or older,
  - at least one non-archived `family_links` row where the owner is `parent_profile_id`.
- Post-profile capability resolution:
  - under-18 users get Study only;
  - adults without family capability get Study only;
  - adults who chose Family but have no child yet enter Family setup, not Family tabs;
  - adults with family capability can use Family mode;
  - adults who activate both Study and Family can switch between the two clear contexts.
- Study mode navigation: My Learning, Library, Progress, More.
- Family mode navigation: Children, Recaps, Progress, More.
- Recaps as a first-class Family tab from v1.
- Child curriculum management remains reachable from Family mode through child cards/details, not through proxy mode.
- Family Progress keeps today's child/family progress behavior, but removes the parent's own progress from Family mode.
- Parent-to-study bridge from Recaps or child session surfaces, currently named "Add to my learning", switching the same adult account into Study mode as themselves.
- The same person/account remains linked across modes; switching modes must not create a separate identity.
- Hide proxy/view-as-child from normal end-user paths once Recaps covers parent review.

### Out of Scope

- Adding a third tab shape.
- Keeping the current guardian/hybrid visible tab set after Family mode ships.
- Family challenges, competitions, leaderboards, team points, or quiz contests.
- Rebuilding the learning engine or learner home.
- Replacing the existing Progress implementation beyond context-specific filtering/labeling.
- Forcing every app open through a mode chooser.
- Treating Study/Family as permanent account types.
- Fully deleting proxy mode in the first PR before the proxy usage audit is complete.
- Assuming every child learner has a linked account.
- Assuming learner accounts are adult-only or age-gated.

## Glossary

| Term | Meaning |
| ---- | ------- |
| Study mode | The user's own learning context. Progress, Library, and sessions are for the active user/profile. |
| Family mode | The adult family-support context. Recaps, Progress, and child curriculum management are about child learners the adult can support. |
| Family capability | The concrete predicate that allows Family mode tabs: active profile `isOwner === true`, active profile is 18+, and the owner has at least one non-archived `family_links` row where `family_links.parent_profile_id = activeProfile.id`. Server source of truth is the `family_links` table. Expose this through the profile response as `hasFamilyLinks: boolean` for owner profiles. Client helper should mirror this as `isFamilyCapableProfile(activeProfile)` using `activeProfile.isOwner`, `isAdultOwner`/birth year, and `activeProfile.hasFamilyLinks === true`; do not infer capability from `profiles.some(!isOwner)`. Under-18 owners and non-owner child profiles are never family-capable. Consent/visibility still filters what Family surfaces can display, but it does not redefine capability. |
| Family setup | A setup flow for an adult who chose Family intent but has no child learner relationship yet. It is not the Family tab shell. |
| AI mentor | The LLM/tutor voice and conversation behavior. This is unrelated to Family mode; avoid using "mentor" as a technical mode name. |
| Parent proxy / view-as-child | Existing preview context where a parent sees a child learner surface with proxy chrome. This should not be the normal parent review UX. |
| Child learner/profile | A child learning record. It may be parent-managed only or linked to the child's own learner account. |

## Context For Development

### Codebase Patterns

- Mobile authenticated routes live under `apps/mobile/src/app/(app)/`.
- The current tab shell is implemented in `apps/mobile/src/app/(app)/_layout.tsx`.
- Current `TabShape` is `guardian | learner`, where guardian identity currently drives the five-tab hybrid shape.
- This spec changes the semantics to context-driven tabs. Implementation should rename the shape values to `study | family` or introduce an equivalent two-value `AppTabContextShape`. Do not keep a `guardian` shape that sometimes means family tabs and sometimes means guardian identity.
- Current tab visibility sets:
  - Guardian/hybrid: `home`, `own-learning`, `library`, `progress`, `more`.
  - Learner: `home`, `library`, `progress`, `more`.
  - Parent proxy visibility subset: `home`, `library`, `progress`.
- The parent proxy visibility subset is not a third shape.
- Parent home/family surface lives through `apps/mobile/src/components/home/ParentHomeScreen.tsx`.
- Parent's own learning currently routes through `apps/mobile/src/app/(app)/own-learning.tsx`.
- Learner home is already reusable through `apps/mobile/src/components/home/LearnerScreen.tsx`.
- Parent-visible child session recaps already exist under `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`.
- Existing specs already separate child profile, progress, and reports surfaces; this spec should build on that direction rather than duplicate it.
- Mobile uses React Context for auth/profile state and TanStack Query for server state.

### Files To Reference

| File | Purpose |
| ---- | ------- |
| `apps/mobile/src/app/(app)/_layout.tsx` | Current tab shape resolution, visible tabs, proxy banner, and tab labels |
| `apps/mobile/src/app/(app)/home.tsx` | Current landing route that chooses parent vs learner home content |
| `apps/mobile/src/app/(app)/own-learning.tsx` | Current parent path into their own learner experience |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | Current Family Hub / parent dashboard surface and child actions |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Current Study mode learner home |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Existing Progress behavior, including parent/child/self profile selection |
| `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` | Existing parent-facing session recap detail and possible "Add to my learning" source |
| `apps/mobile/src/app/profiles.tsx` | Existing profile switching and child account/profile entry points |
| `apps/mobile/src/hooks/use-notification-response-handler.ts` | Push tap routing; must account for Family/Study context boundaries |
| `apps/mobile/src/lib/api-client.ts` | Existing `X-Profile-Id` and `X-Proxy-Mode` header state; do not add app-context header in v1 |
| `apps/mobile/src/lib/analytics.ts` | Existing `track()` and profile-safe hashing helpers for mode lifecycle events |
| `apps/mobile/src/lib/copy-register.ts` | Adult/child copy register helper; Family mode UI uses adult register |
| `apps/mobile/src/lib/profile.ts` | Current `isGuardianProfile`, linked children, profile switch, and proxy side effects |
| `apps/mobile/src/hooks/use-parent-proxy.ts` | Existing parent-viewing-child context detection |
| `apps/mobile/src/hooks/use-active-profile-role.ts` | Existing role detection for child/owner/proxy contexts |
| `apps/mobile/src/hooks/use-mentor-language-sync.ts` | Existing "mentor" language meaning; do not collide with this terminology |
| `apps/mobile/src/lib/sign-out.ts` | Central sign-out cleanup; extend only if client-persisted mode state is introduced |
| `apps/api/drizzle/0034_parent_session_recap.sql` | Existing parent recap storage columns: `narrative`, `conversation_prompt`, `engagement_signal` |
| `apps/api/src/routes/profiles.ts` | Existing profile list/get/patch/switch routes |
| `apps/api/src/services/profile.ts` | Existing profile CRUD, mapProfileRow, family link lookup, and role helpers |
| `apps/api/src/inngest/functions/weekly-progress-push.ts` | Existing family/progress push source that can deep link across contexts |
| `apps/api/src/inngest/functions/recall-nudge-send.ts` | Existing nudge push source and family-link lookup pattern |
| `packages/database/src/schema/profiles.ts` | `profiles` and `family_links` table definitions |
| `packages/database/src/schema/sessions.ts` | Session summary recap columns mapped to Drizzle fields |
| `packages/schemas/src/profiles.ts` | Shared profile schema and profile update contracts |
| `packages/schemas/src/sessions.ts` | Existing `engagementSignalSchema`; Recaps must reuse it instead of redefining signal values |
| `packages/schemas/src/progress.ts` | Existing child session recap shape to align with parent Recaps response |
| `packages/schemas/src/index.ts` | Barrel export for any new shared Recaps schema |
| `docs/specs/2026-05-13-parent-child-surfaces-information-architecture.md` | Related IA spec separating parent child surfaces |
| `docs/plans/2026-05-11-progress-reports-first.md` | Related Progress/report behavior and self-learning report support |

## Data Model And API

### Profile App Context Field

Add a per-profile app context field. Do not store this on the Clerk user/account because shared-account devices can contain multiple profiles and profile switches must not overwrite another profile's default.

Suggested DB shape:

```sql
ALTER TABLE profiles
  ADD COLUMN default_app_context text;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_default_app_context_check
  CHECK (
    default_app_context IS NULL
    OR default_app_context IN ('study', 'family')
  );
```

Implementation files:

- Migration: `apps/api/drizzle/0089_ancient_naoko.sql` (applied).
- Rollback: see migration meta journal for rollback procedure.
- Drizzle schema: add `defaultAppContext: text('default_app_context')` to `packages/database/src/schema/profiles.ts`.
- Shared schema: add `appContextSchema = z.enum(['study', 'family'])`, `defaultAppContext: appContextSchema.nullable().default(null)`, and `hasFamilyLinks: z.boolean().default(false)` to `packages/schemas/src/profiles.ts`.
- Profile mapper: include `defaultAppContext` and `hasFamilyLinks` in `mapProfileRow()` / `listProfiles()`.
- Profile update: allow `defaultAppContext` through the existing `PATCH /profiles/:id` route or add a dedicated `PATCH /profiles/:id/app-context` endpoint. In either case, validate capability server-side before accepting `'family'`.
- Existing rows/backfill: column is nullable; no data backfill is required. `NULL` means "no saved preference; infer default from capability," which is Study for non-family-capable profiles and Family or setup for users who chose Family during onboarding.

Deployment order:

1. Apply migration.
2. Deploy API/schema changes that read/write the nullable column.
3. Ship mobile changes that consume `defaultAppContext`.

Rollback:

- Mobile can tolerate `defaultAppContext: null` and derives Study by default.
- API rollback removes field exposure before dropping the DB column.
- DB rollback drops `profiles_default_app_context_check` and `profiles.default_app_context`. No user learning data is lost; only last/default app context preference is lost.

The rollback markdown must include:

```md
## Rollback

Rollback is possible. Drop `profiles_default_app_context_check`, then drop
`profiles.default_app_context`. This loses only the user's last/default Study
vs Family context preference; no learning, session, profile, report, or family
link data is lost.
```

### Mode Mutation Contract

Mode switching writes only the active profile's `defaultAppContext`. The mutation is idempotent:

```ts
type AppContext = 'study' | 'family';

type UpdateProfileAppContextInput = {
  profileId: string;
  defaultAppContext: AppContext;
};
```

Server rules:

- `study` is allowed for every active profile that can use the app.
- `family` is allowed only when `familyCapability === true`.
- A child/non-owner profile request for `family` returns a typed validation/forbidden error.
- A family-capable adult profile can switch either direction.
- Request must be scoped by explicit `profileId` in the route or body; the server verifies the profile belongs to the account and rejects if it does not.
- The target `profileId` must match the effective active profile scope for the request. If the route/body `profileId` and the active `X-Profile-Id` scope disagree, return the existing typed forbidden/conflict error instead of updating either profile.
- `switchProfile` must not update mode. It only changes active profile.

Client rules:

- The switch may be optimistic, but on any 4xx/5xx it must roll back to the previous context and show a retryable toast/banner.
- Capture the active `profileId` when the mutation starts. If the active profile changes before the mutation resolves, ignore the late response and refetch profiles; do not apply the old response to the new active profile.
- Disable the mode switch while `switchProfile` is in flight, and disable profile switching while a mode mutation is in its critical section, or use an equivalent single-flight guard.
- The tab shell must not commit a partial identity switch. Profile ID and app context remain separate pieces of state.
- Because mode is server-backed and comes through the profile query, no SecureStore key is needed.

## Technical Decisions

- **Exactly two app tab shapes.** Rename from identity-shaped `guardian | learner` to context-shaped `family | study`, or introduce a two-value equivalent. Do not add a third value.
- **Context, not identity, drives tabs.** Family-capable adults in Study mode see Study tabs. The same adult in Family mode sees Family tabs.
- **Family replaces guardian/hybrid.** The old `Family Hub + My Learning + Library + Progress + More` visible tab set is removed.
- **Study uses learner.** Study mode uses the existing learner tab shape and learner home/library/progress surfaces.
- **No durable pre-auth storage.** The first-run Study/Family choice is hosted after sign-up and before profile setup completes. It is in-memory/route state only until profile creation succeeds. If the auth/onboarding flow reloads, asking again is acceptable.
- **Persist durable default mode per profile.** Use `profiles.default_app_context`; never use SecureStore for mode state.
- **Persisted mode is justified by cross-device continuity.** `useActiveProfileRole()` already tells us owner/child/proxy role, but it cannot know whether a family-capable adult prefers Study or Family as their default across devices. Persisting `default_app_context` stores only that preference; it is not a new identity or authorization role.
- **No `X-App-Context` header in v1.** App context is navigation/presentation state plus a persisted default preference, not an API authorization scope. API scoping continues to use `X-Profile-Id`, explicit route params, and server-side family-link checks. Family endpoints return family data because they are parent-native endpoints; Study endpoints write/read the active profile's own data. Do not add `setActiveAppContext()` or `X-App-Context` without a separate security design.
- **Startup behavior avoids flicker.** `defaultAppContext` must be embedded in the profile list response. The tab shell already waits for profiles; keep rendering the existing profile-loading state until the active profile and its default context are known.
- **Proxy mode override.** If `isParentProxy` is true through a retained internal/test path, proxy chrome wins. The app shows the child learner preview with proxy banner and hides normal Study/Family switching. Switching back returns the adult to their server-backed last/default context.
- **Switch profile behavior.** Switching to a different real profile reads that profile's allowed/default context and never writes the previous profile's context.
- **Family Progress is child/family only.** Remove the parent's own profile from the Family Progress picker. Parent self-progress belongs to Study mode only.
- **Study Progress is self only.** In Study mode, Progress shows the active user's own learning only.
- **Child curriculum management lives under Family.** Removing top-level Library from Family mode must not remove the parent's ability to add/manage a child's subjects/books. Add an explicit child-card/details path from Children to child curriculum management.
- **Recaps is parent-native.** Recaps lists child learning summaries the adult is allowed to see. It is not a child-account preview.
- **"Add to my learning" is same-account study.** Tapping it switches the adult into Study mode as themselves and opens a seeded learning entry point based on the child recap context.
- **Add to my learning pre-checks adult quota.** The bridge should check the adult's learning quota/entitlement before opening the Study entry. If quota is exhausted, show the existing quota-exceeded/upgrade UI instead of dropping the user into a dead-end session start.
- **Family mode uses adult copy register.** Family UI chrome is for an adult viewing child data, so surrounding UI uses adult register. Existing recap `narrative` / `conversation_prompt` fields are already parent-facing and must not be transformed through child copy logic.
- **Notification taps are explicit context switches.** Parent/family notifications such as child session recap/progress pushes switch to Family mode and replace into Recaps detail/list. If a full-screen Study session is active, queue or prompt instead of silently interrupting the session.
- **Analytics required.** Track `mode_intent_chosen`, `mode_switched`, `learn_this_too_tapped`, `learn_this_too_quota_blocked`, and `learn_this_too_completed` using existing `track()` patterns with hashed/profile-safe properties only.
- **Family challenges are deferred.**

## Risk Hardening

### Main Risks

| Risk | Why it matters | Hard rule |
| ---- | -------------- | --------- |
| Cross-profile data leak | Parent/child/self data already share app shell, query cache, and profile headers. A stale profile ID or stale query can show the wrong learner's data. | Profile ID, app context, and proxy state must remain separate. Every query key that returns profile-scoped data must include the effective profile/child id or be reset on profile/context switches. |
| Mode treated as API scope | Adding a global `X-App-Context` header would create another module-level state path like proxy mode, increasing race/cleanup risk. | Do not send app context as a header in v1. Server authorization is still profile/family-link scoped; client mode chooses which parent-native or self endpoint to call. |
| Proxy flag leak | Existing proxy mode changes request behavior and tab visibility. If it survives normal parent flows, parents can accidentally see child surfaces instead of parent-native surfaces. | Normal end-user paths must not enter proxy. `isParentProxy` may only be true in retained internal/synthetic paths until audited. Sign-out must clear proxy state, as it already does. |
| Family/Study context leak | Family mode should never show parent self-progress; Study mode should never show child data. | All screen queries derive the effective data scope from app context. Family = child/family only. Study = self only. |
| Stale mode preference | Server-backed mode field could lag during mutation or profile switch. | Mode mutation is optimistic only with rollback. The tab shell does not render a new mode until the active profile/context pair is coherent. |
| Recaps IDOR | A parent-native recap feed is a new cross-profile surface. | Recaps API must enforce parent-child visibility through server-side family link and consent checks. Child filters are authorization inputs, not trust inputs. |
| Learn-this-too attribution bug | Parent learning started from a child recap must attach to the adult, not the child. | `StudySourceContext` is metadata only. Quota, sessions, subjects, reports, and progress write to the adult active profile. |
| Back-stack cross-context jump | Mode/profile/proxy transitions can leave stale screens behind. Pressing Back can jump from Study to Family or from one child to another. | Mode switches, profile switches, and proxy exits are navigation boundaries. They use explicit `router.replace` to canonical roots, not `router.push` and not bare `router.back`. |

### Leak Invariants

- API requests must continue to send exactly one effective profile id through the existing profile-scoping path.
- API requests must not add `X-App-Context` in v1.
- Family Recaps and Family Progress must never rely on switching `X-Profile-Id` into the child profile.
- Recaps list/detail endpoints must verify the requested `childProfileId` belongs to the active adult owner through `family_links.parent_profile_id`.
- Study mode must not pass child ids to generic learner queries except as inert `StudySourceContext` metadata.
- `StudySourceContext` must never be used by API services to scope writes to the child.
- TanStack Query keys for Recaps must include parent profile id and selected child filter.
- TanStack Query keys for Progress must include app context and effective profile/child filter.
- On mode switch, reset or invalidate queries that can contain context-specific data: progress, dashboard/family, recaps, subjects/books if child-scoped, sessions, reports.
- On profile switch, keep the existing profile-scoped reset behavior and add any new `recaps` / app-context query keys.
- No new SecureStore key is allowed for mode state. If implementation introduces any client-persisted context key despite this spec, it must be cleared in `signOutWithCleanup` before approval.

## Navigation Contract

### Canonical Roots

| Context | Canonical root | Visible first tab |
| ------- | -------------- | ----------------- |
| Study | `/(app)/home` with Study context | My Learning |
| Family | `/(app)/home` with Family context | Children |
| Recaps | `/(app)/recaps` with Family context | Recaps |
| Progress | `/(app)/progress` with current context | Progress |

### Transition Rules

- **Mode switch Family -> Study:** update `defaultAppContext`, then `router.replace('/(app)/home')`.
- **Mode switch Study -> Family:** update `defaultAppContext`, then `router.replace('/(app)/home')`.
- **Mode switch failure:** roll back mode state and do not navigate.
- **Profile switch:** after `switchProfile` succeeds and profile-scoped query reset completes, replace to the new profile's canonical root. Do not preserve the previous profile's route stack.
- **Proxy exit:** switch back to the adult profile, clear proxy state, and replace to that adult's canonical root.
- **Normal tab changes:** can use tab navigation normally.
- **Detail screens inside one context:** may use `goBackOrReplace(router, explicitFallback)` where fallback is the parent list for that context.
- **Cross-context jumps:** must not use `router.back()` as the primary return mechanism.
- **Deep links:** every deep-linkable detail route must have an explicit fallback route that is valid without history.

### Return Targets

Use typed return targets rather than relying on arbitrary stack history:

```ts
type AppReturnTarget =
  | 'study-home'
  | 'family-children'
  | 'family-recaps'
  | 'family-progress'
  | 'study-progress'
  | 'practice';
```

Rules:

- `homeHrefForReturnTo()` or its replacement must understand Family/Study return targets.
- Detail screens must name their fallback in code and tests.
- If a route can be opened from both Study and Family, it must accept explicit context/return target params.
- Do not invent free-form `returnTo` strings per screen; add typed constants.

### Learn This Too Navigation

`Add to my learning` is a cross-context action and must be deterministic:

1. Parent taps from Recaps or child session recap.
2. App pre-checks the adult's quota/entitlement.
3. App patches adult `defaultAppContext = 'study'`.
4. App uses `router.replace()` to a Study entry route with `StudySourceContext`.
5. Device Back follows Study-mode rules. It must not reveal the old Family route stack.
6. The Study entry route may show an explicit secondary action like "Back to recap"; that action switches to Family and `router.replace()`s to the recap detail/list using a typed return target.

### Navigation Tests Required

- Unit test: mode switch success calls `router.replace('/(app)/home')`, not `router.push`.
- Unit test: mode switch failure does not navigate and rolls back UI.
- Unit test: Family -> Recap detail back uses fallback `/(app)/recaps`.
- Unit test: Recap detail opened as a deep link still returns to `/(app)/recaps`.
- Unit test: Add to my learning uses replace into Study, not push.
- Unit test: notification tap while in Study prompts/queues if an active Study session is full-screen.
- Playwright: repeat Study/Family switches and device/browser Back never lands in stale child/proxy/detail routes.

## First-Run Intent

Intent is not an account type. It is a first-run preference used to route setup:

1. User signs up/signs in and reaches `/(app)/onboarding/intent` as the first authenticated onboarding/profile-setup step.
2. Choices are Study and Family. Copy can be polished later.
3. Choice stays in route/component state until profile creation/update succeeds.
4. If email verification or app reload loses route state, show the intent step again. Do not persist intent in SecureStore.
5. Once age/profile/family capability are known:
   - Study intent creates/opens Study.
   - Family intent for under-18 users opens Study with plain copy.
   - Family intent for adults without a child relationship opens Family setup.
   - Family intent for adults with family capability opens Family mode.

## Mode State Table

| User/account state | Default context | Visible tabs | Mode switch visible? | Notes |
| ------------------ | --------------- | ------------ | -------------------- | ----- |
| Under-18 learner | Study | My Learning, Library, Progress, More | No | Learner account can exist at any age; Family is adult-only. |
| Adult without family capability | Study | My Learning, Library, Progress, More | No | Family setup may be offered only through add/link child flows. |
| Adult chose Family but has no child yet | Family setup | Setup flow, not tabs | Study entry visible | Do not show empty Family tabs before a child relationship exists. |
| Adult with family capability, Family default | Family | Children, Recaps, Progress, More | Yes | Family Progress excludes parent self-progress. |
| Adult with family capability, Study default | Study | My Learning, Library, Progress, More | Yes | Study Progress is parent self-progress only. |
| Shared account child profile active | Study | My Learning, Library, Progress, More | No | Child/non-owner profile never inherits adult Family mode. |
| Parent proxy internal/test path | Proxy override | Proxy subset/chrome | No | Proxy wins while retained. Normal UX should not enter it. |

## Recaps Surface

### Route And UX

- Mobile route: `apps/mobile/src/app/(app)/recaps.tsx`.
- Add API route/service under `apps/api/src/routes/recaps.ts` and `apps/api/src/services/recaps.ts` unless implementation discovers a strong reason to reuse an existing route. Do not hide this under `dashboard.ts` by default.
- Use Family context only. Study-only users should not see the tab.
- Feed should support:
  - all children
  - one child filter
  - latest-first pagination
  - empty states
- Child selector can be a horizontal chip/toggle row:
  - All
  - one chip per visible child learner/profile
- Card should show:
  - child name
  - subject/topic
  - completion time
  - parent-facing narrative
  - translation-keyed engagement signal, if available
  - CTA: Add to my learning
  - secondary action: Open recap/session detail

### Data Contract

Add a parent-scoped API endpoint that returns a paginated recap feed. The contract must be parent-native and must not require switching active profile into the child.

The feed reuses existing parent recap storage from `apps/api/drizzle/0034_parent_session_recap.sql`: `session_summaries.narrative`, `session_summaries.conversation_prompt`, and `session_summaries.engagement_signal`. Do not add duplicate recap columns with synonymous names.

Suggested response item:

```ts
import type { EngagementSignal } from '@eduagent/schemas';

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
  narrative: string | null;
  highlight: string | null;
  conversationPrompt: string | null;
  engagementSignal: EngagementSignal | null;
};
```

Engagement signal rules:

- `engagementSignal` reuses the existing shared `engagementSignalSchema` / `ENGAGEMENT_SIGNALS` values from `packages/schemas/src/sessions.ts`; do not redefine values locally in mobile or API code.
- UI renders translation-keyed positive/neutral copy only.
- Raw wire values are not user-facing copy. For example, values such as `stuck` or `scattered` must be mapped to gentle labels like "needs more time" / "finding focus" or omitted.
- Never display labels such as "struggled", "weak", "declining", "below grade level", or "trouble".
- If a raw LLM/session source contains negative framing, map it to an allowed shared signal and positive/neutral UI copy, or omit the field.
- Add schema/API tests that invalid labels fail parsing.
- Add an acceptance test proving the Recaps feed selects `narrative`, `conversation_prompt`, and `engagement_signal` only; no new synonym columns such as `summary` or `engagement_label` are added.

Endpoint requirements:

- Enforce parent/child visibility through existing family-link/consent rules.
- Support `childProfileId` filter.
- Support cursor pagination.
- Return only recaps the parent is allowed to see; do not expose private chat turns.
- Work for both parent-managed child profiles and linked child learner accounts.

## Learn This Too Contract

The v1 bridge should be explicit and testable:

1. Parent taps `Add to my learning` on a Recaps card or child session recap.
2. App pre-checks adult quota/entitlement.
3. If quota is exhausted, app shows the existing quota-exceeded/upgrade UI and tracks `learn_this_too_quota_blocked`.
4. App switches the same adult profile into Study mode.
5. App opens the learner entry point with source context:

```ts
type StudySourceContext = {
  source: 'child-recap';
  childProfileId: string;
  childSessionId: string;
  subjectId?: string;
  topicId?: string;
};
```

Rules:

- The adult remains the active learner.
- Child IDs in `StudySourceContext` are read-only attribution/seed metadata.
- Starting a session, creating a subject, writing progress, reports, and quota checks use the adult profile.
- If no matching adult subject exists, show a lightweight entry/confirmation. Do not silently create a subject/book without user confirmation.

## Proxy Handling

This spec hides proxy from normal UX but does not require deleting all proxy implementation in the first PR.

Phase 1:

- Remove normal profile-row "View account" paths that enter proxy mode.
- Replace parent child review paths with Children, Recaps, Progress, and child settings/curriculum routes.
- Keep `isParentProxy` behavior covered by synthetic tests while code remains.
- If an internal/debug path survives, document it in code and tests.

Phase 2:

- Audit all proxy entry points before public release.
- Either delete proxy mode or gate it behind an explicit internal-only/debug-only path.
- Do not leave an indefinite public-but-hidden route without an owner/issue.

## Route Survival: `own-learning.tsx`

The top-level Own Learning tab is removed from Family mode, but the route may survive temporarily as a compatibility/deep-link bridge.

Preferred v1 behavior:

- keep the route as a compatibility/deep-link bridge;
- when opened by an eligible adult, switch to Study mode and route to the Study home/LearnerScreen;
- when opened by Study-only users, route to Study home;
- do not expose it in Family tab navigation.

If implementation proves it is dead, deletion is allowed only after grepping route references and updating tests/deep-link expectations.

## Implementation Plan

1. **Terminology and shape rename**
   - Use Study/Family in docs, code, and tests for app contexts.
   - Avoid `mentorMode` naming because "mentor" already means AI mentor language/tutor behavior.
   - Rename tab shape values from identity-oriented `guardian | learner` to context-oriented `family | study`, or add a new two-value `AppTabContextShape`.

2. **Schema and migration**
   - Add `profiles.default_app_context` nullable text column with a check constraint for `'study' | 'family'`.
   - Keep the field nullable; `NULL` means infer the default from capability and intent, with no data backfill required.
   - Add rollback markdown documenting that rollback loses only default app context preference.
   - Update `packages/database/src/schema/profiles.ts`.
   - Update `packages/schemas/src/profiles.ts` with `appContextSchema`, `defaultAppContext`, and `hasFamilyLinks`.
   - Update profile response/list schemas and mapper.

3. **Profile mode mutation**
   - Add `defaultAppContext` to existing `PATCH /profiles/:id` or a dedicated app-context patch route.
   - Enforce family capability server-side before accepting `'family'`.
   - Make mutation idempotent.
   - Require the route/body `profileId` to match the active request profile scope.
   - Add optimistic rollback behavior on mobile.
   - Add stale-response protection for mode-switch/profile-switch interleavings.

4. **Family capability helper**
   - Add a shared mobile helper such as `isFamilyCapableProfile(activeProfile)`.
   - It must require owner, adult, and `activeProfile.hasFamilyLinks === true`.
   - Do not reuse old `isGuardianProfile()` without the adult check.
   - Add tests for under-18 owner with a sibling/non-owner profile.

5. **Tab shell update**
   - Resolve tabs from active app context.
   - Study visible tabs: `home`, `library`, `progress`, `more`.
   - Family visible tabs: `home`, `recaps`, `progress`, `more`.
   - Family home tab label: Children.
   - Add Recaps tab icon/label/testID.
   - Remove top-level own-learning/library tabs from Family mode.
   - Update or delete `resolveHomeTabPresentation()` so presentation is mode-driven.
   - Ensure route hiding still prevents phantom tabs.

6. **First-run intent**
   - Add intent at `apps/mobile/src/app/(app)/onboarding/intent.tsx` as the first authenticated onboarding/profile-setup step.
   - Keep pre-profile choice ephemeral.
   - If email verification or app reload loses route state, show this onboarding step again rather than persisting intent in SecureStore.
   - After profile creation/setup, validate age/capability and set the allowed default mode server-side.
   - If a disallowed user chose Family, route to Study with plain copy.

7. **Mode switch entry points**
   - Add a clear switch from Family to Study for eligible adults.
   - Add a clear switch from Study to Family for adults with family capability.
   - Do not show mode switch for Study-only users or while proxy-viewing a child.
   - Track `mode_switched` only after the switch succeeds; include previous/next context and hashed profile id.

8. **Children tab and child curriculum**
   - Ensure Family mode provides child setup and child curriculum actions from child cards/details.
   - Parent can add/manage a child's subjects/books without proxy mode.
   - Add empty/failure states for childless Family setup and child curriculum access.

9. **Parent-native Recaps**
   - Add `recaps.tsx`.
   - Add `apps/api/src/routes/recaps.ts` and `apps/api/src/services/recaps.ts`.
   - Add a shared Recaps response schema under `packages/schemas/src/recaps.ts`, reusing `engagementSignalSchema` from `packages/schemas/src/sessions.ts`.
   - Add hook(s) for parent recap feed.
   - Add child chips/filter and empty states.
   - Reuse existing parent session recap detail where appropriate.
   - Select existing `narrative`, `conversation_prompt`, and `engagement_signal` storage fields; do not create new synonym columns.
   - Constrain engagement signal parsing through the shared schema and translation-keyed copy.

10. **Hide proxy from normal parent UX**
   - Remove normal profile-row "View account" paths that enter proxy mode.
   - Replace parent child review paths with Children, Recaps, Progress, and child settings/curriculum routes.
   - Keep synthetic proxy coverage while code remains.

11. **Progress context filtering**
   - Family mode: child/family profiles only, no parent self picker.
   - Study mode: self only.
   - Add explicit headers/copy: Family Progress vs My Progress, or equivalent.

12. **Add to my learning**
   - Add CTA to Recaps cards.
   - Implement same-account Study mode switch with `StudySourceContext`.
   - Pre-check adult quota/entitlement before switching into the Study entry route.
   - Track `learn_this_too_tapped`, `learn_this_too_quota_blocked`, and `learn_this_too_completed`.
   - Add safe fallback when the adult has not created any own learning subjects yet.

13. **Notification routing**
   - Update `use-notification-response-handler.ts` so parent/family push taps use explicit context transitions.
   - Parent/family notifications switch to Family mode and replace into Recaps or the appropriate Family-safe root.
   - If a full-screen Study session is active, prompt/queue instead of silently interrupting.
   - Add tests for notification taps while the app is in the opposite mode.

14. **Analytics**
   - Track `mode_intent_chosen`, `mode_switched`, `learn_this_too_tapped`, `learn_this_too_quota_blocked`, and `learn_this_too_completed`.
   - Use existing `track()` and `hashProfileId()` patterns; do not send raw child names, free-text topics, or raw profile ids.

15. **Leak hardening**
   - Add or update query keys for context-scoped screens so profile/context/child filter are explicit.
   - Reset/invalidate new `recaps` and context-scoped progress queries on profile switch and mode switch.
   - Add Recaps API break tests for child IDs outside the active parent's family.
   - Add StudySourceContext tests proving adult writes remain adult-scoped.
   - Add regression coverage that Study mode does not render child data and Family mode does not render parent self-progress.

16. **Navigation hardening**
   - Add typed return target constants for Study/Family roots.
   - Update `homeHrefForReturnTo()` or replace it with a context-aware helper.
   - Ensure mode switch/profile switch/proxy exit use `router.replace()` to canonical roots.
   - Ensure detail screens use `goBackOrReplace()` only with explicit same-context fallbacks.
   - Add tests for deep-link detail fallback and cross-context Learn-this-too behavior.

17. **Tests**
   - Add tab-shape/visibility unit tests.
   - Add family capability tests.
   - Add profile app-context API tests.
   - Add Progress filtering tests.
   - Add child curriculum access tests from Family mode.
   - Add Recaps feed render/empty-state tests.
   - Add API scoping tests for parent recap feed.
   - Add leak invariant tests.
   - Add navigation contract tests.
   - Add Playwright web journeys for the updated Study/Family paths.

## Acceptance Criteria

1. Given the active profile has no family-link capability, when the tab shell renders, then only Study tabs are visible: My Learning, Library, Progress, More.
2. Given the app resolves an adult with family capability in Family mode, when the tab shell renders, then only Family tabs are visible: Children, Recaps, Progress, More.
3. Given an adult owner is under 18 and has another non-owner profile on the account, when capability is computed, then Family mode is not available.
4. Given a family-capable adult switches mode, when the server patch succeeds, then `profiles.default_app_context` updates only for the active profile.
5. Given a mode patch fails with 4xx/5xx, when optimistic UI was applied, then the UI rolls back to the previous context and shows a retryable error.
6. Given a mode patch resolves after the user switched profiles, when the late response returns, then the client ignores it for the new active profile and refetches profile state.
7. Given a shared account switches from an adult owner to a child profile, when the child profile loads, then the adult owner's default app context is not overwritten.
8. Given `computeVisibleTabs('family')` is called, then it returns exactly `home`, `recaps`, `progress`, and `more`.
9. Given `computeVisibleTabs('study')` is called, then it returns exactly `home`, `library`, `progress`, and `more`.
10. Given Family mode is active, when the user opens Progress, then the parent's own profile is not selectable and child/family progress is the only progress context.
11. Given Study mode is active for an adult parent, when the user opens Progress, then only the adult's own progress is shown.
12. Given Family mode is active, when the parent wants to add a book/subject for a child, then a child-card/detail path exists without entering proxy mode.
13. Given a parent opens Recaps, when multiple children have completed sessions, then the feed shows a latest-first list and child filter chips.
14. Given Recaps feed data is selected, then it reuses `session_summaries.narrative`, `conversation_prompt`, and `engagement_signal`; no new synonym columns are added.
15. Given a parent opens Recaps for a child with no sessions, then the empty state names the child and explains what will make recaps appear.
16. Given a recap item includes engagement data, when the response is parsed, then only the shared `engagementSignalSchema` values are accepted and UI copy is translation-keyed.
17. Given a parent taps Add to my learning, when Study mode opens, then the adult remains the active learner and the child session context is passed as `StudySourceContext`.
18. Given a parent taps Add to my learning while adult study quota is exhausted, then the existing quota-exhausted/upgrade UI appears before entering Study.
19. Given a parent taps Add to my learning without an existing matching subject, then the app offers a lightweight study entry instead of silently creating a subject/book.
20. Given a parent has access to a child profile without a linked child account, when Recaps and Progress load, then both surfaces still work.
21. Given a parent has a linked child learner account, when Recaps and Progress load, then both surfaces respect family-link/consent visibility and do not require proxy mode.
22. Given the normal profile picker is used by an end user, when a child profile is selected/reviewed, then the app does not route through proxy mode.
23. Given `isParentProxy` is synthesized by a legacy/internal unit test while the code remains, when the tab shell renders, then proxy chrome wins and Study/Family mode switching is hidden.
24. Given any new nested Recaps or child curriculum layout contains both `index` and dynamic children, then it exports `unstable_settings = { initialRouteName: 'index' }`.
25. Given Family mode is active, when any Study-only route/query attempts to load child data, then the request is rejected or the UI redirects to a Family-safe surface.
26. Given Study mode is active, when any Family-only route/query attempts to render child recaps/progress, then the UI does not show child data and routes to Study home or shows a no-access fallback.
27. Given a Recaps API request includes a child id outside the active parent's family, when the endpoint is called, then it returns the existing protected/not-found error shape and no recap data.
28. Given Add to my learning starts an adult study flow from a child recap, when a session or subject is created, then the owner/profile on the write is the adult profile, not the child profile.
29. Given a parent/family push notification is tapped while the user is in Study mode, then the app prompts/queues if an active session is running, otherwise switches to Family and replaces into Recaps or a Family-safe root.
30. Given a mode switch succeeds, when navigation completes, then the route is replaced to the new context canonical root and the previous context detail screen is not in the back stack.
31. Given a mode switch fails, when navigation is evaluated, then no route change happens and the previous context stays visible.
32. Given Recap detail is opened from Recaps or by deep link, when Back is pressed, then the app lands on Recaps, not Children, Study, proxy, or a stale child detail screen.
33. Given Add to my learning opens Study from Recaps, when device/browser Back is pressed, then the app follows Study-mode fallback behavior and never jumps to a stale Family detail route.
34. Given email verification or app reload loses the first-run route state, when onboarding resumes, then `/(app)/onboarding/intent` is shown again without reading any SecureStore intent value.
35. Given mode intent, mode switch, or Learn-this-too events happen, then analytics emit the named events with hashed/profile-safe properties only.

## Failure Modes

| State | Trigger | User sees | Recovery |
| ---- | ------- | --------- | -------- |
| Under-18 user chooses Family during first-run intent | Age/profile validation happens after profile setup | Plain message that family tools are for adults, then Study mode opens | User can study; guardian setup can happen through adult flow later |
| Under-18 owner profile has a sibling/non-owner profile | Old `isGuardianProfile()` would return true | Study mode only; no Family switch | Helper requires adult owner, so false positive is blocked |
| Email verification or app reload loses first-run intent | User leaves the app during sign-up verification | Intent step appears again after authentication; no stale value is read | Host intent at `/(app)/onboarding/intent` and keep the choice ephemeral |
| Adult chooses Study, then later adds a child profile | Add-child/profile link succeeds | Study remains active, with a clear prompt that Family mode is now available | User can switch to Family immediately or keep studying |
| Adult chooses Family but has no child yet | First family setup not complete | Family setup empty state with Add child / Link child action, not Family tabs | Complete child setup or switch to Study |
| Adult has children but none are consented/visible | Consent pending/withdrawn for every child | Family surfaces show protected/empty state explaining that child learning appears after consent/access is resolved | Resolve consent or add a visible child learner |
| Parent wants to add a book to a child's curriculum | Top-level Library is absent in Family mode | Child card/details includes Subjects/Books action | Open child curriculum path and add/manage content without proxy |
| Parent is proxy-viewing a child through retained internal/test path | `isParentProxy` is true | Proxy banner and child learner preview; no Study/Family switch | Switch back exits proxy and restores adult's last/default context |
| Normal profile picker previously entered proxy | Parent selects/reviews child profile | Parent-native child detail/Recaps/Progress routes, not proxy | Use Recaps/Progress/Children surfaces; no "view as child" modal |
| Only active profile is a child on a shared parent account | Child profile is active | Study tabs only; Family/Recaps hidden | Switch back to adult profile through allowed profile switch path |
| Parent taps Add to my learning before starting own learning | Recap has subject/topic context, adult has no matching subject | Lightweight "learn the basics" entry with confirmation, not silent subject creation | Confirm to start studying as adult or cancel back to Recaps |
| Recaps endpoint returns no rows | No completed child sessions or no visible child data | Named empty state for all children or selected child | Child studies, consent is resolved, or parent changes filter |
| Recaps endpoint fails | Network/server error | Reusable error fallback with retry and secondary back/home action | Retry fetch; Family tab remains available |
| Mode state update fails | Server update for default app context returns 4xx/5xx | Optimistic tab switch rolls back; retryable toast/banner appears | Retry mode switch; current context remains unchanged |
| Mode switch races with profile switch | Mode mutation is in flight while the user switches profile | New active profile keeps its own context; old response is ignored if it arrives late | Scope mutation by explicit profile id, guard concurrent switches, and refetch profiles after stale response |
| Profile list loads slowly | Server-backed `defaultAppContext` is not yet available | Existing profile-loading state; no tab-bar flicker | Wait for profile query containing mode field |
| Stale query cache after mode switch | Family data remains cached when switching to Study, or self-progress remains cached when switching to Family | Active-context screens either show loading or refetch; stale data is not rendered | Context-scoped query keys and switch invalidation force fresh data |
| Recaps child filter is tampered | URL/query param uses a child id from another family | Protected/not-found fallback, no data | Server-side family-link check rejects the request |
| Add to my learning carries child source context into a write path | Study flow mistakenly scopes subject/session creation to child id | Write is blocked by tests/server ownership guard; UI remains adult-scoped | Fix mapping so source context is read-only metadata |
| Adult quota exhausted on Add to my learning | Adult taps bridge from Recaps but has no available study quota | Existing quota-exhausted/upgrade UI before entering Study | Pre-check entitlement/quota at bridge tap; track `add_to_my_learning_quota_blocked` |
| Push tap while in opposite mode | Parent/family notification is tapped while adult is in Study mode | If no active full-screen session, Family Recaps/root opens; if a session is active, prompt/queue appears | Notification handler performs an explicit context transition with replace, never silent stack push |
| Mode switch leaves stale detail screen in back stack | User switches Family -> Study from a child detail route and presses Back | User remains in Study fallback/root, not old child detail | Mode switch uses replace to canonical root and clears context-specific stack |
| Recap detail opened by deep link has no history | User presses Back | Recaps list opens as fallback | `goBackOrReplace(router, '/(app)/recaps')` with explicit fallback |
| Browser/device back after Add to my learning | Parent enters Study from child recap, then presses Back | Study fallback/root, not proxy or child detail | Cross-context bridge uses replace; "Back to recap" is an explicit action if needed |
| User signs out on shared device | Sign-out cleanup runs | No client-persisted mode state remains | Next sign-in loads mode from server profile data |

## Additional Context

### Review Response

| Finding | Resolution in this spec |
| ------- | ----------------------- |
| Round 1 CRITICAL-1: third tab shape risk | Resolved by keeping exactly two tab context shapes. This version renames semantics to `study | family` instead of adding a third value. |
| Round 1 CRITICAL-2: pre-registration intent storage undefined | Resolved by making pre-profile intent ephemeral only and hosting it after sign-up in onboarding/profile setup. |
| Round 1 CRITICAL-3: mode persistence unspecified | Resolved by requiring per-profile server-backed `default_app_context`, mode mutation contract, proxy behavior, and switchProfile behavior. |
| Round 1 HIGH-1: Recaps tab lacks route/data contract | Resolved by adding Recaps route, API/service, response item, enum constraints, parent scoping, child filter, and pagination requirements. |
| Round 1 HIGH-2: missing Failure Modes table | Resolved by adding the Failure Modes table. |
| Round 1 HIGH-3: Progress behavior silently changes | Resolved by explicitly deciding Family Progress is child/family only and Study Progress is self only. |
| Round 1 HIGH-4: "Mentor" term collides with AI mentor language | Resolved by using Family mode and adding glossary distinction for AI mentor. |
| Round 2 CRITICAL-1: family capability undefined | Resolved by defining the exact family capability predicate in Glossary and requiring helper/server tests. |
| Round 2 CRITICAL-2: mode field lacks migration/API/deploy sequence | Resolved by adding Data Model And API, migration/rollback, schema, route, service, and deployment order. |
| Round 2 CRITICAL-3: per-profile vs per-account ambiguity | Resolved by binding mode to `profiles.default_app_context` and adding shared-account/switchProfile rows. |
| Round 2 HIGH-1: guardian shape semantic collision | Resolved by switching to context-shaped `study | family` naming or equivalent two-value type. |
| Round 2 HIGH-2: Library disappears from Family mode | Resolved by adding Children tab child curriculum responsibilities, task, AC, and failure mode. |
| Round 2 HIGH-3: proxy removal vs AC contradiction | Resolved by making normal UX proxy-free, while only synthetic/internal proxy coverage remains until audit/removal. |
| Round 2 HIGH-4: engagementLabel negative framing risk | Resolved by replacing free-text `engagementLabel` with constrained enum `engagementSignal` and positive/neutral translation-keyed copy. |
| Round 3 CRITICAL-1: Recap field names collide with existing migration | Resolved by binding the Recaps feed to existing `narrative`, `conversation_prompt`, and `engagement_signal` storage and banning duplicate synonym columns. |
| Round 3 CRITICAL-2: app context header/api-client scope undefined | Resolved by explicitly choosing no `X-App-Context` / `setActiveAppContext()` in v1; app context is presentation/default preference while authorization remains profile and family-link scoped. |
| Round 3 CRITICAL-3: family capability source of truth | Resolved by binding capability to server-side `family_links` and exposing `hasFamilyLinks` on profile responses. |
| Round 3 HIGH-1: push notification deeplinks ignore mode | Resolved by defining parent/family push taps as explicit Family context transitions, with prompt/queue behavior during active Study sessions. |
| Round 3 HIGH-2: optimistic mode/profile switch race | Resolved by requiring profile-id-scoped mutation, active-scope matching, stale response ignore/refetch, and single-flight guarding. |
| Round 3 HIGH-3: Learn-this-too quota dead end | Resolved by requiring a quota/entitlement pre-check and reuse of the existing quota-exhausted/upgrade UI before Study entry. |
| Round 3 MEDIUM-1: tests only assert TabShape type | Resolved by requiring exact visible-tab set tests for `computeVisibleTabs('family')` and `computeVisibleTabs('study')`. |
| Round 3 MEDIUM-2: first-run intent re-prompt undefined | Resolved by naming `/(app)/onboarding/intent` as the first authenticated onboarding step and acceptable re-prompt host after reload/email verification. |
| Round 3 MEDIUM-3: analytics missing | Resolved by declaring required mode and Learn-this-too analytics events with hashed/profile-safe properties. |
| Round 3 MEDIUM-4: migration backfill/rollback | Resolved by specifying nullable `default_app_context`, `NULL` inference, no required backfill, deploy order, and rollback markdown. |
| Round 3 MEDIUM-5: copy register ambiguity | Resolved by requiring adult copy register for Family UI and no child-register transform of parent-facing recap fields. |
| Round 3 MEDIUM-6: mode persistence justification | Resolved by documenting why persisted per-profile default context is needed beyond `useActiveProfileRole()`. |
| Navigation/data leak hardening | Resolved by adding Risk Hardening, Navigation Contract, leak invariants, transition rules, fallback rules, and required tests. |

### Dependencies

- Existing profile/family link model.
- Existing parent home and learner home surfaces.
- Existing progress and child session recap data.
- Existing profile switching/proxy logic.
- Child learner/profile model already supports parent-managed child profiles and linked child learner accounts.

### Testing Strategy

- Mobile unit tests:
  - tab shape resolver has exactly two context values: Study and Family.
  - `computeVisibleTabs('study')` returns exactly `home`, `library`, `progress`, and `more`.
  - `computeVisibleTabs('family')` returns exactly `home`, `recaps`, `progress`, and `more`.
  - family capability helper requires owner + adult + `hasFamilyLinks === true`.
  - under-18 owner with non-owner profile is not family-capable.
  - mode switch hidden for Study-only and proxy contexts.
  - mode switch mutation ignores stale responses after active profile changes.
  - Family Progress excludes the adult self profile.
  - Study Progress excludes child profiles.
  - Children tab exposes child curriculum entry point.
  - Recaps renders all-child feed, child-filtered feed, and empty state.
  - Add to my learning passes `StudySourceContext`.
  - Add to my learning shows existing quota-exhausted/upgrade UI before Study entry when adult quota is exhausted.
  - parent/family push taps switch/prompt according to active Study/Family state.
  - `mode_intent_chosen`, `mode_switched`, `learn_this_too_tapped`, `learn_this_too_quota_blocked`, and `learn_this_too_completed` fire with safe properties.
  - mode switch uses replace to canonical root and rolls back on failure.
  - profile switch replaces to the new profile root and does not preserve stale detail routes.
  - deep-linked Recap detail backs to Recaps.
  - Add to my learning does not leave Family/proxy detail routes in the back stack.
  - context-scoped query keys include profile/context/child filter as appropriate.
- API tests:
  - `defaultAppContext` parses and serializes on profile list/get responses.
  - profile list/get exposes `hasFamilyLinks` from server-side `family_links` lookup.
  - profile app-context patch accepts valid self Study/Family transitions.
  - profile app-context patch rejects Family for non-family-capable profiles.
  - profile app-context patch rejects mismatched route/body profile id vs active request profile scope.
  - parent recap feed returns only children the parent can see.
  - child filter cannot access another family's child.
  - parent recap feed selects existing `narrative`, `conversation_prompt`, and `engagement_signal` fields; no new `summary` / `engagement_label` storage is introduced.
  - parent-managed child profile and linked child account both produce visible recap rows when allowed.
  - consent/visibility rejection returns the existing protected-data error shape.
  - invalid `engagementSignal` values fail shared schema parsing.
  - Learn-this-too source context never changes the write owner from adult to child.
- Web/Playwright:
  - Study-only account lands in Study tabs.
  - Adult with Family setup intent but no child sees setup, not Family tabs.
  - Adult with family capability lands in default mode and can switch modes.
  - Family Recaps opens and filters by child.
  - Children tab can reach child curriculum management.
  - Normal profile picker no longer opens proxy mode.
  - Add to my learning switches into Study as the adult.
  - Recaps detail Back returns to Recaps.
  - Add to my learning followed by browser/device Back does not jump to stale Family/proxy/child routes.
  - repeated Study/Family switches keep Back behavior inside the active context.

### Notes

- Final labels can be polished later. The technical model should use Study/Family to avoid the existing AI mentor terminology.
- Keep the user-facing model simple: everyone can study; adults with family capability can support child learners.
- The active context must always be obvious enough that Library and Progress do not require the user to infer whose learning they are seeing.
