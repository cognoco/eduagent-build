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
- Exact-head review exposed the inverse V2-off lifecycle defect: the mounted
  unavailable destination left the durable marker replayable on every relaunch.
  RED expected one clear call after that terminal route mounted and observed
  zero. Both the V2 invitation form and older-shell unavailable gate now
  consume the marker only after mount.

The blocked-shell review also added an explicit route-state assertion: while
the pending fork is visible, Tabs remain mounted for route preservation but
are absent from ordinary accessibility/test queries, use `display: none`, and
carry native accessibility hiding. The two focused requested-route tests and
all 267 tests across the six affected suites passed after the corrections.

## Landed WI-2231 merge-forward RED/GREEN

The merge-forward first preserved WI-2532's pre-landing `handleClose` calls and
added routing assertions before production changed. Both the initial
family-intent persistence case and the marker-only retry case failed RED:
`router.replace` had zero calls where shell-aware Home/Mentor completion was
required.

Both paths now call the landed `handleCompleted` helper after durable
persistence. The two focused tests passed GREEN. The full merge-forward union
then passed 410 tests across eight suites, including WI-2532's six suites and
WI-2231's session and consent routing suites.

## First exact-head E2E RED/GREEN

The first published exact head ran
`v2-family-intent-onboarding.spec.ts` and failed identically on its initial
attempt and retry: `family-intent-onboarding-gate` resolved to two visible
elements. The family handoff had replaced the pushed create-profile modal with
another `/(app)` route before `switchProfile`; the original app shell remained
beneath it, and both shells restored the same durable marker.

Focused RED changed the normal and storage-retry assertions to require modal
dismissal before profile activation. Both failed with zero `router.back`
calls. The minimal correction changes only those two family-specific handoffs
to `handleClose`; both focused cases pass GREEN and prove the dismissal occurs
before `switchProfile`. The ordinary learner, consent, add-child, and
no-history fallback paths remain independently owned by their existing
contracts.

## Landed WI-1556 merge-forward RED/GREEN

The later merge-forward was textually clean, but first-Mentor language
confirmation could render while the durable family-intent SecureStore probe
was still unresolved. RED expected the fail-closed family-intent loading
overlay and instead received `first-mentor-language-gate`.

The first-Mentor language gate now requires the family-intent probe to resolve
absent. GREEN proves the probe remains fail closed, a restored pending choice
wins the gate order, and language confirmation remains deferred until the
family-intent fork is complete. The full post-merge union passed 470 tests
across thirteen suites, including WI-2399 resubmit-generation coverage and the
five landed WI-1556 mobile suites.

## Independent exact-head invitation-order RED/GREEN

Independent review found that a restored `opening-invitation` marker was
converted to `familyIntentState=null` before Tabs mounted. For an unconfirmed
first-Mentor profile, the language gate could therefore render before the
invitation push. The focused RED observed the push while Tabs were absent
(`Expected: true`, `Received: false`).

A second exact-head review found that clearing the handoff flag immediately
after `router.push` left another render gap before the terminal destination
mounted and consumed its marker. The strengthened post-push RED transitioned
the layout to `/link/initiate` and received
`first-mentor-language-gate` instead of Tabs.

The handoff now remains pending until the terminal pathname is observed, and
the terminal route independently suppresses language gating through
destination mount and marker consumption. GREEN proves Tabs are mounted at
push time and remain present after the path transition; the route-level suite
retains its marker-consumption assertion. The post-fix semantic union passed
472 tests across fourteen suites.
