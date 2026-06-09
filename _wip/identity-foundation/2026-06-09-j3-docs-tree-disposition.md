---
title: Phase J3 — Docs-tree conformance disposition
date: 2026-06-09
phase: J3
status: EXECUTED 2026-06-09 — ratified; zero file moves (identity surface already §I.4-conformant); remainder deferred to Stream 2 with named reasons
scope: docs/ tree — per-file/dir decisions reachable from the identity-foundation surface only
---

# Phase J3 — Docs-tree conformance

**What this is.** The J3 disposition (ROADMAP J3 row): apply `MMT-ADR-0000` §I.4 (the physical-placement
model) to whatever is reachable from the identity-foundation surface. Valid per-item decisions:
move-now (→ `docs/canon/`, or → L3/audit/assets/archive), **or defer to Stream 2 with a named reason**
(deferral is first-class per the exit gate). Scope bound: **reachable from the identity-foundation
surface** — the estate-wide reorg (estate-canon drain, asset consolidation, nonstandard-dir
reconciliation) is explicitly Stream 2 (ADR-0000 amendment 2026-06-08 line 200; `docs/INDEX.md`
seed-caveats #2/#3).

**§I.4 target.** `docs/` root holds **no loose canon**; sanctioned subdirs are `canon/ adr/ specs/
plans/ runbooks/ assets/ _archive/` + the amendment-added type-dirs `registers/` and `compliance/`;
`audit/` is the Meta layer. Domain canon nests at `docs/canon/<domain>/` (prefix-dropped).

## Two checks that determined the outcome

1. **Mislocated-citation defect (the one thing J3 had to catch)? → NONE.** Every identity-canon→loose
   citation points at the file's correct *current* location: `docs/canon/identity/prd.md:319` →
   `audience-matrix.md`; `CANONICAL-SET.md` + `docs/INDEX.md` → `architecture.md` / `PRD.md` /
   `ux-design-specification.md`. INDEX.md already flags those three as the pending Stream-2 drain
   (caveat #2). Accurate-as-of-now, not dangling.
2. **Is the identity surface itself §I.4-conformant? → YES, already.** Everything the identity work
   produced sits in a sanctioned home: `docs/canon/identity/` (J0 graduation), `docs/compliance/
   identity-compliance-register.md` (J0 rescue), `docs/adr/MMT-ADR-*`, `docs/registers/llm-models/`.

**⇒ J3 makes ZERO file moves.** Nothing nonconformant is identity-*blocking*; the nonconformant
remainder is estate-wide reorg = Stream 2.

## Per-item decisions

| Item(s) | Class | §I.4 target | Decision |
|---|---|---|---|
| `canon/ adr/ specs/ plans/ runbooks/ assets/ _archive/ registers/ compliance/`, `audit/` (Meta) | sanctioned dirs | — | **KEEP** (conformant) |
| `INDEX.md` | cross-layer umbrella index | docs/ root | **KEEP** — boot-flow linchpin; umbrella index by role |
| `project_context.md` | agent-doctrine satellite (J2-edited) | doc-arch question | **KEEP** at root; "where doctrine satellites live" is a Stream-2 doc-architecture call, not identity-reachable |
| `architecture.md`, `PRD.md`, `ux-design-specification.md` | L1 estate spine | `docs/canon/` | **DEFER Stream 2** — estate-canon drain (ADR-0000:200). `architecture.md` carries the identity carve-out, but whole-file relocation ripples every citation = Stream-2 job |
| `change-classes.md` `deployment-and-secrets.md` `e2e-smoke-pack.md` `future-app-options.md` `llm-issues.md` `pre-launch-checklist.md` `ux-todos.md` | L3 operational | `specs/`/`runbooks/` | **DEFER Stream 2** — L3 classify+relocate; not identity-reachable |
| `logo.svg`, `flows/ logo-designs/ mockups/ screenshots_and_store_info/ visual-artefacts/`, `privacy-policy.html` | assets / legal artifact | `assets/` (priv→`compliance/`?) | **DEFER Stream 2** — asset consolidation (estate-wide) |
| `E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/` | nonstandard dirs | per-file fate | **DEFER Stream 2** — INDEX caveat #3. `meetings/` holds the LLM memo cited by ADR-0014/0016 at its current path → move ripples ADR cites = Stream 2 |

## Two explicit identity-touching rulings

- **`audience-matrix.md`** (identity-reachable — `prd.md:319` cites it; the nav-IA source the J1 memories
  repoint to): **DEFER Stream 2** — it is a cross-cutting product/nav doc, not identity *domain* canon
  (not in the canonical set). Named flag: when Stream 2 drains it, update `docs/canon/identity/prd.md:319`.
- **`glossary.md`** (confirmed the rogue non-canon DRAFT — "NOT canon", started 2026-06-08): **follows
  its already-ratified disposition** in the ROADMAP cross-cutting thread — bucket 1 (identity actors)
  already rode J0/J1; **bucket 2** → new learning-domain canon stream; **bucket 3** → Stream 2; deleted
  after bucket-2 consumes it. **Not J3's to move/delete.**

## Exit-gate checklist — EXECUTED 2026-06-09

- [x] Every loose top-level doc + nonstandard dir has a per-item decision (table above).
- [x] No mislocated-citation defect on the identity surface; identity-produced docs all in sanctioned homes.
- [x] J3 makes zero file moves — nothing nonconformant is identity-blocking; remainder deferred to Stream 2.
- [x] Each defer carries a named reason (estate-canon drain / asset consolidation / nonstandard-dir
      reconciliation — all Stream 2 per ADR-0000:200 + INDEX caveats #2/#3).
- [x] Two identity-touching files explicitly ruled (`audience-matrix.md`, `glossary.md`).
- [x] No `audits/` duplicate exists (only the sanctioned `audit/`); that INDEX caveat-#3 item is clean.

**Phase J (J0–J3) is now fully dispositioned.** Next runway phase: K+L (consolidation + gap analysis,
currently in flight via the workflow session), then M–P.
