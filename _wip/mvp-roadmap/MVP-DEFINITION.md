# MentoMate MVP Definition — capability tree

**Status: DRAFT v0.2 (2026-07-09) — evidence-complete, ready for ratification review.** Canon + compliance evidence passes folded in (agents canon-surface / compliance-floor, cited per node). Remaining `⧖` markers = deliberate ratification questions or Phase-3 code-verification items, not missing research. **Not ratified.** Ratification: Zuzka (product) + Jørn (operator) — Phase-2 exit of `PLAN.md`.

**How to read a node:** `IN` = MVP fails without it · `DEGRADED` = ships reduced, named reduction · `OUT` = explicitly not MVP (fast-follow or killed). Every non-obvious state cites its ruling. `⧖` = state pending evidence pass.

**Launch definition (two gates, already ruled):** *store go-live* (technical launch) vs *public launch* (gated by closed beta WI-1506 with 5–10 families). "MVP" below = store go-live quality + the beta running.

---

## 1. Audiences & identity

*(Evidence: canon pass 2026-07-09 — `docs/canon/identity/ontology.md`, `prd.md`, shell spec, compliance register.)*

- **Launch account tier = credentialized only (13+, own login).** The managed tier (under-13, guardian-created charge) is **built but activation-deferred** pending a separate 10–12 audience ruling (`shell-redesign.md:250`; register:89 sets the 13+ floor). ⚠ Note: the counsel packet frames "children are a core audience (guardian-owned accounts with linked child profiles)" — under the launch posture those children are 13+ self-consenting teens. → ratification item 10 (confirm the launch family model consciously).
- Personas at launch: solo adult (first-class, highest revenue segment) · independent consent-capable minor (13+) · family operator (admin + guardian×N + Payer ± learner) · supporter (edge capacity, any age). Charge (managed minor) and managed-adult (UC-1) — built-but-dormant.
- Roles are `{admin, learner}` only; guardian/supporter are edge **capacities** (inv 5/6). Guardianship (consent authority) vs Supportership (granted visibility) structurally distinct; neither implies the other (inv 14).
- **Supporter ceiling = recap/grades layer only** — never notes, mentor memory, or transcripts, at every tier (ruled 2026-06-09, `prd.md:404-424`). Linking ceremony: symmetric visibility contract, never one-tap; credentialized supportee can revoke anytime (revocation flow flagged net-new by the spec). WI-1393 anchors closed.
- "Join my family" v1: parent invites existing 13+ teen → org join + opt-in Supportership, **no auto-Guardianship** (`prd.md:449-465`).
- Consent-denial state: **pending counsel Q2** — ruled direction = first-class "denied" dormant state distinct from withdrawal (Item 4-D2) unless counsel mandates erasure.

## 2. Onboarding & consent

- Guardian consent flow, child profile creation, solo/skip path (never force add-child) — **IN**.
- Trial preview lesson — **OUT** (Item 1 ruling 2026-07-05: revisit with funnel data). Honest substitute funnel (sample topic → marketing → signup) is the launch path.
- Email consent-withdrawal (P0) — **IN**, shipped (WI-1340 chain; prod config finalizing).
- Tutor-language picker at onboarding/settings — **IN** (ratified-13; WI-1496 + reachability).

## 3. Learner loop (the core)

- Tutoring sessions (Socratic, envelope-governed, server caps) — **IN** (live).
- Reviews / SM-2 retention loop — **IN** (live). Ratified-13 bug set attaches here: cooldown-on-completion (WI-1466), dual push-cron (WI-1461), weak-topic resurfacing (WI-1446).
- Challenge Round — **IN as built** (server-owned mastery policy); production flip + grader bake-off: bake-off (WI-1438) **IN** as a gate; the flip itself ⧖ sequencing. Two-axis mastery doctrine RULED (Item 5, 2026-07-05): SM-2 and Challenge are separate axes; blocked→scaffolded-relearn recovery ladder; fix coarse eligibility. Reconcile with proposed MMT-ADR-0031/0032 (WI-1657 spec) — one source, ADRs ratify the ruling.
- Notes / Journal — **IN** (journal redesign shipped). Note-correctness umbrella (WI-1491) **OUT** (killed as umbrella; narrow slices only, later).
- Verified-learning loop (WI-1657 spec, slices WI-1658/1665/1666…) — ⧖ **the major un-ruled scope question for ratification**: which slices are MVP vs fast-follow.
- Answer-correctness chain (WI-1443→1445) — **OUT/fast-follow** (Item 2, co-signed); narrow WI-1445 review-date fix eligible in ratified-13.
- "Coming up next" recaps — **KILLED** (Item 3).
- Freeform Ask-Anything + library filing at 5 exchanges — **IN** (MMT-ADR-0021, live).

## 4. Guardian / family loop

- Family-mode home, recaps, progress view, coaching cards — **IN** (live surfaces). Parent proof-receipts (WI-1658) ⧖ slice ruling.
- Parking-lot return — ruled resumable-object flow (Item 4-D3); build timing ⧖ (Phase-4 fast-follow in ROADMAP-A).
- Parent-on-behalf provenance (Item 4-D1) — ruled durable ownership-vs-authorship model; **schema work, Phase-4 fast-follow**.
- Child-to-parent nudges, child-allocated top-ups, parent cap-banner actions — **OUT** (killed/deferred per classification + decision pack).

## 5. Library & curriculum

- Books/topic-maps generation, shelf navigation — **IN** (live; book-gen quality gate exists).
- Prerequisites advisory-only, never lock — doctrine (WI-587). Mastery-gated progression question (WI-1662) must be ruled AGAINST this doctrine — ⧖ flag for ratification.

## 6. Languages & voice

- UI locales: 7 (en/de/es/ja/nb/pl/pt) — **IN**. Tutor-prose: 10 (superset incl cs/fr/it) — **IN**.
- Wrong-language TTS fix (WI-1447) — **IN** (ratified-13).
- Four-strands language teaching — **IN as built** (pedagogy mode live); 4-strands rework plan (2026-07-02, untriaged) ⧖ ruling: MVP-relevant or post-launch.
- Voice-first (Epic 17) — **OUT wholesale** (obsolete spec; re-scope umbrella WI-1459 post-MVP). BUT the shell spec independently rules **"voice input everywhere"** (mic on every input incl. cold-start, `shell-redesign.md:117`) and homework dictation is first-class — so the MVP voice floor = transcription-input everywhere + current TTS, NOT zero-voice. Epic-17's conversational voice-first UX stays out. → ratification item 6 sharpened accordingly.

## 7. Notifications & reachability

- Push permission wiring (WI-1441) + review/daily nudges — **IN** (ratified-13).
- Reachability T4–T6 (reciprocal nudges etc.) — **OUT** (killed/deferred).

## 8. Billing & monetization

- Free 10/day + 100/mo · Plus 700/mo dual-cap — **IN** (live).
- RevenueCat store purchases (WI-1328), store listings (WI-1335), APNs/FCM prod creds (WI-1337) — **IN**, launch-ops (OPQ-6 wave B).
- Payment-failed notify (WI-1474→G1/WI-1555) + past-due banner (WI-1475) — **IN before paid launch** (classification 2026-07-03). Billing silent-fail escalation (WI-1399) — **IN** (ratified-13).
- Annual-plan push at trial end (WI-1661), cancellation-save flow (WI-1660) — ⧖ ruling (new, unanchored).

## 9. Safety

*(Evidence: compliance-floor pass 2026-07-09, file:line cites therein.)*

- Deterministic gates — **IN, live unconditionally**: dangerous-procedure gate (full block for minors, `dangerous-procedure-gate.ts`); minor-PII echo redaction + structured Sentry alarm (`exchanges.ts:183-251`); under-18 Gemini/Vertex ban CI-guarded (`router.ts:550-559`); voice = transcription-only, no emotion inference (AI Act Art 5(1)(f) posture).
- Suitability judge — **IN**: flags ruled ON in prd (Phase-0 #2, 2026-07-07); currently default-false in `config.ts:189,200`; enablement WI-1686 captured.
- **Crisis-disclosure: ALREADY IMPLEMENTED** (WI-1358, in finalization queue) — detection → learner-facing resources, operator-alarmed telemetry, **deliberately NO guardian notification** (ruling se-032: guardian-may-be-abuser failure mode); mandatory-reporting integration deferred pending counsel Q3. **⚠ CONTRADICTION:** WI-1690 (A-03 ruling, event 33) specs "guardian notification" — reverses se-032 or is a stale restatement. Reconcile before any build; final posture is counsel-Q3-dependent either way. → ratification item 8.
- Daily blocked-safety-event digest (WI-1691) — **IN**, net-new confirmed (only per-event Sentry alarms exist today). Full guardian-notification UX + human-review queue — **OUT/fast-follow** (WI-1692).
- Flag-a-reply v1 (telemetry-only, WI-1499) + shake-to-comment — **IN** (Item 6 ruling).

## 10. Compliance & legal

*(Evidence: compliance-floor pass 2026-07-09; register = `docs/compliance/identity-compliance-register.md`; early-pass = `docs/compliance/2026-07-04-launch-compliance-closure-check-early-pass.md`.)*

**THE launch gate (C-5, register:77-81): DPIA signed + DPO appointed before the first consent-gated child onboards.** DPIA is draft v0.1 unsigned; no DPO. Everything else sequences under it:

- Controller entity contradiction (policy says Cognoco s.r.o.; DPIA/ROPA say Norway-TBD) — counsel Q1 / WI-1559; blocks privacy-policy publish.
- Privacy-policy publish TODOs (`privacy-policy.html:67-73`): DPO name, controller address, Art-27 EU rep, UK rep, final age floor.
- Age floor: 13+ locked v1 but "pending app-store rating" — cement it.
- DPIA name-minimization (first name sent verbatim to LLM, `exchange-prompts.ts:734`) — counsel Q4 / WI-1558: tokenize vs disclose.
- Consent-denial build direction — counsel Q2; current build behavior on denial NOT yet audited (pre-wire both outcomes).
- Consent audit trail before hard-delete — WI-1442. Retention-period values — counsel-owned placeholders (register:92).
- **False claims to fix pre-publish:** privacy policy §3 claims "aggregated de-identified analytics" — no such system exists; store data-safety worksheet says age 11 vs code 13 + cites legacy tables (refresh = the FINAL-GATE re-run, WI-1577 territory).
- Provider DPA signatures — process item, unverifiable from repo.
- **EU AI Act**: defensive posture is BUILT (C-2: no emotion inference, transcription-only voice, prohibition-floor primitives in MMT-ADR-0013); the classification question (Annex III high-risk?) is **open and counsel-owned** (register:100-102). WI-1659/1663/1664 have zero repo trace — Cosmo-only; size after the classification answer: plan (1659) IN; technical file/QMS (1663/1664) likely staged post-classification.
- Launch compliance closure check (WI-1507, parked) — re-runs against actual data flows at the end.

## 11. Trust package (Item 6 ruling — IN as a coherent slice)

First-week mentor plan · memory checkpoint · in-app support path (incl. shake-to-comment) · visible review promise · flag-a-reply v1. Each needs a Zuzka design pass before build; capacity-shaped. WI-1497/1498/1499/1501/1502.

## 12. Platform & quality floor

- V2 LLM-routing cutover — **IN, sequenced** (Phase-0 #1: bake-off → staging + live gates → prd flip; WI-1685; rollback = flag flip). Legacy Gemini deletion (WI-1436) — **OUT** (post-soak).
- Prompt caching program — **IN post-cutover** (Phase-0 #4; WI-1687→1688). LLM spend guardrails + kill switch (WI-1505) — **IN** (addendum ruling).
- Zero native e2e → Maestro smoke baseline (WI-1400) + auth resilience branches (WI-1406 subset) — **IN** (ratified-13).
- profileId CI guard (WI-1449, closed) — done. RLS activation — **OUT** (app-layer scoping ruled sufficient for launch).
- Observability: Sentry re-enable (WI-1336) + launch-health alerts on 6 signals (WI-1500) — **IN**. Dashboard — fast-follow.
- Activation events wiring (WI-1689) + first-party analytics sink — **IN** (Phase-0 #5 + addendum; PostHog fast-follow).
- Dogfood prod build (WI-1503) + closed beta (WI-1506) — **IN** (beta gates public launch).
- V2 shell publish readiness (WS-28 M-chain, WI-1307 fallback proof) — **IN** (the live program). S6 V0/V1 retirement — **OUT** (deferred, irreversible).
- **Shell disambiguation (statement, not a question):** two "V2"s exist — the *nav-flag* V1/V2 mode shells (`navigation-contract.ts`, shipped behind flags) and the *mentor-is-the-app* 3-tab redesign (spec S0–S3 landed, S4/S5 partial, S6 TODO; production still V0). The MVP ships **the shell state the WS-28 publish-readiness chain proves** — V2-shell-minus-S6 with V0/V1 kept as the rollback channel (WI-1307). Any doc citing "the nav model" must say which. Billing quota numbers (Free 10/day+100/mo, Plus 700/mo) are project-memory-sourced, not identity canon — treat pricing as operator-confirmable at ratification.

## 13. Explicitly OUT (consolidated kill list)

Trial preview lesson · "coming up next" recaps · note-correctness umbrella · resumable-practice engine (copy fix shipped) · child top-ups + cap-banner actions · child-to-parent nudges · rotating greeting pool · concept-star as specced (re-homed per ratified-13) · RLS activation · S6 retirement · voice-first wholesale · answer-correctness chain (fast-follow) · Item 4-D1/D3 builds (fast-follow).

---

## Open questions FOR RATIFICATION (the actual decision surface)

1. **Verified-learning-loop slices** (WI-1657 map): which of S-slices are MVP? (Biggest un-ruled scope.)
2. **4-strands rework** (untriaged plan): MVP-relevant or post-launch?
3. **Monetization captures** WI-1660/1661 (cancellation-save, annual push): MVP or fast-follow?
4. **WI-1662** mastery-gated progression vs never-lock doctrine: rule it.
5. **AI Act cluster sizing**: plan = IN; how much of technical file/QMS gates launch?
6. **Voice tension**: ruled OUT wholesale vs "voice is critical" product conviction — confirm baseline STT/TTS suffices for MVP.
7. Counsel-dependent forks (denial state, DPIA fix, crisis legal floor) — decided by counsel answers, pre-wired here.
8. **Crisis guardian-notification contradiction:** implemented se-032 posture (never notify guardian — abuser failure mode) vs the A-03 event-33 ruling wording in WI-1690 ("+ guardian notification"). Which stands? (Counsel Q3 informs; the product ruling must be reconciled explicitly either way.)
9. **Age floor cementing:** 13+ is "locked pending app-store rating" — confirm final so privacy policy + store worksheet can state it.
10. **Launch family model — confirm consciously:** launch = credentialized 13+ accounts only; managed under-13 tier stays dormant; "family" at launch means parent + self-consenting 13+ teens via join-my-family + Supportership. The counsel packet's "children are a core audience" framing must mean *13+ children* for MVP. Confirm, and confirm the closed-beta family recruitment reflects it.

### Post-launch open ends already tracked in canon (no ruling needed now, listed so they're not re-found)

VPC vendor + under-13 method · R13 guardian-attachment initiation · co-guardian one-of/all-of rule (counsel) · Family-Sharing Payer recording · below-floor teen join-my-family variant (all cited in `prd.md`/`ontology.md`/register as ROADMAP/counsel-owned).
