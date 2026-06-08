---
name: Identity Foundation — decisions pointer
description: Pointer to the ratified identity / tenancy / policy-engine / router / safety ADRs + the llm-models register. Pre-implementation runway (phases A–P) tracked in _wip/identity-foundation/ROADMAP.md. NOT a content copy — read the canon.
type: project
---

Pointer-only signpost (per the memory↔canon rule, `MMT-ADR-0000` amendment 2026-06-07:
memory cites canon, never copies it). The identity-foundation re-platform is a
pre-launch **clean-cut** rebuild of identity/tenancy/role; its decision trail is canon,
not here.

**Decision records (canon — read these, don't trust a paraphrase):**
- `docs/adr/MMT-ADR-0007…0010` — core identity entity/role model, payer capacity, guardianship edge, family-join primitive.
- `docs/adr/MMT-ADR-0011` / `0012` — data-model realization + one-time baseline reset.
- `docs/adr/MMT-ADR-0013` — policy-engine spine (two primitives, regime taxonomy, knowledge axes, router key).
- `docs/adr/MMT-ADR-0014` — router runtime (3-param) ⟂ vetting (4-axis, offline); fail-closed; separately-routable tutor/judge roles.
- `docs/adr/MMT-ADR-0015` — pre-baseline data-model amendments.
- `docs/adr/MMT-ADR-0016` — safety/judge architecture (no app-owned denylist; vendor-independent, non-reasoning judge).

**Live data (not canon, DB-bound):** `docs/registers/llm-models/` — vetted model master + per-change vetting trail. Procedure: `docs/runbooks/llm-model-vetting.md`.

**Stream canon + tracker:** `_wip/identity-foundation/` — `ROADMAP.md` (live status, phases A–P), `identity-ontology.md`, `domain-model.md`, `data-model.md`, `identity-foundation-prd.md`, the signed A-vs-B memo.

**State (2026-06-08):** Phase F **closed**; Phase G next (lock the canonical set + seed the documentation index). Carried contingency: R-1 (COPPA) provisional posture — real counsel sign-off (HW-2) owed, not launch-blocking. Note: the `project` "Strictly 11+" memory is **superseded** by the Path-X 13+ consent floor (sub-13 built-but-gated) — Phase-J cleanup target.
