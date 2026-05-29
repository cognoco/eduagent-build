---
name: run-full-e2e
description: >
  Use when the user wants the WHOLE EduAgent mobile Maestro E2E suite run
  end-to-end and the failures triaged + fixed — not a single flow. Triggers:
  "run the full e2e suite", "run all e2e and fix what's broken", "full
  regression", "first e2e after the refactor", "run every flow and log the
  bugs". For a single flow / preflight only, use `/e2e` instead. For just
  bringing up the emulator stack, use `/e2e-infra`.
---

<!-- Master playbook for a full Maestro E2E run + live triage + auto-fix. -->

# Run Full E2E (run → triage → fix → re-run → report)

## What this does

Runs all ~133 runnable Maestro flows on the local Android dev-client, classifies
every failure live (infra vs flake vs real drift vs needs-human), dispatches
source-grounded fix subagents in batches **while the run continues**, keeps the
emulator alive across crashes, re-runs the infra victims on a fresh emulator,
and produces a pass/fixed/bug/skip/needs-human tally. The coordinator commits
fixes via `/commit`; subagents never commit. The coordinator does not go to sleep for longer than 5 minutes at time. The coordinator reviews the failing flows as they come in and dispatches agents to fix them and commit them.  The coordinator does not wait for all flows to be finished to create a report. The goal is to unblock as many flows as possible and get as many flows passing as possible during the run. All blocking issues have to be addressed. Smaller bugs can be recorded in Notion. 


> This is a multi-hour operation. Tell the user that up front. The emulator on
> this Windows/WHPX box is unstable — most of the wall-clock is emulator
> management, not test logic. Do not give up; restart and resume.

---

## HARD-WON GOTCHAS — read these first, they cost ~14h to learn

1. **NEVER `pm disable-user com.android.bluetooth`.** On this AVD, disabling the
   Bluetooth package makes the service crash-loop → a "Bluetooth keeps stopping"
   dialog covers the dev-client launcher → every flow fails with
   `'DEVELOPMENT' not found`. Leave Bluetooth **enabled**; `seed-and-run.sh`
   dismisses transient dialogs. (This single mistake caused the mass-failure
   cascade that looked like ~90 broken tests.)

2. **Seed orphan cascade.** The seed uses a fixed email
   (`test-e2e+clerk_test@example.com`). If a flow partially seeds then crashes,
   it leaves an `accounts` row whose Clerk user can't be matched → every later
   seed 500s with `accounts_email_unique` → all flows fail at the seed step
   (curl `-f` returns **rc=22**) and never reach Maestro. **Fix:** the runner
   must DELETE that account row from the staging DB before every seeded flow
   (see runner script). To unblock a stuck orphan manually, delete it directly
   via the staging `DATABASE_URL` (neon driver) — `/__test/reset` does NOT
   delete accounts with a real (non-`clerk_seed_`) Clerk id.

3. **ONE runner only.** `TaskStop` on a background runner kills the task wrapper
   but leaves the `bash run-...sh` LOOP running as an orphan. Launch a second
   and you get 2-4 concurrent runners hammering one emulator + seeding the same
   email = chaos and rc=22 contention. If you must stop the runner, kill the
   actual processes via PowerShell (`Get-CimInstance Win32_Process | ... |
   Stop-Process`), then verify 0 remain, then relaunch exactly one. Confirm
   "one logical runner" by `grep -c "SUITE START"` (must be 1) and no
   interleaved/duplicate RUN lines.

4. **Don't interrupt the runner mid-Maestro-flow.** Killing Maestro mid-flow
   leaves a UIAutomator lock → next flows fail instantly with
   `Maestro ... driver did not start up in time`. Recovery is `adb reboot`. It
   is SAFE to kill/reboot during a *bundle-load* failure (Maestro hasn't started
   yet — no lock).

5. **`while read` eats stdin.** seed-and-run/doppler/maestro inside a
   `while read` loop consume the manifest from stdin → loop runs one flow then
   EOFs. Read the loop on FD 3 (`done 3< manifest`; `read ... <&3`) AND feed
   each child `</dev/null`.

6. **Emulator degrades every ~12-15 flows** into a "bundle won't load" state
   (`Bundle did not load within 120s`, blank screen). A cold reboot recovers it.
   `COLD_EVERY=20` is too sparse — use ~12, AND force a reboot the moment you
   see a cluster of consecutive `BUNDLE-INFRA` failures (kill the emulator; the
   runner's `ensure_emulator` relaunches it fresh). Bundle failures happen
   before Maestro → no lock risk.

7. **Use Doppler `stg`.** Regenerate `apps/api/.dev.vars` with `pnpm env:sync`
   (pulls from `stg`) so `TEST_SEED_SECRET` matches what `seed-and-run.sh`
   sends. Start the API with `doppler run -c stg`. On Windows, doppler is
   `C:/Tools/doppler/doppler.exe` and needs `--project mentomate` if cwd changes.

8. **The pre-auth welcome refactor (2026-05-27)** put a chooser→cards→bridge in
   front of sign-in. Flows that wait for `sign-in-button`/`sign-in-screen`
   directly (NOT via `seed-and-sign-in.yaml`/`sign-in-only.yaml`) must prepend
   `- runFlow: { file: ../_setup/nav-welcome-to-sign-in.yaml }`.

---

## Phase 0 — Infra bring-up & verify

Load `/e2e-infra` for the canonical bring-up, but the essentials:

```bash
ADB=/c/Android/Sdk/platform-tools/adb.exe
# 0a. Regenerate stg secrets so the seed secret matches
PATH="/c/Tools/doppler:$PATH" pnpm env:sync
# 0b. Services (background, persistent terminals): API, Metro, bundle proxy
#   API:   doppler run -c stg -- pnpm exec nx dev api      (:8787, wrangler)
#   Metro: cd apps/mobile && pnpm exec expo start --port 8081 --dev-client
#   Proxy: node apps/mobile/e2e/bundle-proxy.js            (:8082)
# 0c. Device prep (NO bluetooth disable!)
$ADB -s emulator-5554 reverse tcp:8081 tcp:8081
$ADB -s emulator-5554 reverse tcp:8082 tcp:8082
$ADB -s emulator-5554 reverse tcp:8787 tcp:8787
$ADB -s emulator-5554 shell settings put global window_animation_scale 0
$ADB -s emulator-5554 shell settings put global transition_animation_scale 0
$ADB -s emulator-5554 shell settings put global animator_duration_scale 0
```

Verify: `/v1/health` 200, Metro+proxy `packager-status:running`, app installed
(`pm list packages | grep mentomate`), Maestro 2.4.0. Then run ONE known-good
seeded flow (e.g. `account/more-tab-navigation.yaml` with `onboarding-complete`)
end-to-end before any mass run. If it hits the welcome chooser, confirm
`nav-welcome-to-sign-in.yaml` walks through it.

---

## Phase 1 — Build the manifest

The canonical per-flow seed scenario is declared in each flow's header comment
(`# Prerequisite: ... (scenario: X)`). The seeder's valid scenarios live in
`apps/api/src/services/test-seed.ts` (`SCENARIO_MAP`). `run-all-regression.sh`
covers ~55; the rest you map from headers. Build
`C:/tools/tmp/e2e-manifest.txt` as `mode|scenario|flow`:

```
seed|onboarding-complete|flows/account/account-lifecycle.yaml
...
noseed|-|flows/auth/sign-in-navigation.yaml
```

Validate every path exists (`[ -f apps/mobile/e2e/$flow ]`) and diff the
manifest against `git ls-files 'apps/mobile/e2e/flows/**/*.yaml'` (minus
`_setup/`) so nothing is silently dropped. **Delegate this to a Sonnet subagent**
— "read every flow header, extract scenario, cross-check seed.js, flag scenarios
referenced but not implemented (missing-seed = blocking)."

**Skip list** (don't run; document with reason): MFA flows (no seed + need Clerk
token), preview-* (manual), sso-callback-fallback (airplane-mode wrapper),
dictation-perfect/review (EXPO_PUBLIC_E2E build), camera-ocr (no camera),
sign-up-flow (Clerk email), app-launch-expogo, consent-deny-confirmation
(browser dialog), first-curriculum-polling-timeout + sse-reconnect-banner
(missing seed scenarios + testIDs), home/library-loading-timeout (need
`NETWORK_DELAY_MS`), demoted flows (BUG-35).

---

## Phase 2 — The resilient runner

Write `C:/tools/tmp/run-e2e-suite.sh` (env-overridable `MANIFEST`/`RESULTS`/
`MASTERLOG`). Key properties — all of these are load-bearing:

- **Single attempt, no retry** (first-attempt is the honest signal; the user
  asked for this). Tag fails: append `|BUNDLE-INFRA` if log has
  `Bundle did not load within`, `|DRIVER` if `did not start up in time`.
- **Loop reads FD 3**: `while IFS='|' read -r MODE SCEN FLOW <&3; do ... done 3< "$MANIFEST"`.
- **Each flow command gets `</dev/null`** and a `timeout -s INT --kill-after=30 460`.
- **Pre-flow DB cleanup for seeded flows** — delete the fixed test account from
  staging before every seed flow (defends the orphan cascade):
  ```bash
  DBURL=$(grep -E "^DATABASE_URL=" apps/api/.dev.vars | sed -E 's/^DATABASE_URL=//;s/^"//;s/"$//')
  clean_test_account() { [ -n "$DBURL" ] || return 0
    DATABASE_URL="$DBURL" SEED_EMAIL="test-e2e+clerk_test@example.com" node -e '
      const {neon}=require("@neondatabase/serverless"); const sql=neon(process.env.DATABASE_URL);
      sql`delete from accounts where email = ${process.env.SEED_EMAIL}`.then(()=>process.exit(0)).catch(()=>process.exit(0));' >/dev/null 2>&1 || true; }
  ```
- **`ensure_emulator`** at the top of each iteration: if `get-state` != device OR
  `getprop sys.boot_completed` != 1, kill + relaunch via
  `powershell.exe -Command "Start-Process 'C:\\Android\\Sdk\\emulator\\emulator.exe' -ArgumentList '-avd','New_Device','-no-snapshot-load','-no-boot-anim'"`,
  wait ≤240s for boot, then re-run device prep (ports/animations, NO bluetooth).
- **`cold_reboot` every `COLD_EVERY=12`** flows (prophylactic) + re-run device prep.
- Run seeded: `doppler run -c stg -- bash apps/mobile/e2e/scripts/seed-and-run.sh "$SCEN" "apps/mobile/e2e/$FLOW"`; noseed: `... --no-seed ...`. Always `METRO_URL=http://10.0.2.2:8081 TEMP/TMP=C:/tools/maestro/tmp`.
- Append `PASS|flow` or `FAIL|flow|tag|mode/scen`. Resumable: skip flows already
  `PASS` (`grep -Fxq "PASS|$flow"`). `log()` everything to `$MASTERLOG`.

Launch it ONCE with `run_in_background: true`. Seed the results file with any
already-verified passes so they're skipped.

---

## Phase 3 — Live triage + fix-agent batching (while the run continues)

Arm two monitors (`tail -n 0 -f` to avoid replaying old lines):
- **Per-failure + completion**: grep `-> FAIL|FATAL|SUITE COMPLETE|Stopping:`.
- **5-min emulator watchdog**: poll boot state + pass/fail counts every 300s,
  emit `EMU-OK`/`EMU-DOWN`. (The user explicitly wants the emulator watched.)

On each `-> FAIL`, read its log (`C:/tools/tmp/e2e-flowlogs/<flow with / → _>.log`,
+ `.try1`) and **classify by signature**:

| Signature in log | Class | Action |
|---|---|---|
| `device 'emulator-5554' not found`, `Bluetooth keeps stopping`, `Close app`, `'DEVELOPMENT' not found`, `Launcher never appeared`, `Bundle did not load within`, `did not start up in time` | **INFRA** | → re-run pile. No fix. |
| Same flow fails at *different* steps across runs; LLM-response wait timed out | **FLAKE** | → re-run pile. No fix. |
| Reached Maestro (`... COMPLETED` lines) then a specific `... FAILED` assertion/tap | **REAL DRIFT** | → fix-agent batch. |
| Screen/tab/feature genuinely removed, premise gone | **NEEDS-HUMAN** | → flag to user, don't fabricate. |

**Batch the real-drift flows by domain/cluster** (don't dispatch one agent per
failure — too many; don't wait for all — the user wants fixes as they come).
~3-5 related flows per Sonnet subagent. The runner has already passed each flow,
so editing it is conflict-free. Subagents EDIT only (device is busy → can't
verify); verification happens in the re-run.

**Fix-agent brief (template):** FILE-EDITING + SOURCE-READING only; no flows,
no adb, no git, no commit. For each flow: read log → if INFRA signature, skip;
else grep `apps/mobile/src` for the failing testID/text → fix to the CURRENT
real selector (quote `file:line`). **NEVER weaken**: no `id:`→`text:`, no
`optional: true`, no deleting steps. Timing race (element exists, found-not /
short timeout right after a transition) → add `scrollUntilVisible` guard (this
is NOT weakening). Selector already matches source → "SELECTOR CORRECT — likely
flake", don't edit. Report per-flow: FIXED (old→new + source line) / INFRA /
FLAKE / NEEDS-HUMAN. **Flag any assertion-semantic change explicitly.**

**Trust-but-verify:** subagent reports are intent, not evidence. Spot-check
diffs (`git diff <flow>`), especially semantic changes and edits to shared files
(`_setup/*.yaml`, `test-seed.ts`). If an agent edits API/seed source, REVIEW it —
confirm it matches an existing pattern (e.g. another seed) and isn't "changing
source to make tests pass." **Sweep when you fix:** if a fix has 3+ sibling
sites (e.g. a seed gap, a removed tab, an `open-family-dashboard` double-nav),
apply it to all siblings, not one.

---

## Phase 4 — Re-run the infra/flake pile on a fresh emulator

When `SUITE COMPLETE`: cold-boot the emulator clean, then re-run ONLY the
`BUNDLE-INFRA`/flake/`rc=22` flows (resumable runner skips the passes). Flows
that pass here were infra noise. Flows that fail *consistently* across both runs
are real → triage. Also run the special-wrapper flows via their dedicated
scripts (`seed-and-run-sso-fallback.sh`, `seed-and-run-dictation-review.sh`) and
the `NETWORK_DELAY_MS` timeout flows with the env var set.

Then re-run the flows the fix-agents edited to VERIFY the fixes actually pass
(changed ≠ fixed).

---

## Phase 5 — Commit & report

- Commit flow + script + seed fixes via `/commit` (subagents never commit;
  coordinator does). Batch at phase boundaries. Include `test-seed.ts` seed
  fixes. Do NOT commit the stray `commit-skill-latest.log` artifacts.
- Final tally for the user: PASS / FIXED-and-verified / NEEDS-HUMAN (with the
  product questions) / SKIPPED (with reasons) / still-flaky.

---

## Common post-refactor fix patterns (seen in this codebase)

- **testID renames**: `session-chat-input`→`chat-input`, `session-send-button`→`send-button` (ChatShell.tsx).
- **Below-fold elements**: home intent cards, `home-subject-carousel`, practice sliders, progress links → `scrollUntilVisible` before tap/assert. Horizontal sliders need `direction: RIGHT`.
- **Removed intermediate screens**: "Learn Something New" gone (`home-ask-anything` → session direct). Camera close now routes home (`88a4e2fc2`).
- **Structured cards replace text**: quota → `quota-exceeded-card`; chat-bubble TEXT matching is unreliable (FlatList `removeClippedSubviews`) → assert `chat-input` readiness (semantic change — flag it).
- **V1 guardian nav**: tabs are home/recaps/progress/more; `own-learning`+`library` REMOVED → `recaps`. `tab-library`→`tab-recaps`, `shelves-list`→`recaps-screen`.
- **Seed gaps under V1**: `seedParentWithChildren`/`seedParentMultiChild` must set `defaultAppContext: 'family'` or the parent lands on learner-screen, not `parent-home-screen`. (Use a direct `db.insert(profiles)` — `createBaseProfile` doesn't pass it.)
- **Proxy mode removed (BUG-774/ACCOUNT-04)**: tapping a child in `profiles.tsx` now opens child *settings*, not proxy impersonation. `switch-to-child.yaml` can no longer enter proxy mode → flows asserting `isParentProxy` behavior (`child-paywall`, `*-parent-proxy`, `more-impersonated-child`) are NEEDS-HUMAN, not fixable.
- **quiz advance changed (`e63daf8d0`)**: tap-anywhere removed → explicit `quiz-next-question` taps + `quiz-final-see-results`; round size is 8.

---

## Don'ts (project rules)

- Never weaken a test to make it pass (CLAUDE.md "Tests Must Reflect Reality").
- Never `jest.mock` internal code; not relevant here but the spirit applies —
  match assertions to current REAL behavior, or delete with a stated reason.
- Subagents must not commit, push, or run git in the coordinator's working tree.
- Don't create a PR or run `eas update`/OTA unless explicitly asked.
