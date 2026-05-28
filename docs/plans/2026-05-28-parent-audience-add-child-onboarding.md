---
title: Parent-Audience Add-Child Onboarding — Implementation Plan
date: 2026-05-28
profile: code
spec: docs/plans/2026-05-27-pre-auth-welcome-flow.md (predecessor — PR #551, #553)
status: draft
---

# Parent-Audience Add-Child Onboarding — Implementation Plan

**Goal:** A user who taps "I'm done fighting over homework" at the pre-auth chooser is asked the audience question exactly once — they are NOT re-asked "Just for me / For my family" after signup, and they land on an add-your-child screen (skippable) instead of a generic learner home. A user who taps "I want to learn" gets a clean, family-free setup.

**Approach:** Persist the chooser's audience across the signup wall via a small device-scoped flag (mirroring `intro-state.ts`). In `create-profile.tsx`, the carried audience replaces the in-form Study/Family intent picker: `parent` (adult) → auto-set family context + route to the existing `create-profile?for=child` screen after the owner profile is created; `learner` or absent → solo setup, no picker. The learner "add child later" door already exists in production (More tab, V0 add-child gate) and needs no change.

## Scope

In scope:
- `apps/mobile/src/lib/pre-auth-audience.ts` (new) + co-located `.test.ts`
- `apps/mobile/src/app/(auth)/welcome.tsx` — write the audience flag at `handleChoose`
- `apps/mobile/src/app/(auth)/welcome.test.tsx` — assert the write
- `apps/mobile/src/app/create-profile.tsx` — consume audience; replace the intent picker
- `apps/mobile/src/app/create-profile.test.tsx` — parent→add-child, learner→no-picker
- `apps/mobile/src/lib/sign-out-cleanup.ts` (+ its test/registry) — register the new SecureStore key for sign-out wipe + REGISTRY_EXCEPTIONS for the new `setItemAsync` site
- `apps/mobile/src/i18n/locales/{en,nb,de,es,ja,pl,pt}.json` — add-child framing copy used on the parent redirect (reuse existing `create-profile`/`more.family` keys where present; add only what's missing)
- `apps/mobile/e2e/flows/onboarding/welcome-intro.yaml` — extend/duplicate for the parent branch landing on the add-child screen

Out of scope (must NOT change):
- `apps/mobile/src/lib/navigation-contract.ts` and its gate logic — the add-child door already works in V0; the V1 subscription gate is intentional
- The V0/V1 tab-shape helpers and the nav-contract hard constraint
- `more/index.tsx` `handleAddChild` and the LearnerScreen family-setup CTA — already correct for adult owners
- The Clerk auth / sign-up screens themselves
- The `PreviewOnboardingStateV0` / SaveWizard machinery (deliberately NOT reused — see T1 rationale)

## Decisions (no deferral)

- **Dedicated carrier, not `preview-onboarding-state`.** `setPreviewState` requires `path`/`intent`/`createdAt` and is consumed by the SaveWizard (`save-wizard-targets.ts`, `SaveWizardGate.tsx`). Writing the chooser audience into it would make the SaveWizard believe a topic-preview happened. A new isolated flag avoids that incorrect coupling. This is the same call the predecessor made with `intro-state.ts` (separate from preview state).
- **Audience values:** `'learner' | 'parent'` — identical union to `WelcomeAudience` in `WelcomeIntro.tsx`. Re-export the type from there to keep one source of truth; do not redefine.
- **TTL = 1 hour** (matches `PREVIEW_TTL_MS`). Signup (email verification etc.) can take minutes; 1h is safe. Cleared on consume and on sign-out.
- **Non-adult "parent" picker tap falls back to learner setup.** A under-18 user who taps "I'm done fighting over homework" cannot be a guardian (add-child is 18+). At profile setup, if `audience === 'parent'` but `!isAdultBirthDate`, ignore the parent intent and run the solo learner path (no family context, no add-child redirect). No dead end.
- **Intent picker is removed, not merely bypassed.** The `[ACCOUNT-01]` Study/Family picker JSX + `intent` state + the family-PATCH-on-`intent==='family'` branch are deleted. Family intent is now set from the carried audience (parent→family). The existing `updateAppContext.mutateAsync({ defaultAppContext: 'family' })` call is kept but re-keyed off `audience === 'parent' && isAdultBirthDate` instead of `intent === 'family'`.
- **Parent redirect target:** after the owner profile POST succeeds and family context is set, `router.replace({ pathname: '/create-profile', params: { for: 'child' } })` instead of `handleClose()`. The add-child screen's existing `Cancel` (`create-profile-cancel` → `handleClose` → `/(app)/home`) is the skip ("I'll do this later"). No new skip control needed.
- **Navigate/switch ordering for the parent redirect:** mirror the existing navigate-first guard (create-profile.tsx:343-358). Call `switchProfile(ownerProfileId)` to make the new owner active, THEN `router.replace(...for:child)`. The add-child route guard (`navigation-contract.ts:432`) requires `gates.showAddChild`, which in V0 holds once the active profile is the adult owner. Verify the active profile is the owner before the redirect to avoid a transient access-blocked screen.

## Failure Modes (UX resilience — required)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Audience flag expired (>1h between chooser and profile setup) | Slow/abandoned signup | Solo learner setup, no picker | Adult owner adds a child later via More → Add child (V0 door) |
| `audience='parent'` but under-18 birth date | Minor taps the parent option | Solo learner setup, no add-child redirect | None needed — minors cannot guardian; door stays hidden |
| Family-context PATCH fails after owner profile created | Flaky network on the app-context PATCH | Profile still created; redirected to add-child anyway | Existing non-throwing catch (create-profile.tsx:293-300); user can set mode from More → Account |
| Add-child POST hits profile limit (free tier) on the redirect screen | Free-plan parent tries to add a child | PROFILE_LIMIT_EXCEEDED upgrade alert (existing, create-profile.tsx:375-399) | "See plans" CTA → /(app)/subscription |
| Parent skips the add-child screen | Taps Cancel on the redirect | Lands on learner home | More → Add child remains available; mentor home appears once a child is linked |

## Tasks

- [ ] **T1: New device-scoped audience carrier.** Create `apps/mobile/src/lib/pre-auth-audience.ts` exporting `PRE_AUTH_AUDIENCE_KEY = 'preAuthAudience.v1'`, `preAuthAudienceSecureStoreKey()`, `markPreAuthAudienceSync(audience)`, `readPreAuthAudienceSync()` (in-memory only), `readPreAuthAudience()` (async; in-memory → SecureStore, honoring 1h TTL), `clearPreAuthAudience()`, and `__resetPreAuthAudienceForTests()`. Re-use the in-memory + async-write + TTL shape of `intro-state.ts` / `preview-onboarding-state.ts`. Import `type WelcomeAudience` from `../components/welcome/WelcomeIntro`.
  — done when: `pre-auth-audience.test.ts` passes: (a) `markPreAuthAudienceSync('parent')` makes `readPreAuthAudienceSync()` return `'parent'` synchronously; (b) `readPreAuthAudience()` returns `'parent'` from SecureStore after an in-memory reset; (c) a record older than `TTL_MS` resolves to `null` and deletes the key; (d) `clearPreAuthAudience()` clears both layers.

- [ ] **T2: Welcome chooser writes the audience.** In `welcome.tsx` `handleChoose`, call `markPreAuthAudienceSync(picked)` alongside the existing `track('intro_audience_selected', …)`.
  — done when: `welcome.test.tsx` gains a test asserting that pressing `welcome-chooser-parent` calls the audience writer with `'parent'` and `welcome-chooser-learner` with `'learner'`. Stub `pre-auth-audience` with a Pattern-A `jest.requireActual` spread (spy only `markPreAuthAudienceSync`) to honor GC1.

- [ ] **T3: Consume audience in create-profile; remove the intent picker.** In `create-profile.tsx`: (a) initialize an `audience` state from `readPreAuthAudienceSync()`, hydrate via `readPreAuthAudience()` in an effect; (b) delete the `intent` state, `showIntentPicker`/`intentRequired` derivations, and the `[ACCOUNT-01]` picker JSX (lines 660-727); (c) drop `intentRequired` from `canSubmit`; (d) set `const wantsFamily = audience === 'parent' && isAdultBirthDate;` and replace the `intent === 'family'` PATCH condition with `wantsFamily`; (e) clear the audience flag once consumed (on successful create or on unmount after read).
  — done when: `create-profile.test.tsx` is updated so the removed picker tests (`create-profile-intent-study`/`-family`) are deleted (feature genuinely removed, not weakened) and a new test asserts `queryByTestId('create-profile-intent-picker')` is `null` for both a first-profile learner and a first-profile parent.

- [ ] **T4: Parent first-profile redirect to add-child.** In `create-profile.tsx` `onSubmit`, in the non-parent first-profile branch, when `wantsFamily` is true: after the owner profile is created and `switchProfile` resolves, `router.replace({ pathname: '/create-profile', params: { for: 'child' } })` instead of `handleClose()`. Preserve the existing navigate-first ordering and the consent-flow branch (consent takes precedence if `needsConsentFlow`).
  — done when: `create-profile.test.tsx` gains: (a) parent (carried `'parent'`, adult birth date) → after submit, `router.replace` called with `{ pathname: '/create-profile', params: { for: 'child' } }`; (b) learner (carried `'learner'`) → `handleClose`/`goBackOrReplace` to `/(app)/home`, NOT the add-child redirect; (c) `audience='parent'` + under-18 birth date → learner path (no redirect, no family PATCH).

- [ ] **T5: Sign-out cleanup + add-child framing copy.** Register `PRE_AUTH_AUDIENCE_KEY` in `sign-out-cleanup.ts` so the flag is wiped on sign-out, and add the new `setItemAsync` site to `REGISTRY_EXCEPTIONS` (same treatment as `intro-state.ts:57`). Ensure the add-child screen's existing copy ("Tell us about your child") reads well as the immediate post-signup destination; add a one-line reassurance only if a key is missing (reuse `more.family.*` / `create-profile` keys first).
  — done when: the sign-out-cleanup guard test passes with the new key registered; `pnpm exec tsc --noEmit` (mobile) and `nx lint mobile` are clean; i18n staleness check (`check-i18n-staleness.ts`) passes for any added keys across all 7 locales.

- [ ] **T6: E2E parent-branch flow.** Extend `welcome-intro.yaml` (or add a sibling flow) so picking `welcome-chooser-parent`, completing the deck + bridge, signing up, and creating the owner profile lands on the add-child screen (`create-profile-name` with the "Tell us about your child" title / `create-profile-submit` labelled "Add child"). Validate syntax with the Maestro syntax checker; do not require a live device run in this plan.
  — done when: `mcp__maestro__check_flow_syntax` reports the flow valid and the asserted testIDs match the source (`create-profile-*`).

## Tests

- T1 — `apps/mobile/src/lib/pre-auth-audience.test.ts` (new). No internal mocks; exercise the real module with `__resetPreAuthAudienceForTests()` between cases. Mock only `./secure-storage` if it is already mocked repo-wide for lib tests (match `intro-state.test.ts`'s approach exactly).
- T2 — extend `welcome.test.tsx`. New `jest.mock('../../lib/pre-auth-audience', () => ({ ...jest.requireActual(...), markPreAuthAudienceSync: (...a) => mockMark(...a) }))` (Pattern A).
- T3/T4 — extend `create-profile.test.tsx`. Stub `pre-auth-audience` read via Pattern A so each test sets the carried audience; assert picker absence and redirect target. Keep using the real profile/api hooks already wired in that suite; do not add internal mocks of profile/api.

## Self-review notes

- Name consistency: `audience` (state), `wantsFamily` (derived), `markPreAuthAudienceSync` / `readPreAuthAudienceSync` / `readPreAuthAudience` / `clearPreAuthAudience` — used identically across T1-T5.
- Spec coverage: "ask once" → T2+T3 (no second picker); "parent lands on add-child" → T4; "learner clean setup" → T3; "add child later for adult learners" → no code (V0 door verified at navigation-contract.ts:330); "soft, age-aware" → T4(c) minor fallback + door stays hidden for minors.
- GC1: every new test mock is external-boundary or Pattern-A `requireActual`; no bare internal `jest.mock`.
