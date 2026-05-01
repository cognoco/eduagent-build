---
name: EAS Update (OTA) — IMPLEMENTED
description: OTA updates via expo-updates implemented and merged (PR #98, 2026-04-03). JS-only changes deploy in ~5 min instead of ~60 min.
type: project
originSessionId: 894cc1c6-ffe9-4d5f-9138-18d1f23ee006
---
**Status: IMPLEMENTED (2026-04-03, PR #98 merged to main).**

`expo-updates` ~0.28.18 installed. `runtimeVersion` fingerprint policy configured in `app.json`. OTA jobs wired into both `ci.yml` and `mobile-ci.yml`.

**What it does:**
- JS-only changes → OTA update published to `preview` channel (~3 min)
- Native file changes (app.json, package.json, plugins/, eas.json) → full EAS build
- CI main must pass before OTA publishes (gated)
- Update-on-launch: blocks for up to 5 seconds, falls back to cached

**Key decisions (2026-04-02):**
- OTA goes in `ci.yml` (not mobile-ci.yml) to avoid cross-workflow polling
- Claude code review does NOT gate OTA — informational only
- Channels: development, preview, production (matching build profiles)

**Bootstrap:** First full build with expo-updates already done. OTA is operational.

**Latest manual OTA:** preview channel 2026-04-30, commit 07d29814* (redesign branch, dirty WT) — error-handling WIP (api-client/sse/format-api-error/api-errors typed errors) + mentor-memory + permissions. Update group `c6ba5b60-562c-41a8-aaa3-1f5d64a032e1`.

**Why:** User's feedback loop was 60 min per change. Most changes are JS-only. OTA cut this to ~5 min.

**How to apply:** After merging JS-only changes to main, OTA publishes automatically. No manual intervention needed. Full builds only trigger on native file changes.
