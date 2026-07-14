# Launch Posture Decision Brief — The Four Dials

**Date:** 2026-06-05
**Status:** Decision-support. **Nothing in here is decided.** When the dials are ruled, this brief becomes the body of an `MMT-ADR`, and the stale "Strictly 11+" constraint in `CLAUDE.md` gets reconciled in the same change-set.
**Sources:** `2026-06-04-age-floor-decision-minutes.md` (evidence, country matrix, implementation audit) · `minors-compliance-requirements.md` (the priced checklist with Where/Who scope tags).

---

## The shape of the decision

"What level do we launch at?" is not one decision — it is **four dials**. Three have near-forced defaults; only one contains a genuine open question.

| Dial | Default | Genuinely open? |
|---|---|---|
| 1. Age floor | 13+ | **The only real question — see below** |
| 2. Consent strictness | Keep parent consent for everyone ≤16, location-blind (already built) | No — relaxing it later is a UX optimization, not a launch decision |
| 3. Country set | Locale-driven allowlist minus the store-block rows | Only at the edges (which extra English-speaking markets) |
| 4. LLM provider route | OpenAI/Anthropic API with DPA + no-training; no Gemini API | No — forced by provider terms |

---

## Dial 1 — Age floor: one question decides it

> **"Will we actively market to, and build for, 10–12-year-olds in the first ~6 months?"**

- **No / unsure → launch 13+.** Cost ≈ two constants + age-gate copy (the consent infrastructure is already over-built for ≤16). List B — the 8-item US under-13/COPPA stack (verifiable-parental-consent vendor, COPPA legal review, written infosec program, child retention program…) — stays dormant. The under-13 bounce counter at the age gate (guardrail #2 in the minutes, embedded in requirement A7) measures real under-13 demand from day one, so the decision to ever fund List B is later made with data instead of belief.
- **Yes (conviction that 10–12 is core) → still launch 13+ now**, and green-light the under-13 phase as a deliberate follow-on project. Launching *below* 13 on day one is dominated in every scenario: it delays launch by the full List B build, for a segment with zero demand evidence — and the minutes' §1 product-fit finding says the current product does not serve a 9–10-year-old anyway (reads-to-learn assumption, early-teen voice register, young-child machinery deliberately removed in commit `970a82a5`). Under-13 is a **product phase**, not a compliance toggle.

**Why the asymmetry settles it:** lowering the floor later is purely additive (build List B, flip `MINIMUM_AGE`); raising it after launch means expelling enrolled children. Reversibility runs one way and measurement is free, so the cheap floor wins *at launch* regardless of conviction — conviction only changes **when the under-13 project starts** ("when the bounce data says so" vs "immediately after launch").

---

## Dial 2 — Consent strictness: keep the over-compliant shape

The build already asks parent consent for **everyone ≤16, location-blind**. That is stricter than the law everywhere in scope (a Norwegian, UK, or US 13-year-old may legally self-consent) — and it is exactly what makes Dial 3 cheap, because it satisfies every "in-app parent gate" row of the country matrix without any per-country logic.

**Keep it at launch.** The only cost is UX friction for self-consent-age teens. Instrument **consent-gate abandonment** from day one (same pattern as the under-13 bounce counter). Relax to per-country consent ages only if that number says the friction is material — and that relaxation is pure code (a policy table), no new legal work.

---

## Dial 3 — Country set: derive it from the locales you already paid for

The 7 UI locales are a revealed preference for the launch markets. Mapped through the minutes' country matrix, with the ≤16 location-blind gate covering every parent-gate row:

| Locale | Markets it implies | Verdict under the current consent shape |
|---|---|---|
| nb | Norway | ✅ self-serve at 13 (over-gated today — fine) |
| en | US, UK, Ireland | ✅ US/UK 13; Ireland 16 — covered by the ≤16 gate |
| de | Germany, Austria, Switzerland | ✅ 16 / 14 / conservative-16 — all covered by the ≤16 gate |
| pl | Poland | ✅ 16 — covered |
| es | Spain | ✅ 14 — covered. **LATAM Spanish markets stay OFF** (store-block / counsel-gate rows) |
| pt | Portugal | ✅ 13 — covered. **Brazil stays OFF despite the locale** (ECA Digital store-block row) |
| ja | Japan | ✅ the conservative ≤16 gate matches the PPC-guidance posture |

- **Optional cheap adds** (English-served, matrix-green under the ≤16 gate): Canada, Australia, New Zealand.
- **Hard store-blocks regardless of locale:** Brazil, India, Mainland China, Russia, unmapped LATAM.
- **US note:** the state App-Store-Accountability laws (requirement A19) ride on top regardless of consent shape — platform age-signal API integration, tracked in the requirements doc.

**One code prerequisite before this dial is real:** the app collects no country of residence today (gap 2 in the minutes' implementation check — only coarse `EU | US | OTHER` exists). Add declared residence at profile creation + store the policy-versioned decision snapshot. Store-level exclusion of blocked countries is just a console setting.

---

## Dial 4 — Provider route: effectively forced

- **Google Gemini API / Cloud gen-AI:** not usable for a teen-facing app under current default terms (minutes §5 provider table) — needs written Google permission or different terms.
- **OpenAI / Anthropic API:** plausible with DPA, no-training/retention controls, and child-safety safeguards.
- **Self-hosted:** fallback; avoids the permission problem, inherits the full quality/safety/eval burden.

**Implementation consequence (verified in code 2026-06-05):** Gemini is a live provider lane today — `apps/api/src/services/llm/providers/gemini.ts`, wired through `router.ts`, and `CLAUDE.md`'s routing policy still says "Family standard remains Gemini-only." If this dial is ruled as researched, those lanes must be re-pointed before launch. That re-routing is engineering work no compliance doc currently tracks as a work item.

---

## What ruling each dial unblocks

| Ruled | Unblocks |
|---|---|
| Dial 1 (floor) | `MINIMUM_AGE` + copy + bounce instrumentation; store age-rating answer (minutes' open item P2); the `MMT-ADR`; `CLAUDE.md` reconciliation |
| Dials 1+3 | The launch policy config (minutes §6's ask): country → availability / floor / gate-band table, later consumed by code |
| Dial 3 | Store country-availability settings in both consoles |
| Dial 4 | Provider DPA execution (requirements A11/A12) + the Gemini lane re-routing work item |

---

## The one question to answer

> **Will we actively market to and build for 10–12-year-olds in the first ~6 months — yes or no?**

Everything else above is a default you can adopt by silence.
