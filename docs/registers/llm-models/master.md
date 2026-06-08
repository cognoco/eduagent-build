# LLM models — interim master (the live vetted set)

> **INTERIM PLACEHOLDER.** This table is the source of truth for the production
> model set **only until the policy-engine database exists** (`MMT-ADR-0013`,
> `MMT-ADR-0014`). It is the **migration target's seed**: it loads directly into
> the policy-engine `allowed_models` table (`MMT-ADR-0015` amendment). It is
> **not canon** — canon points here, never copies these rows.
>
> **Governance:** no row may change without a new immutable record in
> [`vetting/`](vetting/). The current rows were admitted by
> [`vetting/2026-06-06-launch-set-iteration-1.md`](vetting/2026-06-06-launch-set-iteration-1.md).

**Runtime key (3-param, `MMT-ADR-0014`):** `model · service_provider · serving_region`.
A model enters a row only after passing the offline vetting axis (compliance +
capability/quality) recorded in the trail. Switching a model is a row edit; a new
vendor is one adapter file.

## Active set

| Slot / role | Model | Provider · host | Serving region | Applies to | Status | Admitted by |
|---|---|---|---|---|---|---|
| **Primary text** (default everywhere allowed) | gpt-oss-120b `high` | Cerebras | US | all tiers (free/Plus/Family/Pro), all ages | **active** | 2026-06-06 iter-1 |
| **Secondary text — free** (EU-residency *or* Cerebras-unavailable branch) | Mistral Small 4 | Mistral | EU | free | active (fallback) | 2026-06-06 iter-1 |
| **Secondary text — paid** (same branch) | GPT-5 mini `low` | OpenAI | EU-residency deployment; ZDR for minors | Plus / Family / Pro | active (fallback) | 2026-06-06 iter-1 |
| **Vision — free** | Mistral Small 4 | Mistral | EU | free | active | 2026-06-06 iter-1 |
| **Vision — paid** | GPT-5 mini | OpenAI | EU-residency deployment | Plus / Family / Pro | active | 2026-06-06 iter-1 |
| **Interactive deep reasoning** (rungs 4–5) | gpt-5.4 `medium` | OpenAI | EU-residency deployment | Plus / Pro / $15 AI-Upgrade add-on **only** | active | 2026-06-06 iter-1 |
| **Deep reasoning — Family** (rungs 4–5) | gpt-oss-120b `high` | Cerebras | US | Family tier (gpt-5.4 carve-out, owner ruling 2026-06-07) | active | 2026-06-06 iter-1 |
| **Rung 4–5 fallback** | Sonnet 4.6 | Anthropic | — | Plus / Pro / add-on | active (fallback) | 2026-06-06 iter-1 |
| **Async deep jobs** (recaps, curriculum, assessment eval) | gpt-oss-120b `high` | Cerebras | US | all | active (shares primary path) | 2026-06-06 iter-1 |
| **Judge** (envelope evaluator) | Haiku 4.5, non-reasoning | Anthropic | — | all | active | 2026-06-06 iter-1 |

## Dormant

| Slot / role | Model | Provider · host | Status | Activation requires |
|---|---|---|---|---|
| Adult-only deep fallback | DeepSeek V4 Pro, non-reasoning | DeepInfra | **dormant — not pinned** | DeepInfra DPA + Chinese-origin-model paragraph in the DPIA |

## Excluded

| Model | Reason | Nature |
|---|---|---|
| Gemini / Vertex (all variants) | GCP Service Specific Terms §20(d) + Gemini API terms prohibit apps likely-accessed-by under-18; this app plainly is | **Compliance input**, not a choice (see iter-1 record §Compliance). Realized as a prohibition-floor exclusion. Adult-only (verified-18+) eligibility is an open ruling — until ruled, fully excluded. |

## Notes on shape (for the DB migration)

- The age/residency/plan → primary-vs-secondary selection is the **business-rule
  layer** that does not exist yet (`MMT-ADR-0016`). Interim runtime pins gpt-oss as
  the all-tier primary and wires each tier's secondary as the **fallback** target;
  the residency-driven *primary* substitution is a later rule-table addition.
- **No age-based split on the primary path** — under-18 and adult share gpt-oss;
  age changes only the judge *gating mode* and the residency branch, never the
  default model. The only tier carve-out is Family's exclusion from gpt-5.4.
- EU-residency and Cerebras-outage are deliberately **one merged branch** (the same
  secondary serves both).
