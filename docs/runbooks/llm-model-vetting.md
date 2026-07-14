# Runbook — LLM model vetting

> **STATUS (2026-07-14): POLICY RETAINED; EXECUTABLE REFRESH REQUIRED.** Before using this as an admission gate, define whether the change is a new model/provider tuple, a retained-model capability recheck, or compliance-only. Add exact current `eval:llm --live --openrouter-model` commands (including reasoning/provider options), flow/call budgets, safety resampling, latency/pricing evidence, and a master-register↔vetting-record CI check. Both compliance and capability halves are mandatory for a new admission/tuple change, not for every descriptive retained-role edit.

**Type:** L3 operational procedure. **Governs:** the `llm-models` register
(`docs/registers/llm-models/`). **Backing ADRs:** `MMT-ADR-0014` (vetting/routing
split + admission gate), `MMT-ADR-0016` (safety/judge architecture), `MMT-ADR-0013`
(policy-engine spine).

Run this whenever a model **enters, changes role in, or leaves** the register — i.e.
before any edit to `docs/registers/llm-models/master.md`. A model does **not** enter
the master until **both** halves below pass (the admission gate). Each run emits one
immutable record in `docs/registers/llm-models/vetting/`. Worked example:
`vetting/2026-06-06-launch-set-iteration-1.md`.

## When to run
- **Compliance trigger:** a legal/contractual change (new vendor terms, transfer-
  mechanism change, ZDR/DPA update). Owner: **PM / legal.**
- **Capability trigger:** a new candidate model, a role/slot change, or a vendor
  config change (slug, reasoning effort, host). Owner: **eng / eval-harness.**

## A. Compliance / legal checklist  (PM / legal)
Vet the exact `(model · provider · service · region)` tuple:
1. **Transfer mechanism** for the serving region — DPF *or* SCCs+TIA *or* an
   EU-residency deployment. **Chinese-hosted inference is excluded** (no lawful mechanism).
2. **ZDR (zero data retention)** — mandatory for under-18 traffic; verify the
   provider default *and* the DPA text, not just marketing.
3. **No-training-on-data** commitment, in writing.
4. **Executed DPA** (Art 28) / SCCs as the region requires.
5. **Age-closure clause** — does the vendor ToS prohibit under-18 use? (e.g. Gemini
   GCP §20(d).) If so, record it as a prohibition-floor exclusion, not a route.
6. **DPIA entry** — record the model/vendor choice + any owed follow-ups.

## B. Capability / quality checklist  (eng / eval-harness)
Run the eval-harness §6 gate in the model's **exact production config** (slug,
reasoning effort, pinned host — never a bypass path):
1. **Safety battery** + jailbreak resample (≥100×); 0 compliances required.
2. **Teaching / exchanges core.**
3. **Language-quality judge** — in-language across all conversation locales
   (cs/nb/pl are the failure-prone ones).
4. **Latency probes** — p50 / p95 against the ~25s Cloudflare-Workers wall; 0-over-wall.
5. **Pricing** re-verified against the OpenRouter endpoint API.

## C. Admission + output
- **Admit only if A *and* B pass.** Any compliance gap or capability failure blocks the row.
- **Update** `docs/registers/llm-models/master.md` (the affected rows only).
- **Write** a new immutable record `vetting/YYYY-MM-DD-<change-slug>.md` with a
  `## Compliance / legal vetting` section and a `## Capability / quality vetting`
  section (copy iteration-1's shape); mark it ratified once both owners sign off.
- A master edit **without** a matching record is a governance violation
  (`docs/registers/README.md`).
