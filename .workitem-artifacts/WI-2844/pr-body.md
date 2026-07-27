## What changed

- Give PickBookScreen's async assertions a file-local three-second budget above
  the screen's intentional 800 ms sticky-loading hold.
- Preserve caller-specific overrides, exact failure alerts, navigation
  assertions, the repository-wide timeout, and all product behavior.

## Root cause

The affected waits crossed the mandatory sticky-loading hold but still used
React Native Testing Library's one-second default. Under full serialized-suite
scheduling load, the remaining margin could expire while the loading state was
still correctly visible. A second full-suite reproduction in an unrelated test
confirmed this was a file-wide boundary rather than a filing-path defect.

## Verification

- Five fresh focused processes passed the complete 30-test PickBookScreen suite.
- The post-repair 6,144 MB serialized mobile suite passed 514/514 suites and
  6,726/6,726 tests in 334.302 seconds; PickBookScreen passed 30/30 in-suite.
- WI-2845 independently owns the default-heap exhaustion in the canonical
  runner.
- Targeted Prettier and diff integrity passed.

No production file or global timeout changed.

Refs: WI-2844
