# [BUG] IS_E2E_BUILD gate omits the __DEV__ guard its sibling screen uses

**File:** [`apps/mobile/src/app/dev-only/seed-pending-redirect.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/dev-only/seed-pending-redirect.tsx#L38-L40) (lines 38, 39, 40)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-gating-inconsistency`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

seed-pending-redirect.tsx defines `IS_E2E_BUILD = process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'` (L38-40), but the sibling seed-preview-state.tsx defines it as `__DEV__ && process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'` (L21-24). The two dev-only seed screens therefore use different activation gates. This is NOT a production-exploitable vulnerability: metro.config.js (L37-40,66) strips the entire dev-only/ directory from any bundle built without EXPO_PUBLIC_E2E=true, so a production app-bundle contains neither file, and a standard release build also sets NODE_ENV=production. The practical consequence is functional/test-integrity: in a release-configuration E2E APK (e.g. the eas.json `preview` profile — buildType apk, no developmentClient, so __DEV__=false — with EXPO_PUBLIC_E2E=true injected by CI), seed-preview-state silently becomes inert (renders <Redirect href='/(app)/home'>) while seed-pending-redirect stays active. The preview-onboarding TTL Maestro flow that depends on seed-preview-state would then no-op (and could pass vacuously) on exactly the build shape where the redirect-TTL flow still works. Whichever gate is canonical, the two siblings should match; per the repo's 'Sweep when you fix' rule, divergent sibling gates read as 'the team's preferred way' to the next contributor.

## Recommendation

Align the two gates. If __DEV__ is part of the intended defense (it is the stricter gate and matches seed-preview-state), add `__DEV__ &&` to seed-pending-redirect's IS_E2E_BUILD. If E2E APKs are intended to run in release mode (__DEV__=false), remove __DEV__ from seed-preview-state instead and rely on the EXPO_PUBLIC_E2E build-strip + NODE_ENV runtime gate. Either way, extract a single shared `IS_E2E_BUILD` constant (e.g. in a dev-only helper) so the two screens cannot drift again.

## Revalidation

**Verdict:** true-positive

The divergence is real and verified. seed-pending-redirect.tsx defines IS_E2E_BUILD = `process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'` (lines 38-40), while sibling seed-preview-state.tsx defines it as `__DEV__ && process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'` (lines 21-24) — two implementations of the same dev-only-seed gate, one strictly stronger than the other. The finding's NOT-production-exploitable analysis checks out: metro.config.js (lines 37-40, 66) blocks the entire `apps/mobile/src/app/dev-only/` segment from the bundle whenever EXPO_PUBLIC_E2E !== 'true', so a normal production app-bundle (eas.json `production` profile) contains neither file, and a release build sets NODE_ENV=production which also neutralizes the runtime gate. The residual is functional/test-integrity in a release-shaped E2E APK (eas.json `preview` profile: android.buildType=apk, no developmentClient → __DEV__=false) built with EXPO_PUBLIC_E2E=true: there seed-preview-state's `__DEV__ &&` short-circuits it inert while seed-pending-redirect uses the looser gate. The one weak link in the finding's manifestation is that whether seed-pending-redirect 'stays active' there depends on the build's NODE_ENV (if the release E2E build also sets NODE_ENV=production, both go inert) — I can't resolve that statically. But the finding's core, verifiable assertion — the two sibling gates diverge and should be unified — is correct and actionable regardless, and it is a non-security BUG-severity consistency issue, so true-positive stands.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
