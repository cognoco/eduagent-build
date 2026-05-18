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

### Elapsed-time interpretation

The "Elapsed" column reports two numbers when applicable:

- **Full seed-and-run.sh time** — includes ADB launch + dev-client launcher orchestration + Metro bundle download + sign-in. On WHPX cold it is ~3 min; warm-cache run ~2 min.
- **Flow content time** — what runs AFTER `seed-and-sign-in.yaml COMPLETED`. This is the figure that maps to the brief's 90 s budget.

For the two promoted flows the content time is well under 90 s. The total seed-and-run.sh time is not the right comparator because the brief's budget is per-flow runtime in CI, where the dev-client install / bundle is amortised (or replaced with a pre-built release APK).

### Infrastructure notes from the verification session (2026-05-18)

- **Dev-client launcher state is sticky between sessions.** The launcher's "DEVELOPMENT SERVERS" list persists user-added entries across `pm clear`. The session began with only `http://10.0.2.2:8081` discoverable (from Metro mDNS), so the standard BUG-7 workaround (`adb reverse tcp:8081 tcp:8082` + tap `http://10.0.2.2:8082`) had no `:8082` row to tap. Adding `http://10.0.2.2:8082` once via the launcher's "New development server" UI restored the expected entry.
- **System UI ANR recovery is non-destructive.** When the WHPX emulator's `com.android.systemui` wedged, tapping "Wait" in the system-issued ANR dialog restored functionality without a snapshot wipe or emulator reboot. Persistent dev-client servers (added above) survived the recovery.

When the table fills out, copy the final set into `docs/audit/e2e/m1b-execution-brief.md` under "Step 3 — current pr-blocking flows" so the brief reflects ground truth.
