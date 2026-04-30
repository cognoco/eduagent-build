---
name: Never run OTA without explicit user request
description: Do not run eas update (manual OTA) unless the user explicitly asks for it
type: feedback
---

Never run `eas update` unless the user explicitly asks for it. Push and commit are fine when requested, but OTA publishing is a separate action that requires explicit instruction.

**Why:** OTA publishes a live bundle to real devices. The user wants to control when that happens — it's a deployment action, not a build/push action.

**How to apply:** When the user says "push it" or "commit and push", do only that. Only run `eas update` when the user specifically says "OTA", "eas update", or similar.
