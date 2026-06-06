# MMT-ADR-0013 — LLM provider/model selection and the routing rule table (Gemini exit)

**Status:** Accepted · **Date:** 2026-06-06 · **Scope:** All production LLM calls · **Deciders:** PM (owner) + Claude · **Supersedes:** the `gemini_only` Family-tier routing policy in `router.ts`

> **Lockstep:** this ADR is the *why*; the *what* it ratifies lives in `docs/specs/2026-06-06-llm-routing-and-judge-architecture.md` (§1.5 ratified pinning) and the model-selection evidence in `docs/meetings/2026-06-05-llm-model-selection-research-memo.md` (§6 results, §7 resolution). `docs/architecture.md` (ARCH-9 routing) sync is owed by the routing-table implementation PR (follow-up below).

## Context

Google Gemini — the current default LLM pool across every routing tier — is contractually unusable: GCP Service Specific Terms §20(d) and the Gemini API terms both prohibit apps "directed towards or likely to be accessed by" under-18 end users (verified raw-text 2026-06-05; see `.claude` memory `project_google_gemini_vendor_under18_blocked`). Every tier needs a re-pick, and the re-pick must hold under three constraints that no prior selection process enforced together:

1. **Latency** — production runs on Cloudflare Workers with a ~25s wall; reasoning-heavy configs routinely exceed it.
2. **Compliance** — minors' conversation text is in scope; lawful processing requires a transfer mechanism (DPF or SCCs+TIA), which rules out Chinese-hosted inference entirely and the Gemini vendor specifically.
3. **Small-locale prose quality** — cs/nb/pl learners read tutor prose directly; wrong-language or broken-grammar replies are a visible product failure that only an independent language judge catches.

Five candidates were evaluated in their **exact production configurations** (model slug, reasoning effort, pinned host) through the eval harness §6 gate: safety battery, exchanges core, language-quality judge, and reasoning-mode latency probes. Live pricing was re-verified against OpenRouter's endpoint API on 2026-06-06.

## Decision

Adopt the pinning matrix (full table + per-slot evidence in spec §1.5 and memo §7):

- **Free tier + default (rungs 1–3): Mistral Small 4**, no reasoning — cheapest, EU-hosted (zero transfer paperwork), most reliable transport, has vision.
- **Paid workhorse (rungs 1–3): GPT-5 mini @ `low` effort** — the only candidate flawless everywhere including cs/nb/pl prose, inside the wall at 9–13s. OpenAI ZDR mandatory for minors.
- **Interactive deep reasoning (rungs 4–5): gpt-5.4 @ `medium`** — the only big model doing real reasoning inside the 25s wall (11–17s), undercutting Sonnet; already the configured `OPENAI_ADVANCED_MODEL`.
- **Rung 4–5 fallback: Sonnet 4.6** (incumbent, vendor diversity).
- **Async deep jobs (recaps, curriculum, assessment eval): gpt-oss-120b @ Cerebras `high`** — full reasoning in ~2s at $0.35/$0.75; confined to async (see Consequences).
- **Judge: Haiku 4.5, non-reasoning** — vendor-independent of the OpenAI tutor; reasoning mode banned (breaks JSON envelopes).
- Model choice is expressed as a **declarative routing rule table** (spec §1), matched on flow/language/rung/tier/capability; switching a model is a row edit, a new vendor is one adapter file. No model enters a row until it passes the harness in its exact production config (spec §1.4 admission gate).

**No age-based model split.** Every interactive winner is OpenAI regardless of age, so under-18 and adult share the same models; age changes only the judge *gating mode* (spec §3), never the model.

**No app-owned word denylist** (spec §2.0). Safety is decided by judgment of handling, not token matching — the danger line runs through the word ("what poppy seeds produce" vs "how to extract opium"). Over-blocking a legitimate question is a hard failure, equal in weight to under-blocking.

## Consequences

- The `gemini_only` `LlmProviderPolicy` and `GEMINI_ADVANCED_MODEL_MIN_RUNG` in `router.ts` are superseded and removed when the routing table lands (spec rollout phase 6). Until then, Gemini stays the runtime default — this ADR ratifies the *target*, the migration is staged.
- **gpt-oss-120b is confined to async, not promoted to it.** Two failures are fatal interactively but absorbable in async (where output is validated/regenerated before display): it answered Polish/Norwegian learners in English (language-quality hard fail), and its envelope JSON is host-dependent (clean only on Cerebras → single-supplier concentration risk). Also text-only, and one unexplained N=1 jailbreak flake. Promotion path: fix small-locale wrong-language + add a second verified host (Nebius EU is a candidate) + more jailbreak sampling.
- **DeepSeek V4 Pro is dropped from launch**, kept only as a dormant adult-only fallback row. Its price advantage was the Chinese first-party API (unusable); the cheapest lawful US host (DeepInfra, $1.30/$2.60, no cache discount) is ~5× GPT-5 mini's input price, and reasoning mode misses the 25s wall. No EU host exists for it. Activation requires a DeepInfra DPA + a Chinese-origin-model paragraph in the DPIA.
- **Compliance follow-ups owed (B3 bucket + E5 DPIA gate):** Art 28 DPAs + ZDR/retention review for OpenAI and Anthropic; OpenAI ZDR-for-minors configuration; record the model/vendor choices in the DPIA.
- `docs/architecture.md` ARCH-9 routing section update is owed by the routing-table implementation PR (lockstep completion).

## Alternatives considered

1. **Keep Gemini** — rejected, contractually prohibited for under-18 end users.
2. **Age-split routing (DeepSeek for adults, OpenAI for minors)** — rejected as unnecessary: the interactive winner is OpenAI for both, so the split added compliance surface (Chinese-origin DPIA, residency routing) for no benefit.
3. **gpt-oss-120b on the interactive path** (cheapest reasoner) — rejected for now: wrong-language to small-locale learners + single-host dependency are unacceptable on the latency-/uptime-sensitive path. Re-examinable via the promotion path above.
4. **gpt-5.5 as the deep-reasoning model** — rejected: $5/$30 is 2× gpt-5.4 for no measured quality gain; kept as a rotation candidate only.
5. **A keyword/topic denylist for safety** — rejected: the dual-use line runs through the word, so token matching is guaranteed wrong in one direction and is the mechanism that produces spurious "I can't answer that" refusals.
