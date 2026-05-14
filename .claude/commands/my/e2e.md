# E2E Test Run — Mobile (Maestro on Android dev-client)

For background, conventions, and the full troubleshooting matrix, READ
`docs/E2Edocs/e2e-runbook.md` FIRST. This skill is the operational shortcut.

**The failure-handling loop (run → note failures → classify → fix code OR
fix test, never weaken → repeat) and the mock-on-touch rule live in
`/my:run-tests`. Read that before touching any failing test.** This skill
covers only the E2E-specific runner: emulator + Metro + Maestro setup.

## Arguments

$ARGUMENTS — Optional: flow file path relative to repo root (e.g.,
`apps/mobile/e2e/flows/quick-check.yaml`). If omitted, runs `quick-check.yaml`
as a smoke test against current UI state.

## Preconditions to check (run these first; fix any failure before continuing)

1. Emulator running and ADB sees it as `device` (not `offline`):
   ```bash
   adb devices
   ```
   If empty: ask the user to launch the emulator. Do NOT launch it yourself
   unless explicitly told to — the user manages emulator lifecycle by default.

2. APK installed (survives `-no-snapshot-load`; only `-wipe-data` removes it):
   ```bash
   adb shell pm list packages | grep mentomate
   ```
   If missing, the user needs to reinstall via EAS or `npx expo run:android`.

3. Metro running on port 8081 (start from main repo if absent):
   ```bash
   curl -s http://localhost:8081/status   # expect: packager-status:running
   ```
   If absent, start in background (this is OK to do unprompted). Run from
   the repo root — `apps/mobile` is a relative path so the snippet works on
   any contributor's machine:
   ```bash
   cd apps/mobile
   pnpm exec expo start --port 8081 --dev-client
   ```
   (Run in background; wait until `/status` responds.)

4. Working Maestro binary present:
   ```bash
   TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" /c/tools/maestro/bin/maestro --version
   ```
   Expect `2.4.0` or higher. If it errors with "Java 17 or higher is required",
   you're hitting the broken `~/.maestro/bin/` binary — the path needs to be
   the FULL `/c/tools/maestro/bin/maestro` (see runbook troubleshooting).

## Run the flow

Default — `quick-check.yaml` against current UI:

```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed apps/mobile/e2e/flows/quick-check.yaml
```

With $ARGUMENTS:

```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed $ARGUMENTS
```

For seeded flows (require API + Doppler):

```bash
C:/Tools/doppler/doppler.exe run -c stg -- bash apps/mobile/e2e/scripts/seed-and-run.sh \
  <scenario> $ARGUMENTS
```

## Categorize failures

Use the three-way classification from `/my:run-tests` (real bug / test drift / env). E2E adds one extra category in front:

- **Infrastructure failure** (emulator offline, Metro 404, Maestro driver
  timeout, UIAutomator lock): see runbook troubleshooting matrix.
  **15-min hard limit** on infra debugging — if not resolved, stop and report.
- **Real bug** (wrong text, missing element, navigation error, server 500):
  fix the production code. Do NOT modify the test or weaken assertions.
- **Test drift** (outdated testID, screen renamed, removed feature): rewrite
  the assertion against the current real UI. If the screen genuinely no
  longer exists, delete the whole flow file, not just the failing step.

For mock-touching tests opened during the loop (any Jest test you crack
open in support of an E2E failure), apply the GC6 mock-on-touch sweep from
`/my:run-tests`.

## Known issues to mention if relevant

- `pnpm test:e2e:smoke` is currently broken (PATH points at the Unicode-path
  broken Maestro binary). A Notion issue tracks the fix. Do not suggest as a
  workaround until fixed.
- `quick-check.yaml` will reliably fail the "Sign up" assertion (UI drift,
  not infra). 6/7 pass means infra is healthy.
- "Maestro driver did not start up in time" almost always means UIAutomator
  lock from a non-graceful kill of a previous Maestro run. Recovery: `adb reboot`.

## Update documentation after every run

Before you report back:

- **Pass/fail/blocked state of a flow changed** → update the flow table in `docs/flows/plans/2026-05-01-flow-revision-plan.md` (Tested, Result, Bugs, Notes columns).
- **New infra symptom encountered or workaround learned** → add a row to the troubleshooting matrix in `docs/E2Edocs/e2e-runbook.md`.
- **You touched a Jest test in support of an E2E failure** → see the documentation block in `/my:run-tests` (inventory regen, harness table, etc.).
- **You filed or resolved a Notion bug for an E2E failure** → update the Notion row per `/my:fix-notion-bugs`.

If none of the above applies, say so in the report. Silence is ambiguous.

## NEVER do

- Use `KEYCODE_BACK` from the dev launcher's main screen (exits the app).
  From a dev menu *overlay*, BACK dismisses the overlay correctly.
- Kill Maestro via Windows `taskkill` mid-flow — leaves UIAutomator lock
  stuck. Use `Ctrl+C` in the terminal.
- Use bash `taskkill /PID` to stop Metro — MSYS mangles `/PID` to a path.
  Use PowerShell `Stop-Process -Id <pid> -Force`.
- Use bash `adb shell <unix-path>` without `MSYS_NO_PATHCONV=1` — paths get
  mangled.
