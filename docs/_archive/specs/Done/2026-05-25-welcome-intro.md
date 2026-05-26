# Spec: First-Launch Welcome Intro

**Status**: Shipped 2026-05-25 (commits `2434dd6fa`, `4cba67f9d`, `10c62b236`, `9cfc90351`). Gap 2 closed 2026-05-26 (4 jest scenarios added to `_layout.test.tsx`). Gap 1 (non-English locale values) remains, deferred — see "Known Gaps (Post-Ship)" at end of doc.
**Owner**: TBD
**Date**: 2026-05-25
**Related**: None — ships standalone. (Original draft had a pair-ship constraint with a home "artifact strip" spec; that spec was dropped after review confirmed the existing My Notes entry point on home is sufficient. See "Pair-Ship Removed" below.)
**Background**: Audit of onboarding + first-session UX (2026-05-25) found the product's wedge (notebook, memory, recaps, parent loop) is built in the architecture but invisible in the first 5 minutes, making the product psychologically indistinguishable from ChatGPT/Photomath/Khanmigo at first impression.

## Problem

A new user's first 5 minutes show no signal that the product differs from a generic AI chat. Existing onboarding (`apps/mobile/src/app/(app)/onboarding/`) is purely utility (pronouns, language CEFR setup) and never communicates the product's longitudinal-study-companion positioning. Users compare us to ChatGPT Plus at $20 and see no felt premium.

## Goal

Establish the product is a longitudinal study companion in the first 60 seconds after auth, before any utility onboarding (create-profile, pronouns, language-setup, consent). Four-card swipe intro, no skip, "Let's start" CTA on the final card.

## Non-Goals

- Not a tour or tutorial. Four cards, no more.
- No parent/learner variant in v1 — unified copy.
- No what's-new flow for existing users.
- No A/B test infrastructure in v1; track completion metrics only.

## Pair-Ship Removed — Existing Surfaces Are Sufficient

**Welcome intro ships standalone.** Every promise the four cards make already has a visible surface today:

| Card | Promise | Existing surface | Verified at |
|---|---|---|---|
| 1 | "Your notebook fills up as you learn" | Top-right "My Notes" icon+label tap-target on learner home | `apps/mobile/src/components/home/LearnerScreen.tsx:495-520` (`testID="home-my-notes"`) |
| 2 | "Recaps and progress save automatically" | Recap surfaces + Progress tab | `apps/mobile/src/app/(app)/progress/index.tsx` |
| 3 | "Your mentor remembers you" | More → Memory | `apps/mobile/src/app/(app)/more/index.tsx:162-164` → `/(app)/mentor-memory` |
| 4 | "Built for families" | Positioning copy — no surface required | n/a |

The original draft proposed a pair-ship constraint with a new home "artifact strip" (`2026-05-25-home-artifact-strip.md`, since deleted). Review found:
- Card 1's home surface already exists (top-right My Notes link, visible in production today).
- Card 3 has its own settled home under More; duplicating it on the learner home creates two surfaces for one artifact.
- Building a parallel artifact-counts endpoint duplicated work that the existing My Notes hub already does.

**Post-launch trigger for revisiting:** if the `home_my_notes` tap-rate from users in their first 7 days post-signup is low (well below `intro_completed`), the top-right placement is too quiet relative to the intro's emphasis. Cheap follow-up: promote the existing `home-my-notes` Pressable visually (e.g. a highlighter accent background — teal/yellow/pink) without changing its destination, testID, or position. No new component, no new spec required.

## Trigger — Routing Order

Mirror the code's existing `[CRITICAL-A3]` ordering guarantee block at `apps/mobile/src/app/(app)/_layout.tsx:2278-2287`, slotting the new welcome gate between SaveWizardGate (existing step 7) and CreateProfileGate (existing step 8):

1. `!isLoaded` → spinner (existing)
2. `!isSignedIn` → Redirect (existing)
3. pendingAuthRedirect spinner (existing — `peekPendingAuthRedirect` / `clearPendingAuthRedirect`)
4. `isProfileLoading` spinner (existing — `ProfileProvider`)
5. `profileLoadError` fallback (existing)
6. preview-probe-loading spinner (existing — `_layout.tsx:2288-2300`)
7. SaveWizardGate branch (existing — `_layout.tsx:2302-2316`; component definition at `_layout.tsx:1093`)
8. **Welcome intro gate (NEW)** — fires if `!hasSeenIntro(clerkUserId)`
9. `!activeProfile` → CreateProfileGate (existing)
10. consent gates → Tabs (existing)

**Welcome must render after step 7 (SaveWizardGate) and before step 9 (CreateProfileGate).** Misplacing it ahead of the preview probe would unmount the SaveWizard during preview/demo flows. Misplacing it after CreateProfileGate would force users through profile creation before the positioning message.

## Storage

- **Key**: `intro_seen_v1_{clerkUserId}` (per Clerk userId, per device — NOT per profile)
- **Mechanism**: SecureStore (async write) + in-memory cache (sync read/write) — see Routing Race below
- **Sanitize**: existing `sanitizeSecureStoreKey()` helper
- **Versioned `_v1`**: lets us force a re-show if we materially reposition the intro later. Not a "what's new" channel.

### Scope decision: per Clerk userId, not per profile

A parent who sees welcome then creates a child profile: child profile uses same Clerk userId, intro is skipped for child. This is acceptable because:
- Intro language is generic ("you"), works for both audiences
- Card 4 "Built for families" reads correctly to the parent regardless of which profile is active
- Children are managed by parents; the parent already saw the family-product positioning

## Routing Race — In-Memory + SecureStore

SecureStore writes are async. If welcome writes the flag then calls `router.replace('/(app)/home')` and the layout re-evaluates before the write commits, the layout reads the stale SecureStore value and bounces back to welcome. Fix:

New module `apps/mobile/src/lib/intro-state.ts`:

```ts
import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';
import { Sentry } from './sentry';
import { track } from './analytics';

const inMemoryIntroSeen = new Set<string>();

export function markIntroSeenSync(userId: string): void {
  inMemoryIntroSeen.add(userId);
  const key = sanitizeSecureStoreKey(`intro_seen_v1_${userId}`);
  SecureStore.setItemAsync(key, new Date().toISOString())
    .catch((err) => {
      // Sentry capture + structured metric. Sentry alone is not queryable
      // as a rate (per CLAUDE.md "silent recovery without escalation is
      // banned"). The metric lets us answer "what % of users hit the
      // in-memory-only path?" without scraping exceptions.
      Sentry.captureException(err);
      track('intro_securestore_write_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

export function hasSeenIntro(userId: string, securestoreValue: string | null): boolean {
  return inMemoryIntroSeen.has(userId) || !!securestoreValue;
}

export function clearIntroSeen(userId: string): void {
  inMemoryIntroSeen.delete(userId);
}
```

Welcome screen calls `markIntroSeenSync(userId)` synchronously *before* `router.replace`. Layout's intro-gate check reads in-memory first → no bounce window.

`clearIntroSeen` is called from `signOutWithCleanup` so a sign-in by a different account on the same device doesn't inherit the previous in-memory flag (SecureStore key is userId-scoped, so this is belt-and-suspenders).

## Paint Goal

- 200ms paint target applies **after the `/welcome` route mounts**, not after `(app)/_layout` mounts.
- While the `hasSeenIntro` decision is in flight (SecureStore async read), the existing ClerkGate spinner / AnimatedSplash continues to display. No flash of home before welcome.
- All welcome assets (illustrations, icons) bundled, not network-loaded.

## The Four Cards

Localized via i18n keys in all 7 locales (en/de/es/ja/nb/pl/pt).

| # | Headline | Supporting line | Visual |
|---|---|---|---|
| 1 | **Your notebook fills up as you learn** | Notes and what your mentor remembers about you build a study record you can come back to. | Notebook icon with entries appearing |
| 2 | **Recaps and progress save automatically** | After every session, you'll see what you covered and what's worth revisiting. | Card stack / timeline |
| 3 | **Your mentor remembers you** | Tell it once — your interests, how you learn, what's hard — and it carries that forward. | Brain / connection-graph icon |
| 4 | **Built for families** | Parents see what their kids worked on and get conversation starters for the week. | Two-silhouette icon |

Final CTA: **"Let's start"** on card 4.

Dark-first using teal primary + lavender secondary per `project_brand_dark_first.md`.

## UX

- Swipe + tap arrows (touch + desktop web + a11y all supported)
- Dot indicator (4 dots, current one filled)
- Per-card button: "Next" on 1–3, **"Let's start"** on 4
- **No skip button** in v1. Revisit only if analytics show real friction.
- Hardware back: cards 2–4 go to previous card; card 1 is a no-op
- a11y: each card `accessibilityLabel` = headline + supporting line; arrows have localized labels; full keyboard navigation on web

## Routing Wiring

New route: `apps/mobile/src/app/(app)/welcome.tsx`.

Added to `FULL_SCREEN_ROUTES` set in `_layout.tsx:75` (alongside `onboarding`, `session`, `homework`, etc.) so tab bar is hidden during the intro.

On final card "Let's start":
1. Capture `redirect` query param if present (from notification deep links — see Failure Modes)
2. Call `markIntroSeenSync(clerkUserId)`
3. `router.replace(redirect ?? '/(app)/home')`

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| SecureStore write fails | Disk full, locked store | In-memory flag still set; intro doesn't re-show this session but will re-show on next cold start | **Best-effort once per device; never trap.** Sentry + `intro_securestore_write_failed` metric. Acceptable for v1; revisit if metric rate is high. |
| SecureStore read fails on layout mount (single corruption event) | Transient read error | Treated as `!hasSeenIntro` → intro re-shows once | At worst user sees intro a second time on the next cold start, then `markIntroSeenSync` writes again successfully. |
| SecureStore persistently corrupted / write-blocked | Disk-level or platform issue affecting every write | Intro re-shows on **every cold start** until SecureStore recovers (in-memory cache is empty per process) | Honest failure mode, not "at worst twice." Acceptable for v1 — rare class, no skip button means a 4-tap loop is the worst case. If `intro_securestore_write_failed` rate climbs, add a fallback channel (e.g. `AsyncStorage` sentinel) before tightening. |
| App killed mid-intro | OS background + kill | Re-opens to intro card 1 | Acceptable — no partial state. |
| Notification deep link arrives during intro | Push tap → app cold-starts to specific route, layout redirects to /welcome | Welcome stashes the deep link as `redirect` query param; final CTA forwards to the stashed route, not home | `/welcome?redirect=<path>` |
| Web user, mouse + keyboard, no touch | Desktop preview at `localhost:8089` | Arrows + keyboard left/right + Enter on CTA all work | Already in UX spec |
| Preview/SaveWizard active | Demo or sandbox flow | Welcome gate is suppressed by the preview probe (step 4 before step 5) | Routing order handles this |
| Returning child with withdrawn consent, same device, intro already seen by parent | Child profile switch | Welcome skipped (account-level flag set), consent gate fires directly | Working as intended per per-userId scope |

## Tests

### Unit (jest)
- Renders 4 cards in order; advances on "Next"
- Writes in-memory + SecureStore on "Let's start"
- Redirects to `home` by default; respects `redirect` query param
- Does NOT re-show when in-memory flag set
- Does NOT re-show when SecureStore flag set (in-memory cleared)
- `clearIntroSeen` called from sign-out path

### Integration
- `(app)/_layout.tsx` routing order: intro fires after preview probe, before CreateProfileGate, before consent
- Sign out user A → sign in user B same device → user B sees intro
- Profile switch within same Clerk userId does NOT re-trigger intro
- Returning child with withdrawn consent: welcome skipped, consent gate fires
- Preview mode active: welcome suppressed
- SecureStore write failure: best-effort behavior, no trap; `intro_securestore_write_failed` metric fires

### Maestro e2e
- Fresh sign-up → land on welcome → swipe through 4 cards → tap "Let's start" → land on home
- Required, not deferred (per `feedback_e2e_never_skip.md`)

### i18n
- All 4 cards have keys present in all 7 locales (en/de/es/ja/nb/pl/pt)

## Analytics

Track via existing `lib/analytics.ts`:
- `intro_started` — fired on welcome mount
- `intro_card_advanced` — fired on each "Next" tap with card index
- `intro_completed` — fired on "Let's start" tap
- `intro_dropped` — derived (intro_started without intro_completed within session)

Lets us detect if real friction appears so we can revisit the no-skip decision.

## Rollback

Reversible. No schema changes, no migrations, no destructive ops.

- To disable: remove the welcome gate from `(app)/_layout.tsx` routing and the route file. SecureStore keys can remain (harmless).
- To force re-show for all users: bump version suffix to `_v2`, which invalidates all existing `intro_seen_v1_*` keys.

## Out of Scope (deferred)

- Parent vs learner copy variants
- A/B test infrastructure
- "What's new" channel for existing users post-launch
- Parent-home contextual banner (separate Phase 2 work)
- Child-profile first-use family-awareness card (separate Phase 2 work)

## Known Gaps (Post-Ship — 2026-05-25 audit)

A spec-vs-code audit after shipping found two gaps. Both are recorded here rather than silently accepted so a future contributor reading the spec sees the same picture as one reading the code.

### Gap 1 — i18n values are English placeholders in non-English locales

**State:** `welcomeIntro.*` keys exist in all 7 locale files, but `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json` carry the English strings verbatim (verified by reading lines 2902-2926 of each file, 2026-05-25). The `WelcomeIntro.test.tsx` "keys present in 7 locales" check passes because keys do exist; values are not translated.

**Impact:** Norwegian and 5 other markets currently see English welcome copy. No runtime breakage (i18next renders the English fallback cleanly), but the localization promise in the "Localized via i18n keys in all 7 locales (en/de/es/ja/nb/pl/pt)" line under "The Four Cards" is not met for values.

**Decision:** Defer to the planned full-app language sweep — translating welcome alone would create voice/terminology drift against the still-untranslated home/recap/memory copy that the cards point at. The English-fallback render is acceptable for pre-launch.

**Trigger to revisit independently:** if a Norway-first launch is set for under ~2 weeks out, carve out `nb.json` for the four welcome cards ahead of the broader sweep. The cards are the literal first 60 seconds of the product.

### Gap 2 — Closed 2026-05-26

**Original state:** Three Integration scenarios listed under "Tests → Integration" had no jest coverage at ship time:

1. `(app)/_layout.tsx` routing order — intro fires after preview probe + SaveWizard, before CreateProfileGate, before consent
2. Returning child with withdrawn consent + intro already seen → welcome skipped, consent gate fires
3. Preview mode active → welcome gate suppressed by the preview-probe branch

The remaining three Integration scenarios were (and remain) covered:
- "Sign out A → sign in B same device → B sees intro" — property of the userId-scoped key shape; covered by `intro-state.test.ts` (`does not leak the in-memory flag across userIds`)
- "Profile switch within same Clerk userId does NOT re-trigger" — property of per-userId-not-per-profile key scope; covered by the key construction tests in `intro-state.test.ts`
- "SecureStore write failure → metric fires, no trap" — `intro-state.test.ts`

**Closure:** Four scenarios added to `apps/mobile/src/app/(app)/_layout.test.tsx` under `describe('AppLayout welcome intro gate — routing order', ...)`:

- Scenario A (2 tests): welcome redirect pre-empts both CreateProfileGate (step 9) and the pending-consent gate (step 10) when intro is unseen
- Scenario B: once SecureStore returns a seen-at timestamp the cascade falls through the intro gate; a `WITHDRAWN`-consent profile renders the `consent-withdrawn-gate`
- Scenario C: preview-probe-present + `!activeProfile` renders `save-wizard-gate` and suppresses the welcome redirect

The original "Why not added now" concern — extending `_layout.test.tsx` would either piggyback on legacy internal mocks or require boy-scouting them — was reassessed: all 7 remaining `gc1-allow` mocks in that file are documented external-boundary stubs (api-client transport, expo-secure-store, expo-notifications, RevenueCat SDK, Sentry SDK, NativeWind, and two `requireActual`-with-targeted-override patterns). None are GC6 burn-down targets, so the new scenarios reuse them without violating CLAUDE.md GC1/GC6.

Maestro `welcome-intro.yaml` continues to cover the happy-path routing end-to-end on a real device.
