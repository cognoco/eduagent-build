---
name: loadDatabaseEnv — Windows-only Doppler probe
description: packages/test-utils/.../load-database-env.ts hardcodes C:/Tools/doppler/doppler.exe. On macOS/Linux, only the env-var path of the resolver fires.
type: project
---

# `loadDatabaseEnv` Doppler probe is Windows-only

## What

`packages/test-utils/src/lib/load-database-env.ts` resolves test secrets in this order:

1. `process.env.DATABASE_URL` already set → use it
2. `.env.test.local` / `.env.development.local` files
3. **Doppler CLI** at hardcoded path `C:/Tools/doppler/doppler.exe`

```ts
const DOPPLER_CLI = 'C:/Tools/doppler/doppler.exe';
function loadFromDoppler(): boolean {
  if (!existsSync(DOPPLER_CLI)) { return false; }
  // … fetch via execSync
}
```

## Consequence on macOS/Linux

The Doppler-CLI fallback never fires because the Windows path doesn't exist. Only path #1 (env-var pre-set) works. That's fine if you wrap the test command externally with `doppler run --project mentomate --config dev --` — Doppler sets `DATABASE_URL` in `process.env` before the test process starts, so path #1 picks it up.

Without the external wrap, you get the warning:
> `⚠️ DATABASE_URL is unset and Doppler CLI unavailable.`

## Workaround in place

Archon's `zdx-validate.sh` / `zdx-push.sh` (this user's machine) do the `doppler run` wrap automatically when `zdx-config.yaml` declares `zdx.validate.doppler.{project, config}`. For manual local runs, wrap explicitly.

## Fix to apply (tracked as follow-up WI)

Probe multiple platform paths:
- macOS Homebrew: `/opt/homebrew/bin/doppler`
- Linux: `/usr/local/bin/doppler`, `~/.local/bin/doppler`
- Generic: respect `DOPPLER_CLI` env var if set
- Or: just use `which doppler` / `command -v doppler`

WI tracking this lives in the Mentomate project in the ZDX Work Items DB (filed 2026-05-23 alongside the validate/pre-commit gap fix).
