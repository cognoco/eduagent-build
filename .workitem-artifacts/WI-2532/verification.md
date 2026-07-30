# WI-2532 verification

## Acceptance behavior

- Adult family intent creates only the adult owner profile and pending UI state.
- Me clears the pending state, queues the ordinary first-profile mentor-born
  ceremony, and enters the learner shell without family or child state.
- Someone else durably advances to the own-login question.
- Yes persists an opening-invitation destination, replays that destination
  after remount if needed, and clears the marker only after the destination
  route mounts: the invitation form under V2 or the explicit unavailable gate
  under older shells.
- No durably shows the explicit managed-profile unavailable state and can return
  to the login question.
- Sign-out clears both SecureStore and the in-memory pending-state cache.
- SecureStore write, clear, rejection, and timeout paths fail closed with
  translated retry UI; retry after adult creation does not repeat the POST.
- Successful initial and retry persistence use the landed shell-aware
  completion path: V2 Mentor, older-shell Home. Cancel, pending-consent, and
  ordinary add-child paths retain their existing close semantics.

## Focused mobile verification

- Merge-forward union covering family-intent state, component, profile
  creation, app-layout, invitation route, sign-out, session routing, and
  consent routing: 8 suites, 410 tests passed.
- Focused RED proved the two family-intent persistence paths made zero
  shell-aware replace calls under the old `handleClose`; both pass after using
  the landed completion helper.
- The two focused route-preservation cases passed: a pending restore keeps the
  requested Tabs navigator mounted but hidden, and a failed restore retry
  preserves the requested route.
- A blocked navigator is `display: none`, pointer-inert, and hidden from native
  accessibility while remaining React-mounted; ordinary queries cannot expose
  blocked content.

## Repository validation

- Full incremental TypeScript build: passed.
- Full mobile unit suite through change-class validation: passed.
- Full API unit suite under the sanctioned development database boundary:
  passed. A staging-context attempt was rejected before test execution by the
  local-database safety guard; the corrected Doppler `dev` run exited 0.
- i18n staleness, orphan-key, hardcoded-JSX-literal, and clinical-copy checks:
  passed.
- Teen-consent claims and GC1 mock-governance ratchets: passed.
- Test-only export ratchet: passed.
- Touched-file ESLint with `--max-warnings=0`: passed.
- Exact candidate Prettier check: passed.
- Git whitespace check: passed.

## Preview journey

The dedicated preview Playwright test passed in 1.7 minutes after its refreshed
run caught and drove a fix for the Tabs-before-route navigation race. It begins with the
pre-profile seed, persists family intent, creates the adult, selects Someone
else, answers that the learner has their own login, and reaches the invitation
form without first writing a visibility/supportership link.

## Collision and flag audit

- Publication merge-forward uses authoritative `origin/main`
  `e90b6c94a2f92d76a8a566d642946779df7033ff`, which includes landed WI-2231
  PR #2704.
- The known create-profile overlap was reconciled without rebase or history
  rewrite. WI-2532 retains the durable non-authorizing fork and adopts WI-2231's
  current `handleCompleted` / `getPostAuthDefaultPath` completion behavior
  after successful initial or retry persistence.
- The app-layout/test tree was reconciled; a duplicate `mockPush` declaration
  surfaced by the textual merge was removed before the 143-test layout suite
  and 410-test union passed.
- Existing flags-off, V0, and V1 shell contracts are unchanged. Direct
  existing-account entry preserves the prior explicit unavailable state when
  V2 is off.

## Review disposition

Every actionable publication-review comment was dispositioned in
`review-dispositions.md`. Accepted findings have focused RED-to-green evidence;
the two rejected suggestions are documented against the actual synchronous
handoff contract and the ruled scope boundary.
