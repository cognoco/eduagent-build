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

### PRG-01 · Identity Foundation runway — `graduated` (2026-06-15)
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
- **GRADUATED 2026-06-15 — foundation build complete; cutover completion handed to PRG-06.**
  Per the code-half organization ruling (B), the cutover *completion* (WI-586 + its 2
  sub-items) emigrated to **PRG-06 (Identity Cutover)**; PRG-01 graduated on its residual
  **foundation-build** scope. WS-9 open-WI audit clean (**52/52 Closed**) → Cosmo Workstream
  `Status=Closed`. Note: the original "delete legacy" outcome is now delivered by **PRG-06**,
  not here. Tracker `_wip/identity-foundation/execution-tracker.md` is the IF build's
  historical record.
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
- **WI-587 — RULED + EXECUTED (2026-06-11), now `Stage=Reviewing`:** the 19
  residual `WI-387` memory-triage dispositions (10 user-KEEPs · 8
  product/user/mixed REVISEs · 1 CONFLICT — `feedback_never_lock_topics` vs the
  PRD FR119-vs-FR124 self-contradiction). **All 19 ruled by PM 2026-06-11** and
  executed the same day; **landed on `main` in commit `7cc8a9a8d`** ("docs(memory):
  apply PM-ruled dispositions", 22 files): PRD § Prerequisite Relationship Types
  rewritten (REQUIRED = strong advisory, never a hard lock — conflict resolved
  Option A "never lock", code-confirmed no locking logic exists), the 8 REVISE
  corrections applied, the 10 KEEP memories re-confirmed `2026-06-11`. **Verified
  landed 2026-06-13** (program session — all 18 + the conflict checked file-by-file).
  Evidence base: `supporting-artefacts/wi-587-ruling-sheet.md` (all 19 cells filled,
  status RULED) + `memory-cleanup.md` (full 55-memory triage). The "~20-min operator
  ruling session" framing is now **spent** — only the **review-close** remains
  (manual `/cosmo:review`; standalone item — PRG-03 has no shepherded loop).
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
  second instance. **Scope narrowed 2026-06-13 → top-down layer only**: the
  loop/execution-mechanism productionization (shepherd-kickoff + executor-protocol
  + reviewer-dispatcher + runtime-agnosticity) split out to **PRG-05**. PRG-04 +
  PRG-05 are designed together via one combined design/grill, seeded by
  `supporting-artefacts/mechanism-productionization-design-input.md`, gated behind
  the agnosticity spike (**spike → grill → slice**). `WI-590` is double-loaded; its
  loop-productization input re-homes to PRG-05 at slice time. Pull remains
  deliberate (attention budget).

### PRG-05 · Execution-mechanism productionization (the orchestration loop) — `active` (design phase)
- **Outcome:** the hand-built program-delivery mechanism — shepherd-kickoff,
  executor-protocol/pointer-brief, the autonomous reviewer-dispatcher loop, and the
  cross-runtime seam contracts — promoted from per-instance `_wip/` artifacts to a
  parameterized, runtime-agnostic tooling layer. **Half B** of the mechanism
  productionization (Half A = PRG-04, the top-down layer).
- **Owner:** Hex + Jorn
- **Embryo inputs:** the loop dogfood corpus in `_wip/identity-foundation/`
  (`review-loop-{mechanics,observations,reviewer-observations,productization-handoff}.md`
  + `executor-protocol{,-example}.md` + `new-llm-review-watcher-kickoff-prompt.md` +
  the live `review-watcher-v3.ts`) + `planning-reference.md` §2.5–2.7 +
  `supporting-artefacts/mechanism-productionization-design-input.md` (consolidated
  design seed + locked decisions, 2026-06-13).
- **Decomposition:** Cosmo **`WI-590`** is currently double-loaded (top-down + loop
  input); the loop-productization half re-homes here at slice time. Skill-level
  enhancements to ZDX (`zdx-core`/`cosmo`) — children-sweep into `complete`, a
  published close-evidence contract, structured review-result + override policy —
  are bug/enhancement WIs against those skills, captured at slice, **not** new
  top-down structure.
- **Agnosticity scope (locked 2026-06-13):** runtime-swap unit = the **role**; three
  swappable role-units (orchestrator · shepherd-with-its-executors · reviewer);
  agnostic contracts only at orchestrator↔shepherd + shepherd↔reviewer;
  shepherd↔executor is **native-by-design** (never cross-runtime); reviewer ≠
  executor runtime is a quality invariant.
- **Status (2026-06-13): DESIGN-PHASE ACTIVE.** The **agnosticity spike** is the
  first work (Claude shepherd choosing Claude/Codex-model executors via
  `codex-companion`; Claude executor → Codex nested adversarial reviewer), feeding
  the combined design/grill with PRG-04 (seam-catalogue spine). This is a *design*
  activation — decisions + spike + grill — **not** the §2.1 execution recipe: no
  Cosmo Workstream/slice until the grill closes (sequence **spike → grill → slice**).
  Spike status tracked in the design-input doc. *(The pre-slice design phase is
  itself dogfood for PRG-04 — §2.1 has no design-activation altitude.)*
- **Activate-when:** — (design-active 2026-06-13; execution activation = post-grill slice).

### PRG-06 · Identity Cutover — `active` — EXECUTING (gate cleared 2026-06-15)
- **Outcome:** app reads/writes the new identity model end-to-end **per canon** (S0–S6
  reconciled, not inherited); `IDENTITY_V2_ENABLED` removed; full unit + 51 integration
  suites green; corrected staging→prod cutover re-run; **WI-586 closed**.
- **Why:** WI-586 always assumed a code half delivered by the parallel **S0–S6
  mentor-is-the-app** track; the staging cutover proved S0–S3 was **not aligned to canon /
  the to-be data model** (post-drop reads 500). There was no 586 code half — this is it.
- **Owner:** Jorn (+ PRG-06 shepherd session, operator-launched; separate reviewer closes).
- **Canon authority:** **canon wins; S0–S6 design choices NOT canonical.** Reconcile *to*
  canon, do not inherit S0–S6.
- **Decomposition:** `_wip/identity-cutover/execution-tracker.md` (charter / canon authority /
  slice / launch gate) + parked `shepherd-kickoff.md`. Cosmo **Workstream "Identity Cutover"**
  (WS-18, `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`) with **WP-1 = WI-765** (enumerate the breaking
  reader/writer set, `Stage=Backlog`, order 1) + **WI-586** (moved in, with its 2 sub-items).
- **Launch gate CLEARED 2026-06-15:** operator confirmed ADR-0022 cleanup complete + ADR-0020/0021
  substantially correct (semantic-only remaining) → ADR-0020/0021/0022 trusted canon. Shepherd
  released via inbox `directive` (refining WP-1 = WI-765 + dispatching the enumeration); reviewer =
  existing watcher session extended to cover WS-18 (running; out-of-band of the orchestrator channel).
- **Activate-when:** — (active; execution gated on the launch gate above)

### PRG-10 · API Security & PII — `active` (2026-06-13)
- **Outcome:** all 27 `security-pii-api` clear-out findings (2026-05-29 full audit)
  remediated — CI/GHA permission + gate hardening, API input-validation + resource
  bounds, one JWKS DoS + three race/atomicity fixes, quota/billing correctness,
  logging/config hygiene, one LLM prompt-injection fence, mobile markdown safety. Scope
  is the **non-IF** API surface (`Defer-to-workstream=security-pii-api`), distinct from
  the in-IF security findings IF's W2/W3 owned.
- **Owner:** Jorn (+ PRG-10 shepherd session; medium supervision — agent-heavy on the
  hygiene/input-validation sweeps, human review on auth/CI-permission + concurrency).
- **Depends-on:** — both gates fired (G2 safe-subset + G4 auth/PII remainder, 06-11).
  **Parallel-safe with the live IF cutover** — slice scan proved 27/27 CLEAN (zero
  CUT-B1/2/3 overlap); no sequencing edge.
- **Decomposition:** `_wip/security-pii-api/execution-tracker.md` (charter + unit map +
  slice scan). Cosmo **Workstream "API Security & PII"**
  (`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`) with **WI-698…704** (5 WPs + 2 Items,
  `Stage=Backlog`, order 1–7; no `Blocked-by` edges — all parallel-safe).
- **Activated 2026-06-13** — sixth run of the §2.1 recipe; first parallel activation
  *after* the IF cutover went live. Slice scan (sub-agent): **27/27 LIVE** (none subsumed
  by IF), **27/27 CLEAN** (no cutover overlap); OQ1 ruled CI/GHA findings stay in PRG-10
  (WI-698), OQ2 file-touch audit done at activation. **First shepherd shut down pre-execution
  2026-06-13** (its bespoke kickoff was non-standard) → realigned to the **standard machinery**
  (`shepherd-protocol.md` + `executor-protocol.md` + lane tracker + a thin kickoff); clean
  kickoff ready, fresh spawn pending. Shepherd = separate Opus 4.8 / medium-effort session;
  Sonnet executors (Opus plan-phase on WI-699 + the F-132/F-119 pieces of WI-698). The review
  loop is owned by a **separate reviewer (Codex) session** — shepherd self-monitors Cosmo for
  verdicts, does not own the watcher.
- **Activate-when:** — (active)

### PRG-11 · Architecture Clean-Out — `active` (2026-06-13)
- **Outcome:** all ~24 LIVE code-structural + correctness findings (2026-05-29 full
  audit, `Defer-to-workstream=architecture`) remediated — circular deps, god-modules,
  domain-org, architecture-class test-coverage gaps, mobile-nav copy-paste, data-access
  seams, three correctness races (F-169/170/171), `architecture.md` doc-rot. Moot scan
  (2026-06-11): 3 mooted (F-029/F-010/F-153) · 1 partial (F-103) · 23 LIVE + INV-2.
- **Owner:** Jorn (+ PRG-11 shepherd session; **human-led** supervision — the one lane
  where god-module / circular-dep / seam-extraction decomposition boundaries need
  operator sign-off; agents execute within approved decomposition plans).
- **Depends-on:** gate G3 (IF W1 landed) ✅ + moot scan ✅. **Not uniformly
  parallel-safe** — the cutover-coordination scan (2026-06-13, sub-agent) split the
  findings vs the LIVE IF cutover: **16 parallel-safe / 9 serialize** (behind the
  in-flight CUT-B2/B3 + the WI-586 tail) **/ 0 moot-risk**.
- **Decomposition:** `_wip/architecture/execution-tracker.md` (charter + 3-tier unit map
  + scan). Cosmo **Workstream "Architecture Clean-Out"**
  (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`). **Three tiers:** Tier 1 (autonomous-now, in
  Cosmo) = **WI-717…720** (`Stage=Backlog`, order 1–4: races · tests · GC1 guard · GC6
  sweep); Tier 2 (parallel-safe but human-gated, 8 findings) + Tier 3 (cutover-serialized,
  9 findings) are recorded in the tracker, **not** in Cosmo — sliced at the operator
  decomposition gate (Tier 2 any time; Tier 3 post-flip + re-scan).
- **Activated 2026-06-13** — seventh run of the §2.1 recipe; first **tiered** activation.
  Only the autonomous tier was sliced into Cosmo so an unsupervised shepherd cannot hit a
  decomposition decision or a cutover collision. Shepherd = separate session (running);
  Sonnet executors (Opus plan-phase on WI-717 concurrency); separate Codex reviewer owns
  the loop.
- **Activate-when:** — (active)

### PRG-12 · L10n & A11y Mobile — `✓ graduated` (2026-06-12)
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
- **Execution state:** **GRADUATED 2026-06-12 (operator ruling)** — all 8 WPs
  (`WI-621…628`) Closed/Done through the autonomous review loop in ~1.5 days,
  including two reviewer bounces correctly adjudicated (WI-623 reworked;
  WI-626's bounce disproven by CI rerun). The program's **third graduation**
  and largest slice. Verified at graduation: INV-1 ratchet baseline burned
  **361 → 12** (remaining = legitimate non-translatable entries); F-163 was
  never residue (delivered + Closed via `WI-584`/PR #874, label overlap only).
  Shepherd standing down after final checkpoint + residue statement.
- **Activate-when:** — (graduated)

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

### PRG-13 · Background-Job Security — `✓ graduated` (2026-06-12)
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
- **Execution state:** **GRADUATED 2026-06-12 (operator ruling)** — both WPs
  (`WI-665` pii-step-state, `WI-666` config-correctness) Closed/Done via the
  autonomous review loop; activation → slice-complete in under a day (fastest
  lane yet). All 6 findings remediated; no exclusions or residue (the only
  slice-time scope change was the F-028 shrink, a documented reduction). The
  program's **fourth graduation**. Shepherd standing down after final
  checkpoint + residue statement.
- **Activate-when:** — (graduated)

---

### PRG-17 · new-llm Integration (LLM) — `✓ graduated` (2026-06-13)
- **Outcome:** the `origin/new-llm` branch (Zuzka's lane: V2-shell S0 "Now feed" +
  ~25-module audit-fix batch, FINAL feature SHA `6a81f7663`, all live-on-merge)
  reconciled and merged to `main` BEFORE IF cutover execution — strategy **O2**
  ruled by operator 2026-06-12 (analysis v1.4 @ `450e4c522`, four adversarial
  passes; strategy core survived 4-for-4). **OUTCOME MET** — merged `105b39ac0`
  (`--no-ff`, full ancestor, `Merge completeness check` + all gates green),
  post-merge deploy green, cutover unlocked.
- **Owner:** Jorn (+ LLM shepherd session; program session orchestrates — Zuzka's
  lane halted, reconciliation runs through this pipeline; Zuzka gets the exec
  summary + a courtesy review slot on the merge PR).
- **Depends-on:** — (parallel-safe vs everything active; it *gates* IF cutover
  execution: CUT-A generates against the post-merge journal).
- **Decomposition:** `_wip/new-llm-integration/execution-tracker.md` (charter +
  unit map + merge gate). Cosmo **Workstream "new-llm Integration &
  Reconciliation"** (`37d8bce9-1f7c-8145-80ef-cec4b55dcba4`) with
  **WI-675…682** (8 Items, order 1–8 — altitude corrected WP→Item 2026-06-12
  per the childless-WP inversion ruling; refine-writer fix captured as
  `WI-683` (refuse-with-remedy: split or demote at Ready promotion)): deploy-gate fix
  (High) · ledger RLS (High) · baselines · ADR/V2-replan · export+OTA ·
  merge-check · behavior inventory · provisioning (= WI-664 fix landing).
- **Activated 2026-06-12** — fifth run of the §2.1 recipe, out-of-band of the
  ratified queue (strategy ruling created the lane). Item 8 of the checklist
  (account-detachment canon intake) routed to the IF ratification path via the
  planner hand-off, not this workstream.
- **Merge gate (program-session-owned):** all units closed → §8 final rescan of
  the reconciled SHA + main-drift delta (incl. Inngest cross-file semantic
  check) → operator approval vs the WI-681 inventory → merge with WI-680
  verification on the merge PR → boundary event "new-llm merged" unlocks IF
  cutover execution.
- **Execution state:** **GRADUATED 2026-06-13 (operator ruling)** — the program's
  **fifth graduation**, and its first *integration* (vs clear-out) lane. All
  reconciliation units `WI-675…682` + the RLS residue `WI-687` Closed/Done and
  merged; the §8 final rescan returned **GO** (zero blockers, the Inngest-drift
  surface proved vacuous, two MEDIUMs were inventory-accuracy not code); merge
  `105b39ac0` verified clean; post-merge `Deploy` green end-to-end → `WI-664`
  (chronic staging-KV outage) Closed; `WI-694` (verifier hotfix, main-side,
  detached) Closed; `Merge completeness check` now a required check on `main`.
  **Deferred follow-ups tracked in the spillover register, not residue:** `WI-695`
  (3 GC6 mocks), `WI-696` (type `app/session.completed` end-to-end), plus
  `WI-683`/`684`/`688`. The new-llm shepherd stood down after final checkpoint;
  its dedicated review-watcher stopped. **Key learnings deposited:** childless-WP
  altitude inversion (`WI-683`), standalone-item review-loop gap + the spillover
  mop-up mechanism, "verified then red-teamed" review bar.
- **Activate-when:** — (graduated)
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
| PRG-10 | security-pii-api | 27 | **mixed** — IF-slice in-radius (W2/W3); clear-out remainder = non-IF code | **ACTIVATED 2026-06-13** — promoted to Active row above (tracker + Workstream "API Security & PII" + WI-698…704 sliced; slice scan: 27/27 LIVE, 27/27 CLEAN vs the live cutover) |
| PRG-11 | architecture | 24 (+3 merged: F-169/170/171) | **partly in-radius** (god-modules/pkg-boundaries; some lands W1) | **ACTIVATED 2026-06-13** — promoted to Active row above (tracker + Workstream "Architecture Clean-Out" + Tier-1 autonomous slice WI-717…720). Cutover-coordination scan: 16 parallel-safe / 9 serialize / 0 moot-risk; Tiers 2/3 (human-gated + cutover-serialized) operator-gated, not yet in Cosmo |
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
| 1 | **PRG-12** l10n-a11y-mobile | ✓ **GRADUATED 06-12** — 8/8 WPs closed in ~1.5 days; ratchet baseline 361 → 12 |
| 2 | **PRG-14** agent-instructions (+CI/Platform fold) | light thread (skill-description + sync fixes) **now**; skill-building after PRG-03 B4 |
| 3 | **PRG-02** tail — quick-land batch | HH PR merged / `WI-530` closes; then batch the parked residue (`WI-538`/`543`/`561`/`457`–`460`/`534`…) |
| 4 | **PRG-03** `WI-587` memory dispositions | ✓ **RULED + EXECUTED 06-11** — all 19 landed on `main` (`7cc8a9a8d`); WI-587 now **Reviewing**; only a manual `/cosmo:review` close remains (verified landed 06-13) |
| 5 | **PRG-15** errors-api | ✓ **GRADUATED 06-11** — activation → graduation within a day (all 3 units closed via the autonomous loop) |
| 6 | **PRG-13** security-pii-inngest | ✓ **GRADUATED 06-12** — both WPs closed in under a day; all 6 findings remediated |
| 7 | **PRG-10** security-pii-api | ✓ **ACTIVATED 06-13** — 27 findings sliced into WI-698…704 (5 WP + 2 Item); slice scan 27/27 LIVE + 27/27 CLEAN (parallel-safe with the IF cutover); shepherd **SPAWNED 06-13** (Opus/medium + Sonnet executors) |
| 8 | **PRG-11** architecture | ✓ **ACTIVATED 06-13** — Tier-1 autonomous slice WI-717…720 (races/tests/GC1-guard/GC6-sweep); cutover scan 16 parallel-safe / 9 serialize / 0 moot-risk; Tiers 2/3 operator-gated |
| 9 | **PRG-04** top-down delivery layer + **PRG-05** execution-mechanism productionization | **PRG-05 design-ACTIVATED 06-13** (agnosticity spike = first work); PRG-04 design opens at the joint grill. Sequence spike → grill → slice; no Cosmo until post-grill |
| 10 | **PRG-20** Stream 2 — estate-canon drain | IF "clean-cut tail done", OR first pull-forward cluster named earlier |
| 11 | **PRG-21** learning-canon design | product trigger (hardened-B): learning-domain feature work begins OR glossary scheduled for deletion |
| 12 | **PRG-17** new-llm integration (LLM) | ✓ **GRADUATED 06-13** — fifth graduation (first integration lane); merged `105b39ac0`, deploy green, cutover unlocked |
| 13 | **PRG-06** Identity Cutover | ✓ **STOOD UP 06-15** — workstream + WP-1 + WI-586 moved in; shepherd launch **gated on ADR-0020/0021/0022 cleanup** (operator-confirmed) → then WP-1 enumeration → code-half WPs → terminal staging/prod cutover → close WI-586 |

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
PRG-17 new-llm Integration  ──("new-llm merged" boundary event)──▶  PRG-01 IF cutover EXECUTION start (CUT-A generates on post-merge journal; cutover *planning* runs in parallel, unblocked)
PRG-02 Harness Hygiene  ──(WI-530 → WI-533)──▶  SATISFIED + CLOSED 2026-06-11 (PRG-02 graduated)
PRG-03 operational-memory cleanup  ──(sequenced inside)──▶  PRG-02 (WI-531 → WI-387, both delivered; WI-587 residue ungated)
PRG-01 IF exported boundary nodes (planning-reference Appendix):
  "W1 landed"                ──▶  PRG-11 · PRG-13(part)
  "W2/W3 landed"             ──▶  PRG-10 in-radius remainder · PRG-15 (envelope-router half)
  "clean-cut tail done"      ──▶  PRG-20 bulk
PRG-12 · PRG-14-light · PRG-10 out-of-radius subset  ──▶  parallel-safe (queue gates only — never edges)
```

---

## Spillover register — cross-cutting items spawned by umbrella work

> Standalone Cosmo items (**no workstream**) that umbrella work spawned or
> surfaced. They are in Cosmo, but they roll up to **no PRG**, so nothing in a
> PRG's view mops them up — they are tracked **here** instead. These are still
> umbrella obligations; "in Cosmo" ≠ "mopped up".
>
> **Why standalone (not forced into a PRG workstream):** these items target
> different branches / policies (a main-side hotfix, a post-merge GC6 burndown, an
> estate-tooling fix) — forcing them under one workstream's review policy mis-fires
> (the WI-694 lesson). Standalone + this register is the clean model.
>
> **Mop-up guarantee — two parts:**
> 1. **Backstop query (the guarantee):** at every program checkpoint, query Cosmo
>    for items with **empty Workstream**, **State≠Closed**, in the MentoMate project,
>    and reconcile against this table. The query does not depend on anyone
>    remembering to log a row — it catches items **any** session created
>    (e.g. `WI-684` was captured by the LLM shepherd, not the program session).
> 2. **This table (the disposition record):** every floating item gets a row with
>    its origin + intended home. The umbrella program **does not close** with an
>    un-dispositioned row here — each must be resolved, adopted by an active
>    initiative, or consciously parked with a reason.
>
> **Review/close path:** standalone items are **not** covered by the workstream
> autonomous review loops (those are workstream-scoped — proven by `WI-694` sitting
> in Reviewing uncollected). Their `Reviewing → Closed` transition is a **manual
> `/cosmo:review`** by the program session or shepherd. Tracking is not enough; the
> close path is manual for these.

| WI | Spawned by | Class | Disposition | Status (2026-06-13) |
|----|-----------|-------|-------------|---------|
| `WI-683` Cosmo refine-writer childless-WP refuse-with-remedy | PRG-17 activation friction | estate Cosmo tooling | route to estate **ZDX/Cosmo** stream (Nexus governance) — not an eduagent-repo fix | Backlog |
| `WI-684` CI change-class routing skips DB-package RLS tests | WI-676 (ledger RLS) discovery | eduagent CI infra | pairs with `WI-688`; adopt at next CI/platform activation (candidate PRG-11 or a CI initiative) | Captured |
| `WI-688` RLS coverage-guard blind spot (hand-maintained table list) | WI-687 residue | eduagent guard-hardening | post-merge code-quality; pairs with `WI-684` | Backlog |
| `WI-694` KV-verifier empty-body regex hotfix | WI-682 prod probe | main-side hotfix | detached from PRG-17; closing via generic review | Reviewing → Closing |
| `WI-695` GC6 burndown — 3 new-llm test internal mocks | claude-review on #1087 | eduagent GC6 backlog | post-merge; standalone by design (avoids new-llm-landing policy) | Backlog |
| `WI-696` Type `app/session.completed` event end-to-end (Finding A) | claude-review on #1087 | eduagent schema-contract | post-merge; proper fix of the pervasive untyped-event pattern (not the one-field add the reviewer implied) | Backlog |
| `WI-697` [SPIKE THROWAWAY] agnosticity probe fixture (clamp + test) | PRG-05 agnosticity spike | throwaway spike fixture | not real work; existed only to give the spike an executor task | **Closed/Cancelled 06-13 ✓** — spike complete (`spike-agnosticity/finding.md`) |

---

## Change log
- **2026-06-15 — PRG-06 (Identity Cutover) STOOD UP — new Initiative ∥ PRG-01 (organization
  ruling B).** The WI-586 "code half" — never PRG-01 scope; assumed delivered by the parallel
  S0–S6 *mentor-is-the-app* track, which the staging cutover proved misaligned to canon
  (post-drop reads 500) — is now its own managed Initiative. Cosmo **Workstream "Identity
  Cutover"** (`3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`) created with **WP-1** (breaking-set
  enumeration, `Stage=Backlog`, order 1; pre-graph 401 fix `de8df6e86` folded in as slice-1);
  **WI-586 + its 2 sub-items moved in** from "Identity Foundation" (WS-9), WI-586 Blocked-by
  re-pointed to the code lane + Description corrected. **Standing rules:** canon wins; **S0–S6
  design choices NOT canonical**; shepherd launch **gated on ADR-0020/0021/0022 cleanup**
  (reverse-engineered from S0–S6; separate re-vetting session → trusted once done). Tracker
  `_wip/identity-cutover/execution-tracker.md`; parked kickoff `shepherd-kickoff.md`. **PRG-01
  GRADUATED** — WS-9 open-WI audit clean (52/52 Closed), Cosmo Workstream `Status=Closed`;
  PRG-01 graduated on foundation-build scope (cutover/drop completion handed to PRG-06).
- **2026-06-13 — PRG-11 (architecture) ACTIVATED — seventh §2.1 run; first TIERED
  activation.** Cosmo Workstream "Architecture Clean-Out"
  (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`). A cutover-coordination scan (sub-agent) split
  the ~24 LIVE findings vs the live IF cutover: **16 parallel-safe / 9 serialize** (behind
  CUT-B2/B3 + the WI-586 tail) **/ 0 moot-risk**, crossed with mechanical-vs-architectural
  → three tiers. **Only Tier 1 (autonomous: races, tests, GC1 guard, GC6 sweep) sliced into
  Cosmo** — `WI-717…720` (`Stage=Backlog`, order 1–4) — so an unsupervised shepherd can't
  hit a decomposition decision or a cutover collision. Tier 2 (8 parallel-safe-but-human-
  gated) + Tier 3 (9 cutover-serialized) recorded in the tracker, sliced at the operator
  decomposition gate (Tier 2 any time; Tier 3 post-flip + re-scan). Tracker:
  `_wip/architecture/execution-tracker.md`. Promoted to Active row; emerging table + queue
  entry 8 marked activated.
- **2026-06-13 — PRG-05 agnosticity SPIKE COMPLETE.** First design-phase work for PRG-05
  done. Run 1 died to a transient subscription-plan expiry (the "entitlement-gated at depth"
  theory was wrong — retracted); run 2 completed the nested cross-runtime review probe.
  Result: cross-runtime dispatch (incl. nested Claude-executor → Codex-reviewer adversarial
  review) is production-viable; 7 seam-contract requirements + a "reviewer≠executor as
  contract default" recommendation captured in `spike-agnosticity/finding.md`. Canonical
  Codex seam = `codex exec --cd <wt>`. Throwaway WI-697 Cancelled. Next gate: the combined
  PRG-04 + PRG-05 design/grill (finding = required seam-catalogue input).
- **2026-06-13 — PRG-10 (security-pii-api) ACTIVATED — sixth §2.1 run, first
  post-cutover parallel activation.** Cosmo Workstream "API Security & PII"
  (`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`) + `WI-698…704` created (5 WP + 2 Item,
  `Stage=Backlog`, order 1–7, no `Blocked-by`). Slice scan (sub-agent): **27/27 LIVE**
  (IF subsumed none), **27/27 CLEAN** (no overlap with the live CUT-B cutover — fully
  parallel-safe); OQ1 ruled CI/GHA findings stay in PRG-10 (`WI-698`), OQ2 file-touch
  audit done at slice. Promoted to Active row; Emerging table + queue entry 7 marked
  activated. Tracker: `_wip/security-pii-api/execution-tracker.md`. Shepherd kickoff
  handed to operator; spawn pending.
- **2026-06-13 — PRG-05 design-phase ACTIVATED (spike start).** Starting the
  agnosticity spike moves **PRG-05** embryo → `active` — but as a *design* activation
  (spike → grill), **not** the §2.1 execution recipe: no Cosmo Workstream/slice until
  the grill closes. **PRG-04 stays embryo** (the spike is Half-B-scoped; PRG-04's
  design opens at the joint grill). Queue row 9 marked design-activated. Note: this
  pre-slice "design activation" is lighter than §2.1 and is itself dogfood for PRG-04
  (the top-down layer must model a design phase before the Workstream slice).
- **2026-06-13 — Mechanism productionization split into two sibling Initiatives.**
  The hand-built program-delivery mechanism is now **PRG-04** (top-down delivery
  layer — narrowed) + **PRG-05** (execution/loop mechanism — new row); `WI-590` was
  double-loaded and its loop half re-homes to PRG-05 at slice. Decisions persisted in
  `supporting-artefacts/mechanism-productionization-design-input.md`: combined
  design/grill before slicing; sequence **spike → grill → slice** (no Cosmo until
  post-grill); agnosticity scoped to role-unit swap (orchestrator ·
  shepherd-with-executors · reviewer) with shepherd↔executor native-by-design and
  reviewer≠executor as a quality invariant. Pre-grill **agnosticity spike** defined
  (Claude shepherd ↔ Claude/Codex-model executors via `codex-companion`; Claude
  executor → Codex nested adversarial reviewer).
- **2026-06-13 — PRG-17 GRADUATED (fifth graduation; first integration lane).**
  Operator ruling. new-llm reconciled + merged to `main` (`105b39ac0`), §8 rescan
  GO, post-merge deploy green (WI-664 closed), WI-694 closed, branch protection
  enforcing `Merge completeness check`. Deferred follow-ups (WI-695/696/683/684/688)
  tracked in the spillover register, not residue. Shepherd stood down. 5 of the
  program's lanes now graduated (PRG-02/12/13/15 clear-out + PRG-17 integration);
  the IF cutover (PRG-01 tail) is now executing on post-merge main.
- **2026-06-13 — PRG-17 new-llm MERGED to `main`** (`105b39ac0`, `--no-ff` merge
  commit, PR #1087). The reconciled `new-llm` is fully an ancestor of main;
  `Merge completeness check` passed on the merge ref; all deterministic gates
  green; the 4 claude-review SHOULD_FIX deferrals are documented on the PR + the
  spillover register (`WI-695`/`WI-696`). **Boundary event "new-llm merged" fired
  → IF cutover EXECUTION unlocked** (CUT-A may now generate against the post-merge
  journal). Deploy/KV chain wired end-to-end (WI-682 + WI-685 + WI-694 verifier +
  GH secrets) — `WI-664` closes on the first green post-merge deploy. PRG-17
  reconciliation complete; graduation = operator ruling. Follow-through:
  branch-protection add of `Merge completeness check`; WI-694 manual `/cosmo:review`
  close; IF shepherd kickoff (CUT-A).
- **2026-06-13 — Spillover register added** (mop-up mechanism). Five standalone
  Cosmo items spawned by umbrella work (`WI-683`/`684`/`688`/`694`/`695`) were
  floating outside any PRG rollup; now tracked above with a backstop-query
  guarantee so none drop. Rule going forward: every standalone item gets a row,
  and the checkpoint query reconciles against it.
- **2026-06-13 — IF CUTOVER PLAN RATIFIED (v1.7) + CUT SLICE LIVE.** Operator
  ruled all 11 OQs (OQ-1 = option c, graph at onboarding completion; OQ-3
  bulk-delete; OQ-4 two-stage freeze + 24h soak; OQ-11 = account-detachment §4
  canon deltas as the intake; OQ-2/5/6/7/8 as recommended). Plan reached v1.7
  through six adversarial rounds. Sliced into the IF workstream as
  `WI-689` (CUT-A) · `WI-690` (canon intake) · `WI-691/692/693` (CUT-B1/B2/B3),
  orders 202–206; `WI-586` re-scoped to the §4 convergence runbook (stubs
  WI-631/632 ride unchanged). Execution gated on the PRG-17 merge. The v1.7
  review also exposed a WI-676 residue — ledger RLS registered DB-level only —
  routed back to PRG-17 as `WI-687` (TS-side registration, pre-merge) with the
  guard blind spot captured as `WI-688` (hand-maintained table list passes
  unregistered tables vacuously).
- **2026-06-12 — new-llm strategy RULED (O2) + PRG-17 ACTIVATED (fifth lane).**
  Operator approved the integration analysis's recommendation after four
  adversarial passes: **merge new-llm first, then run the IF cutover on
  post-merge main**, gated by the 12-item reconciliation checklist + a final
  rescan of the reconciled SHA. Reconciliation executes through the program
  pipeline (Zuzka's lane halted; stakeholder exec summary:
  `supporting-artefacts/new-llm-integration-exec-summary.md`). Cosmo Workstream
  "new-llm Integration & Reconciliation" sliced as `WI-675…682` (2 Highs:
  deploy-gate false-positive that would brick all post-merge deploys; missing
  RLS on `mentor_activity_ledger`). Two-track sequencing confirmed: cutover
  *planning* (plan v1.5 → v1.6 delta + approval + WI slicing) runs in parallel;
  cutover *execution* waits for the merge (CUT-A generates against the
  post-merge journal). Planner hand-off:
  `_wip/identity-foundation/cutover-plan-delta-newllm.md`.
- **2026-06-12 — PRG-13 GRADUATED (fourth graduation, fastest lane).** Operator
  ruling: `WI-665` + `WI-666` Closed/Done via the autonomous loop, activation →
  slice-complete in under a day. All 6 `security-pii-inngest` findings
  remediated (minors' PII out of step state/event payloads, env-binding
  isolation, cursor-skip + grade-before-claim bugs); zero residue. Clear-out
  scoreboard: 4 of the 6 audit clear-out initiatives now graduated
  (PRG-12/13/15 + PRG-02); PRG-10 + PRG-11 remain armed. Live execution: IF
  (cutover plan v1.1 in revision) + the new-llm integration analysis
  (sweep workflow resumed after token-cap interruption).
- **2026-06-12 — PRG-12 GRADUATED (third graduation, largest slice).** Operator
  ruling after program-session verification found nothing needing review:
  all 8 WPs (`WI-621…628`, ~34 findings) Closed/Done via the autonomous loop;
  INV-1 ratchet baseline verified burned 361 → 12; F-163 confirmed
  never-residue (Closed via `WI-584`/PR #874 — register label overlap, not
  scope). Two reviewer bounces correctly adjudicated en route (WI-623 rework;
  WI-626 flake disproof). Second lane freed. Live lanes now: IF (cutover plan
  v1.1 in revision after adversarial review — 3 High + 1 Medium findings
  verified and handed back) + PRG-13 (WI-665/666 both executing).
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
