# Capture Ledger — Under-13 Floor Walkthrough

> **Live-walkthrough capture document.** Populated in real time during the
> walkthrough session. The structure is pre-populated; the rulings are
> filled in by the facilitator (architect) as the room decides.
>
> **Capture convention:** verbatim counsel language where possible; 1–3
> sentence rationale; dissent / caveats noted explicitly; PM and counsel
> sign off at end of session.

---

## Walkthrough metadata

```yaml
walkthrough: under-13-floor
date: [YYYY-MM-DD]
facilitator: [architect name]
pm: [PM name]
counsel: [counsel name, firm, jurisdiction if multi-jurisdictional]
duration: [60–90 min]
briefing_packet: BRIEFING-PACKET.md
synthesis: SYNTHESIS.md
sources: SOURCES.md
related_handoff: _handoffs/2026-06-XX-under-13-floor-ruling.md (to be authored post-session)
```

---

## Rulings

### Ruling: Q18 — Structural vs. prompt controls

> Has any regulator explicitly stated that prompt-level controls are insufficient for under-18 protections? This question gates Q19.

```yaml
ruling: YES | NO | UNCLEAR | split
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
counsel_signoff: ""
```

**Implications of the ruling:**

- **YES** → engineering floor (Section 4 of briefing packet) becomes the binding floor. Gap B (output classifier) is mandatory. Q19b cost comparison is computed with Gap B included.
- **NO** → statutory floor remains binding. Gap B is optional / can defer. Q19b cost comparison is computed with Gap B excluded.
- **UNCLEAR** → treat as if YES for safety; revisit if EDPB/AI Office guidance clarifies.
- **Split** → per-jurisdiction or per-platform ruling; record the split explicitly.

---

### Ruling: Q19a — Partial-inclusion path-defensibility

> Is there a counsel-defensible path to a partial-inclusion floor (e.g., `11+` or `9+`) for v1 in any of the four jurisdictions? Depends on Q18.

```yaml
ruling_per_jurisdiction:
  US:
    ruling: YES | NO | UNCLEAR
    conditions: ""  # if YES, what conditions (e.g., "via 3b posture, no age collection")
  UK:
    ruling: YES | NO | UNCLEAR
    conditions: ""  # if YES, what conditions (e.g., "contingent on Annex B design-seam")
  EU:
    ruling: YES | NO | UNCLEAR
    conditions: ""
  NO:
    ruling: YES | NO | UNCLEAR
    conditions: ""
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
counsel_signoff: ""
```

**Implications of the ruling:**

- **All NO** → v1 floor stays at 13+. Capture the ruling and exit the walkthrough. The seven structural gaps (Section 4) still need a workstream but as deferred work, not blockers.
- **Any YES** → proceed to Q19b for the cost comparison on the YES jurisdictions only.
- **Split (e.g., YES in US, NO elsewhere)** → the v1 floor becomes jurisdiction-aware. Major downstream work item: jurisdiction-aware `birthYearSchema`, jurisdiction-aware routing gate. Flag explicitly.

---

### Ruling: Q19b — Cost comparison

> If Q19a is YES in any jurisdiction, is the engineering cost of that partial-inclusion path materially less than the cost of holding the floor at 13+ and shipping the seven gap-fixes (Section 4) instead? Requires the parallel effort-estimation stream's findings.

```yaml
applies_to_jurisdictions: []  # from Q19a YES list
ruling_per_jurisdiction:
  US: YES_partial_is_cheaper | NO_13plus_is_cheaper | UNDECIDED
  UK: YES_partial_is_cheaper | NO_13plus_is_cheaper | UNDECIDED
  EU: YES_partial_is_cheaper | NO_13plus_is_cheaper | UNDECIDED
  NO: YES_partial_is_cheaper | NO_13plus_is_cheaper | UNDECIDED
cost_input_from_pm: ""  # PM's engineering cost estimates
cost_input_from_effort_estimation_stream: ""  # link to that stream's findings
ruling_text_verbatim: ""
rationale: ""
dissent_or_caveats: ""
captured_by: ""
captured_at: ""
pm_signoff: ""
counsel_signoff: ""
```

**Implications of the ruling:**

- **YES (partial is cheaper)** → v1 floor is set per Q19a's YES jurisdictions. ADR amendment + `birthYearSchema` flip + seven-gap remediation (selective: A, B, E, G required; C, D, F required anyway). Lockstep with `data-model.md` per `MMT-ADR-0000`.
- **NO (13+ is cheaper)** → v1 floor stays at 13+. Seven-gap remediation is full: A, B, C, D, E, F, G. `birthYearSchema` flip 11→13 (the existing Phase E cleanup task) stands.
- **UNDECIDED (cost numbers not in the room)** → defer Q19b to a follow-up walkthrough in 1–2 weeks once the parallel effort-estimation stream reports. Capture Q19a and Q18 as the only firm rulings.

---

## Verifications completed in the room

Counsel re-verifications of Bucket-B questions (Section 6 of the briefing packet). One row per verification.

```yaml
- question_id: Q1
  topic: "ICO Annex B exact wording"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q4
  topic: "California AADC (AB-2273) post-NetChoice v. Bonta"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q6
  topic: "EDPB Guidelines 05/2020 §3 paragraph-level reading"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q11
  topic: "Netflix-profile analogue — any regulator blessing?"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q12
  topic: "COPPA actual knowledge triggered by in-app chat — named case?"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q16
  topic: "FTC 6(b) order text (Sept 2025)"
  ruling_in_room: ""
  effect_on_q19a: ""
  captured_by: ""
  captured_at: ""

- question_id: Q17
  topic: "FTC April 2025 COPPA Rule final amendments — full text"
  ruling_in_room: ""
  effect_on_q19b: ""  # Q17 retention cap affects cost comparison
  captured_by: ""
  captured_at: ""
```

---

## Homework follow-ups (counsel to take away)

To be completed by counsel within 1–2 weeks of the walkthrough. One row per homework item.

```yaml
- homework_id: HW-1
  question: ""
  owner: ""
  due: ""
  status: open
- homework_id: HW-2
  question: ""
  owner: ""
  due: ""
  status: open
```

---

## Defer-to-follow-up items (Bucket C, not load-bearing for v1)

Captured for the record; not for this walkthrough's resolution.

```yaml
- defer_id: D-1
  question: "EU AI Act Art 5(1)(b) 'exploitation of vulnerabilities due to age' as applied to an LLM tutor"
  expected_resolution_window: "2026–2027 enforcement cases"
  status: open
- defer_id: D-2
  question: "AI Act Art 5(1)(f) scope — is a consumer-facing AI tutor within 'educational institutions'?"
  expected_resolution_window: "Commission guidance"
  status: open
- defer_id: D-3
  question: "Datatilsynet position on AI tutors for minors"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-4
  question: "Apple's 2024–2025 policy on LLM products aimed at minors"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-5
  question: "Google's enforcement of 2024 Generative AI policy in the under-13 context"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-6
  question: "IARC self-classification vs. COPPA 'directed to children' status — turning case?"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-7
  question: "DSA Art 28 enforcement against app stores"
  expected_resolution_window: "Commission investigation"
  status: open
- defer_id: D-8
  question: "Most recent regulator statement on platform-based age signals"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-9
  question: "Verbatim OpenAI Usage Policies for developers"
  expected_resolution_window: "TBD"
  status: open
- defer_id: D-10
  question: "Verbatim Anthropic 'products serving minors' Help Center article"
  expected_resolution_window: "TBD"
  status: open
```

---

## Downstream work-package list (Phase 4 of the orchestration plan)

To be filled in post-walkthrough, once the rulings are firm. Per the orchestration plan's Phase 4.

```yaml
- wp_id: WP-1
  work_package: ""
  owner: ""
  due: ""
  blocked_by: []
  status: open
- wp_id: WP-2
  work_package: ""
  owner: ""
  due: ""
  blocked_by: []
  status: open
```

**Standard downstream work-packages to consider** (fill in / strike as applicable):

- ADR amendment (MMT-ADR-0011 amendment or new MMT-ADR-0013) per the captured rationale
- `data-model.md` lockstep update per the ADR amendment
- `birthYearSchema` flip per the v1 floor ruling
- Reconciliation of "Strictly 11+" docs per the v1 floor ruling
- `architecture.md` carve-out update (Phase H of the roadmap) reflecting the new floor
- Seven-gap remediation workstream (A, B, C, D, E, F, G)
- ROADMAP.md Phase F.1 sub-thread update
- Memory note in `.claude/memory/`

---

## Walkthrough sign-off

```yaml
pm_signoff: ""
pm_signoff_at: ""
counsel_signoff: ""
counsel_signoff_at: ""
facilitator_signoff: ""
facilitator_signoff_at: ""
```

---

*End of capture ledger. Populated during the live walkthrough; the post-walkthrough handoff (`_handoffs/2026-06-XX-under-13-floor-ruling.md`) is generated from this ledger within 24 hours.*
