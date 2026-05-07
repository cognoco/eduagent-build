# Slice 1 PR 5c — Default `ONBOARDING_FAST_PATH` On In Production

**Date:** 2026-05-06
**Status:** Shipped
**Branch:** `app-ev` (next on top of 5a/5b/5g)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § A and Slice 1 row 5c
**Wave:** Wave 2 (parallel-safe with 5e, 5i)
**Size:** XS

---

## Goal (from audit)

> The "bypass preference screens" portion is partly built. Production users currently hit the long path. Slice 1 is "delete what teach-first and fast path were supposed to replace, and turn the bypass on by default."

This PR turns the bypass on by default in production. It does **not** delete any screens (5h does that, Wave 4) and does **not** change any routing logic (5e does that, Wave 2 in parallel). It is a one-condition flip in the feature-flag default.

## Acceptance

- `FEATURE_FLAGS.ONBOARDING_FAST_PATH` evaluates to `true` in production builds unless `EXPO_PUBLIC_ONBOARDING_FAST_PATH` is explicitly set to `'false'`.
- Override semantics: `EXPO_PUBLIC_ONBOARDING_FAST_PATH=false` forces off in any environment; `=true` is permitted but is a no-op against the new default.
- No regressions for dev/staging — both still default on.
- Unit test added that **exercises the production branch** by forcing `process.env.NODE_ENV = 'production'` (otherwise Jest's `NODE_ENV='test'` makes the unset case `true` under both BEFORE and AFTER, and the test catches no regression).

---

## Current state (verified 2026-05-06)

`apps/mobile/src/lib/feature-flags.ts:1-17`

```ts
ONBOARDING_FAST_PATH:
  process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH === 'true' ||
  (process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH !== 'false' &&
    process.env.NODE_ENV !== 'production'),
```

Truth table today:

| `EXPO_PUBLIC_ONBOARDING_FAST_PATH` | `NODE_ENV === 'production'` | Result |
| --- | --- | --- |
| `'true'` | any | `true` |
| `'false'` | any | `false` |
| unset / other | `true` | **`false`** ← the production default this PR flips |
| unset / other | `false` | `true` |

Mobile files referencing the flag:

- `apps/mobile/src/lib/feature-flags.ts`
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`
- `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx`
- `apps/mobile/src/app/(app)/onboarding/interview.tsx`
- `apps/mobile/src/app/(app)/onboarding/interview.test.tsx`

The flag is only consumed by the two onboarding screens, so a default flip cannot leak into unrelated mobile code paths.

**API-side note (independent surface).** `apps/api/src/config.ts:89` declares its own `ONBOARDING_FAST_PATH` env var and `:128` exports `isOnboardingFastPathEnabled(value)`. Verified this session: `isOnboardingFastPathEnabled` has **zero callers** anywhere in `apps/api/**` — it is dead code. Real server-side gating is per-session, via `metadata.onboardingFastPath` populated by the client at session creation (`services/session/session-crud.ts:361`, read by `services/session/session-exchange.ts:1002-1008`). The mobile flip is therefore independent of any server flag; no API change is required, and the unused helper is out of scope here (candidate for deletion in a later cleanup PR).

---

## Files to change

- `apps/mobile/src/lib/feature-flags.ts` — flip the default condition.
- `apps/mobile/src/lib/feature-flags.test.ts` — add or update test asserting prod default = `true` (verify file exists; if it doesn't, create one — the file currently has no co-located test).

---

## Implementation steps

1. **Replace the conditional** in `feature-flags.ts`:

   ```ts
   // Before
   ONBOARDING_FAST_PATH:
     process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH === 'true' ||
     (process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH !== 'false' &&
       process.env.NODE_ENV !== 'production'),

   // After
   ONBOARDING_FAST_PATH:
     process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH === 'true' ||
     process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH !== 'false',
   ```

   This makes the default `true` everywhere; only an explicit `'false'` opts out.

2. **Update the comment block** above the flag to reflect the new contract: "Defaults to true everywhere. Set `EXPO_PUBLIC_ONBOARDING_FAST_PATH=false` to disable in any environment. (Build-time only — Doppler config change takes effect on next OTA update or native build, not immediately on live users.)"

3. **Add a test** (`feature-flags.test.ts` — create, does not exist). `FEATURE_FLAGS` is evaluated once at module load time, so each env-combination case must force a fresh module evaluation via `jest.resetModules()`. **Critically, at least one case must force `process.env.NODE_ENV = 'production'`** — Jest defaults to `NODE_ENV='test'`, under which the unset-var case evaluates to `true` for both the BEFORE and AFTER expressions, so a test that doesn't enter the production branch catches zero regressions if the `NODE_ENV !== 'production'` clause is reintroduced. Pattern:

   ```ts
   describe('FEATURE_FLAGS.ONBOARDING_FAST_PATH', () => {
     const ORIG_VAR = process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
     const ORIG_NODE_ENV = process.env.NODE_ENV;

     afterEach(() => {
       jest.resetModules();
       if (ORIG_VAR === undefined) {
         delete process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
       } else {
         process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = ORIG_VAR;
       }
       process.env.NODE_ENV = ORIG_NODE_ENV;
     });

     // Regression guard: this is the case the PR exists to flip.
     // Red under the BEFORE expression, green under the AFTER expression.
     it('defaults to true in production builds when env var is unset', () => {
       delete process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
       process.env.NODE_ENV = 'production';
       jest.resetModules();
       const { FEATURE_FLAGS } = require('./feature-flags') as typeof import('./feature-flags');
       expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(true);
     });

     it('is false when env var is explicitly "false", even in production', () => {
       process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = 'false';
       process.env.NODE_ENV = 'production';
       jest.resetModules();
       const { FEATURE_FLAGS } = require('./feature-flags') as typeof import('./feature-flags');
       expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(false);
     });

     it('is true when env var is explicitly "true"', () => {
       process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = 'true';
       jest.resetModules();
       const { FEATURE_FLAGS } = require('./feature-flags') as typeof import('./feature-flags');
       expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(true);
     });
   });
   ```

   **Verify the regression guard before committing**: temporarily revert step 1 (restore the `&& process.env.NODE_ENV !== 'production'` clause), re-run the suite, and confirm the "defaults to true in production builds" case fails. Then restore the AFTER expression and confirm it passes. This is the red-green check from `feedback_fix_verification_rules.md`.

4. **Audit existing screen tests** — `interview.test.tsx` and `language-setup.test.tsx` both use `jest.mock('../../../lib/feature-flags', ...)` to replace the entire module with a plain mutable object, and reset `FEATURE_FLAGS.ONBOARDING_FAST_PATH = false` in `beforeEach` (interview.test.tsx:134, language-setup.test.tsx:156). Because the real module is never loaded by these test files, env-var changes have no effect on them — they are already correctly isolated. **No changes are needed to either test file.** Confirm with: `grep -n 'ONBOARDING_FAST_PATH' apps/mobile/src/app/\(app\)/onboarding/interview.test.tsx apps/mobile/src/app/\(app\)/onboarding/language-setup.test.tsx`

---

## Out of scope (other PRs)

- Removing the long-path routing branch in `interview.tsx`. PR 5e owns that.
- Deleting the four preference screens. PR 5h owns that (Wave 4).
- Removing the flag entirely. PR 5h removes it as part of the deletion sweep — until then, the flag is the safety valve for an emergency rollback.

---

## Verification

- Confirm mobile flag references match the listed files before committing: `grep -r 'ONBOARDING_FAST_PATH' apps/mobile/src --include='*.ts' --include='*.tsx' -l`
- Confirm repo-wide references are accounted for (mobile sources above + the dead `apps/api/src/config.ts` declaration + e2e flow + plan/spec docs): `grep -rn 'ONBOARDING_FAST_PATH' --include='*.ts' --include='*.tsx' --include='*.yaml'`
- **Doppler `prd` config:** confirm `EXPO_PUBLIC_ONBOARDING_FAST_PATH` is **unset** (or absent). A stale `=false` from earlier kill-switch testing would silently neutralize this PR. If it exists, delete it before merging.
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/feature-flags.ts --no-coverage`
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/onboarding/interview.tsx src/app/(app)/onboarding/language-setup.tsx --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `pnpm exec nx lint mobile`

---

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Subject creation (entry to fast path) fails | `createSubject` 4xx/5xx, network | Existing create-subject error UI (pre-fast-path; unchanged by this PR) | Retry from create-subject screen |
| `language-setup.tsx` fast-path: `startFirstCurriculumSession.mutateAsync` fails | API error / quota / network | Error banner (`setError(formatApiError(err))`) + "Try Again" + "Cancel" buttons | Retry or cancel back to Home — no dead end |
| `interview.tsx` fast-path: `transitionToSession` fails (non-language subject) | API error / network | Session-creation-stuck UI: "Setting up…" → 20s timeout → "Try Again" + "Go Back" | Retry or navigate Home |
| User is mid-onboarding when OTA lands | OTA applies on next cold start, not mid-session | User finishes old bundle's flow normally | No action — OTA only activates on app reopen |
| User who completed onboarding under old bundle adds a *second* subject under new bundle | Routing flips to fast path on the new subject's flow | Fast-path UX for the new subject | No cross-subject state leak: onboarding routing inputs (`subjectId`, `languageCode`, `extractedSignals`) are scoped per-subject; long-path screens wrote no global preference state the fast path reads |

## Risk and rollback

- **Blast radius:** medium. Production users who previously walked the four-screen chain skip it after this lands. If 5e has not yet shipped routing simplification (likely — these can land in either order; both are Wave 2), the long-path code still exists but is unreachable from prod. That is the point.
- **Rollback:** two options.
  1. **Code revert (preferred):** revert this PR's commit on `app-ev`, then OTA per the standard channel (see `feedback_ota_env_vars.md` — manual OTA must explicitly source target env vars; do not assume Doppler propagates by itself). ETA ~5 min once the revert lands.
  2. **Env kill-switch:** set `EXPO_PUBLIC_ONBOARDING_FAST_PATH=false` in Doppler `prd`, then run `pnpm env:sync` followed by `eas update --branch production --message "kill-switch ONBOARDING_FAST_PATH"` (or the equivalent channel command in use at the time). The Doppler change alone is **not** sufficient — `EXPO_PUBLIC_*` variables are inlined into the JS bundle at OTA build time and only reach live users after the new bundle ships. Verify with a fresh install on a test device before declaring rollback complete.
- **What this PR does NOT prove:** that the bypass UX is good. PR 5f's Wave 3 E2E covers that.

---

## Why this is XS

One conditional flip + one test. No new types, no new components, no migration. The audit calls it XS deliberately because the heavy lifting (fast-path code) shipped under TF-1..TF-8 and has been in prod-disabled state since.
