---
name: Manual OTA must set target env vars explicitly
description: eas update does NOT read eas.json build profile env — local .env.local poisons OTA bundles with wrong API URL
type: feedback
---

Manual OTA pushes MUST set the target environment's env vars explicitly. Never rely on `.env.local` — it has dev URLs that will silently switch the app to the wrong API.

**Preview/staging OTA:**
```bash
EXPO_PUBLIC_API_URL="https://api-stg.mentomate.com" \
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_d2hvbGUtaWd1YW5hLTkuY2xlcmsuYWNjb3VudHMuZGV2JA" \
eas update --branch preview --message "your message"
```

**Why:** `eas update` does NOT read the `env` block from `eas.json` build profiles. It uses whatever `EXPO_PUBLIC_*` vars are in the process environment. The local `.env.local` has dev API URL (`mentomate-api-dev.zwizzly.workers.dev`), which causes the app to talk to the dev API + empty dev Neon — breaking auth and creating phantom accounts in the wrong database. This caused a silent sign-out loop on 2026-04-06.

**How to apply:** Whenever running `eas update` manually (not from CI), always prefix the command with the target env vars. CI workflow (`ci.yml`) has been fixed to include these vars explicitly in the OTA step.
