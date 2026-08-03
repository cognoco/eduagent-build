# WI-2900 red/green evidence

## Red

Against the pre-fix policy, a current-session validated learner-only cache survived TanStack retry exhaustion, but `ProfileProvider` copied the background `NetworkError` directly into `profileLoadError`. The learner navigator therefore took the hard-error path instead of remaining usable with a degraded retry signal.

## Green

- `apps/mobile/src/lib/profile.test.tsx`: full suite green, including the transient/non-transient, first-load, learner, owner/family, proxy, empty-authority, and recovery matrix.
- `apps/mobile/src/hooks/use-profiles.test.ts`: 14/14 green, including five-attempt transport retry exhaustion and successful recovery.
- `apps/mobile/src/app/(app)/_layout.test.tsx`: 148/148 assertions green through the canonical mobile Jest force-exit posture, including the mounted navigator, visible warning, and retry action.
- Affected-file ESLint and Prettier: green.
- `pnpm exec tsc --build apps/mobile/tsconfig.json --pretty false`: green.
