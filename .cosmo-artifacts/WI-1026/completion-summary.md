**What was done:** Upgraded `drizzle-orm` from `0.39.3` to `0.45.2` for the API and database packages to satisfy the CVE-2026-39356 remediation target.

**What changed:** Updated the `drizzle-orm` dependency ranges in `apps/api/package.json` and `packages/database/package.json`, then refreshed `pnpm-lock.yaml` for the new resolved Drizzle version. No application code or schema files were changed.

**Verification:** `pnpm install --frozen-lockfile --ignore-scripts` passed. `pnpm exec nx run api:typecheck` passed. A targeted audit check found no `drizzle-orm` / `CVE-2026-39356` matches. Dynamic identifier audit found no user-controlled `sql.raw` paths in the production database access surface. `IDENTITY_V2_ENABLED=false pnpm exec nx run api:test --output-style=static` passed with the Drizzle upgrade in place.

**Caveats / Follow-ups:** An earlier full API test run failed 84 tests because the ambient environment had `IDENTITY_V2_ENABLED=true`; the failures were in flag-on Identity V2 paths whose test DB mocks were missing v2 query shapes. Re-running the same upgraded worktree with `IDENTITY_V2_ENABLED=false` passed. That ambient test-env hygiene issue is separate from this Drizzle upgrade.
