# `_history/` — extracted provenance from the graduated identity canon

**What this is.** When the four identity-foundation domain docs were scrubbed for graduation to
`docs/canon/identity/` (Phase J0, 2026-06-08), their **decision-history / ratification-ledger /
consumed-handoff** material was lifted out of the future-canon bodies and parked here. Canon states
*what is true now*; this folder holds *the working record of how it was decided*.

**Authority.** These files are **not canon and not the system of record.** The systems of record are:
- **Decisions / "why":** the ADRs in `docs/adr/` (`MMT-ADR-0001/0002/0007–0017`).
- **Cross-stream status / open threads:** `_wip/identity-foundation/ROADMAP.md`.
- **Standing rules / "what":** the graduated canon under `docs/canon/identity/`.

This folder exists so the scrub is **non-destructive** — nothing is deleted, only re-homed — and so a
future reader can trace a graduated rule back to its ratification narrative without that narrative
polluting the canon surface.

| File | Source doc | Holds |
|---|---|---|
| `domain-model-provenance.md` | `domain-model.md` | §7 Phase-E handoff (consumed) + §8 decisions ledger + preamble ratification stamp |
| `identity-ontology-provenance.md` | `identity-ontology.md` | preamble status/legend + §R ratification log + §0 grill agenda + §6 deferred decisions + §7 current-code crosswalk + §8 carried flags + §9 use cases |
| `data-model-provenance.md` | `data-model.md` | preamble banners + §8 Phase-E decisions ledger (D1–D8) + §9 cross-reference index (incl. rot-prone `file:line` cites) |
| `identity-foundation-prd-provenance.md` | `identity-foundation-prd.md` | preamble Doc-2 framing + Part-10 sign-off/ripple machinery + §A–§C personas/journeys/vision + §H ripple closure + §I counsel register + Segments 2–5 + code-verification log + Phase-E fillers (condensed; full text in git history) |

**Forward-looking sinks (NOT in this folder — they are build input, not decision history):**
- `../data-model-phase-f-notes.md` — migration sequencing + vs-legacy diffs + Phase-F/counsel handoff (the Phase-F migration-runbook precursor).
- `../identity-compliance-register.md` — the ~10 binding compliance rules rescued from PRD Part 10 (graduates to `docs/compliance/`).
