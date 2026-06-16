# Incident: drizzle-kit push run against staging (April 2026)

**Status:** Closed — remediated  
**Discovered:** 2026-04-04 (commit `86c44cafd`)  
**Closed:** 2026-06-10 (reset + guard)  
**Work Items:** `WI-795` (guard), `WI-569` (identity baseline reset)  

---

## What happened

During early development, the staging database (`mentomate-api-stg`) was set
up by running `drizzle-kit push` directly — the same workflow used for the dev
database. `drizzle-kit push` performs a live schema diff (TS schema → DB) and
applies the difference without creating committed migration files or recording
anything in `drizzle.__drizzle_migrations`.

At the time, the project rule was informal: "push is fine for dev; migrate for
staging/prod." No mechanical enforcement existed.

When the deploy pipeline switched from `drizzle-kit push` to `drizzle-kit
migrate` (April 2026), the staging database had a complete schema but an empty
`drizzle.__drizzle_migrations` journal — so `drizzle-kit migrate` tried to
replay every committed migration against the existing schema and failed with
"already exists" errors.

A `baseline-migrations.mjs` script was added to detect this state and seed the
journal with correct hashes before migrate ran (`packages/database/scripts/
baseline-migrations.mjs`, deployed via `.github/workflows/deploy.yml`).

## Evidence

**The push-versus-migrate gap** left several artifacts on staging that were
never in the committed migration chain:

| Artifact | How it arrived | How discovered |
|---|---|---|
| `organizations` table (49 rows), `memberships` table (28 rows), `membership_role` enum | Migration `0106_identity_t1_org_membership` was pushed to staging (journal row `id=107`) during T1 identity development; never in `_journal.json` effective chain | Reset execution log 2026-06-10 (WI-569) |
| Stale nudge migration (journal row `id=108`) | `0107_sturdy_monster_badoon` (nudge-direction migration, later renumbered out of the chain) was pushed; its artifacts (`nudges.direction` column, `nudge_direction` enum) ended up on staging | Reset execution log 2026-06-10 (WI-569) |
| `organization_invitations` table (T2-era, 0 rows) | Pushed during T2 development; absent from the staging `__drizzle_migrations` journal entirely — origin unaccounted | Reset execution log 2026-06-10 (WI-569) |
| `profiles.clerk_user_id`, `subscriptions.organization_id` | Pushed as part of T1 backfill; not in the committed chain until migration `0113_identity_stray_ddl` reconciled the drift | Migration 0113 comments |
| `__drizzle_migrations` ID gap | Serial IDs 107–108 from push-era artifacts; IDs 109 onward from the migrate era — the discontinuity is the push/migrate boundary | `drizzle.__drizzle_migrations` inspection (staging) |

**RLS selective survival:** Row-level security policies applied via dedicated
sweep migrations (e.g. `0029_rls_sweep_gaps.sql`, `0032_rls_quiz_mastery_items.
sql`, `0085_bug216_rls_policies_sweep.sql`) were correctly reflected on staging
because `drizzle-kit push` applied the cumulative TS schema state, which
included the RLS policy definitions. However, tables added via `push` that were
later removed from the TS schema definition before their RLS policies were
committed had those policies applied transiently and then dropped — leaving a
brief window where new tables had no RLS.

**Migration `0113_identity_stray_ddl.sql`** explicitly documents the residual:
"dev is push-managed (`db:push:dev`) and already at the TS-schema target state;
this migration brings the journal snapshot and any non-pushed environment
(staging) into agreement." This was the first evidence that staging and dev had
diverged in ways not captured in the committed chain.

## Impact

- **No user data was at risk.** Staging had only test/seed data; no real users.
- **T1 identity plan delayed.** The presence of `organizations`/`memberships`
  tables from the T1 push interfered with the identity-foundation baseline reset
  planning (MMT-ADR-0012), which had to account for their staged-but-not-
  committed existence before choosing the "create from empty" baseline approach.
- **Migration 0113 required.** Schema drift between the TS definitions and the
  staging DB required a reconciliation migration to make `drizzle-kit migrate`
  idempotent and prevent "already exists" failures on the next clean-slate CI DB.
- **`baseline-migrations.mjs`** was a temporary workaround for the initial
  empty-journal state; it ran on every deploy until the identity-foundation
  baseline reset replaced it with a clean migrate-from-0108 chain.

## Resolution

1. **Short-term (April 2026):** `baseline-migrations.mjs` seeds the
   `__drizzle_migrations` journal when it detects a push-initialized DB (tables
   exist, journal empty). Deployed in `.github/workflows/deploy.yml`.

2. **Reconciliation (June 2026):** Migration `0113_identity_stray_ddl.sql`
   brought the staging DB's schema and the committed chain into agreement via
   idempotent `CREATE IF NOT EXISTS` / `DROP IF EXISTS` guards.

3. **Identity baseline reset (2026-06-10, WI-569):** The one-time baseline reset
   (MMT-ADR-0012) created the 8-table identity schema from empty (`0108`), removed
   `0106`/`0107` from the effective chain, and cleaned the push-era artifacts
   (`organizations`, `memberships`, `organization_invitations`, stale columns/enums)
   from staging during the reset pass.

4. **Mechanical guard (2026-06-15, WI-795):** `packages/database/scripts/
   check-db-push-target.mjs` runs as a `predb:push` lifecycle hook and refuses
   to proceed if `DOPPLER_CONFIG` is not `dev` (or absent). The root `db:push:dev`
   script was changed to invoke `pnpm run db:push` (triggering the hook) rather
   than calling `drizzle-kit` directly. This closes the gap between the prose rule
   in AGENTS.md and mechanical enforcement.

## Lessons

- **Prose rules need mechanical enforcement.** "Never push against staging" as a
  doc rule is insufficient; the hook enforces it at the point of action.
- **`DOPPLER_CONFIG` is the reliable environment discriminator.** Hostname-based
  matching requires knowing the Neon endpoint names, which can change. Doppler's
  `DOPPLER_CONFIG` is always present when secrets are injected and unambiguously
  names the environment.
- **Push leaves no trail.** `drizzle-kit push` does not write to
  `__drizzle_migrations`. Any schema drift from a push run is invisible to
  `drizzle-kit migrate` until it fails on a conflicting DDL or produces a silent
  no-op. The migrate workflow must be the single path to shared environments.

## See also

- `docs/adr/MMT-ADR-0012-one-time-baseline-reset.md` — the baseline reset decision
- `apps/api/drizzle/README.md` — migration chain history and the 2026-06-10 reset record
- `packages/database/scripts/check-db-push-target.mjs` — the guard
- `packages/database/scripts/check-db-push-target.test.mjs` — regression tests
- `packages/database/scripts/baseline-migrations.mjs` — the push→migrate bootstrap workaround
- `packages/database/scripts/verify-db-target.mjs` — deploy-time DB target verification (BUG-782)
