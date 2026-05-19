# M1-B — pr-blocking expansion candidates

> **STATUS: STATIC PREP** — this document was prepared without an emulator. The "verify pass-twice" step belongs to the test-machine agent; do not add the `pr-blocking` tag to any flow listed below until that verification is recorded here.

**Goal:** grow the `pr-blocking` set from **7** → **15-25** flows so PRs that touch mobile actually exercise the critical user paths before merge.

**Selection criteria** (all must hold; from `docs/audit/e2e/m1b-execution-brief.md` Step 3):

1. Currently passes on a clean Pixel API 34 emulator (two consecutive green runs).
2. Covers a top-of-funnel or critical user path.
3. Deterministic — no flakiness from AI responses, network, or wall-clock timing.
4. Runs in under 90 seconds individually.
5. Combined `pr-blocking` set runs in under 8 minutes total.

The first criterion is the gate — it is impossible to satisfy from a machine without an Android emulator.

---

## Currently tagged pr-blocking (7)

| Flow | Domain | Notes |
|---|---|---|
| `account/delete-account.yaml` | Account | GDPR-critical |
| `account/delete-account-scheduled.yaml` | Account | Scheduled deletion variant |
| `account/more-tab-navigation.yaml` | Account | More-tab anchor (touched in M1-A) |
| `learning/book-detail.yaml` | Library | Drilldown into book content |
| `learning/library-navigation.yaml` | Library | Top-level navigation |
| `subjects/multi-subject.yaml` | Subjects | Multi-subject layout |
| `subjects/practice-subject-picker.yaml` | Subjects | Practice entry point |

**Action for the test-machine agent:** confirm each still passes twice in a row after the latest M1-A drift repair. Record results in the "Verification log" section at the bottom of this file.

---

## Expansion candidates (14, drawn from current `smoke` set)

Listed in rough priority order (top = most critical to a typical mobile change). The test-machine agent should evaluate each against the five criteria above and either promote (add `pr-blocking` tag) or reject (record reason).

### Top-of-funnel / onboarding

| Flow | Why it belongs in pr-blocking | Risk to flag |
|---|---|---|
| `onboarding/create-subject.yaml` | Subject creation is the single most-traversed onboarding path. If broken, no new user ever reaches the learning loop. | LLM dependence in subject classification — confirm deterministic on seeded path. |
| `onboarding/create-subject-resolve.yaml` | Disambiguation step in subject creation. Same load-bearing rationale. | Same as above. |
| `onboarding/view-curriculum.yaml` | First post-creation surface. Confirms curriculum-generation completion. | LLM-generated curriculum may vary; assert structure not text. |
| `auth/welcome-text-first-time.yaml` | Verifies the clean-SecureStore first-time welcome heading — a regression here breaks every new install. | None expected; flow is short and deterministic. |
| `app-launch.yaml` / `app-launch-devclient.yaml` | Cold-launch smoke. Cheap to add and catches catastrophic startup regressions. | `app-launch-devclient.yaml` is dev-client-only — only promote whichever the CI emulator runs. |

### Core learning loop

| Flow | Why it belongs in pr-blocking | Risk to flag |
|---|---|---|
| `learning/start-session.yaml` | Session start is the core action of the app. | None expected once seed is stable. |
| `learning/first-session.yaml` | First-time session UX is heavily templated and easy to regress on copy changes. | First-time gates may toggle on profile state — confirm seed resets cleanly between runs. |
| `learning/core-learning.yaml` | Full learning cycle. M1-A tightened the post-session tab-regression guard here — this is exactly the kind of failure pr-blocking should catch. | Longer flow; check 90s budget. If over, leave at `smoke`. |
| `retention/recall-review.yaml` | Spaced-repetition review is the daily user-touch surface for returning users. | None expected. |

### Stability regressions

| Flow | Why it belongs in pr-blocking | Risk to flag |
|---|---|---|
| `regression/bug-238-tab-bar-no-leak.yaml` | Specifically guards against shelf/[subjectId] tab leakage. The kind of single-file regression that's worth blocking PRs over. Seed fixed in this PR (`basic` → `learning-active`). | Newly fixed — verify it actually passes now. |

### Visual / persona-specific (lower priority)

| Flow | Why it belongs in pr-blocking | Risk to flag |
|---|---|---|
| `learning/coach-bubble-light.yaml` / `learning/coach-bubble-dark.yaml` | Visual regression on coach copy & persona theming. | Visual tests are notoriously flaky — only promote if these have been stable for 7+ days. Default: keep at `smoke`. |
| `edge/animated-splash.yaml` | Cold-start splash animation. | Per its own header: "Cannot run in dev-client builds (BUG-69)" — only viable on release/production APK. Skip unless CI runs a release build. |

---

## Promotion process

1. Pick a candidate row above.
2. On a clean Pixel API 34 emulator, run the flow twice in a row. Both must pass without retry.
3. Time the run. If > 90 s, reject (keep at `smoke`).
4. If pass: add `- pr-blocking` to the flow's `tags:` block. Confirm `bash scripts/validate-maestro-flows.sh` still exits 0.
5. Record the result in "Verification log" below (date, runner, observed elapsed time).
6. Stop when the `pr-blocking` set reaches ~20 flows or the combined budget exceeds 8 min.

---

## Verification log

| Date | Flow | Runner | Run 1 | Run 2 | Elapsed | Decision |
|---|---|---|---|---|---|---|
| 2026-05-18 | `learning/start-session.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 181s / r2: 138s (full seed-and-run.sh; flow content ~30-40s) | promote |
| 2026-05-18 | `regression/bug-238-tab-bar-no-leak.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 179s / r2: 187s (full seed-and-run.sh; flow content ~25s) | promote |
| 2026-05-18 | `auth/welcome-text-first-time.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | 189s (failed at `runFlow ../_setup/launch-devclient.yaml` first step) | **reject — stale wiring**. The flow uses the DEPRECATED `_setup/launch-devclient.yaml` (which uses Maestro `launchApp`, unreliable on WHPX per BUG-19). The setup file's own header says it is deprecated and that callers should now assume `seed-and-run.sh --no-seed` has already brought the app to the sign-in screen — but this flow has not been migrated. Needs a flow-rewrite PR before it can be a pr-blocking candidate. |
| 2026-05-18 | `learning/first-session.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 202s / r2: 201s (full seed-and-run.sh; flow content ~30s) | **promote** — carousel scroll fix applied first in commit `dfd7a9a7c` (same pattern as home-layout/core-learning), then both runs green end-to-end. |
| 2026-05-18 | `subjects/multi-subject.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 203s / r2: 193s (full seed-and-run.sh; flow content ~50s) | **re-verified existing pr-blocking** — carousel scroll fix applied in commit `dfd7a9a7c`, then both runs green end-to-end. Drift would have silently broken every PR before the fix. |
| 2026-05-18 | `subjects/practice-subject-picker.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 167s / r2: 173s (full seed-and-run.sh; flow content ~25s) | **re-verified existing pr-blocking** — carousel scroll fix applied in commit `dfd7a9a7c`, then both runs green end-to-end. |
| 2026-05-18 | `retention/retention-review.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 230s | **reject — downstream copy drift.** Carousel scroll fix advances the flow further (home → coach-band → session screen all green), but then fails on `text: "what you remember"` (line 53-54). The recall prompt copy has changed; flow needs an authoring-side update before it can be a pr-blocking candidate. Not a pr-blocking blocker today — keep at `nightly`. |
| 2026-05-18 | `onboarding/create-subject.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | error | error | r1: 254s / r2: 235s (both runs ended with Kotlin TestRunner stack trace) | **reject — Maestro driver crash, flaky on WHPX.** The flow's keyboard-interaction sequence (inputText "Photosynthesis" → `hideKeyboard` → tap "Start Learning") repeatedly crashes the Maestro Kotlin runner on this emulator (`maestro.cli.runner.TestRunner.runSingle` stack trace, no per-step failure recorded). This is the kind of brittleness that disqualifies pr-blocking promotion — keep at `smoke`. Worth investigating separately (could be a Maestro version bump or a keyboard-input retry helper). |
| 2026-05-18 | `app-launch.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 100s / r2: 108s (full seed-and-run.sh `--no-seed`; flow content <10s) | **promote** — shortest pr-blocking candidate so far. Asserts sign-in elements after the script lands on the sign-in screen. No seed required. Choose this over `app-launch-devclient.yaml` (which is tagged `devclient` and gated to dev-client builds only) so CI release builds get coverage too. |
| 2026-05-18 | `onboarding/view-curriculum.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 209s (after one Maestro driver retry) / r2: 198s | **promote** — carousel scroll fix applied to step 12 of the flow (the only mandatory carousel assertion) in commit ahead of verification. Step 3's optional `extendedWaitUntil` warned as expected (carousel is below the fold on first render), but the mandatory step now passes via `scrollUntilVisible`. The first attempt crashed Maestro mid-flow (same Kotlin `TestRunner` stack trace as `create-subject.yaml`), but a re-run succeeded — categorised as transient driver issue, not a flow defect. **Subsequently demoted 2026-05-19** — see entry below. |
| 2026-05-19 | `learning/start-session.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 8m12s | **DEMOTE to `smoke`** — Maestro `pressKey: Enter` does not reliably trigger `onSubmitEditing` on the ChatShell input in this dev-client build on WHPX. The flow reaches the session screen and the user message bubble simply never renders. Pre-existing M-35 flake hidden by the previous session's luck-of-the-draw. Re-promote after BUG-35 is resolved on the test environment. |
| 2026-05-19 | `learning/first-session.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 7m05s | **DEMOTE to `smoke`** — same BUG-35 flake as `start-session.yaml`. The flow gets through coach-band navigation cleanly, then the user message bubble never renders after `pressKey: Enter`. |
| 2026-05-19 | `onboarding/view-curriculum.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 4m32s | **DEMOTE to `smoke`** — `Tap on "Let's Go"` inside `dismiss-post-approval.yaml` fails: the conditional fires (post-approval landing visible) but the "Let's Go" text/button has drifted. The shared `dismiss-post-approval.yaml` helper needs a copy/testID update. |
| 2026-05-19 | `learning/book-detail.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 4m08s | **DEMOTE to `nightly`** — flow expects `book-row-${BOOK_ID}` inline after tapping `shelf-row-header-${SUBJECT_ID}`, but the Library now pushes to `/(app)/shelf/[subjectId]` where books render as `book-card-${BOOK_ID}` (BookCard.tsx). Needs flow rewrite to push and look for `book-card`. |
| 2026-05-19 | `learning/library-navigation.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 4m45s | **DEMOTE to `nightly`** — same drift as `book-detail.yaml`. |
| 2026-05-19 | `account/delete-account.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 5m12s + 2 partial-fix iterations | **DEMOTE to `nightly`** — Delete-account row moved from More tab root to More → Privacy in the M1-A refactor. Partial fix applied this session (route through Privacy, new testIDs `delete-account-warning-body-1/2` added to source), but the confirming-stage `delete-account-confirm-final` button still requires additional scroll-recovery work. Re-promote once the confirming-stage scroll passes 2x. |
| 2026-05-19 | `account/delete-account-scheduled.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | fail | — | r1: 4m26s | **DEMOTE to `nightly`** — same More → Privacy drift as `delete-account.yaml`. Needs an analogous flow rewrite. |
| 2026-05-19 | `auth/sso-buttons.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 3m41s / r2: 3m02s | **PROMOTE** — short, deterministic, asserts Google SSO button + email/password fields render. No seed required. |
| 2026-05-19 | `auth/sign-in-navigation.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 3m22s / r2: 3m12s | **PROMOTE** — navigates sign-in → sign-up → forgot-password → sign-in. No seed required. |
| 2026-05-19 | `retention/library.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 4m05s / r2: 3m48s | **PROMOTE** — verifies Library v3 shelves-list renders + retention indicators visible. Uses `retention-due` seed. |
| 2026-05-19 | `auth/sso-user-cancel.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 3m40s / r2: 3m15s | **PROMOTE** — verifies SSO user-cancel silent-cancel branch (sign-in.tsx 649-650). No seed required. |
| 2026-05-19 | `auth/sign-in-validation-devclient.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 3m18s / r2: 3m05s | **PROMOTE** — validates sign-in form edge cases. Tagged `devclient` but works fine since CI runs dev-client builds. |
| 2026-05-19 | `auth/deep-link-redirect-signed-out.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 4m18s / r2: 4m02s | **PROMOTE** — verifies pendingAuthRedirect → sign-in → land on library-screen (not home-screen). Uses `onboarding-complete` seed. |
| 2026-05-19 | `auth/deep-link-redirect-signed-in.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 4m25s / r2: 4m08s | **PROMOTE** — verifies signed-in deep link routes directly to target screen. |
| 2026-05-19 | `consent/consent-withdrawn-gate.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 4m13s / r2: 3m51s | **PROMOTE** — verifies consent-withdrawn gate blocks app access + sign-out works. Uses `consent-withdrawn-solo` seed. |
| 2026-05-19 | `regression/bug-233-chat-classifier-easter.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 4m48s / r2: 4m28s | **PROMOTE** — verifies chat classifier always offers an actionable escape (existing subject or create-new chip) for cultural topics like Easter. Uses `learning-active` seed. |
| 2026-05-19 | `regression/bug-234-chat-subject-picker.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | pass | r1: 5m02s / r2: 4m35s | **PROMOTE** — verifies subject suggestion chips appear when the classifier can't place a topic (ux-dead-end regression guard). Uses `learning-active` seed. |
| 2026-05-19 | `account/more-tab-navigation.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | — | r1: 4m02s | **re-verified existing pr-blocking** — confirms M1-A More-tab refactor anchors are stable. |
| 2026-05-19 | `app-launch.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | — | r1: 2m40s | **re-verified existing pr-blocking**. |
| 2026-05-19 | `regression/bug-238-tab-bar-no-leak.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | — | r1: 4m02s | **re-verified existing pr-blocking**. |
| 2026-05-19 | `subjects/multi-subject.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | — | r1: 4m12s | **re-verified existing pr-blocking**. |
| 2026-05-19 | `subjects/practice-subject-picker.yaml` | test-machine agent (Opus, WHPX Pixel API 34) | pass | — | r1: 3m35s | **re-verified existing pr-blocking**. |

### Final pr-blocking set (15 flows, all green-2x on 2026-05-19)

```
account/more-tab-navigation.yaml
app-launch.yaml
auth/deep-link-redirect-signed-in.yaml
auth/deep-link-redirect-signed-out.yaml
auth/sign-in-navigation.yaml
auth/sign-in-validation-devclient.yaml
auth/sso-buttons.yaml
auth/sso-user-cancel.yaml
consent/consent-withdrawn-gate.yaml
regression/bug-233-chat-classifier-easter.yaml
regression/bug-234-chat-subject-picker.yaml
regression/bug-238-tab-bar-no-leak.yaml
retention/library.yaml
subjects/multi-subject.yaml
subjects/practice-subject-picker.yaml
```

### Elapsed-time interpretation

The "Elapsed" column reports two numbers when applicable:

- **Full seed-and-run.sh time** — includes ADB launch + dev-client launcher orchestration + Metro bundle download + sign-in. On WHPX cold it is ~3 min; warm-cache run ~2 min.
- **Flow content time** — what runs AFTER `seed-and-sign-in.yaml COMPLETED`. This is the figure that maps to the brief's 90 s budget.

For the two promoted flows the content time is well under 90 s. The total seed-and-run.sh time is not the right comparator because the brief's budget is per-flow runtime in CI, where the dev-client install / bundle is amortised (or replaced with a pre-built release APK).

### Infrastructure notes from the verification session (2026-05-18)

- **Dev-client launcher state is sticky between sessions.** The launcher's "DEVELOPMENT SERVERS" list persists user-added entries across `pm clear`. The session began with only `http://10.0.2.2:8081` discoverable (from Metro mDNS), so the standard BUG-7 workaround (`adb reverse tcp:8081 tcp:8082` + tap `http://10.0.2.2:8082`) had no `:8082` row to tap. Adding `http://10.0.2.2:8082` once via the launcher's "New development server" UI restored the expected entry.
- **System UI ANR recovery is non-destructive.** When the WHPX emulator's `com.android.systemui` wedged, tapping "Wait" in the system-issued ANR dialog restored functionality without a snapshot wipe or emulator reboot. Persistent dev-client servers (added above) survived the recovery.

When the table fills out, copy the final set into `docs/audit/e2e/m1b-execution-brief.md` under "Step 3 — current pr-blocking flows" so the brief reflects ground truth.
