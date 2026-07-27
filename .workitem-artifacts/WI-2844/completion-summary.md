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
in the red-green artifact. The complete focused suite passed in five fresh
processes. After integrating landed WI-2836, the 6,144 MB serialized mobile Jest
control passed 514/514 suites and 6,726/6,726 tests in 334.302 seconds. Hosted
exact-head CI and governed landing remain pending.

## Caveats / Follow-ups

WI-2845 independently owns the default-heap exhaustion in the canonical mobile
Jest runner. This change is test-only and does not alter production behavior.
