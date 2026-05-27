---
title: Pre-Auth Welcome Flow - Implementation Plan
date: 2026-05-27
profile: ui
status: draft
spec: docs/specs/2026-05-18-trial-intent-save-onboarding.md
---

# Pre-Auth Welcome Flow - Implementation Plan

**Goal:** Show the product promise before the sign-in wall, using the existing welcome cards plus a LightBulb bridge, while keeping the current preview demo code available for future reuse.

**Approach:** Move the welcome intro decision from signed-in user scope to first-open device scope, then route new users from the cards to a simple LightBulb CTA screen and into the existing auth/profile setup. This is a narrow first step: it changes the front door and copy, not the app's account model, profile model, or guest-access behavior.

## Scope

In scope:
- `apps/mobile/src/app/index.tsx`
- `apps/mobile/src/app/(auth)/welcome.tsx` (new signed-out welcome + LightBulb bridge route)
- `apps/mobile/src/app/(auth)/welcome.test.tsx` (new focused route test)
- `apps/mobile/src/app/(auth)/_layout.tsx`
- `apps/mobile/src/app/(auth)/sign-in.tsx`
- `apps/mobile/src/app/(auth)/sign-in.test.tsx`
- `apps/mobile/src/components/welcome/WelcomeIntro.tsx`
- `apps/mobile/src/components/welcome/WelcomeIntro.test.tsx`
- `apps/mobile/src/lib/intro-state.ts`
- `apps/mobile/src/lib/intro-state.test.ts`
- `apps/mobile/src/app/(app)/welcome.tsx`
- `apps/mobile/src/app/(app)/_layout.tsx`
- `apps/mobile/src/app/(app)/_layout.test.tsx`
- `apps/mobile/src/lib/feature-flags.ts`
- `apps/mobile/src/lib/sign-out-cleanup.ts`
- `apps/mobile/src/i18n/locales/*.json`
- Existing welcome-intro tests and focused auth-layout routing tests

Out of scope:
- No anonymous profiles.
- No guest-mode tab shell.
- No temporary subjects, quizzes, progress, or notes before signup.
- No deletion of `apps/mobile/src/app/preview/*` or save-wizard code.
- No backend/API/schema changes.
- No billing or free-question entitlement changes.
- No consolidation of `SaveWizardGate` and `CreateProfileGate` in this pass.

## Product Decisions

- The signup wall remains before real app access.
- The wall should be framed as memory and continuity: create a free account so the mentor remembers subjects, notes, and progress.
- The current pre-signup demo is preserved as code, but removed from the main visible front door for now.
- The welcome intro becomes a pre-auth first-open experience, not a post-auth post-signup gate.
- The seen-state becomes device-scoped for this intro version, because Clerk `userId` does not exist before auth.
- The UX consequence is accepted for v1: on a shared device, only the first signed-out first-open user sees the welcome cards. A second user signing up later on the same device goes straight to auth.
- If a valid old preview state exists, that preview handoff wins over the new welcome cards. Treat the preview as an equivalent pre-auth product explanation and send the user to auth so the existing SaveWizard handoff can complete.
- The preview entry CTA flag is only meaningful when the preview engine flag is also enabled. The visible CTA must be gated by both flags.
- The first iteration remains one unified flow for all users. No parent/self branching before auth.
- The pre-auth LightBulb bridge owns the line `Turn "I don't get it" into "I've got this."` The post-auth `CreateProfileGate` must get distinct setup copy so new users do not see the same LightBulb promise twice.

## Proposed First-Open Order

```text
First app open
-> 4-card welcome intro
-> LightBulb bridge: "Turn 'I don't get it' into 'I've got this.'"
-> Existing sign up / sign in
-> Existing profile creation with distinct setup copy
-> Existing pronouns and language setup
-> App home
```

## Welcome Card Copy

Design direction:
- The cards should feel like small glimpses of the app, not marketing slides.
- Each card should show a tiny product scene above the headline/copy.
- The approved visual references are `docs/mockups/pre-auth-welcome-cards-1-2.svg` and `docs/mockups/pre-auth-welcome-cards-3-4.svg`.
- Use app-like panels, chat bubbles, subject tiles, notes, bookmarks, progress, and method chips instead of abstract standalone icons.
- Production implementation should render these scenes with semantic classes/theme colors from the existing theme system, not hardcoded hex values.
- Keep a stable scene slot above the copy so card-to-card swipes do not shift headline/body placement.
- The old positional `CARD_ICONS` set should no longer be the primary visual. If icons remain as small accents or fallbacks, use: card 1 `chatbubbles-outline`, card 2 `albums-outline`, card 3 `time-outline`, card 4 `school-outline`.

Card 1:
- Headline: `A mentor you can talk to`
- Supporting: `Ask when you are stuck, explain what you do not get, and get help that adapts to how you learn.`
- Visual: a compact mentor-chat scene with a learner message like `I do not get this yet.` and a mentor response like `Let's slow it down. What part feels confusing?`

Card 2:
- Headline: `All your study in one place`
- Supporting: `Study as many subjects as you need, get help with assignments, save notes, and bookmark what matters.`
- Visual: a compact study-space scene with subject tiles and small `Notes`, `Bookmarks`, and `Quiz` chips.

Card 3:
- Headline: `Picks up where you left off`
- Supporting: `Your mentor remembers your progress, adapts to your pace, and helps with quick bursts or steady routines.`
- Visual: a compact continuity scene with `Last time`, `Next`, and `Pace` rows.

Card 4:
- Headline: `Built for real learning`
- Supporting: `Clear explanations, guided questions, and practice that sticks help you think, practice, and remember.`
- Visual: compact method chips such as `Clear explanation`, `Think it through`, `Practice in context`, and `Remember it later`; do not over-explain "Socratic" or "four strands" on the card.

LightBulb bridge:
- Headline: `Turn "I don't get it" into "I've got this."`
- Supporting: `Create a free account so your mentor can remember your subjects, notes, and progress.`
- Primary CTA: `Create free account`
- Secondary CTA: `I already have an account`

Post-auth profile gate replacement copy:
- Headline: `Let's set up your mentor`
- Supporting: `Tell us who is learning so help starts at the right level.`
- CTA can remain `Begin`.

## Post-Auth Intro Artifact Decisions

- `apps/mobile/src/app/(app)/welcome.tsx`: delete or convert to a test-only redirect during this implementation. Preferred: delete once the pre-auth route exists and tests are updated.
- `apps/mobile/src/app/(app)/_layout.tsx`: remove the post-auth welcome gate and remove `welcome` from the authenticated hidden/full-screen route lists if the route is deleted.
- `apps/mobile/src/lib/intro-state.ts`: replace the user-scoped `intro_seen_v1_<userId>` helpers with device-scoped pre-auth helpers, or keep user-scoped helpers only if a temporary compatibility test still imports them. Do not leave unused user-scoped exports indefinitely.
- `apps/mobile/src/lib/sign-out-cleanup.ts`: remove or update the old comment/call path for `clearIntroSeen(userId)` because the new pre-auth seen-state intentionally survives sign-out.
- Existing `intro_seen_v1_<userId>` SecureStore keys: leave in place as harmless stale state. SecureStore has no list-keys API and these keys are not security-sensitive.
- Existing preview demo and save wizard code: keep. They are not the main front door, but they remain available for later reuse.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| SecureStore read fails while deciding first-open welcome | Device key read throws or times out in `index.tsx` | Existing loading state briefly, then sign-in rather than a blank screen | Fail open to sign-in and record a breadcrumb/metric; never trap the user before auth. |
| SecureStore write fails when marking pre-auth intro seen | Disk/Keychain write failure on the bridge CTA | User continues to sign-up/sign-in; intro may reappear on next cold open | Set an in-memory flag synchronously and emit `intro_securestore_write_failed` or a renamed pre-auth equivalent. |
| User backs out from LightBulb bridge | Android hardware back or navigation back from bridge step | Card 4, not sign-in and not app exit | Keep cards and bridge in one signed-out route state machine; back from bridge returns to the final card. |
| Second user signs up on a shared device | Device-scoped seen flag already exists from a previous user | Sign-in/sign-up wall directly; no welcome cards | Accepted for v1. Future option: add "See intro again" under More or reset intro from sign-out, but do not add a post-auth duplicate now. |
| Valid old preview state exists during first open | User tried the old preview within the 1h TTL before this change | Sign-in/sign-up directly, then existing SaveWizard handoff after auth | Preview-state wins in `index.tsx`. Mark the device intro seen before routing to auth because preview counts as the equivalent pre-auth product explanation. |
| Stale old user-scoped intro key exists | Existing install has `intro_seen_v1_<userId>` from the old post-auth intro | No visible effect | Leave old key untouched; new device-scoped key controls the new flow. |
| Signed-in existing user opens app | Auth already loaded and signed in | Existing app home | `index.tsx` sends signed-in users to `/(app)/home`; pre-auth welcome never runs for signed-in users. |
| Preview CTA hidden but route remains | User has a deep link to `/preview` or developer opens it directly | Existing preview route still works if reachable, even on a first-open device | Intentional preservation. `/preview` deep links bypass the welcome intro on purpose; only the main sign-in CTA is hidden by a narrow entry flag. |

## Tasks

- [ ] T1: Update welcome card copy, locales, and app-scene visuals - done when: all 7 locale files contain updated `welcomeIntro.card{1-4}` strings, `WelcomeIntro.tsx` renders product-scene visuals matching the two mockup files instead of generic standalone icons, and `WelcomeIntro.test.tsx` asserts the updated copy appears in order. Norwegian (`nb.json`) must be updated with real Norwegian copy; `de/es/ja/pl/pt` receive the new English strings as intentional placeholders so no locale retains the old card text.

- [ ] T2: Add a pre-auth intro seen-state - done when: `intro-state.ts` supports a device-scoped key for the pre-auth welcome sequence and `intro-state.test.ts` has a `describe('pre-auth intro state')` block covering key shape, seen, unseen, write failure, and synchronous in-memory fallback. Include the race regression: after marking the intro seen in memory, remounting the pre-auth welcome/index path must not show cards again even if the SecureStore write has not resolved. User-scoped helpers are removed unless still used by a temporary migration test.

- [ ] T3: Wire first-open routing from the root entry point - done when: `apps/mobile/src/app/index.tsx` checks signed-out device intro state and `getPreviewState()` before the sign-in redirect, a signed-out first-open user reaches `/(auth)/welcome`, a returning signed-out user with the seen flag reaches `/(auth)/sign-in`, signed-in users still route directly to `/(app)/home`, and preview-state present routes to `/(auth)/sign-in` while marking the device intro seen because preview counts as the equivalent pre-auth product explanation.

- [ ] T4: Add the signed-out welcome + LightBulb bridge route - done when: `apps/mobile/src/app/(auth)/welcome.tsx` shows the four cards, tapping the final welcome CTA shows the LightBulb bridge, `Create free account` marks the device intro seen and routes to signup, `I already have an account` marks the device intro seen and routes to sign-in, and back from the bridge returns to card 4.

- [ ] T5: Assign distinct copy to the post-auth profile gate - done when: `tabs.createProfile.welcome` no longer says `Turn "I don't get it" into "I've got this."`, the profile gate uses the setup-focused copy above, and a new user no longer sees the same LightBulb promise before and after signup.

- [ ] T6: Decommission the post-auth welcome gate and artifacts - done when: the authenticated `(app)` layout no longer probes/routes to the post-auth welcome intro, `apps/mobile/src/app/(app)/welcome.tsx` is deleted or intentionally converted with a written reason, old user-scoped intro tests are removed/rewritten for device scope, and `sign-out-cleanup.ts` no longer references clearing a per-user intro flag.

- [ ] T7: Hide the current `Try MentoMate` main entry point without deleting demo code - done when: `feature-flags.ts` exposes a narrow `PREVIEW_ENTRY_CTA_ENABLED` or equivalent flag distinct from `PREVIEW_ONBOARDING_ENABLED`, the sign-in CTA renders only when `PREVIEW_ONBOARDING_ENABLED && PREVIEW_ENTRY_CTA_ENABLED`, the default has `try-mentomate-cta` hidden, `/preview/*` files remain untouched, and the SaveWizard/preview handoff remains enabled. Add sign-in tests for all meaningful flag combinations, including engine off + CTA on -> CTA hidden.

- [ ] T8: Verify routing order, stale preview state, and loop safety - done when: focused tests cover first install -> welcome -> LightBulb -> auth, returning signed-out user -> auth, signed-in existing user -> app, preview-state present + device intro unseen -> preview handoff wins/sign-in and marks device intro seen, direct `/preview` on a first-open device bypasses welcome by design, and deleted post-auth welcome paths are not referenced by app routes.

- [ ] T9: Run focused validation - done when: the mobile welcome/sign-in/root-index/auth-layout Jest tests pass and a quick manual or web preview check confirms the first-open sequence is visually coherent on a small phone viewport.

## Verification Commands

```bash
cd apps/mobile && pnpm exec jest src/components/welcome/WelcomeIntro.test.tsx src/lib/intro-state.test.ts src/app/index.test.tsx src/app/\(auth\)/welcome.test.tsx src/app/\(auth\)/sign-in.test.tsx src/app/\(app\)/_layout.test.tsx --no-coverage
```

If shell escaping is awkward on Windows PowerShell, run the same tests one file at a time:

```bash
cd apps/mobile && pnpm exec jest src/components/welcome/WelcomeIntro.test.tsx --no-coverage
cd apps/mobile && pnpm exec jest src/lib/intro-state.test.ts --no-coverage
cd apps/mobile && pnpm exec jest src/app/index.test.tsx --no-coverage
cd apps/mobile && pnpm exec jest "src/app/(auth)/welcome.test.tsx" --no-coverage
cd apps/mobile && pnpm exec jest "src/app/(auth)/sign-in.test.tsx" --no-coverage
cd apps/mobile && pnpm exec jest "src/app/(app)/_layout.test.tsx" --no-coverage
```

## Rollback

No data migration is involved. Roll back by removing the pre-auth gate and LightBulb bridge routing, restoring the sign-in screen as the first signed-out surface, and leaving any device-scoped intro SecureStore key in place as harmless stale state.

## Notes

- This plan intentionally preserves the existing pre-signup preview code. The demo is not the main front door in this direction, but it remains available as source material for a future smaller sample lesson.
- The current post-auth welcome intro was shipped on 2026-05-25 and is documented in `docs/_archive/specs/Done/2026-05-25-welcome-intro.md`; use that file for routing-race context when moving the intro earlier.
