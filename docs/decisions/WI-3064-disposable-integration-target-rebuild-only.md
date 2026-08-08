# WI-3064 — Is the disposable API-integration target rebuild-only, or may it be migrated forward?

**Status:** Decided — **(a) rebuild-only by contract**, with the ergonomics remedy
redirected at the authorization prose rather than at a migration path.

**Type:** Design decision. **Not** an ADR: the decision is cheaply reversible (a
migrate-forward mode can be added later without unwinding anything), so it does not clear
the significance gate in [`MMT-ADR-0000`](../adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md).

**Surface:** `scripts/bootstrap-api-integration-schema.mjs`
· `packages/database/scripts/verify-disposable-integration-target-lib.mjs`
· [`docs/runbooks/local-db-testing.md`](../runbooks/local-db-testing.md)

**Evidence:** FO-2098 / OCC-6D422E4F7F43. The 2026-08-03 drift blocked **WI-2643**
(`public.pending_clerk_erasure` absent, SQLSTATE 42P01, reconfirmed by read-only catalog
check) and failed 10 guardian-attachment tests (`guardian_authority_redemptions`).
Destroy-and-recreate fixed the instance. **WI-3041** landed a fail-fast guard, so a
recurrence is detected sooner but still needs an operator-authorized destroy.

---

## Family placement — read this before filing it with the CI work

This is **NOT** the CI/reviewer-integrity family (WI-3058, WI-3061, WI-3014). Those are
gates that let a bad state pass **silently**. Here the gate **refuses correctly** — it
detects real drift and declines to mutate an untrusted target. The only question is
whether the remedy it *demands* is the right one. Different failure family, different fix
discipline. (Preserved per the PM note on the WI-3064 row.)

---

## The decision

**The disposable API-integration target is rebuild-only by contract.** No
migrate-forward mode is added.

### Why — the trust model is fingerprint-based, and migration is what breaks it

The bootstrap's guarantee is not "the schema is probably right." It is: *this target
holds exactly this revision's schema, and that is proven by fingerprint.* The marker
(`zdx_integration_bootstrap.schema_state`) records `targetId`, `revision`,
`chainFingerprint`, and a live schema `fingerprint`, and the bootstrap refuses unless all
of them agree with a revision-pinned migration journal.

A migrate-forward path replays migrations onto an already-populated target. The resulting
schema is then only as trustworthy as the migration chain that produced it — which is
precisely the property the fingerprint check exists to *stop trusting*. It would replace a
verified identity with an inferred one.

This repo already carries the scar from the other choice. Dev Neon is push/direct-only
because its migration journal drifted once and a `migrate` would now replay unjournaled
migrations and abort on already-exists collisions (`AGENTS.md` § Schema And Deploy Safety;
`.claude/memory/project_schema_drift_pattern.md`). That is the same failure, one
environment over, and it is unrecovered years later. Adding forward-migration to the one
target explicitly designed to be disposable would import that risk for no gain.

### Why the cost of rebuilding is near zero

The target is **disposable by construction**: it holds no data anyone needs. It is
provisioned for integration tests and its contents are derived, never authored. So
forward-migration buys exactly one thing — wall-clock time — and pays for it with the
verification guarantee. That is a bad trade at any price.

### The real problem is authorization prose, not a missing migration path

The recurrence complaint is genuine: every schema change staleness-fails the marker, and
each recurrence has needed an operator-authorized destroy, which parks items. But the
diagnosis "we lack a migration path" is wrong. **We lack a clear statement of what the
existing authorization actually covers**, and the script's own text is the reason.

The two sources disagree:

| Source | What it says the ruling is scoped to |
|---|---|
| `docs/runbooks/local-db-testing.md` (l.45, l.52) | "a specific ruling for the exact **disposable target**" · `--operator-ruling "<durable ruling reference>"` |
| `scripts/bootstrap-api-integration-schema.mjs` → `verificationRefused()` | "named operator authorization for the exact disposable target **and revision**" |

The runbook describes a **durable, target-scoped** ruling. The refusal text describes a
**per-revision** one. An agent or operator who hits the refusal reads the refusal, not the
runbook — so every schema change looks like it needs a *fresh* ruling.

**Nothing in the code requires that.** `assertOptions()` validates only that
`--operator-ruling` is a non-empty, single-line string of ≥8 characters. It is never
checked for freshness, uniqueness, or any relation to the revision; the marker and receipt
record it purely as an audit string. The per-revision requirement exists **only in the
refusal prose**.

So the ergonomics gap is real but self-inflicted, and the fix is to make the contract say
what it means — not to weaken it.

---

## Options as evaluated

### (a) Rebuild-only by contract — **CHOSEN**

- **Summary:** Keep destroy-and-recreate as the only remedy. Make the contract explicit,
  and correct the refusal text so a durable target-scoped ruling is recognisably reusable
  across revisions.
- **Effort:** Low — prose alignment in one refusal path plus the runbook.
- **Risk:** Low. No change to the state machine, the fingerprint checks, or the fail-closed
  behaviour. Verification guarantee untouched.
- **Pros:** Preserves the fingerprint trust model; keeps the target genuinely disposable;
  removes the recurrence friction at its actual source; no new code path to test or drift.
- **Cons:** Rebuild wall-clock cost remains on every schema change. Accepted — it is the
  price of a verified target, and it is paid by a machine, not a person.
- **Reuses:** The existing marker/fingerprint machinery and WI-3041's fail-fast guard,
  both unchanged.

### (b) Sanctioned migrate-forward mode — **REJECTED**

- **Summary:** Add a mode that replays migrations onto an existing target, with
  post-migration drift verification against the recorded schema.
- **Effort:** High — a second state-machine path through the most safety-critical script in
  the database tooling, plus its own mutation-sensitive tests.
- **Risk:** **High, and structurally so.** The post-migration drift check is the whole
  safety argument, and it is the part most likely to be weakened later under time pressure
  — at which point the target silently becomes untrustworthy while still reporting ready.
- **Pros:** Avoids rebuild wall-clock on routine schema changes.
- **Cons:** Trades a verified identity for an inferred one on the single target whose
  entire justification is disposability; doubles the mutation surface of a fail-closed
  script; imports the dev-Neon journal-drift failure mode into a new environment.
- **Reuses:** Little — the existing path is built around "empty target or trusted marker",
  which a migrate mode does not fit.

**Deciding factor:** the target has no data worth preserving, so (b) spends the
verification guarantee to buy only time — while (a) removes the actual recurring cost,
which was never the rebuild.

---

## Consequences / follow-up

The alignment work is **named here as a follow-up execution item for the PgM to file**
(AC-2's sanctioned off-ramp — it edits a code file, and this seat cannot land code today):

1. **Correct `verificationRefused()`** in `scripts/bootstrap-api-integration-schema.mjs`
   so its text stops implying per-revision authorization. It should state that a durable,
   **target-scoped** operator ruling reference may be reused across revisions, and that
   what each rebuild requires is the *reference*, not a new ruling.
2. **State the rebuild-only contract in the refusal text itself** — one line saying the
   target is disposable by design and rebuild is the sanctioned remedy, not a failure
   mode.
3. **Align `docs/runbooks/local-db-testing.md`** to say the same thing in the same words,
   and note explicitly that a schema change is an ordinary, expected rebuild trigger.

**Done when:** the next schema change hits a documented, decided remedy path instead of an
ad-hoc operator destroy ruling.

**Not changed by this decision:** the fail-closed guards, the Doppler
`mentomate/dev_integration` target validation, the revision pinning, the receipt, or
WI-3041's fail-fast guard. All are working as designed and none are in question here.
