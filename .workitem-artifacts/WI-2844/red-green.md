# WI-2844 red-green evidence

## RED — full-suite-only timing failures

During WI-2238 recovery verification on 2026-07-27, the full serialized mobile
Jest suite passed 513/515 suites and 6,803/6,805 tests. The exact
`PickBookScreen > shows alert on filing failure` case timed out at
`[subjectId].test.tsx:328` while waiting for `Europe`; the rendered tree was
still `pick-book-loading`. An immediate isolated rerun passed all 30 cases in
20.092 seconds. These facts are preserved in the Work Item `Found In` field and
Acceptance Criteria.

After WI-2836 landed, a second serialized control run with a 6,144 MB Node heap
reproduced the same boundary in `shows custom input when "Something else..." is
tapped`: 513/514 suites and 6,725/6,726 tests passed, but that case still saw
`pick-book-loading` at the default timeout. This ruled out the filing path as
the cause and showed that every async assertion in this screen shared the same
fragile default.

Root cause: the file used React Native Testing Library's default one-second
`waitFor` budget across `useStickyLoading`'s mandatory 800 ms hold. Full-suite
scheduling overhead could consume the remaining margin without any product
failure.

## GREEN — bounded test-only repair

The first repair commit `f56ced9dc5b5eab8a0b98384828642f4c62b5057`
bounded the three initially observed filing-failure preconditions. The complete
repair keeps a file-local `waitFor` wrapper at 3,000 ms so all PickBook async
assertions have headroom above the screen's intentional 800 ms hold. It does
not change the repository-wide timeout, product code, alert assertions, or
navigation assertions; the existing 8,000 ms override remains authoritative
for its one caller.

Five fresh focused processes passed 30/30 tests on 2026-07-27 after the complete
repair, in 20.592 s, 20.166 s, 20.113 s, 20.145 s, and 20.146 s.

Each run used:

```text
pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --forceExit --silent --runTestsByPath "apps/mobile/src/app/(app)/pick-book/[subjectId].test.tsx"
```

The post-repair serialized full suite passed 514/514 suites and 6,726/6,726
tests in 334.302 seconds with a 6,144 MB Node heap. The PickBookScreen suite ran
first and passed all 30 tests in 20.002 seconds. The separate WI-2845 runner
defect records why the canonical default-heap command can exhaust V8's
approximately 4.5 GB default before reporting the complete suite result.
