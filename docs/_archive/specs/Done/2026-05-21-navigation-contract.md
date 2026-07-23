# Navigation Contract - Reconciled V1

**Status:** All 6 PRs delivered (verified 2026-05-26 against `main`). Pending amendment from [`docs/specs/2026-05-25-tier-access-rework.md`](./2026-05-25-tier-access-rework.md) — that rework moves tier gating out of the contract and re-opens Family Hub on every tier, which invalidates the `familyPlanOwner` check at `apps/mobile/src/lib/navigation-contract.ts:250` and the intent-screen decision in this spec.
**Date:** 2026-05-21
**Reconciled:** 2026-05-22
**Last verified against code:** 2026-05-26
**Product source:** `docs/specs/2026-05-19-study-and-family-mode-navigation-FULL.md`
**Implementation baseline:** existing Mode Nav V0 in mobile code

This document reconciles the narrower navigation-contract draft with the FULL Study/Family navigation spec and with the code inspection performed on 2026-05-22.

> **What in this document is still live policy vs historical.**
>
> - **Live policy (authoritative):** the "Hard Constraint — Preserve 5-Tab Mode" section, the target `study`/`family` tab shape, the `ProfileContext` / `NavigationContract` shape, the boundary allowlist categories enforced by `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts`. CLAUDE.md → "Profile Shapes" cites this spec as the source of truth for the target state; the guard test pins its canonical boundary set against this spec.
> - **Historical (delivered):** the "Scope Split" section (PR 1 → PR 6) describes how the work was sequenced. All six PRs landed; PR 5 and PR 6 were absorbed into the Phase 6 completion plan and adjacent work. See the per-PR notes in "Scope Split" for the absorption mapping and commit references.
> - **Queued amendment:** tier-access rework (link in Status above) will edit the gates/intent-screen sections once it lands. Do not archive this spec until that amendment is folded in **and** `MODE_NAV_V0_ENABLED` retires (the hard-constraint section dies with V0).

## Related documents

- [`docs/compliance/audience-matrix.md`](../../../compliance/audience-matrix.md) — **reconstructed historical provenance.** Its ~119 scattered gating reads and F1–F14 findings explain the original problem; verify current state against `AGENTS.md` and `apps/mobile/src/lib/navigation-contract.ts`.
- [`docs/flows/flow-master-directory.md`](../../../flows/flow-master-directory.md) — flow register that cites this spec from per-flow detail pages.
- `CLAUDE.md` — "Profile Shapes" section is authoritative for **current (V0)** tab shapes (`guardian` / `learner`). This spec describes the **target (FULL)** shapes (`study` / `family`); the V0 → FULL mapping is in the "Decision" section below. Until `resolveNavigationContract` ships, CLAUDE.md's two-shape rule (`guardian` / `learner` — no third shape) governs production code.

> **V0 vs target — important signpost.** This document targets `study` / `family` tab shapes. CLAUDE.md describes today's `guardian` / `learner` shapes. Both are "two shapes" but in **different universes**: V0 is what production renders today; FULL is what the contract migrates to. The MEMORY.md rule "NEVER add a third shape" applies to V0 — it does not forbid the V0 → FULL transition described here.

The original contract idea is still correct: one contract should own per-profile UI/navigation behavior. The previous target shape was not correct for the FULL product direction because it preserved the current V0 no-Recaps tab set and treated mode persistence as a non-decision. This reconciled version makes the contract the implementation bridge from V0 to FULL.

---

## Decision

Implement the FULL Study/Family navigation in increments, but do not ship more scattered per-screen gating.

The next implementation should introduce `resolveNavigationContract(ctx)` as the single UI/navigation contract, and it must target the FULL product shape:

- **Study mode:** `home`, `library`, `progress`, `more`.
- **Family mode:** `home`, `recaps`, `progress`, `more`.
- The old guardian/hybrid tab set (`home`, `own-learning`, `library`, `progress`, `more`) is a V0/legacy starting point, not the final contract.
- Recaps is implemented (PR 4). V1 can wire the tab directly to `/(app)/recaps`.
- Mode persistence is not optional for FULL. V1 uses server-backed per-profile `profiles.default_app_context`.
- Parent review should be parent-native. Normal end-user paths should not require parent proxy mode.

**Do not implement the old 2026-05-21 contract unchanged.** It would hard-code V0 behavior and conflict with the FULL spec.

---

## Hard Constraint — Preserve 5-Tab Mode Across All Increments

**Non-negotiable.** Every PR in this migration must preserve today's 5-tab production mode (active when `EXPO_PUBLIC_ENABLE_MODE_NAV=false` in Doppler → `FEATURE_FLAGS.MODE_NAV_V0_ENABLED=false`). The 5-tab view is supported product behavior, not a temporary fallback — breaking it is a release blocker.

**Flag matrix that must always hold:**

| `MODE_NAV_V0_ENABLED` | `MODE_NAV_V1_ENABLED` | Behavior |
|---|---|---|
| off | off | **5-tab mode (today's prod) — never regress** |
| on | off | 4-tab mode-switched view (V0 opt-in) |
| any | on | New `resolveNavigationContract` with `study`/`family` shape |

**Rules:**

1. The V0-off short-circuits at `apps/mobile/src/lib/app-context.tsx` — `familyCapable=false` at line 60 and `derivedMode=null` at line 70 (force-off when both `MODE_NAV_V1_ENABLED` and `MODE_NAV_V0_ENABLED` are false) — **must stay alive**.
2. The V0 fall-through at `apps/mobile/src/app/(app)/_layout.tsx:263` (`return computeVisibleTabs(tabShape, false)`) **must keep returning 5 tabs** for guardian profiles.
3. V0 helpers `resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation` (`_layout.tsx:122-185`) **must not be deleted** when V1 lands. They remain the source of truth for `MODE_NAV_V0_ENABLED=off`.
4. `resolveNavigationContract` wiring is gated entirely behind `MODE_NAV_V1_ENABLED` (new flag) and **does not replace** the V0-off fallback path.
5. Every PR must include a test asserting that with `MODE_NAV_V0_ENABLED=false` and `MODE_NAV_V1_ENABLED=false`, a guardian profile sees all 5 tabs.

This constraint supersedes any spec line that implies V0 deletion. If a future amendment proposes removing V0 helpers, the precondition is: both Doppler flags retired in production and that retirement explicitly approved.

---

## Why This Exists

Today, the answer to "what does this profile see?" is reconstructed in many places:

- The tab shell derives visible tabs from legacy guardian/learner shape, local mode state, and parent proxy precedence.
- Home re-derives whether to show learner home or parent home.
- More/account/privacy screens branch on `activeProfile.isOwner`, role, and subscription.
- Progress handles Family-vs-Study filtering inside the screen and hooks.
- Deep routes such as session, homework, dictation, quiz, practice, mentor memory, progress subroutes, and child routes each guard themselves independently.
- Parent proxy remains a broad runtime state even though FULL requires parent-native Recaps/Progress review.

This causes drift. Each screen can end up with a slightly different interpretation of Study, Family, owner, child, proxy, and subscription state.

**Goal:** define one pure function, `resolveNavigationContract(ctx)`, that owns every per-profile UI/navigation decision. Screens consume the returned contract instead of recomputing profile role, tab shape, route access, or content gates.

**Security scope:** this contract is mobile UI/navigation only. It does not replace API authorization. Server-side access remains enforced by profile scope, family-link ownership checks, `createScopedRepository(profileId)`, and parent-chain filters.

---

## Current Implementation Baseline

The codebase already has a V0 implementation:

- `AppMode = 'study' | 'family'` exists in mobile state.
- Mode switching is local React state only.
- Family capability is inferred client-side from the loaded profile list.
- Family mode currently renders `home`, `progress`, `more`.
- Study mode currently renders `home`, `library`, `progress`, `more`.
- Recaps now exists as a first-class route/API/schema (PR 4 complete: `recaps.tsx`, `routes/recaps.ts`, `services/recaps.ts`, `packages/schemas/src/recaps.ts`).
- Parent-facing child session detail exists under child routes, backed by dashboard child session APIs.
- Parent proxy is still active and can be entered through normal profile switching paths.
- Mode switcher UI is mounted on Home, not app chrome.

That is the starting point. It is not the final contract.

---

## Product Target

The FULL spec defines two clear app contexts, not identity-driven tab shells.

| Context | Meaning | Visible tabs |
| --- | --- | --- |
| Study | The active user's own learning context | `home`, `library`, `progress`, `more` |
| Family | Adult family-support context for child learners | `home`, `recaps`, `progress`, `more` |

`own-learning` is a transition/legacy route, not a permanent top-level tab in the FULL target. Once Study mode is the adult's own learning shell, the separate top-level `own-learning` tab should disappear.

`recaps` is a required Family tab. It is parent-native and lists child learning summaries the adult is allowed to see. It is not a child-account preview.

---

## Inputs - `ProfileContext`

`resolveNavigationContract(ctx)` is pure. No I/O, no async, no React hooks inside.

```ts
type ProfileContext = {
  activeProfile: Profile | null;
  profiles: ReadonlyArray<Profile>;
  isParentProxy: boolean;
  appContext: 'study' | 'family' | null;
  role: 'owner' | 'impersonated-child' | 'child' | null;
  subscription: {
    status: 'loading' | 'ready';
    tier: 'free' | 'plus' | 'family' | 'pro' | null;
  };
  flags: {
    MODE_NAV_V1_ENABLED: boolean;
  };
};
```

`Profile` must come from `@eduagent/schemas`. V1 adds:

```ts
type AppContext = 'study' | 'family';

type Profile = {
  // existing fields...
  defaultAppContext: AppContext | null;
  hasFamilyLinks: boolean;
};
```

### Capability

Family capability is server-sourced:

- active profile is an owner profile;
- active profile is adult;
- profile response has `hasFamilyLinks === true`;
- server computes `hasFamilyLinks` from non-archived `family_links` rows where the owner is the parent profile.

The client helper may mirror this predicate, but it must not infer capability from `profiles.some(p => !p.isOwner)` in V1.

### Loading Semantics

During loading, degrade to the least surprising Study-safe output:

- `activeProfile == null` -> Study shell, no Family surfaces.
- `subscription.status === 'loading'` -> do not expose subscription-tier-only family setup affordances.
- `appContext == null` -> infer `family` only for a family-capable profile whose `defaultAppContext === 'family'`; otherwise use `study`.

---

## Outputs - `NavigationContract`

```ts
type TabKey = 'home' | 'library' | 'recaps' | 'progress' | 'more';

type NavigationContract = {
  shape: 'study' | 'family';
  effectiveAppContext: 'study' | 'family';
  isFamilyCapable: boolean;
  isParentProxy: boolean;

  visibleTabs: ReadonlySet<TabKey>;

  home: {
    screen: 'LearnerHome' | 'FamilyHome';
    titleKey: 'tabs.myLearning' | 'tabs.children';
    iconName: 'School' | 'Users';
  };

  chrome: {
    modeSwitcher: 'global-header' | 'hidden';
    proxyBanner: 'required' | 'hidden';
  };

  // NOTE: these are content-gates consumed *inside* More sub-screens
  // (`more/account.tsx` for showBilling / showAccountSecurity,
  //  `more/privacy.tsx` for showExportDelete). They are NOT top-level
  //  More rows — CLAUDE.md "Profile Shapes" documents the placement.
  gates: {
    showBilling: boolean;
    showAccountSecurity: boolean;
    showExportDelete: boolean;
    showAddChild: boolean;
    showRemoveFamilyMember: boolean;
    showMentorMemoryChildConsent: boolean;
    showCelebrationsChildEditor: boolean;
    showAccommodationChildEditor: boolean;

    showFamilyChildActivity: boolean;
    showInlineStudyInvite: boolean;
    showProgressProfilePicker: boolean;
    progressScope: 'self' | 'children';
    sessionIsOwner: boolean;
  };

  canEnter: (route: RouteKey, params?: RouteParams) => boolean;
  isSurfaced: (route: RouteKey, params?: RouteParams) => boolean;

  queryScope: {
    appContext: 'study' | 'family';
    profileId: string | null;
  };

  diagnostic: {
    shape: 'study' | 'family';
    effectiveAppContext: 'study' | 'family';
    isFamilyCapable: boolean;
    isParentProxy: boolean;
    role: ProfileContext['role'];
    activeProfileId: string | null;
    linkedChildIds: ReadonlyArray<string>;
    reason: string;
  };
};
```

Diagnostics are for analytics/Sentry only. They must contain IDs/enums only, no display names, no birth years, and no raw profile objects.

---

## Matrix

This is the target contract. Rows labeled V0 are compatibility/start-state rows only.

| # | Profile state | intent/default | proxy | shape | visible tabs | home screen |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Adult owner, no family links | study | no | study | home, library, progress, more | LearnerHome |
| 2 | Adult owner, no family links, chose Family intent | family intent | no | study | home, library, progress, more | LearnerHome plus setup CTA |
| 3 | Adult owner, family-capable | study | no | study | home, library, progress, more | LearnerHome |
| 4 | Adult owner, family-capable | family | no | family | home, recaps, progress, more | FamilyHome |
| 5 | Adult owner, family-capable | null/default family | no | family | home, recaps, progress, more | FamilyHome |
| 6 | Adult owner, family-capable | null/default study | no | study | home, library, progress, more | LearnerHome |
| 7 | Parent proxy active through retained internal path | any | yes | study | home, library, progress | LearnerHome with proxy banner |
| 8 | Child profile on shared parent account | any | no | study | home, library, progress, more | LearnerHome |
| 9 | Solo child owner | any | no | study | home, library, progress, more | LearnerHome |
| 10 | Profile not loaded | any | any | study | home, library, progress, more | LearnerHome/loading |
| V0 | Adult owner, family-capable, current code Family mode | family | no | family-v0 | home, progress, more | ParentHome |
| V0 | Adult owner, family-capable, current code Study mode | study | no | study-v0 | home, library, progress, more | LearnerHome |
| V0 | Adult owner with children, flag off | null | no | guardian-v0 | home, own-learning, library, progress, more | ParentHome |

V1 implementation should remove the V0 rows from runtime behavior as the new contract lands. Tests may keep V0 rows as migration fixtures until the old code paths are deleted.

Family setup is a setup surface, not an `AppContext` enum value. Until the adult has a family link, the tab shell remains Study-safe and offers Add child / Link child / Continue studying choices. Do not trap the user in Add child as the only path.

### Precedence

1. If `isParentProxy === true`, proxy chrome wins and Study/Family switching is hidden.
2. If no active profile is loaded, render Study-safe loading/learner shell.
3. If `MODE_NAV_V1_ENABLED` is off, preserve current V0 behavior until rollout.
4. If family-capable and effective app context is `family`, render Family shell.
5. Otherwise render Study shell.

---

## Route Reachability

`canEnter(route, params?)` is the entry guard. `isSurfaced(route, params?)` answers whether the shell links to the route from the active context. A route can be reachable but not surfaced.

Representative route keys:

```ts
type RouteKey =
  | 'home'
  | 'library'
  | 'recaps'
  | 'recaps/[recapId]'
  | 'progress'
  | 'progress/saved'
  | 'progress/vocabulary'
  | 'session'
  | 'session-summary/[sessionId]'
  | 'homework'
  | 'dictation'
  | 'quiz'
  | 'practice'
  | 'mentor-memory'
  | 'child/[profileId]'
  | 'child/[profileId]/reports'
  | 'child/[profileId]/reports/weekly'
  | 'child/[profileId]/curriculum'
  | 'topic/relearn'
  | 'create-profile'
  | 'subscription'
  | 'more/account'
  | 'more/privacy';
```

### Route Rules

| Route | Study | Family | Proxy | Child/shared | Notes |
| --- | --- | --- | --- | --- | --- |
| `home` | enter/surface | enter/surface | enter/surface | enter/surface | Root for current context |
| `library` | enter/surface | no | enter/surface | enter/surface | Family child curriculum uses child route, not top-level Library |
| `recaps` | no | enter/surface | no | no | Required V1 route; add before surfacing the tab |
| `recaps/[recapId]` | no | enter/surface | no | no | Back fallback is `/(app)/recaps` |
| `progress` | self only | children/family only | proxied child only | self only | Family excludes adult self |
| `session`, `homework`, `dictation`, `quiz`, `practice` | enter/surface | reachable only via explicit bridge/deep link; not tab-surfaced | no | enter/surface | Family shell does not link directly to learning routes |
| `mentor-memory` | enter/surface | enter if adult self context | no | self only | Content gates decide child consent editor |
| `child/[profileId]/*` | no | linked child only | no | no | Parent-native child surfaces |
| `child/[profileId]/curriculum` | no | linked child only | no | no | Replacement path for Family mode lacking top-level Library |
| `topic/relearn` | enter/surface | only through Learn-this-too bridge | no | enter/surface | Bridge must write as adult in Study mode |
| `create-profile?for=child` | adult owner only | adult owner only | no | no | Never force add-child as only path |
| `subscription` | owner only | owner only | no | solo owner only | Shared child profiles cannot manage billing |

---

## Data And API Requirements

V1 needs server-backed context before the contract can be the real source of truth.

### Profile Field

Add nullable `profiles.default_app_context`:

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

Also expose `hasFamilyLinks: boolean` on profile responses.

Required files:

- `apps/api/drizzle/00NN_profiles_default_app_context.sql`
- `apps/api/drizzle/00NN_profiles_default_app_context.rollback.md`
- `packages/database/src/schema/profiles.ts`
- `packages/schemas/src/profiles.ts`
- `apps/api/src/services/profile.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/mobile/src/hooks/use-profiles.ts`
- `apps/mobile/src/lib/app-context.tsx`

Rollback is possible. Dropping the field loses only the last/default Study-vs-Family preference; it does not lose profile, learning, family-link, session, or report data.

### Mode Mutation

Mode switching writes the active profile's `defaultAppContext`.

Server rules:

- `study` is allowed for every usable profile.
- `family` is allowed only for family-capable adult owner profiles.
- Reject child/non-owner attempts to set `family`.
- Reject route/body profile IDs that do not match the authenticated active profile scope.
- `switchProfile` must not write app context.

Client rules:

- Optimistic switch is allowed only with rollback on failure.
- Capture `profileId` when mutation starts.
- If active profile changes before mutation resolves, ignore the late response and refetch profiles.
- Use `router.replace()` to the new context root after success.
- Do not use SecureStore for app context.

---

## Onboarding Intent

> **Decision 2026-05-25:** No dedicated first-run intent screen for V0. Discovery happens in the Welcome Intro and in More, **not** in a forced first-run choice.
>
> Context: the earlier 2026-05-24 decision rested on Free/Plus users being unable to add a learner profile (`maxProfiles: 1`), which made every "Add a child" CTA a paywall tease. That constraint is being lifted by [`docs/specs/2026-05-25-tier-access-rework.md`](./2026-05-25-tier-access-rework.md) — Free and Plus will each support owner + 1 learner profile, with quota as the throttle. Once that rework ships, "Add a child" works on every tier and discoverability stops being a paywall problem.
>
> **V0 discovery surfaces:**
> - **Welcome Intro family card** — explains that parents can add a child later by opening More and tapping "Add a child." This is the only first-run discovery hint in V0.
> - **More → Add a child** — existing entry, no tier check needed post-rework. Aligns More with the `ParentHomeScreen` server-trust pattern.
>
> **Home stays quiet:** Do **not** broaden `LearnerScreen.tsx` / `showParentHome` to show a persistent Home empty-state CTA for adult owners with no linked children. Adult owners with zero linked children continue to see the learner home.
>
> **Legal/product boundary:** "Add a child" is a discovery and account-setup affordance, not a legal shortcut. Subscription tier must not bypass age checks, consent state, guardian verification, profile scoping, consent redaction, or retention/deletion policy. Family Hub surfaces are tier-open once an adult owner has a linked child; capacity is enforced by profile limits and quota.
>
> **Not built for V0:**
> - `apps/mobile/src/app/(app)/onboarding/intent.tsx` — forced first-run Study/Family choice. The Welcome Intro hint covers discovery without forcing a decision under zero context.
> - `apps/mobile/src/app/(app)/family/setup.tsx` — standalone setup screen. Adding a learner profile uses the existing `create-profile?for=child` flow.
> - "Link existing child account" — flow not implemented; do not label any UI with it. Use "Add a child" / "Add a learner profile" only for the existing new-profile flow.
>
> **Revisit when:** V1 navigation contract ships and the Study/Family distinction becomes a first-class app concept users would benefit from declaring up-front. The V1 rules below apply *if and when* the screen is later built.

The first-run Study/Family choice belongs after sign-up and before profile setup completes, at `/(app)/onboarding/intent`.

Rules:

- The pre-profile intent is route/UI state only.
- Do not write Study/Family intent to SecureStore.
- If email verification, app reload, or auth restart loses the route state, showing the intent step again is acceptable.
- Once a profile exists, durable default context is stored only as `profiles.default_app_context`.
- If an adult chooses Family but has no child relationship yet, show Family setup choices without entering the Family tab shell.
- Under-18 users and child/non-owner profiles enter Study only.

---

## Recaps Requirements

Recaps is the largest missing piece between V0 and FULL.

Required V1 work:

- Add `apps/mobile/src/app/(app)/recaps.tsx`.
- Add `apps/mobile/src/app/(app)/recaps/[recapId].tsx` only if detail is not reused from the existing child session detail route.
- Add `packages/schemas/src/recaps.ts`.
- Add `apps/api/src/routes/recaps.ts`.
- Add `apps/api/src/services/recaps.ts`.
- Register the API route in `apps/api/src/index.ts`.
- Reuse existing `session_summaries.narrative`, `conversation_prompt`, and `engagement_signal` fields.
- Reuse the shared engagement signal schema; do not create synonym enum values or duplicate storage columns.
- Scope feed rows by parent family-link access. A child ID outside the active parent's family returns the existing protected/not-found error shape.
- Empty state must support all-children and selected-child filters.
- Back fallback from recap detail is `/(app)/recaps`.

Until these exist, `recaps` must not be silently surfaced as a dead tab.

---

## Sweep Targets

Every site below should migrate to `useNavigationContract()` or remain on a typed allowlist with an expiration.

### Shell And Home

- `apps/mobile/src/app/(app)/_layout.tsx`
- `apps/mobile/src/app/(app)/home.tsx`
- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx`

### More And Account

- `apps/mobile/src/app/(app)/more/index.tsx`
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(app)/more/accommodation.tsx`
- `apps/mobile/src/app/(app)/more/celebrations.tsx`
- `apps/mobile/src/app/(app)/more/privacy.tsx`
- `apps/mobile/src/app/(app)/subscription.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.tsx`

### Progress And Learning Routes

- `apps/mobile/src/app/(app)/progress/index.tsx`
- `apps/mobile/src/app/(app)/progress/saved.tsx`
- `apps/mobile/src/app/(app)/progress/vocabulary.tsx`
- `apps/mobile/src/app/(app)/own-learning.tsx`
- `apps/mobile/src/app/(app)/session/_layout.tsx`
- `apps/mobile/src/app/(app)/homework/_layout.tsx`
- `apps/mobile/src/app/(app)/dictation/_layout.tsx`
- `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- `apps/mobile/src/app/(app)/practice/index.tsx`
- `apps/mobile/src/app/(app)/topic/relearn.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx`

### Family Routes

- `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`
- new `apps/mobile/src/app/(app)/recaps.tsx`

### Query Scope

- `apps/mobile/src/hooks/use-dashboard.ts`
- `apps/mobile/src/hooks/use-progress.ts`
- `apps/mobile/src/hooks/use-sessions.ts`
- `apps/mobile/src/hooks/use-retry-filing.ts`

---

## Enforcement

Add AST-based guard tests after the contract module exists.

Required tests:

- `navigation-contract.test.ts`: exact matrix rows and gates.
- `navigation-contract.snapshot.test.ts`: full matrix snapshot with route predicates evaluated against representative params.
- `navigation-contract.guard.test.ts`: AST ratchet preventing raw profile/mode/proxy gating outside the contract.
- Totality/property test: fuzzed inputs never throw and always return a complete contract.

The ratchet should fail on:

- imports of old tab resolvers outside the contract;
- UI branching on `activeProfile.isOwner`, `mode`, `isParentProxy`, `role`, or subscription tier outside allowed files;
- new tab keys missing from the contract;
- new guarded routes missing from `RouteKey`;
- consumers branching on `diagnostic.*`.

Use a typed allowlist during migration. The allowlist should shrink as each PR migrates screens.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Recaps tab is surfaced before route exists | Contract returns `recaps` but no screen/API exists | Dead tab or router error | Add minimal Recaps route/API before surfacing, or keep a tracked stub gate |
| Contract preserves V0 Family tabs | Matrix keeps `home, progress, more` as final | FULL spec never ships Recaps | V1 tests assert Family tabs exactly `home, recaps, progress, more` |
| Mode switch mutation fails | Profile app-context PATCH returns 4xx/5xx | Optimistic switch rolls back with retryable error | Restore prior context, refetch profiles |
| Mode switch races profile switch | Late mutation response returns after active profile changed | Wrong profile could appear in wrong context | Capture profile ID, ignore stale response, refetch |
| Parent self-progress appears in Family | Progress picker includes adult profile in Family mode | Ambiguous "whose progress" UI | Contract `progressScope === 'children'`; tests reject self option |
| Child recaps leak across family | Tampered child ID is requested | Protected/not-found fallback, no data | Server family-link check in Recaps service |
| Normal parent review enters proxy | Parent selects child/review action | Proxy chrome appears in normal UX | Route to Children/Recaps/Progress parent-native surfaces |
| Proxy has no exit | Legacy/internal path enters proxy and banner is missing | User is stranded with hidden `more` tab | Contract requires `chrome.proxyBanner === 'required'` in proxy |
| Learn-this-too writes to child | Bridge carries child source into Study write path | Adult study flow mutates child data | Source context is read-only; writes are scoped to adult profile |
| Push tap crosses context incorrectly | Family push tapped while in Study session | Stale stack or interrupted session | Prompt/queue during active session; otherwise replace into Family Recaps/root |
| New route bypasses contract | New `_layout.tsx` or tab added without `RouteKey` | Inconsistent guards | AST guard and change-class checklist fail review |

---

## Implementation Sequence

### PR 1 - Reconciled Contract Scaffold

- Add `lib/navigation-contract.ts`.
- Add `useNavigationContract()`.
- Add matrix/unit tests and snapshot tests.
- Add typed allowlist for existing V0 consumers.
- Do not claim drift is fixed until consumers migrate.

### PR 2 - Server-Backed App Context

- Add `profiles.default_app_context`.
- Add `hasFamilyLinks` to profile responses.
- Add app-context mutation.
- Make mobile mode derive from profile data.
- Add optimistic rollback and stale-response handling.

### PR 3 - Shell And Home Migration ✅ delivered

- Replace tab visibility in `_layout.tsx` with the contract.
- Move mode switcher to app chrome.
- Remove final-shape dependency on `own-learning` tab.
- Keep V0 flag fallback only if needed for rollout.

Server-backed `profiles.default_app_context` + `hasFamilyLinks` shipped via migration `apps/api/drizzle/0089_ancient_naoko.sql`; mobile derives mode from profile data via `apps/mobile/src/hooks/use-navigation-contract.ts`. `own-learning.tsx` retained as a V0-fallback route only (see `V0_FALLBACK_FILES` in `navigation-contract-usage-guard.test.ts`).

### PR 4 - Recaps ✅ delivered

- Add Recaps schema/API/service/mobile tab.
- Reuse existing parent recap storage fields.
- Add all-children and child-filtered feed.
- Add back fallback to Recaps.

### PR 5 - Progress, More, Deep Guards ✅ delivered (absorbed into Phase 6 completion plan)

- Migrate Progress self-vs-children scope.
- Migrate More/account/privacy gates.
- Migrate deep-route guards to `canEnter()`.
- Add child curriculum route from Family surfaces.

Absorbed into [`docs/_archive/plans/done/2026-05-24-navigation-contract-phase-6-completion-plan.md`](../../plans/done/2026-05-24-navigation-contract-phase-6-completion-plan.md) as its PR 3 (More + Progress) and PR 4 (deep-route guards + child curriculum). Commit refs:

- More gates: `2c07944a4 refactor(mobile): route More-screen gates through navigation contract for V0+V1`
- Progress refactor: `d8b288011 refactor(mobile): extract progress screen components and view-models`; `b6a2e3e93 fix(mobile): show child pills without own-profile pill in Family Progress`
- Deep-route guards: `76bbf06c3 feat(mobile): migrate RequireFamilyContext to navigation contract (Phase 6 PR4)`; `0562d5b69 feat(mobile): Phase-6 nav-contract migration — saved, vocabulary, session-summary, mentor-memory`
- Child curriculum route: `f7d636e36 feat(apps/mobile): child curriculum screen + bridge CTA in topic detail`; `c860d931e feat(apps/mobile): nav-contract child curriculum gating + parent-bridge child provenance`

### PR 6 - Proxy And Cross-Context Cleanup ✅ delivered (absorbed into Phase 6 + WI-371)

- Remove normal user paths into proxy.
- Keep proxy only for explicit retained internal/test paths until separately deleted.
- Add Learn-this-too bridge.
- Update notification taps and back-stack replacement rules.
- Empty the allowlist and fully arm the ratchet.

Absorbed into Phase 6 completion plan PR 5 (final guard simplification) and WI-371 (proxy-mode hardening). The "empty allowlist" intent was rejected in favour of three semantic buckets — see `apps/mobile/src/lib/navigation-contract-usage-guard.test.ts`:

- `BOUNDARY_FILES` (9 entries, permanent) — files that own raw owner/proxy/mode reads on behalf of the rest of the app, pinned against `CANONICAL_BOUNDARY_FILES`.
- `V0_FALLBACK_FILES` (7 entries) — die together when `MODE_NAV_V0_ENABLED` retires.
- `NON_NAV_DOMAIN_FILES` (10 entries, permanent) — `isOwner` reads that classify a domain entity (account, family-member row, child target), explicitly carved out as "must NOT be migrated to the contract."

Each entry pins exact expected finding counts; the ratchet fails in both directions (decrease → narrow the exception; increase → migrate or justify).

Commit refs:

- Learn-this-too bridge: `5a42278ae feat(apps/mobile): learn-this-too gate, camera auto-permission, OCR garble filter, proxy-mode docs`; `1d952851a feat(apps/mobile): parent-bridge Add-to-My-Learning UI — button, provenance, clone hook, recap detail screen`
- Proxy cleanup: `9242c4dd8 fix(mobile): proxy-mode read-only guards across 11 screens [WI-371]`; `de02b9608 refactor(mobile): replace isExplicitProxyMode with navigationContract.isParentProxy [WI-371]`; `3460f3c5b fix(mobile): proxy-mode hardening — consent guard, camera, lang-setup, create-profile`
- Mode-write boundary + usage guard: `e8b042655 refactor(mobile): extract useEnsureStudyMode/useEnterFamilyMode + harden usage guard (Phase 6)`; `7bac83d10 fix(apps/mobile): nav-contract family-capability fix, setMode callbacks, mode-switch guard`

---

## Out Of Scope

- API authorization design beyond the required Recaps/profile checks.
- Visual styling of tabs, banners, and cards.
- Fully deleting proxy implementation in the same PR as the contract scaffold.
- Family games, leaderboards, competitions, or challenge surfaces.
- Web shell behavior; this contract is mobile-first.

---

## Resolved Reconciliation Notes

- The FULL spec is the product source of truth.
- The old navigation-contract draft is useful as an enforcement and centralization pattern, not as the final tab/product matrix.
- Recaps not existing is a blocker to final Family tab shape, not a reason to remove Recaps from the target.
- Server-backed `defaultAppContext` is required for FULL; local React state is V0 only.
- Parent proxy remains a compatibility state, not the normal family-review UX.
- A solo learner path must remain available. Family setup can invite adding/linking a child, but must not trap adults in add-child as the only path.
