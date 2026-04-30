---
name: ABSOLUTE REQUIREMENT - Read emulator issues doc before ANY E2E work
description: HARD STOP - MUST read the FULL docs/E2Edocs/e2e-emulator-issues.md before any emulator boot, APK install, or test run. Re-read if stuck for >5 minutes.
type: feedback
---

## HARD STOP RULE — Non-negotiable

**NOBODY boots the emulator or starts the APK without reading the FULL `docs/E2Edocs/e2e-emulator-issues.md` file first.**

This is an absolute MUST. No exceptions. No skimming. Read the ENTIRE document.

**Why:** Hours have been wasted repeatedly because agents skim or skip this document, then spend 2+ hours debugging issues that are already solved in the doc. The user is tired of this recurring waste. The doc contains:
- Cold boot requirements after 55+ flow sessions (wipe-data needed)
- BUG-7: OkHttp chunked encoding fails on port 8081 — MUST use 8082 bundle proxy
- Correct AVD (E2E_Device_2, NOT New_Device which is corrupted)
- ADB reverse port forwarding setup
- Bluetooth disable procedure
- Maestro driver recovery procedures
- Session-specific operational notes

**How to apply:**
1. At the START of any E2E session or emulator interaction: read the FULL doc, cover to cover
2. If ANY problem takes more than 5 minutes to solve: STOP and re-read the doc from scratch
3. Follow the documented procedures EXACTLY — do not improvise or guess
4. If a new issue is found: add it to the doc before concluding the task
5. Pay special attention to the LATEST session entries (Session 20+) as they contain the most current operational state
