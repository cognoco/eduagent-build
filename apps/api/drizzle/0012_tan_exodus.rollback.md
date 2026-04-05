# Migration 0012 — Rollback Assessment

## What it does
- Drops `persona_type` column from `profiles` table
- Drops `persona_type` enum type from database

## Rollback possibility
**Rollback is NOT possible.** This is a destructive, one-way migration.

- The `persona_type` column data is permanently destroyed
- The enum type definition is removed
- No backup of persona_type values was taken before migration

## Recovery procedure
If persona_type data is needed again:
1. Re-create the enum: `CREATE TYPE persona_type AS ENUM ('learner', 'parent');`
2. Add the column back: `ALTER TABLE profiles ADD COLUMN persona_type persona_type;`
3. Data must be re-populated manually — original values are lost

## Context
persona_type was removed as part of Epic 12 (persona removal). The system now uses
birthYear + familyLinks + intent-as-cards instead of explicit persona types.
