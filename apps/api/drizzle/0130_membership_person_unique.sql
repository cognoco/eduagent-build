-- 0130_membership_person_unique.sql
-- WI-1303 (WS-37 Seam Hardening, audit doc 06 finding R8) — promote the
-- one-membership-per-person invariant (one org = one household,
-- MMT-ADR-0010) from convention + the identity-resolve fail-closed read
-- guard (resolveIdentityV2 in identity-resolve.ts) to a DB-layer constraint.
--
-- The existing "membership_person_org_unique" composite index only rejects a
-- duplicate row for the SAME (person_id, organization_id) pair; it does
-- nothing to stop a second membership row for the same person in a
-- DIFFERENT org. This migration adds a plain UNIQUE index on person_id
-- alone, which is a strict superset of the composite constraint (so the
-- composite index is left in place rather than removed — no behavior
-- depends on its removal and dropping it is out of scope for this WI).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WI-1565 (P1 staging deploy blocker) — PREFLIGHT DEDUP + in-place edit.
--
-- This file was edited AFTER it was committed but BEFORE it applied to any
-- real environment. The original file's "Data safety" claim (that no path
-- ever writes two membership rows for one person_id) turned out to be FALSE
-- on staging: a dashboard test-seed run wrote 3 persons each holding an
-- `{admin}` membership in one org and a `{learner}` membership in another,
-- so the bare `CREATE UNIQUE INDEX` aborted `drizzle-kit migrate` and the
-- staging deploy went red. A forward migration numbered AFTER 0130 cannot
-- fix this: fail-fast `drizzle-kit migrate` hits 0130 first and aborts before
-- any later migration runs, and once 0130 has applied the index already
-- forbids dupes so a later dedupe is a no-op. The dedupe therefore has to
-- run in the SAME migration, immediately before the index — the standard
-- "dedup preflight then unique index" shape (precedent: migration 0044).
--
-- Verified UNAPPLIED on staging AND prod before this edit (index absent on
-- both; 0130 hash absent from `__drizzle_migrations` on both), so BUG-886's
-- re-run-drift rationale (editing an *applied* migration replays its DDL and
-- drifts the schema) does not apply here. This is the same edit-while-
-- unapplied maintenance case already allowlisted for 0124/0128 under ic-362.
-- Operator-authorized via bug-lane orch-130 (2026-07-04), ref outbox
-- bug-lane-1783158041. Allowlist entry: scripts/migration-immutability-allowlist.json.
--
-- Survivor rule — KEEP THE NEWEST membership per person_id (ORDER BY
-- created_at DESC, tiebreak id DESC), delete the rest. This is deliberately
-- the OPPOSITE of 0044's keep-oldest rule, and follows MMT-ADR-0010: a person
-- ends with one home org; the newest membership is the org they most recently
-- joined/were-placed-in (e.g. the family org in the join flow, added before
-- the older org-of-one is decommissioned), so the newest row is the intended
-- survivor. On the actual staging data the choice is immaterial — the dupes
-- are throwaway "Dashboard Test Org" seed rows.
--
-- FK safety: membership.id is referenced by NO child table (no `membership_id`
-- column and no `REFERENCES "membership"` exists anywhere in the schema or the
-- migration chain), so deleting the losing rows orphans nothing and needs no
-- re-pointing (unlike 0044's curriculum_books children). membership's own FKs
-- (person_id, organization_id) are inbound; deleting a membership row does not
-- cascade to person or organization. Prod carried 0 duplicate person_id groups
-- at authoring time, so the DELETE is a no-op there; staging carried 3.
--
-- ## Rollback
-- Index side is fully reversible, no data loss: DROP INDEX
-- "membership_person_id_unique". The composite "membership_person_org_unique"
-- index is untouched by this migration and continues to guard against
-- exact-duplicate rows regardless of rollback.
--
-- The PREFLIGHT DEDUP DELETE is NOT reversible: the losing membership rows are
-- permanently removed — dropping the index does not restore them. Data lost =
-- the non-surviving membership row(s) (their id, roles, and org association)
-- for each de-duplicated person; the Person and all learning history ride
-- person_id (MMT-ADR-0007) and are unaffected. Recovery, if ever needed, is a
-- point-in-time restore from a pre-migration database snapshot; there is no
-- in-DB undo. On staging the deleted rows are disposable test-seed data.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- PREFLIGHT DEDUP: keep the newest membership per person_id, delete the rest.
-- Idempotent — after dedup every person has exactly one row, so a re-run
-- selects no rn > 1 rows and deletes nothing.
DELETE FROM "membership"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "person_id"
        ORDER BY "created_at" DESC, "id" DESC
      ) AS rn
    FROM "membership"
  ) ranked
  WHERE rn > 1
);

-- IF NOT EXISTS so re-running on an already-indexed DB is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS "membership_person_id_unique" ON "membership" USING btree ("person_id");

COMMIT;
