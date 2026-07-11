# MMT-ADR-0014 — Router runtime is 3-param; vetting is 4-axis offline; hard split between them

**Status:** Accepted · 2026-06-07 (shape ratified by architect; drafted 2026-06-06; illustrative launch set + vetted rows are DB-mastered in `allowed_models`; seed ratified via walkthrough R-4/R-5) · **Scope:** Identity Foundation — provider-and-model-agnostic router + vetting pipeline + supersession of prior routing canon · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0013 (policy-engine spine), MMT-ADR-0002 (Payer capacity is store-delegated) · **Inputs:** `_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md` §4 + §5 (the 4 router decisions + the vet/route split) + the gemini-minors ZDR research (2026-06-05) + `_wip/identity-foundation/policy-engine-spine-walkthrough/` (the post-walkthrough R-4 ruling) · **Resolves:** the router's *shape* and the prior routing canon's supersession

> **Placement.** L2 ADR; lockstep canon partners are `architecture.md` (the routing section, to be authored in Phase H) + the incubating `data-model.md` (the `allowed_models` table per MMT-ADR-0013's amendment scope). The vetting-research workstream (WP-4) is the operational consumer; this ADR is the *shape* + the supersession of "Family standard = Gemini-only" and the re-spec of GATE-1.

## Context

The pre-A-vs-B routing canon had two pieces that have now been overtaken by events:

- **"Family standard = Gemini-only"** — the ratified routing posture. *Invalidated* by the gemini-minors ZDR research (2026-06-05): the Gemini API's "Age Requirements" prohibit "directed towards or … likely to be accessed by individuals under the age of 18" (a hard 18-floor, no consent-based opt-in); Vertex AI's Generative AI Services are similarly closed to minors per §20(d) of the Google Cloud Service Specific Terms. **Workspace-for-Education Gemini is the only viable Google surface, and is out of scope as a route per the A-vs-B memo §4.6** (kept as a policy-table data point, not a route).
- **GATE-1 minor-routing ("pin 13–17 minors to a papered/ZDR LLM endpoint")** — the ratified minor-routing mechanism. *Re-spec required* — the mechanism needs to be re-expressed: the policy-engine output becomes the eligibility filter, and the papered/ZDR endpoint is a vetted row in the allowed-models table, not a hard-coded routing rule.

Beyond the supersession, the A-vs-B conversation ratified four router-shape decisions (per the memo §4 + §5):

- **4-A reframed: illustrative launch set, not ratified.** The four providers (Anthropic · OpenAI · Mistral · DeepSeek-via-papered-service) are an *example set*; the actual set is the vetting-research workstream's output.
- **4-B B1: 3-param runtime key** (`model · service_provider · serving_region`).
- **4-C C2: age-appropriate is envelope-side, not router-side.**
- **4-D D2: tiered list fallback for v1; scored graph deferred to v2.**
- **4-E reframed: Workspace-for-Education is current read, walkthrough may amend.**
- **§5 A1: hard split between vetting and routing; B1 explicit do-not-do lists, tested.**

This ADR captures the shape + the supersession; the operational details (vetting-pipeline implementation, the populated allowed-models table, the per-cell `allowed-models` table rows with vetting criteria metadata) are the vetting-research workstream's output (WP-4).

## Decision

The router is downstream of the policy engine. The router's runtime is *simple* (3-param key, picking within a vetted set). The vetting pipeline is *separate* (offline, on cadence, emitting the vetted set). The two workstreams are *hard-split* (different code paths, different schemas, different owners; the table schema is the *only* contract between them).

### 1. 3-param runtime / 4-param vetting axis

**Router's runtime key (3 parameters):**

- `model` — the model identifier (e.g., `claude-opus-4-8`, `gpt-5`, `mistral-large-2`).
- `service_provider` — who exposes the API (e.g., `anthropic-direct`, `azure-openai`, `openrouter`, `aws-bedrock`).
- `serving_region` — where the inference runs (e.g., `us-east-1`, `eu-west-1`, `eu-central-1`).

The model-provider is *baked into* the model (Claude is always Anthropic; GPT is always OpenAI; Mistral is always Mistral). Making it explicit at runtime is redundant.

**Vetting pipeline's axis (4 axes, the table schema):**

- `model`
- `provider_via_service` — the provider as reached via the service (e.g., `anthropic-via-azure` vs `anthropic-via-openrouter` are different rows, even though both serve Claude).
- `service` — the service identifier.
- `region` — the region identifier.

The 4th axis (`provider_via_service`) captures that the *same model* can be vetted differently when reached via different services. The runtime key reads 3 of the 4 columns (`model`, `service`, `region`) plus uses the policy-engine-filtered subset.

**Why 3-param runtime, not 4+ (B1 over B2/B3):** the picker picks *within* the vetted set. The vetting pipeline already evaluated "Anthropic-Claude-via-Azure" and "Anthropic-Claude-via-OpenRouter" as different rows. The runtime key only needs to identify the row to pick. Adding runtime axes is the half-migration pattern: the runtime key starts making compliance decisions that should be in the vetting pipeline.

### 2. The flow: vetting → table → engine-filter → router

```
┌─────────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌─────────────┐
│ Vetting pipeline    │    │ allowed_models   │    │ Policy engine    │    │ Router      │
│ (offline, on        │───▶│ table            │───▶│ (per request)    │───▶│ (per        │
│  cadence)           │    │ (the contract)   │    │ (age × residence │    │  LLM call)  │
│                     │    │                  │    │  × knowledge)    │    │             │
└─────────────────────┘    └──────────────────┘    └──────────────────┘    └─────────────┘
        │                          │                        │                       │
   emits rows              read by engine            filters rows          picks within
   with criteria           + read by router          by user cell          filtered set
   metadata
```

The router never sees vetting criteria directly. The router sees a vetted row, filtered by the policy engine's eligibility output. If a row's metadata is "ZDR: false, age-closure: 16+," the router doesn't care — that row has been vetted for the cells where the engine says "this row is allowed." The router's job is to pick *within* the filtered set by complexity, cost, load.

### 3. Hard split: vetting vs. routing (A1)

Vetting and routing are *different code paths*, *different schemas*, *different owners*. The router imports the table; the pipeline emits the table; they share a *contract* (the table schema) and nothing else.

**Why A1 (hard split), not A2 (soft split in same codebase) or A3 (no split):** A2 is the *exact* pattern that produced the PR 376 slip — the new code ships, the old single-flag kill-switch stays, the two layers drift. A1 means the contract is the *table schema*; the two workstreams cannot drift because they don't share code. The cost is bounded: the table schema is a small, stable surface.

**Cadence separation:** the vetting pipeline emits on legal/contractual change (slow cadence). The router reads on every LLM call (fast cadence). Conflating them is the brittleness this decision is designed to prevent.

**Schema-change discipline:** the table schema is the *only* coupling between the two workstreams. Schema changes require both workstreams to coordinate. This is a feature, not a bug — it forces the schema to be the source of truth.

### 4. Fallback shape (D2: tiered list for v1)

Within one cell of the policy matrix, the engine emits an *eligibility set* — the set of `(model, service, region)` tuples that are both (a) vetted and (b) policy-eligible for this user. The router picks *within* that set. On failure (rate limit, transient error), the router falls back to another tuple.

**v1: tiered list.** Per-cell pre-defined tiers (primary → secondary → tertiary) with each tier being a vetted `(model, service, region)` tuple. The router tries tier 1, falls to tier 2 on failure, etc. Compliance is encoded in the tier definition (tier 1 = best compliance + best cost; tier 2 = best cost within compliance; tier 3 = last resort). v1's router is *not* adaptive; tiers are pre-defined.

**v2: scored graph (D3, deferred).** Within one cell, the ladder has branches per (service × region) and per (tenant), and the cost/complexity-vs-compliance scoring is what picks the *path*, not the *node*. v2 layers adaptive scoring on top when the demand emerges.

**v1's tier definitions are populated by the vetting-research workstream (WP-4).** Same artifact as the allowed-models table. The tiers are *data* — when a new `(model, service, region)` becomes vetted, the tier definitions update via a deploy.

**Fail-closed on exhaustion (router error behavior).** When every tier in the eligibility set is exhausted — all tuples failed, or the set is *empty* after policy filtering — the router **fails closed**: it raises `CircuitOpenError` and never falls through to a non-vetted or policy-ineligible model. A compliance-ineligible model is never a fallback target, and an empty eligibility set is a hard stop, not a licence to relax the filter. Concretely, `getFallbackConfig` drops under-18-banned vendors (Gemini/Vertex) and terminates in `CircuitOpenError`, never in an unfiltered default. This is a structural property of the router mechanism (not a per-cell policy), which is why it lives here.

### 5. Do-not-do lists (B1: explicit, tested)

**The router does *not*:**

- **Evaluate ToS, ZDR, log-retention, training-data, or age-closure criteria.** Those are the vetting pipeline's job. The router reads the *output* of the evaluation (the row in the allowed-models table), not the criteria themselves.
- **Reach outside the allowed-models table.** The router's input is the table, not "all models in the world." If a model isn't in the table, the router can't route to it.
- **Decide whether a model is "appropriate" for an age.** That's a *post-generation* check on the *output*, attaching to the **envelope** at `apps/api/src/services/llm/envelope.ts:235-252` (per the original under-13 synthesis Gap B). v1 ships without a strong post-envelope content classifier (Gap B is v1.1 per MMT-ADR-0013 §6's Path X); the model-vendor's refusal + the prompt-layer safety preamble is the v1 safety posture. v1.1 adds the post-envelope classifier.
- **Make compliance decisions at request time.** The router's compliance decisions are *implicit* in the table; the router doesn't *re-evaluate* at runtime.

**The vetting pipeline does *not*:**

- **Make per-request decisions.** The pipeline emits a static table; the engine filters; the router picks.
- **Run at request time.** The pipeline is offline, on cadence.
- **Decide routing for a specific user.** The engine filters by `(age × residence × knowledge)` cell; the router picks within the filtered set.

**B1: explicit do-not-do lists, tested.** Each ADR (MMT-ADR-0013 for the policy engine, MMT-ADR-0014 for the router) carries its own do-not-do list. The lists are *tested* in the integration test suite — e.g., a test that verifies the router does not call a ToS-evaluation function; a test that verifies the vetting pipeline does not import a request-time module. The lists serve as a *code-review checklist* and a *forward-only ratchet* — once shipped, the list grows when new prohibited behaviors are identified, never shrinks.

### 6. Illustrative launch set (4-A reframed)

The launch set is *illustrative*, not ratified in any memo. The four providers are an *example set* representing how the chips may fall:

| Provider | Role | Vetting status (pre-walkthrough) |
|---|---|---|
| **Anthropic (Claude)** | Primary US-domiciled route; minor-safe per usage policy | Open — vetting PoC pending |
| **OpenAI** | Primary US-domiciled route; under-18 ToS nuances (Root-system model spec) | Open — vetting PoC pending |
| **Mistral** | EU-domiciled route (model + serving region) | Open — vetting PoC pending |
| **DeepSeek via papered service** | Cost-effective non-US route; *only* the model weights — vetting is for the service layer | Open — vetting PoC pending |

**The ratified launch set is the vetting-research workstream's output** (WP-4). The memo commits the *shape* (US-primary + EU-primary + cost-effective alt) and the *process*; the workstream commits the *set*. This avoids the "memo commits a launch set that the vetting workstream then has to walk back" anti-pattern.

> **Source of truth.** The live vetted set is **DB-mastered** in `allowed_models` (the vetting pipeline owns it; the C2-B/WP-4 workstream carries the per-row decision trail). The table above is a **point-in-time snapshot, illustrative only** — do not read it as current truth. This ADR records the routing *shape*; the data lives in the DB. Same principle as MMT-ADR-0013 §2.

### 7. Workspace-for-Education: out of scope as a route, current read (4-E reframed)

The gemini-minors ZDR research found that Workspace-for-Education Gemini is the only viable Google surface for a mixed-age AI-tutor product, but the integration shape is unresolved (3/5 confidence). The current read: **Workspace-for-Education is out of scope as a route, kept as a policy-table data point** (the §20(d) under-18-closure-with-education-tenant exception is real and informs the engine, just not a route).

**This is a *current read*, not a locked decision.** The walkthrough's R-1 (parent-operator COPPA), R-2 (regime taxonomy), and R-3 (knowledge axes) may surface reasons to revisit — e.g., if the regime taxonomy carves out a US-district-tenant regime, the engine has to know about it; if the knowledge axes surface a 'tenant-type' dimension, the policy-table data point becomes a route-candidate. **The memo does not pre-empt the walkthrough; this ADR carries the current read and is open to amendment by the walkthrough.**

### 8. Roles are separately routable (tutor vs judge)

The router resolves each **call role** independently against its own eligibility set: the **tutor** call (the learner-facing prose generation) and the **judge** call (the post-generation envelope evaluator) are distinct routing requests, each picking its own `(model, service, region)` row. This is a router *capability* — it is what makes vendor-independence between roles **enforceable**. Whether that independence is *required* (the judge must not share a vendor with the tutor) and the judge's non-reasoning constraint are **safety/judge-architecture policy**, and live in MMT-ADR-0016, not here. The division is the same mechanism-vs-policy line this ADR draws throughout: 0014 owns the mechanism (roles are separable; the engine *can* keep them on different vendors), MMT-ADR-0016 owns the policy (they *must* be kept independent).

*(The terms `tutor` and `judge` are glossed inline here pending their formal definition in canon — tracked on the Phase-J / canon-authorship to-do.)*

## Supersession

- **Prior "Family standard = Gemini-only" canon:** **SUPERSEDE.** Invalidated by the gemini-minors ZDR research. The architecture cannot be "use whatever model is best" because the model *and* the service *and* the region are each a compliance axis. Workspace-for-Education is out of scope as a route per §7.
- **Prior GATE-1 minor-routing ("pin 13–17 minors to a papered/ZDR LLM endpoint"):** **SUPERSEDE.** Re-spec: the policy-engine output (MMT-ADR-0013's eligibility filter) becomes the *mechanism*; the papered/ZDR endpoint is a vetted row in the allowed-models table, not a hard-coded routing rule. The minor-routing *posture* (papered/ZDR endpoints for minors) is preserved; the *mechanism* (hard-coded routing) is replaced.
- **MMT-ADR-0002 (Payer capacity is store-delegated):** **CONFIRM.** The store is the merchant of record; the Payer field is a sub field per the A-vs-B memo §1.4 + MMT-ADR-0013 §6's amendment scope. The router doesn't *create* the Payer field; it just routes LLM calls within the policy-engine-filtered subset.
- **MMT-ADR-0013 (policy-engine spine):** **CONFIRM.** The router is downstream of the policy engine. The engine's eligibility output is the *input* to the router. The two ADRs are layered: 0013 = the engine, 0014 = the router.

## Data-model primitives

This ADR requires the following additions to the MMT-ADR-0013 data-model amendment scope:

| Table | Columns | Why |
|---|---|---|
| `allowed_models` | `(model, provider_via_service, service, region, criteria_metadata jsonb, tier ENUM('primary', 'secondary', 'tertiary') DEFAULT 'primary')` UNIQUE | The vetting pipeline output. The table schema is the *only* contract between vetting and routing. The `tier` column is the v1 fallback shape (D2). |

The `criteria_metadata` jsonb stores the vetting-pipeline output for each cell — ToS closure status, ZDR availability, log-retention posture, training-data use, age-closure clause. The router reads the row but not the metadata; the metadata is for audit + for explaining refusals.

The detailed migration SQL is out of scope for this ADR (that is the `data-model.md` lockstep with MMT-ADR-0013).

## Consequences

- **The table schema is the *only* contract between vetting and routing.** Schema changes require both workstreams to coordinate. The cost of the hard split is bounded: small, stable surface.
- **The vetting-research workstream is a separate workstream (WP-4).** Inputs: the locked R-2 regime taxonomy + the locked R-5 illustrative launch set. Outputs: per-cell `allowed_models` table rows with vetting criteria metadata. Cadence: regulatory, not engineering. Orchestrated under the identity-foundation roadmap.
- **The fallback ladder is tiered for v1, scored for v2.** v1's router is not adaptive; tiers are pre-defined. v2 layers adaptive scoring on top when the demand emerges.
- **The do-not-do lists are tested.** The integration test suite enforces the lists; the lists are a forward-only ratchet.
- **The illustrative launch set is illustrative, not ratified.** The actual set is the vetting-research workstream's output. The memo commits the *shape*; the workstream commits the *set*.
- **Workspace-for-Education is out of scope as a route.** The §20(d) under-18-closure-with-education-tenant exception is real and informs the engine, just not a route. v2 may add the integration if a district asks.
- **The 3-param runtime key is simple.** The picker picks within the vetted set. Adding runtime axes is the half-migration pattern; rejected.
- **Age-appropriate is envelope-side, not router-side.** The router picks the model; the model (or the envelope) is responsible for content-level concerns.
- **The router fails closed.** On eligibility-set exhaustion (all tiers failed, or an empty set after policy filtering) it raises `CircuitOpenError`; a non-vetted or policy-ineligible model is never a fallback target (§4).
- **Tutor and judge are separately-routable roles** (§8). The *requirement* that the judge stay vendor-independent of the tutor — and that it run non-reasoning — is MMT-ADR-0016 (safety/judge architecture), enforced on top of this routing capability.

## Alternatives considered

1. **4-param runtime router key (B2).** Rejected — model-provider is implicit in the model row. Redundant at runtime.
2. **5+ param runtime router key (B3).** Rejected — half-migration pattern. The runtime key starts making compliance decisions that should be in the vetting pipeline.
3. **Soft split between vetting and routing (A2, same codebase).** Rejected — the PR 376 slip pattern. A1 hard split means the two workstreams cannot drift.
4. **No split (A3).** Rejected — vetting and routing have different cadences, different owners, different concerns. Conflation is the brittleness this decision is designed to prevent.
5. **Scored graph fallback ladder (D3) for v1.** Rejected for v1 — engineering cost is high. v2 layers adaptive scoring on top.
6. **Hard-coded "Gemini for family" routing.** Rejected (SUPERSEDED) — Gemini is contractually closed to minors.
7. **Hard-coded GATE-1 minor-routing.** Rejected (SUPERSEDED) — replaced by the policy-engine eligibility filter + vetted rows in the allowed-models table.
8. **Workspace-for-Education as a v1 route.** Rejected (current read; walkthrough may amend) — integration shape is unresolved (3/5 confidence); district-sales motion and FERPA overlay are not in v1 scope.
9. **Engineering populates the allowed-models table (C2-A).** Rejected — the table is *data*, populated by the vetting-research workstream, not by engineering. Same separation-of-concerns move as MMT-ADR-0013 §5.
10. **Engine populates the allowed-models table (sibling to the policy tables).** Rejected — the engine reads the table; the table is populated by the *vetting* workstream, not the engine. Conflation would re-couple the two workstreams the hard split separates.

## What this ADR does *not* decide

- The walkthrough's R-4 ruling (which ratifies the inline runtime key + the fallback shape) and R-5 (which ratifies the illustrative launch set as a *shape*, not a *set*). Those are the walkthrough's output, not this ADR's.
- The VetOps details — what the ZDR verification looks like, what the audit log entries contain, what the integration test coverage is. Those are implementation details, not shape.
- The MMT-ADR-0013 amendment scope's migration SQL. The amendment *scope* is in MMT-ADR-0013; this ADR adds the `allowed_models` table to that scope.
- The router ADR's runtime implementation (the actual code in `apps/api/src/services/llm/router.ts`). This ADR is the *shape*; the implementation is post-walkthrough.
- The Workspace-for-Education walkthrough amendment (if any). Per §7, this ADR is open to amendment by the walkthrough's R-1 / R-2 / R-3 rulings.

## Implementation status

**2026-07-11 — prod cutover executed (WI-1685).** `LLM_ROUTING_V2_ENABLED=true` in production, alongside `JUDGE_FRAMEWORK_ENABLED`/`JUDGE_ENFORCEMENT_ENABLED` (WI-1686) — the Gemini/Vertex exclusion (§7, Supersession) and the 3-param runtime key (§1) are now live on production traffic, not just staged behind the flag. Staging validation evidence (routing confirmation across all live-LLM quality gates, systematic-vs-legacy-baseline A/B isolating pre-existing content drift from routing-caused regressions, provider/latency spot-check): WI-1685. Current model set + open safety gates: `docs/registers/llm-models/master.md`.
