# Batch 3 — Platform / LLM cutover · Execution Tracker

> **Restructured 2026-07-10 (operator ruling): waves are scrapped, replaced by 5 parallel agent
> batches.** This tracker (path is the historical `wave-0/`) now describes **Batch 3, a normal
> batch like the others** — no reserved executor (the agent on WI-1167 was stood down; its claim
> is clear, the item sits Executing awaiting pickup). The other ex-Wave-0 build items moved to
> the heads of Batches 1/2/5; operator/legal items (DPO/DPIA, AI-Act self-assessment, counsel
> consumers) left the agent queues entirely (tag `manual-external`).

## Charter

Deliver the platform / LLM-cutover chain. Cosmo Sprint row (membership SoR):
**`Batch 3 — Platform / LLM cutover` · `3998bce9-1f7c-815f-b5e8-dab473b3ceb5`**.
Workstreams stay bookkeeping axes. Freeze: LIFTED 2026-07-10 (all MentoMate).

## Batch structure (all 5 startable in parallel, ruled 2026-07-10)

| Batch | Sprint row | Items |
|---|---|---|
| 1 — Verified-learning engine & proof | `3998bce9-1f7c-8170-99ea-c813067e5ae0` | 11 |
| 2 — Language vertical | `3998bce9-1f7c-8120-81b2-c330290c7d34` | 7 |
| **3 — Platform / LLM cutover (THIS LANE)** | `3998bce9-1f7c-815f-b5e8-dab473b3ceb5` | 5 |
| 4 — Supporter, activation & ratified bugs | `3998bce9-1f7c-8127-8988-e24fe7649b26` | 10 |
| 5 — Hardening, ops & billing | `3998bce9-1f7c-81e6-96a6-d7704bcb1d0e` | 15 |

Every open Blocked-by edge is intra-batch (audited 2026-07-10) — a lane claims any member with
no open blocker, chains unroll inside the batch.

## This batch (4 items — Workstream Order = intra-batch claim sequence)

| Order | WI | What | Note |
|---|---|---|---|
| 10 | WI-1167 | Staging deploy-migration fix | Executing, claim clear — pick up first |
| 20 | WI-1685 | V2 LLM-routing cutover chain (bake-off → staging gates → prod flip) | after 1167; rollback = flag flip |
| 30 | WI-1686 | Suitability-judge enablement | after 1685 |
| 40 | WI-1779 | Prompt-caching bundle (1687+1688) | after 1685 |

WI-1505 (spend guardrails) was already Closed — removed from the batch 2026-07-10.

## Canon authority

- Scope: `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md`. Sequencing rationale: `RUNWAY.md`
  (same dir — its wave layout is superseded by the batch rows; degrade lines + cross-vertical
  yield still stand).
- Program roadmap: **PGM-1** (Cosmo Programs DB, page `3928bce9-1f7c-8130-ac4c-c422e9db928d`).
- Engineering rules: repo `AGENTS.md` (claim-before-execute, complete-at-land, review-gate closes).

## How to use

Fresh shepherd: read PGM-1 → this tracker → query the Sprint row for live membership → claim the
highest-leverage unblocked item (`/cosmo:execute claim`) → TDD → land → `/cosmo:execute complete`.
Never claim `manual-external`-tagged items (operator/legal track).

## Log

- 2026-07-10 — Lane stood up at freeze lift as "Wave 0".
- 2026-07-10 (late) — Waves scrapped → 5 parallel batches (operator). Lane re-pointed at Batch 3;
  wave Sprint rows archived; trust builds 1497–1502 held sprint-less behind WI-1767 design
  (external); they join Batch 4 when the design lands.
