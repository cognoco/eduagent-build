# WI-2532 verification

## Acceptance behavior

- Adult family intent creates only the adult owner profile and pending UI state.
- Me clears the pending state, queues the ordinary first-profile mentor-born
  ceremony, and enters the learner shell without family or child state.
- Someone else durably advances to the own-login question.
- Yes persists an opening-invitation destination, replays that destination
  after remount if needed, and clears the marker only after the invitation
  screen mounts under V2.
- No durably shows the explicit managed-profile unavailable state and can return
  to the login question.
- Sign-out clears both SecureStore and the in-memory pending-state cache.
- SecureStore write, clear, rejection, and timeout paths fail closed with
  translated retry UI; retry after adult creation does not repeat the POST.

## Focused mobile verification

- Family-intent state, component, profile creation, app-layout,
  invitation-route, and sign-out suites: 6 suites, 267 tests passed.
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
- Test-only export ratchet: passed.
- Touched-file ESLint with `--max-warnings=0`: passed.
- Git whitespace check: passed.

## Preview journey

The dedicated preview Playwright test passed in 1.7 minutes after its refreshed
run caught and drove a fix for the Tabs-before-route navigation race. It begins with the
pre-profile seed, persists family intent, creates the adult, selects Someone
else, answers that the learner has their own login, and reaches the invitation
form without first writing a visibility/supportership link.

## Collision and flag audit

- BID-33 PR #2692 landed on `origin/main`
  `455f1f54c20195cb3d19de64f5567c9051921cb6`. This branch merged that
  authoritative locale state and retained both key families.
- WI-2231 PR #2704 is an unlanded collision watch at reviewed head
  `020c597f`. It has not been merged into this branch; if it lands first, its
  post-auth routing semantics must be reconciled from the new authoritative
  main before publication.
- Existing flags-off, V0, and V1 shell contracts are unchanged. Direct
  existing-account entry preserves the prior explicit unavailable state when
  V2 is off.

## Review disposition

Every actionable publication-review comment was dispositioned in
`review-dispositions.md`. Accepted findings have focused RED-to-green evidence;
the two rejected suggestions are documented against the actual synchronous
handoff contract and the ruled scope boundary.
