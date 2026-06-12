---
name: Doppler for secrets management
description: All secrets go through Doppler. EXPO_PUBLIC vars synced from Doppler into eas.json by setup-env.js. Doppler CLI installed locally.
type: feedback
---

All secrets are managed through Doppler — including EXPO_PUBLIC_* vars for mobile builds. The standing rule (and the `wrangler secret put` prohibition) is canon in `AGENTS.md § Secrets Management`; the full mobile-secrets flow is in `docs/deployment-and-secrets.md`.

**Local CLI:** Doppler CLI v3.75.3 installed at `C:\Tools\doppler\doppler.exe` (ASCII path — same Unicode-avoidance pattern as Android SDK at `C:\Android\Sdk`). PATH set for both Windows User (PowerShell/CMD) and `.bashrc` (Git Bash). Installed 2026-03-28.

**Doppler → eas.json sync (implemented 2026-03-29):** `scripts/setup-env.js` downloads EXPO_PUBLIC_* vars from all 3 Doppler configs (dev/stg/prd) and writes them into the corresponding `eas.json` build profiles (development/preview/production). Run `pnpm env:sync` after changing values in Doppler, then commit the updated `eas.json`.

**Remaining EAS exception:** denylisted sensitive vars (e.g., `EXPO_PUBLIC_SENTRY_DSN` — full list in `EAS_JSON_DENYLIST`, `scripts/setup-env.js`) are never written to committed `eas.json`; EAS Build pulls them from EAS Environment Variables, set via `eas env:create` (see `docs/deployment-and-secrets.md` § EAS Environment Variables).

**Why:** The user has a centralized secrets pipeline via Doppler. Suggesting `wrangler secret put`, Cloudflare dashboard manual entry, or any other direct secret management bypasses their workflow.

**How to apply:** For all secrets, say "add to Doppler" (rule canonised in `AGENTS.md § Secrets Management`). For mobile EXPO_PUBLIC_* vars, add to Doppler then run `pnpm env:sync` to update eas.json. For denylisted sensitive build vars, use `eas env:create`. Never suggest `wrangler secret put` or direct Cloudflare dashboard entry. Doppler CLI is available locally at `C:\Tools\doppler\doppler.exe`.
