# Handoff — Phase G closed (2026-06-08)

**State:** Phases **A–G complete.** Next: **Phase H** (the `architecture.md`
identity-foundation carve-out). Live tracker: `_wip/identity-foundation/ROADMAP.md`.

## What G produced (two deliverables)

1. **Canonical set LOCKED** — `_wip/identity-foundation/CANONICAL-SET.md`.
   - **17 members**, each with its role named: 4 domain-doc L1 (`identity-ontology`,
     `domain-model`, `data-model`, `identity-foundation-prd`) + 11 ADRs L2
     (`MMT-ADR-0000` +2 amendments, `0007`–`0016`) + the `docs/registers/llm-models/`
     master **by reference** (not canon) + the A-vs-B memo as **Option-III audit
     trail**. Two `2026-06-06` routing specs are **named-but-not-members** (supporting L3).
   - This file is the **lens for Phase L** and the **citation boundary for Phase H** —
     H may cite only what is in this set.
   - **Memo sign-off recorded here**, *not* in the memo: the memo's §8 Option-III
     lifecycle freezes its header ("preserved, not updated"), so its stale
     "pending PM sign-off" line is **superseded by** the live canonical-set
     confirmation. Counsel's R-1 (HW-2) is the only outstanding signature.

2. **Documentation index SEEDED** — `docs/INDEX.md`.
   - The boot-flow linchpin: `CLAUDE.md`/`AGENTS.md` → **index** → layered canon.
   - Layer scaffold (L1–L4 + meta/audit) + identity-foundation canon **fully indexed**;
     points at the existing per-layer indexes (`adr/README`, `registers/README`,
     `audit/INDEX`) and at `CANONICAL-SET.md` as the authoritative enumeration.
   - **Wired** via one additive pointer line in `CLAUDE.md` + `AGENTS.md` (item 4 of
     "Read This Before Editing" / "Initialization"). This is NOT the Phase-J
     pointer-layer reduction — just enough to make the seed reachable.

## Explicitly deferred (do NOT do in H)

- **Estate-wide index population** → Phase J / Stream 2. `docs/INDEX.md` only indexes
  identity-foundation canon today; loose root canon (`architecture.md`, `PRD.md`,
  `ux-design-specification.md`) is **not** drained to `docs/canon/` yet.
- **`CLAUDE.md`/`AGENTS.md` reduction to pointer-layer** → Phase J. G added a pointer;
  it did not drain inline canon.
- **Memory cleanup** (incl. the stale "Strictly 11+" entry) → Phase J.

## Watch-outs carried into H

- The canonical-set doc's **§ Watch-outs** lists the traps H inherits: the stale
  "Strictly 11+" memory (superseded by Path X), archive-relocated provenance citations
  (resolve by name not path), and `MMT-ADR-0016` being the **repurposed** one (model
  picks live in `docs/registers/`, not 0016).
- **H is the one deep authoring phase** — `architecture.md` identity carve-out,
  rock-solid, cited to ADRs + data model. Per the F.1 note, H also reconciles the
  `0016`↔`0000` divergence root cause (the authorship/relationship process) as part of
  the refresh being *wider than the document*.

## Git

All on `main` (consistent with how D/E/F landed this runway's docs/ADRs). 5 files:
`CANONICAL-SET.md` (new), `docs/INDEX.md` (new), `ROADMAP.md`, `CLAUDE.md`, `AGENTS.md`.
