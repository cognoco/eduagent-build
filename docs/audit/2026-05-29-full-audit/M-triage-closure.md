# Phase M closure — four-bucket triage

> Closed 2026-06-09. **Decision record.** Hand-authored (the K/L renderer
> `identity-foundation-gate1-finalize.mjs` was an ephemeral workflow script and is not in the
> repo, so M could not be re-rendered). Companion to `gate1-closure.md` (the Gate-1 scope ruling)
> and `L-gap-delta.md` (the per-row data, into which M's outcome is folded).

## What Phase M is

The runway's stage-13 **four-bucket triage** (ROADMAP phase table, owner = You + Claude; depends on L).
Exit gate: every one of the 183 findings lands in exactly one of:

1. **already handled in identity-foundation** — fix verifiably shipped during phases A–J; the master plan carries nothing.
2. **clear-in for master plan** — model obligation; the rewrite must satisfy it as an acceptance criterion.
3. **clear-out for master plan (named workstream)** — real, but owned by another named workstream.
4. **defer** — no owner yet, or the workstream isn't mature enough.

L already produced the seed: the `Disposition` column (`in-IF-scope` / `in-other-workstream` / `deferred`),
ratified with the human at Gate 1. The mapping to buckets 2/3/4 is therefore **deterministic**
(`in-IF-scope → 2`, `in-other-workstream → 3`, `deferred → 4`). **M's only genuinely-new work was
bucket 1** — the disposition L could not seed, because deciding whether a finding is "already handled"
requires checking each candidate against what A–J actually delivered.

## Method (the decisions taken this phase)

1. **Bucket-1 rule — evidence-gated.** A finding is promoted to bucket 1 **only** with a `file:line`
   pointer showing its fix is in the current tree **as a result of identity-foundation A–J**. "An ADR
   governs it" is **not** sufficient — that is target-setting (traceability), not remediation, and
   belongs in bucket 2/3. Rationale: a *false* "already handled" is the single most dangerous
   classification in the triage — it silently removes a finding from the master plan, so it never gets
   fixed. A false clear-in/clear-out only mis-sorts work that still happens. The rule is built around
   that asymmetry.
2. **Candidate set — doc/instruction-class only.** A–J shipped canon, design, ADRs, and doc alignment —
   **not code**. So code-level defects are categorically excluded from bucket 1 (no code shipped). Only
   findings whose remediation is documentation/instruction work that H/I/J could have performed are
   candidates: F-012, F-036, F-037, F-041, F-113, F-114, F-116. (F-115 was already bucket 4.)
3. **Artifact mechanic — hand-authored fold.** M's outcome is folded into `L-gap-delta.md` (four-bucket
   section + tally + banner) plus this closure record; `gate1-disposition.json` gains an `m` field
   (m-bucket) on every entry (count + composition below). No renderer was rebuilt — M is a one-column additive
   classification, not a re-derivation, and nothing will re-render the delta to clobber the edits.
   The `m` field is added to **all 86 entries** of `gate1-disposition.json` (the 84 scope-ruled
   `F-*` findings + `INV-1`/`INV-2`): 49 with `m=2`, 37 with `m=3` (no `deferred` rows are in this
   structured subset — the 9 bucket-4 findings are already-confirmed rows that live only in the delta).

## Result — the four buckets

| M bucket | Count | Source |
|---|---|---|
| 1 — already handled in identity-foundation | **0** | bucket-1 scan (below) — demonstrated empty |
| 2 — clear-in for master plan | **49** | `Disposition = in-IF-scope` (the model obligations) |
| 3 — clear-out for master plan (named workstream) | **125** | `Disposition = in-other-workstream` |
| 4 — defer | **9** | `Disposition = deferred` |
| **Total** | **183** | |

**11 execution-blocking** rows are a cross-cut on bucket 2 (not a fifth bucket) — they feed the **N.0**
Stream-2 pull-forward gate (patch-now list in `gate1-closure.md`).

## Bucket-1 scan — the evidence (zero promotions)

Each doc/instruction-class candidate was checked against the current tree (the audit predates A–J:
audit 2026-05-29; H/I/J ran 2026-06-08/09, so any genuine fix would postdate the finding):

| Candidate | Finding | Verdict | Evidence |
|---|---|---|---|
| **F-012** | `architecture.md` warns of a non-existent database→schemas circular dependency | not handled | the warning still stands at `docs/architecture.md:765` and `:896` |
| **F-036** | `autoMemoryDirectory` points at a different filesystem tree than the live repo | not handled | setting absent from repo `.claude/` — inconclusive (likely a gitignored `settings.local.json`); **no positive proof of an A–J fix**, so the evidence gate fails |
| **F-037** | `CLAUDE.md` and `AGENTS.md` diverge | not handled | `CLAUDE.md:93` **explicitly defers** unification to a future work item ("A future work item will unify them") — acknowledged-open, not closed |
| **F-041** | stale / imprecise source citations in `CLAUDE.md` profile-shape section | not handled | `apps/mobile/src/app/(app)/_layout.tsx:122` is still `function TabIcon(...)`, not the cited V0 helpers — the line-pinned citation is still drifted; J2 explicitly "kept Profile Shapes (current-state)" and only added a scope note |
| **F-113 / F-114 / F-116** | no repo-local skill for zod-contract / drizzle-neon-safety / GHA-security | not in IF | the tech-skill-group (`e4c23f0c8`, 2026-05-31 — `tech/zod`, `tech/drizzle-atomicity`, `tech/neon-postgres`, `tech/gha-hardening`) likely *partially* covers these, but it is **independent work, not identity-foundation A–J**, so the strict bucket-1 definition excludes it. Stays bucket 3. |

**Conclusion: bucket 1 is empty — demonstrated, not asserted.** This converges on the Gate-1 closure's
assertion (all 49 in-IF → bucket 2), but now backed by per-candidate tree-level evidence, which is what
"You + Claude" ownership of this gate is for.

## Carry-forward note (FYI for the agent-instructions workstream)

F-113/114/116 stay bucket 3, but the agent-instructions workstream should **dedupe against the
tech-skill-group** (`tech/zod`, `tech/drizzle-atomicity`, `tech/neon-postgres`, `tech/gha-hardening`,
landed `e4c23f0c8`) before building new skills — coverage is partial (those are vendor/generic skills;
the findings ask for repo-specific discipline: `@eduagent/schemas` as the API-facing contract,
`createScopedRepository`/`profileId` rules + migration-rollback, the repo's GHA checklist), so the work
is *reduce-and-extend*, not *build-from-scratch*.

## Handoff to Phase N

- **N.0 (Stream-2 pull-forward gate)** consumes the bucket 3/4 partition (134 findings) + the 11
  `execution-blocking` rows. Default is defer; pull forward only on a demonstrated, named blocking
  dependency.
- **N.1 (sequencing)** consumes the 49 bucket-2 obligations (plus any N.0 pull-forward subset);
  identity-foundation is sequenced first (dogfood). The per-workstream IF-slice sizing is in
  `gate1-k5-postgate.md`.
