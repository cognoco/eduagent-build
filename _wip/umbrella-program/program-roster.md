---
title: Umbrella Program Roster
status: EMBRYO (seeded 2026-06-09)
owner: Jorn (human orchestrator)
scope: cross-program index for the eduagent-build pre-launch effort — spans the
  identity-foundation runway, the Harness Hygiene program (executed from nexus),
  and the remediation/backlog streams emerging from the audit triage.
---

# Umbrella Program Roster

**What this is.** The single orientation surface for the body of work centred on
eduagent-build's pre-launch hardening. It is the "umbrella" — a *program board*
that sits **above** Cosmo and above any individual stream's plan. It answers, for
a two-person team: *what programs exist, what's active vs. waiting, what gates
what, and where does each one's detail live.*

**What this is NOT.** Not a tracker (each program keeps its own), not a Cosmo
object, not a backlog. It holds **rows and pointers**, never content.

## The one hard rule

**Pointers, never copies.** Every program's detail (charter, decomposition,
per-item state) lives in exactly one home — its tracker, its roadmap, or its
backlog doc. This roster *points* at that home. The same fact must never live in
two places. (The Stream-2 backlog is the one planned *move* — relocating its home
out of the runway ROADMAP into this folder — which is still one home, not a copy.)

## Why this shape (harvest-ahead intent)

Cosmo today is bottom-up (issue → Work Package → Sprint → Workstream); it has no
top-down delivery layer (PRD → epic → story). This roster is a deliberate
hand-built prototype of that missing layer. Each row is shaped as a **proto-epic**
so that when the Cosmo top-down layer is eventually built, harvesting is
mechanical: *each row → a Cosmo Epic; its tracker's waves → the stories.* The
`Activate-when` field is the highest-value capture — it's the one thing Cosmo
structurally cannot express today.

**Row schema (proto-epic):** `ID` · `Stream` · `Status` (active / embryo /
backlog / blocked / done) · `Owner` · `Outcome` (one-line "done means") ·
`Depends-on` (cross-program gates) · `Decomposition` (pointer to the detail home)
· `Activate-when` (birth-trigger; embryo/backlog rows only).

ID scheme: `PRG-NN`, gaps left for insertion (active 01–09, emerging 10–19,
backlog 20–29), mirroring the harness tracker's increment convention.

---

## Active

### PRG-01 · Identity Foundation runway — `active`
- **Outcome:** clean-cut replacement of eduagent's identity/tenancy/role/consent
  bedrock (8-table schema, 6-persona capability split, policy engine + model
  router, three-axis age model). Pre-launch: build direct, re-seed, delete legacy
  — no dual-model, no backfill.
- **Owner:** Jorn (+ runway session agents)
- **Depends-on:** **Phase P (Cosmo slicing / execution start) is blocked-by
  Harness-Hygiene exit-gate `WI-530`** (mirrored by boundary node `WI-533`).
- **Decomposition:** `_wip/identity-foundation/execution-tracker.md` (the durable
  execution entry point — charter / WI map / wave sequence / coarse status; created
  by Phase-P slicing 2026-06-10). `_wip/identity-foundation/ROADMAP.md` is now the
  **historical record** of the A–P planning runway (master plan
  `2026-06-09-phase-o-master-plan.md` ratified 2026-06-09).
- **P sliced (2026-06-10):** all 21 O units live in Cosmo (WI-569…WI-586 + the W0
  trio below) under the new Cosmo **Workstream "Identity Foundation"**
  (`37b8bce9-1f7c-81c2-bb42-cf7f47f839cc`), with native dependency edges per O §4.
  **Execution start of W1+ remains gated on `WI-530`.** Live state is Cosmo's.
- **W0 decoupled (2026-06-09):** the 11 patch-now security defects ship immediately
  on the current harness, ungated by `WI-530`/Phase P (O §7 decision 4). Instantiated
  in Cosmo: **`WI-549`** (api bundle, 7 findings, WP) · **`WI-550`** (inngest bundle,
  3 findings, WP) · **`WI-551`** (billing F-121, Item) — project MentoMate;
  WI-549/550 Closed/Done (PRs #817/#818, merged 2026-06-10), WI-551 still Ready.
  Live state is Cosmo's; this is a pointer. (Baseline reset stays gated with W1.)
- **Activate-when:** — (active)

### PRG-02 · Harness Hygiene — `active`
- **Outcome:** eduagent-build's dev-execution harness (commit → pre-commit →
  pre-push → CI → review → merge tail) rewired and ZDX/cosmo-skill-backed to
  replacement-parity (80/20), so PRG-01 Phase P can begin on a trustworthy
  harness. Bar is parity, NOT finishing ZDX.
- **Owner:** Hex + Vetinari (joint)
- **Depends-on:** — (no upstream program). **Gates → PRG-01 Phase P** via
  `WI-530` → `WI-533`.
- **Decomposition:** `nexus:_WIP/zdx-productionization/harness-hygiene-tracker.md`
  (the durable entry point; Cosmo `WI-530` exit-gate WP holds live per-item state).
- **Activate-when:** — (active)

### PRG-03 · Instruction-surface / memory-doctrine cleanup — `in-progress`
- **Outcome:** the `.claude/memory` + `AGENTS.md`/`CLAUDE.md` + doctrine surface
  cleaned and partitioned — operational/harness content extracted to canonical
  homes (owned here, pre-P), product-canon content left for the Stream-2 drain
  (post-execution). Prevents the three-stream collision on the same files.
- **Owner:** cross-stream QA (Identity Foundation + Harness Hygiene + ZDX), driven
  via the disposition matrix.
- **Control doc / decomposition:** `_wip/identity-foundation/2026-06-09-instruction-surface-disposition-matrix-v0.md`
  (internally **v1**, status "AGREED DEFAULTS"; batch model B0–B6 + per-row
  owner/blocker). **This is the source of truth — do not duplicate it here.**
- **Status (2026-06-09):** B0 (Phase-J fallout) + **B1 (no-blocker tombstones — 3
  memories deleted) DONE**; **B2 (only-home footgun extraction) PARTIAL** (8
  duplicates deleted, homes verified); memory 89 → 78. Remaining: B3 (harness
  left-ratchet) → `WI-531` extract then `WI-387` prune; B4 (AGENTS/CLAUDE converge)
  → `WI-386`; B5 (skills/commands/hooks); B6 (archive purge) → `WI-387` last.
- **Depends-on:** B3/B4/B6 sequenced inside PRG-02 (HH owns `WI-531`/`WI-387`/`WI-386`);
  canon-class rows → PRG-20 (Stream 2).
- **N.0 routing (Phase N, 2026-06-09):** the audit `agent-instructions` doc-findings
  (F-037/038/039/040/041/042/045/046, F-113/114) were ruled to HH / PRG-03 (not
  Stream 2), all non-blocking → default-defer.
- **Activate-when:** active — the matrix already *is* the agreed owner-map; no
  promotion gate remains. Formal status-flip (if wanted) is the QA-stream owner's call.

---

## Emerging — clear-out workstreams from the audit triage (firm @ Phase M)

> **Firm from committed Phase M** (`docs/audit/2026-05-29-full-audit/M-triage-closure.md`,
> 2026-06-09). Four-bucket triage of 183 findings → **bucket 1 = 0** (already handled,
> demonstrated-empty), **bucket 2 = 49** (clear-in — these are **PRG-01's own
> obligations, NOT emerging streams**), **bucket 3 = 125** (clear-out, named workstream
> — *these are the emerging streams below*), **bucket 4 = 9** (defer; 7 no-owner, 2
> architecture). Per-finding home is `L-gap-delta.md` (**do not** copy findings here).
> Counts tallied from its `Defer-to-workstream` column (123 of 125 parsed cleanly; ~2
> rows have embedded pipes — immaterial at this altitude).
>
> **Phase N has landed (2026-06-09).** **N.0 ruled the pull-forward subset EMPTY** —
> across the 125 clear-out + 9 deferred findings AND the parked Stream-2 canon body,
> *nothing* is a pre-execution prerequisite of PRG-01; default-defer holds everywhere
> (source of truth: `stream-2-backlog.md § N.0 partition`, committed). **N.1** sequenced
> only the *in-scope* 49 bucket-2 obligations into waves W0–W4 (that's PRG-01's internal
> plan, not these rows) and explicitly left the clear-out/deferred rows for **Phase O to
> order by blast-radius** (`2026-06-09-phase-n-sequencing.md § Out-of-scope`). So every
> row below now reads `activate-when = deferred (N.0 empty); Phase O orders by
> blast-radius`. `Blast-radius` is sharpened from N.1's out-of-scope notes where it gave
> signal, but O is the authority.

### Substantial clusters

| ID | Clear-out workstream | Findings (bucket 3) | Blast-radius vs PRG-01 (N.1 signal; O is authority) | Activate-when |
|---|---|---|---|---|
| PRG-10 | security-pii-api | 27 | **mixed** — IF-slice in-radius (W2/W3); clear-out remainder = non-IF code | deferred (N.0 empty); Phase O orders by blast-radius |
| PRG-11 | architecture | 24 | **partly in-radius** (god-modules/pkg-boundaries; some lands W1) | deferred (N.0 empty); Phase O orders by blast-radius |
| PRG-12 | l10n-a11y-mobile | 33 | **mostly outside** → parallel-safe | deferred (N.0 empty); Phase O orders by blast-radius |
| PRG-13 | security-pii-inngest | 6 | **mixed** — IF-slice in-radius (W3); remainder non-IF | deferred (N.0 empty); Phase O orders by blast-radius |
| PRG-14 | agent-instructions | 10 | partial **inside** (overlaps PRG-03) | N.0: routed to HH / PRG-03, sequenced **pre-P** (not Stream 2); defer |
| PRG-15 | errors-api | 8 | likely **outside** → parallel-safe | deferred (N.0 empty); Phase O orders by blast-radius |

### PRG-16 · Singleton tail — ~15 single-finding labels, unnormalized
One-finding "workstreams" with drifted/duplicative labels — `ci-cd-hardening` ≈
`platform-security / ci-cd-hardening`; `platform-infra` ≈ `infrastructure /
database-performance` ≈ `backend-performance`; `test-infrastructure` ≈
`mobile-testing-infra`; plus `secrets-hygiene`, `reliability-and-correctness`,
`navigation/audience-matrix`, `mobile-cache-data-fetching`, `learning-engine`,
`content / curriculum data quality`, `billing-subscriptions`, `agent-infrastructure`.
**Do not enshrine as 15 workstreams** — these are orphan findings the master plan (O)
should merge into the substantial clusters or a catch-all. Tracked as one row pending
N/O consolidation. `activate-when`: N/O normalization.

**Carry-forward (from M):** F-113/114/116 → **PRG-14 (agent-instructions)** must dedupe
against the `tech/*` skill-group (`tech/zod`, `tech/drizzle-atomicity`,
`tech/neon-postgres`, `tech/gha-hardening`; commit `e4c23f0c8`) before building —
coverage is partial, so *reduce-and-extend*, not build-from-scratch.

**Note on bucket 2 (49 in-IF):** these carry domain tags too (security-pii-api 23,
security-pii-inngest 14, architecture 7, billing 2/1, l10n 1, errors 1) but they are
**PRG-01's acceptance criteria**, owned by the runway — not emerging rows.

---

## Backlog — defined bodies, linked not converted

### PRG-20 · Stream 2 — estate-canon drain — `backlog`
- **Outcome:** drain legacy/scattered canon (the `architecture.md` structural
  rebuild, `ARCH-N` register drain, ~70-decision ADR backfill, principles
  catalog, product-domain canon, docs-tree reorg) into clean canonical docs.
  Also receives `docs/glossary.md` **bucket 3** (cards/celebrations: principles →
  `ux-design-specification.md`; terms → per-area `CONTEXT.md`; inventories → L3 register).
- **Owner:** (unassigned)
- **Depends-on:** the bulk follows PRG-01 execution (moot-by-refactor: don't
  rebuild canon for areas the clean-cut rewrites). Named + ordered by PRG-01
  Phase O.
- **Decomposition:** `_wip/umbrella-program/stream-2-backlog.md` (home doc — extracted
  from the runway ROADMAP 2026-06-09; the runway now carries a pointer + a repointed N.0
  gate). Inbound feed-in (J3 deferrals, glossary bucket 3, ADR-drain identity tail) is
  listed there.
- **Activate-when:** post-execution, OR Phase O names its first pull-forward cluster.

### PRG-21 · Learning-domain canon design stream — `backlog`
- **Outcome:** *design* (not drain) the learning-domain canon — naming
  conventions, notes taxonomy, the learning-loop, learning modes. A sibling-to-
  Stream-2 **design** stream (like the identity-foundation runway was), not a drain.
- **Owner:** product (Zuzana) + agent.
- **Depends-on:** — (blast-radius-independent of PRG-01: the identity clean-cut
  does not rewrite notes / cards / mastery / learning-loop, so this is
  parallel-safe if product pulls it early).
- **Primary input:** `docs/glossary.md` **bucket 2** (the rogue, non-canon
  drift-map's learning/structure terms). Sibling buckets already routed:
  bucket 1 (actors/roles) absorbed by PRG-01 in Phase J0/J1; bucket 3
  (cards/celebrations) → PRG-20 / Stream 2.
- **Decomposition:** disposition in `_wip/identity-foundation/ROADMAP.md`
  cross-cutting thread (≈ L271–282) + decision log (L498, L511–513); **no design
  doc yet.**
- **Activate-when:** *ratified 2026-06-09 (hardened-B).* Product begins any
  learning-domain feature work (notes / cards / mastery / learning-loop), **OR**
  `docs/glossary.md` is scheduled for deletion — whichever first. Default-defer
  behind PRG-01 until then; parallel-safe if product pulls it early.

---

## Post-P operating model — two streams (ruled 2026-06-09)

Once Phase P lands (IF Workstream + WPs in Cosmo + execution tracker), the umbrella
splits into **two concurrent streams** — there is **no** "IF executes end-to-end before
anything else" rule:

1. **IF execution** — W0→W1→…→tail per the IF execution tracker. Owns the critical
   path and most human attention.
2. **Everything-else planning** — umbrella activity: normalize the PRG-16 singleton
   tail, charter PRG-10–15 (outcome / size / owner), run PRG-14's `tech/*` dedupe,
   convert `activate-when` into an **activation queue**. Planning consumes agent
   capacity, not execution throughput — it never waits on IF.

A planned stream then starts **executing in parallel with IF** when, per stream:
- **Blast-radius class allows it** (O §2): parallel-safe (l10n, singletons,
  agent-instructions) → anytime; serialize-class (security-pii remainders,
  errors-api) → only after W2/W3 land, regardless of plan readiness.
- **Pipeline is proven, not finished:** a few IF WIs through claim→execute→review→
  close cleanly (realistically during W0/W1) — not IF completion.
- **Attention budget allows it** (the honest 2-person constraint; per-fortnight call).

First parallel activation will likely be a parallel-safe, agent-heavy, low-supervision
stream (l10n-a11y is the archetype). Serialize-class streams get planned early so they
launch the moment W2/W3 clears them.

## Cross-program gates (the edges that matter)

```
PRG-02 Harness Hygiene  ──(WI-530 exit-gate → WI-533 boundary)──▶  PRG-01 Phase P (execution start)
PRG-03 operational-memory cleanup  ──(sequenced inside)──▶  PRG-02 (WI-531 → WI-387 last)
PRG-20 Stream 2 (canon class) + PRG-11/14 (in-blast-radius findings)  ──(moot-by-refactor)──▶  follow PRG-01 execution
PRG-10/12/13/15 (out-of-blast-radius findings)  ──▶  parallel-safe (throughput limit = 2 people, not deps)
```

---

## Change log
- **2026-06-10 — PRG-01 Phase-P slicing landed; decomposition repointed.** All 21
  identity-foundation units now live in Cosmo (WI-569…WI-586 created; W0 trio
  549/550/551 pre-existing) under the new Cosmo Workstream **"Identity Foundation"**
  with O §4 dependency edges. PRG-01 `Decomposition` repointed to
  `_wip/identity-foundation/execution-tracker.md` (ROADMAP → historical record).
  W1+ execution start still gated on `WI-530`; W0 patches decoupled (549/550
  already Closed/Done via PRs #817/#818).
- **2026-06-09 — seeded (EMBRYO).** Roster created in `_wip/umbrella-program/`.
  Active rows PRG-01/02/03 populated; emerging clusters PRG-10–15 seeded as
  provisional from RECONCILED.md (firm at Phase M close); backlog PRG-20 (Stream 2,
  move pending) + PRG-21 (learning-canon, no trigger) linked. Stream-2 extraction
  HELD: ROADMAP under concurrent M-triage edit; extraction is consolidate-then-
  repoint, not a clean cut.
- **2026-06-09 — Stream-2 extracted + glossary resolved + emerging rows firmed from M.**
  (1) Stream 2 moved to `stream-2-backlog.md`; PRG-20 repointed; runway ROADMAP left a
  pointer + N.0 repointed (commit `1cc701d56`). (2) PRG-21 enriched (glossary bucket-2
  = primary input) + proposed trigger; PRG-20 gains glossary bucket-3. (3) Emerging
  section re-derived from committed Phase M (`M-triage-closure.md` + `L-gap-delta.md`
  `Defer-to-workstream` tally): bucket 2 (49) = PRG-01 obligations (not emerging);
  bucket 3 (125) clear-out = PRG-10–15 (6 substantial) + PRG-16 (singleton tail). All
  `activate-when` deferred to Phase N (forked session `fb669557…`), which is setting the
  pull-forward partition + sequencing now.
- **2026-06-09 — PRG-21 ratified + Phase N ingested.** (1) **PRG-21** trigger ratified
  (hardened-B): owner pinned (product Zuzana + agent); `activate-when` = product begins
  learning-domain feature work OR glossary scheduled for deletion, whichever first;
  blast-radius-independent → parallel-safe. (2) **Phase N landed** (committed `13770b7c7`
  N.1 + N.0 in `stream-2-backlog.md`): N.0 ruled pull-forward **EMPTY**, so PRG-10/11/12/
  13/15 `activate-when` flipped `pending N.0` → `deferred (N.0 empty); Phase O orders by
  blast-radius`; PRG-14 records the agent-instructions → HH/PRG-03 pre-P routing; blast-
  radius cells sharpened from N.1's out-of-scope notes (O remains authority). Emerging
  banner updated to "Phase N landed." Note: N.1 cites l10n clear-out as **34** vs roster's
  33 (±1 pipe-parse drift, footnoted) — `L-gap-delta.md` remains the per-finding authority.
