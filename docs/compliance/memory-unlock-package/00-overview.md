# Memory-Unlock Evidence Package — Overview

**Controller:** ZWIZZLY AS, Oslo, org.nr 811 696 072
**Product:** MentoMate
**Package version:** Draft v0.1, 2026-08-07 — **internal draft for operator review; not yet sent to the DPO**
**Prepared for:** Stephan Hartmann, external DPO (designate)

---

## 1. Purpose and scope

The DPO's interim advice of 2026-07-26 imposes the operating condition that **persistent memory and profiling stay disabled until legal basis, controls, transparency and retention are approved**. On 2026-08-07 the DPO confirmed the exact evidence set that lifts this condition and invited its assembly and submission:

> The evidence package for lifting the specific interim condition on persistent memory and profiling should cover:
> - Action 3, insofar as it concerns residence determination, age assurance and the controls governing which users may access the memory function;
> - Action 4, including the specific purposes and legal bases for memory and profiling, the consent and withdrawal design where consent is relied upon, the relevant records and the consequences of withdrawal;
> - the memory-relevant elements of Action 5, particularly the Article 9 position and evidence that sensitive or safeguarding-related content is suppressed or excluded from persistent memory where required;
> - Action 6, including retention and deletion rules for raw content, derived profiles, summaries, embeddings, backups and any provider-held copies; and
> - the memory-specific elements of Action 13, particularly the child-facing explanation, interface disclosures and transparency concerning what is remembered, why it is remembered, how it affects the service and how the user can inspect, correct, disable or delete it.

The full Article 35(9) consultation/testing programme is excluded from this closure set, **except** proportionate testing that the memory disclosures are understandable to the intended child users (protocol proposed in the A13 section). The unlock overrides no other gate: any provider, model, endpoint, embedding service or storage recipient used for memory must also satisfy Actions 7–10 before receiving production learner data; guardian visibility into remembered information engages Action 12; public launch remains subject to the consolidated DPIA (Action 14).

## 2. Package contents

| File | Element | One-line status |
|---|---|---|
| `a3-access-controls.md` | A3 — residence, age assurance, memory-access controls | Age assurance strong (server-side 13+ floor, exact-DOB, WI-3019 landed); memory access fail-closed per profile; **residence determination is the weakest leg — no in-app residence collection or gating exists** |
| `a4-legal-basis-consent.md` | A4 — purposes, legal bases, consent + withdrawal | Purposes P3/P4 documented on Art 6(1)(a) consent; distinct consent moment + off-switch + fail-closed enforcement all shipped; **the consent leaves no Art 7(1) evidence record** (remedy planned, WI-2928); withdrawal design implemented with honestly-stated limitations |
| `a5-art9-suppression.md` | A5 (memory slice) — Art 9 position, suppression/exclusion | A real server-side, transaction-enforced, fail-closed suppression gate exists for person-attributed clinical/diagnostic text, plus special-category redaction at every provider egress; **no tripwire-to-memory firewall** (headline control finding); Art 9(2) condition determination is the advice requested |
| `a6-retention-deletion.md` | A6 — retention and deletion by category | Deletion mechanisms implemented and code-verified; 30-day raw-transcript purge running in production with recorded run evidence; **retain-tier retention periods unset (counsel-owned)**; provider-held-copy windows depend on Actions 7–9; backup window + PITR drill outstanding |
| `a13-transparency.md` | A13 (memory slice) — child-facing transparency + comprehension testing | The live mentor-memory screen already delivers inspect/correct/disable/delete with audited plain-language copy; child-notice memory section drafted, deliberately uninserted until unlock; **no comprehension testing has ever been run** — proportionate protocol proposed for approval |

Each section states the DPO's verbatim element scope, the current position, a cited evidence inventory, a narrative account, and numbered gaps with proposed remediation. Drafting discipline throughout: every product-factual claim cites a repository document or a directly-read `file:line`, or is explicitly marked `[GAP: …]`; planned work is labelled planned with its tracking reference and never described in the present tense.

## 3. The central disposition question (read first)

One finding is cross-cutting and the DPO should rule on it before, or together with, the element-level material:

**The interim "memory disabled" condition has no implementing gate in code.** The `MEMORY_FACTS_*` environment flags are storage-generation selectors, not a feature switch; memory read, write and prompt-injection paths are live, gated solely by per-profile, fail-closed consent (`memory_consent_status` defaults `'pending'`, collection defaults `false`, every consuming path re-checks). The condition is factually held today by those defaults plus the pre-launch zero-user state. On 2026-08-05 the operator ruled **provisionally** that this per-profile fail-closed consent gating satisfies the interim condition and that no global kill-switch is required — explicitly accepting rework risk. That ruling is **pending DPO ratification (operator queue item OPQ-169)**, and this package is the vehicle for it.

The ask: **either ratify** the provisional position (memory ships consent-gated; the condition is lifted upon approval of this package and closure of its blocking gaps), **or require a genuine park**, in which case a real gate must cover the read, write and JSONB prompt-injection fallback paths and the launch-visible memory copy must be reworded in the same change-set (full enumeration in the WI-2919 audit, cited in A3/A13).

## 4. Consolidated gap register

Gaps needing a **DPO ruling** (no engineering can close them):

| # | Question | Section |
|---|---|---|
| R1 | Ratify or reject the provisional interim-condition disposition (OPQ-169) | Overview §3; A3 Gap 6; A4 Gap 6; A13 Gap 10 |
| R2 | Is teen (13–17) owner self-grant of memory consent the intended Art 8 design in threshold-13 countries — and what record must distinguish guardian grants from learner grants? | A4 §1 caveat, Gap 3; A3 Gap 4 |
| R3 | Art 9(2) condition determination for incidental special-category handling (the Action 5 advice deliverable) | A5 §Art 9 position, Gap 7 |
| R4 | Retain-tier retention periods (`consent_receipt` / `deletion_audit` / `financial_record`) — counsel/DPO values for the NULL columns | A6 Gap 1 |
| R5 | Are session embeddings part of "persistent memory" for consent purposes (then the memory-consent gate must be symmetric), or session-continuity data outside it? | A5 Gap 6 |
| R6 | Dormancy: is "life of person" the deliberate retention rule for derived profiles/memory, or is an age-out required? | A6 Gap 6 |
| R7 | Approve (or amend) the proportionate comprehension-testing protocol, including the locale position | A13 §5 |

Gaps needing **engineering** (proposed remedies in the sections; several need new Cosmo work items):

| # | Work | Section | Tracking |
|---|---|---|---|
| E1 | Memory consent into the consent log: `consent_grant` purpose + version + grantor; remove the implicit grant path; surface the control on Privacy & data | A4 Gaps 1–5 | **WI-2928** (operator-ruled 2026-07-31; unimplemented). Prerequisite WI-2929 landed 2026-08-05 |
| E2 | Residence: collect habitual residence at onboarding and call `resolveJurisdiction()` fail-closed on general access; store-console country-availability evidence | A3 Gaps 1, 2, 7 | New WI needed; resolver exists (WI-2690); ADR basis: MMT-ADR-0052 / MMT-ADR-0055 (both Accepted 2026-08-05 — capture work in build) |
| E3 | Tripwire-to-memory firewall: exclude tripwire/crisis-flagged events from analysis input and embedding content | A5 Gap 3 | New WI needed — the package's principal open control |
| E4 | Store filtered (not raw) text in `session_embeddings.content`; memory-consent gate symmetry on the embedding step (pending R5) | A5 Gaps 5, 6 | New WI needed |
| E5 | Extend the write-gate corpus beyond health/disability; native-speaker review of the 9 non-English corpora (or restrict memory to English at unlock) | A5 Gaps 1, 2 | New WI needed |
| E6 | Deletion-propagation drill: execute the 15-item end-to-end plan incl. memory-facts assertions, retain-tier survival, PITR drill; file Neon backup-window evidence | A6 Gaps 3, 5 | WI-2390 / WI-2056 / WI-2057 partially cover; drill WI needed |
| E7 | Copy set: decision-point consent copy (duration, deletion rights, no-ads/no-training), correct/delete sentences in the child notice, in-app duration statement, journal export-promise fix — one 7-locale change-set, coordinated with the Art 50(2) W3/W7 items | A13 Gaps 2, 3, 5, 6 | New WI needed |
| E8 | Adult self-consent withdrawal surface (or notice correction); AdultSelfConsentGate mounting | A4 Gaps 7, 8 | WI-2411 (gate); withdrawal surface untracked |

## 5. Assembly and submission plan

1. Operator review of this draft (content + the R1–R7 framing).
2. Capture the new work items (E2–E7) in Cosmo so every gap carries a tracking ID before the package goes out.
3. Capture the two dated evidence artifacts the sections call for: a read-only production query evidencing no granted memory consent / no memory rows (A5 Gap 8), and the store-console country-availability screenshots (A3 Gap 2).
4. Send to the DPO with the R1–R7 questions stated up front; the package requests rulings, not only review.
5. On his corrections/confirmations: remediate, then final submission for the memory-unlock approval.

*This overview and the five sections were drafted 2026-08-07 against the repository at commit `88961bd8d` (main) and reflect the DPO's scope confirmation of the same date.*
