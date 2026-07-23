# Documentation Index — the boot-flow linchpin

**Status: SEEDED 2026-06-08 (identity-foundation Phase G).** This index is *seeded*,
not complete — it enumerates the layers and the **identity-foundation** canon in full;
the estate-wide population (the rest of `docs/`) is **Phase J / Stream 2** work. Treat
absence from this index as "not yet indexed," not "does not exist."

## What this is

The single cross-layer index of the repo's documentation. It is the middle of the
intended **agent boot-flow**:

```
CLAUDE.md / AGENTS.md   →   THIS INDEX   →   the layered canon
(pointer layer)             (what exists,      (the actual docs:
                             across layers)     canon · ADRs · specs · …)
```

Per-layer indexes already exist (`docs/adr/README.md`, `docs/registers/README.md`,
`docs/audit/INDEX.md`); what was missing — and what this file is — is a **unifying**
index that names what is available *across* layers so an agent (or human) can orient
in one read. The five-layer model itself is defined in
[`docs/adr/MMT-ADR-0000`](adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md) §I.1.

## The layers (per `MMT-ADR-0000` §I.1 / §I.4)

| Layer | Holds | Physical home (§I.4) | Per-layer index |
|---|---|---|---|
| **L1 — Canon** | The *what*: contracts, invariants, target models, product truth | `docs/canon/` (identity domain canon lives in `docs/canon/identity/`; loose root docs drain here in Phase J/Stream 2 — `MMT-ADR-0000` §I.4) | *(this index, § Canon)* |
| **L2 — Decisions** | The *why*: ADRs (`MMT-ADR-NNNN`) | `docs/adr/` | [`docs/adr/README.md`](adr/README.md) |
| **L3 — Operational** | Specs, plans, runbooks, **registers** (governed data masters + trails) | `docs/specs/`, `docs/plans/`, `docs/runbooks/`, `docs/registers/` | [`docs/registers/README.md`](registers/README.md) |
| **Meta / audit** | Work *about* the repo (audits, cleanup), not product docs | `docs/audit/` | [`docs/audit/INDEX.md`](audit/INDEX.md) |
| **L4 — Memory** | Working-style, heuristics, transient gotchas, **pointers** into this index | `.claude/memory/` | [`.claude/memory/MEMORY.md`](../.claude/memory/MEMORY.md) |

> **The L4↔L1 rule (ratified 2026-06-07, `MMT-ADR-0000` amendment).** Structured canon
> is master; **memory never holds a *copy* of canon** — only pointers, non-canon
> working state, and user/feedback facts. Memory pointers point *at this index*. The
> retroactive alignment (restructuring existing memories into pointers) is **Phase J**.

---

## Canon — the identity-foundation set (first indexed content)

The identity-foundation carve-out is the **first domain whose canon is fully indexed.**
Its membership is **locked and enumerated** in the canonical-set confirmation — that
file is the authoritative list; this index points at it rather than duplicating it:

➡ **[`_wip/identity-foundation/CANONICAL-SET.md`](../_wip/identity-foundation/CANONICAL-SET.md)** — the locked set; see that document for the current membership/count and each member's role.

The members, at a glance (full roles + status in the canonical-set doc):

- **Domain docs (L1):** [`ontology.md`](canon/identity/ontology.md) · [`domain-model.md`](canon/identity/domain-model.md) · [`data-model.md`](canon/identity/data-model.md) · [`prd.md`](canon/identity/prd.md) — *graduated `_wip/` → `docs/canon/identity/` in Phase J0 (2026-06-08), per the `MMT-ADR-0000` §I.4 domain-canon sub-layout amendment; filenames dropped the domain prefix.*
- **Compliance (L1):** [`docs/compliance/README.md`](compliance/README.md) — front door for the consolidated privacy, audience, age/country, and historical evidence set; [`identity-compliance-register.md`](compliance/identity-compliance-register.md) — binding compliance obligations; [`2026-07-23-13-plus-eea-launch-country-ruling.md`](compliance/2026-07-23-13-plus-eea-launch-country-ruling.md) — product age bands, the 30-country EEA policy perimeter, residence-based consent thresholds, and launch gates.
- **Decisions (L2):** [`MMT-ADR-0000`](adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md) (+ 5 amendments) · `MMT-ADR-0007`–`0010` (domain) · `MMT-ADR-0011`/`0012`/`0015` (data) · `MMT-ADR-0013`/`0014` (policy-engine + router) · `MMT-ADR-0016` (safety/judge) · `MMT-ADR-0018` (LLM orchestrator) — all under [`docs/adr/`](adr/)
- **Registers (L3, not canon):** [`docs/registers/llm-models/`](registers/llm-models/) — vetted-model master + vetting trail
- **Audit trail:** [`2026-06-XX-a-vs-b-decision-capture.md`](../_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md) — the A-vs-B grilling record (Option III, immutable)
- **Supporting specs (L3, not canon):** the two `2026-06-06` LLM-routing specs in [`docs/specs/`](specs/)

The identity-foundation runway's live status doc is
[`_wip/identity-foundation/ROADMAP.md`](../_wip/identity-foundation/ROADMAP.md).

### Canon for the rest of the estate — NOT YET INDEXED (Phase J / Stream 2)

Loose canon-class documents still live at `docs/` root and have **not** been drained
to `docs/canon/` or indexed here. They exist and are authoritative for their domains;
they are simply not yet enumerated in this index. Known loose canon awaiting the
drain: `architecture.md`, `PRD.md`, `ux-design-specification.md` (per the Phase-J
`docs/` reorg, gated on this Phase-G canon-lock). Until then, find them at the repo
root and in `docs/`.

---

## L2 — All decisions (ADRs)

The full ADR register and the significance gate live in
[`docs/adr/README.md`](adr/README.md). Current ADRs: `MMT-ADR-0000`–`0019`, `MMT-ADR-0021`, `MMT-ADR-0022`
(`0003` is unused — number gap, not a live record; `0020` is reserved for the identity-foundation cutover-plan consent-request ADR and is not yet filed; `0017` records the concept-capture additive layer; `0018` promotes the legacy `ARCH-8` LLM-orchestrator entry; `0019` records the OS-agnostic cross-platform development policy; `0021` records the freeform Library-filing threshold (five-exchange gate); `0022` records the activity-ledger narration substrate). The legacy `ARCH-1…ARCH-26` register (frozen; code-cited;
draining to ADRs as Stream-2 work) is described in `MMT-ADR-0000` Part III.

## L3 — Operational

- **Specs** — `docs/specs/` (feature definitions; the `decision-adr-link` ratchet
  enforces ADR links on significant decision blocks).
- **Plans** — `docs/plans/`.
- **Runbooks** — `docs/runbooks/` (procedures; e.g. `llm-model-vetting.md`).
- **Registers** — `docs/registers/` — governed data masters + immutable provenance
  trails; **not canon** (canon points at them). Index: [`registers/README.md`](registers/README.md).

## Meta / audit

Work *about* the repo (audits, cleanup analyses) — [`docs/audit/INDEX.md`](audit/INDEX.md).
These are not product documentation.

---

## Seed-state caveats (what this index does NOT yet do)

1. **Estate-wide canon is not indexed** — only identity-foundation. The rest is
   Phase J / Stream 2.
2. **`docs/canon/` is seeded, not full** — the identity domain canon is graduated into
   `docs/canon/identity/` (Phase J0, 2026-06-08); the loose root estate canon
   (`architecture.md`, `PRD.md`, `ux-design-specification.md`) still drains into
   `docs/canon/` in Phase J / Stream 2.
3. **Near-duplicate / non-standard `docs/` dirs** (`audit`/`audits`, `analysis`,
   `_scratch`, `_vault`, `superpowers`, `E2Edocs`) are **not** reconciled here — their
   per-file fate is a Phase-J decision.

When those land, this index grows from a seed into the complete cross-layer map.
