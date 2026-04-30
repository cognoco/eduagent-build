---
name: Neon HTTP transaction facts (verified 2026-04-27)
description: Verified facts about neon-http transaction support and db.batch() atomicity — corrects two wrong claims in the original RLS plan
type: project
originSessionId: 44bc1dc6-a390-461c-b9ab-c27ed61a5b20
---
Driver / atomicity facts verified against published packages on 2026-04-27. These supersede the original `2026-04-15-S06-rls-phase-0-1-preparatory.md` Context table.

## Facts

1. **`drizzle-orm` `neon-http` does NOT support interactive transactions in any released version.**
   - `0.39.3` (installed): `NeonHttpSession.transaction` and `NeonTransaction.transaction` both throw `"No transactions support in neon-http driver"` unconditionally.
   - `0.45.2` (latest stable as of 2026-04-27): same behavior.
   - `1.0.0-beta.9-e89174b` (latest beta): same behavior.
   - **Implication:** Option A ("upgrade drizzle for transactions") is permanently dead. Don't re-verify.

2. **`db.batch([...])` IS ACID** — original plan claim "not ACID, no rollback on partial failure" was WRONG.
   - It calls `@neondatabase/serverless` HTTP client's `transaction([queries])`.
   - Neon's official docs and `index.d.ts` JSDoc state verbatim: *"The transaction() function allows multiple queries to be submitted (over HTTP) as a single, non-interactive Postgres transaction."*
   - Supports `isolationMode` (ReadCommitted, RepeatableRead, Serializable), `readOnly`, `deferrable`.
   - Server-side BEGIN/COMMIT — partial-failure rollback works.
   - **Limitation:** non-interactive (queries declared up-front, no read-then-decide-then-write within one batch).

3. **`@neondatabase/serverless` (HTTP) supports atomic non-interactive transactions; only the `neon-serverless` (WebSocket) driver supports interactive (callback-style) transactions.**

## How to apply

- For any `db.transaction(...)` site that's a fixed sequence of writes (no branching on intermediate reads): use `db.batch([...])`. Real atomicity, no driver change.
- For sites that need interactive transactions (callback with branching logic, or `withProfileScope` `SET LOCAL` + arbitrary callback body): need the `neon-serverless` WS driver.
- The 14 `db.transaction(...)` sites in the codebase (as of 2026-04-27) need per-site triage — most likely batch-compatible, only `withProfileScope` is known to be truly interactive.

## Why this matters

The RLS scaffolding at `packages/database/src/rls.ts` uses `db.transaction(...)` and is currently a silent no-op because of the unconditional throw → fallback chain in `packages/database/src/client.ts:21-37`. This is documented in the updated `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` plan with a "Pre-Phase-3 Gate" — Phase 3 of the enforcement plan must NOT ship until the silent fallback is replaced and an integration test proves `SET LOCAL` propagates.

## 14-site I/B/S audit (2026-04-27) — summary

12 of 14 `db.transaction()` sites need WS driver (Interactive); only 2 are batch-safe (`consent.ts:199`, `curriculum.ts:1340`); 0 can be deleted. Full table in plan's "Audit Results" section. Key finding: 6 sites have **live production races** currently hidden by the silent fallback (filing, home-surface-cache, parking-lot-data, settings, profile advisory-lock, consent atomicity). Open Notion tickets per the plan checklist.

## SET LOCAL cross-request leak (2026-04-27) — REFUTED

Investigated and refuted for the current code. Postgres docs ([sql-set](https://www.postgresql.org/docs/current/sql-set.html)) state `SET LOCAL` outside a transaction emits a warning and has no effect. Neon's PgBouncer runs in transaction mode and recycles connections per-transaction, so even plain `SET` over HTTP would not survive across requests. The current `withProfileScope` is a correctness bug (RLS GUC never set → policies see NULL), not a security leak. **Future regression risk:** if someone changes `SET LOCAL` to plain `SET` AND the codebase later switches to `neon-serverless` Pool/Client (persistent connections), the leak becomes real. Plan's Phase 0.3 includes a regression guard for this.

## Driver decision (recommended 2026-04-27 post-audit)

Option B (full WebSocket switch via `drizzle-orm/neon-serverless`). The audit's 12-of-14 WS-required count makes Option C (dual-client) cost roughly the same as Option B without the "isolation" benefit. Option D (`db.batch()` for batch-safe sites only) saves ~15% of the work. Plan's Phase 0.0 has been updated to reflect this.
