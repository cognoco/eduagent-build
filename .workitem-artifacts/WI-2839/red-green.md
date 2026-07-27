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
and reusing its `nowUtc`, the same named regression passed. A separate
same-hour control now calls `executeCronSteps()` without an injected window,
executes the real `resolve-week-window` callback, and asserts the exact created
parent is queued. Under a deliberate one-line mutation restoring the old
independent wall-clock read, that control passed while the rollover regression
failed at the created-parent assertion (`same-hour-control-boundary-mutation-red.json`;
mutation base HEAD `6649ed5e1e1e0f19065df3124dfec6cb8139fee8`, with the
new control and mutation present only in the working tree). Production code was
then restored before commit.

An independent review also found the pre-existing excluded-parent matcher was
too shallow: a payload containing `reportWeekStart` could evade its nested exact
object comparison. After changing the nested matcher to `objectContaining`, a
deliberate mutation that assigned the skipped parent the matching timezone failed
at the negative assertion and printed that exact queued payload
(`excluded-parent-mutation-red.json`). Restoring the non-matching timezone passed.

At exact implementation HEAD `80e9aaa4987525cbd2a58eec896d09e76b6fe947`,
the focused same-hour + rollover run passed `2/2` (`green-jest.json`), the full
co-located integration file passed `10/10` (`full-integration-jest.json`), and
the companion unit file passed `29/29` (`unit-jest.json`). The exact commands,
environment, receipt paths, and HEAD binding are recorded in `verification.json`.
API typecheck, targeted ESLint, and targeted Prettier also passed.
