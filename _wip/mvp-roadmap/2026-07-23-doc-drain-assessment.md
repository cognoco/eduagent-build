# Documentation-drain assessment — WS-36 → MVP-refinement relevance (2026-07-23)

> Commissioned by the operator (2026-07-22 PM roadmapping sitting); brief:
> `_wip/mvp-roadmap/lane-prompts/doc-drain-assessment.md`. Executed by `pm:claude:mentomate`
> with three read-only Opus code-vs-doc auditors (consent/WS-32 surface, core-loop/WS-46
> surface, doc-infrastructure). Repo state: eduagent-build HEAD `9a4ae7c` (2026-07-23 morning).
> **Read-only throughout; this file is the only write. Nothing here is self-executing —
> input to an operator ruling.**

## 0 · Headline findings (read this even if nothing else)

1. **The docs are healthier than the mentor-notice scar implies.** The July MVP-refinement
   curation visibly worked: the four core WS-46 specs carry `last verified 2026-07-22` with
   per-WI shipped/superseded dispositions; specs/plans status headers are git-fresh and
   meaningful. The mentor-notice failure mode (building from an un-ratified draft) is real but
   *not representative* of the current spec surface.
2. **The biggest AC-corruption risks are mostly NOT what the 18 drain items fix.** The
   verified HIGH-risk surfaces are: AGENTS.md truncation (54,575 chars vs the 40k harness
   ceiling — every agent session silently loses the secrets protocol, PR/CI protocol, and all
   engineering guardrails past byte 40k), the self-stale audience-matrix (describes the landed
   V1 nav migration as pending, cites an archived spec as its target), docs/INDEX.md (<5%
   coverage masquerading as the canon map), and a 460-file `docs/_archive/` that leaks
   current-looking titles into every search. Only the first has a drain item aimed at it
   (S2-03/S2-04). The rest are **gaps** (§3).
3. **Two drain-item premises dissolved on verification:**
   - The **ADR-0020 / data-model §2B.1 RLS "falsehood" does not exist.** Both docs explicitly
     *disclaim* a named service-role policy for `consent_request` (owner-role bypasses RLS),
     and code matches (`consent_request_charge_isolation` exists verbatim at
     `apps/api/drizzle/0114:68`; no service-role policy anywhere in `drizzle/*.sql`). The
     WI-752 rider (2026-07-15, D2 annex #8) targets a defect that is now absent — either fixed
     since or misdiagnosed. That sub-scope is **moot**.
   - **Census row 54 encodes a superseded ruling.** It records the launch posture as
     "guardian-consent through 16, **location-blind**" — reversed by OPQ-133 (2026-07-22,
     Option 1: jurisdiction-aware, launch markets not locale-constrained). If S2-06 (WI-2069)
     executes row 54 as written it would enshrine the dead posture as an ADR **exactly while
     the WS-32 consent cluster refines against the new one.**
4. **Jurisdiction-aware consent: the docs are AHEAD of the code, not behind it.** Canon
   (`docs/canon/identity/ontology.md`) already models `resolveConsentRequirement(age ×
   residence_jurisdiction)`; the schema is shipped (`person.residence_jurisdiction NOT NULL`,
   `regimes`/`policy_cells` tables in migration 0108). But the resolver is a fail-closed
   scaffold: `evaluatePolicyCell` returns `consentRequired: true` for ALL inputs
   (`services/policy-engine/engine.ts:54-72`, `policy_cells` unpopulated), and the live gate is
   flat jurisdiction-blind age≤16 (`services/consent.ts:163,186`) — imported by exactly the
   WS-32 flows (onboarding, family-v2, child-profile-v2, family-join-v2). Refiners of
   WI-2532/2533/2534/2535 can use ontology.md as the authoritative model **provided every AC
   scopes *building* the resolution, never consuming it as existing.** No drain item is needed
   for this — a one-line banner or refiner-brief note carries it.

## 1 · Split proposal

### Accelerate into MVP (ahead of the refinement wave)

| Item | Rationale |
|---|---|
| **WI-2051 (S2-03 principles.md draft finalization)** + **WI-2052 (S2-04 land + AGENTS.md trim under 40k)** | The one verified HIGH×everyone×cheap item: 54,575 chars vs 40k ceiling means every refiner/builder session **today** silently loses Repo-Specific Guardrails, UX Resilience, Fix Development Rules, Code Quality Guards, Planning Discipline, ADR rules, Secrets Management, PR/CI protocol, and all Handy Commands. Draft delivered 2026-07-14; arithmetic verified (53,740→38,304). Both P1 already. Effort S–M. Do before or in parallel with the wave's first batch. |
| **WI-2069 (S2-06 ADR backfill) — a SCOPED refinement-relevant slice, amended** | Precondition (WI-757+896) is **already met — both Closed**, so this is executable now. Accelerate only the rows the wave will consult: **57** (detachment/supporter ceiling — WS-32), **53** (crisis-disclosure no-guardian-notification — safety, minors), **12/13** (no-forced-add-child + confident-inference UX — feeds WI-2532 onboarding fork), **9** (session lifecycle), **15** (quota shape, reconcile vs live config first per its own AC), **19** (source-audit exemptions), **3** (envelope ADR — the contract WS-46 items cite). **Hard rider: row 54 must be re-derived from the OPQ-133 ruling before drafting** (see §0.3), and **row 58 is moot** (RLS premise dissolved — disposition "verified accurate, no correction"). Remaining rows ride the normal wave. Effort of the slice: M (vs L for the full batch). |

*Deliberately NOT accelerated despite HIGH findings:* the audience-matrix, INDEX.md, and
archive-leak fixes — because **no drain item covers them** (they'd be scope inflation of S2-13
which only *relocates* the matrix). They're in §3 for the PM to capture as new items; the
archive-leak fix is a one-line ignore rule.

### Do opportunistically (pick-list, no scheduling)

| Item | Rationale |
|---|---|
| WI-2065 (S2-01 census finalization) | Paper exists and is ruled; the finalization pass is the natural **vehicle for the row-54 amendment** and the row-58 moot disposition. Cheap. |
| WI-2066 (S2-02 mapping finalization) | Paper exists; verification-only. No refinement impact either way. |
| WI-2070 (S2-07 SHOULD rows) | Row 36 (Family Compliance Boundary) and row 42 (UX bundle) have WS-32 relevance, but SHOULD-tier by ruling; fold behind the S2-06 slice if capacity appears. |
| WI-2068 (S2-05 ARCH-N register drain) | LOW-MED: register is live-cited from 5 code files but epics.md is fresh (2026-07-22) and visibly mid-drain — annotations are housekeeping, not corruption control. |
| WI-2073 (S2-10 docs-tagged memory migration) | MED-adjacent (testing seeds, provenance) but nothing the wave consults. |
| WI-752 (ADR governance re-vet) | Operator-judgment-bottlenecked by design; its urgent-looking sub-scope (RLS) verified moot. The 0016/0017/0021/0022 re-vet has no WS-32/46 consultation surface. Keep parked-opportunistic. |

### Stay parked (estate-track, untouched)

| Item | Rationale |
|---|---|
| **WI-2074 (S2-11 docs-tree reorg execution)** | Not just neutral — **actively hazardous mid-wave**: it rewrites hundreds of paths while refiners are citing them, and its own gate (D7: after Wave-2 backfill) already sequences it later. Explicitly do NOT accelerate. |
| WI-2076 (S2-13 audience-matrix + flows move) | The *move* doesn't fix the matrix's HIGH staleness (§3.1); gated on S2-11 anyway. |
| WI-2075 (S2-12 glossary bucket-3) | Blocked on S2-11 by its own AC. Glossary's real gap (notice/journal terms) is a §3 gap, not bucket-3 scope. |
| WI-2077 (S2-14 tech-skill pointers), WI-2078 (S2-15 quarantine diff), WI-2079 (S2-16 graduation) | Late-wave hygiene; zero refinement surface. |
| WI-2072 (S2-09 nine-memory drain) | Already Blocked/entangled by its own AC (converges on S2-06 envelope ADR + WI-2052); untouched until its gates land. |
| WI-1309 (Stream-2 slicing umbrella) | **Largely moot**: the S2-01..16 items it mandates now exist (minted 2026-07-15). Residual value = the home-doc pointer, which S2-16 also covers. Candidate for close-or-fold at next triage — flagged, not actioned (read-only). |

### Sequencing note

The accelerate set is deliberately tiny: **S2-03→S2-04 (one S/M chain) + a scoped, amended
S2-06 slice (M)**. Everything else either has no consultation surface for the wave, is gated
later by its own design, or fixes the wrong thing. The drain's wave structure itself is sound —
the error to avoid is pulling the *reorg* (Wave 3) forward, not the backfill.

## 2 · Per-item evidence table

Risk = corruption-to-refinement if left stale. Effort = the item's own class (S/M/L).
Dependent WIs = unrefined MVP items whose refiner would plausibly consult the surface.

| Drain WI | Doc surface(s) | Dependent MVP WIs (sample) | Risk | Effort | Bucket |
|---|---|---|---|---|---|
| WI-2051 S2-03 | AGENTS.md → principles.md draft | ALL (every agent session truncated: guardrails/secrets/CI lost past byte ~40,000 of 54,575) | **HIGH** | S (draft exists) | **Accelerate** |
| WI-2052 S2-04 | AGENTS.md trim + landing | same | **HIGH** | M | **Accelerate** |
| WI-2069 S2-06 | 21 MUST rows → ADRs (envelope, session lifecycle, quota, crisis, detachment, onboarding UX) | WI-2532/2533/2534/2535 (rows 12/13/54*), WS-32 supporter set (row 57), WS-46 envelope/retention set (rows 3/9/18/19), quota (row 15) | **HIGH (slice)** — with the row-54 amendment; row 58 moot | L full / M slice | **Accelerate (slice)** |
| WI-2065 S2-01 | census finalization + tier bar | vehicle for row-54/row-58 corrections | MED | S–M | Opportunistic |
| WI-2066 S2-02 | mapping-table finalization | none directly | LOW | S | Opportunistic |
| WI-2070 S2-07 | 29 SHOULD rows | row 36 (family compliance boundary → WS-32), row 42 (UX bundle) | MED | L | Opportunistic |
| WI-2068 S2-05 | ARCH-N register (epics.md:312-341) | none blocking (register fresh 2026-07-22, live-cited but mid-drain) | LOW-MED | S | Opportunistic |
| WI-2073 S2-10 | testing seeds, provenance memory → docs | none in WS-32/46 | LOW-MED | S | Opportunistic |
| WI-752 | ADR-0000 amendments (done), ADR 0016/0017/0021/0022 re-vet, ~~ADR-0020 RLS fix~~ (premise dissolved — docs verified accurate) | none | LOW (was assumed HIGH) | L | Opportunistic/parked |
| WI-2072 S2-09 | 9 memory rows → ruled targets | none directly | LOW (blocked anyway) | M | Parked (own gates) |
| WI-2074 S2-11 | docs/ tree reorg execution | negative — path churn under refiners | **LOW value / disruption risk** | L | **Parked (do NOT pull forward)** |
| WI-2076 S2-13 | audience-matrix + flows relocation | move ≠ refresh; matrix staleness is §3.1 | LOW (as scoped) | M | Parked |
| WI-2075 S2-12 | glossary bucket-3 (cards/celebrations) | none (notice/journal gap is out of its scope) | LOW | S | Parked (blocked) |
| WI-2077 S2-14 | 3 tech skills → pointers | none | LOW | S | Parked |
| WI-2078 S2-15 | quarantine diff | none | LOW | S | Parked |
| WI-2079 S2-16 | home-doc reconciliation | none | LOW | S | Parked |
| WI-1309 | slicing umbrella | none — **largely moot** (S2 items exist) | LOW | — | Parked → close-or-fold candidate |
| (context, not WS-36) MMT-ADR-0036 | mentor-notice canon | WS-46 notice cluster (WI-2502/2583/2599/2601 + correctives 2624-2629) | **HIGH but live elsewhere** — under OPQ-144/145 ratification right now | — | Out of drain scope |

## 3 · Gaps found that no drain item covers (list only — PM to capture)

1. **`docs/audience-matrix.md` content refresh** — HIGH for WS-32 precision. Self-declares
   verification pinned to 2026-05-23; cites the *archived* nav-contract spec as pending target
   state while `navigation-contract.ts` (touched 2026-07-11) now defines four tab sets
   (STUDY/FAMILY/PROXY/LEGACY_GUARDIAN) vs the matrix's two; points at CLAUDE.md instead of
   AGENTS.md. S2-13 only *relocates* it. Both auditors independently flagged it.
2. **`docs/INDEX.md` live-corpus coverage** — the "documentation index" covers <5% of 881
   files (identity-only seed, frozen 2026-06-12). A refiner navigating by INDEX misses
   specs/plans/runbooks/flows/compliance/registers entirely.
3. **`docs/_archive/` search leak** — 460 .md files, none search-excluded, several with
   current-looking names (`navigation-contract`, `architecture-*`, `memory-architecture-*`)
   that collide with live canon. Cheapest fix in this report: one ignore rule (rgignore or
   agent-instruction line).
4. **Small verified content drifts** (each a one-line fix, no owner):
   `docs/project_context.md:218` says `MIN_CHALLENGE_REMAINING_TURNS = 5`, code is **3**
   (`services/challenge-round/trigger.ts:28`); `docs/architecture.md:1360` describes an
   `easeFactor >= 2.5` EVALUATE trigger that exists nowhere in code (aspirational design
   conflated with the shipped `evaluateRecallQuality` path); stale verification stamps
   (`architecture.md:1303` "verified 2026-05-22" over a schema touched 2026-07-22;
   `project_context.md:250` footer vs July body).
5. **ontology.md "resolution unbuilt" banner** — one line stating that jurisdiction-aware
   consent resolution is scaffold-only (fail-closed, `policy_cells` unpopulated; live gate =
   flat age≤16) so consent-cluster ACs scope building it, not consuming it. Alternatively
   carried in the WS-32 refiner brief.
6. **Census/WI premise corrections** (governance bookkeeping): row 54 amendment to OPQ-133;
   row 58 + WI-752 rider mooting (RLS verified accurate). Natural vehicle: S2-01 finalization.
7. **Glossary notice/journal/scope vocabulary** — the newer surface refiners in the notice/
   journal area need is absent (journal=0, notice=1 occurrence); outside bucket-3 scope.

*Nothing found that actively lies about a live security behavior.* Closest calls, both
fail-safe: consent gate is stricter than documented target (flat ≤16), and mentor-notice
safety machinery is described as designed while the whole feature is flag-dark (docs disclose
the dormancy at `architecture.md:369`, `project_context.md:231`, config defaults
`config.ts:176,182` — no wrangler override sets it on).

## 4 · Confidence + what was not checked

**High confidence** (independently code-verified by auditors): AGENTS.md size/overage and
what falls past the cut; RLS claim end-to-end (drizzle 0000/0114/0115 exhaustive for the
table); jurisdiction schema-vs-resolver gap incl. the caller chain; audience-matrix drift
specifics; the four curated WS-46 specs' verification stamps; flag-off reality for
mentor-notice/challenge-round; census row-54 vs OPQ-133 conflict (read directly).

**Medium confidence:** per-row mapping of S2-06/07 census rows to specific unrefined WIs
(read from row titles + WI names, not each row's full body); WI-1309 mootness (inferred from
S2-item existence, not a full inventory diff of stream-2-backlog.md).

**Not checked:** doc surfaces for the other MVP lanes (WS-33/35/54/39 etc. — brief weighted
WS-32/46); `domain-model.md` lifecycle depth and `canon/identity/prd.md` beyond date/grep;
`visibility.ts` semantics vs ADR-0027 (line-match UNVERIFIED); the 29 SHOULD rows
individually; `docs/_archive/` contents (only titles); memory `_archive/` subdirectory;
whether the 40k harness ceiling is byte-exact for every harness (size and overage verified,
ceiling value taken from the D4 ruling). Demand-side WI lists were drawn from the 2026-07-22
board pull plus the OPQ-133 consent cluster; items created after 2026-07-22 12:49 other than
that cluster are not reflected.
