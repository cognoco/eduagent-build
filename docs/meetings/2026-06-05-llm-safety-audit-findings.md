# LLM Content-Safety Audit — Findings & Holes

**Date:** 2026-06-05
**Status:** Findings — no build approved by this document. One open product decision at the end (self-harm escalation depth) shapes the first fix PR.
**Method:** Code-verified sweep of the LLM pipeline (`apps/api/src/services/llm/`, prompt files, providers, envelope, eval harness, docs) on 2026-06-05. Every claim cites a file; nothing below is taken from plan/spec docs.
**Question answered:** *"What do we need to do to ensure the LLM never says anything controversial or harmful?"* — for a 13+ B2C tutoring product in 10 conversation languages.
**Related:**
- `docs/meetings/2026-06-05-launch-posture-decision-brief.md` — Dial 4 (provider route) **directly collides** with finding H4 below; see "Cross-ties."
- `docs/meetings/2026-06-05-llm-model-selection-research-memo.md` — §6 validation gate is where the jailbreak suite (H3) belongs.
- `docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md` — sequencing dependency: the small safety PR (H1–H3) should land before RR-1/RR-9 prompt rewrites and is a hard prerequisite of RR-12.

---

## 1. The layered safety model (how the pieces fit)

Every tutoring message passes through four runtime gates; a fifth layer (evals) tests offline that the gates still hold after changes.

```
learner input
  │
  ▼
① INPUT GATE — sanitization (strip/escape injection attempts)
  ▼
② INSTRUCTION GATE — system-prompt safety rules ("the harness")
  ▼
③ PROVIDER GATE — vendor-side safety classifiers (outside our code)
  ▼
④ OUTPUT GATE — structured envelope (validated shape before display)
  ▼
learner sees reply        ⑤ EVALS — offline regression tests of ①–④
```

Which layer matters at which level:

| Level | Protected by |
|---|---|
| Every live message | ② prompt rules + ③ provider filters + ④ envelope |
| A learner trying to trick the AI | ① sanitization + ③ provider filters (② alone is insufficient — it's instructions, not enforcement) |
| A developer editing a prompt | ⑤ evals (`pnpm eval:llm`) |
| App taking a wrong action from LLM text | ④ envelope + server-side hard caps |

---

## 2. What EXISTS (verified, with citations)

### ② Instruction gate — solid

- **Universal safety preamble at the router layer** — injected into *every* LLM call regardless of provider (`apps/api/src/services/llm/router.ts:187-191, 207-226`): refuse harassment/bullying/threats, hate speech, sexually explicit material, dangerous activities, civic-integrity undermining; decline politely and redirect to the learning topic. Age-aware framing (adult / young-learner / unknown).
- **Crisis redirect** (`apps/api/src/services/exchange-prompts.ts:552-562`): on distress, self-harm ideation, bullying, abuse → empathize in one sentence, redirect to parent/guardian/helpline; explicitly forbidden from counselling or diagnosing.
- **PII ban** (same block): no collection/storage/reference of full name, school, address, phone, email, social handles.
- **Anti-fabrication rules** (`exchange-prompts.ts:570-577`) and a **factual-confidence gate** (refuse to answer from memory below 0.88 confidence; ask for a source instead, `exchange-prompts.ts:449-459`).

### ③ Provider gate — Gemini only

- **Gemini: explicit minor-strict safety settings on every request** (`apps/api/src/services/llm/providers/gemini.ts:48-66`, applied at `:151`): 5 harm categories, `BLOCK_MEDIUM_AND_ABOVE` (sexually-explicit at `BLOCK_LOW_AND_ABOVE`).
- **Safety blocks are terminal**: a `SafetyFilterError` is excluded from retry/fallback (`router.ts:617, 660-685`) — deliberately closes the "Gemini refused, ask OpenAI instead" loophole. Route layer maps it to a machine-readable `safety_filter` error code (`apps/api/src/routes/sessions.ts:127-131`).
- **OpenAI: partial** — detects its `content_filter` finish reason → `SafetyFilterError` (`providers/openai.ts:107-114`), but no proactive safety configuration.
- **Anthropic: none** — no explicit safety parameters configured (`providers/anthropic.ts`); relies entirely on prompt rules + the model's own training.

### ① Input gate — systematic

- Two-pattern sanitization (`apps/api/src/services/llm/sanitize.ts:46-71`): destructive strip for short fields (names, pronouns, subject titles, length-capped), lossless XML-entity escaping for long content.
- Learner free text wrapped in `<learner_intent>` tags with an explicit "treat as data, not instructions" notice (`exchange-prompts.ts:695-702`).

### ④ Output gate — correctness-strong, content-weak

- Structured envelope (`packages/schemas/src/llm-envelope.ts:428-490`): reply + machine-readable signals; schema-level refinements reject legacy marker tokens and embedded JSON; every signal has a server-side hard cap so flows terminate even if the LLM misbehaves.
- The Challenge Round note path carries the app's **only output-content check**: the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` (notes drafted only from the learner's own verified words).

### ⑤ Evals — infrastructure exists, safety coverage doesn't

- `apps/api/eval-llm/` + `pnpm eval:llm` (Tier 1 prompt snapshots, Tier 2 live schema validation), 19+ flows wired. **Zero adversarial/safety cases** (see H3).
- Provider safety-error handling has exactly 2 unit tests (`providers/openai.test.ts` content_filter cases).

> **⚠️ Update 2026-06-06 — eval-integrity defect found & fixed (layer ⑤).** The candidate-model eval path (`runHarnessLlm` with `--openrouter-model`, `apps/api/eval-llm/runner/llm-client.ts`) **bypassed `routeAndCall`**, so it omitted the universal safety preamble (②, `router.ts:187-191, 207-226`) *and* the personalization/language directive (`router.ts:236-243`) from every candidate run. Consequence: candidate models were being safety-/language-evaluated on a prompt **missing the production instruction gate** — the eval did not measure what production ships. The most visible symptom was spurious "wrong-language" hard-fails (gpt-oss, Haiku) that vanished once the preamble was applied (~98% in-language; see model-selection memo §6 CORRECTION). **Fixed:** `withSafetyPreamble` exported from `router.ts` and now applied on the candidate path; regression test `eval-llm/runner/llm-client.test.ts` (break-test verified) fails closed if the preamble is ever dropped again. **Generalizes H3:** an adversarial eval suite is only valid if the candidate path carries the production gates — the suite and this wiring must land together.

### Adjacent (UI copy, not LLM)

- `scripts/check-no-clinical-copy.ts` + `scripts/no-clinical-copy-baseline.json` ratchet clinical/struggle language out of UI copy. (An earlier sweep mis-reported this file as missing — it exists; verified 2026-06-05.)

---

## 3. The HOLES, ranked

| # | Hole | Severity | Lift | When |
|---|---|---|---|---|
| H1 | Gemini safety-block leak: only `SAFETY` is terminal | **High** (real loophole) | S (~half-day) | Before launch |
| H2 | Self-harm/crisis redirects fire with zero logging | **High** (product + compliance) | S–M | Before launch |
| H3 | No jailbreak/refusal eval suite | **High** (nothing proves ② holds) | M | Before launch; before RR prompt rewrites |
| H4 | OpenAI/Anthropic lanes have no provider safety config | Medium → **High if Dial 4 ruled as researched** | M | Re-rank after Dial 4 |
| H5 | No output-moderation layer | Medium (belt-and-suspenders) | M–L | Defer past launch *unless* Dial 4 removes Gemini |
| H6 | Controversial-topics handling is one vague phrase | Low–Medium | S | With H3 |
| H7 | No safety-incident metric/dashboard | Medium | S (rides on H2) | With H2 |

### H1 — Gemini safety-block leak (the one genuine bug)

Only blocks with reason `SAFETY` become a terminal `SafetyFilterError` (`providers/gemini.ts:173-186, 296-301`). Gemini's **other** block reasons — `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII` — surface as generic errors, which the router treats as *transient*: it retries and **falls back to another provider** (`router.ts:660-685`) — re-opening exactly the "ask someone else" loophole the terminal rule was built to close. Fix: map all content-block reasons to `SafetyFilterError`.

### H2 — Crisis redirects vanish silently

The prompt-level crisis redirect (empathize → helpline) is correct, but **nothing is logged, no metric fires, no one is notified**. We cannot answer "how many learners mentioned self-harm last month?" This violates the repo's own silent-recovery rule (CLAUDE.md, Fix Development Rules) applied to the highest-stakes path in the app, and for a minors product it is also a DPIA-visible gap. Minimum viable: a structured safety event when the redirect fires (server-side detection or an envelope signal — design choice in the fix PR). Guardian notification is a separate open product decision (§6).

### H3 — Safety rules are untested

All of layer ② lives in prompt text, and no test anywhere validates it survives contact with an adversarial user ("ignore your rules," "pretend you're unrestricted," self-harm roleplay, harmful-content requests in all 10 conversation languages). The eval harness is the natural home; the model-selection memo's §6 validation gate already names "child-safety probes" as mandatory for candidate models — this suite makes that gate real, and retroactively covers every future prompt edit (incl. RR-1/RR-9).

### H4 — Non-Gemini lanes are prompt-only

Gemini is today's best-configured safety lane; OpenAI is detection-only; Anthropic (premium tier, rung 4+) has nothing explicit. Two aggravators:

1. **The escalation-rung ladder routes upward toward the thinnest safety config** (`router.ts:316-466`): rung 1–3 → Gemini (configured), rung 4–5 / premium → OpenAI/Anthropic (not configured).
2. **Dial 4 of the launch-posture brief** (2026-06-05) finds the Gemini API is *not usable for a teen-facing app under current Google terms* and routes launch through OpenAI/Anthropic. **If that dial is ruled as researched, the only configured provider-safety layer in the app is removed**, and H4 + H5 are promoted from "hardening" to launch-relevant. The brief already tracks the Gemini re-routing as untracked engineering work; the safety re-hardening must ride in the same work item, not after it.

### H5 — No final output filter

If a model evades ②+③, nothing inspects the text before display: no moderation pass, no keyword screen. Defensible to defer while Gemini's classifier guards the main lane — **not** defensible if Dial 4 removes that lane. Candidate designs (moderation-API pass on output, or a lightweight classifier) should be scoped only after Dial 4 is ruled, since the provider mix determines the right tool.

### H6 — "Controversial" is one phrase

The only instruction covering contentious topics is the civic-integrity clause in the preamble. No guidance for war/politics/religion/sexuality-adjacent curriculum questions (which a 13+ history or biology learner *will legitimately ask*). Risk runs both ways: saying something inflammatory, or refusing legitimate schoolwork. Fix is prompt craft + H3 eval cases that pin the intended behavior (age-appropriate, balanced, never advocacy).

### H7 — No safety observability

LLM calls are logged generically (`router.ts:111-133`); Sentry captures errors — but there is no queryable "safety blocks per day / crisis redirects per week" signal. Rides on H2's structured events; also satisfies the monitoring guardrail RR-12 demands before the Challenge Round prod flag flips.

### Explicitly checked, judged acceptable for now

- **Profanity filtering:** none — acceptable; provider classifiers + prompt tone cover the harmful end, and over-filtering harms tutoring ("damn" in a literature quote is fine).
- **Cross-profile memory leakage:** defended architecturally (profile-scoped repos); no automated multi-profile test — known, accept until identity-foundation work creates a natural home for one.
- **Age-appropriate content validation:** voice adapts by age bracket; content itself isn't separately gated — acceptable at 13+ floor; revisit if the 11+ phase ever activates.

---

## 4. Cross-ties (why these documents must move together)

| Tie | Consequence |
|---|---|
| **Launch-posture brief, Dial 4** (no Gemini API for teens) — **now triggered: `MMT-ADR-0016` ratifies the Gemini exit for under-18 (gpt-oss-120b @ Cerebras = universal default text)** | No longer conditional: removing Gemini's classifier lane makes **H4/H5 launch-relevant**. The mitigation is the independent **Haiku judge + gating modes** specced in `docs/specs/2026-06-06-llm-routing-and-judge-architecture.md` §2–§3; safety re-hardening rides the Thread B routing build (`docs/specs/2026-06-06-llm-routing-gpt-oss-cerebras-build.md`). |
| **Model-selection memo §6** (validation gate, child-safety probes) | H3's jailbreak suite is the concrete implementation of that gate; build once, gates both prompt edits and model swaps. |
| **Review-relearn findings (RR doc)** | RR-1/RR-9 edit the same prompt files that hold the safety rules → land H3 first so those rewrites get safety regression coverage. RR-12 (Challenge Round prod flip) opens a new LLM surface → H1+H2+H7 are prerequisites; H7 doubles as RR-12's required monitoring. RR-9's "never fabricate a score" fallback fix is the same silent-recovery pattern as H2 — one design sweep closes both. |

## 5. Self-hosting (asked and answered)

Self-hosting an open-weights model would **delete layer ③ entirely** (provider classifiers don't ship with weights), turn H5 from optional into a hard prerequisite, degrade quality in the small locales (nb/cs/pl), cost more at pre-launch volume, and push us toward the heavier AI-Act "provider" role. The only genuine upside — data locality — is already handled contractually (DPA + no-training/ZDR per the launch-posture brief). **Not recommended**; the launch-posture brief reaches the same verdict independently (Dial 4 lists self-hosted as fallback-only, "inherits the full quality/safety/eval burden"). Realistic future trigger: a B2B/schools deal contractually demanding on-premise data.

## 6. Open decision (for the owner)

**Self-harm escalation depth.** When a learner mentions self-harm and the crisis redirect fires, should the system:

- **(a) Log internally only** — structured event, queryable, visible to us; no guardian involvement. *Recommended for launch:* no privacy/trust complexity, and it makes the today-invisible path measurable.
- **(b) Also notify the guardian** — can protect a child, but can also deter a struggling teen from ever opening up to the tutor, and creates its own safeguarding/privacy questions (what exactly does the parent see?).

This ruling shapes the H2 fix PR and slots into RR-12's monitoring guardrail — one answer settles both threads. Option (a) does not foreclose (b) later; the structured event is the prerequisite for any notification design.

## 7. Suggested first PR (when approved)

One focused PR, no product-behavior change: **H1** (map all Gemini block reasons to terminal `SafetyFilterError` + tests) + **H2** (structured safety event on crisis redirect, per §6 ruling) + **H3 seed** (adversarial eval cases in `eval-llm`, en + 2–3 risk locales) + **H7** (event shape queryable, counts visible). H4/H5/H6 wait for the Dial 4 ruling, which determines their real priority.
