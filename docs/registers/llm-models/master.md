# LLM models — the guiding doc (which model, where, and why)

> **Read this first for any LLM-routing question.** This is the single
> source of truth for the production model set: *which model serves which
> tier / age / region, and why.* It replaces the prior scatter of ad-hoc
> routing memos and design specs (consolidated 2026-06-23). The *why* behind a
> contested pick lives in the linked ADR; the *evidence* a model was admitted
> on lives in [`vetting/`](vetting/); this table is the *what*.

> **INTERIM PLACEHOLDER for the migration target.** This table is the source of
> truth **only until the policy-engine database exists** (`MMT-ADR-0013`,
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

> ## ⚠️ Live status — the table below is the TARGET, not yet what serves traffic
>
> The whole redesign (gpt-oss primary, Gemini ban, Cerebras/Mistral adapters)
> is **built but inert behind the `LLM_ROUTING_V2_ENABLED` config flag**, which
> is **unset → `false` in both staging and production** (Doppler-verified
> 2026-06-23). While the flag is off, the **legacy path still selects Gemini as
> the universal primary** — so the table below, and the Gemini exclusion, are
> **not yet enforced in running code**. Making them true = the V2 cutover (keys
> present + flag flip; see *Cutover* under Open gates). Infra detail:
> `.claude/memory/project_llm_routing_infra_built_behind_flag.md`.

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
| **Judge** (envelope evaluator) | **Sonnet 4.6 non-reasoning — retained.** T10 bake-off resolved 2026-07-11: Haiku 4.5 and GPT-5-mini (minimal reasoning) failed the judgment axis (CGR02 misconception mislabeled `partial`); GPT-5-mini (default reasoning) was clean on both axes but rejected on latency (~12.9s/call vs the 25s Workers wall); Sonnet 4.6 retained as the only candidate both axis-clean AND within the latency budget. No `GRADER_MODEL` change. Post-launch N=3-5 reevaluation tracked as WI-1799. | Anthropic | — | all | **Callable for grader flow** (`CHALLENGE_ROUND_GRADER_ENABLED`); first tier/age-blind `capability: 'judge'` routing path — see ADR Amendment 2026-06-26. Suitability judge adopts same capability next. | [`2026-07-11 T10 bake-off`](vetting/2026-07-11-challenge-grader-bakeoff.md) |

**Roles in one line:** gpt-oss is everyone's default text brain. When the
business-rule layer routes away from US-hosted Cerebras — EU-residency required
*or* Cerebras unavailable (one merged branch) — each tier falls to its secondary:
**free → Mistral, paid → GPT-5 mini**, and that same secondary also handles the
tier's **vision** (gpt-oss is text-only). gpt-5.4 is the deep-reasoning model for
paying non-Family users; the judge runs on the eval-selected model (default Sonnet 4.6, see row above). The judge is **vendor-independent of the
tutor and always non-reasoning** (an evaluator sharing the tutor's vendor shares
its blind spots; reasoning mode breaks the JSON envelope — `MMT-ADR-0016` §2).

## Region axis — Europe vs Rest (binary; **not built yet**)

The residency dimension is a **binary axis**, ruled 2026-06-23:

- **Europe** = EU/EEA **+ UK** (UK folded into the stricter group; anything
  ambiguous defaults to Europe). → EU-hosted models, no third-country transfer.
- **Rest of World** = everywhere else. → gpt-oss-120b @ Cerebras (US).

The **design-intent** primary-text map once the region-aware rule layer exists:

| Region | Free tier | Paid tier |
|---|---|---|
| **Europe** (EU/EEA + UK) | Mistral Small 4 (EU) | GPT-5 mini (EU-residency) |
| **Rest of World** | gpt-oss-120b @ Cerebras (US) | gpt-oss-120b @ Cerebras (US) |

> **NOT BUILT.** The age/residency/plan → primary-vs-secondary selection is the
> business-rule layer that does not exist yet (`MMT-ADR-0016`). Interim runtime
> pins gpt-oss as the all-tier primary for **everyone** (`V2_SERVING_REGION_PLACEHOLDER='global'`)
> and wires each tier's EU secondary only as the **fallback** target — so all
> traffic, EU included, currently resolves to Cerebras-US on the primary path.
> This is acceptable for launch **only if** the Cerebras compliance triplet
> (SCCs + TIA) lawfully covers the EU→US transfer (see Open gates). The
> residency-driven *primary* substitution is a later rule-table addition.

## Dormant

| Slot / role | Model | Provider · host | Status | Activation requires |
|---|---|---|---|---|
| Adult-only deep fallback | DeepSeek V4 Pro, non-reasoning | DeepInfra | **dormant — not pinned** | DeepInfra DPA + Chinese-origin-model paragraph in the DPIA |

## Excluded

| Model | Reason | Nature |
|---|---|---|
| Gemini / Vertex (all variants) | GCP Service Specific Terms §20(d) + Gemini API terms prohibit apps likely-accessed-by under-18; this app plainly is | **Compliance input**, not a choice (see iter-1 record §Compliance). **Owner ruling 2026-06-23: excluded for EVERYONE, age-independent** — the previously-open "adult-only (verified-18+) lane" question is CLOSED = fully excluded. Realized as a `FALLBACK_FORBIDDEN={gemini,vertex}` prohibition-floor exclusion (V2 only). See [`project_google_gemini_vendor_under18_blocked`](../../../.claude/memory/project_google_gemini_vendor_under18_blocked.md). |
| All Chinese hosts · Haiku-reasoning (breaks JSON) · GPT-5 mini ≥ medium + DeepSeek-reasoning interactive (latency) · gpt-5.5 default (price) | per iter-1 record | capability / latency / price exclusions |

## Notes on shape (for the DB migration)

- **No age-based split on the primary path** — under-18 and adult share gpt-oss;
  age changes only the judge *gating mode* and the residency branch, never the
  default model. The only tier carve-out is Family's exclusion from gpt-5.4.
- EU-residency and Cerebras-outage are deliberately **one merged branch** (the
  same secondary serves both).
- A model enters a rule row only after passing the eval harness
  (`pnpm eval:llm --live`) in its **exact production configuration** — same model
  slug, same `reasoningEffort`, same pinned host — across the safety battery,
  exchanges core, and (for small locales) the language-quality judge flow.

## Open gates (before the V2 cutover serves minor traffic)

The layered safety model (① input sanitization → ② router safety preamble →
③ provider classifiers → ④ structured envelope → ⑤ offline evals) is canon under
`MMT-ADR-0016`. These are the **still-open** operational gates lifted from the
2026-06-05 safety audit; H1/H2/H3 are **closed** on `ongoing` (Gemini block-reason
leak mapped terminal; crisis-redirect now emits a structured Inngest event;
adversarial safety battery wired into `eval-llm`).

| Gate | What's owed | Why it's open now |
|---|---|---|
| **H4 — provider safety net** | The judge (layer ③ replacement) must be live before flag-flip. Removing Gemini deletes the only configured provider-side classifier; OpenAI is detection-only, Anthropic/Cerebras/Mistral are prompt-only. | **Partially advanced (2026-06-26):** a tier/age-blind `capability: 'judge'` routing path is now callable for the grader flow (`CHALLENGE_ROUND_GRADER_ENABLED`). The judge is no longer scaffold-only. H4 remains open until the judge is on in production ahead of the V2 minor-traffic cutover. Suitability judge adopts the same capability next, completing H4. |
| **H5 — output moderation** | A final output-content check (moderation pass or lightweight classifier) on the displayed reply. | Deferrable while Gemini's classifier guarded the main lane; **launch-relevant once Gemini is removed**. Scope after the judge lands. |
| **H7 — safety observability** | A queryable safety-incident metric/dashboard (blocks per day, crisis redirects per week). | Crisis-redirect events now fire (H2); the aggregate dashboard does not exist yet. |
| **Self-harm escalation** | **Ruled 2026-06-23: log-only.** Crisis redirect → structured `app/safety.crisis_redirect_fired` Inngest event (already shipped); **no guardian notification.** Option (b) guardian-notify is not foreclosed but is not being built. | Settled — no further decision owed; H7 dashboard surfaces these events. |
| **Cutover contracts** | Cerebras compliance triplet (ZDR + no-training + executed DPA with ZDR in the text; SCCs + TIA, Cerebras US-only); OpenAI ZDR-for-minors (covers GPT-5 mini secondary + gpt-5.4); Art 28 DPAs. | Counsel/vendor work; gate the flag-flip for minor traffic, not the code. |

**Cutover** (when gates clear): keys (`CEREBRAS_API_KEY`, `MISTRAL_API_KEY`) are
**present** in stg + prd (Doppler-verified 2026-06-23); flip
`LLM_ROUTING_V2_ENABLED=true` (stg → validate → prd), then remove
`GEMINI_API_KEY` as defense-in-depth. No code deploy needed for the flag flip.
Run the safety battery against the cutover models first.

**Dependency added 2026-06-26:** `LLM_ROUTING_V2_ENABLED` **must not flip on for minor traffic until `CHALLENGE_ROUND_GRADER_ENABLED=true` is also set and staging-validated.** Without the grader, mastery silently never verifies on the V2 tutor path (gpt-oss-120b returns `[]` for `challenge_round_evaluation`). The fail-safe behavior (empty → no mastery, no error) is correct for the flag-off state but is a silent regression at cutover.
