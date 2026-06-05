# LLM Model Selection for Tier Routing — Research Memo

**Date:** 2026-06-05
**Participants:** Jørn (product), Claude (research)
**Status:** Research complete; two decisions open (see end)
**Trigger:** Google Gemini is contractually blocked for EduAgent (GCP Service-Specific Terms §20(d) + Gemini API terms prohibit apps directed at / likely accessed by under-18 end users — verified 2026-06-05, see `.claude/memory/project_google_gemini_vendor_under18_blocked.md`). Current routing uses Gemini as the Family-standard model, so every tier needs a re-pick.

---

## 1. Scope of the research

Compared candidate models on four axes — intelligence, understanding (incl. multilingual), reasoning, price — for the three routing tiers:

| Tier | Usage caps | Initial candidate idea |
|---|---|---|
| Free | 10/day + 100/month | Mistral Small 4 |
| Family / Plus standard | 700/month | Mistral Medium, GPT-5 mini, Haiku 4.5 |
| High rung (escalation, rung ≥ 5) | — | GPT-5 "or similar" |

Data sources: OpenRouter model pages, Artificial Analysis (AA) Intelligence Index, vendor pricing pages. All prices USD per 1M tokens, verified 2026-06-05.

## 2. Market snapshot (June 2026)

Two of the original candidates were stale:

- **GPT-5 (Aug 2025) is superseded.** Current OpenAI line: GPT-5.1 ($1.25/$10), GPT-5.2 ($1.75/$14, the "everyday frontier" pick), GPT-5.5 ($5/$30 flagship, Apr 2026). GPT-5 mini ($0.25/$2) remains current; GPT-5.4 mini ($0.75/$4.50, Mar 2026) is the newer mini.
- **Mistral Medium's latest is still 3.1** (Aug 2025, $0.40/$2). Meanwhile **Mistral Small 4** (Mar 2026, $0.15/$0.60) is newer, bigger (119B), multimodal, reasoning-capable, 262K context — Small/Medium naming no longer tracks capability.

### Full comparison table

| Model | In / Out $/1M | Context | AA Intelligence* | Compliance note |
|---|---|---|---|---|
| Mistral Small 4 | 0.15 / 0.60 | 262K | 19 (non-reasoning mode) | EU vendor — no data transfer at all |
| gpt-oss-120b (via host) | 0.09–0.15 / 0.40–0.60 | 131K | 33 | Apache 2.0 open weights; EU-hostable; **text-only** |
| GPT-5 mini | 0.25 / 2.00 (cache 0.03) | 400K | 41 (reasoning) | OpenAI — ZDR mandatory for minors |
| Mistral Medium 3.1 | 0.40 / 2.00 | 131K | 21 | EU — but dominated (see §3) |
| Grok 4.1 Fast | 0.20 / 0.50 | 2M | 24 (non-reasoning) | xAI safety/brand record problematic for a minors' DPIA |
| Gemini 3.1 Flash / Flash-Lite | 0.10 / 0.40 | 1M | — | **Blocked** — same Google under-18 terms |
| DeepSeek V4 Flash | 0.10 / 0.20 | 1M | unscored | Chinese origin — US/EU host only |
| DeepSeek V4 Pro | 0.435 / 0.87 (cache 0.004) | 1M | 52 | Chinese origin — US/EU host only |
| Kimi K2.6 (Moonshot) | ~0.30 in (via hosts) | 256K | 54 (top open-weight) | Chinese origin — US/EU host only |
| Claude Haiku 4.5 | 1.00 / 5.00 | 200K | n/a (page unavailable) | Anthropic — SCCs+TIA, already integrated |
| GPT-5.1 | 1.25 / 10 | 400K | — | replaces GPT-5 at same price |
| GPT-5.2 | 1.75 / 14 | 400K | — | current escalation sweet spot |
| Claude Sonnet 4.6 | 3.00 / 15 | 1M | — | already integrated (`ANTHROPIC_SONNET_MODEL`) |
| Claude Opus 4.8 / GPT-5.5 | 5 / 25–30 | 1M / 400K | 61 / 60 (AA leaders) | frontier; overkill below rung 5 |

\* AA Index caveat: scores measured in different modes (reasoning vs non-reasoning variants) — directionally comparable, not strictly apples-to-apples.

## 3. Key findings

1. **GPT-5 mini dominates Mistral Medium 3.1** — roughly double the measured intelligence (41 vs 21) at lower input price ($0.25 vs $0.40) and equal output price. Mistral Medium was dropped from consideration.
2. **Per-question cost is negligible at our caps** on every candidate (~$0.0006–0.0015/question → cents per user per month). The deciding axes are envelope-schema reliability, multilingual quality (cs/nb are the risk locales), child-safety tuning, and compliance posture — not sticker price.
3. **Prompt caching reshapes the economics of long tutoring sessions.** OpenAI cached input is $0.03/1M (87.5% off), DeepSeek $0.003–0.004 (99% off) — largely erasing Mistral's headline price edge for multi-turn conversations.
4. **DeepSeek V4 Pro is the best raw intelligence-per-dollar on the market** (AA 52 at $0.435/$0.87) but: (a) DeepSeek's own China-based API is un-passable for minors' data under GDPR Chapter V (no adequacy, TIA vs Chinese national-security law, Italian Garante ban) — only US/EU-hosted open weights are viable; (b) its weak axes (multi-step reasoning, factual recall) are exactly what a tutor leans on; (c) child-safety RLHF unproven; (d) DPIA/brand optics of a Chinese-origin model tutoring EU minors. Kimi K2.6 (AA 54) has the same profile with higher scores — if the Chinese open-weight pool is ever evaluated, evaluate Kimi first.
5. **gpt-oss-120b is the free-tier sleeper** — OpenAI's Apache-2.0 open-weight model: same price as Mistral Small 4, meaningfully smarter (33 vs 19), 2× faster (~330 tok/s), EU-hostable (no transfer, no usage restrictions, no under-18 clause). **Hard limitation: text-only — no image input.**
6. **The image constraint forces per-session routing, not per-message.** Homework photos anchor whole conversations (follow-ups reference the image), so any text-only model can only serve sessions that never contained an image. Verified: our pipeline sends images to LLMs (`apps/api/src/services/llm/providers/openai.ts:65-71` converts `inline_data` parts to vision format). Given the homework-photo GTM wedge, image-anchored sessions may be the majority of free-tier traffic — which weakens the value of a two-model split at launch.
7. **Gemini Flash line inherits the block.** Gemini 3.1 Flash/Flash-Lite would win the budget category on paper ($0.10/$0.40) but Google's under-18 terms apply to the whole Gemini API surface.
8. **xAI (Grok 4.1 Fast) ruled out on safety-governance grounds** — right price, huge context, but the vendor's track record is an avoidable fight in a regulator-facing DPIA for a children's product.

## 4. Routing architecture findings

- The sticky-modality rule (session contains image → multimodal model for the whole session) must live **in our router** — it is app-level knowledge. `router.ts` already routes by rung/tier/provider-policy with circuit breakers and fallback; this is one added session flag, not a new system.
- **OpenRouter** (US broker, ~400 models, OpenAI-compatible API, ZDR + region provider-pinning, ~5% fee) is valuable as a **single experimentation adapter** for evals — one key to A/B gpt-oss-120b, US-hosted DeepSeek, etc. without per-vendor integrations. It is **not** recommended for production minors' traffic: it adds a US middleman processor to the B3 transfer/DPA chain, and reaching Mistral through a US broker is strictly worse than Mistral's own EU endpoint.
- Production = direct vendor APIs (Mistral EU, OpenAI, Anthropic), selected by the in-app router.

## 5. Recommendations

| Tier | Recommendation | Rationale |
|---|---|---|
| **Free** | **Mistral Small 4, single model** | Cheapest credible option; multimodal (covers homework photos with one model); EU-native (cleanest transfer story); reasoning mode available. Revisit gpt-oss-120b text-session split only after real usage data shows the image-vs-text session ratio. |
| **Family / Plus standard** | **GPT-5 mini (workhorse) + Haiku 4.5 (alternative)** — decision open, see §7 | GPT-5 mini wins capability-per-dollar (AA 41 at $0.25/$2 + deep cache discount) but requires the OpenAI-ZDR-for-minors setup. Haiku 4.5 is ~3× output cost but best latency/instruction-following (envelope adherence) and rides the existing Anthropic relationship. Mistral Medium 3.1 dropped (dominated). |
| **High rung (≥ 5)** | **GPT-5.2** or **Claude Sonnet 4.6** | GPT-5.2 replaces the stale "GPT-5" idea. Sonnet 4.6 already wired (`ANTHROPIC_SONNET_MODEL`, router.ts:329). Reserve GPT-5.5 / Opus 4.8 for a future "advanced ceiling" if ever needed. |

## 6. Validation gate (before any model swap ships)

Run `pnpm eval:llm --live` (Tier 2) with each candidate against:

1. **Envelope-signal emission** — `exchangesFlow` / `probesFlow` with `emitsEnvelope`; small Mistral models are historically the flakiest at strict schema adherence.
2. **Conversation-language quality** — especially cs, nb, pl (the under-served locales in our 10-language conversation set).
3. **Child-safety probes** — mandatory for any open-weight or Chinese-origin candidate.
4. **Handwritten-homework / math-notation OCR** for the vision model — public benchmarks do not measure this; use real homework photos.

## 7. Open decisions

1. **Family-tier workhorse:** GPT-5 mini (recommended — capability/$ winner; requires OpenAI ZDR-for-minors configuration) vs Haiku 4.5 (simpler compliance via existing Anthropic stack; better instruction-following; ~3× output cost).
2. **OpenRouter eval adapter:** add now as a fourth, eval-only provider adapter (recommended — unblocks all model A/Bs with one key) vs defer until the free-tier model decision is final.

## 8. Follow-ups

- [ ] Wire OpenRouter eval adapter (if Decision 2 = now).
- [ ] Run the §6 eval matrix for: Mistral Small 4, GPT-5 mini, Haiku 4.5, (optional) gpt-oss-120b, (optional) US-hosted DeepSeek V4 Pro.
- [ ] Replace Gemini-only Family routing in `router.ts` (`LlmProviderPolicy = 'gemini_only'`, `GEMINI_ADVANCED_MODEL_MIN_RUNG`) per the winning picks — separate work item; coordinate with the vendor-block remediation tracked in `project_google_gemini_vendor_under18_blocked.md`.
- [ ] For whichever vendors are selected: Art 28 DPA + ZDR/retention terms review (B3 bucket), and add the model/vendor choice to the DPIA (E5 gate).

---

*Prices and AA Intelligence Index scores verified 2026-06-05 via OpenRouter and artificialanalysis.ai. AA scores are mode-dependent (reasoning vs non-reasoning) — treat as directional.*
