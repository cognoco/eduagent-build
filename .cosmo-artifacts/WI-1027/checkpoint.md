# WI-1027 Checkpoint

Stopped for coordinator challenge before any commit or push.

## Work Item

WI-1027 (Upgrade @clerk/clerk-expo to >=2.19.36 -- authorization bypass)

## Cosmo State

- Fetched with `--supervised`: preconditions OK, repo guard OK for Project "MentoMate" -> `cognoco/eduagent-build`.
- Claimed as `codex:batch3-lane-e:WI-1027`.
- Not completed in Cosmo.

## Dependency Investigation

- Current `apps/mobile/package.json` declares `@clerk/clerk-expo` as `^2.19.39`.
- Current `pnpm-lock.yaml` resolves `@clerk/clerk-expo@2.19.39`.
- `pnpm --filter @eduagent/mobile why @clerk/clerk-expo` shows it is a production dependency of `@eduagent/mobile`.
- The same graph resolves `@clerk/clerk-react@5.61.8`, `@clerk/clerk-js@5.125.13`, and `@clerk/shared@3.47.7` through `@clerk/clerk-expo`.
- `pnpm view @clerk/clerk-expo@2.19.36` confirms the stated safe floor exists and depends on `@clerk/clerk-js@^5.125.10`, `@clerk/clerk-react@^5.61.6`, `@clerk/shared@^3.47.5`, and peers compatible with the repo's React 19 / React Native 0.81 / Expo SDK 54 stack.
- `pnpm view @clerk/clerk-expo@2.19.41` also exists, but the npm `latest` dist-tag currently reports `2.19.31` while `latest-v5` reports `2.19.41`, so I did not blindly move to a newer tag.

## Surrounding Code Read

- Read `apps/mobile/src/lib/package-deps-classification.test.ts`.
- It already has a Clerk dependency security floor guard asserting `@clerk/clerk-expo` is at least `2.19.36` and that lockfile Clerk Expo snapshots pull `@clerk/shared` at least `3.47.4`.
- Searched Clerk usage across mobile: auth provider setup lives in `apps/mobile/src/app/_layout.tsx`, token cache import comes from `@clerk/clerk-expo/token-cache`, and Clerk hooks are used broadly in auth, account/security, routing gates, API client, and profile/session hooks.

## Verification Run

- `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/package-deps-classification.test.ts`
  - Result: passed, 9 tests.
- `pnpm audit --audit-level=high --json`
  - Result: exited nonzero due other existing advisories; no actionable Clerk/CVE-2026-42349 remediation evidence was found in the visible output before stop.
- A mobile typecheck command was started in parallel but the user interrupted before I captured a result; no passing claim is made for typecheck.

## Current Diff / Drift

- `apps/mobile/eas.json` was modified by setup/env sync, removing `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` from development and preview env blocks.
- That file is unrelated to the Clerk dependency CVE and should not be part of this WI.
- No package manifest or lockfile changes exist at checkpoint time.

## Assessment

The WI premise appears stale against current `origin/main`: the repo already declares and resolves `@clerk/clerk-expo@2.19.39`, which is above the requested `>=2.19.36` floor. A surgical dependency upgrade may be unnecessary unless the coordinator wants a newer exact target such as `2.19.41` despite the unusual dist-tag state.
