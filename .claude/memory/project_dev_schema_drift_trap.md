---
name: Dev environment schema drift — investigation trap
description: When mentomate-api-dev throws "column X does not exist", the fix is db:push:dev + db:generate. Do NOT send the user to check Doppler configs or run Neon diagnostic queries — that loop wasted a full session.
type: project
originSessionId: 4a47e2eb-7781-4413-bf1b-5117ee66f0bf
---
## The Incident (2026-04-17)

`mentomate-api-dev` threw `column "birth_date" does not exist` — 4 consecutive Sentry captures on `/home`. Resolved by `pnpm run db:push:dev`. Error was real, not transient.

## The Environment Naming Trap

These are NOT the same thing:

| Name | What it is |
|------|-----------|
| `mentomate-api-dev` Worker | The Cloudflare Worker the mobile app talks to (`.env.local` → `EXPO_PUBLIC_API_URL`) |
| "staging" branch in Neon console | The Neon branch for `mentomate-api-stg` (the staging Worker) — DIFFERENT database |
| Doppler `dev` config | Holds `DATABASE_URL` for `mentomate-api-dev` Worker — points at a Neon branch NOT labeled "staging" |

Running diagnostic queries on the Neon "staging" branch will show clean results even when `mentomate-api-dev` is broken — you're looking at the wrong DB.

## When You See `column "X" does not exist` on the Dev API

**Do this, in order:**

1. `pnpm run db:push:stg` — syncs current Drizzle schema to the staging Neon branch
2. `pnpm run db:generate` — checks if drift needs a committed migration (commit if it produces a file)
3. Restart the dev server / reload the mobile preview

**Do NOT:**
- Ask the user to check Doppler `dev` config DATABASE_URL (they've done this before, it wastes time)
- Run pg_views/pg_policies/pg_proc queries on the Neon "staging" branch (wrong DB)
- Send the user to Cloudflare Workers Observability (it was disabled on `mentomate-api-dev`)

## Why db:push:dev Works

`db:push:dev` pushes the current Drizzle TypeScript schema directly to whatever Neon branch Doppler's `dev` config points to. It bypasses the migration system, so it's fast but leaves no migration trail. Always follow with `db:generate` to capture any committed diff.

## Follow-Up Still Open (as of 2026-04-17)

- Run `db:generate` to check if the push created uncommitted drift
- Enable Cloudflare Workers Observability on `mentomate-api-dev` (currently disabled — had to diagnose blind)
- Record the blank-screen-on-500 UX bug in Notion (separate from DB issue)

**Why:** The DB fix is temporary if no migration is committed. A fresh Neon branch restore, a new developer, or a CI reset will reproduce the drift.
