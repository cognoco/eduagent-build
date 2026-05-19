---
title: 'Trial Intent Save Onboarding — v0 Experiment Slice'
slug: 'trial-intent-save-onboarding-v0'
created: '2026-05-19'
status: 'draft'
supersedes: null
upgrade_path: 'docs/specs/2026-05-18-trial-intent-save-onboarding.md'
sibling_specs:
  - 'docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md'
tech_stack:
  - Expo Router
  - React Native
  - Clerk
files_to_modify:
  - apps/mobile/src/lib/feature-flags.ts
  - apps/mobile/src/app/(auth)/sign-in.tsx
  - apps/mobile/src/app/preview/index.tsx
  - apps/mobile/src/app/preview/intent.tsx
  - apps/mobile/src/app/preview/topic.tsx
  - apps/mobile/src/app/preview/value-prop.tsx
  - apps/mobile/src/app/(app)/preview/save.tsx
  - apps/mobile/src/app/(auth)/sign-up.tsx
  - apps/mobile/src/app/(auth)/_layout.tsx
  - apps/mobile/src/app/(app)/_layout.tsx
  - apps/mobile/src/app/create-profile.tsx
  - apps/mobile/src/lib/preview-onboarding-state.ts
  - apps/mobile/src/lib/pending-auth-redirect.ts
  - apps/mobile/src/lib/profile.ts
  - apps/mobile/src/lib/sign-out-cleanup.ts
code_patterns:
  - The entire feature ships behind `FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED`. Flipping it false hides the CTA and disables the no-profile gate branch, with no orphan routes reachable.
  - Pre-signup intent is routing context only; never legal identity.
  - No live LLM call before signup. The first real teaching happens after profile creation.
  - Save target is the source of truth for profile shape; pre-signup intent is a hint.
  - "Owner with no linked children" lands as solo learner, not parent home.
  - Preview state is in-memory by default; only a short-TTL SecureStore key survives the OAuth round-trip.
test_patterns:
  - Co-located Jest tests for intent routing, save target overriding intent, OAuth state survival, sign-out cleanup.
  - E2E smoke for self/parent/both/not-sure paths through signup and save wizard.
---

# Tech-Spec: Trial Intent Save Onboarding — v0 Experiment Slice

**Created:** 2026-05-19
**Relationship to v1:** The full spec at `docs/specs/2026-05-18-trial-intent-save-onboarding.md` proposes a live LLM preview lesson before signup with public endpoints, rate limiting, transcript storage, and claim/import. v0 ships the **routing skeleton** — intent-first, save-wizard-driven profile creation, parents-don't-land-in-learner-chat — without any pre-signup LLM. The teaching moment moves from "before signup" to "the first real session immediately after save." v1 remains the upgrade path when growth experiments warrant the public-LLM infra.

## Overview

### Problem Statement

Today every "try it" path drops users into a learner-flavored experience. A parent who wants to monitor a child reads MentoMate as a student-only chat app and bounces. The fix is to ask intent before signup and route accordingly — not to build a public LLM preview lesson before we know whether signup traffic is the bottleneck.

### Solution (v0)

Three concrete changes:

1. **Pre-signup intent screen.** Ask "Who are you setting this up for?" — Me / My child / Both / Not sure. Route accordingly.
2. **Value-prop screen tailored to intent.** A static screen (no LLM call) showing what MentoMate does, framed for the chosen audience. Self-intent screens show illustrative sample dialogue; parent-intent screens show what setup and weekly insight look like. Sample data is clearly marked.
3. **Post-signup save wizard.** A short flow that captures topic + profile basics, creates the right profile structure (solo learner / parent+child / both), and lands the user in the **first real session or parent home**. The first lesson is real, not a preview.

### What v0 Defers To v1

- Live LLM preview lesson before signup.
- Scripted-preview fallback (the v1 spec's option 2). v0 cuts pre-signup teaching entirely.
- Public `preview-onboarding` endpoints, rate limiting, hashed device ID, abuse controls.
- Preview transcript storage, 24-hour TTL state machine, claim/import endpoint.
- Cross-package schema additions (`packages/schemas/src/preview-onboarding.ts`).
- Session style / session length preferences in the wizard (move to existing settings later; first session uses defaults).
- Parent Home clarity pass (v1 Phase 4 — already marked conditional, kept deferred).

### Why v0 First

- No users yet (`project_pre_launch_no_users.md`). Building a public LLM endpoint with abuse controls is weeks of work to optimize a signup conversion rate that does not yet exist.
- The **routing bug** — parents landing in learner chat, solo owners landing in parent home — is a real problem today. v0 fixes it without paying preview-lesson infra cost.
- v1 remains the growth experiment when there is signup traffic to measure against.

## Scope

### In Scope

- Pre-signup intent screen with four options: `self`, `child`, `both`, `not_sure`.
- Intent-tailored static value-prop screen (no LLM call, no chat shell).
- Preview state preserved through Clerk signup (in-memory + short-TTL SecureStore key for OAuth round-trip).
- Post-signup save wizard: where to save (self / child / both) + topic + profile basics.
- Profile creation rules: self → owner only; child → owner + child sequentially; both → owner now, child now-or-later.
- "Owner with zero linked children → land as solo learner" landing rule applied via `isFamilyCapableProfile` (shared with the v0 Study/Family spec).
- Save-target-overrides-intent rule: the wizard is the source of truth.
- Sign-out cleanup for any persisted preview state.

### Out of Scope

- Live LLM preview lesson.
- Scripted-preview chat UI.
- `apps/api/src/routes/preview-onboarding.ts`, `apps/api/src/services/preview-onboarding.ts`, public preview endpoints, rate limiting, claim/import.
- `packages/schemas/src/preview-onboarding.ts`.
- Auth middleware `PUBLIC_PATHS` changes.
- Session style and session length preferences in the wizard.
- Parent Home clarity pass.
- Free-text parent-to-child messaging.
- Long subject-list onboarding.
- Library / progress / settings / reports preview surfaces.
- Tab shell exposed during preview.
- Profile switching during preview.

## Glossary

| Term | Meaning (v0) |
| ---- | ------------ |
| Intent | Pre-signup routing context: `'self' | 'child' | 'both' | 'not_sure'`. Routes which value-prop screen is shown. Never a legal identity. |
| Save target | Post-signup wizard choice: `'self' | 'child' | 'both'`. Source of truth for profile shape. Can disagree with intent. |
| Value-prop screen | A static, intent-tailored screen describing what MentoMate does. No LLM call, no chat shell, no message turns. |
| Family capability | Same predicate as the Study/Family v0 spec: owner + adult + at least one linked non-archived child. Used for landing rule, not for tab visibility in this spec. |
| Solo learner landing | A signed-in owner with zero linked children lands on the learner home, not parent home. |

For full v1 terms (live preview lesson, claim/import, server-backed preview API), see the upgrade path doc.

## Context For Development

| File | Purpose in v0 |
| ---- | ------------- |
| `apps/mobile/src/lib/feature-flags.ts` | Add `PREVIEW_ONBOARDING_ENABLED` flag (Hard Rule 0). Single on/off switch for the whole feature. |
| `apps/mobile/src/app/(auth)/sign-in.tsx` | Entry point: render the "Try MentoMate" CTA below the existing sign-in form, gated on `FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED`. Tapping it routes to `/preview` (the preview landing). Sign-in.tsx is chosen over `app/index.tsx` because `index.tsx` currently redirects unauthenticated → sign-in, so sign-in is the actual unauthenticated landing surface today. |
| `apps/mobile/src/app/preview/index.tsx` | Preview landing CTA ("Try MentoMate"). |
| `apps/mobile/src/app/preview/intent.tsx` | Intent question (Me / My child / Both / Not sure). |
| `apps/mobile/src/app/preview/topic.tsx` | Topic capture for self/both/not-sure-lesson branches. No live lesson follows; topic is held until save wizard. |
| `apps/mobile/src/app/preview/value-prop.tsx` | Static intent-tailored screen. Two variants rendered behind the same route via param: `learner` and `parent`. |
| `apps/mobile/src/app/(auth)/sign-up.tsx` | Existing signup; extended only to preserve preview state through auth. |
| `apps/mobile/src/app/(auth)/_layout.tsx` | Existing auth shell; extended to read/preserve preview state. |
| `apps/mobile/src/app/(app)/_layout.tsx` | No-profile gate routes to save wizard when preview state exists; otherwise existing `CreateProfileGate` is unchanged. |
| `apps/mobile/src/app/(app)/preview/save.tsx` | Post-signup save wizard: where to save → profile basics → confirm → land. |
| `apps/mobile/src/lib/preview-onboarding-state.ts` | In-memory state + short-TTL SecureStore key. |
| `apps/mobile/src/lib/pending-auth-redirect.ts` | Existing post-auth redirect mechanism; pair with preview state to return to save wizard. |
| `apps/mobile/src/lib/profile.ts` | Add `isFamilyCapableProfile()` (shared with Study/Family v0). |
| `apps/mobile/src/lib/sign-out-cleanup.ts` | Clear preview SecureStore key on sign-out. |

## Preview State (Minimal)

State shape:

```ts
type PreviewIntent = 'self' | 'child' | 'both' | 'not_sure';
type PreviewPath = 'learner_value_prop' | 'parent_value_prop';
type SaveTarget = 'self' | 'child' | 'both';

interface PreviewOnboardingStateV0 {
  intent: PreviewIntent;
  path: PreviewPath;
  topicText?: string;          // captured only on self/both/not_sure→lesson branches
  bothPriority?: 'child_first' | 'self_first';
  preferredSaveTarget?: SaveTarget;  // optional, if user picked before signup
  createdAt: string;
}
```

Storage:

- Default storage: React module-level singleton (in-memory).
- OAuth round-trip survival: write a **single** SecureStore key `mentomate_preview_intent` with 1-hour TTL. Key is read on app cold-start when a `pending-auth-redirect` to the save wizard is present.
- TTL: 1 hour (not 24, since v0 has no transcript or session to protect). After 1 hour the key is treated as absent and the user re-enters the intent screen.
- Cleared on:
  - successful save wizard completion;
  - sign-out (via `sign-out-cleanup.ts`);
  - TTL expiry (lazy check on read).
- Never store structured raw child names (no dedicated `childName` field). **Topic text caveat:** the captured `topicText` is freeform and may legitimately contain a child's name (e.g. "Sophie's math homework"). v0 accepts this small surface for the 1-hour TTL window; do not add a sanitizer in v0 because false-positive scrubbing of legitimate topics is worse than the bounded leak. Revisit if real-device telemetry shows shared-device misuse.
- **SecureStore accessibility flag.** Write the key with `keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY` so the value is excluded from iCloud Keychain sync and from device-to-device backups. This bounds the topic-text leak surface to the originating device. The `secure-storage.ts` wrapper accepts `SetOptions` (`secure-storage.ts:27`); pass the flag at the call site in `preview-onboarding-state.ts`.

## User Flow

### Self / Not-sure → Lesson

1. Tap "Try MentoMate" (or equivalent CTA).
2. Intent screen → "Me" (or "Not sure" → "Try a quick lesson").
3. Topic screen → "What should we help with?" — user enters topic text.
4. **Value-prop screen (static, learner variant):** "Here's how MentoMate teaches" with sample dialogue rendered as illustrative bubbles, clearly marked sample. CTA: "Sign up to start your first lesson on {topic}."
5. Clerk signup.
6. Save wizard:
   - "Where should we save this?" → preselected "My learning".
   - Profile basics: display name + birth year (existing `create-profile` fields).
7. Profile created, topic carried into first real session creation.
8. Land in real first session.

### Parent (My child)

1. Tap "Try MentoMate".
2. Intent screen → "My child".
3. **Value-prop screen (static, parent variant):** "Here's how MentoMate helps families" with what setup does + sample weekly insight (sample data clearly marked). CTA: "Sign up to set up your child."
4. Clerk signup.
5. Save wizard:
   - "Where should we save this?" → preselected "My child's learning".
   - Parent profile basics first (display name + birth year).
   - Child profile basics second (nickname + birth year; consent-safe copy from existing child create-profile flow).
6. Active profile stays parent.
7. Land on parent home.

### Both

1. Intent → "Both" → "What do you want to set up first?" (default: child first).
2. **Child first:** routes through parent value-prop → signup → save wizard with preselected "Both", child basics first → parent home.
3. **Self first:** routes through learner topic → learner value-prop → signup → save wizard with preselected "Both", self basics first → first real session. Wizard offers "Add child now" or "Later". If later, land in session; parent-capable surfacing happens once child is added.

### Not Sure

1. Intent → "Not sure" → low-commitment fork: "Try a quick lesson" or "See how parent setup works".
2. Route to the matching value-prop screen.
3. Save wizard asks explicitly which save target — neither is preselected.

## Save Wizard (v0)

Header copy:

> Great, let's save this and get you started.

Step 1 — where to save:

> Where should we save this?

Options: `My learning` / `My child's learning` / `Both`. Preselected from pre-signup intent. **The wizard choice wins** over the pre-signup intent if they disagree.

Step 2 — profile basics:

- Save to self: display name, birth year.
- Save to child: parent name, parent birth year, then child nickname, child birth year. Active profile remains parent.
- Save to both: parent basics first, then "Add child now / Later". If now, child basics; if later, just parent.

Step 3 — confirmation:

> Your first lesson is ready: {topic}.
> (or for parent-only) Your child profile is set up. Let's open parent home.

CTA variants:
- Self / both self-first: "Start lesson"
- Parent / both child-first: "Open parent home"

**Deferred from v1:** session style preference, session length preference. First real session uses sensible defaults; user can adjust later in settings.

## First Session Handoff

For self-target and both-self-first save flows, the "first real lesson" is the user-visible payoff of the entire trial path. The wizard owns the handoff:

1. After `POST /profiles` succeeds for the owner, the wizard pushes the active profile via the existing `switchProfile()` flow so `X-Profile-Id` reflects the new profile before any session-create call.
2. Wait for the profiles-cache predicate-invalidate (step 6 above) to settle so subsequent reads see the new profile.
3. Call the existing session-start path that today drives a fresh session from the learner home (the same code the "Start a new session" affordance triggers). Pass `topicText` from preview state as the initial topic. **The implementer must enumerate the existing entry point** — do not invent a new endpoint in v0.
4. On success: `router.replace(<session route>)` so the preview stack is gone.
5. On failure: `router.replace('/(app)/home')` and surface a toast / inline error on the learner home. The profile exists; the lost work is only the topic, which the user can retype. Do not block the user inside the wizard on a session-create error.

For parent / both-child-first save flows, no first session is started — landing is `router.replace('/(app)/home')`, where the parent home renders.

**Decide before sealing the spec, not during implementation.** Before implementation kicks off, a 30-minute spike must answer: does a reusable session-start helper exist today, or is the only call site buried in a screen component? Two acceptable answers, decided in advance:
- (a) Lift the existing call site into a reusable helper as part of v0 scope. Adds one file to `files_to_modify`.
- (b) Defer the topic-prefill leg of the user flow and update CTA copy from "Start lesson" to "Go to my learning." Topic re-prompted on the first session screen.

The "pause the spec mid-implementation" escape hatch is removed deliberately — that pattern produces the going-in-circles loop. The spike output is added to this spec section as a one-line decision before the first implementation PR is opened.

## Routing And Landing Rules

| Pre-signup intent | Value-prop variant | Save default | Final landing |
| --- | --- | --- | --- |
| Me | Learner | My learning | First real session |
| My child | Parent | My child's learning | Parent home |
| Both, child first | Parent | My child's learning | Parent home |
| Both, me first | Learner | Both | First real session, then add-child prompt if not added |
| Not sure → lesson | Learner | Ask explicitly | Based on save target |
| Not sure → parent preview | Parent | Ask explicitly | Based on save target |

**Solo learner landing rule.** A signed-in owner profile with zero linked children lands on the learner home, even if the pre-signup intent was `child` or `both`. Do not use raw `isOwner` alone to show parent home. Apply via `isFamilyCapableProfile(activeProfile, profiles)`.

## Hard Rules

These are the rules that make v0 worth shipping. None depend on v1's LLM preview infra.

0. **Single on/off switch (`PREVIEW_ONBOARDING_ENABLED`).** The entire feature ships behind one boolean in `apps/mobile/src/lib/feature-flags.ts`, alongside the existing `COACH_BAND_ENABLED` / `MIC_IN_PILL_ENABLED` / `I18N_ENABLED` flags. The flag gates exactly three sites:
   1. The "Try MentoMate" CTA on `apps/mobile/src/app/(auth)/sign-in.tsx` — when false, the CTA is not rendered, so the `preview/*` route tree is unreachable through normal navigation.
   2. The no-profile gate branch in `apps/mobile/src/app/(app)/_layout.tsx` — when false, the gate ignores any latent preview state and falls through to existing `CreateProfileGate`, matching pre-v0 behavior.
   3. The `<Tabs.Screen name="preview/save" options={{ href: null }} />` registration in `(app)/_layout.tsx` — when false, do not register it (defensive; the route is unreachable anyway).
   Flipping the flag to `false` and shipping via EAS OTA (~5 min per `project_eas_update_ota.md`) is the documented rollback path; no code revert PR is required to disable the experiment. Default value at ship: `true`. A remote (server-driven) kill switch is explicitly deferred to v1.

   **Flag scope — what survives `PREVIEW_ONBOARDING_ENABLED = false`.** The flag gates only the preview-onboarding UX surfaces above. The following deliverables of this spec are **shared infrastructure** and ship unconditionally regardless of flag state:
   - `isFamilyCapableProfile(activeProfile, profiles)` in `apps/mobile/src/lib/profile.ts` — imported directly by the sibling Study/Family v0 spec at `docs/specs/2026-05-19-study-and-family-mode-navigation-v0.md:202, 228, 232`. The Study/Family mode-switch UI depends on this helper. Gating it on the trial flag would break the sibling spec.
   - The solo-learner-landing rule (Hard Rule 5) as enforced through `isFamilyCapableProfile` at `LearnerScreen.tsx:454-466` (sibling spec §Overview "Capability is linkage-driven"). This is a global routing rule, not a preview-flow concern.
   - The `mentomate_preview_intent` entry in `GLOBAL_KEYS` (`sign-out-cleanup.ts:79-88`). Cleanup is harmless when no key exists; keeping it registered means a future flag flip-on does not leave residue from earlier sessions.
   - The `preview-onboarding-state.ts` module itself. It defines the storage shape; the flag only gates whether anything *writes* to it.

   What does **not** ship when the flag is off:
   - Visible preview routes from the sign-in screen.
   - The preview branch in the no-profile gate.
   - The `(app)/preview/save` tab whitelist entry.

   **Practical consequence:** turning the flag off disables this spec's user-visible feature without removing any helper that Study/Family v0 owns or imports. Shipping order remains: trial v0 first (so the helper exists in `profile.ts`), then Study/Family v0. The trial flag can be `false` at any point — including immediately after merge — without breaking Study/Family v0's contract.
1. **No LLM call before signup.** The value-prop screen is static. Sample dialogue, if rendered, is hardcoded copy clearly marked as sample.
2. **No saved-memory claim pre-signup.** Do not say "I will remember this" or "Saving your progress" on any pre-signup screen.
3. **No "profile" word pre-signup.** Intent is routing, not identity. Save wizard introduces the word "profile" only after signup.
4. **Save target overrides intent.** If the user picks "My child" pre-signup but switches to "My learning" in the save wizard, the wizard wins. The wizard's choice is the only source of truth for profile shape.
5. **Solo owners land on learner home.** Owner profile + zero linked non-archived children → learner home. Tested explicitly.
6. **Parent value-prop never shows fake live data.** Sample weekly insights are marked as sample. No copy implying a real child is being analyzed before a child profile exists.
7. **OAuth round-trip survives via one short-TTL key.** Only `mentomate_preview_intent` with 1-hour TTL in SecureStore. Cleared on sign-out, on save completion, on TTL expiry. Any new persistence requires extending `sign-out-cleanup.ts` in the same PR.
8. **Shared capability helper.** `isFamilyCapableProfile()` lives in `apps/mobile/src/lib/profile.ts` and is the only predicate the trial wizard and the Study/Family v0 spec use to decide "parent vs solo".
9. **Tab shell hidden during preview.** Routes under `apps/mobile/src/app/preview/*` are outside `(app)/`; they render full-screen without the tab bar. The post-signup save wizard at `(app)/preview/save.tsx` is inside `(app)/` (it needs the authenticated layout's providers), so its tab entry must be excluded via `<Tabs.Screen name="preview/save" options={{ href: null }} />` in `(app)/_layout.tsx`, matching the existing non-visible-route pattern used by `LEARNER_TABS` / `GUARDIAN_TABS`.

## Implementation Plan

0. **Feature flag (entry-point gate).**
   - Add `PREVIEW_ONBOARDING_ENABLED: true` to `FEATURE_FLAGS` in `apps/mobile/src/lib/feature-flags.ts:1-11`, mirroring the existing `COACH_BAND_ENABLED` / `I18N_ENABLED` pattern (consumed at `LearnerScreen.tsx:454`, `more/account.tsx:77`).
   - Gate three sites with the flag — see Hard Rule 0 for the canonical list. Co-locate one unit test per gate that flips the flag and asserts the off-state matches pre-v0 behavior:
     - `(auth)/sign-in.test.tsx` — when `PREVIEW_ONBOARDING_ENABLED` is `false`, the "Try MentoMate" CTA does not render.
     - `(app)/_layout.test.tsx` — when `PREVIEW_ONBOARDING_ENABLED` is `false` AND preview state somehow exists (test seeds it), the no-profile gate still renders `CreateProfileGate`, not the save wizard.
   - The flag is a static module constant, not a hook; do not introduce React Context for it. Toggling requires a redeploy (OTA-eligible).

1. **Capability helper. SHIPS UNCONDITIONALLY — not gated on `PREVIEW_ONBOARDING_ENABLED`.**
   - Add `isFamilyCapableProfile(activeProfile, profiles)` in `apps/mobile/src/lib/profile.ts`. Returns true iff: `activeProfile.isOwner === true`, `computeAgeBracket(activeProfile.birthYear) === 'adult'`, and `profiles.some(p => p.id !== activeProfile.id && p.isOwner === false)`. Signature and behavior are **shared verbatim with Study/Family v0** (`2026-05-19-study-and-family-mode-navigation-v0.md` §Implementation step 1) — same file, same predicate, single source of truth.
   - **Do not wrap this helper in a `PREVIEW_ONBOARDING_ENABLED` check.** It is imported by the sibling Study/Family v0 spec independently of the trial flow; gating it would break that spec. See Hard Rule 0 → "Flag scope — what survives flag-off."
   - v0 deliberately does **not** check archived state. `profileSchema` (`packages/schemas/src/profiles.ts:92-109`) has no `archivedAt` field; adding one is v1's contract change. If a child is removed mid-flow, the next `profiles` refetch drops them from the array and capability re-evaluates.
   - Co-located unit tests for under-18 owner, adult owner with a linked non-owner profile (family-capable), adult owner with no linked non-owner profiles (not family-capable), non-owner active profile, `activeProfile = null`.

2. **Preview state module.**
   - `apps/mobile/src/lib/preview-onboarding-state.ts` exposes `getPreviewState() / setPreviewState() / clearPreviewState()`.
   - In-memory by default; on intent capture, also write the SecureStore key with 1-hour TTL.
   - Lazy TTL check on read; treat expired as cleared.

3. **Preview routes.**
   - `preview/index.tsx` — landing CTA "Try MentoMate".
   - `preview/intent.tsx` — 4-option screen.
   - `preview/topic.tsx` — topic capture for self/both/not-sure-lesson.
   - `preview/value-prop.tsx` — static value-prop screen, accepts `?variant=learner|parent` param.
   - All routes hide the tab bar (already standard for routes outside `(app)/`).

4. **Auth handoff.**
   - **Primary mechanism on mobile (and the only path that survives a cold-start):** the no-profile gate in `apps/mobile/src/app/(app)/_layout.tsx` (step 5 below) reads `getPreviewState()` and routes to `/(app)/preview/save` when preview state exists. The 1-hour SecureStore TTL on `mentomate_preview_intent` keeps this gate viable across an OAuth round-trip even if the app process was killed.
   - **Secondary (web + warm-process mobile):** `apps/mobile/src/lib/pending-auth-redirect.ts` provides immediate post-auth redirect. Note: that module uses `window.sessionStorage` (`pending-auth-redirect.ts:19-27`), which is undefined on React Native — on mobile its storage path is in-memory only and does not survive cold-start. Its 5-minute TTL (`PENDING_AUTH_REDIRECT_TTL_MS`) is shorter than the preview state TTL by design; the `(app)/_layout.tsx` gate is the safety net when pending-redirect has lapsed or never persisted.
   - Pair `pending-auth-redirect.ts` with the preview state setter on intent capture so warm-process signups land directly on the save wizard; rely on the gate for everything else.
   - **`(auth)/sign-up.tsx` concrete edit.** Before `setActive()` returns (after `prepareEmailAddressVerification` success and after the OAuth SSO success branch), call `rememberPendingAuthRedirect('/(app)/preview/save')` iff `getPreviewState()` is non-null. This is the only change to `sign-up.tsx`; everything else in that file is unchanged. Co-located test: a stubbed `prepareEmailAddressVerification` resolves with preview state set → `peekPendingAuthRedirect()` returns the save-wizard path.

5. **No-profile gate routing.**
   - In `apps/mobile/src/app/(app)/_layout.tsx`, when `FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED && !activeProfile && getPreviewState()` returns state, render the save wizard instead of `CreateProfileGate`.
   - When `!activeProfile` and no preview state (or the flag is `false`), keep `CreateProfileGate` behavior unchanged.
   - **Async resolution.** SecureStore reads are async on React Native, so `getPreviewState()` cannot synchronously answer "does state exist" on cold-start. The layout must hold an interim loading state (mirror the existing profile-loading state already rendered for `isLoading`) until preview-state resolution settles. Without this, the layout would render `CreateProfileGate` first and then flip to the save wizard — a visible flash plus the risk of `CreateProfileGate`'s mount effects firing a transient POST. Co-located unit test: cold-start with seeded SecureStore preview state renders loading state, never `CreateProfileGate`.

6. **Save wizard.**
   - `apps/mobile/src/app/(app)/preview/save.tsx` implements the 3-step wizard above.
   - **Tab bar suppression.** The save wizard lives inside `(app)/` (to share the authenticated layout's providers) but must render full-screen. Hide its tab entry via `<Tabs.Screen name="preview/save" options={{ href: null }} />` in `(app)/_layout.tsx`, mirroring the existing `LEARNER_TABS` / `GUARDIAN_TABS` non-visible-route pattern. Hard rule 9 ("tab shell hidden during preview") is enforced for the save wizard by this whitelist exclusion, not by route-tree location.
   - Step 1: where-to-save with preselect from preview state.
   - Step 2: profile basics. Reuses existing `create-profile.tsx` field components (display name, birth year, consent-safe child copy) — do not duplicate.
   - Step 3: confirm + land. Landing route depends on save target — see **First Session Handoff** below. Use `router.replace(...)` in all branches so the preview stack is cleared.
   - Post-save: invalidate the profiles cache by predicate (`query.queryKey[0] === 'profiles'`) — bare `['profiles']` will not match because the key is Clerk-userId-scoped (`apps/mobile/src/hooks/use-profiles.ts:28`). This ensures the next `_layout` render observes the new profile and `isFamilyCapableProfile` resolves correctly.

7. **Profile creation sequencing.**
   - Save target `self`: existing `POST /profiles` for owner.
   - Save target `child`: existing `POST /profiles` for owner first, then for child. The API-side service enforces the first-child free-tier exception via `createProfileWithLimitCheck()` (`apps/api/src/services/profile.ts`); mobile does not call this function directly — it just hits `POST /profiles` and surfaces any error response in-place.
   - Save target `both`: owner first, then conditional child creation depending on "now or later".
   - On any failure mid-sequence, keep the parent profile and show retryable child error. Never roll back the parent. Asserted by AC 9.

8. **Sign-out cleanup integration.**
   - Append `'mentomate_preview_intent'` to the `GLOBAL_KEYS` array at `apps/mobile/src/lib/sign-out-cleanup.ts:79-88` (the same array that already holds `'hasSignedInBefore'`, `'mentomate_pending_auth_redirect'`, etc.). Include a one-line comment pointing at `preview-onboarding-state.ts` as the writer, matching the comment style used for the other entries.
   - The companion meta-test `sign-out-cleanup-registry.test.ts` (referenced at `sign-out-cleanup.ts:27`) scans the codebase for `SecureStore.setItemAsync` callsites and fails CI if a writer's key is not registered — registering in `GLOBAL_KEYS` satisfies the meta-test for this writer.
   - Existing `signOutWithCleanup` already calls `clearProfileSecureStorageOnSignOut`; no other changes are needed.

9. **Tests.**
   - See Testing Strategy below.

## Acceptance Criteria

1. Given a signed-out user taps "Try MentoMate", when the first screen renders, then it shows the intent question with four options and no chat shell.
2. Given the user chooses "Me" and enters a topic, when the next screen renders, then it is the static learner value-prop with sample dialogue marked as sample. No LLM call is made.
3. Given the user chooses "My child", when the next screen renders, then it is the static parent value-prop with sample weekly insight marked as sample. The CTA is "Sign up to set up your child", not "Try a lesson".
4. Given the user signs up from a preview, when auth completes, then the app returns to the save wizard rather than `CreateProfileGate`.
5. Given the user picked "My child" pre-signup but selects "My learning" in the save wizard, when they complete the wizard, then only an owner profile is created and no child profile is created.
6. Given the user picked "My learning" pre-signup and selects "My child's learning" in the save wizard, when they complete the wizard, then parent profile is created first, then child profile, and the active profile remains the parent.
7. Given a parent completes child save, when the app lands, then it lands on parent home and `isFamilyCapableProfile(activeProfile, profiles)` is true.
8. Given an owner profile exists with zero linked children, when the app lands after save, then it lands on the learner home (solo learner rule), not parent home.
9. Given a parent profile is created and the child creation step fails (network/server error mid-sequence), when the wizard surfaces the error, then the parent profile is **not** rolled back, a retryable child-setup affordance is shown, and `isFamilyCapableProfile(parent, profiles)` returns false until the child profile is successfully created.
10. Given preview state exists and the user does not complete signup within 1 hour, when they return, then the SecureStore key is expired, in-memory state is gone, and they re-enter the intent screen.
11. Given the user signs out with active preview state, when sign-out completes, then the `mentomate_preview_intent` key is removed and the next sign-in starts at the existing landing.
12. Given no preview state exists, when a new signed-in account has no profile, then `CreateProfileGate` behavior is unchanged.
13. Given the save wizard completes, when it navigates to the landing route, then `router.replace` is used and the preview stack is not in the back history.
14. Given the user taps Back from the value-prop screen during preview, when navigation completes, then they return to the previous screen in the stack (topic screen for self / both-self-first, intent screen for parent / both-child-first) and previously-entered topic text remains in memory until cleared.
15. Given `FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED` is `false`, when a signed-out user opens the app, then the "Try MentoMate" CTA is not rendered on the sign-in screen, no `/preview` route is reachable through normal navigation, and the `(app)/_layout.tsx` no-profile gate routes to `CreateProfileGate` even if a stale `mentomate_preview_intent` key exists in SecureStore.
16. **Navigation discipline — push vs. replace.** Intra-preview hops (`/preview/index` → `/preview/intent` → `/preview/topic` → `/preview/value-prop` → `(auth)/sign-up`) use `router.push` so the system Back button returns the user to the previous preview screen, satisfying AC 14. The post-save landing (to first session or parent home) uses `router.replace` so the preview stack is cleared from history, satisfying AC 13. No other branches use `router.replace` inside the preview flow.

## Failure Modes

| State | Trigger | User sees | Recovery |
| ----- | ------- | --------- | -------- |
| Preview state expires during OAuth | User starts preview, OAuth round-trip exceeds 1 hour | Intent screen on return | Re-enter intent; topic re-asked in save wizard |
| Signup completed but session not active on return | User signs up, abandons before save wizard renders, returns later signed-OUT (Clerk session expired or app reinstalled) | Lands at `/(auth)/sign-in`; latent `mentomate_preview_intent` key still in SecureStore until TTL | On sign-in success, `(app)/_layout.tsx` reads preview state and resumes the save wizard if `PREVIEW_ONBOARDING_ENABLED` is true and the user still has no profile. If the user already has a profile (i.e., they completed save in a prior session), `preview-onboarding-state.ts` must clear the key on first signed-in render with a non-empty `profiles` list. Asserted by a new test in `(app)/_layout.test.tsx`. |
| User changes save target from pre-signup intent | Save wizard picker differs from intent | Wizard choice wins; profile shape matches wizard | No fallback needed — explicit rule |
| Parent creates first child under free tier | Existing first-child allowance | Child setup succeeds | Existing `createProfileWithLimitCheck()` covers it |
| Child consent flow blocks immediate child profile creation | Child profile would require consent state outside parent control | Save wizard creates parent only, shows "Add child later" affordance, lands on parent-capable home | User completes child setup via existing flow when ready |
| Parent profile creation succeeds, child creation fails | Network/server error mid-sequence | Retryable child setup error; parent profile is kept | User retries child creation; do not roll back parent. Covered by AC 9. |
| Under-18 owner selects intent = child, reaches save wizard | Pre-signup intent did not gate on age (intent is routing context only) | Wizard attempts child save; API rejects via existing 18+ rule on `createProfileWithLimitCheck()`; wizard surfaces the API error in-place | User completes own-learning save instead, or returns when adult; no client-side pre-validation in v0 |
| Parent lands in learner home after child save | `['profiles', userId]` cache stale, the new child profile not yet visible to `isFamilyCapableProfile` | Brief learner-home flash | Save wizard invalidates the profiles cache by predicate (`queryKey[0] === 'profiles'`) before navigating — bare `['profiles']` no longer matches because the cross-account-leak fix scopes the key to Clerk userId (`apps/mobile/src/hooks/use-profiles.ts:28`). Covered by AC 7. |
| OAuth signup returns before profiles load | Auth completes but profile query still loading | Existing profile-loading state | Existing `_layout` profile-loading timeout remains |
| User refreshes web mid-preview | Browser loses in-memory state | If SecureStore key still valid, restore intent; otherwise re-enter intent screen | Same as TTL expiry |
| Duplicate save submission | Double-tap or network retry | Existing `POST /profiles` idempotency / dedup covers it | No new endpoint introduced; existing behavior applies |
| User reads "trial" as billing trial | Copy near billing surfaces says "trial" | "Trial" only appears as visible chrome on preview; internal name is "preview onboarding" | Avoid the word "trial" near billing screens |

## Testing Strategy

### Mobile Unit Tests

- `preview-onboarding-state.test.ts` — set/get/clear, TTL expiry, in-memory survival, SecureStore round-trip.
- `preview/intent.test.tsx` — each option routes to the correct value-prop variant.
- `preview/value-prop.test.tsx` — learner variant renders sample dialogue marked as sample; parent variant renders sample insight marked as sample; no chat shell mounts; no LLM hook is called.
- `(app)/_layout.test.tsx` — no-profile + preview state shows save wizard; no-profile + no preview state shows `CreateProfileGate`.
- `(app)/preview/save.test.tsx` — save target overrides intent; child target creates parent then child; both target offers add-child-now-or-later; `router.replace` on landing; profiles cache invalidated post-save via predicate (`queryKey[0] === 'profiles'`), not by bare `['profiles']`; partial-failure recovery (AC 9): parent succeeds + child fails → parent kept, retryable child error surfaced, no rollback.
- `profile.test.ts` — `isFamilyCapableProfile(activeProfile, profiles)` against under-18 owner with linked non-owner, adult owner with linked non-owner profile (capable), adult owner with no linked non-owner profiles (not capable), non-owner active profile, `activeProfile = null`. No archive-state branch (out of scope for v0; v1 contract change).
- `sign-out-cleanup.test.ts` — `mentomate_preview_intent` key is cleared on sign-out.

### E2E Smoke (Maestro / Playwright)

- Self learner: intent Me → topic → value-prop → signup → save (self) → first real session.
- Parent: intent My child → value-prop → signup → save (child) → parent home.
- Both child-first: intent Both → child-first → parent value-prop → signup → save (both, child first) → parent home.
- Solo owner lands as learner: signup → save (self) → owner exists, no children → learner home.
- Expired state: seed expired SecureStore key → signup → intent screen reshown.
- Save target overrides intent: pick child pre-signup → wizard picks self → only owner profile created.

### Out Of Scope For v0 Tests

- Preview LLM endpoint tests (no endpoint).
- Claim/import idempotency tests (no claim).
- Public-route rate-limit tests (no public routes).

## Upgrade Path To v1

When v0 ships and signup-conversion measurement warrants it, v1 layers in:

- `apps/api/src/routes/preview-onboarding.ts` + service + schemas (live LLM preview).
- Auth middleware `PUBLIC_PATHS` for `start` and `messages` endpoints.
- Rate limiting by hashed device ID + IP fallback.
- Preview transcript storage + 24-hour TTL.
- Claim/import endpoint with idempotency.
- Session style and session length preferences in the wizard.
- Parent Home clarity pass (still optional, gated on usability findings).

Every v0 surface — intent screen, value-prop variants, save wizard, profile sequencing, solo-learner landing rule, capability helper, sign-out cleanup — survives the upgrade. v1 inserts the preview-lesson chat between the value-prop screen and signup, and replaces "first real session immediately after save" with "imported real session built on preview transcript."

## Sibling Spec Coordination

The Study/Family v0 spec (`2026-05-19-study-and-family-mode-navigation-v0.md`) depends on `isFamilyCapableProfile`. Both v0 specs add the helper to the same file. **Ship trial v0 first** so the helper exists when Study/Family v0 starts, and the post-signup profile shape is already correct when the AppContextProvider derives its initial mode.

Concrete dependency:

- Trial v0 owns `isFamilyCapableProfile(activeProfile, profiles)` in `apps/mobile/src/lib/profile.ts`. Signature, behavior, and **the deliberate omission of any archive check** are shared verbatim with the Study/Family v0 spec — neither spec may diverge without amending both. Archived-state handling is v1's contract change because `profileSchema` has no `archivedAt` field today.
- Study/Family v0 imports and uses the helper; no duplicate implementation.
- Both specs share the rule that "owner with zero linked non-owner profiles → solo learner / Study mode default."

## Notes

- The "Trial" word appears only as visible UI chrome ("Try MentoMate"). Internal code, route names, schema fields, and analytics events use "preview" to avoid coupling with `services/trial.ts` billing state. The spec filename and slug retain "trial" for continuity with the v1 upgrade-path doc, but every implementation artifact (route names, state module, SecureStore key, feature-flag name) uses "preview." Greps for the billing-trial code path should land on `services/trial.ts`, not here.
- v0 deliberately ships no Parent Home changes. If parent-intent users still find parent home overwhelming after the routing fix, run the v1 Phase 4 clarity pass as a separate, focused PR.
- Sample copy on value-prop screens should be reviewed by product before ship; sample claims must not imply a real child is being analyzed pre-account-creation (`feedback_positive_framing_no_struggle.md` applies even to sample data).
- v0 success criteria are routing correctness (right audience lands on right surface) before conversion-rate optimization. Plan to revisit this spec once signup traffic exists.
