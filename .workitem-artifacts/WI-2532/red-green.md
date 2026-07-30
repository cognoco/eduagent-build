# WI-2532 red-green evidence

## RED

Focused tests were added before the implementation:

- the first-profile family-intent test failed against the unconditional child-profile redirect and family-context PATCH;
- the durable-state and gate suites failed because the pending-state module and learner-target component did not exist;
- the direct existing-account route test failed because the invitation screen still opened at the supportee picker;
- the relaunch layout test failed because no durable family-intent gate was restored.
- rejected-write tests failed because the state carrier swallowed SecureStore
  failures and exposed memory-only state;
- rejected and never-settling restore tests failed because the layout treated
  probe failures as absence and exposed the tab shell;
- destination durability tests failed because the credentialed branch cleared
  its marker before the invitation route mounted;
- the profile-creation recovery test failed because retrying after a durable
  write failure would repeat the already-successful profile POST.

## GREEN

After implementing the state carrier and UI fork, the six directly relevant
mobile suites passed 267 tests:

```text
node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js \
  --config apps/mobile/jest.config.cjs --runInBand --forceExit \
  --runTestsByPath <six affected suites>
```

Coverage includes rejected writes, restore timeout/retry, terminal destination
consumption, and duplicate-POST prevention.

The preview Playwright journey also passed with one worker, no dependency
projects, and the live preview navigation flags. It reached the existing-account
invitation form and observed no visibility-link write before invitation.

The refreshed preview run first exposed a web navigator race: the invitation
route existed but remained hidden because the gate pushed before Tabs mounted.
A focused layout test reproduced the ordering defect. Navigation now runs from
the committed app layout after Tabs mounts; the same preview test then passed.

## Regression diagnosis

The first broad mobile rerun exposed a never-settling family-intent SecureStore
read. The initial timeout implementation failed open, so adversarial review
required a second red-green cycle. The final layout keeps the shell blocked,
shows translated retry UI on timeout or rejection, and restores the pending
step once a retry succeeds.

## Review-bounce RED/GREEN

The publication review produced three reproducible correctness failures:

- A deferred primary read could repopulate signed-out state after memory was
  discarded. RED expected `null` but received the stale
  `signed-out-profile/login-choice` record. The read now snapshots both primary
  and recovery generations before awaiting storage and rejects either stale
  result.
- A recovery-only record restored successfully but never repaired the missing
  SecureStore primary. RED expected a SecureStore `setItem` call and observed
  zero calls. A successful recovery read now schedules primary repair.
- The V2-off existing-account placeholder consumed the durable destination
  marker. RED expected zero clear calls and observed one. Marker consumption is
  now gated on V2 being enabled.

The blocked-shell review also added an explicit route-state assertion: while
the pending fork is visible, Tabs remain mounted for route preservation but
are absent from ordinary accessibility/test queries, use `display: none`, and
carry native accessibility hiding. The two focused requested-route tests and
all 267 tests across the six affected suites passed after the corrections.
