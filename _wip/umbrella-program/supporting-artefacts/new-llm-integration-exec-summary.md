# new-llm integration — executive summary

**Date:** 2026-06-12 · **Status:** strategy approved by the operator 2026-06-12
**Full technical detail:** `new-llm-integration-analysis.md` (this folder, v1.4)

---

## 1. Background

Two substantial efforts have been running in parallel on this codebase:

- One lane built the `new-llm` branch — the first slice of the "Mentor-Is-The-App"
  V2 experience, together with a large batch of audit fixes.
- The main lane has been re-platforming identity: the new account/person/consent
  tables exist in the database, and a detailed cutover plan now describes how the
  application switches over to them and retires the legacy tables.

Before either effort advanced further, the question had to be settled: do they
collide? A full audit examined the branch — every changed file, every database
change, every document — against current `main` and against the identity cutover
plan. The audit itself was then adversarially reviewed four times until no new
findings emerged. What follows is what survived that process.

## 2. What the branch contains

Two distinct layers, both of which go **live the moment the branch merges** —
nothing on the branch sits behind a feature flag:

1. **The first stage (S0) of the V2 shell** — the "Now" feed: a new API route and
   service, a new database table (`mentor_activity_ledger`) recording mentor
   activity per profile, and the mascot/celebration components. The remaining V2
   stages (S1–S6) exist only as planning documents; no code yet.

2. **Roughly 25 modules of audit fixes**, rewritten in place: metering refund
   handling, escalation heuristics, the session-filing threshold, GDPR erasure of
   the BYOK waitlist, removal of a dead endpoint, six background-job functions,
   and more.

The audit's central structural finding: the branch is clean where it most needed
to be. It does not touch the LLM routing core, it does not touch the identity
code the cutover plan rewrites, the V0 navigation contract is intact, and the V2
plan documents deliberately avoid building on the new identity tables before they
are live. Nothing in the implemented code conflicts architecturally with the
identity work — which is what made the integration strategy straightforward.

## 3. Findings

Twelve items must be fixed **before the branch merges**. None reflects on the
feature work itself; most are side effects of a difficult merge history between
the branch and a fast-moving `main` (two earlier sync merges silently dropped
batches of main commits, which is the direct origin of several of these).

The two most serious:

- **The deploy gate would block all deployments after merge.** The branch adds a
  safety script that refuses to deploy when it detects "REFERENCE ONLY"
  migrations. Its text matching is too broad: an existing, legitimate migration
  on main mentions those words in a comment, so post-merge the script would block
  every staging and production deploy — including the deploy that lands the
  staging KV fix the branch itself carries. Requires a code fix (a structured
  marker plus a test), not a process note.

- **The new activity-ledger table ships without row-level security.** Every
  profile-scoped table in this application carries a database-level isolation
  policy; the new table has none. That is both a real data-isolation gap and a
  guaranteed CI failure on main, where a coverage test enforces the rule.
  Requires an RLS migration before merge.

The remainder, briefly:

- A merge on the branch resurrected ~337 hardcoded-English-text entries that main
  had already burned down (the i18n ratchet baseline went 12 → 349). The baseline
  must be recomputed by intersection at merge.
- A translation state file lost its per-locale section (~16.5k lines) that the
  translation tooling still reads. Restore or regenerate.
- Two ADR numbering collisions (both lanes minted MMT-ADR-0019), plus an index
  file pointing at the wrong documents. Renumber and correct.
- The branch's GDPR work covers *erasure* of the new ledger table but not *data
  export* (Article 15) — the export service does not yet enumerate the table.
- Over-the-air updates: the merge changes native dependencies. Without a version
  bump in `app.json`, the next JS-only push to main would ship an OTA update to
  binaries built against the old native modules. The merge must include the bump.
- The later V2 plan documents (S4–S6) state they are unblocked once the identity
  tables "have landed" — but landed is not live. They must be re-keyed to "after
  the identity flip completes," and S4 must drop a migration it schedules that
  the identity plan now owns. This prevents any executor starting S4 against
  tables that exist but carry no traffic.
- Smaller items: secrets/KV provisioning for the staging fix, a complete
  behavior-change inventory for operator sign-off (filing threshold, refund
  contract, endpoint removal and the rest all change user-visible behavior on
  merge day), and one identity ruling document on the branch that enters canon
  through the identity ratification path rather than riding the merge.

Nearly all of it is mechanical; roughly a day of focused work.

## 4. The strategy: merge new-llm first

The alternatives — holding the branch until the identity cutover completes,
splitting it, or converting it incrementally — all lost to the direct option:

**Fix the twelve items on the branch, re-verify it once, merge it into main, and
run the identity cutover afterwards on the merged codebase.**

The rationale:

- The identity plan re-points table references by reading the live database
  catalog, so the new ledger table is absorbed automatically — provided it is
  already merged when that step runs.
- The identity work's code-side "twin" modules have not been written yet, so they
  are written once, against the merged content. No rework on either side.
- Merging ends the rebase treadmill that has already dropped main commits twice,
  and immediately lands the staging KV fix and the audit-fix batch that main
  wants now.
- Nothing on the branch depends on the identity work, so there is no reason for
  it to wait.

## 5. Execution from here

1. **The twelve fixes run through the umbrella program** (initiative PRG-17) — a
   dedicated agent works the branch in an isolated worktree, with each item
   tracked as a work package. The originating lane retains a review slot on the
   final merge PR.
2. **One final re-verification** of the branch exactly as it will merge — the
   fixes are new commits, and main keeps moving (one background-job area has
   already drifted) — followed by operator approval against the behavior-change
   inventory.
3. **Merge to main**, with an automated content-level check on the merge PR
   verifying that nothing from either side was silently dropped — the failure
   mode this history has produced twice.
4. **The identity cutover then proceeds on merged main.** Its plan receives a
   small update for the ledger table (which step moves its foreign key; deletion
   and export coverage) and is then executed.
5. **V2 stages S1–S3 are unblocked once the merge lands.** S4–S6 wait for the
   identity flip, per the re-keyed plans — the one real dependency between the
   two efforts.

## 6. Standing cross-lane rules (agreed, both directions)

- **Migration numbers are never pre-assigned** in plans or documents — take the
  next free number at landing time.
- **No solo conflict-resolution merges** — any sync that hits conflicts gets the
  content-level both-parents verification before push.
- **Identity rulings enter canon through the identity ratification path**,
  whichever lane originates them.
- During the identity plan's final convergence window, **no merges to main from
  any lane** — enforced by a committed marker file and a CI check, not by memory.
- Cross-lane milestones (branch merged, cutover stages done, freeze opening and
  closing) are **explicitly announced and acknowledged** — via the operator
  today, via the work system's event mechanism once it lands.

---

**In one paragraph:** the audit found the `new-llm` branch architecturally clean
and strategically easy to integrate — merge it first, ahead of the identity
cutover — but carrying twelve concrete defects, mostly merge-history side
effects, two of them serious (a deploy-blocking script bug and a missing
row-level-security policy on the new table). The umbrella program now fixes
those on the branch, re-verifies it, and merges; the identity cutover then runs
on the merged codebase, with V2 stages S1–S3 free to proceed and S4–S6 waiting
on the identity flip.
