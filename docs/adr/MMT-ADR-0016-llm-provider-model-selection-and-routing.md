# MMT-ADR-0016 — LLM provider/model selection and the routing rule table (Gemini exit)

**Status:** Accepted · **Date:** 2026-06-06 (last revised 2026-06-07) · **Scope:** All production LLM calls · **Deciders:** PM (owner) + Claude · **Supersedes:** the `gemini_only` Family-tier routing policy in `router.ts`

> **Lockstep:** this ADR is the *why* **and the canonical record of the decision** (ADRs are the decision system of record — there is no `architecture.md` register to sync). The *what* (concrete pinning) lives in `docs/specs/2026-06-06-llm-routing-and-judge-architecture.md` (§1.5); the model-selection evidence in `docs/meetings/2026-06-05-llm-model-selection-research-memo.md` (§6 results — the memo's §7 pinning tables are superseded evidence-stage picks, retained as evidence only); the Thread B build spec is `docs/specs/2026-06-06-llm-routing-gpt-oss-cerebras-build.md`.

## Context

Google Gemini — the current default LLM pool across every routing tier — is contractually unusable for under-18 end users: GCP Service Specific Terms §20(d) and the Gemini API terms both prohibit apps "directed towards or likely to be accessed by" under-18 end users (verified raw-text 2026-06-05; see `.claude` memory `project_google_gemini_vendor_under18_blocked`). Because this app plainly is likely-accessed-by-minors (child/family profiles), every tier needs a re-pick, and the re-pick must hold under three constraints that no prior selection process enforced together:

1. **Latency** — production runs on Cloudflare Workers with a ~25s wall; reasoning-heavy configs routinely exceed it.
2. **Compliance** — minors' conversation text is in scope; lawful processing requires a transfer mechanism (DPF or SCCs+TIA), which rules out Chinese-hosted inference entirely and the Gemini vendor specifically (for the under-18 audience).
3. **Small-locale prose quality** — cs/nb/pl learners read tutor prose directly; wrong-language or broken-grammar replies are a visible product failure that only an independent language judge catches.

Five candidates were evaluated in their **exact production configurations** (model slug, reasoning effort, pinned host) through the eval harness §6 gate: safety battery, exchanges core, language-quality judge, and reasoning-mode latency probes. Live pricing was re-verified against OpenRouter's endpoint API on 2026-06-06.

## Decision

Adopt the pinning matrix below (full table + per-slot evidence in spec §1.5, eval evidence in memo §6). Model choice is expressed as a **declarative routing rule table** (spec §1), matched on flow/language/rung/tier/capability; switching a model is a row edit, a new vendor is one adapter file. No model enters a row until it passes the harness in its exact production config (spec §1.4 admission gate).

**Roles:**

- **Primary text — all tiers (free, Plus, Family, Pro), all ages, the default everywhere allowed: gpt-oss-120b @ Cerebras `high`.** Validated for safety (44/44 battery + 100× jailbreak resample, 0 compliances + 5/5 multi-turn adversarial), teaching (55/55), latency (p50 1.3s / p95 2.8s, 0-over-wall), and language (~98% in-language as-is across all 9 conversation locales, 0/270 with a belt-and-braces directive). Cheaper-or-equal to Mistral and materially smarter — the reason it is the universal default rather than a confined async model.
- **Secondary text — used when the business-rule layer routes away from US-hosted Cerebras** (EU-residency required *or* Cerebras unavailable — one merged branch), tier-split:
  - **Free → Mistral Small 4** (EU-hosted, zero transfer paperwork).
  - **Paid (Plus / Family / Pro) → GPT-5 mini @ `low`** (OpenAI; EU-residency deployment for the EU branch; ZDR mandatory for minors).
- **Vision: free → Mistral Small 4; paid → GPT-5 mini.** gpt-oss is text-only, so each tier's secondary also handles its images.
- **Interactive deep reasoning (rungs 4–5): gpt-5.4 @ `medium` for Plus / Pro / the $15 AI-Upgrade add-on only.** The **Family tier has no access to gpt-5.4** (owner ruling 2026-06-07) — Family's rungs 4–5 stay on gpt-oss-120b @ Cerebras `high`. Free never escalates to a premium model.
- **Rung 4–5 fallback: Sonnet 4.6** (incumbent, vendor diversity).
- **Async deep jobs (recaps, curriculum, assessment eval): gpt-oss-120b @ Cerebras `high`** — shares the primary text path.
- **Judge: Haiku 4.5, non-reasoning** — vendor-independent of the tutor; reasoning mode banned (breaks JSON envelopes).
- **Dormant adult-only fallback: DeepSeek V4 Pro non-reasoning @ DeepInfra** — not pinned.

**Business-rule layer.** The age/residency/plan → model mapping that selects primary-vs-secondary is **not built yet**. Until it lands, `getModelConfig` pins gpt-oss as the all-tier primary and wires each tier's secondary as the **fallback** target; the residency-driven *primary* substitution is a later rule-table addition. EU-residency and Cerebras-outage are deliberately one branch (the same secondary serves both).

**No age-based split on the primary path.** Under-18 and adult share gpt-oss as the everyday model; age changes only the judge *gating mode* (spec §3) and the residency branch, never the default model. The only tier-based model carve-out is Family's exclusion from gpt-5.4.

**No app-owned word denylist** (spec §2.0). Safety is decided by judgment of handling, not token matching — the danger line runs through the word ("what poppy seeds produce" vs "how to extract opium"). Over-blocking a legitimate question is a hard failure, equal in weight to under-blocking.

## Consequences

- The `gemini_only` `LlmProviderPolicy` and `GEMINI_ADVANCED_MODEL_MIN_RUNG` in `router.ts` are superseded and removed when the routing table lands (spec rollout phase 6). Until then Gemini stays the runtime default — this ADR ratifies the *target*; the migration is staged behind `LLM_ROUTING_V2_ENABLED`.
- **Single-host concentration on Cerebras is the one residual risk** on the primary path — mitigated by the automatic per-tier secondary (free→Mistral, paid→GPT-5 mini), not by confining gpt-oss. gpt-oss is text-only, so vision always lands on the secondary.
- **gpt-oss serves under-18 paid traffic**, filling the Family-tier hole the Gemini exit left. This makes the Cerebras compliance triplet a launch gate for minors (below).
- **Cerebras cannot become a single vendor** (web-verified 2026-06-06, memory `project_cerebras_vendor_posture`): it serves open-weight models only — GPT-5 mini, gpt-5.4, and Claude are not available there. Its compliance triplet (ZDR + no-training + executed DPA) is *likely achievable* (ZDR/no-train are its advertised default; DPA/SCCs/SOC 2 in its Trust Center) but US-only datacenters keep it on the SCCs+TIA route. Owner ruling: keep separate agreements with the other vendors; Cerebras dedicated-endpoints / self-host parked as a future option.
- **DeepSeek V4 Pro is dropped from launch**, kept only as a dormant adult-only fallback row. Its price advantage was the Chinese first-party API (unusable); the cheapest lawful US host (DeepInfra, $1.30/$2.60, no cache discount) is ~5× GPT-5 mini's input price, and reasoning mode misses the 25s wall. No EU host exists. Activation requires a DeepInfra DPA + a Chinese-origin-model paragraph in the DPIA.
- **Compliance follow-ups owed (B3 bucket + E5 DPIA gate):** Cerebras triplet (ZDR-in-DPA text, SCCs+TIA); OpenAI ZDR-for-minors (covers the paid secondary + gpt-5.4); Art 28 DPAs + ZDR/retention review for OpenAI / Anthropic / Mistral; record the model/vendor choices in the DPIA.
- **Build gates (Thread B):** direct Cerebras adapter (`{"type":"refusal"}`→safe-envelope handler + unit test) + direct Mistral adapter + compliance-aware `getFallbackConfig` that drops Gemini/Vertex (under-18-banned) and fails closed to `CircuitOpenError`; OpenAI adapter taught `gpt-5-mini` + `reasoning_effort`. Teaching-quality A/B (gpt-oss vs GPT-5 mini at paid rungs 1–3) before the flag flip.

## Open ruling — adult-only (verified 18+) Gemini eligibility

The Gemini/Vertex block is written at the *under-18* level, so adults are not *per se* excluded. **However**, the GCP terms test is *app-audience* level — "directed towards or likely to be accessed by under-18" — and this app is plainly likely-accessed-by-minors. Whether adult-only routing *inside a mixed-audience app* survives that test is an unresolved legal question, and any "Gemini for adults" path additionally requires robust 18+ age assurance. **Until ruled, Gemini/Vertex stays fully excluded** (the matrix and `FALLBACK_FORBIDDEN` ban it unconditionally). If permitted, the ban becomes age-conditional (banned under-18, allowed for verified-18+) and a Gemini row is added for the adult segment — a follow-up amendment, not assumed here.

## Alternatives considered

1. **Keep Gemini for everyone** — rejected, contractually prohibited for under-18 end users (the whole reason for this ADR). Adult-only Gemini is a separate open ruling (above).
2. **Confine gpt-oss to async only** (its originally-evaluated role) — rejected: the "wrong-language to small-locale learners" finding that justified confinement was a harness artifact (the candidate eval path bypassed `routeAndCall`, omitting the production language preamble `getPersonalizationPreamble`, `router.ts:236-243`); with the preamble, gpt-oss is ~98% in-language. Harness bug fixed (`withSafetyPreamble` exported + applied; regression test `apps/api/eval-llm/runner/llm-client.test.ts`, break-test verified). The N=1 jailbreak flake cleared on 100× resample (a benign `{"type":"refusal"}` envelope-format slip on refusals, ~1%; the direct adapter normalizes it). Single-host risk is handled by the per-tier secondary, not confinement.
3. **GPT-5 mini as the paid primary** (an earlier evidence-stage pick) — superseded: gpt-oss is cheaper-or-equal, measurably smarter, and validated across every axis. GPT-5 mini is retained as the paid secondary + vision handler, where its closed-model vision and EU-residency deployment are exactly what the secondary needs.
4. **Mistral as the free-tier *primary*** (an earlier evidence-stage pick) — superseded: free now defaults to gpt-oss like every other tier; Mistral drops to the free secondary (EU-residency + outage) + free vision. "Drop Mistral entirely" remains rejected — it is needed for the EU-residency free branch.
5. **Age-split routing (different everyday models for adults vs minors)** — rejected as unnecessary: the everyday model is gpt-oss for both; age drives only the judge gating mode and the residency branch. (Tier does carve out one row: Family is excluded from gpt-5.4.)
6. **gpt-5.5 as the deep-reasoning model** — rejected: $5/$30 is 2× gpt-5.4 for no measured quality gain; kept as a rotation candidate only.
7. **A keyword/topic denylist for safety** — rejected: the dual-use line runs through the word, so token matching is guaranteed wrong in one direction and is the mechanism that produces spurious "I can't answer that" refusals.
