---
title: Stream 2 — Deferred Estate-Canon Drain (Backlog)
status: BACKLOG · home doc (extracted from the identity-foundation runway 2026-06-09)
owner: (unassigned)
roster: PRG-20 in _wip/umbrella-program/program-roster.md
scope: the deferred, non-identity-blocking documentation / canon remediation that the
  identity-foundation runway names but does not execute.
---

# Stream 2 — Deferred Estate-Canon Drain (Backlog)

**What this is.** The home of "Stream 2" — the body of deferred documentation / canon
remediation that the identity-foundation runway (`_wip/identity-foundation/ROADMAP.md`)
deliberately defers. It was **extracted from that ROADMAP on 2026-06-09** to keep the
runway a clean delivery document and to give the backlog a home the umbrella program
owns. Catalogued as **PRG-20** in `program-roster.md`.

**Provenance.** The two sections below were **moved (near-)verbatim** from the runway
ROADMAP's "Cross-cutting threads" — the *Documentation architecture / decisions layer*
thread and the *Stream 2 commencement* thread. **One reconciliation** was made during
the move: the coordination-authority reference changed from *"under this
identity-foundation roadmap"* to *"under the umbrella program (PRG-20)"*, since the
umbrella now sits above the runway as the cross-program coordinator. Everything else is
as it was. The runway retains pointers (its N.0 gate, J3 deferrals, glossary bucket 3)
that resolve here.

**The one rule (inherited from the umbrella).** Pointers, never copies. This is now
Stream 2's single home; the runway points here, it does not duplicate.

---

## Commencement, parallelism & coordination
*(moved from ROADMAP "Stream 2 commencement" thread; added 2026-06-08, architect-ratified)*

This work is *sequenced* by the runway; it is not *executed* by it, and
**implementation execution is never gated on Stream 2 completion.** Four rules govern
start timing:

- **Baseline.** Stream 2 is named and ordered by **Phase O** (the master plan) and
  sliced into Cosmo WIs at **Phase P**.
- **Maximal parallelism — start each fragment at its earliest responsible start.**
  Stream 2 is *not* a monolith that waits for O; execute as much as can run in parallel
  as soon as each fragment *can* start. Gap-analysis-dependent parts (the full
  `architecture.md` rebuild, the `ARCH-N` reverse-engineering drain) cannot begin before
  **Phase L**; input-independent parts (e.g. the principles/invariants catalog, the
  `docs/`→`docs/canon/` reorg) can begin once their input canon is stable. Default
  posture: *start as soon as you can, in parallel* — not *hold until O*.
- **Single coordination umbrella while K–P run.** Any Stream 2 fragment that starts
  early (or is pulled forward by **N.0**) stays coordinated **under the umbrella program
  (PRG-20)** for as long as K–P are still running — one umbrella, one sequencing
  authority — rather than spinning off into a separate, uncoordinated track. *(During
  K–P that umbrella sits above the identity-foundation runway.)* Stream 2 graduates to
  its own standalone live Cosmo workstream only **after the runway closes (post-P)**.
- **The pull-forward exception (N.0).** Whatever the **N.0** gate (runway *Phase N —
  detail*) declares a pre-execution prerequisite is sequenced in O as pre-execution work
  and executed early under the umbrella above; the deferred remainder runs in parallel
  where its inputs allow, otherwise post-execution.

> **N.0 partition results land here.** When the runway runs Phase N.0 (partition the
> Stream-2-assigned findings into pull-forward vs deferred), record the partition in
> this doc — it is the Stream-2 home of record.

---

## Inventory — the deferred work
*(moved from ROADMAP "Documentation architecture / decisions layer (Phase C → Stream 2)" thread)*

`MMT-ADR-0000` ratified the 5-layer model, the first-class `MMT-ADR-NNNN` decisions
layer, the **significance gate** (when a decision needs an ADR), the lockstep lifecycle,
and the **physical layout** (§I.4: `docs/canon|adr|specs|plans|runbooks` +
`assets/`/`_archive/` drains). **Forward mechanism shipped** (convention, lockstep, the
`decision-adr-link` ratchet, `ARCH-N` freeze) + 3 seed ADRs; ADRs now homed at
`docs/adr/`. **Deferred backfill = Stream 2 (structural remediation):**

- **Drain the ~70 censused decisions to ADRs repo-wide.** MoSCoW: MUST = memory-only
  **or** ≥2-source (drifting); SHOULD = single canon spot needing extraction; NICE =
  stable/low-confidence; SKIP/tombstone = obsolete/superseded/mechanical. The **identity
  slice rides the runway's tail** (re-baseline = Prong A new ADRs + Prong B
  supersession/tombstones — touch identity canon once); constraint:
  **extract-before-cleanup** (no decision-bearing memory file is relocated before its
  ADR exists).
- **Build the principles/invariants catalog** (`docs/canon/principles.md` — promote the
  `CLAUDE.md` Non-Negotiable Rules).
- **The `ARCH-N` drain** (incl. the `ARCH-3` "plain wrong" fix).
- **Agent-doctrine / memory pointer cleanup** — the canon-class memories (see the
  instruction-surface disposition matrix and roster **PRG-03**; PRG-03 handles the
  operational class now, this is its canon-class remainder).
- **The reduced `docs/` reorg** (canon→`docs/canon/` + the drains — what remains of
  F-PLACEMENT once the ADR home is settled) gates the bulk relocation.
- **Estate-level generalisation to the ZDX standard** is parked as **WI-519**.

### Caveat — the parallel ungoverned ADR audit (sealed cross-reference — do NOT build on)
*(moved with the inventory; it is a warning ON the ADR-drain work)*

In the same window another session pushed an ADR register draft + a cleanup plan to
`main`, plus stale-fact "citation fixes" to `architecture.md` / `project_context.md` /
`audience-matrix.md` / `CLAUDE.md`. Its **producing workflow is not in the repo**, so its
selection criteria, coverage, and importance-weighting are unverifiable; it covers only
archived specs and applies **no significance gate**. **Do not seed Stream 2 from it**
(anchoring risk). **Disposition executed 2026-06-03:** the two draft docs are
**quarantined** at `docs/_archive/parallel-adr-audit-2026-06-03/` (see its `README.md`
for provenance) — kept *only* as a completeness backstop to diff against after the
controlled sweep, not as input. The material canon/doctrine edits from the citation-fix
commits (`944d87a`, `1039bb217`) were **reverted**. After the controlled sweep, *diff*
against the quarantined §1 conflict-resolutions and the cleanup plan's STANDS/refuted
findings as a backstop, then decide final disposition (harvest verified facts / discard).

---

## Inbound feed-in (what routes into Stream 2 from the runway)

Recorded in their runway context; they resolve here:

- **J3 docs-tree deferrals** (`_wip/identity-foundation/2026-06-09-j3-docs-tree-disposition.md`;
  ROADMAP "Phase J — detail"): nonconformant loose-canon (estate spine `architecture.md` /
  `PRD.md` / `ux-design-specification.md`, L3 operational docs, assets) + nonstandard dirs
  (`E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/`) — estate-canon drain /
  asset consolidation / dir reconciliation.
- **`audience-matrix.md`** relocation (flag `prd.md:319` citation for update-on-move).
- **Glossary bucket 3** (cards / celebrations) from `docs/glossary.md`: principles →
  `ux-design-specification.md`; terms → product-owned per-area `CONTEXT.md`; inventories →
  L3 register. (Buckets 1/2 are NOT Stream 2 — see roster PRG-01 / PRG-21.)

---

## Change log
- **2026-06-09 — created by extraction.** Moved the inventory + commencement threads out
  of `_wip/identity-foundation/ROADMAP.md` (consolidate-then-repoint); the runway was left
  a pointer and its N.0 gate repointed here. One semantic reconciliation: coordination
  authority → umbrella (PRG-20).
