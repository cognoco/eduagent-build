# Handover — Counsel Walkthrough complete (2026-06-03)

**Status:** ✅ COMPLETE. All 16 legal questions + the DPIA wrapper (E5) carry a Rule / Parameter / Monitor
outcome with a `basis:` citation. Committed + pushed to `main` (`725e84694`).

**What this was:** the legal-review working session for the identity foundation — a facilitator walked a PM +
counsel through 16 questions in 5 groups (front-loaded on the structural/deletion items). Counsel ruled; several
factual premises were verified directly in code rather than trusted. This handover is for **(1) the architect**
(two ripples reopen locked decisions) and **(2) the build/launch team** (a transitive launch-blocker chain).

---

## Where everything lives

| Artifact | Path | What |
|---|---|---|
| **Decision ledger** | `identity-foundation-prd.md` → **Part 10 §I** | The authoritative record — every ruling, tagged Rule/Parameter/Monitor + `basis:`, with code-verification status. **This is the system of record.** |
| Source register | `counsel-walkthrough/SOURCES.md` | Every `basis:` citation with full URLs, grouped by question. |
| Segment-3 trail | `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md` | The counsel→specialist→judge reasoning trail for B1/B2a/B2b/B3a/B3b (judge ruling authoritative). |
| Session inputs | `counsel-walkthrough/{FACILITATOR-BRIEF,BRIEFING-PACKET,WALKTHROUGH}.md` | The brief, shared context, and script the session ran from. |
| Compliance spine (memory) | `.claude/.../memory/project_compliance_three_bucket_model.md` | The cross-cutting three-bucket model + verification log, for future sessions. |

**To read the outcome of any question:** open PRD Part 10, find the `#### I-<id>` heading (e.g. `I-C2`,
`I-A2`, `I-PB-B3a`, `I-E5`). The §I **Code-Verification Log** near the end records which premises were checked.

---

## 🚩 FOR THE ARCHITECT — two ripples reopen locked decisions

Both are verified, not speculative. Nothing about either is final until the architect rules. Resolve them in
one pass.

### Ripple 1 — PB-B3a: store-delegation does NOT discharge liability → **rephrase inv 17 v1.1**
- **Finding:** store approval of a minor's payment covers the **payment-rail leg only** (settlement, refunds,
  chargebacks, tax, purchase-capacity). Four obligations remain ours: the COPPA/GDPR **consent gate**, the
  minor's **contractual incapacity**, **supplier withdrawal/conformity** duties, and **marketing-to-minors**
  copy. So inv 17 v1.1's "no age gate of ours" **overreaches**.
- **Recommended resolution (counsel recommends; architect locks):** REPHRASE inv 17 to *"store delegation covers
  payment mechanics only; the consent gate and the marketing/contract/withdrawal safeguards remain ours"* —
  **NOT** add a new payment-blocking age gate — **PROVIDED you verify the consent gate fires on the
  LLM-disclosure trigger (not the payment trigger) in EVERY flow** (solo teen; child-on-parent-phone via Family
  Sharing; moved-country pause).
- **Also correct:** merchant of record is **Apple/Google alone**; **RevenueCat is our Art 28 processor** (adds a
  DPA duty), it does not absorb liability.
- Detail: PRD `I-PB-B3a`.

### Ripple 2 — D1: the consent ontology cannot represent cross-org consent (verified from schema)
- **Finding:** the lawful cross-org structure needs ≥2 simultaneous org-scoped governing bases per child +
  per-org withdrawal + a controller-role record for external tutors. The schema supports **none**:
  `consent_states` has **`UNIQUE(profileId, consentType)`** (`profiles.ts:357-361`), **no `organizationId`**, no
  controller-role; revoke is a global flip; `organizations`/`memberships` are unwired T1 scaffolding (org ≡
  account, no RLS — a T3 obligation). T1 added `organizationId` to `subscriptions` but **pointedly skipped
  `consent_states`** → single-org consent is by construction.
- **This is NOT a local table tweak** — it touches RLS scoping, `family_links`↔`memberships`, account-deletion
  cascades, the C1 cascade defect (which it multiplies), and the V0/V1 identity migration. Bolting
  `organizationId` onto consent while leaving the UNIQUE constraint + unwired RLS in place = **the PR-376
  half-migration anti-pattern.**
- **Gate:** no feature that puts a child's data in a second org (E12 v1 family-join, or any external-tutor/group
  feature) may ship until the basis layer holds ≥2 org-scoped consents + per-org withdrawal + a controller-role
  record. Needs full deep-scope enumeration + architect sign-off before any schema touch.
- Detail: PRD `I-D1`.

**Note:** C2 (parent-delete) and C4 (child erasure) did **NOT** ripple — both *confirmed* their invariants
(inv-21 and inv-20 respectively). The architect does not need to reopen those.

---

## 🔒 FOR THE LAUNCH TEAM — the transitive launch-blocker chain

E5 (the DPIA) is the launch gate, and its residual-risk verdict depends on four builds — so **A1, A2, C1,
B3-3a, and GATE-1 are all transitively launch-blocking.** The gate is not "write the DPIA"; it is **"DPIA
complete and residual risk acceptable (or Datatilsynet Art 36 prior-consultation done)"** — unreachable until:

1. **Per-vendor Chapter V transfer mechanism + executed Art 28 DPAs.** Verified: only **Google LLC is
   DPF-certified**; **OpenAI + Anthropic need SCCs + a Transfer Impact Assessment**. Resilient floor = SCCs+TIA
   for *all* (DPF is upheld but under CJEU appeal — Schrems-III tail risk). **OpenAI requires ZDR before any
   minor's data flows.** (GATE-1, A2, B3-3a)
2. **Minor-status routing gate.** Routing is **tier-keyed, not age-keyed** (`session-exchange.ts:215-257`) →
   children currently reach **all three** vendors. Pin minors to one papered endpoint (Vertex) + a guard test.
   (GATE-1)
3. **C1 consent-cascade fix.** Capture the consent/deletion receipt into a **non-cascading retain-tier at
   event-time** (not delete-time — the dormancy path has no request context 30d later), at **profile
   granularity**. Sweep all 3 delete paths + forward-only guard. (C1, C3)
4. **Consent model + `lawfulBasis` field.** The per-purpose/per-grant consent model and a recorded lawful basis
   **do not exist** (verified: 0 matches). Until built, the Art 5(2)/7(1) accountability gap is a live finding.
   (A1, A2)
5. **COPPA §312.8 written security program** — **22 Apr 2026 deadline already passed → a PRESENT blocker**, not
   a roadmap item. (E5)
6. **DPO appointment** (Art 37(1)(b) mandatory) + **Art 50 "you're talking to an AI" disclosure** (due
   **2 Aug 2026**, not deferred). (E5)

**NOT a mid-2026 launch gate:** the AI-Act high-risk **provider conformity regime** is deferred to **2 Dec 2027**
(Digital Omnibus, provisional agreement 7 May 2026, binding on OJ publication — until then the un-amended 2 Aug
2026 date technically stands). **Scaffold the Art 9 RMS now; don't gate launch on it.** Live AI-Act *at launch* =
**Art 5** (the emotion-inference invariant), **Art 50** transparency, **GPAI/processor chain**.

**FRIA (Art 27) does NOT stack** for a B2C self-operated tutor (deployer-side, public-service/credit/insurance
only) — the trip-wire is roadmap **D1 schools**. Art 9 RMS ≠ Art 27 FRIA ≠ GDPR Art 35 DPIA — three distinct
instruments; run one integrated workstream producing separate artifacts.

---

## 📋 Defect queue (PM → Notion)

| Defect | Source | Notes |
|---|---|---|
| C1 consent-cascade (3 delete paths destroy the receipt) | C1/C2/A2 | `onDelete:'cascade'` `profiles.ts:319-321`; write-then-delete `consent.ts:898-901`; no retain-tier |
| C2 "NO-as-built": export unenforced, no delete-actor audit, single-owner ignores 2nd HPR | C2 | `privacy.tsx:138-147` vs `:150-154`; `assertOwnerProfile` |
| C4: parent read/export never age/best-interests-gated | C4 | **material for Norway**; verified `dashboard.ts:79-427` |
| C4: no competent-minor (13–17) self-erasure path — hard-gated at 18 | C4 | `assertCanManageOwnConsent`, `family-access.ts:76-106` |
| C4: consent never refreshed at any age transition | C4 | verified `consent.ts` — no scheduler |
| GATE-1: no DPA/Chapter V/ZDR for any LLM vendor + routing reaches all 3 | GATE-1 | pre-launch blocker |
| A2: no `lawfulBasis`/`termsAccepted` field anywhere | A2 | Art 5(2)/7(1) — holding moot until built |
| Minimisation: transcript in Inngest payload (H1), Sentry minor output (M1), "don't send my name" toggle | GATE-1 | Art 5(1)(c)/25 |

**Verified PII egress correction (feed the DPIA inventory):** the LLM receives more than name+transcript — also
**pronouns, memory facts (struggles/strengths/interests/pace), mastery/retention data, vocabulary, accommodation
mode**. Struggles/interests/accommodations are **Art 9-adjacent** (health/SEN). Raw age/birthYear is **NOT**
sent (`getAgeVoice` tone band only).

---

## 🧪 CI guards to install (ratchet like `persona-fossil-guard` / `safe-non-core.guard`)

1. **Parent→child `sessionEvents.content` negative-content guard** — fail CI if `getChildSessions`,
   `getChildSessionDetail`, `listRecapsForParent`, or `getRecapForParent` returns raw transcript. *(The OSA
   out-of-scope conclusion rests on this invariant — E2.)*
2. **Affective-vocabulary static-analysis guard** — fail CI on emotion terms (frustration/mood/anxiety/affect/
   sentiment/engagement-as-feeling) in the learner-state schema or LLM-signal output. *(E1-bis.)*
3. **Voice = transcription-only assertion** — the voice pipeline emits only `{transcript, start_ts, end_ts}`; no
   model consumes raw waveform/prosody for an affect label. *(E1-bis — exits AI-Act L1/L2 + GDPR Art 9 at once.)*
4. **C1 forward-only receipt-preservation guard** — consent receipt survives every profile-delete path.
5. **Double-billing disclosure copy-snapshot** — the join-flow 5-point warning can't silently regress to a
   buried link. *(E4.)*

---

## 📡 Monitors (revisit triggers)

- **AI-Act high-risk date** — Omnibus 2 Aug 2026 → 2 Dec 2027, binding on OJ publication. (E5-M2, A1-M1)
- **EU-US DPF durability** — valid + upheld (*Latombe*), under CJEU appeal C-703/25 P → keep SCCs+TIA for all
  vendors. (E5-M1)
- **Vendor minors-data / ZDR terms** — OpenAI ZDR mandatory; Anthropic 2y on flagged; re-pull before relying.
  (E5-M3, GATE-1)
- **UK Children's Wellbeing & Schools Act 2026** (s.214A/s.72 → Art 8ZA) — **primary** age-assurance watch (NOT
  the Crime & Policing Act, which is illegal-content only). (E2)
- **Norway digital-consent age 13→15** consultation — widens the can't-self-consent band. (E3, B1)
- **D1 consent-ontology adequacy** across the T1→T3 migration — before any 2nd-org feature. (D1-M1)
- **Cross-org / US-state minor laws, EU Digital Fairness Act, FTC negative-option re-promulgation** — per launch
  market. (E4-M1/M2/M3, A1-M2)

---

## 🧠 The methodology lesson (carry into the DPIA)

Of **7 load-bearing code premises checked, 2 would have misled us**: the routing keystone was *false* (children
reach all 3 vendors, not just Gemini), and the PII inventory was *understated* (Art 9-adjacent data leaves to
the LLM). On the legal side the two biggest factual moves — the **AI-Act high-risk date** and **DPF being upheld
not under-challenge** — shifted the calendar, not just wording. **Every conclusion resting on "the code does X"
was verified in source; the same discipline applies to the DPIA's own factual assertions before launch.** See
the §I Code-Verification Log (V1–V7) for the audit trail.

---

## Housekeeping done
- **REQ-2 label-drift resolved** — Phase-B namespaced `PB-B1…B3b` with a crosswalk in the ledger.
- **G1–G4 resolved** — A1→G1 (REQ-1), the register→G2 (REQ-2), DPIA/E5→G3 (REQ-3), FLAG-2/PB-B1→G4.

## Next session should
1. Take the **two ripples** (inv-17 rephrase, consent-ontology gap) to the architect in one pass.
2. Sequence the **launch-blocker chain** (transfer stack + minor-routing first; they unblock the DPIA verdict).
3. Open the **DPIA** as the integrated risk workstream (DPIA now + Art 9 RMS scaffolding toward Dec 2027).
4. File the **defect queue** in Notion and install the **5 CI guards**.
