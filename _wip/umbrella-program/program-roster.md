---
title: Umbrella Program Roster
status: ACTIVE (seeded 2026-06-09 as embryo · fully operational 2026-06-10)
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
- **Depends-on:** Harness-Hygiene exit-gate `WI-530` → `WI-533` — execution was
  operator-waived ahead (2026-06-10); **HH PR #832 merged 2026-06-11 (G1 fired)**,
  so only the formal Cosmo closes of WI-530/533 remain.
- **Decomposition:** `_wip/identity-foundation/execution-tracker.md` (the durable
  execution entry point — charter / WI map / wave sequence / coarse status; created
  by Phase-P slicing 2026-06-10). `_wip/identity-foundation/ROADMAP.md` is now the
  **historical record** of the A–P planning runway (master plan
  `2026-06-09-phase-o-master-plan.md` ratified 2026-06-09).
- **P sliced (2026-06-10):** all 21 O units live in Cosmo (WI-569…WI-586 + the W0
  trio below) under the new Cosmo **Workstream "Identity Foundation"**
  (`37b8bce9-1f7c-81c2-bb42-cf7f47f839cc`), with native dependency edges per O §4.
  **Execution start of W1+ remains gated on `WI-530`.** Live state is Cosmo's.
- **W0 done (2026-06-10):** all 11 patch-now defects shipped — `WI-549`/`WI-550`
  Closed/Done (PRs #817/#818) and `WI-551` Closed/Done (`c5c9b39bb`). Baseline
  reset `WI-569` executed + PR #845 merged (Reviewing).
- **Execution state (2026-06-12, post WI-586 plan-phase stop):** **ALL WAVES
  CLOSED — W0–W4** (every unit WI-549…584 Closed/Done); gates **G2 + G3 + G4
  FIRED**. Caveat discovered at the tail: the waves built the new model +
  spine + guards, but **the app still runs on the legacy tables** (the W1
  policy-engine spine is a fail-closed scaffold, zero DB reads) — the
  application **cutover** was hidden inside WI-586's "S-sized" drop scope
  (~80 runtime files, 22 Inngest functions, both payment webhooks, 57 FKs).
  `WI-585` (first reseed) Closed; `WI-586` executor performed the **mandatory
  plan-phase STOP** (claim held, zero code) and escalated — **scope ruling
  with the operator** (recommended: split into WP-CUT-A additive model
  completion → WP-CUT-B domain-wise reader cutover, legacy frozen-but-live →
  WI-586 shrunk back to final convergent reseed + verified irreversible drop,
  Neon PITR marker as recovery). **G5 ("tail done") = unchanged as the
  exported boundary node, later in time.** Live state: Cosmo +
  `execution-tracker.md` §5; this is a pointer.
- **Activate-when:** — (active)

### PRG-02 · Harness Hygiene — `graduated` (2026-06-11)
- **Outcome:** eduagent-build's dev-execution harness (commit → pre-commit →
  pre-push → CI → review → merge tail) rewired and ZDX/cosmo-skill-backed to
  replacement-parity (80/20), so PRG-01 Phase P can begin on a trustworthy
  harness. Bar is parity, NOT finishing ZDX.
- **Owner:** Hex + Vetinari (joint)
- **Depends-on:** — (no upstream program). **Gates → PRG-01 W1+ execution start**
  via `WI-530` → `WI-533`.
- **Decomposition:** `nexus:_WIP/zdx-productionization/harness-hygiene-tracker.md`
  (the durable entry point; Cosmo `WI-530` exit-gate WP holds live per-item state).
- **GRADUATED 2026-06-11 — outcome met.** HH PR #832 merged 09:27Z; the
  `WI-530`-related items **closed through review** (critical path complete);
  the new harness is proven in live use (IF W0–W2 executed on it). The
  Initiative's program-level interest is closed.
- **Residue (~12–15 non-critical-path WIs):** being **triaged in a separate
  operator session** (branched 2026-06-11) into quick-land batch / return-to-
  ZDX-stream / park / kill — not all of it stays under the umbrella.
  Dispositions land there; the tracker remains the durable record.
- **Activate-when:** — (graduated; queue entry 3 = residue batch, scope set by
  the triage)

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
- **WI-587 residue (registered 2026-06-10):** the 19 residual `WI-387`
  memory-triage dispositions de-scoped from the HH exit gate (10 user-KEEPs ·
  8 product/user/mixed REVISEs · 1 CONFLICT — `feedback_never_lock_topics`,
  incl. the PRD FR119-vs-FR124 self-contradiction) → Cosmo **`WI-587`**
  (Captured, MentoMate). Evidence base:
  `supporting-artefacts/memory-cleanup.md` (full 55-memory triage results;
  adopted from nexus 2026-06-10 — now a registered PRG-03 artifact, no longer
  rogue). Needs a **~20-min operator ruling session** (queue entry 4). The
  post-HH-merge sequencing hold on executing its edits **lifted 2026-06-11**
  (PR #832 merged) — only the rulings themselves remain.
- **Singleton merge (2026-06-10):** F-036 (`autoMemoryDirectory` mis-point)
  merged in from the dissolved PRG-16 tail.
- **Activate-when:** active — the matrix already *is* the agreed owner-map; no
  promotion gate remains. Formal status-flip (if wanted) is the QA-stream owner's call.

### PRG-04 · Cosmo top-down delivery layer — `embryo`
- **Outcome:** Cosmo gains its missing top-down delivery layer (Program /
  Initiative → Workstream → WP), making this hand-built roster mechanically
  harvestable (the harvest-ahead intent above, made real).
- **Owner:** Hex + Jorn
- **Embryo inputs:** `planning-reference.md` (the generalized rules, ratified
  2026-06-10) + this roster's proto-epic row schema + the IF activation dogfood
  (tracker + Workstream + direct-to-WP slice).
- **Decomposition:** Cosmo **`WI-590`** (design WI, Captured, project Nexus) —
  carries the design questions (Initiative object shape, where `Activate-when`
  lives, boundary-node export mechanics, roster harvest path) and the
  related-capability map: `WI-519` (doc/decisions-layer → ZDX standard, parked) ·
  `WI-441` (route-aware planning gate, parked) · `WI-462`/`WI-468` (zdx-hq
  dependency visualization) · `WI-532` (closed — the manual roadmap-seam
  precedent). **Referenced, not absorbed** — survey found no existing WI that
  *is* the top-down layer; each related item keeps distinct scope, dispositioned
  per-item inside WI-590's design work.
- **Activate-when:** orchestrator pull, once ≥1 full Initiative cycle has run on
  the IF pattern (dogfood evidence in hand). Earlier parallel build allowed if
  ZDX-side capacity appears. **Gate effectively MET 2026-06-11** — IF ran the
  full loop (W0–W2+W4 closed through the autonomous reviewer); PRG-12 is the
  second instance. Design input captured on `WI-590` (comment, 2026-06-11): the
  shepherd-kickoff skill + executor-protocol skill + reviewer-dispatcher
  pattern, with pointers to the five `_wip/identity-foundation/review-loop-*` /
  `executor-protocol*` artifacts. Pull remains deliberate (attention budget).

### PRG-12 · L10n & A11y Mobile — `active` (2026-06-11)
- **Outcome:** all 34 `l10n-a11y-mobile` audit findings resolved — 358+ hardcoded
  English strings routed through `t()`, screen-reader announcements + modal focus
  + role annotations wired, pluralization on the i18n-native model, date/locale
  fixed, the small mobile logic-bug batch cleared.
- **Owner:** Jorn (+ PRG-12 shepherd session; agent-heavy / low-supervision —
  the program's mechanical-sweep archetype).
- **Depends-on:** — (out-of-radius of PRG-01, parallel-safe; no boundary events
  imported).
- **Decomposition:** `_wip/l10n-a11y/execution-tracker.md` (charter + 8-WP bundle
  map + slice-time decisions). Cosmo **Workstream "L10n & A11y Mobile"** with
  **WI-621…WI-628** (8 WPs, `Stage=Backlog`, Workstream Order 1–8).
- **Activated 2026-06-11** — first parallel activation (queue entry 1); second
  dogfood of the §2.1 recipe (tracker → Workstream → direct-to-WP slice → shepherd).
  INV-1 pre-checked at slice (i18n ratchet exists, 361-entry baseline → burn-down
  scope). **Shepherd session SPAWNED 2026-06-11 (late)** — wired the reviewer
  watcher to multi-workstream on arrival.
- **Execution state:** **first WP CLOSED 2026-06-11 night — `WI-622`
  (sr-announcements)**, full claim→build→review→close loop autonomous; validates
  the multi-workstream reviewer watcher on a second lane. Live state: Cosmo +
  `_wip/l10n-a11y/execution-tracker.md`.
- **Activate-when:** — (active)

### PRG-15 · API Error Handling — `✓ graduated` (2026-06-11)
- **Outcome:** all 8 `errors-api` audit findings resolved — silent-failure catch
  blocks logged/escalated (billing/consent/webhook silent-recovery ban enforced),
  typed-error classification fixed at API boundaries (incl. the JWKS auth path),
  error classification enforced at the mobile client boundary (6 screens).
- **Owner:** Jorn (+ PRG-15 shepherd session; agent-heavy sweep, medium
  supervision on the typed-error/auth-path unit).
- **Depends-on:** ✅ satisfied — boundary event "W3 envelope-router landed"
  (`WI-581` Closed 2026-06-11); envelope contract final on `main`.
- **Decomposition:** `_wip/errors-api/execution-tracker.md` (charter + unit map +
  slice-time decisions). Cosmo **Workstream "API Error Handling"** with
  **WI-639/640/641** (2 WPs + 1 Item, `Stage=Backlog`, order 1–3).
- **Activated 2026-06-11** — third run of the §2.1 recipe, activated the same
  evening its gate fired; both charter open questions resolved/mooted by the
  gate event. **Shepherd SPAWNED 2026-06-11 (night)**, autonomous mandate;
  reviewer-watcher coverage verified on arrival.
- **Execution state:** **GRADUATED 2026-06-11 (operator ruling)** — all 3 units
  Closed/Done (`WI-639` catch-hygiene, `WI-640` typed-errors, `WI-641`
  mobile-classification), every close via the autonomous review loop; whole
  slice closed within a day of activation. The program's **second graduation**
  and fastest full cycle. Shepherd standing down after its final tracker
  checkpoint + residue statement (expected: none — slice was the full charter).
- **Activate-when:** — (graduated)

---

### PRG-13 · Background-Job Security — `active` (2026-06-11)
- **Outcome:** all 6 `security-pii-inngest` audit findings resolved — minors' PII
  out of memoized Inngest step returns and event payloads, env-binding isolation
  across concurrent runs, the cursor-skip and grade-before-claim correctness bugs.
- **Owner:** Jorn (+ PRG-13 shepherd session; agent-sweep, medium supervision on
  the PII unit).
- **Depends-on:** ✅ satisfied — G4 fired 2026-06-11 (W1-inngest-wiring + W3).
- **Decomposition:** `_wip/security-pii-inngest/execution-tracker.md` (charter +
  unit map + slice decisions). Cosmo **Workstream "Inngest Security &
  Correctness"** with **WI-665/666** (2 WPs, `Stage=Backlog`, order 1–2).
- **Activated 2026-06-11** — fourth run of the §2.1 recipe, into the lane freed by
  PRG-15's graduation. Both charter OQs resolved at activation: OQ1 subsumption
  scan vs `WI-578` = **partial** (F-028 shrunk 3 functions → 2, freeform-filing
  already fixed; F-091 fully live; scan detail in tracker §3); OQ2 = F-162 stays.
- **Execution state:** units in Backlog; shepherd kickoff prompt handed to
  operator. Live state: Cosmo + `_wip/security-pii-inngest/execution-tracker.md`.
- **Activate-when:** — (active)

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
>
> **Activation planning ratified (2026-06-10).** `activation-planning.md` holds
> the ratified per-Initiative charters (PRG-10–15, with size/supervision profiles
> and per-charter open questions) and the PRG-16 dissolution analysis. The
> ratified gates are in the `Activate-when` column below; the program-wide
> ordering lives in **§ Activation queue**.

### Substantial clusters

| ID | Initiative (clear-out) | Findings (bucket 3) | Blast-radius vs PRG-01 (N.1 signal; O is authority) | Activate-when (ratified 2026-06-10) |
|---|---|---|---|---|
| PRG-10 | security-pii-api | 27 | **mixed** — IF-slice in-radius (W2/W3); clear-out remainder = non-IF code | **BOTH gates FIRED** — safe subset at G2 (06-11); auth/PII remainder at **G4 (06-11 late)** — full activation decision LIVE, ordered behind attention budget |
| PRG-11 | architecture | 24 (+3 merged: F-169/170/171) | **partly in-radius** (god-modules/pkg-boundaries; some lands W1) | **moot scan DONE 2026-06-11**: 3 moot (F-029/F-010/F-153) · 23 live · 1 partial (F-103) · INV-2 live (~153 sites) — **scope ≈ intact**, all 7 flagged candidates LIVE (`supporting-artefacts/prg-11-moot-scan.md`). Activation = human-led decomposition, ordered behind attention budget |
| PRG-12 | l10n-a11y-mobile | 33 | **mostly outside** → parallel-safe | **ACTIVATED 2026-06-11** — promoted to Active row above (tracker + Workstream + WI-621…628 sliced) |
| PRG-13 | security-pii-inngest | 6 | **mixed** — IF-slice in-radius (W3); remainder non-IF | **ACTIVATED 2026-06-11** — promoted to Active row above (tracker + Workstream + WI-665/666 sliced; OQ1 subsumption scan done: partial — F-028 3→2 legs) |
| PRG-14 | agent-instructions | 10 (+3 merged: F-116 + the F-151/F-157 CI/Platform fold) | partial **inside** (overlaps PRG-03) | light thread (skill-description/sync fixes) **now**; skill-building after PRG-03 B4 (AGENTS/CLAUDE converge) |
| PRG-15 | errors-api | 8 | likely **outside** → parallel-safe | **ACTIVATED 2026-06-11** — promoted to Active row above (tracker + Workstream + WI-639/640/641 sliced) |

### PRG-16 · Singleton tail — `DISSOLVED 2026-06-10`
The ~15 one-finding labels are normalized per `activation-planning.md` §1
(ratified): **1 DROP** (F-035 — remediated + key rotated; closed everywhere) ·
**7 MERGE** (F-036 → PRG-03 · F-116 + F-151 + F-157 → PRG-14, the CI/Platform
pair folded as a **named subset** per orchestrator ruling 2026-06-10 ·
F-169/170/171 → PRG-11) · **7 PARK** (F-002/F-006 performance — no urgency
gate, merge if both activate · F-155/F-159 test-infra minor · F-149 content —
needs content-team input · F-173 billing — after IF W4 · F-176 nav — revisit at
PRG-11 activation). Per-finding home stays `L-gap-delta.md`; parked findings
get **no roster row** by design (high bar for new rows — planning-reference
§3.2) and re-enter via the intake routing rule if their trigger fires.

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
- **Activate-when:** IF boundary "clean-cut tail done" (post-execution), OR a
  first pull-forward cluster is named earlier — whichever first (queue entry 10).

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
  behind PRG-01 until then; parallel-safe if product pulls it early (queue entry 11).

---

## Intake (routing per planning-reference §4)

New work routes by class to an existing row — the current routing rule lives in
the planning-reference **Appendix**. Additions change row *contents*, never
program *structure*. What fits nothing lands here and is triaged at the next
umbrella touch:

**Unrouted intake:** — (empty)

## Activation queue — the full forward view (ratified 2026-06-10)

Gate-ordered, not date-ordered (planning-reference §6). **Every** Initiative
appears with its gate — including the "much later" ones. Readiness analysis
behind entries 1/2/5–8: `activation-planning.md` §4.

| # | Initiative | Gate (activate / proceed when) |
|---|---|---|
| 1 | **PRG-12** l10n-a11y-mobile | ✅ **ACTIVATED 2026-06-11** (was: pipeline-proven — first parallel activation) |
| 2 | **PRG-14** agent-instructions (+CI/Platform fold) | light thread (skill-description + sync fixes) **now**; skill-building after PRG-03 B4 |
| 3 | **PRG-02** tail — quick-land batch | HH PR merged / `WI-530` closes; then batch the parked residue (`WI-538`/`543`/`561`/`457`–`460`/`534`…) |
| 4 | **PRG-03** `WI-587` ruling session | anytime — ~20-min operator session (10 KEEPs + 1 CONFLICT incl. PRD FR119-vs-FR124) |
| 5 | **PRG-15** errors-api | ✓ **GRADUATED 06-11** — activation → graduation within a day (all 3 units closed via the autonomous loop) |
| 6 | **PRG-13** security-pii-inngest | ✅ **ACTIVATED 06-11** — into the lane PRG-15's graduation freed (WI-665/666; subsumption scan: partial) |
| 7 | **PRG-10** security-pii-api | ✅ **both gates FIRED** (safe subset G2; auth/PII remainder G4 06-11 late) — activation = attention-budget call |
| 8 | **PRG-11** architecture | IF "W1 landed" ✅ + moot scan ✅ **done 06-11** (scope ≈ intact: 3 moot / 23 live / 1 partial) — gate fully cleared; activation is now an attention-budget call (human-led decomposition) |
| 9 | **PRG-04** Cosmo top-down delivery layer | orchestrator pull on dogfood evidence (≥1 full Initiative cycle on the IF pattern) |
| 10 | **PRG-20** Stream 2 — estate-canon drain | IF "clean-cut tail done", OR first pull-forward cluster named earlier |
| 11 | **PRG-21** learning-canon design | product trigger (hardened-B): learning-domain feature work begins OR glossary scheduled for deletion |

Attention budget is evaluated per activation window when a gate clears — it is
never an edge (planning-reference §5.3/§6.3).

## The rules of the game → `planning-reference.md`

**All planning rules are canonical in
[`planning-reference.md`](planning-reference.md)** (extracted 2026-06-10):
hierarchy + vocabulary (rows are **Initiatives**; "workstream"/"stream" banned at
this altitude — §1), the per-Initiative delivery pattern (§2), the
reconcile-and-route method + intake routing rule (§3–4), the dependency model
(granularity-by-altitude, boundary nodes, no resource edges — §5), activation
gates + queue semantics (§6), and the cross-cutting operating principles (§7).
This roster holds **state only**: the rows below and the activation queue.
Program-specific bindings (current routing rule, boundary-node exports) live in
the reference's Appendix.

Post-P operating posture (per reference §6.4): **two concurrent activities** —
IF execution (PRG-01) + activation planning over all other Initiatives; planned
Initiatives start executing in parallel as their §6.3 gates clear. Session
model per reference §2.5–2.7: program session · per-Initiative shepherd ·
executors.

**Generated view:** [`dashboard.html`](dashboard.html) — the "Flight Deck"
(board / gate-rail / field-guide over initiatives × bundles × gates, for
Jorn + Zuzka). A view, **never a home**: regenerated at umbrella touches; on
any disagreement this roster and Cosmo win.

## Cross-program gates (the edges that matter)

```
PRG-02 Harness Hygiene  ──(WI-530 → WI-533)──▶  SATISFIED + CLOSED 2026-06-11 (PRG-02 graduated)
PRG-03 operational-memory cleanup  ──(sequenced inside)──▶  PRG-02 (WI-531 → WI-387, both delivered; WI-587 residue ungated)
PRG-01 IF exported boundary nodes (planning-reference Appendix):
  "W1 landed"                ──▶  PRG-11 · PRG-13(part)
  "W2/W3 landed"             ──▶  PRG-10 in-radius remainder · PRG-15 (envelope-router half)
  "clean-cut tail done"      ──▶  PRG-20 bulk
PRG-12 · PRG-14-light · PRG-10 out-of-radius subset  ──▶  parallel-safe (queue gates only — never edges)
```

---

## Change log
- **2026-06-11 (late) — PRG-13 ACTIVATED into the freed lane.** Fourth run of the
  §2.1 recipe on operator go ("prep PRG-13"). Charter OQ1 subsumption scan run
  pre-slice against `WI-578`/PR #933 + live code: **partial** — F-028 shrunk
  3 functions → 2 (`freeform-filing` already fixed with the step-closure pattern;
  `auto-file-session` + `topic-probe-extract` still memoize), F-091 fully live;
  OQ2 ruled F-162 stays. Cosmo **Workstream "Inngest Security & Correctness"** +
  **WI-665** (pii-step-state, P1) / **WI-666** (config-correctness, P2); tracker
  `_wip/security-pii-inngest/execution-tracker.md`; program monitor widened to
  4 workstreams. Shepherd kickoff prompt handed to operator.
- **2026-06-11 (late) — PRG-15 GRADUATED (second graduation, fastest cycle).**
  Operator ruling on program-session recommendation: all 3 units closed via the
  autonomous review loop within a day of activation; slice = full charter, no
  planned residue. Shepherd standing down after final checkpoint + residue
  statement. Same window: **cross-stream CI incident resolved** — PRG-12
  shepherd's "mis-scoped PR #931 broke main" theory disproven at CI step level
  (the PR is a clean comment sweep; the mobile-test red was a one-off flake,
  rerun green; the integration red a transient LLM upstream, rerun green;
  WI-626's closure stands). The one real item — chronic staging-deploy red,
  missing `IDEMPOTENCY_KV` binding in `[env.staging]` — captured as **WI-664**
  (Bug, P1; needs Cloudflare-credentialed actor; until fixed, staging E2E
  validates stale builds). PRG-12 meanwhile at **4/8 closed**
  (`WI-621`/`622`/`626`/`627`), `WI-623` + `WI-625` executing.
- **2026-06-11 (late) — IF cutover gap: split RULED, planning session
  commissioned.** The WI-586 executor plan-stop finding (app cutover hidden in
  the "drop" scope; ~80 runtime files, both payment webhooks, 22 Inngest
  functions, consent-request gap, 57 FKs, ~190 test files) ruled by operator:
  **SPLIT** into CUT-A (additive model completion) → CUT-B (domain-wise reader
  cutover under the single-live-store invariant) → shrunk WI-586 (atomic
  convergence: freeze → reseed → verify → flip → drop → full legacy
  retirement). Design routed to a **dedicated planning session** (brief:
  `_wip/identity-foundation/cutover-planning-brief.md`, hardened by
  adversarial review; seed: `wi586-scope-report.md`, the executor report
  landed durably by the IF shepherd). WI-586 PAUSED; shepherd holding;
  ratification + Cosmo re-slice happen at program level when the plan doc
  lands. Lesson memorialized: `feedback_plan_cutover_ownership.md`
  (switch-flip check at every plan ratification).
- **2026-06-11 (late night) — G4 FIRED: the IF rewrite proper is BUILT.**
  `WI-578` (pii-step-state) Closed → W3 6/6 → **every wave W0–W4 fully
  Closed** (36 units start-to-finish in ~2 days). Consequences: **PRG-10
  auth/PII remainder gate fired** (both PRG-10 gates now open) · **PRG-13
  gate fired** (W1-wiring + W3 both landed; F-028/F-091 subsumption scan due
  at its activation) · clean-cut tail (`WI-585`→`586`, Ready) fully ungated —
  the remaining IF work is the point-of-no-return data migration, an
  operator/shepherd seam. Next umbrella gate: **G5** (tail done) → PRG-20
  bulk. Activation of PRG-10/PRG-13 held behind attention budget (three
  lanes already live). Also this hour: PRG-12 first WP closed (`WI-622`).
- **2026-06-11 (night, +1h) — PRG-15 ACTIVATED on operator go.** Third run of
  the §2.1 recipe: tracker `_wip/errors-api/execution-tracker.md`, Cosmo
  Workstream **API Error Handling**, units **WI-639** (catch-hygiene, P1),
  **WI-640** (typed-errors, P2), **WI-641** (mobile-classification Item, P2).
  Both charter open questions resolved/mooted by the gate event (envelope
  contract final). Now three parallel lanes: PRG-01 (W3 tail), PRG-12, PRG-15.
  Shepherd kickoff prompt handed to operator.
- **2026-06-11 (night) — PRG-15 gate FIRED: envelope-router landed.** `WI-581`
  Closed by the autonomous reviewer → boundary event "W3 envelope-router
  landed" fired; PRG-15 (errors-api) activation decision is LIVE, held behind
  attention budget (PRG-12 shepherd just spawned and wired the review loop;
  WI-621/622 Ready). W3 now 5/6 — **G4 hangs on `WI-578` alone** (Executing);
  tail `WI-585`/`586` pre-staged Ready.
- **2026-06-11 (late evening) — PRG-11 moot scan DONE: hypothesis disproven.**
  Verdict over 28 scanned (+2 excluded-deferred F-008/F-100): **3 MOOT**
  (F-029 consent-cycle — delivered by WI-572/576; F-010 billing facade;
  F-153) · **23 LIVE** · **1 PARTIAL** (F-103 Challenge-Round mastery — new
  `persistence.ts` exists but `session-exchange.ts` still holds a private
  copy) · INV-2 LIVE (~153 jest.mock sites). All 7 charter-flagged moot
  candidates (F-011/031/106/107/108/109/112) are LIVE — the rewrite did not
  subsume them. PRG-11 scope stands ≈ intact; its gate chain is now fully
  cleared, activation is an attention-budget + human-led-decomposition call.
  Report: `supporting-artefacts/prg-11-moot-scan.md`.
- **2026-06-11 (evening) — PRG-12 ACTIVATED + PRG-11 moot scan launched.**
  First parallel activation, on operator go. PRG-12: tracker
  `_wip/l10n-a11y/execution-tracker.md` (commit `9570f5b63`), Cosmo Workstream
  **L10n & A11y Mobile**, 8 WPs sliced as **WI-621…WI-628** (Backlog, order
  1–8; 34 findings absorbed exactly once — F-163 excluded as delivered by
  WI-584, F-026 included, F-123/F-172 ruled to stay). INV-1 pre-check: the
  jsx-literals ratchet exists (361-entry baseline) → scope reframed to
  burn-down. Shepherd kickoff prompt handed to operator. PRG-11: read-only
  moot-by-refactor scan agent launched against the full landed IF file-touch
  set (15 merged PRs, W0–W2 + early W3/W4); report →
  `supporting-artefacts/prg-11-moot-scan.md`. Also: IF W2 + W4 fully closed,
  W3 at 3/6 (`WI-579`/`580`/`582`) — G4 now hangs on W3's 3 remaining units.
- **2026-06-11 (afternoon) — PRG-02 GRADUATED.** WI-530-related items closed
  through review; HH critical path complete; outcome met (harness proven by
  IF W0–W2 live execution). Residue (~12–15 WIs) triaged in a separate operator
  session (branched) — quick-land / return-to-ZDX / park / kill; queue entry 3
  scope set by that triage. Routing-rule binding re-pointed in the
  planning-reference Appendix. First graduation of the program.
- **2026-06-11 (midday) — G2 + G3 FIRED; standing Cosmo watch armed.** Operator
  closed the entire W0+W1 set (8 items Closed/Done) and more: W2 `WI-574`
  Closed, `WI-575`/`576` Executing; W4 `WI-583` Executing, `WI-584` Closed.
  Consequences: **PRG-12 first-activation decision LIVE** · **PRG-10 safe
  subset gate met** · **PRG-11 moot-by-refactor scan unlocked**. PRG-13 still
  waits on W3. Ops: stale NOTION_TOKEN root-caused (legacy infisical call;
  fixed via `estate-secrets refresh` + host.env) — the old G2 watch had gone
  blind and was replaced by a standing IF-workstream stage-diff watch with a
  degraded-watch alarm. HH closing ladder in progress on nexus side
  (operator-reported; deliberately not monitored).
- **2026-06-11 — G1 FIRED (HH PR #832 merged 09:27Z).** PRG-02 → formal
  close-out only; **residue quick-land batch unlocked** (queue entry 3 live).
  IF spine PR #860 also merged → **W1 fully merged**, 4-item review stack
  (569/570/571/572) all at Reviewing — G2 hangs solely on operator
  `/cosmo:review` closes. WI-587 edit-sequencing hold lifted. Dashboard
  regenerated. Gate-event watches armed this morning caught both merges
  (PR watch retired; Cosmo-closes watch for G2 still live).
- **2026-06-11 — Umbrella touch: IF execution underway.** W0 fully done
  (549/550/551 closed; baseline 569 merged@Reviewing). W1 half-landed (570 + 572
  merged@Reviewing, 571 PR held, 573 Ready); W2 pre-bridged. WI-530 gate
  operator-waived for execution start (HH PR #832 still open). PRG-01 rows
  updated; dashboard regenerated. **G2 now waits only on operator
  `/cosmo:review` closes of the 569/570/572 stack.**
- **2026-06-10 — Session model + Flight Deck registered.** Planning-reference
  bumped to v1.1 (§2.5–2.7: program session / per-Initiative shepherd /
  executor altitudes; disposable-shepherd invariant; model tiering). IF W1
  shepherd is the first instance. `dashboard.html` (Flight Deck) added as a
  generated view — view-never-home, regenerated at umbrella touches.
- **2026-06-10 — Full-forward-view amendment pass (ratified).** (1) **Activation
  queue** added as a roster section (its home per the planning-reference document
  map) — 11 gate-ordered entries covering *every* Initiative incl. the late ones.
  (2) **Intake section** added (routing rule binding lives in the reference
  Appendix; unrouted-intake line seeded empty). (3) **PRG-16 DISSOLVED** per
  ratified `activation-planning.md` §1 — 1 DROP / 7 MERGE / 7 PARK; the
  F-151+F-157 CI/Platform pair **folded into PRG-14 as a named subset**
  (orchestrator ruling). (4) **PRG-02 flipped to `tail`** — gate close-out +
  ~10-item parked-residue quick-land batch documented. (5) **PRG-03 registers
  `WI-587`** (19 residual memory-triage dispositions) + adopts
  `supporting-artefacts/memory-cleanup.md` as its evidence artifact (de-rogued);
  F-036 merged in. (6) **PRG-04 created** (Cosmo top-down delivery layer,
  embryo) — design WI **`WI-590`** captured in Cosmo (project Nexus) linking
  WI-519/441/462/468 + precedent WI-532; survey confirmed no existing WI *is*
  the top-down layer, so related items are referenced, not absorbed. (7)
  PRG-10–15 `Activate-when` flipped from "Phase O orders" to the **ratified
  gates**; cross-program gates block now lists the IF exported boundary nodes.
  Roster status EMBRYO → ACTIVE.
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
