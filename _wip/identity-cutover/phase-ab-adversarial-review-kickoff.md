# Adversarial Pre-Flip Review — Identity Cutover Phases A + B (PRG-06 / WS-18)

> **You are a fresh, independent adversarial reviewer.** You did not write this code and have
> no stake in it landing. Your job is to find the reasons NOT to flip — not to confirm it's fine.
> Read-only: do not merge, push, edit, or open PRs. Produce evidence, not assertions.

## Why you exist

MentoMate is mid-way through an **identity re-platform cutover**. The app is moving off four legacy
identity tables onto a canonical v2 model, gated behind the build-time flag **`IDENTITY_V2_ENABLED`**
(resolved per-env; helpers `isIdentityV2Enabled*` / `isIdentityV2EnabledInStep`).

The cutover runs in phases:
- **Phase A — build the flip-critical core** (migrations + v2 write twins + reader/writer wiring). ✓ claimed done.
- **Phase B — finalize & land** (review, merge, close the WIs). ✓ claimed done.
- **Phase C — the operational cutover runbook** (freeze → snapshot → reseed → parity → FK-repoint →
  **flip `IDENTITY_V2_ENABLED=true` in prod (#8)** → post-drop smoke → **DROP the 4 legacy tables (#11)**). NOT started against prod.

**The moment of danger is the flip (#8).** When the flag flips on in production, every code path that
still reads/writes a legacy table unconditionally will **500 in production** (the tables will be dropped
at #11), or — worse, because it's silent — resolve the **wrong consent / wrong person / wrong scope** and
leak data across users or organizations. Before the operator flips, we want an external party to try to
break the claim that the flip-critical code is complete and correct.

**Two prior "complete" claims in this work proved false** (a test-coverage claim, and a reader-sweep that
declared "6 readers, complete" but missed the single highest-traffic reader — 5 more were found on
re-audit, then ~6 more clusters across other tables in a third pass). Treat every completeness claim in
this body of work as **guilty until you prove it**.

## What to review — the merged code (all on `origin/main`)

`git fetch origin` first, then review these three squash-merges as they actually landed:

| WI | PR | Merge commit | Scope | Size |
|----|----|----|----|----|
| **WI-586** — flip-critical core + de-journal + deploy guard | #1210 | `ec996441b` | migrations 0117 (FK repoint) / 0118 (drop 4 tables); 2 v2 write twins (profile-v2, account-v2); 6 flip-critical wirings; profiles reader sweep + 5 missed readers; TASK A (de-journal 0117/0118 → `drizzle/_freeze-only/`); TASK B (deploy guard `check-reference-only-migrations.mjs`) | 62 files, +3861/−592 |
| **WI-809** — dropped-table reader sweep | #1212 | `5f8759e84` | gate all flag-on readers of `consent_states` / `family_links` / `export`; consent authz fix (`getOrgMemberDisplayNameV2`, org-scoped + archived-scoped); export `learningOnlyProfileIds` architecture | 20 files, +1214/−76 |
| **WI-810** — quota-reset cron | #1213 | `50fbca3c5` | gate nightly quota-cycle reset → `resetExpiredQuotaCyclesV2` (joins v2 `subscription`); flag-off keeps legacy `resetExpiredQuotaCycles` (joins `subscriptions`) | 2 files, +61/−5 |

The **4 legacy tables being dropped** at #11: `profiles`, `accounts`, `family_links`, `consent_states`.
(`subscriptions` is **retained** per "Option B" — it is NOT in the drop set; the quota cron's v2 path
joins the v2 `subscription` table, the legacy path joins `subscriptions`.)

Earlier de-journal/guard work also landed in `e17e393b4` (part of #1210's lineage) — include it.

## Attack surface — go after these, hardest first

1. **Reader-sweep completeness (the #1 risk — methodology already missed twice).**
   Find any code path that, **with `IDENTITY_V2_ENABLED` on**, still reads `profiles` / `accounts` /
   `family_links` / `consent_states` **unconditionally** (no `isIdentityV2Enabled*` branch, or branched
   wrong). Don't trust the diff's own list — enumerate readers yourself across `apps/api/src` AND the
   parts static analysis misses: dependency-injection seams, Inngest functions, cron/scheduled jobs,
   repository layers, `db.select(... from <legacy table>)`, raw SQL, and any `*-repository.ts`. Each hit
   = a prod 500 on flip. **This is the finding class most likely to exist.**

2. **Writer completeness + ownership scoping.** Every write to the v2 model must carry explicit
   `profileId`/owner protection or verify ownership through the parent chain. Look for v2 writers that
   drop the legacy scoping the legacy writer had (the 809 consent fix was exactly this — a v2 helper that
   silently lost org-membership + archived scoping). Cross-org / cross-user / archived-record leakage is
   in scope.

3. **Consent / GDPR correctness (silent-failure class).** Wrong consent resolver = silent privacy bug,
   not a crash. Scrutinize `getOrgMemberDisplayNameV2` and every consent/export reader: does the v2 path
   return the *same authorization decision* as the legacy path for org-scoped, archived, cross-org, and
   guardianship cases? Is there any path where v2 surfaces one user's data to another (an
   LLM-reads-A-surfaces-to-B injection vector counts)?

4. **Migration auto-apply safety.** Confirm 0117/0118 genuinely cannot auto-apply: journal tip is 0116,
   the SQL lives in `drizzle/_freeze-only/` with a `-- @freeze-only` marker, and the deploy guard
   (`check-reference-only-migrations.mjs`) is **fail-closed** (exits 1 unless an explicit freeze signal).
   Look for any path that re-journals them, any other un-guarded destructive migration, and whether a
   normal deploy could still drop a prod table.

5. **Quota-reset cron correctness.** With the flag on, does `resetExpiredQuotaCyclesV2` read the right
   (v2 `subscription`) table and reset the right cycles? With the flag off, is the legacy path
   byte-identical to before? A wrong cron silently fails to reset quotas post-flip.

6. **Flag-OFF dormancy / no regression.** Half-finished consent v2 code merged **dormant** (flag-off) in
   #1210. Confirm the flag-OFF path — i.e. **current production behavior** — is genuinely unchanged by
   all three PRs. A regression here breaks prod *before* any flip.

7. **Test vacuity.** Do the tests actually assert? Look for: stale assertions that didn't update when a
   trailing arg was added; tests that pass because they mock the thing under test (internal `jest.mock`
   of own db/services — GC1/GC6 violations); security fixes with no negative-path break test
   (red-green-revert). A green suite over vacuous tests is how both prior false-complete claims survived.

## Known blind spots (the operator already knows these — confirm or expand, don't re-discover as "new")
- Static analysis covered `apps/api/src` only; DI/edge paths are a partial blind spot → the staging
  rehearsal soak is the intended runtime backstop. If you can reach a DI/edge reader statically, do.
- `subscriptions` is intentionally retained (not dropped) — a reader of `subscriptions` is NOT a flip
  hazard; a reader of the other four IS.

## Output — what to hand back

A single verdict block:

- **VERDICT: GO / NO-GO** for entering Phase C (i.e. is the flip-critical *code* safe to begin the
  operational cutover against). GO ≠ "perfect"; GO = "no MUST-FIX defect that would 500 or leak on flip."
- **MUST-FIX** (blocks the flip): each with `file:line`, the exact failure (500 / silent-wrong / leak),
  the flag-on trigger, and ideally a red test or repro. No MUST-FIX may be hand-waved.
- **SHOULD-FIX** (fix-before-flip-if-cheap, else track): same evidence standard.
- **CONFIRMED-SAFE**: the completeness claims you actively tried to break and could not — say what you
  checked so the operator knows the coverage, not just the misses.
- **RESIDUAL RISK**: what only the staging rehearsal can catch (be specific about which reader classes
  you could not rule out statically).

Cite `file:line` against the merged code. Assertions without evidence will be discarded. If you find a
third reader-sweep miss, that is the single most valuable thing you can return.
