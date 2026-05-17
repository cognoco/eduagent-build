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
| _pending_ | _candidate name_ | _agent / human_ | _pass/fail_ | _pass/fail_ | _seconds_ | _promote / reject (reason)_ |

When the table fills out, copy the final set into `docs/audit/e2e/m1b-execution-brief.md` under "Step 3 — current pr-blocking flows" so the brief reflects ground truth.
