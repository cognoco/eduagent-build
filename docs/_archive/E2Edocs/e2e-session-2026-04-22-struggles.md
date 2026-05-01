# E2E Session 2026-04-22 — Infrastructure Debugging Log

**Date:** 2026-04-22
**Branch:** `testing` (commit `7efcc1b6`)
**Emulator:** `E2E_Device_2`, WHPX, cold-booted with `-wipe-data`
**Maestro:** 2.4.0 at `C:\tools\maestro`

---

## Summary of Issues Encountered

Five distinct infrastructure issues were hit sequentially. Each was masked by the previous one, creating a ~3 hour debugging spiral before the first real test could execute.

---

## Issue 1: Maestro Android Driver Timeout (`dadb.open(tcp:7001)`)

**Symptom:** `maestro test` failed immediately with:
```
MaestroDriverStartupException$AndroidDriverTimeoutException:
Maestro Android driver did not start up in time — emulator [ emulator-5554 ] & port [ dadb.open( tcp:7001 ) ]
```

**Root cause:** A previous Maestro process was killed non-gracefully (via `TaskStop` / process termination), leaving the UIAutomator instrumentation lock held. New Maestro instances couldn't register because the lock was exclusive.

**Fix:** `adb reboot` (documented in this file — UIAutomator lock only releases on reboot or clean Maestro exit).

**Lesson:** Never kill a running Maestro test via external process kill (`taskkill`, `TaskStop`). Always use `Ctrl+C` in the terminal to trigger the `cleanup()` trap in `seed-and-run.sh`, which allows Maestro to release the UIAutomator lock gracefully.

---

## Issue 2: `-wipe-data` Uninstalls the App

**Symptom:** After cold-booting with `-wipe-data`, the dev-client launcher never appeared. UI dumps showed Android home screen icons.

**Root cause:** `-wipe-data` wipes the userdata partition, which includes all installed apps (except system apps). The MentoMate dev-client APK was uninstalled.

**Fix:** Reinstall the APK after every `-wipe-data` boot:
```bash
adb install "C:/tools/tmp/<latest-app-apk>.apk"
```

**Lesson:** After `-wipe-data`, ALWAYS verify `adb shell pm list packages | grep mentomate` before running tests. If empty, reinstall the APK.

---

## Issue 3: Stale Bundle Proxy on Port 8082

**Symptom:** App showed "Error loading app, timeout" even though Metro on 8081 served the bundle in 0.1s from the host.

**Root cause:** A stale `node bundle-proxy.js` process from a previous session was still holding port 8082. This stale proxy took ~11 seconds to buffer and re-serve the 8.8MB bundle (vs 0.1s with a fresh proxy). The dev-client's internal timeout was shorter than 11s.

**Diagnosis:** `curl` from the host to `localhost:8082` worked but took 11s — the proxy was degraded, not dead.

**Fix:** Kill the stale proxy process and start a fresh one:
```bash
# Find the PID
netstat -ano | grep ":8082" | grep LISTEN
# Kill it
powershell -Command "Stop-Process -Id <PID> -Force"
# Start fresh
node apps/mobile/e2e/bundle-proxy.js &
```

**Verification:** Fresh proxy serves the bundle in <0.15s.

**Lesson:** After any session restart, kill and restart the bundle proxy. Don't assume it's healthy because `/status` responds — test with a full bundle request.

---

## Issue 4: Missing `TEST_SEED_SECRET` (Doppler Config Mismatch)

**Symptom:** App loaded to sign-in screen, but seed-and-run.sh failed silently at the seeding step. The seed API returned `{"code":"FORBIDDEN","message":"Invalid or missing test secret"}`.

**Root cause:** The regression script was run under `doppler run` (default `dev` config), but `TEST_SEED_SECRET` is only defined in the `stg` Doppler config. The API server was also started with the default config, so both had the same (empty) secret — but the API's `.dev.vars` file (generated from stg) had the real secret baked in.

**Fix:** Run both the API server and the regression script with `-c stg`:
```bash
# API server
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec wrangler dev

# Regression
C:/Tools/doppler/doppler.exe run -c stg -- bash -c 'FAST=0 bash scripts/run-all-regression.sh'
```

**Lesson:** E2E tests MUST use `doppler run -c stg` for the `TEST_SEED_SECRET`. This is documented in CLAUDE.md for Playwright but was not explicit for Maestro.

---

## Issue 5: UIAutomator Lock Re-acquired by Killed Regression

**Symptom:** After stopping the regression (which was running Maestro tests), all subsequent `uiautomator dump` calls failed with:
```
AndroidRuntime: registerUiTestAutomationService → Bad file descriptor
```
The `seed-and-run.sh` script interpreted the failed dumps as "app crashed" and gave up.

**Root cause:** Same as Issue 1 — killing the regression script mid-Maestro-test left the UIAutomator instrumentation lock held. The app was actually running fine; it was `uiautomator dump` that was broken.

**Fix:** `adb reboot` again.

**Lesson:** This is the same issue as #1 but re-triggered. Every time a Maestro test is interrupted non-gracefully, the UIAutomator lock gets stuck. The ONLY reliable fix is `adb reboot`.

---

## Infrastructure Checklist (Pre-E2E Session)

After today's experience, this is the verified startup sequence:

```bash
# 1. Emulator (user launches from their terminal for persistence)
C:/Android/Sdk/emulator/emulator.exe -avd E2E_Device_2 -no-snapshot-load -gpu host -no-audio -no-boot-anim
# Add -wipe-data ONLY if emulator state is corrupted. Remember: it uninstalls apps.

# 2. Wait for boot
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'

# 3. Disable Bluetooth (prevents ANR dialogs)
adb shell pm disable-user --user 0 com.android.bluetooth

# 4. Verify app installed (if -wipe-data was used, reinstall)
adb shell pm list packages | grep mentomate || adb install <apk-path>

# 5. ADB reverse ports
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8787 tcp:8787

# 6. Start services (kill stale processes on each port first!)
# Metro
cd apps/mobile && npx expo start --port 8081
# Bundle proxy (KILL any existing process on 8082 first)
node apps/mobile/e2e/bundle-proxy.js
# API server (MUST use -c stg for TEST_SEED_SECRET)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec wrangler dev

# 7. Pre-warm Metro cache (prevents 26s cold compile timeout)
curl -s "http://localhost:8081/apps/mobile/index.bundle?platform=android&dev=true&minify=false" > /dev/null

# 8. Verify proxy speed (<1s, not 11s)
curl -s -o /dev/null -w "%{time_total}s" "http://localhost:8082/apps/mobile/index.bundle?platform=android&dev=true&minify=false"

# 9. Verify seed API works
doppler run -c stg -- bash -c 'curl -sf http://127.0.0.1:8787/v1/__test/seed -H "Content-Type: application/json" -H "X-Test-Secret: ${TEST_SEED_SECRET}" -d "{\"scenario\":\"onboarding-complete\",\"email\":\"test@test.com\"}"'

# 10. Run regression (FAST=0 for first run, FAST=1 after cache warm)
C:/Tools/doppler/doppler.exe run -c stg -- bash -c 'TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" FAST=0 bash scripts/run-all-regression.sh'
```

---

## Key Takeaways

| Issue | Time Lost | Preventable? |
|-------|-----------|-------------|
| Maestro UIAutomator lock | ~30 min | Yes — never kill Maestro externally |
| `-wipe-data` uninstalls app | ~20 min | Yes — always verify `pm list packages` after wipe |
| Stale bundle proxy | ~45 min | Yes — always kill+restart proxy, verify with bundle request |
| Doppler config mismatch | ~30 min | Yes — always use `-c stg` for E2E |
| UIAutomator lock (re-triggered) | ~20 min | Yes — same as #1, compounded by not knowing the fix |

**Total infrastructure debugging:** ~2.5 hours before any actual E2E test could execute.

**Root pattern:** Five issues stacked on top of each other. Each fix revealed the next issue. Reading `e2e-emulator-issues.md` thoroughly at the start would have prevented Issues 1, 2, and 5. Issues 3 and 4 were new discoveries.
