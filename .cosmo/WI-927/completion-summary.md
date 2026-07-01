**What was done:**
Reviewed and verified WI-927 (Assertion-free test: CelestialCelebration animated path) on branch `WI-927` at commit `c8918d2110ad096dd3b25d03ad61990739e12447`.

**What changed:**
The local Reanimated mock in `apps/mobile/src/components/common/celebrations/CelestialCelebration.test.tsx` now invokes the optional `withTiming` callback with `finished=true`, allowing the animated completion path to exercise `runOnJS(onComplete)()`. The prior assertion-free animated-path test was replaced with an assertion that `onComplete` is called exactly once through that animated path.

**Verification:**
Coordinator reran `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --no-coverage apps/mobile/src/components/common/celebrations/CelestialCelebration.test.tsx`; it passed 1 suite / 14 tests. The run emitted the existing `baseline-browser-mapping` age warning only.

**Caveats / Follow-ups:**
No follow-up is required for this item. The correct verified test path includes the `common` segment: `apps/mobile/src/components/common/celebrations/CelestialCelebration.test.tsx`.
