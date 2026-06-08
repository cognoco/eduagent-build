---
title: Phase I — Legacy Architecture Anchors, Identity ARCH-N Touch, and Canon-Authorship Process
date: 2026-06-08
profile: change
spec: _wip/identity-foundation/ROADMAP.md (Phase I row) · _handoffs/2026-06-08-phase-h-close.md
status: completed
---

# Phase I — Legacy Architecture Anchors, Identity ARCH-N Touch, and Canon-Authorship Process

**Goal:** Close Phase I's three distinct sub-gates: **I-a** — clean up the flagged legacy `architecture.md` anchors; **I-b** — give the identity-domain `ARCH-N` register entries their terminal dispositions (citations migrated); **I-c** — establish the canon-authorship process and the anti-divergence guard. I-a/I-b are bounded cleanup; **I-c is the structural governance hinge**, not a light cleanup — it is the rules Phase J will obey.

**Approach:** Three sub-gates, executed in order, each independently verifiable (see per-sub-gate verification). I-a and I-b are **scope-by-*touching*** — correct what is *directly misleading*, leave *merely incomplete* legacy for the Stream-2 rebuild. I-c authors durable governance and so is held to the full canon bar. Across all three, hold the **Phase-H canon-quality rule**: plain self-explanatory rule language, **no runway-internal IDs** in new canon prose (`Path X`, `G-3`, `T3`, bare `inv NN`, etc.); keep inline `MMT-ADR-*` / `data-model.md §` trace-cites (`MMT-ADR-0000` §I.2).

## Scope

In scope:
- `docs/architecture.md` — 5 anchor rewrites + title/preamble + frontmatter `status` fix + `[TRANSITIONAL]` banner update + `routeAndCall` canon cross-ref (D2 lockstep)
- `docs/specs/epics.md` — `ARCH-N` register dispositions (`ARCH-7` stands · `ARCH-8` promoted · `ARCH-9` superseded)
- `docs/adr/MMT-ADR-0017-llm-orchestrator-single-entry-point.md` — **new ADR** promoting `ARCH-8` (D2)
- `apps/api/src/services/llm/{router.ts,types.ts,providers/openai.ts,providers/gemini.ts}` — `ARCH-9` → `MMT-ADR-0014` and `ARCH-8` → `MMT-ADR-0017` code-comment citation migration (comment-only; no logic)
- `docs/adr/README.md` — "How canon is authored" subsection
- `docs/adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md` — anti-divergence amendment (D3)
- `_wip/identity-foundation/ROADMAP.md` — Phase I row → `[x]`, decision-log entry

Out of scope (Stream 2 / structural — deliberately untouched, flag don't fix):
- The full `architecture.md` structural rebuild + `ARCH-N` reverse-engineering → **Stream 2**
- The stale legacy schema-file block at `architecture.md:628-638` (`profiles.ts # profiles, family_links, consent_states`) — adjacent to I-a's anchor 4 but a whole-model fossil; Stream 2 rebuilds it (noted in T4)
- `UX-6` (three-persona theming teen/learner/parent) and other `UX-N` — persona model is superseded by the capability split, but I-b is an **`ARCH-N`** touch; the UX-spec refresh is Stream 2 (noted in T7)
- The registry-wide `ARCH-N` drain (the other 23 entries) → **Stream 2**

### Not Phase I — explicit boundary (Phase J, not now)

Phase I prepares the canon-authorship *rules*; it does **not** apply them across the estate. The following are **out of bounds for this plan** and belong to Phase J (see the J-split handoff below):

- **No Phase J canon-shape scrub** — do not sweep terminology/shape across canon broadly. (Phase I touches only the lines it rewrites.)
- **No `_wip` → `docs/canon/` graduation** — the 4 identity domain-canon docs stay in `_wip/` this phase; their move is **J0** (the `MMT-ADR-0000` §I.4 front-of-J amendment).
- **No agent-doctrine / memory reduction** — do **not** reduce `CLAUDE.md` / `AGENTS.md` or `.claude/memory/` to pointer-layer; that is **J2** / **J1**.
- **No broad terminology cleanup** — do not clean temporary terminology (charge/persona/Path-X/etc.) outside the specific Phase-I touched lines; the A-vs-B cleanup sweep is Phase J.

Adjacent items that are explicitly **deferred to Phase J**, recorded here as pointers (not Phase-I tasks):
- Formal L0-glossary definitions of routing nouns (`tutor`/`judge`/`rung`/`tier`/`flow`/`slot`) → **J0/J2** (glossary alignment); glossed inline in `0014`/`0016` for now.
- Phase J(0) citation rewrite (`_wip/` → `docs/canon/` paths) once the domain docs graduate → flagged in the carve-out's section banner; executes at **J0**.

---

## Background — what each sub-gate resolves

**I-a (legacy anchor cleanup).** H *marked* 5 direct conflicts where a legacy line contradicts the new `## Identity Foundation` canon; I-a *rewrites* them so the legacy line agrees with canon, then deletes the now-resolved `[LEGACY-REVIEW]` comment, and squares the banner + title/preamble/frontmatter. The carve-out (`architecture.md:563-609`) already states the truth; these rewrites point legacy prose at it. Scope-by-touching — merely-incomplete legacy is left for Stream 2.

**I-b (identity-domain `ARCH-N` dispositions).** Per `MMT-ADR-0000` Part III, every `ARCH-N` owes a terminal disposition, and **no `ARCH-N` is retired without resolving its code citations** (absorb-forward: a promoted entry migrates its own code comments to the new ID in the same change-set). Only the identity/policy-engine-intersecting entries are in scope: `ARCH-9` (model routing — **superseded** by `MMT-ADR-0014`/`0016`), `ARCH-8` (orchestrator — **promoted to new `MMT-ADR-0017`**, per decision D2), `ARCH-7` (scoped repo — **stands**, scope-key note). Code-citation census (verified 2026-06-08): `ARCH-9` at 4 sites, `ARCH-8` at 4 sites (3 shared with `ARCH-9`), `ARCH-7` none. Shared sites get both migrations. Citation edits are **comment-only** (no logic).

**I-c (canon-authorship process / anti-divergence guard).** The structural governance hinge. The `0016`↔`0000` doctrine-divergence *instance* is already gone (the lockstep-denial line was removed when `0016` was repurposed, 2026-06-08). The surviving root cause is that the canon-authorship *process* was never written down in one place — so two ADRs *could* disagree on what canon is. I-c writes the process down (`adr/README.md`), records the durable guard in the constitution (`MMT-ADR-0000`), and self-identifies `architecture.md` as canon (title + preamble). **These are the rules Phase J will obey** — I-c prepares them; it does not execute J.

---

## Tasks

### Sub-gate I-a — legacy `architecture.md` anchor cleanup (T1–T6)

- [x] **T1: NFR table row (~line 68).** Replace the COPPA-adjacent row and delete its `[LEGACY-REVIEW]` comment.
  - Before: `| COPPA-adjacent | Ages 11-15 | Parental consent workflow, profile isolation, audit trail | <!-- [LEGACY-REVIEW] … -->|`
  - After: `| Minor consent & age | 13+ consent-capacity floor (sub-13 built, gated off) | Append-only consent log keyed (charge × purpose × org); three-axis age model; floor backend-enforced. See § Identity Foundation (MMT-ADR-0015). |`
  - done when: row reads as above; no `[LEGACY-REVIEW]` on the line; no "Ages 11-15"/"profile isolation" remains in the row.

- [x] **T2: Multi-tenancy complexity bullet (~line 98).** Replace and delete its `[LEGACY-REVIEW]` comment.
  - Before: `- **Multi-tenancy**: Family accounts with profile isolation, shared billing, independent learning state <!-- [LEGACY-REVIEW] … -->`
  - After: `- **Multi-tenancy**: Org/membership model — a thin organization owns the billing + consent + quota anchor; membership is the person↔org link; learning data is person-scoped (org/membership re-derived, not profile-isolation). See § Identity Foundation (MMT-ADR-0007/0010).`
  - done when: bullet reads as above; "profile isolation" framing gone; no `[LEGACY-REVIEW]` on the line.

- [x] **T3: Authorization-model paragraph (~line 375).** Rewrite; keep the (correct) Clerk-orgs-rejected rationale, replace the "profile type (parent, teen, learner)" RBAC framing. Delete the `[LEGACY-REVIEW]` comment.
  - After: `**Authorization model:** Custom authorization in our own store, not Clerk Organizations. Clerk orgs are built for B2B multi-tenancy (team invites, role-management UI) — the wrong abstraction for family accounts. Clerk supplies authenticated user identity only; the person, tenancy, roles, consent, and billing state are owned in Neon. Roles are a primitive — a non-empty array over {admin, learner} on the person↔org membership — and the capabilities (consent authority, data visibility, billing control) are separate Guardian / Mentor / Payer edges, never fused into the role. Application middleware maps the Clerk identity to the person and enforces access. See § Identity Foundation (MMT-ADR-0007/0008/0015).`
  - done when: paragraph reads as above; no "(parent, teen, learner)" or "profile type"; no `[LEGACY-REVIEW]`.

- [x] **T4: Enums naming-convention example (~line 623).** Swap the stale `consent_state` example for a surviving enum that demonstrates the same convention; delete the `[LEGACY-REVIEW]` comment. (The stamped-status `consent_states` enum no longer exists — consent is an append-only `consent_grant` event log, `MMT-ADR-0011` §3; this row only illustrates *naming*, so the example is what changes.)
  - Before: `| Enums | snake_case type, SCREAMING_SNAKE values | `consent_state` type: `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `CONSENTED`, `WITHDRAWN` | <!-- [LEGACY-REVIEW] … -->|`
  - After: `| Enums | snake_case type, SCREAMING_SNAKE values | `verification_type` type: `EVALUATE`, `TEACH_BACK` |`
  - done when: row uses `verification_type`; no `consent_state` example; no `[LEGACY-REVIEW]`. **Note in commit body:** the adjacent schema-file block (`architecture.md:628-638`, `profiles.ts # profiles, family_links, consent_states`) is left as-is — whole-model fossil, Stream-2 rebuild (out of scope per scope-by-touching).

- [x] **T5: NFR-coverage table row (~line 1698).** Replace and delete its `[LEGACY-REVIEW]` comment.
  - Before: `| COPPA-adjacent | Ages 11-15 | Parental consent workflow, profile-scoped data access | Covered |`
  - After: `| Minor consent & age | 13+ consent-capacity floor (sub-13 built, gated) | Append-only consent log; three-axis age model; backend-enforced floor — see § Identity Foundation (MMT-ADR-0015) | Defined — § Identity Foundation |`
  - done when: row reads as above; Status no longer asserts "Covered" for unbuilt work (see decision D1); no "Ages 11-15"; no `[LEGACY-REVIEW]`.

- [x] **T6: Update the `[TRANSITIONAL — DOC STATE]` banner (~line 27).** The 5 inline conflicts are now resolved; the banner must stop claiming they are pending. Keep the doc-still-mid-refresh framing (Stream 2 strips the banner).
  - Change the sentence "Direct conflicts are flagged inline with `<!-- [LEGACY-REVIEW] -->` comments (greppable; resolved in Phase I)." to: "The direct conflicts the carve-out supersedes were flagged inline with `<!-- [LEGACY-REVIEW] -->` comments and **resolved in Phase I (2026-06-08)**; the legacy sections themselves remain pre-refresh, pending the Stream-2 rebuild."
  - done when: banner no longer implies unresolved inline conflicts; `[TRANSITIONAL]`/`[CANON-NEW]` markers still present (Stream 2 owns their removal).

### Sub-gate I-b — identity-domain `ARCH-N` dispositions (T7–T9b)

- [x] **T7: Stamp `ARCH-9` (model routing) terminal disposition in `docs/specs/epics.md`.** Append the disposition to the entry; do not delete it (retract-in-place).
  - After: `- ARCH-9: Model routing by conversation state (escalation rung): Gemini Flash for rung 1-2, Gemini Pro for standard rung 3+, and advanced providers only from rung 4 upward for entitled profiles. **— → superseded by MMT-ADR-0014 (router/vetting split — the durable routing-by-rung mechanism) + MMT-ADR-0016 (safety/judge); the pinned model names are register data (`docs/registers/llm-models/`), not canon; "Family standard = Gemini-only" superseded by MMT-ADR-0014 §Supersession. Code citations migrated to MMT-ADR-0014 (2026-06-08).**`
  - done when: entry carries the disposition; references `MMT-ADR-0014`/`0016` + the register; notes the citation migration. **Note in commit body:** `UX-6` (persona theming) and the persona model are superseded by the capability split but are `UX-N` / UX-spec scope (Stream 2), not this `ARCH-N` touch.

- [x] **T8: Migrate `ARCH-9` code citations → `MMT-ADR-0014`.** Comment-only edits at the 4 census sites; no logic change. At the 3 sites shared with `ARCH-8`, apply this edit **together with T9b's `ARCH-8` → `MMT-ADR-0017`** in one pass per file (final state shown below).
  - `apps/api/src/services/llm/router.ts:298` — `// Model routing configuration (ARCH-9)` → `// Model routing configuration (MMT-ADR-0014)`
  - `apps/api/src/services/llm/providers/openai.ts:19` — `(ARCH-8, ARCH-9)` → `(MMT-ADR-0017, MMT-ADR-0014)`
  - `apps/api/src/services/llm/providers/gemini.ts:16` — `ARCH-8, ARCH-9` → `MMT-ADR-0017, MMT-ADR-0014`
  - `apps/api/src/services/llm/types.ts:5` — `(ARCH-8, ARCH-9)` → `(MMT-ADR-0017, MMT-ADR-0014)`
  - done when: `rg "ARCH-9" apps/ packages/` returns zero; `nx run api:typecheck` + lint green on these files (comment-only, expected pass).

- [x] **T9: Cross-ref `ARCH-7` (scoped repo) in `docs/specs/epics.md` — it *stands*.** The scoped-repository pattern is not superseded; only the scope key migrates `profile_id` → `person_id` at the clean-cut baseline. Light cross-ref note; not code-cited, so no migration.
  - `ARCH-7` append: ` **— stands; the scope key migrates `profile_id` → `person_id` at the clean-cut baseline (the pattern is unchanged). See § Identity Foundation / data-model.md §5.1.**`
  - done when: entry carries the cross-ref; not retired; no code-citation change.

- [x] **T9b: Promote `ARCH-8` (orchestrator) → new `MMT-ADR-0017`** (decision D2). Absorb-forward: create the ADR, stamp the register entry, migrate the 4 code citations, land the canon partner in lockstep.
  - **Create `docs/adr/MMT-ADR-0017-llm-orchestrator-single-entry-point.md`** — `reconstructed 2026-06-08` (backfill of a legacy register entry; `adr/README.md` Format). Status `Accepted`; `**Relates to:** MMT-ADR-0014 (router/vetting split — downstream of the orchestrator)`. Body: `## Context` (legacy `ARCH-8`; provider sprawl risk; the value of one choke point) → `## Decision` (all LLM calls route through a single orchestrator, `routeAndCall()`; no direct provider API calls; the router/vetting split (`MMT-ADR-0014`) and the safety/judge roles (`MMT-ADR-0016`) sit *downstream* of this entry point) → `## Consequences` (one place to enforce routing, eligibility, fail-closed, telemetry; provider modules are pure adapters) → `## Alternatives considered` (per-caller provider SDK use — rejected: no choke point for routing/safety/cost). Outcomes-not-why kept tight; soft-wrapped per house style.
  - **Stamp the `ARCH-8` register entry** in `docs/specs/epics.md`: append ` **— → promoted to MMT-ADR-0017 (2026-06-08, reconstructed; code citations migrated). `routeAndCall()` remains the single LLM entry point; the router/vetting split (MMT-ADR-0014) sits downstream.**`
  - **Migrate the 4 `ARCH-8` code citations** (comment-only): `router.ts:841` `(ARCH-8)` → `(MMT-ADR-0017)`; `openai.ts:19` `(ARCH-8, ARCH-9)` → `(MMT-ADR-0017, MMT-ADR-0014)`; `gemini.ts:16` `ARCH-8, ARCH-9` → `MMT-ADR-0017, MMT-ADR-0014`; `types.ts:5` `(ARCH-8, ARCH-9)` → `(MMT-ADR-0017, MMT-ADR-0014)`. (These 3 shared sites are the same edits as T8 — apply both IDs in one pass per file.)
  - **Lockstep canon partner:** locate the `routeAndCall`/LLM-orchestration rule in `architecture.md` (legacy LLM section) and add a `(MMT-ADR-0017)` cross-ref to it — promotion graduates the rule into canon while the ADR holds the *why* (`MMT-ADR-0000` §II.3). If the rule is only in legacy prose, the cross-ref is the minimal lockstep touch (no rewrite of the legacy section).
  - done when: `MMT-ADR-0017` exists with the four standard sections; register entry stamped "promoted"; `rg "ARCH-8" apps/ packages/` → 0; the `routeAndCall` canon line cites `MMT-ADR-0017`.

### Sub-gate I-c — canon-authorship process + anti-divergence guard (T10–T12) — the governance hinge

- [x] **T10: Fix the `architecture.md` title + add a "How this document works" preamble.** The title "Architecture Decision Document" conflates canon (the *what*) with the ADR decisions layer (the *why*); `architecture.md` is **L1 canon** (`MMT-ADR-0000` §I.2). Retitle and replace the generator's tagline. Points to `0000`, does not restate it.
  - Frontmatter (D4): `status: 'complete'` → `status: 'mid-refresh'` (stops the metadata contradicting the transitional banner). Leave `completedAt` / `user_name` / `workflowType` untouched.
  - Line 23 `# Architecture Decision Document` → `# Architecture` (D5)
  - Line 25 (`_This document builds collaboratively…_`) → a 4-line preamble:
    > _This document is **L1 canon** — the authoritative *what* of how the system is built (`MMT-ADR-0000` §I.1–I.2): outcomes and current rules, not the *why*. The reasoning behind a significant choice lives in an **ADR** (`docs/adr/`); new canon enters here only **in lockstep** with its ADR, in one change-set (`MMT-ADR-0000` §II.2–II.3). The legacy `ARCH-1…ARCH-26` register (`docs/specs/epics.md`) is **frozen** and draining to ADRs (`MMT-ADR-0000` Part III). See `docs/adr/README.md` § "How canon is authored" for the full entry process._
  - done when: title no longer says "Decision Document"; preamble states canon-identity + lockstep entry + ARCH-N frozen, all by reference to `0000`/`README`; no rationale duplicated into canon.

- [x] **T11: Add "How canon is authored (the ADR ↔ canon ↔ ARCH-N relationship)" to `docs/adr/README.md`.** Consolidate the rules scattered across `0000` §I.2/§II.2/§II.3/Part III into one crisp operating statement an agent can act from — the deliverable the ROADMAP (c) names ("how content enters architecture.md, the ADR↔architecture.md↔ARCH-N relationship"). Subsection content:
    1. **Three artifacts, three roles:** `architecture.md` (+ PRD/UX) = L1 canon, the living *what*; `MMT-ADR-NNNN` = L2 decisions, the immutable *why*; `ARCH-1…26` = frozen legacy register, draining to ADRs.
    2. **How content enters canon:** only via lockstep — landing/superseding an ADR and editing the exact canon lines in one change-set; never canon without its ADR, never an orphan ADR leaving canon stale. Legacy canon we cannot trace back is grandfathered, not reverse-engineered (`0000` §I.2 north-star).
    3. **Promotion:** when an ADR's rule should bind future work, the rule graduates into canon while the ADR keeps the *why++* (`0000` §II.3).
    4. **The ARCH-N relationship:** frozen; absorb-forward; each entry owes a terminal disposition; citations migrate with the decision (`0000` Part III).
  - done when: the subsection exists, states 1–4 by reference to `0000` (no restatement of rationale), and a reader can answer "how do I add a rule to architecture.md?" from it alone.

- [x] **T12: Add the anti-divergence invariant to `MMT-ADR-0000` (the durable `0016`↔`0000` reconciliation).** A short dated amendment recording the guard so the constitution — not just the README — carries it, preventing a future ADR from re-asserting itself as sole system of record (decision D3: amend `0000` + README pointer).
  - Amendment text (≈4 lines): *"**Amendment (2026-06-08) — no document is the sole system of record.** Canon (L1, the living *what*) and ADRs (L2, the immutable *why*) are distinct layers that move in lockstep (§II.2); **no ADR, canon doc, or agent-doctrine line asserts itself as the sole or authoritative record to the exclusion of the others.** This records the guard whose absence let `MMT-ADR-0016` (pre-repurpose) carry a lockstep-denying line — removed at its 2026-06-08 repurpose; the instance is resolved, this prevents recurrence. basis: §I.2, §II.2; the 2026-06-07 ROADMAP canon-authorship thread."*
  - done when: `0000` carries the dated invariant; it names the resolved `0016` instance + cites §II.2.

### Close-out

- [x] **T13: Flip ROADMAP Phase I → done + decision-log entry.** In `_wip/identity-foundation/ROADMAP.md`: change the Phase-I row Status `⬜` → `✅` (and the `[ ] I` bullet → `[x]`), add a newest-first decision-log entry summarizing the **I-a / I-b / I-c** outcomes, and write the close handoff `_handoffs/2026-06-08-phase-i-close.md` (pattern of the Phase-H close).
  - done when: ROADMAP reflects Phase I complete (by sub-gate); decision-log entry present; handoff written; **next = Phase J0** (canon-shape scrub + `_wip/`→`docs/canon/` graduation) noted, with the J-split (below) recorded.

---

## Phase J handoff (the J split) — for the next plan, not this one

Phase I delivers only the canon-authorship *rules* (I-c). The estate-wide *application* of those rules is **Phase J, which is being split into four separately-planned sub-phases** so each is independently reviewable:

- **J0 — canon-shape scrub + graduation.** Scrub canon shape/terminology across the identity domain; graduate the 4 ratified domain-canon docs `_wip/identity-foundation/` → `docs/canon/` (per the `MMT-ADR-0000` §I.4 front-of-J amendment); rewrite inbound `_wip/` cites to the `docs/canon/` paths (incl. the carve-out's J(0) citation rewrite and the doc index). Runs first so J1's pointers target final paths.
- **J1 — memory pointers.** Restructure retained `.claude/memory/` entries into provenance-cited pointers into the doc index (extract-before-cleanup); cull the un-linkable-and-unprovenanced.
- **J2 — agent doctrine.** Reduce `CLAUDE.md` / `AGENTS.md` to pointer-layer (drain inlined canon); fold the A-vs-B terminology cleanup sweep (charge / 6-persona / capability split / Path-X / routing supersessions); add the routing-noun glossary entries.
- **J3 — docs-tree conformance.** Conform `docs/` to the `MMT-ADR-0000` §I.4 physical tree (loose root canon → `docs/canon/`; stray artifacts → `assets/` / `_archive/`; near-duplicate dirs consolidated) — per-file decisions required.

**Phase I prepares the rules J obeys; it does not perform any J work.** Any J-flavored cleanup noticed during I execution is recorded as a pointer to the relevant J sub-phase (logged in the T13 handoff's Phase-J worklist), never done inline — mirroring the repo's forward-only interim-governance ratchet (`MMT-ADR-0000` Amendment 2026-06-07 §4).

---

## Verification — per sub-gate

**I-a (legacy anchor cleanup):**
- `rg -c "LEGACY-REVIEW" docs/architecture.md` → **0** (all 5 resolved).
- `rg "Architecture Decision Document" docs/` → **0** (title fixed); `rg "status: 'complete'" docs/architecture.md` → **0** (frontmatter fixed).
- Manual read: each rewritten anchor agrees with `## Identity Foundation`; the banner no longer implies unresolved inline conflicts; no runway-internal IDs (`Path X`, `G-3`, `T3`, bare `inv NN`) introduced; every rewrite keeps an `MMT-ADR-*` / `data-model.md §` cite.

**I-b (identity `ARCH-N` dispositions):**
- `rg "ARCH-8" apps/ packages/` → **0** and `rg "ARCH-9" apps/ packages/` → **0** (citations migrated; comment-only).
- `rg "ARCH-7|ARCH-8|ARCH-9" docs/specs/epics.md` → each carries a terminal disposition (`ARCH-7` stands+note · `ARCH-8` → promoted · `ARCH-9` → superseded).
- `ls docs/adr/MMT-ADR-0017-*` → exists with the 4 standard sections; `rg "MMT-ADR-0017" docs/specs/epics.md docs/architecture.md` → register stamp + canon cross-ref present.
- `nx run api:typecheck` and lint on the 4 touched `services/llm/` files → green; `git diff --stat` shows only comment lines in the 4 `.ts` files (no logic, no integration/unit-test impact).

**I-c (canon-authorship process / guard):**
- `docs/adr/README.md` contains the "How canon is authored" subsection explaining the ADR ↔ canon ↔ ARCH-N relationship and the lockstep entry rule.
- `MMT-ADR-0000` carries the dated "no document is the sole system of record" guard (names the resolved `0016` instance, cites §II.2).
- `architecture.md` no longer calls itself a decision document; its preamble self-identifies it as L1 canon and points to `adr/README.md` for the entry process.

## Self-review (done before declaring the plan ready)

1. **Spec coverage** — **I-a:** 5 anchors → T1–T5, banner → T6; **I-b:** `ARCH-N` → T7–T9b (`ARCH-9` superseded, `ARCH-8` promoted to `MMT-ADR-0017`, `ARCH-7` stands); **I-c:** canon-authorship → T10–T12 (title + preamble + frontmatter, README consolidation, `0000` guard); close → T13. The "Not Phase I" boundary + J-split handoff bound the scope. ✅
2. **Deferred-decision scan** — exact before/after text given for every rewrite; all five open choices closed (D1–D5, resolved 2026-06-08); no TBDs. ✅
3. **Name/type consistency** — `MMT-ADR-0014` is the citation-migration target throughout (T7/T8); `verification_type` is the swapped enum (T4); `person_id`/`profile_id` used consistently with the carve-out. ✅

---

## Decisions (resolved 2026-06-08)

1. **(D1) NFR-coverage Status value (T5)** → **"Defined — § Identity Foundation"** (honest: defined in canon, not yet shipped).
2. **(D2) `ARCH-8` disposition (T9b)** → **promote to new `MMT-ADR-0017`** now (not deferred); absorb-forward the 4 code citations; land the canon partner in lockstep.
3. **(D3) Anti-divergence guard home (T12)** → **amend `MMT-ADR-0000`** + pointer from `adr/README.md` (T11).
4. **(D4) `architecture.md` frontmatter (T10)** → **fix `status` → `'mid-refresh'`** now; leave the rest.
5. **(D5) New title (T10)** → **`# Architecture`**.
