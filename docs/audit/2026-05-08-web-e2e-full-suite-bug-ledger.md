# Web E2E Full-Suite Bug Ledger — 2026-05-08

**Run date:** 2026-05-08
**Command:** `C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web`
**Result:** 16 passed, 14 failed
**Artifacts:** `apps/mobile/e2e-web/test-results/`
**Companion context:** Smoke suite was green immediately beforehand via `pnpm run test:e2e:web:smoke` (9/9 passed).

## Summary

The full web suite did not fail randomly. The 14 failures cluster into a few clear bands:

1. **Home / gate state mismatches**
   - Several flows expected a gate or post-switch home state and landed on a different, internally consistent screen instead.
2. **Parent drill-down routing/data issues**
   - Parent dashboard and child detail journeys appear partly broken on web.
3. **Practice/session backend breakage**
   - Quiz launch hit a concrete backend/database error.
4. **Subscription screen contract drift**
   - The test expects the static web paywall, but the app now shows an error fallback instead.
5. **One likely selector or navigation contract mismatch in Library**
   - The library shelf rendered, but the expected book row interaction path did not line up with the test.

## Failure Clusters

| Cluster | Affected specs | Notes |
| --- | --- | --- |
| Learner/home state mismatch | `J-05`, `J-08`, `J-09`, `J-12`, `J-13`, `J-15`, `W-01`, `W-04` | Several tests expected a specific learner or gate state but landed on another valid screen. |
| Parent dashboard drill-down | `J-07`, `J-16`, `J-17` | Child drill-down/navigation is not stable end-to-end. |
| Backend/data failure | `J-10` | Concrete SQL/runtime error shown in UI. |
| Library journey mismatch | `J-11` | Library shelf loaded, but the expected next-level book interaction did not appear. |
| Subscription web fallback mismatch | `J-19` | Screen rendered, but not the expected paywall content. |

## Bug Entries

### WEB-E2E-2026-05-08-01 — Parent-to-child profile switch lands on learner home variant without primary CTA

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j05-parent-switch-to-child.spec.ts`
- **Severity:** High
- **Observed:** After switching from the parent gateway to child profile `Emma`, the app rendered a learner home screen, but the expected `home-action-study-new` CTA never appeared.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j05-parent--5fab4-rofile-→-child-learner-home-role-transitions/error-context.md`
- **Snapshot signal:** Page shows `Viewing as Emma`, learner greeting, subjects list, and tabs, but no primary learner home action tiles.
- **Expected:** Child switch should land on learner home with `home-action-study-new` visible.
- **Likely area:** Child-profile landing state after persona/profile switch; learner home variant selection on web.

### WEB-E2E-2026-05-08-02 — Parent dashboard child drill-down does not reach child detail

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j07-parent-dashboard-drilldown.spec.ts`
- **Severity:** High
- **Observed:** Flow reached the Family dashboard, but did not complete the expected child-detail drill-down/back cycle.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j07-parent--ff074--detail-→-back-to-dashboard-role-transitions/error-context.md`
- **Snapshot signal:** Dashboard rendered child cards for Emma/Lucas/Sofia and remained on the Family screen at failure time.
- **Expected:** Clicking `dashboard-child-{profileId}` should open `child-detail-scroll`, then browser back should return to `dashboard-scroll`.
- **Likely area:** Dashboard card click target / web navigation from dashboard into child detail.

### WEB-E2E-2026-05-08-03 — Ask journey never reaches freeform session screen

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j08-ask-freeform-session-summary.spec.ts`
- **Severity:** High
- **Observed:** Test remained on learner home instead of reaching the chat/session flow.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j08-ask-fre-bcb14-nd-session-→-summary-→-home-later-phases/error-context.md`
- **Snapshot signal:** Home screen shows intent tiles like “Ask anything”, but no `chat-input`.
- **Expected:** Clicking Ask should open a freeform session with `chat-input`.
- **Likely area:** Home intent routing on web, or mismatch between the test’s target and the current learner-home action surface.

### WEB-E2E-2026-05-08-04 — Onboarding-no-subject seed lands on home shell instead of empty-home state expected by flow

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j09-learn-create-subject-onboarding.spec.ts`
- **Severity:** High
- **Observed:** The flow expected `home-empty-subjects`, but the app showed a learner home shell with “Your subjects will show up here” and `Add a subject`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j09-learn-c-fbd3b--curriculum-→-start-session-later-phases/error-context.md`
- **Snapshot signal:** Empty state copy exists, but the exact expected test contract did not match.
- **Expected:** Seeded onboarding flow should expose the create-subject path the test is written against.
- **Likely area:** Empty-home testID/state contract drift rather than total feature failure.

### WEB-E2E-2026-05-08-05 — Practice quiz launch fails with missing database relation

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j10-practice-quiz-cycle.spec.ts`
- **Severity:** Critical
- **Observed:** Practice screen rendered an in-app error: `Couldn't create a round` / `relation "usage_events" does not exist`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j10-practic-6b51f-nch-→-play-→-results-→-home-later-phases/error-context.md`
- **Expected:** Quiz launch should reach `quiz-play-screen`.
- **Likely area:** Staging/local schema drift or unapplied migration for `usage_events`.
- **Why this matters:** This is a real backend failure, not a flaky selector.

### WEB-E2E-2026-05-08-06 — Library shelf loads, but book drill-through path does not match test expectation

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j11-library-to-book-session.spec.ts`
- **Severity:** Medium
- **Observed:** Library screen rendered successfully with shelf row `General Studies`, but the journey did not reach the expected `book-screen`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j11-library-b89cf-elf-→-book-→-start-learning-later-phases/error-context.md`
- **Snapshot signal:** Shelf row is visible; failure occurred after landing in Library.
- **Expected:** First book row click should open the book detail screen and then start learning.
- **Likely area:** Shelf expansion/book-row rendering on web, or a locator contract mismatch between the test and the current library UI.

### WEB-E2E-2026-05-08-07 — Pre-profile seed bypasses create-profile gate and lands on generic onboarding gate

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j12-pre-profile-create-profile.spec.ts`
- **Severity:** High
- **Observed:** Instead of `create-profile-gate`, the app showed the generic onboarding screen: `Welcome! Let's set up your profile`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j12-pre-pro-6b0fa-ile-→-lands-on-learner-home-later-phases/error-context.md`
- **Expected:** The seeded pre-profile scenario should expose `create-profile-gate`, then allow create-profile flow to home.
- **Likely area:** Pre-profile routing/gate selection on web; testID or branch drift between onboarding gate and create-profile gate.

### WEB-E2E-2026-05-08-08 — Pending-consent learner is not blocked; app drops straight into learner home

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j13-consent-pending-parent-approval.spec.ts`
- **Severity:** Critical
- **Observed:** The test expected `consent-pending-gate`, but the page snapshot shows normal learner home with `Add a subject`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j13-consent-3f7a0-l-parent-approval-completes-later-phases/error-context.md`
- **Expected:** Pending consent should block app access until parent approval completes.
- **Likely area:** Consent-gating regression in the app shell, seed scenario mismatch, or web-only gate bypass.
- **Why this matters:** This is a privacy/compliance path, not just UX polish.

### WEB-E2E-2026-05-08-09 — Parent-solo seed never reaches add-first-child gate

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j15-parent-solo-add-first-child.spec.ts`
- **Severity:** High
- **Observed:** `seedAndSignIn` timed out waiting for `post-approval-continue`, and the final page snapshot shows learner-style home with `Add a subject`, not `add-first-child-screen`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j15-parent--2417c-en-sees-add-first-child-CTA-later-phases/error-context.md`
- **Expected:** Family-plan parent with no children should land on add-first-child CTA and navigate to create-profile.
- **Likely area:** Seed/account persona mismatch or incorrect post-sign-in routing for `parent-solo`.

### WEB-E2E-2026-05-08-10 — Parent child-detail route resolves to “Profile not found”

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j16-parent-drilldown-back-chain.spec.ts`
- **Severity:** Critical
- **Observed:** After parent dashboard drill-down, the app rendered `Profile not found` / `Unable to load child details`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j16-parent--e4f49--detail-and-unwinds-cleanly-later-phases/error-context.md`
- **Expected:** Parent should reach child detail, then topic detail, and browser back should unwind cleanly.
- **Likely area:** Child detail route params, profile lookup, or parent scoping on web.

### WEB-E2E-2026-05-08-11 — Parent topic detail shows no session history for seeded session

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j17-parent-session-recap-copy.spec.ts`
- **Severity:** High
- **Observed:** Topic detail loaded, but session history showed `No sessions for this topic yet`; expected `session-card-{sessionId}` never appeared.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j17-parent--9d2d0-ies-the-conversation-prompt-later-phases/error-context.md`
- **Expected:** Seeded session recap should be visible and copyable from parent topic detail.
- **Likely area:** Parent-visible session history query, topic/session association, or seed data visibility on web.

### WEB-E2E-2026-05-08-12 — Subscription page shows load-error fallback instead of static web paywall contract

- **Spec:** `apps/mobile/e2e-web/flows/journeys/j19-subscription-paywall-ui.spec.ts`
- **Severity:** Medium
- **Observed:** Subscription screen rendered `Unable to load subscription details. Please try again.` with Retry, so `current-plan` never appeared.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-journeys-j19-subscri-438fb-atic-tier-comparison-on-web-later-phases/error-context.md`
- **Expected:** Web should show static tier comparison fallback, including `current-plan`, upgrade CTA, and `no-offerings`.
- **Likely area:** Subscription screen contract changed to error-first behavior on missing offerings, or data load is failing before web fallback can render.

### WEB-E2E-2026-05-08-13 — Full-screen practice route is not reachable from learner home via expected web intent

- **Spec:** `apps/mobile/e2e-web/flows/navigation/w01-no-bleed-through-fullscreen.spec.ts`
- **Severity:** Medium
- **Observed:** Test timed out trying to click `intent-practice`; page snapshot remained on learner home.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-navigation-w01-no-bl-209fd-bar-and-prior-scene-content-later-phases/error-context.md`
- **Expected:** Practice intent should open `practice-screen`, after which the tab bar should be hidden on full-screen flows.
- **Likely area:** Home intent selector contract drift on web. This aligns with `J-08`.

### WEB-E2E-2026-05-08-14 — Browser-history practice flow cannot start because practice intent contract does not match current UI

- **Spec:** `apps/mobile/e2e-web/flows/navigation/w04-browser-history-stack.spec.ts`
- **Severity:** Medium
- **Observed:** Same initial failure as `W-01`: timeout trying to click `intent-practice`, never reached `practice-screen`.
- **Evidence:** `apps/mobile/e2e-web/test-results/flows-navigation-w04-brows-fa18d-keep-the-web-stack-coherent-later-phases/error-context.md`
- **Expected:** Home -> Practice -> Quiz index should be reachable so browser back/forward can be exercised.
- **Likely area:** Same underlying issue as `W-01`; likely not a distinct bug.

## Recommended Triage Order

1. **Backend/schema break first**
   - `WEB-E2E-2026-05-08-05`
2. **Consent / persona / gate regressions**
   - `...-08`, `...-09`, `...-07`, `...-01`
3. **Parent drill-down chain**
   - `...-02`, `...-10`, `...-11`
4. **Learner home intent contract drift**
   - `...-03`, `...-13`, `...-14`
5. **Subscription and library contract mismatches**
   - `...-12`, `...-06`, `...-04`

## Notes

- The run ended with Playwright printing `Internal error: step id not found: fixture@65` after the suite summary. That looks secondary; the 14 failures above were already established before that message.
- The green smoke run suggests auth/bootstrap is not broadly broken. The failures start once flows depend on richer seeded state, deeper routing, or server-side feature paths.
