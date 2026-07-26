# WI-2839 red/green verification

## Red

With the new boundary regression present and production still evaluating parent
eligibility from an independent `new Date()`, the focused real-database run failed
exactly at the intended assertion:

- Test: `uses the memoized evaluation instant when the wall clock is one hour later`
- Result: `queuedParents` expected `>= 1`, received `0`
- Receipt: `red-jest.json` (`1 failed`, `0 passed`, `8 skipped`)

Command:

```text
NODE_OPTIONS="-r dotenv/config" DOTENV_CONFIG_PATH=.env.development.local IDENTITY_V2_ENABLED=true pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts --runInBand --forceExit -t "uses the memoized evaluation instant"
```

## Green

After resolving the memoized week window before every timezone-sensitive query
and reusing its `nowUtc`, the same named regression passed (`green-jest.json`).
An independent review then found the pre-existing excluded-parent matcher was
too shallow: a payload containing `reportWeekStart` could evade its nested exact
object comparison. After changing the nested matcher to `objectContaining`, a
deliberate mutation that assigned the skipped parent the matching timezone failed
at the negative assertion and printed that exact queued payload
(`excluded-parent-mutation-red.json`). Restoring the non-matching timezone passed.
The full co-located integration file then passed `9/9`
(`full-integration-jest.json`), and the companion unit file passed `29/29`
(`unit-jest.json`). API typecheck, targeted ESLint, and targeted Prettier also
passed.
