# Facilitator Brief — Under-13 Floor Walkthrough

> **For the facilitator (the architect) only.** This is the operational
> brief for running the 60–90 minute live walkthrough. It is *not* the
> participant brief — participants read `BRIEFING-PACKET.md`. This file
> gives the facilitator the agenda, the time-boxes, the dependency
> ordering, the ruling format, and the opening/closing scripts.

---

## Audience and roles

- **Primary audience: PM (the product owner).** Plain English.
  Acronyms in the briefing packet are expanded on first use per
  section; assume the PM has not been steeped in GDPR / COPPA / AI Act
  vocabulary.
- **Informed reader + verifier: live legal counsel.** Their job is to
  re-verify the unverified citations (Section 5 of the briefing packet)
  and to rule on the Bucket-A questions (Section 6 of the briefing
  packet). They are *not* the primary explainer for the room.
- **Architect (the facilitator).** You. Your job is to keep the room on
  the time-box, surface the dependency between Q18 and Q19, and capture
  rulings into `CAPTURE-LEDGER.md`.

---

## Suggested agenda (60–90 minutes)

| Block | Duration | What | Material |
|---|---|---|---|
| **0. Opening + verification status** | 5 min | Verify who is in the room. Surface the "what is verified, what is unverified" framing. Hand counsel the Section 5 worklist. Set the time-box. | Briefing packet §1 (audience + verification status header) and §5 |
| **1. The four floors + the arguable posture** | 10 min | Walk the room through the four independent floors (statutory, engineering, platform, design-band) and the US Layer-5 3b arguable posture. Plain English, no legalese. End with the one-sentence headline. | Briefing packet §1 |
| **2. Six-Layer Constraint-Sets Venn** | 10 min | Walk each layer in plain English, focusing on the layer's *role* (statute vs. regulator vs. platform vs. store vs. account vs. LLM overlay) rather than reciting every bullet. Highlight the **two headline findings**: (a) "Headline finding (this layer) — read as a *negative* finding" in Layer 1, and (b) "Headline arguable finding (US, weakest of the four regimes but a real foothold)" in Layer 5. | Briefing packet §2 |
| **3. The seven structural gaps** | 10 min | Walk the table. For each gap: what it is + the cite + which layer's floor it honors. End with the "cost framing, not feasibility framing" line. | Briefing packet §4 |
| **4. Q18 ruling** | 10 min | The structural-vs-prompt question. This is the architectural gate. Counsel rules: does any regulator say prompt-level is insufficient? | Briefing packet §6 Q18 |
| **5. Q19a ruling** | 10 min | The partial-inclusion path-defensibility ruling. Depends on Q18. Counsel rules: is there a counsel-defensible path to a sub-13 floor in any jurisdiction? | Briefing packet §6 Q19a |
| **6. Q19b ruling** | 15 min | The cost-comparison ruling. Depends on Q19a. Requires the parallel effort-estimation stream's findings. Counsel rules (with PM input on the engineering cost): is partial-inclusion materially cheaper than 13+? | Briefing packet §6 Q19b |
| **7. Closing + capture** | 5–10 min | Record rulings into `CAPTURE-LEDGER.md`. Identify homework follow-ups. Identify the downstream work-package list (Phase 4 of the orchestration plan: T1 revert, `birthYearSchema` flip, ADR amendment, `architecture.md` carve-out). | `CAPTURE-LEDGER.md` (to be authored post-walkthrough) |

**Time-box discipline:** if Q19b runs over, that is acceptable — Q19b is the most consequential question and the one most likely to need iteration. If the opening or Layer walkthrough runs over, cut the matrix walkthrough (Section 3 of the briefing packet) — the matrix is a visual aid, not a load-bearing input.

---

## Opening script (5 min, read verbatim or paraphrase)

> "Thanks for making the time. The question we're here to rule on is: should our v1 lower the age floor below 13, and if so, in which jurisdictions and under what conditions? We have three rulings to make today: Q18, Q19a, Q19b. Q18 gates Q19, and Q19 splits into two sub-rulings, so the order matters.
>
> A note on what this briefing is and isn't: it's a *brief*, not a legal memo. The plain-English version is in Section 1, the six-layer framework is in Section 2, the seven engineering gaps are in Section 4, and the 19 open questions are triaged into three buckets in Section 6. Three of those questions are what we're deciding today. The other 16 are homework or defer.
>
> A note on verification: I should be honest about what we directly confirmed and what we didn't. The regulators' primary pages — FTC, ICO, EDPB, Datatilsynet, even the EU AI Act text — were partly 403'd or 302-redirected when our research agents fetched them. The URLs in Section 5 are real and authoritative, but the exact text of a handful of citations is pending counsel verification. **Counsel, I'd ask you to take Section 5 as the verification worklist** — re-verify the unverified primaries in the room, and we can adjust the briefing in real time if anything turns up.
>
> Finally, a framing note. The four jurisdictions we care about — US, UK, EU, and Norway — do not split children under 13 into sub-categories in the law. That is the most likely answer to the question we're here to rule on. But it is not the only constraint. We have an engineering floor, a platform floor, and a UK design-band seam. We also have one arguable posture in the US — the Layer 5 3b question — that is the only place in the briefing that opens room for a sub-13 floor in the US specifically. The walkthrough's job is to weigh these together and rule.
>
> Time-box: 60 to 90 minutes. Let's go."

---

## Closing script (5 min, after Q19b ruling)

> "To close, let me read back the three rulings:
>
> - Q18 (structural vs. prompt): [counsel's ruling]
> - Q19a (partial-inclusion path-defensibility): [counsel's ruling, per jurisdiction if ruling splits]
> - Q19b (cost comparison): [counsel's ruling, with PM's engineering-cost input]
>
> If the rulings are split or contingent, identify the contingency now and assign an owner to resolve it.
>
> The downstream effects of whatever we just ruled:
>
> 1. If Q19a is YES in any jurisdiction, we amend the relevant ADR (most likely MMT-ADR-0011 or a new MMT-ADR-0013) and the `birthYearSchema` flip moves from 11→13 to 11→[new floor] or stays at 13+ depending on the ruling.
> 2. Either way, the seven structural gaps in Section 4 are real and need a workstream — they are not contingent on the floor ruling.
> 3. The 'Strictly 11+' docs flagged in the Phase E cleanup need reconciliation; the target reconciliation depends on what we just ruled.
> 4. The Phase F sub-thread this walkthrough sits on produces a `_handoffs/2026-06-XX-under-13-floor-ruling.md` and an update to `ROADMAP.md`.
>
> Homework for the Bucket-B questions: counsel, please prioritise Q1 (ICO Annex B) and Q17 (FTC April 2025 COPPA amendments) for re-verification. Q1 is the load-bearing unverified citation; Q17 affects the engineering cost side of Q19b.
>
> Thanks all. I'll capture the rulings into the ledger within 24 hours and circulate."

---

## Ruling format for the capture ledger

Each Bucket-A ruling should be captured with the following structure:

```markdown
### Ruling: Q18 — structural vs. prompt

- **Ruling:** YES | NO | UNCLEAR | split
- **Ruling text (verbatim from counsel):** "[exact words]"
- **Rationale (1-3 sentences):** [why]
- **Dissent / caveats:** [if any]
- **Captured by:** [facilitator name]
- **Captured at:** [timestamp]

### Ruling: Q19a — partial-inclusion path-defensibility

- **Ruling per jurisdiction:**
  - US: YES | NO | UNCLEAR (with conditions if YES)
  - UK: YES | NO | UNCLEAR (with conditions if YES)
  - EU: YES | NO | UNCLEAR (with conditions if YES)
  - NO: YES | NO | UNCLEAR (with conditions if YES)
- **Ruling text (verbatim from counsel):** "[exact words]"
- **Rationale (1-3 sentences per jurisdiction):** [...]
- **Dissent / caveats:** [if any]
- **Captured by:** [facilitator name]
- **Captured at:** [timestamp]

### Ruling: Q19b — cost comparison

- **Ruling per partial-inclusion path (Q19a YES only):** YES | NO | UNDECIDED
- **Cost input from PM:** [the engineering cost estimates that drove the ruling]
- **Ruling text (verbatim from counsel):** "[exact words]"
- **Rationale:** [...]
- **Dissent / caveats:** [if any]
- **Captured by:** [facilitator name]
- **Captured at:** [timestamp]
```

---

## Fallbacks if the time-box is blown

- **If Q18 cannot be ruled in 10 min:** capture the discussion, mark Q18 as "needs follow-up," and proceed to Q19a with Q18 marked as "counsel to confirm in writing within 48 hours." Do not let Q18's open status block Q19a.
- **If Q19a splits across jurisdictions (e.g., YES in US, NO elsewhere):** the v1 floor is then jurisdiction-specific. Flag this as a major downstream work item — a jurisdiction-aware `birthYearSchema` and a jurisdiction-aware routing gate become required, not optional. Capture the split explicitly.
- **If Q19b is UNDECIDED because the parallel effort-estimation stream hasn't reported:** rule Q19a only, defer Q19b to a follow-up walkthrough in 1–2 weeks once the effort numbers are in. Do not guess on cost.

---

## What the facilitator should *not* do

- **Do not explain the law for counsel.** The briefing packet's Section 5 is the verification worklist; counsel verifies, you capture.
- **Do not propose product or architecture decisions.** Your job is to keep the room on the dependency-ordered ruling sequence (Q18 → Q19a → Q19b), capture rulings verbatim, and identify downstream work-packages.
- **Do not let the room skip Q18.** The dependency is real: Q19b's cost comparison depends on whether Gap B is mandatory or optional, which depends on Q18's answer.
- **Do not pad Q19b with engineering cost speculation.** The cost input comes from the PM and from the parallel effort-estimation stream, not from the facilitator. If the numbers aren't in the room, defer.

---

## Post-walkthrough deliverables (Phase 4 of the orchestration plan)

Within 24 hours of the walkthrough:

1. **`_handoffs/2026-06-XX-under-13-floor-ruling.md`** — populated with the three Bucket-A rulings, verbatim counsel language, and the downstream work-package list.
2. **`CAPTURE-LEDGER.md`** in the walkthrough folder — same content as the handoff, formatted for the per-walkthrough audit trail.
3. **`ROADMAP.md` edit** — update the Phase F.1 sub-thread with the captured ruling, the ADR implications, and the workstream assignment.
4. **Memory note** in `.claude/memory/` — the captured ruling, the rationale, and a link to the handoff. This is the durable record that survives the session.

If the ruling is YES in any jurisdiction, also:

5. **ADR amendment proposal** — MMT-ADR-0011 amendment (data-model realisation) or new MMT-ADR-0013 (under-13 floor ruling) per the captured rationale. Lockstep with `data-model.md` per the canonical-doc discipline (see `docs/adr/MMT-ADR-0000` for the lockstep lifecycle).
6. **`birthYearSchema` flip** — Phase E cleanup task that was previously 11→13; per the new ruling, the flip is either 11→[new floor], 11→[13 retained], or held for the parallel effort-estimation stream.

---

## What this brief does not cover

- The briefing packet content (Sections 1–6 of `SYNTHESIS.md`) — the participants read that; you don't need to know it cold, but you should be able to find any section in under 30 seconds.
- The four sub-area research returns — these are in the audit trail (`_wip/identity-foundation/under-13-floor-walkthrough/RESEARCH-CONTRACTS.md` and the captured sub-area returns). Cite them if a participant asks "where did this come from?"
- The Phase F / G / H roadmap context — the walkthrough is one decision; the roadmap is the bigger picture. Keep them separate in your head.

---

*End of facilitator brief. The walkthrough decides.*
