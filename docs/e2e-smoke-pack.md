# E2E Smoke Pack

**Phase 7 of the test-coverage-hardening plan.**

The smoke pack is a small set of release-critical flows that must pass before any release or store submission. The full Maestro library (187 flows) covers regression, nightly, and weekly scenarios. The smoke pack focuses only on the paths most likely to break at release time.

---

## Smoke Flows — 10 items

| # | Smoke item | Flow file | Seed scenario | Tag |
|---|---|---|---|---|
| 1 | Sign in and sign out | `apps/mobile/e2e/flows/auth/sign-in-out-loop.yaml` | `learning-active` | `regression, auth, stress` |
| 2 | Learner home loads | `apps/mobile/e2e/flows/learning/home-layout.yaml` | `learning-active` | `weekly, learning` |
| 3 | Start a learning session | `apps/mobile/e2e/flows/learning/start-session.yaml` | `learning-active` | `smoke, learning` |
| 4 | My Notes opens and shows sessions, notes, and bookmarks | `apps/mobile/e2e/flows/learning/my-notes-archive.yaml` | `with-bookmarks` | `nightly, learning, archive` |
| 5 | Library topic detail opens | `apps/mobile/e2e/flows/learning/library-navigation.yaml` | `retention-due` | `pr-blocking, learning` |
| 6 | Progress overview opens | `apps/mobile/e2e/flows/progress/progress-analytics.yaml` | `learning-active` | `nightly, progress` |
| 7 | Parent dashboard opens | `apps/mobile/e2e/flows/parent/parent-dashboard.yaml` | `parent-with-children` | `nightly, parent` |
| 8 | Saved bookmark item opens | `apps/mobile/e2e/flows/progress/saved-bookmarks.yaml` | `with-bookmarks` | `nightly, learning` |
| 9 | Error or timeout state displays | `apps/mobile/e2e/flows/home/home-loading-timeout.yaml` | `onboarding-complete` | `weekly, home, slow-net` |
| 10 | Billing or quota guard displays | `apps/mobile/e2e/flows/billing/daily-quota-exceeded.yaml` | `daily-limit-reached` | `nightly, billing, quota` |

---

## Smoke-Pack Mechanism

The smoke pack is defined as an explicit script (`apps/mobile/e2e/scripts/run-smoke.sh`) that lists the 10 flows by name. This is consistent with the existing batch scripts (`run-all-regression.sh`, `regression-batch2.sh`, etc.) which all use the same `run_seeded` helper from `e2e-lib.sh`.

The alternative approach — adding a `smoke` tag to each of the 10 flow files and running `maestro test --include-tags=smoke` — was not chosen because most of these flows already carry meaningful semantic tags (`nightly`, `weekly`, `pr-blocking`) and adding `smoke` would require editing all 10 existing files with no added value for CI (which already filters by existing tags). The script approach keeps flow metadata stable and makes the smoke selection explicit in one place.

CI tag coverage note: only `start-session.yaml` currently carries the `smoke` tag (caught by CI on PRs). `library-navigation.yaml` carries `pr-blocking` (also caught by CI on PRs). The other 8 smoke flows are covered by `nightly`/`weekly` CI runs or the explicit `run-smoke.sh` script. The script is the authoritative pre-release gate.

---

## Gaps

None of the 10 smoke items are missing a backing flow. All items map to existing, complete flows. The My Notes archive flow (`SMOKE-4`) satisfies the plan's requirement to include a My Notes archive E2E in the learning smoke group.

---

## Preflight Checklist

Run before any E2E session. The `run-smoke.sh` script runs preflight automatically via `e2e-lib.sh` — it will abort with an actionable error if any check fails.

For manual verification before starting:

| Check | Command / fix |
|---|---|
| Android emulator connected | `adb get-state` must return `device` |
| UIAutomator lock free | `adb shell uiautomator dump /sdcard/test.xml` must succeed without hanging |
| dev-client APK installed | `adb shell pm list packages com.mentomate.app` must list the package |
| Metro bundler running | `curl http://localhost:8081/status` must return HTTP 200 |
| Bundle proxy running and fast | `curl` of `http://localhost:8082/apps/mobile/index.bundle?...` must respond in under 2 s |
| API server running | `curl http://localhost:8787/v1/health` must return `{"status":"ok"}` |
| TEST\_SEED\_SECRET valid | Run under `doppler run -c stg` — the preflight script probes the seed endpoint with the secret |
| adb reverse ports set | Handled automatically by `seed-and-run.sh` (ports 8081, 8082, 8787) |

The `e2e-preflight.sh` script (sourced by `e2e-lib.sh`) automates all eight checks. See `apps/mobile/e2e/scripts/e2e-preflight.sh` for details on each check and the fixes it recommends.

Full infra documentation: `docs/E2Edocs/e2e-session-2026-04-22-struggles.md` and the `/e2e-infra` skill.

---

## How to Run the Smoke Pack

Always run under Doppler with `-c stg` so `TEST_SEED_SECRET` matches the API server:

```bash
C:/Tools/doppler/doppler.exe run -c stg -- bash apps/mobile/e2e/scripts/run-smoke.sh
```

Expected runtime: 20–30 minutes on a warm emulator (roughly 2–3 minutes per flow).

Results are written to `apps/mobile/e2e/scripts/smoke-results-<timestamp>.txt`.

Exit code is 0 if all flows pass, 1 if any fail.

### SMOKE-9 note (error/timeout state)

Flow 9 uses `NETWORK_DELAY_MS=12000` to inject a 12-second network delay via the Android emulator console, which triggers the home screen's 10-second loading timeout. This requires the emulator console auth token to be present (`~/.emulator_console_auth_token`). If the token is missing, preflight will warn but not block — the flow will run at full speed and the timeout UI may not appear. See `e2e-preflight.sh` `check_emulator_console` for the warning message.

---

## How to Run the Broader Flow Library

The full 187-flow library is organized in batches. To run the full regression suite:

```bash
C:/Tools/doppler/doppler.exe run -c stg -- bash apps/mobile/e2e/scripts/run-all-regression.sh
```

CI runs the explicit `pr-blocking` manifest after trusted pushes (or an on-demand `pr` dispatch) and recursively discovers `smoke,nightly,pr-blocking` flows for the eight-shard nightly/on-demand suite. Pull-request `workflow_run` events do not execute the secret-backed native job because that would run untrusted PR-head code with repository secrets. The manifest and seed-map drift guard lives in `scripts/e2e-ci-injection-and-smoke-gate.test.ts`.

---

## Flow Inventory Summary

Total flows: **187** (5 root-level + 31 setup helpers + 151 scenario flows)

| Area | Count |
|---|---|
| `_setup` (helpers, not standalone flows) | 31 |
| `auth` | 20 |
| `parent` | 23 |
| `learning` | 18 |
| `account` | 14 |
| `billing` | 10 |
| `quiz` | 8 |
| `retention` | 8 |
| `consent` | 8 |
| `regression` | 7 |
| `onboarding` | 12 |
| `homework` | 4 |
| `progress` | 4 |
| `practice` | 3 |
| `edge` | 3 |
| `dictation` | 3 |
| `subjects` | 2 |
| `assessment` | 1 |
| `home` | 1 |
| `library` | 1 |
| `session` | 1 (DRAFT — blocked on missing testID) |
| root-level | 5 |

The `session/sse-reconnect-banner.yaml` flow is a DRAFT blocked on two prerequisites: a `session-active` seed scenario and a `sse-reconnect-banner` testID in the session chat shell component. It is not included in the smoke pack.
