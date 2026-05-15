---
name: E2E and emulator work — read the runbook first
description: Before troubleshooting Maestro/emulator/Android issues, consult docs/E2Edocs/e2e-runbook.md (OS-aware — macOS, Windows, Linux). Historical empirical-state snapshot archived at docs/_archive/E2Edocs/.
type: feedback
---

When you encounter ANY mobile E2E issue (emulator won't boot, Maestro fails,
"can't find process", `pnpm test:e2e:*` errors, dev-client black screen, etc.),
read `docs/E2Edocs/e2e-runbook.md` BEFORE attempting fixes. The runbook covers
macOS, Windows, and Linux/CI with OS-specific command variants.

For deeper context on what was verified vs. what was disproven on the original
Windows setup, see the archived empirical-state snapshot at
`docs/_archive/E2Edocs/e2e-2026-04-30-empirical-state.md`.

**Why:** A 2026-04-30 deep-troubleshooting session vaulted 2,358 lines of
contradicting historical docs into `docs/_vault/emulator-2026-04-30/` and
replaced them with this short, empirically-verified runbook. Many old vault
rules are now obsolete (BUG-7 proxy, adb reverse, Bluetooth disable, Doppler
for Metro). Following old habits wastes hours.

**How to apply:**
1. ALWAYS open `docs/E2Edocs/e2e-runbook.md` first when touching anything
   E2E/emulator/Maestro related. It's designed to fit in one Read call.
2. If the runbook doesn't have an answer, check `docs/_vault/emulator-2026-04-30/`
   for historical context — but treat it as inspiration, not authority.
3. The canonical entry point for running flows is
   `bash apps/mobile/e2e/scripts/seed-and-run.sh`, NOT `pnpm test:e2e:*`
   (which is currently broken on Windows — see runbook for details).
4. The `my:e2e` slash command is the operational shortcut — invoke it for
   any E2E run rather than constructing commands ad-hoc.
5. For general Maestro YAML patterns (testIDs, GraalJS, adaptive flows), the
   `my:maestro-testing` skill is authoritative. The runbook covers project +
   machine specifics.
