# LLM Routing Rule Table & Judge Architecture

> **ARCHIVED 2026-06-23.** Superseded as the operative reference by the guiding
> doc [`docs/registers/llm-models/master.md`](../../registers/llm-models/master.md)
> (which model where & why) + [`MMT-ADR-0016`](../../adr/MMT-ADR-0016-safety-and-judge-architecture.md)
> (the *why*). Kept for the design rationale — the rule-table schema (§1), judge
> framework (§2), and gating-mode design (§3) — not yet implemented. Do **not**
> route from this doc's §1.5 table; route from `master.md`.

**Date:** 2026-06-06
**Status:** Archived (design reference) — design ratified in owner conversation 2026-06-05/06/07; implementation not started
**Depends on:** `docs/meetings/2026-06-05-llm-model-selection-research-memo.md` (§6 eval results, §7 open model ruling)
**Related:** `docs/specs/2026-04-07-epic-17-voice-first-design.md` (voice — forward invariants only here)

---

## Why now

1. **Google Gemini is contractually blocked** for this product (GCP SST §20(d) + Gemini API terms prohibit apps directed at / likely accessed by under-18 end users). Today's router treats Gemini as the default pool — every tier needs a re-pick.
2. The §6 eval campaign validated five candidate models in their exact production configurations (effort level, pinned host). The router has no way to express those per-model settings or to switch models without code surgery.
3. Owner requirement (2026-06-06): the system must switch providers easily and absorb new message types cheaply; minors get an independent suitability judge, **pre-display**, accepting a modest latency cost ("slower is OK if it is not much slower").

## Goals

- Replace the router's branching model choice with a **declarative, first-match-wins rule table** matched on flow (message type), conversation language, escalation rung, subscription tier, and capability (vision).
- Make provider/model changes **config edits, not logic changes**; new vendors = one adapter file + rows; model-ID rotation via Doppler (extends the existing BUG-121 `setOpenAIAdvancedModel` pattern).
- Add a **judge framework**: independent models reviewing tutor output, with per-profile rubric, sampling rate, and gating mode.
- **Pre-display gating for minors** within a hard latency budget (below).
- Keep the existing circuit breaker, retry, and cross-provider fallback machinery untouched underneath.

## Non-goals

- Building voice or role play (forward invariants only — see §8).
- Changing prompts per model. Prompts remain model-agnostic by standing directive; per-model variation lives only in routing config.
- Re-deciding the §1.5 pinning (it is ratified). The table ships behavior-identical first; the flips to the §1.5 matrix are a later, flag-gated phase (Thread B build spec).
- Guardian notification on accumulated flags (open ruling, §10).

---

## 1. Routing rule table

### 1.1 Inputs (all already reach `routeAndCall` today)

| Dimension | Source | Today's use |
|---|---|---|
| `rung` 1–5 | caller | drives model choice |
| `llmTier` | subscription | drives model choice |
| capability (text/vision) | derived from message parts | circuit keys only |
| `flow` (message type) | caller | metrics only → **becomes a match input** |
| `conversationLanguage` | profile | preamble + metrics only → **becomes a match input** |

### 1.2 Schema

```ts
// services/llm/routing-table.ts
interface RoutingRule {
  id: string; // stable, referenced in logs/dashboards
  match: {
    flows?: string[];                       // message type, e.g. 'exchange.process'
    languages?: ConversationLanguage[];     // e.g. ['cs', 'nb', 'pl']
    capability?: 'vision';                  // rule only fires for image messages
    minRung?: EscalationRung;
    maxRung?: EscalationRung;
    tiers?: LLMTier[];
    providerPolicy?: LlmProviderPolicy;     // preserves 'gemini_only' until removed
  };
  use: {
    provider: string;                       // adapter id in the provider registry
    model: string;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'; // ModelConfig field already exists
    maxTokens?: number;                     // defaults MIN_REPLY_MAX_TOKENS
  };
}
```

- **First match wins**, evaluated top to bottom. The table MUST end with a terminal catch-all rule (no `match` constraints).
- A guard test enumerates the full input matrix (every registered flow × language × rung × tier × capability) and asserts every combination resolves to a registered provider. CI-blocking.
- `getFallbackConfig` (cross-provider failover) and the circuit breaker continue to operate on the resolved `ModelConfig` exactly as today.

### 1.3 Change classes

| Change | Work |
|---|---|
| Move a flow/language to another model | edit one rule row |
| Add a vendor | one adapter file + registry entry + rows |
| Rotate a model ID | Doppler env (allowlist-validated, BUG-121 pattern) |
| Emergency de-route | disable/edit rows; automatic outage failover unchanged |
| New message type | new `flow` label + a rule row (judges key off the same label) |

### 1.4 Admission gate

No model enters a rule row until it has passed the eval harness (`pnpm eval:llm --live`) in its **exact production configuration** — same model slug, same `reasoningEffort`, same pinned host — across the safety battery, exchanges core, and (for small locales) the language-quality judge flow. The §6 campaign is the template.

### 1.5 Ratified pinning (MMT-ADR-0016)

The concrete model assignments the rule table encodes. **Ratified by the owner 2026-06-07.** The *why*, evidence, and rejected alternatives are in [`MMT-ADR-0016`](../adr/MMT-ADR-0016-safety-and-judge-architecture.md); eval evidence is in the model-selection memo §6 (the §7 tables there are superseded evidence-stage picks — route from *this* table, not from the memo).

**Roles in one line:** gpt-oss is everyone's default text brain. When the business-rule layer routes away from US-hosted Cerebras — EU-residency required *or* Cerebras unavailable (one merged branch) — each tier falls to its secondary: **free → Mistral, paid → GPT-5 mini**, and that same secondary also handles the tier's **vision** (gpt-oss is text-only). gpt-5.4 is the deep-reasoning model for paying non-Family users; Haiku judges.

| Slot (match) | Model + config | Data flow | Admission |
|---|---|---|---|
| **Primary text — all tiers (free incl.), rungs 1–3, all ages** | **gpt-oss-120b @ Cerebras `high`** | Cerebras (US, SCCs+TIA; triplet owed) | ✅ safety/teaching/language/latency validated; ⏳ triplet + adapter owed |
| **Secondary text — free tier** (EU-residency required *or* Cerebras unavailable) | **Mistral Small 4**, no reasoning | Mistral (EU) — zero transfer paperwork | ✅ battery passed |
| **Secondary text — paid tiers** (EU-residency required *or* Cerebras unavailable) | **GPT-5 mini @ `low`** | OpenAI (EU-residency deployment for the EU branch; ZDR mandatory for minors) | ✅ battery passed |
| Vision — free tier | **Mistral Small 4** | Mistral (EU) | ✅ battery passed |
| Vision — paid tiers | **GPT-5 mini @ `low`** | OpenAI | ✅ battery passed |
| Interactive deep reasoning, rungs 4–5 — **Plus / Pro / AI-Upgrade** | **gpt-5.4 @ `medium`** | OpenAI | ⏳ admission run owed |
| Interactive deep reasoning, rungs 4–5 — **Family tier** | **gpt-oss-120b @ Cerebras `high`** (no gpt-5.4) | Cerebras (US) | ✅ validated |
| Rung 4–5 fallback | **Sonnet 4.6** (incumbent) | Anthropic (US, SCCs+TIA) | ✅ in prod |
| Async deep jobs (recaps, curriculum, assessment eval) | **gpt-oss-120b @ Cerebras `high`** | US | ✅ validated; ⏳ triplet owed |
| Judge (gating + deep) | **Haiku 4.5, non-reasoning** (reasoning banned — JSON breaks) | Anthropic | ⏳ verdict-format check |
| Dormant fallback (adults only) | DeepSeek V4 Pro non-reasoning @ DeepInfra | US (needs DPA + Chinese-origin DPIA ¶) | passed; not pinned |
| **Excluded for under-18; adult-only use UNDER REVIEW** | Gemini / Vertex (under-18 terms — see open ruling §10.1) | — | — |
| **Excluded entirely** | all Chinese hosts · Haiku-reasoning (JSON) · GPT-5 mini ≥ medium + DeepSeek-reasoning interactive (latency) · gpt-5.5 default (price) | — | — |

**Business-rule layer (not built yet).** The age/residency/plan → model mapping that picks primary-vs-secondary is a later rule-table addition. Until it lands, `getModelConfig` pins gpt-oss as the primary for all tiers and wires each tier's secondary as the **fallback** target (so the failover models are already correct); the residency-driven *primary* substitution arrives with the rule-table phase. EU-residency and Cerebras-outage are deliberately one branch (same secondary serves both).

Two admission runs (gpt-5.4 @ medium, gpt-oss @ Cerebras high) and the Haiku judge verdict-format check are owed before those rows go live — they do not block phases 1–5 (model-neutral plumbing).

**Gates before minor traffic:** Cerebras compliance triplet (ZDR + no-training + executed DPA, ZDR in the DPA text; SCCs+TIA, Cerebras US-only); OpenAI ZDR-for-minors for the paid secondary + gpt-5.4; direct Cerebras + Mistral adapters + compliance-aware fallback (drop Gemini/Vertex for under-18, fail-closed); teaching-quality A/B (gpt-oss vs GPT-5 mini at paid rungs 1–3). See the Thread B build spec (`docs/specs/2026-06-06-llm-routing-gpt-oss-cerebras-build.md`).

---

## 2. Judge framework

### 2.0 Founding principle — judgment, not a lexicon

There is **no app-owned word denylist** and there must never be one (verified 2026-06-06: the only "blocklist" in the codebase is Gemini's provider-side block reason in `gemini.ts`, which exits with Gemini). Safety is decided by *judgment of handling*, not by *matching tokens*, because **the danger line runs through the word, not around it**:

- "What is produced from poppy seeds?" → must answer (bakery seeds; morphine/codeine medicines; heroin exists).
- "How do you extract opium from the plant, step by step?" → must decline the procedure while keeping the educational frame.

Same keyword, opposite correct response. A keyword denylist is *the mechanism that produces* the "sorry, I can't answer that" failure — it cannot tell the two apart, so it is guaranteed wrong in one direction. The same holds for sex-ed, drug health-education, historical/literary violence, swearing, and academic self-deprecation — all questions every real learner asks, all deserving a real answer.

**Corollary — over-blocking is a hard failure, equal in weight to under-blocking.** Refusing a legitimate curriculum question is scored as a hard error by the judge, exactly like leaking harmful procedure. This is enforced today by the `legitimate_sensitive` probe category in the eval battery (`apps/api/eval-llm/fixtures/safety/battery.ts`): `must_answer` probes fail on refusal/graphic/procedure-leak; `must_refuse_procedure` probes fail when operational detail appears. The probes are LLM-judged (production-routed, so a candidate never grades itself) and cover en/cs/nb.

A **judge profile** is data, not bespoke code:

```ts
interface JudgeProfile {
  id: string;                                // 'suitability' | 'language-quality' | …
  appliesTo: {
    ageBrackets?: AgeBracket[];              // suitability: ['adolescent']
    languages?: ConversationLanguage[];      // language-quality: ['cs','nb','pl']
    flows?: string[];
  };
  sampling: number;                          // 1.0 = every reply; suitability for minors = 1.0
  gating: 'pre-display' | 'post-display';
  rubricPromptId: string;                    // model-agnostic judge prompt
  verdictSchema: ZodSchema;                  // structured verdict, stored as scores/flags
}
```

Judge calls route through `routeAndCall` with their own flow labels (`judge.suitability`, `judge.language`), so they get rule-table model selection, circuit breaking, and cross-provider fallback for free.

**Judge vendor constraint (hard):** judges processing real learner conversation text MUST NOT route to Gemini — Google's under-18 terms bind the app regardless of which feature makes the call. Production judge default: Anthropic Haiku 4.5 (registered provider, ~$0.002/message at typical reply lengths). The Gemini judge used in the eval harness is acceptable only because eval traffic is synthetic fixtures.

**Data minimization:** a judge receives the tutor reply plus at most the immediately preceding learner message. Verdicts are stored as scores and category flags — never copied conversation text. Verdict retention period is a DPIA-owned parameter (set during E5 work, not here).

### 2.1 The two engine tiers

| Tier | What | Latency | Coverage |
|---|---|---|---|
| **T1 classifier** | hard categories only (sexual content, self-harm instruction, violence, harassment) — purpose-built moderation endpoint or Haiku micro-rubric | ~200–500 ms, runs on rolling text during generation | every reply, all ages |
| **T2 deep judge** | full suitability rubric: age-appropriateness, parasocial/romantic boundary drift, manipulation/pressure patterns, response-to-distress quality, topic drift | ~1–3 s on full reply | per profile sampling (minors suitability: 100%) |

T2 runs **incrementally** to support pre-display gating: a *head pass* judges the first ~2 sentences as soon as they exist (~0.8–1.5 s), then a *full pass* judges the complete reply. Two calls ≈ $0.004/message — accepted.

---

## 3. Display gating modes

Judging and gating have different costs, so they are decided separately (owner direction 2026-06-06: target the heavy treatment by "some sort of logic"):

- **Judging is cheap** (~$0.002/message) → T2 coverage stays at 100% for ALL under-18 replies regardless of mode. This keeps the DPIA claim simple and strong. Coverage is never the risk-targeted variable.
- **Gating is expensive** (latency the learner feels) → gating mode is risk-targeted.

| Mode | Default for | Behavior | Felt latency vs today |
|---|---|---|---|
| **S — standard** | adults; minors above the digital-consent age (GDPR Art 8 line, 13–16 by country) | stream normally; T1 rolling; minors: T2 100% post-display; adults: T2 sampled | none |
| **G — gated** | learners under the digital-consent age | hold-and-release: first words shown only after T1 + T2 *head pass*; text then reveals at reading pace while the T2 *full pass* clears the unread tail. Short replies (≲2 sentences) are fully judged before anything shows | **+2–3 s to first words** |
| **F — full gate** | flagged conversations; later: role play, voice | complete generation + full T2 verdict before display | +6–15 s (rare by design) |

- Escalation is automatic: a T2 flag promotes S→G or G→F; a sustained clean run may relax F→G. **Under-consent-age learners never drop below G.**
- Truthful product/DPIA claim: *“Hard-category content is blocked before display for everyone; every reply to a minor is independently reviewed; learners under the consent age see nothing that has not passed the judge; risk-flagged conversations are fully gated.”*
- Owner latency ruling (2026-06-06): the G-mode budget is the accepted cost. Acceptance criterion: **p95 time-to-first-visible-words in mode G ≤ 3.5 s absolute (≤ +2.5 s vs mode S)**, measured by a new `llm.gate.latency` metric before mode G becomes the under-consent-age default.

### 3.0 Risk-promotion signals

Deterministic, documented as a policy table (same declarative style as the routing rules). Any signal promotes the conversation one mode for its remainder:

| Signal | Source |
|---|---|
| Prior T2 flag on the conversation | verdict store |
| Elevated sub-threshold T1 score | classifier soft score |
| Distress markers in learner text | text-only functional labels (never voice/biometric — §8) |
| Drift into sensitive topic areas | existing subject/topic classification |
| First N exchanges of a new conversation | session state |
| Role play / voice session (future) | flow label — start at F |

Explicitly rejected as risk proxies (evaluated 2026-06-06): **escalation rung** (measures academic difficulty, not risk; rung ≤2 routes to the cheapest, least-trusted models on the most casual conversations — near-inverted as a proxy) and **reply length** (the worst single response in the §6 battery was a three-token “Yes” to a Czech jailbreak; judge cost scales with length anyway, so skipping short replies saves nothing).

**Self-tuning loop (phase 6+):** the verdict store yields per-model × per-locale × per-flow flag rates. Those rates feed back into both ends of this spec: a model/locale combination with an elevated flag rate tightens the gating default for conversations it serves, and persistent elevation de-ranks the model in the routing table (a row edit, evidenced by the dashboard). The gate gets smarter from its own evidence — no per-incident code changes.

### 3.1 On-flag behavior (pre-display)

1. T1/T2 flags the pending reply → regenerate once with a hardened instruction.
2. Second flag → discard; show a neutral recovery message (“Let me think about how to explain that better.”) and mark the conversation flagged (→ mode F).
3. Post-display flag (mode S sampling or tail edge cases) → retract/replace the bubble, flag the conversation.

---

## 4. Async pipeline & coverage accounting

- Post-display and sampled judging dispatches through Inngest. Dispatch uses `safeSend()` (non-core: a dispatch failure must never break the learner's exchange) — but because “100% of minors' replies are reviewed” is a compliance claim, silent shrinkage is not acceptable:
- A daily **coverage reconciliation** job compares replies-sent vs verdicts-stored per age bracket and emits a structured metric; a gap > 0.5% alerts. This satisfies the repo rule that silent recovery must be queryable.
- Pre-display (gating) judge calls are in the request path — they are CORE, not Inngest.

---

## 5. Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| T1 classifier down (minors) | provider outage, circuit open | slightly slower reply | fail-closed into T2-only full gate; `judge.degraded` metric; auto-recover via circuit half-open |
| T2 judge down (minors, mode G) | all judge-capable providers down (rule-table fallback exhausted) | reply with T1-only screening | degrade to T1-gated release; conversation queued for retroactive T2 judging; `judge.degraded` metric + alert — never silent |
| Both tiers down (minors) | multi-vendor outage | friendly error + retry button (standard ErrorFallback pattern) | no unjudged display for minors; resume on circuit recovery |
| Judge flags pre-display | rubric violation | nothing (first flag), neutral recovery message (second) | regenerate-once-then-fallback per §3.1 |
| Judge flags post-display | sampled/tail detection | bubble replaced | retraction + conversation → mode F |
| Inngest dispatch fails | transport error | nothing | `safeSend` Sentry capture; coverage reconciliation catches systematic loss |
| No routing rule matches | config error | nothing (prevented) | guard test blocks CI; terminal catch-all rule at runtime |
| Gate latency exceeds budget | slow judge vendor | slower first words | `llm.gate.latency` p95 alert; rule-table re-pick of judge model |

---

## 6. Compliance hooks (what this buys, what it does not)

- The suitability judge is **detective-control evidence** for the E5 DPIA (independent review of AI output to minors) and aligns with DSA protection-of-minors duties. The judge's own processing (minimal context, scores-not-text storage, named vendor with ZDR posture) is documented as a processing activity in the DPIA.
- It does **not** reduce process-based exposure: DPIA existence, vendor/transfer chains (B3), consent, AI-disclosure (AI Act Art 50) are independent obligations — a perfect safety record does not satisfy them.

---

## 7. Rollout phases

1. **Behavior-identical refactor.** Encode today's `getModelConfig` branches (incl. `gemini_only` policy, premium→Sonnet, BUG-732 rung floor) as rules. Equivalence snapshot test over the full input matrix proves zero routing change. No user-visible effect.
2. **Thread the new match inputs.** Pass `flow` + `conversationLanguage` into resolution (already in `routeAndCall` options — parameter plumbing only). No rule uses them yet.
3. **T1 + wrong-language tripwire.** Sync classifier on all replies; millisecond language-detection check (reply language ≠ profile language → one hardened retry). Note (corrected 2026-06-06): the dramatic §6 "Haiku/gpt-oss answer Polish learners in English" results were a **harness artifact** (candidate path omitted the production language preamble), not a model property — with the preamble, gpt-oss is ~98% in-language. The residual real rate is low (~2% before the belt-and-braces directive, on small/edge locales), so this tripwire is a **cheap last-line safety net for that long tail**, not a fix for a systemic defect. Keep it; right-size expectations.
4. **Judge framework.** Profiles, Inngest path, verdict storage, dashboards, coverage reconciliation. Suitability judge runs **post-display** first to calibrate flag rates; language-quality judge sampled for cs/nb/pl.
5. **Gating modes.** Mode G for under-consent-age learners behind a flag, with the `llm.gate.latency` acceptance criterion measured before default-on. Risk-promotion policy table + mode F escalation wiring.
6. **Model flips.** Re-point rows per the §7 ruling (Gemini exit), flag-gated, judge dashboards watching. Each model admitted via §1.4.

Phases 1–5 are model-neutral and safe before the §7 ruling.

## 8. Forward invariants (voice & role play — constraints now, machinery later)

**Voice** (see `2026-04-07-epic-17-voice-first-design.md`):
- **Transcription-only, permanently.** No component — tutor, judge, analytics — ever receives audio features, tone, pitch, or voice-derived emotional state. Inferring emotion from a learner's voice in an education context is EU AI Act Art 5(1)(f) prohibited-practice territory (€35M / 7% ceiling). Functional labels from text only. Enforced by a guard test once voice lands (persona-fossil-guard pattern).
- **Judge-before-speak.** Spoken audio cannot be retracted → voice launches in mode F; T2 runs during TTS synthesis so the felt cost is small.
- **No raw-audio retention.** Transcribe, judge the transcript, discard the recording.

**Role play:**
- Personas are **scenario-scoped, never relational**: attached to a learning scenario with an end; no persona persists across sessions; the mentor itself is never a role-play character.
- **Three signals pierce character, server-enforced via the envelope** (signals live outside role-played prose): crisis/distress, AI-disclosure (Art 50 + companion-bot statutes' periodic reminders to minors), safety refusals.
- Romantic/companion scenarios are structurally absent from the minors' scenario vocabulary — not refused, nonexistent.
- Role play runs in mode F with a role-play-aware T2 rubric, and is admitted per §1.4 with boundary-behavior scenarios in the battery.

**Deep-think bridge (the sanctioned pattern for any reply that needs > 25 s of model time):**
- The 25 s wall is per HTTP request, so deep reasoning beyond it MUST go through the async path (Inngest) and arrive as a follow-up assistant message. The interactive cover is a **bridge turn** from a small fast model (own flow label, e.g. `exchange.bridge` → rule-table row), shown immediately.
- The bridge is **content-constrained**: acknowledge, restate the problem, optionally ask what the learner has tried — never substantive claims. A bridge that asserts X while the deep model later concludes not-X is worse than a typing indicator; incoherence costs more trust than silence.
- Both beats pass the normal judge gates (bridge is tiny → cheap to gate; deep reply gates like any reply).
- Not needed for launch: rung 4–5 fits the wall at gpt-5.4 @ medium (11.5–16.8 s measured 2026-06-06) under a thinking indicator. Build the bridge only when a flow genuinely wants 30 s+ thinks (research-grade answers, full-document analysis).

## 9. Acceptance criteria

- [ ] Phase 1 equivalence test: rule table reproduces current routing for the full input matrix.
- [ ] Guard test: every input combination resolves; table ends in a terminal rule.
- [ ] Mode G p95 time-to-first-visible-words ≤ 3.5 s (metric-evidenced) before under-consent-age default-on.
- [ ] Risk-promotion policy: a T2 flag on a mode-S minor conversation promotes it to G within the same session (break test).
- [ ] Wrong-language tripwire: forced-English reply to a `pl` profile triggers exactly one hardened retry (break test).
- [ ] Coverage reconciliation: synthetic dropped-dispatch test produces the alert metric (break test — silent-recovery ban).
- [ ] No judge call for real learner data can resolve to a Gemini config (guard test on judge flow labels × rule table).
- [ ] Judge degradation paths emit `judge.degraded` structured metrics (queryable in Sentry/logs).

## 10. Open rulings

1. **Adult-only (verified 18+) Gemini eligibility.** The Gemini/Vertex block is written at the *under-18* level, so adults are not *per se* excluded — **but** the GCP terms test is *app-audience* level ("directed towards or likely to be accessed by under-18"), and this app plainly is likely-accessed-by-minors (child/family profiles). Whether adult-only routing *inside a mixed-audience app* survives that test is a legal ruling owed before any Gemini row is added; it also requires robust 18+ age assurance. **Until ruled, Gemini/Vertex stays fully excluded.** If permitted, `FALLBACK_FORBIDDEN` (and the primary matrix) becomes age-conditional: Gemini banned for under-18, allowed only for verified-18+.
2. **Guardian notification** on accumulated suitability flags: internal-only vs notify (privacy-vs-oversight; plumbing supports either).
3. **Verdict retention period** — set inside the E5 DPIA work, not this spec.
