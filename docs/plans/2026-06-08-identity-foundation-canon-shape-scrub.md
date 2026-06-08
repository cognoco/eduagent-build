---
title: Identity Foundation Canon-Shape Scrub — Implementation Plan
date: 2026-06-08
profile: change
spec: _wip/identity-foundation/CANONICAL-SET.md
status: draft
---

# Identity Foundation Canon-Shape Scrub — Implementation Plan

**Goal:** Make the four identity-foundation domain docs safe to graduate from `_wip/identity-foundation/` into `docs/canon/identity/` by separating standing canon from working history, then graduate them.
**Approach:** Scrub each candidate document section-by-section, then move. Keep stable rules in L1 canon, move operational or provenance material to the correct L3/audit home, remove stale working-state text from the future canon surface, then graduate the scrubbed docs to `docs/canon/identity/`. The PM reviews the draft before it lands.

## Ratified scope amendment (2026-06-08)

After the T1 disposition inventory (`_wip/identity-foundation/2026-06-08-j0-disposition-inventory.md`), the architect ratified the following, which this plan now reflects:

1. **Canon layout = Option C.** Estate spine stays at `docs/canon/` root; each stream's domain canon lives in `docs/canon/<domain>/`. The four docs graduate to **`docs/canon/identity/`** as `ontology.md`, `domain-model.md`, `data-model.md`, `prd.md` (drop the `identity-` filename prefix; the folder supplies scope). Requires the **ADR-0000 §I.4 lockstep amendment** (drafted below; apply before the move).
2. **J0 owns the full scrub + trapped-canon rescue + graduation.** The PRD's ~23 standing rules trapped in Part 10 are lifted into the canon body (product/architecture rules) or to **`docs/compliance/`** (the ~10 compliance rules) before Part 10 is routed to audit. The PM reviews the draft before it lands.
3. **`mentor` → `supporter` rename rides J0** (same files the scrub already touches). Term map: `mentor`(human capacity)→**`supporter`**, `mentee`→**`supportee`**, `mentorship`/`mentorship` table→**`supportership`**; the AI is **`mentor`** (the formal term); `mate` is a product synonym noted only in `CONTEXT.md`, never used in canon. Guardian / owner / charge / admin / Payer are **unchanged** — only the name swaps, definitions stand. ADRs `MMT-ADR-0007`/`0008` are **edited directly** (ADRs are mutable until ~Phase M).
4. **Legacy `file:line` cites + vs-legacy diffs** are stripped from graduated canon → Phase-F migration runbook.
5. **`docs/glossary.md` is a rogue, reverse-engineered drift-map** (now marked non-canon). It is dismantled, not curated: its identity slice is discarded (canon already owns it; harvest ~3 drift-evidence items into the ontology crosswalk), and the doc is **deleted after the bucket-2 design activity consumes it** (it is that activity's primary input). Buckets 2 and 3 are **out of J0** (bucket 2 = new learning-domain canon stream beside Stream 2; bucket 3 = Stream 2).

## Scope

In scope:
- `_wip/identity-foundation/identity-ontology.md`
- `_wip/identity-foundation/domain-model.md`
- `_wip/identity-foundation/data-model.md`
- `_wip/identity-foundation/identity-foundation-prd.md`
- `_wip/identity-foundation/CANONICAL-SET.md`
- `_wip/identity-foundation/ROADMAP.md`
- `docs/INDEX.md`

Now in scope (per the ratified amendment): the move to `docs/canon/identity/`; the `mentor`→`supporter` rename across the four docs + `CONTEXT.md` + ADRs `0007`/`0008` + diagrams + memory; the PRD trapped-canon rescue (→ body or `docs/compliance/`); the ADR-0000 §I.4 amendment.

Out of scope:
- Editing `_wip/identity-foundation/2026-06-08-phase-i-architecture-legacy-pass.md`
- Rebuilding `docs/architecture.md`
- Reducing `CLAUDE.md` / `AGENTS.md` beyond pointer-target updates after J0
- Implementing application code or database migrations
- Bucket-2 glossary design (new learning-domain canon stream) and bucket-3 homing (Stream 2)
- Deleting `docs/glossary.md` (deferred until bucket-2 consumes it)

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
- [ ] T8: `mentor`→`supporter` rename sweep — done when: `mentor`(human)→`supporter`, `mentee`→`supportee`, `mentorship`/table→`supportership` across all four docs + `CONTEXT.md` + `MMT-ADR-0007`/`0008` + `identity-model-diagrams.html` + memory; AI stays `mentor`; `mate` noted as a product synonym in `CONTEXT.md` only; guardian/owner/charge/admin/Payer untouched; verify with `rg -n "\bmentor(ship|ee)?\b" _wip/identity-foundation docs/adr/MMT-ADR-0007* docs/adr/MMT-ADR-0008* CONTEXT.md` returns only AI-tutor senses.
- [ ] T9: Trapped-canon rescue — done when: the ~23 PRD Part-10 standing rules are lifted into Parts 1–9 (product/architecture) or into `docs/compliance/` (the ~10 compliance rules), each at a named home per the inventory rescue list; Part 10 then routes to audit with no live rule left behind.
- [ ] T10: ADR-0000 §I.4 amendment — done when: the §I.4 physical-layout line is amended for the `docs/canon/<domain>/` convention (text drafted in the inventory), as a lockstep edit to `MMT-ADR-0000`, before the move.
- [ ] T11: Graduate + repoint — done when: the four scrubbed docs are moved to `docs/canon/identity/`; citations rewritten (`_wip/` → `docs/canon/identity/`); `docs/INDEX.md`, `CANONICAL-SET.md`, `ROADMAP.md`, and the `architecture.md` carve-out banner updated to the new paths; drift-evidence harvested from `glossary.md` §1 into the ontology crosswalk.

## Acceptance Checks

Run these after the scrub and before the J0 move:

```bash
rg -n "Status: DRAFT|Decision Queue|Path X|G-[0-9]|F1-|I-PB-|T[0-9]|pending PM sign-off" _wip/identity-foundation/identity-ontology.md _wip/identity-foundation/domain-model.md _wip/identity-foundation/data-model.md _wip/identity-foundation/identity-foundation-prd.md
rg -n "17 members|does NOT exist yet|lockstep SQL still to write|runbook to draft|This roadmap update.*in progress" docs/INDEX.md _wip/identity-foundation/ROADMAP.md .claude/memory/MEMORY.md .claude/memory/project_identity_foundation_decisions.md
```

Any remaining hit must be in an explicitly labeled provenance/audit section or a retained historical decision-log entry.
