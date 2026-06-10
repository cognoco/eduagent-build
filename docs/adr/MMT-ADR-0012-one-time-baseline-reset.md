# MMT-ADR-0012 — One-time baseline reset for the identity data-model

**Status:** Accepted · 2026-06-04 · **Scope:** the pre-launch, one-time collapse of the migration
chain to a fresh baseline (Phase E ruling **D1**). · **Deciders:** Architect (jjoerg) + Claude
· **Realizes:** `docs/canon/identity/data-model.md` §1 (the cut) · **Builds on:**
`MMT-ADR-0000` §I.4 (lockstep lifecycle); the project rule that staging/prod use committed,
append-only migrations.

> **Placement.** Global L2 from birth; lockstep partner is the Phase-E data-model doc and the
> baseline migration itself (in Phase F). Companion to `MMT-ADR-0011` (the data-model
> realization), which assumes this reset.

## Context

Two pieces of pre-launch legacy are not safely *evolvable* to the target:

- **`T1` — stage 1 of the old staged-identity plan (T1→T6); abandoned in favour of one clean cut; never got past stage 1.** Its single shipped artifact is migration **`0106` — "identity_t1_org_membership"; created empty `organizations` + `memberships` tables plus a data-copy backfill; zero readers/writers; slated to be undone.** On a clean baseline, "undo it" is a wasted migration; "rewrite history" is a documented reset.
- The current **`consent_states` — table with `UNIQUE(profileId, consentType)`, no `organizationId`, no controller-role; revoke is one global flip; the `I-D1` cross-org-consent blocker (verified from schema, counsel walkthrough 2026-06-03).** Evolving it in place means *both* carrying the UNIQUE shape forward *and* the half-migration anti-pattern counsel explicitly warned about.

The "forward-only revert" mechanic was the provisional call — chosen when the database was
assumed to hold data worth protecting. The pre-launch, **zero-data** reality (no real users in
production) reopens that call: with nothing to migrate, the cost of a one-time documented reset
is essentially zero, and the cost of carrying archaeology forward is permanent.

The clean baseline delivers three things the forward-only revert cannot: (a) the schema and the
design doc are **one artifact**; (b) no four-file-per-table archaeology for any future reader;
(c) append-only discipline resumes from a known, *clean* point, with no exception or carve-out.

## Decision

**Collapse the migration chain to a single clean baseline at the start of Phase F, documented and recorded. From this baseline forward, append-only migrations are absolute — no future exceptions.**

Concretely:

1. The migration **`0106` and its backfill** (and any consent-revoke shape carried by `consent_states` that the target schema doesn't reproduce) are **removed from the effective chain** — not undone with a follow-up migration. This is the "documented reset" — recorded in the migrations directory README and in the Phase-F handoff.
2. **One** baseline migration in Phase F creates the eight target tables (`person`, `organization`, `membership`, `subscription`, `guardianship`, `supportership`, `consent_grant`, and the `person_retain` set) from empty. The design doc (`data-model.md` §1, §2) and the first migration are the *same* statement.
3. **From this baseline forward, append-only migrations are absolute.** No future squash, rewrite, or carve-out. The reset is the only exception — ever.
4. The reset is **visible to a future contributor**: a `## Baseline` section in the migrations dir, dated 2026-06-04, pointing at this ADR; the next contributor sees the cutoff and trusts the chain after it.

## Consequences

- **Dev DBs and staging need a one-time reset** (cheap; no production data to migrate; CI seeds the baseline for future test runs). The `/scripts/check-change-class.sh` migration-check and any local-DB scripts are updated to point at the baseline.
- **The schema and the design doc are one artifact.** Reading `data-model.md` §1 + the first migration tells the same story; no diff required.
- **`I-C1` (consent-receipt-survives-deletion) and `I-D1` (cross-org consent) both have structural fixes by virtue of starting fresh.** The new `consent_grant` is org-scoped from birth; the new `person_retain` set is built into the baseline, not bolted on.
- **The C1 forward-only ratchet (the CI guard named in the counsel handoff) is installable against the new baseline** — it cannot regress to a `consent_states`-shape column because that table doesn't exist.
- **`D7`'s index note (the `birth_date` / `last_activity` index pair) lands in the baseline**, not as a follow-on migration, because the tables are born with the indexes.
- **Future contributors can trust the migration chain as monotonic from this point**, with one documented exception.
- **The D1 baseline-statement resolves a small but real cost in the Phase-F rebase:** without the squash, every "fix the schema" branch would carry a 5–8-migration archaeology to understand; with the squash, every "fix the schema" branch starts from the same clean target.

## Alternatives considered

1. **Forward-only revert (the prior provisional call).** Add new migrations to drop the dead tables and build the target.
   *Rejected:* the pre-launch zero-data window makes archaeology free-to-avoid and costly to keep. Every future reader of any table pays the four-file-per-table tax indefinitely. The mechanic was a protection-for-data call, and there is no data to protect.
2. **Unrecorded squash.** Collapse the chain silently, or via a `git rebase -i` on the migration dir without a record.
   *Rejected:* a history clobber that no future contributor can trust. The next person to read the migrations dir would see what looks like a clean chain and miss that the project once had a different shape — exactly the kind of undocumented history that "fixes" the wrong thing. The reset must be *visible*.
3. **Defer the reset to post-launch.** Keep forward-only through the first launch, do the reset later.
   *Rejected:* the reset is *free* now (no data) and *costly* later (every launch is a permanent data shape that would have to be migrated). The window to do it without consequence is *this* window.

## What this ADR does NOT do

- Run the baseline migration. (Phase F.)
- Modify CI or the Drizzle migration tooling. (Phase F.)
- Make a call on the **`inv 17` rephrase — the open architect call flagged by counsel at `I-PB-B3a`**. The baseline carries the consent gate per the ratified model; whether `inv 17` rewords lives with the architect and does not gate the data model.
- Pick a retention-period value. (Counsel.)
- Pick a VPC vendor. (Procurement, post-legal.)
