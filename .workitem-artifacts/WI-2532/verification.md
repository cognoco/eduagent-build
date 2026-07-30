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
  invitation-route, and sign-out suites: 6 suites, 263 tests passed.

## Repository validation

- Full incremental TypeScript build: passed.
- Full mobile unit suite through change-class validation: passed.
- Full API unit suite under the sanctioned development database boundary:
  passed. A staging-context attempt was rejected before test execution by the
  local-database safety guard; the corrected Doppler `dev` run exited 0.
- i18n staleness, orphan-key, hardcoded-JSX-literal, and clinical-copy checks:
  passed.
- Test-only export ratchet: passed.
- Touched-file ESLint: 0 errors; one pre-existing duplicate dependency warning
  remains in create-profile.tsx.
- Git whitespace check: passed.

## Preview journey

The dedicated preview Playwright test passed in 1.7 minutes after its refreshed
run caught and drove a fix for the Tabs-before-route navigation race. It begins with the
pre-profile seed, persists family intent, creates the adult, selects Someone
else, answers that the learner has their own login, and reaches the invitation
form without first writing a visibility/supportership link.

## Collision and flag audit

- BID-33 PR #2692 (WI-2783 shared-record fact localization) remains open at
  head `5b9a0e5c2555b2363cbb91ec3a4c7cf7539a27a3`. It touches all locale catalogs
  and the generated source baseline, but contains no
  `familyIntentOnboarding` keys and does not overlap this change's symbols.
- This worktree was fast-forwarded to `origin/main`
  `386555087a81b9db36638e2d94f1339739c3dff5` at the publication boundary.
  `source-baseline.json` was regenerated from the resulting source tree rather
  than line-picked.
- Existing flags-off, V0, and V1 shell contracts are unchanged. Direct
  existing-account entry preserves the prior explicit unavailable state when
  V2 is off.
