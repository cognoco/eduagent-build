---
title: Identity Foundation Canon-Shape Scrub — Implementation Plan
date: 2026-06-08
profile: change
spec: _wip/identity-foundation/CANONICAL-SET.md
status: draft
---

# Identity Foundation Canon-Shape Scrub — Implementation Plan

**Goal:** Make the four identity-foundation domain docs safe to graduate from `_wip/identity-foundation/` into `docs/canon/` by separating standing canon from working history.
**Approach:** Scrub each candidate document section-by-section before any move. Keep stable rules in L1 canon, move operational or provenance material to the correct L3/audit home, and remove stale working-state text from the future canon surface.

## Scope

In scope:
- `_wip/identity-foundation/identity-ontology.md`
- `_wip/identity-foundation/domain-model.md`
- `_wip/identity-foundation/data-model.md`
- `_wip/identity-foundation/identity-foundation-prd.md`
- `_wip/identity-foundation/CANONICAL-SET.md`
- `_wip/identity-foundation/ROADMAP.md`
- `docs/INDEX.md`

Out of scope:
- Executing the Phase J0 file move into `docs/canon/`
- Editing `_wip/identity-foundation/2026-06-08-phase-i-architecture-legacy-pass.md`
- Rebuilding `docs/architecture.md`
- Reducing `CLAUDE.md` / `AGENTS.md` beyond pointer-target updates after J0
- Implementing application code or database migrations

## Disposition Rule

For every top-level and second-level section in each candidate doc, record exactly one disposition before editing:

- **Keep in L1 canon:** standing product/architecture/data rule that should remain true after implementation.
- **Move to L3:** plan/spec/runbook/register material, including implementation steps, operational procedure, mutable data masters, and open queues.
- **Move to audit/provenance:** decision history, counsel ledgers, grilling artifacts, sign-off trail, or "why this changed" narrative already backed by ADRs.
- **Archive/delete as stale working state:** obsolete draft state, temporary stage codes, resolved work-package scaffolding, duplicated status, or superseded facts whose current source is elsewhere.

## Tasks

- [ ] T1: Inventory section map — done when: each of the four docs has a section table with heading, current role, disposition, target file/location, and cite to the canonical source that justifies the disposition.
- [ ] T2: Scrub `identity-ontology.md` — done when: stable vocabulary and invariants remain as L1 canon, while ratification history, temporary investigation labels, and working queues are moved to audit/provenance or removed as stale; verify with `rg -n "Path X|G-[0-9]|F1-|I-PB-|T[0-9]" _wip/identity-foundation/identity-ontology.md`.
- [ ] T3: Scrub `domain-model.md` — done when: entity/edge/capability rules remain as L1 canon, while implementation sequencing and decision-history prose are moved out; verify with `rg -n "pending|draft|decision queue|Path X|G-[0-9]|F1-|I-PB-|T[0-9]" _wip/identity-foundation/domain-model.md`.
- [ ] T4: Scrub `data-model.md` — done when: schema contract, table definitions, constraints, and cut strategy remain as L1 canon, while temporary IDs such as `F1-BT-a`, `I-PB-B2b`, `T3`, and `G7` are either replaced with plain rule names or moved to provenance; verify with `rg -n "F1-BT-a|I-PB-B2b|T3|G7|Path X|decision queue|pending" _wip/identity-foundation/data-model.md`.
- [ ] T5: Scrub `identity-foundation-prd.md` — done when: product truths, personas, launch boundaries, and requirements remain as L1 canon, while `Status: DRAFT`, `Part 10 — Decision Queue`, sign-off logistics, and open working-state material are moved to L3/audit or resolved before graduation; verify with `rg -n "Status: DRAFT|Decision Queue|pending|Path X|G-[0-9]|F1-|I-PB-|T[0-9]" _wip/identity-foundation/identity-foundation-prd.md`.
- [ ] T6: Update graduation references — done when: `CANONICAL-SET.md`, `ROADMAP.md`, and `docs/INDEX.md` describe J0 as a scrub-before-move gate and no longer imply the four docs can be wholesale moved as-is.
- [ ] T7: Final conformance check — done when: all four candidate docs have only standing canon in their future L1 body, non-canon material has a named destination, and the Phase J0 checklist is marked with exact moved/removed files.

## Acceptance Checks

Run these after the scrub and before the J0 move:

```bash
rg -n "Status: DRAFT|Decision Queue|Path X|G-[0-9]|F1-|I-PB-|T[0-9]|pending PM sign-off" _wip/identity-foundation/identity-ontology.md _wip/identity-foundation/domain-model.md _wip/identity-foundation/data-model.md _wip/identity-foundation/identity-foundation-prd.md
rg -n "17 members|does NOT exist yet|lockstep SQL still to write|runbook to draft|This roadmap update.*in progress" docs/INDEX.md _wip/identity-foundation/ROADMAP.md .claude/memory/MEMORY.md .claude/memory/project_identity_foundation_decisions.md
```

Any remaining hit must be in an explicitly labeled provenance/audit section or a retained historical decision-log entry.
