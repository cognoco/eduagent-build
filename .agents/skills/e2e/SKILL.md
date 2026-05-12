---
name: e2e
description: Use when the user asks to run, diagnose, or discuss EduAgent mobile E2E tests with Maestro on the Android dev-client, including quick smoke flows, seeded flows, emulator/Metro/Maestro preflight checks, and E2E failure triage.
---

# E2E

Run the EduAgent mobile Maestro flow only after checking the local Android dev-client prerequisites. Read `docs/E2Edocs/e2e-runbook.md` first when deeper troubleshooting is needed.

## Arguments

Treat the user request as an optional flow path relative to repo root, such as `apps/mobile/e2e/flows/quick-check.yaml`. If omitted, run `apps/mobile/e2e/flows/quick-check.yaml`.

## Preconditions

Check these before running the flow:

1. Emulator is connected:

   ```bash
   adb devices
   ```

   If no device is listed as `device`, ask the user to launch the emulator. Do not launch it unless explicitly asked.

2. Dev-client APK is installed:

   ```bash
   adb shell pm list packages | grep mentomate
   ```

   If missing, the user needs to reinstall via EAS or `npx expo run:android`.

3. Metro is running on port 8081:

   ```bash
   curl -s http://localhost:8081/status
   ```

   If absent, start it in the background from `apps/mobile` with `pnpm exec expo start --port 8081 --dev-client`, then wait for `/status`.

4. Use the known-good Maestro binary:

   ```bash
   TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" /c/tools/maestro/bin/maestro --version
   ```

   If Java/version errors mention `~/.maestro/bin`, use the full `/c/tools/maestro/bin/maestro` path.

## Run

Default smoke flow:

```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed apps/mobile/e2e/flows/quick-check.yaml
```

Specific flow:

```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed <flow-path>
```

Seeded flows require Doppler staging config:

```bash
C:/Tools/doppler/doppler.exe run -c stg -- bash apps/mobile/e2e/scripts/seed-and-run.sh \
  <scenario> <flow-path>
```

## Failure Triage

- Infrastructure failure: emulator offline, Metro 404, Maestro driver timeout. Use the runbook and stop after 15 minutes if unresolved.
- App bug: wrong text, missing element, or navigation error. Report observed state and testID. Do not modify app code just to satisfy a stale test.
- Test bug: outdated testID or deprecated setup. Update the test to match current app behavior.

## Known Local Issues

- `pnpm test:e2e:smoke` is currently unreliable because PATH may point at a broken Unicode-path Maestro binary.
- `quick-check.yaml` may fail the "Sign up" assertion due to UI drift; 6/7 passing can still mean infra is healthy.
- "Maestro driver did not start up in time" usually means a UIAutomator lock from a previous non-graceful kill. Recovery is `adb reboot`.

## Never

- Do not use `KEYCODE_BACK` from the dev launcher's main screen.
- Do not kill Maestro with Windows `taskkill` mid-flow.
- Do not use bash `taskkill /PID`; use PowerShell `Stop-Process -Id <pid> -Force`.
- Do not use bash `adb shell <unix-path>` without `MSYS_NO_PATHCONV=1`.
