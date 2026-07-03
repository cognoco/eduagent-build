# Registers — governed data masters + their provenance trails

**Layer:** L3 Operational (per `docs/adr/MMT-ADR-0000` §I.4 — *type-first, domain-second*).

A **register** is a piece of **policy-engine data** that, until the policy-engine
database exists, has no runtime home — so it is held here as an **interim master**
in a migration-ready shape, paired with the **immutable provenance trail** that
records every change to it. This is the documentation-layer image of the
**DB-is-master** principle (`MMT-ADR-0013` §2): the register *is* the source of
truth for its data while interim; the trail records only the *why/when/who-verified*
of each change — never a second copy of the data.

Registers are **not canon** (L1). Canon points *at* them; it never copies their
volatile contents (`MMT-ADR-0013` §2, `MMT-ADR-0014`). Each register migrates into
the policy-engine DB when that structure is built; this folder then becomes the
historical provenance archive and the master banner flips to "migrated".

## Governance rule (standing)

Every change to a register's master **must** be accompanied by a new, immutable
provenance record in that register's trail folder. The record carries the
decision/vetting evidence for the change; the master carries only the resulting
rows. A master edit without a matching trail record is a governance violation.
This is the per-datapoint decision-trail discipline (`MMT-ADR-0013` §2) applied to
each register.

The **procedure** for producing a record (the criteria checklist) lives as a runbook —
for `llm-models`, `docs/runbooks/llm-model-vetting.md`.

## Current registers

| Register | Master | Trail | Migrates to | Backing ADR(s) |
|---|---|---|---|---|
| **llm-models** | [`llm-models/master.md`](llm-models/master.md) | [`llm-models/vetting/`](llm-models/vetting/) | policy-engine `allowed_models` | `MMT-ADR-0014` (router/vetting split), `MMT-ADR-0013` (engine), `MMT-ADR-0016` (safety/judge architecture) |
| **safety-guards** | [`safety-guards/master.md`](safety-guards/master.md) | [`safety-guards/trail/`](safety-guards/trail/) | policy-engine (target TBD) | none yet — see `docs/adr/MMT-ADR-0000` for the ADR significance gate |
| _policy-cells_ (planned) | — | — | policy-engine policy matrix | `MMT-ADR-0013` |

## Conventions

- **Master** (`master.md`) is **living** — current vetted state, edited in place,
  always migration-ready. It carries a banner naming its DB migration target.
- **Trail** records are **immutable**, one file per change *event*, dated
  `YYYY-MM-DD-<change-slug>.md`. A later change is a *new* record, never an edit
  to an old one. After-the-fact records are stamped `reconstructed YYYY-MM-DD`
  per `MMT-ADR-0000` reconstruction discipline.
- Each register folder is self-indexing via its master's header table.
