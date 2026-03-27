# E2E Test Run with Preflight Checks

Run E2E tests with mandatory infrastructure health checks first. This prevents multi-hour debugging spirals from dead Metro, disconnected emulators, or stale caches.

## Arguments

$ARGUMENTS — Optional: specific flow file(s) to run (e.g., `flows/smoke/app-launch.yaml`). If omitted, runs the full regression suite.

## Steps

### 1. Read E2E Documentation First

Read `docs/E2Edocs/e2e-emulator-issues.md` to refresh on known issues and tested solutions.

### 2. Preflight Health Checks

Run these checks IN ORDER. Fix any failures before proceeding. If a check fails and you cannot fix it in 2 minutes, STOP and report the specific failure to the user.

**Check A — Android Emulator:**
```bash
adb.exe devices
```
- Expect at least one `emulator-XXXX device` line
- If no emulator: report to user (do NOT try to launch emulators — the user manages emulator lifecycle)

**Check B — Metro Bundler:**
```bash
curl -s http://localhost:8081/status 2>/dev/null
```
- Expect `packager-status:running`
- If not running: report to user. Do NOT start Metro yourself — the user runs it in a separate terminal.

**Check C — App installed on emulator:**
```bash
adb.exe shell pm list packages | grep mentomate
```
- If not installed: report to user that a fresh APK build+install is needed.

**Check D — Maestro CLI:**
```bash
C:/tools/maestro/bin/maestro --version
```
- Expect a version string. If missing, report to user.

### 3. Run E2E Tests

If all preflight checks pass:

```bash
cd apps/mobile
```

If specific flows were requested via $ARGUMENTS:
```bash
C:/tools/maestro/bin/maestro test $ARGUMENTS
```

If no specific flows, run the full Tier 1 smoke suite:
```bash
C:/tools/maestro/bin/maestro test e2e/flows/smoke/
```

### 4. Report Results

After test execution, report results as a table:

| Flow | Result | Notes |
|------|--------|-------|
| flow-name.yaml | PASS/FAIL | Any relevant details |

### 5. Categorize Failures

For each failure:
- **Infrastructure failure** (Metro crash, emulator hang, Maestro driver error): Log in `docs/E2Edocs/e2e-emulator-issues.md` if it's a new issue. Do NOT retry more than once.
- **App bug** (wrong text, missing element, navigation error): Report the specific bug with screenshot if available. Do NOT modify app code to make the test pass.
- **Test bug** (outdated testID, wrong selector): Fix the test to match the current app UI (app code is source of truth).

### Rules

- **15-minute hard limit on infrastructure debugging.** If you cannot get the infra working in 15 minutes, stop and report.
- **Never weaken assertions** to make tests pass. Never add `optional: true` without genuine justification.
- **Update E2E docs** after the run: `e2e-test-results.md` with session entry, `e2e-test-bugs.md` if new bugs found.
