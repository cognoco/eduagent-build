---
name: e2e-infra
description: >
  Start, stop, health-check, and troubleshoot the Android E2E test infrastructure
  (emulator, API server, Metro bundler, bundle proxy). Use when running Maestro flows,
  diagnosing emulator failures, or setting up a fresh test session. Trigger on:
  /e2e-infra, "start the emulator", "run e2e", "test infrastructure", "maestro setup".
---

# E2E Infrastructure Management

Manages the four services needed for Maestro E2E testing on the WHPX Android emulator.

## Services (start in this order)

| # | Service | Command | Port | Health check |
|---|---------|---------|------|-------------|
| 1 | **Emulator** | `Start-Process "C:\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd New_Device -no-snapshot"` | 5554 (ADB) | `adb devices` shows `emulator-5554 device` |
| 2 | **API server** | `Start-Process "C:\Tools\doppler\doppler.exe" -ArgumentList "run -- pnpm --prefix C:\Dev\Projects\Products\Apps\eduagent-build exec nx dev api" -WindowStyle Hidden` | 8787 | `GET http://localhost:8787/v1/health` → 200 |
| 3 | **Metro bundler** | `Start-Process cmd.exe -ArgumentList "/c cd /d C:\Dev\Projects\Products\Apps\eduagent-build\apps\mobile && pnpm exec expo start --port 8081 --dev-client" -WindowStyle Hidden` | 8081 | `GET http://localhost:8081/status` → 200 |
| 4 | **Bundle proxy** | `Start-Process node -ArgumentList "C:\Dev\Projects\Products\Apps\eduagent-build\apps\mobile\e2e\bundle-proxy.js" -WindowStyle Hidden` | 8082 | TCP connect to `localhost:8082` |

## Post-start setup (after emulator boots)

```powershell
# 1. Wait for boot (poll ADB)
do { Start-Sleep 5 } while (-not (adb devices | Select-String "emulator-5554\s+device"))

# 2. Disable animations (reduces WHPX instability)
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

# 3. Set up adb reverse (critical — without these, the app can't reach services)
adb reverse tcp:8081 tcp:8082   # Route through bundle proxy (OkHttp BUG-7 workaround)
adb reverse tcp:8082 tcp:8082   # Bundle proxy direct
adb reverse tcp:8787 tcp:8787   # API server
```

**Note:** `seed-and-run.sh` now sets up adb reverse automatically, including the BUG-7
proxy reroute. The manual setup above is only needed for ad-hoc Maestro runs outside
the script.

## Running a flow

```powershell
$env:TEMP = "C:\tools\tmp"
$env:TMP = "C:\tools\tmp"
$env:TEST_SEED_SECRET = "<from Doppler: doppler secrets get TEST_SEED_SECRET --plain>"
cd <repo>/apps/mobile
bash e2e/scripts/seed-and-run.sh <scenario> e2e/flows/<path>.yaml
```

Common scenarios: `onboarding-complete`, `learning-active`, `parent-with-children`,
`language-subject-active`, `mentor-memory-populated`.

Use `--no-seed` for pre-auth flows that only need the sign-in screen.

## Before starting: kill stale processes

Previous sessions leave orphan Metro/Expo processes that grab ports. Always clean up first:

```powershell
# Find and kill stale Expo/Metro processes
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "expo|metro" } |
  Stop-Process -Force

# Verify ports are free
@(8081, 8082, 8787) | ForEach-Object {
    $listener = netstat -ano | Select-String ":$_\s.*LISTENING"
    if ($listener) { Write-Warning "Port $_ in use: $listener" }
}
```

## Troubleshooting

### "Error loading app, timeout" (bundle won't load)
- **Cause:** Emulator port 8081 routes directly to Metro instead of through the proxy.
- **Fix:** `adb reverse tcp:8081 tcp:8082` (routes through bundle proxy).
- **Permanent fix:** Already baked into `seed-and-run.sh` since commit `9e19beef5`.

### "We could not load your profile" (after sign-in)
- **Cause:** Emulator can't reach the API server.
- **Fix:** `adb reverse tcp:8787 tcp:8787`.
- **Verify:** Seed endpoint works: `Invoke-WebRequest -Uri "http://localhost:8787/v1/__test/seed" -Method POST -Body '{"scenario":"onboarding-complete","email":"test@example.com"}' -Headers @{"Content-Type"="application/json";"X-Test-Secret"="<secret>"}`.

### App crashes to Android home screen
- **Cause:** WHPX emulator instability under UI automation load.
- **Mitigations:**
  1. Disable animations (see post-start setup above).
  2. Kill other heavy processes on the machine.
  3. If persistent: restart emulator with `-no-snapshot -wipe-data`.
- **Note:** Just restarting the 4 services is usually sufficient — no reboot needed.

### API hangs / stops responding
- **Cause:** Wrangler workerd process wedges under repeated load.
- **Fix:** Kill and restart the API server. Check health endpoint before running flows.

### Dev-client launcher stuck / won't connect to Metro
- **Cause:** Stale Metro processes on other ports. The dev-client auto-discovers via mDNS
  and may connect to the wrong Metro instance.
- **Fix:** Kill all stale node processes (see cleanup section above), restart Metro on 8081.

### Maestro "ClassNotFoundException" or jansi errors
- **Cause:** Windows username contains Unicode characters (`č`, `á`).
- **Fix:** Maestro must run from `C:\tools\maestro`. TEMP/TMP must be `C:\tools\tmp`.
  The `seed-and-run.sh` script sets these automatically.

### `seed-and-run.sh` exits immediately with only "Network restored"
- **Cause:** MSYS bash `set -e` bug with `return` inside `case` clause.
- **Fix:** Use `return 0` (explicit) instead of bare `return`. Already fixed in the script.

## Full startup script (autonomous)

```powershell
# Kill stale processes
Get-Process node -EA SilentlyContinue |
  Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "expo|metro" } |
  Stop-Process -Force -EA SilentlyContinue

# 1. Emulator
Start-Process "C:\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd New_Device -no-snapshot"
do { Start-Sleep 5 } while (-not (& "C:\Android\Sdk\platform-tools\adb.exe" devices 2>&1 | Select-String "emulator-5554\s+device"))
& "C:\Android\Sdk\platform-tools\adb.exe" shell settings put global window_animation_scale 0
& "C:\Android\Sdk\platform-tools\adb.exe" shell settings put global transition_animation_scale 0
& "C:\Android\Sdk\platform-tools\adb.exe" shell settings put global animator_duration_scale 0

# 2. API
Start-Process "C:\Tools\doppler\doppler.exe" -ArgumentList "run -- pnpm --prefix C:\Dev\Projects\Products\Apps\eduagent-build exec nx dev api" -WindowStyle Hidden
do { Start-Sleep 3; try { $h = Invoke-WebRequest "http://localhost:8787/v1/health" -TimeoutSec 3 -EA Stop } catch {} } while ($h.StatusCode -ne 200)

# 3. Metro
Start-Process cmd.exe -ArgumentList "/c cd /d C:\Dev\Projects\Products\Apps\eduagent-build\apps\mobile && pnpm exec expo start --port 8081 --dev-client > C:\tools\tmp\metro.log 2>&1" -WindowStyle Hidden
Start-Sleep 8  # Metro needs a few seconds to bind

# 4. Proxy
Start-Process node -ArgumentList "C:\Dev\Projects\Products\Apps\eduagent-build\apps\mobile\e2e\bundle-proxy.js" -WindowStyle Hidden
Start-Sleep 2

Write-Host "All services up. Ready for Maestro flows."
```
