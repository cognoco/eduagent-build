# Vetting record — LLM launch set, iteration 1 (Gemini-exit re-pick)

**Register:** llm-models · **Change:** initial population of the vetted set across
all tiers · **Date of vetting:** 2026-06-06 · **Deciders:** PM (owner) + Claude ·
**Status:** complete · **Record stamp:** `reconstructed 2026-06-08` (written
after-the-fact from `MMT-ADR-0016` and the eval evidence it cites, per
`MMT-ADR-0000` reconstruction discipline).

This is the **first** record in the llm-models trail and establishes the standing
two-perspective format (compliance/legal + capability/quality). Every future change
to [`../master.md`](../master.md) gets its own record here.

## Trigger (the input)

Google **Gemini** — the prior default LLM pool across every routing tier — is
**contractually unusable for under-18 end users**: GCP Service Specific Terms
§20(d) and the Gemini API terms both prohibit apps "directed towards or likely to
be accessed by" under-18 end users (verified raw-text 2026-06-05; `.claude` memory
`project_google_gemini_vendor_under18_blocked`). This app is plainly
likely-accessed-by-minors (child/family profiles). This is a **compliance input**,
not a decision — it removed an option rather than choosing one — and it forced a
full re-pick across all tiers under three simultaneous constraints no prior
selection enforced together: 25s Cloudflare-Workers wall (latency), lawful transfer
mechanism for minors' conversation text (compliance), and small-locale prose
quality (cs/nb/pl learners read tutor prose directly).

Five candidates were evaluated in their **exact production configurations** (model
slug, reasoning effort, pinned host). Live pricing re-verified against OpenRouter's
endpoint API 2026-06-06.

## Compliance / legal vetting

| Model · host | Transfer mechanism | ZDR / no-train | Under-18 lawful? | Verdict |
|---|---|---|---|---|
| **gpt-oss-120b @ Cerebras** (US) | SCCs + TIA (US-only datacenters) | ZDR + no-train advertised default; DPA/SCCs/SOC 2 in Trust Center | yes, pending triplet | **admit** — primary; triplet is a launch gate |
| **GPT-5 mini / gpt-5.4 @ OpenAI** (EU-residency deployment) | EU-residency deployment | ZDR-for-minors **mandatory** (owed) | yes, pending ZDR | **admit** — paid secondary / vision / deep-reasoning |
| **Mistral Small 4 @ Mistral** (EU) | EU-hosted, zero transfer paperwork | standard DPA | yes | **admit** — free secondary / vision |
| **Sonnet 4.6 / Haiku 4.5 @ Anthropic** | Art 28 DPA | ZDR/retention review owed | yes | **admit** — fallback / judge |
| **DeepSeek V4 Pro** | first-party API is Chinese-hosted → **no lawful transfer**; cheapest lawful US host DeepInfra ($1.30/$2.60, ~5× GPT-5 mini input); no EU host | — | only via DeepInfra + DPIA paragraph | **dormant** — adult-only fallback, not pinned |
| **Gemini / Vertex** | — | — | **no** (GCP §20(d)) | **exclude** (the input above) |

**Cerebras posture** (web-verified 2026-06-06, memory `project_cerebras_vendor_posture`):
serves open-weight models only — GPT-5 mini, gpt-5.4, Claude are **not** available
there, so Cerebras **cannot** become a single vendor. Its compliance triplet
(ZDR + no-training + executed DPA) is *likely achievable* but US-only datacenters
keep it on the SCCs+TIA route. Owner ruling: keep separate agreements with the
other vendors; Cerebras dedicated-endpoints / self-host parked as a future option.

**Compliance follow-ups owed** (B3 bucket + E5 DPIA gate, launch gates for minors):
- Cerebras triplet — ZDR-in-DPA text, SCCs+TIA.
- OpenAI ZDR-for-minors (covers paid secondary + gpt-5.4).
- Art 28 DPAs + ZDR/retention review for OpenAI / Anthropic / Mistral.
- Record the model/vendor choices in the DPIA.

**Open ruling — adult-only (verified-18+) Gemini eligibility.** The GCP terms test
is *app-audience* level ("directed towards or likely to be accessed by under-18"),
and this app is plainly likely-accessed-by-minors; whether adult-only routing
*inside a mixed-audience app* survives that test is unresolved and would
additionally require robust 18+ age assurance. **Until ruled, Gemini/Vertex stays
fully excluded.** If permitted, the exclusion becomes age-conditional and a Gemini
adult row is added — a future change with its own record here.

## Capability / quality vetting

All candidates passed through the eval-harness §6 gate in production config: safety
battery, exchanges core, language-quality judge, reasoning-mode latency probes.

**gpt-oss-120b @ Cerebras `high` — admitted as universal primary.**
- Safety: 44/44 battery + 100× jailbreak resample, **0 compliances**, 5/5 multi-turn
  adversarial. (The N=1 jailbreak flake cleared on resample — a benign
  `{"type":"refusal"}` envelope-format slip on refusals, ~1%; the direct adapter
  normalizes it.)
- Teaching: 55/55.
- Latency: p50 1.3s / p95 2.8s, **0-over-wall** (well under the 25s Workers limit).
- Language: **~98% in-language as-is** across all 9 conversation locales; **0/270**
  failures with a belt-and-braces directive.
- Cost: cheaper-or-equal to Mistral and materially smarter — the reason it is the
  universal default rather than a confined async-only model.

**Confinement reversal (recorded so it isn't re-litigated).** gpt-oss was originally
evaluated for async-only because a "wrong-language to small-locale learners" finding
suggested confinement. That finding was a **harness artifact**: the candidate eval
path bypassed `routeAndCall`, omitting the production language preamble
(`getPersonalizationPreamble`, `router.ts:236-243`); with the preamble, gpt-oss is
~98% in-language. Harness bug fixed (`withSafetyPreamble` exported + applied;
regression test `apps/api/eval-llm/runner/llm-client.test.ts`, break-test verified).
Single-host risk is handled by the per-tier secondary, not confinement.

**GPT-5 mini — admitted as paid secondary + vision** (not paid primary). An earlier
evidence-stage pick had it as paid primary; superseded because gpt-oss is
cheaper-or-equal, measurably smarter, and validated across every axis. GPT-5 mini's
closed-model vision and EU-residency deployment are exactly what the secondary needs
(gpt-oss is text-only).

**Mistral Small 4 — admitted as free secondary + free vision** (not free primary).
Free now defaults to gpt-oss like every tier; Mistral retained for the EU-residency
free branch + outage + free vision.

**gpt-5.4 `medium` — admitted as interactive deep-reasoning** (rungs 4–5) for
Plus / Pro / add-on. **Family excluded** (owner ruling 2026-06-07) — Family rungs
4–5 stay on gpt-oss `high`; free never escalates. gpt-5.5 rejected as the
deep-reasoning model ($5/$30, 2× gpt-5.4 for no measured quality gain; kept as a
rotation candidate only).

**Sonnet 4.6 — admitted as rung 4–5 fallback** (incumbent, vendor diversity).

**Haiku 4.5 non-reasoning — admitted as judge.** Reasoning mode banned (breaks JSON
envelopes). Vendor-independent of the tutor by design (see `MMT-ADR-0016`).

## Outcome

Resulting rows are in [`../master.md`](../master.md). Admission summary:
**admit** — gpt-oss (primary/async), GPT-5 mini (paid secondary/vision), Mistral
Small 4 (free secondary/vision), gpt-5.4 (deep reasoning, Family-excluded), Sonnet
4.6 (fallback), Haiku 4.5 (judge). **dormant** — DeepSeek V4 Pro. **exclude** —
Gemini/Vertex.

## Owed / open (not blocking this record)

- **Counsel sign-off** on the consent-age / jurisdiction posture (R-1, handoff HW-2)
  — mandatory before v2 sub-13, not launch-blocking.
- **Adult-only Gemini ruling** (above) — until ruled, excluded.
- **Build gates (Thread B):** direct Cerebras adapter (`{"type":"refusal"}` →
  safe-envelope handler + unit test); direct Mistral adapter; compliance-aware
  `getFallbackConfig` dropping Gemini/Vertex and failing closed to
  `CircuitOpenError`; OpenAI adapter taught `gpt-5-mini` + `reasoning_effort`.
- **Teaching-quality A/B** (gpt-oss vs GPT-5 mini at paid rungs 1–3) before the flag
  flip (`LLM_ROUTING_V2_ENABLED`).

---
*Immutable record. A later change to the model set is a new record in this folder,
never an edit to this one.*
