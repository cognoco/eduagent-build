## What was done

Added bounded, file-local scheduling headroom to PickBookScreen's async
assertions across the mandatory sticky-loading hold.

## What changed

The file now wraps React Native Testing Library's `waitFor` with a 3,000 ms
default while preserving caller-specific overrides. Product behavior, the
repository-wide test timeout, exact alert assertions, and navigation guarantees
are unchanged.

## Verification

Both full-suite loader-boundary failures and their isolated passes are preserved
in the red-green artifact. The complete focused suite passed in five repair
processes, three post-main-integration processes, and three exact-final-head
processes. After normally integrating
landed WI-2845 and WI-2846, the canonical mobile command on the exact final
head passed 514/514 suites and 6,726/6,726 tests in 338.192 seconds;
PickBookScreen and useNowFeed both
passed under full load. Hosted exact-head CI and governed landing remain pending.

## Caveats / Follow-ups

WI-2845 independently closed the canonical runner's default-heap exhaustion,
and WI-2846 independently closed the useNowFeed full-load wait boundary. This
change is test-only and does not alter production behavior.
