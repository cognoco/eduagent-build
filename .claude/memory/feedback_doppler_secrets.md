---
name: Doppler for secrets management
description: All secrets go through Doppler. EXPO_PUBLIC vars synced from Doppler into eas.json by setup-env.js. Doppler CLI installed locally.
type: feedback
---

All secrets are managed through Doppler — including EXPO_PUBLIC_* vars for mobile builds.

**Local CLI:** Doppler CLI v3.75.3 installed at `C:\Tools\doppler\doppler.exe` (ASCII path — same Unicode-avoidance pattern as Android SDK at `C:\Android\Sdk`). PATH set for both Windows User (PowerShell/CMD) and `.bashrc` (Git Bash). Installed 2026-03-28.

**Doppler → eas.json sync (implemented 2026-03-29):** `scripts/setup-env.js` downloads EXPO_PUBLIC_* vars from all 3 Doppler configs (dev/stg/prd) and writes them into the corresponding `eas.json` build profiles (development/preview/production). Run `pnpm env:sync` after changing values in Doppler, then commit the updated `eas.json`.

**Remaining EAS exception:** Sensitive build secrets (e.g., `SENTRY_AUTH_TOKEN`) still go to EAS Secrets via `eas secret:create` — these cannot go in committed files.

**Why:** The user has a centralized secrets pipeline via Doppler. Suggesting `wrangler secret put`, Cloudflare dashboard manual entry, or any other direct secret management bypasses their workflow.

**How to apply:** For all secrets, say "add to Doppler." For mobile EXPO_PUBLIC_* vars, add to Doppler then run `pnpm env:sync` to update eas.json. For sensitive EAS build secrets, use `eas secret:create`. Never suggest `wrangler secret put` or direct Cloudflare dashboard entry. Also added as a global rule in `~/.claude/CLAUDE.md`. Doppler CLI is available locally at `C:\Tools\doppler\doppler.exe`.
