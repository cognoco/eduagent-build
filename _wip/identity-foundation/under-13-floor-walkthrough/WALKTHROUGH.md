# Walkthrough — Under-13 Floor

> **The live agenda for the 60–90 minute walkthrough session.** Read by
> the PM, the live legal counsel, and the architect (facilitator) in
> advance of the session. The session captures its rulings into
> `CAPTURE-LEDGER.md`.
>
> **For the facilitator's operational brief** (time-box discipline,
> fallbacks, post-session deliverables), see `FACILITATOR-BRIEF.md`.
> This document is the participant-facing version.

---

## What we're here to decide

**The question:** Should our v1 lower the age floor below 13, and if so, in which jurisdictions and under what conditions?

**The three rulings we will make today** (in dependency order):

1. **Q18** — Structural vs. prompt controls. Has any regulator
   explicitly stated that prompt-level controls are insufficient for
   under-18 protections? *(Gates Q19.)*
2. **Q19a** — Partial-inclusion path-defensibility. Is there a
   counsel-defensible path to a sub-13 floor (e.g. 11+ or 9+) for v1
   in any of the four jurisdictions?
3. **Q19b** — Cost comparison. If Q19a is YES, is the engineering
   cost of partial-inclusion materially less than the cost of
   holding 13+ and shipping the seven gap-fixes instead?

The 16 other open questions in the briefing packet are either homework
(counsel re-verifies and reports back) or defer (interesting but not
load-bearing for the v1 floor ruling).

---

## Agenda (60–90 minutes)

| Block | Duration | What happens | Reference |
|---|---|---|---|
| **0. Opening + verification status** | 5 min | Verify who is in the room. Surface the "what is verified, what is unverified" framing. Hand counsel the verification worklist (`SOURCES.md`). | Briefing packet §1; `SOURCES.md` |
| **1. The four floors + the arguable posture** | 10 min | Walk the room through the statutory, engineering, platform, and design-band floors, plus the US Layer-5 3b arguable posture. End with the one-sentence headline. | Briefing packet §1 |
| **2. The six-layer framework** | 10 min | Walk each layer in plain English, focusing on the layer's *role*. Highlight the two headline findings: (a) the Layer 1 negative finding, (b) the Layer 5 US 3b arguable posture. | Briefing packet §2 and §3 |
| **3. The seven engineering gaps** | 10 min | Walk the table. For each gap: what it is + the cite + which layer's floor it honors. End with the "cost framing, not feasibility framing" line. | Briefing packet §4 |
| **4. Q18 ruling** | 10 min | The structural-vs-prompt question. Architectural gate. | Briefing packet §5 Q18 |
| **5. Q19a ruling** | 10 min | The partial-inclusion path-defensibility ruling. Depends on Q18. | Briefing packet §5 Q19a |
| **6. Q19b ruling** | 15 min | The cost-comparison ruling. Depends on Q19a. Requires the parallel effort-estimation stream's findings. | Briefing packet §5 Q19b |
| **7. Closing + capture** | 5–10 min | Record rulings into `CAPTURE-LEDGER.md`. Identify homework follow-ups. Identify the downstream work-package list. | `CAPTURE-LEDGER.md` |

**Time-box discipline:** if Q19b runs over, that is acceptable — Q19b
is the most consequential question and the one most likely to need
iteration. If the opening or layer walkthrough runs over, cut the
matrix walkthrough (the visual aid in `SYNTHESIS.md` §3) — the matrix
is a navigation aid, not a load-bearing input.

---

## Block 0 — Opening + verification status (5 min)

**What the facilitator says (in plain English):**

> Thanks for making the time. The question we're here to rule on is:
> should our v1 lower the age floor below 13, and if so, in which
> jurisdictions and under what conditions? We have three rulings to
> make today: Q18, Q19a, Q19b. Q18 gates Q19, and Q19 splits into two
> sub-rulings, so the order matters.
>
> A note on what this briefing is and isn't: it's a brief, not a
> legal memo. The plain-English version is in Section 1 of the
> briefing packet, the six-layer framework is in Sections 2 and 3, the
> seven engineering gaps are in Section 4, and the 19 open questions
> are triaged into three buckets in Section 5. Three of those
> questions are what we're deciding today. The other 16 are homework
> or defer.
>
> A note on verification: I should be honest about what we directly
> confirmed and what we didn't. The regulators' primary pages — FTC,
> ICO, EDPB, Datatilsynet, even the EU AI Act text — were partly
> 403'd or 302-redirected when our research agents fetched them. The
> URLs in `SOURCES.md` are real and authoritative, but the exact text
> of a handful of citations is pending counsel verification. **Counsel,
> I'd ask you to take Section 5 of the briefing packet and the
> verification worklist at the bottom of `SOURCES.md` as the
> verification worklist** — re-verify the unverified primaries in the
> room, and we can adjust the briefing in real time if anything turns
> up. The most consequential one is **ICO Annex B** — the design-seam
> argument in Section 1 depends on it.
>
> Finally, a framing note. The four jurisdictions we care about — US,
> UK, EU, and Norway — do not split children under 13 into
> sub-categories in the law. That is the most likely answer to the
> question we're here to rule on. But it is not the only constraint.
> We have an engineering floor, a platform floor, and a UK design-band
> seam. We also have one arguable posture in the US — the Layer 5 3b
> question — that is the only place in the briefing that opens room
> for a sub-13 floor in the US specifically. The walkthrough's job is
> to weigh these together and rule.
>
> Time-box: 60 to 90 minutes. Let's go.

---

## Block 1 — The four floors + the arguable posture (10 min)

The facilitator walks the four floors in order, with the plain-English
framing the briefing packet uses:

1. **The engineering floor.** Seven gaps in the code; the most binding
   are the missing age gate on the AI router (Gemini breach today) and
   the two-way `AgeBracket` type that can't model a sub-13
   distinction. Even if counsel says yes, the codebase has no place to
   encode it *as-is* — the fix is bounded engineering work, not a
   feasibility veto.
2. **The platform floor.** Google's Gemini API says no under-18
   audience — a hard 18-floor on one of the three providers in our
   routing matrix. Contract term, not a law, but a real consequence.
3. **The design-band seam (UK, contingent on verification).** UK ICO
   Children's Code Annex B — if it contains the widely-cited
   five-band framing — gives 10–12-year-olds a different *design*
   treatment from 13–15-year-olds. UX constraint, not consent
   constraint. **The design-seam depends on Annex B verifying** —
   counsel to confirm.
4. **The arguable posture (US, a real foothold).** US 3b (rebuttable
   presumption) is "unclear, not no" — no regulator has blessed
   Family Sharing or Family Link as a consent mechanism, but the
   COPPA "actual knowledge" doctrine has an ignorance defense. This
   is the only line in the walkthrough that opens room for a sub-13
   floor in the US. **Counsel must rule on it.**

End with the one-sentence headline: *The most likely answer is no
(because the law is homogeneous, the engineering has no place to
encode it, and the platform floor is 18) — but the US
account-existence posture is unsettled and worth counsel's time, and
the UK Annex B design-seam is contingent on verification.*

---

## Block 2 — The six-layer framework (10 min)

The facilitator walks each layer in plain English, focusing on the
layer's *role* (statute vs. regulator vs. platform vs. store vs.
account vs. LLM overlay) rather than reciting every bullet. The
purpose is to give the room a shared mental model, not to teach the
law.

The two **headline findings** to highlight:

- **Layer 1 — the *negative* finding.** "No statute in scope contains
  sub-banding language for children under 13." Read as a *negative*
  finding (we did not find any statute that says otherwise), not as a
  positive statement that "all under-13s are explicitly one cohort."
- **Layer 5 — the *arguable* posture.** "In the US, 3b (rebuttable
  presumption) is 'unclear, not no.'" This is the only line in the
  walkthrough that opens room for a sub-13 floor in the US
  specifically.

The other four layers (2, 3, 4, 6) are presented for completeness —
they reinforce the headline but don't add new decision-relevant
content. If the room is short on time, the matrix walkthrough in
`SYNTHESIS.md` §3 is a visual aid and can be cut.

---

## Block 3 — The seven engineering gaps (10 min)

The facilitator walks the table in `BRIEFING-PACKET.md` §4 / the
synthesis §4. For each gap: what it is + the cite + which layer's
floor it honors.

End with the "cost framing, not feasibility framing" line: the
walkthrough should not hear "engineering says we cannot do
partial-inclusion"; it should hear "engineering says partial-inclusion
requires A + B + E + G, and the cost of those four items is the
variable that Q19b is asking counsel to weigh against the cost of
holding 13+ and shipping the gaps instead."

---

## Block 4 — Q18 ruling (10 min)

> **Q18 — Structural vs. prompt controls.** Has any regulator (FTC,
> ICO, EDPB, Datatilsynet, AI Office) explicitly stated that
> prompt-level controls are insufficient for under-18 protections? Or
> is the OpenAI Model Spec Root > System > Developer layering the
> strongest evidence we have, with no direct regulator statement on
> the record?

**Why this question is first.** The walkthrough cannot answer Q19b
(cost comparison) until Q18 is ruled, because Q19b's cost depends on
whether Gap B (output classifier) is mandatory or optional. If Q18 is
answered YES, Gap B is mandatory and the cost rises. If NO, Gap B is
optional and the cost falls.

**What counsel should consider:**

- The OpenAI Model Spec places under-18 protections at "Root"
  authority that developer system prompts cannot lower. This is
  strong evidence but it is OpenAI's own model-behaviour document,
  not a regulator statement.
- The Gemini API Terms flat-prohibit under-18 audience. This is a
  contract prohibition, not a regulator statement.
- The FTC 6(b) inquiry into AI-chatbot operators (Sept 2025) implies
  that crisis signals should be routed to professional resources
  structurally, not via prompt improvisation. The 6(b) order text
  has not been directly verified by us; counsel to confirm.

**Ruling options:** YES / NO / UNCLEAR / split. The
`CAPTURE-LEDGER.md` template pre-populates the ruling structure.

**Do not let the room skip this question.** If counsel cannot rule in
10 min, capture the discussion, mark Q18 as "needs follow-up," and
proceed to Q19a with Q18 marked as "counsel to confirm in writing
within 48 hours." Do not let Q18's open status block Q19a.

---

## Block 5 — Q19a ruling (10 min)

> **Q19a — Partial-inclusion path-defensibility.** Given (a) statutory
> homogeneity across all four jurisdictions, (b) Gemini's 18-floor as
> a binding platform constraint, (c) the seven unaddressed
> engineering gaps, (d) the UK ICO Annex B design seam (assuming it
> verifies), and (e) the unsettled US Layer-5 3b posture, is there
> a counsel-defensible path to a partial-inclusion floor (e.g., 11+
> or 9+) for v1 in any of the four jurisdictions?

**Ruling per jurisdiction.** Counsel rules on US / UK / EU / NO
separately. The expected ruling options:

- **YES (US only, 3b posture)** — the US 3b "unclear, not no" is the
  foothold; design the app to never collect age information, treat
  store-side account as parental gate, rely on actual-knowledge
  ignorance defense.
- **YES (UK only, contingent on Annex B)** — the Annex B design-seam
  plus 3b-ish posture in the UK (UK GDPR's "reasonable efforts"
  standard is *not* as explicit as COPPA's actual-knowledge doctrine,
  but the ICO Code's best-interests duty creates a design pressure).
- **YES (multi-jurisdiction, narrow scope)** — a narrow partial-
  inclusion (e.g. 11+ or 9+) defended across multiple jurisdictions
  on the basis of statutory homogeneity + engineering fixes + the
  store-side account presumption.
- **NO (all four)** — the safest ruling; v1 floor stays at 13+.

**If the ruling splits across jurisdictions** (e.g. YES in US, NO
elsewhere), the v1 floor becomes jurisdiction-aware. Flag this as a
major downstream work item — a jurisdiction-aware `birthYearSchema`
and a jurisdiction-aware routing gate become required, not optional.
Capture the split explicitly in `CAPTURE-LEDGER.md`.

---

## Block 6 — Q19b ruling (15 min)

> **Q19b — Cost comparison.** If Q19a is YES in any jurisdiction, is
> the engineering cost of that partial-inclusion path materially less
> than the cost of holding the floor at 13+ and shipping the seven
> gap-fixes (Section 4) instead?

**Requires the parallel effort-estimation stream's findings.** The PM
brings engineering cost estimates; counsel brings the legal-defensibility
view from Q19a. The walkthrough's job is to weigh them together.

**Ruling per Q19a-YES jurisdiction:**

- **YES (partial is cheaper)** — v1 floor is set per Q19a's YES
  jurisdictions. ADR amendment + `birthYearSchema` flip + seven-gap
  remediation (selective: A, B, E, G required; C, D, F required
  anyway).
- **NO (13+ is cheaper)** — v1 floor stays at 13+. Seven-gap
  remediation is full: A, B, C, D, E, F, G. `birthYearSchema` flip
  11→13 (the existing Phase E cleanup task) stands.
- **UNDECIDED (cost numbers not in the room)** — defer Q19b to a
  follow-up walkthrough in 1–2 weeks once the parallel
  effort-estimation stream reports. Capture Q19a and Q18 as the only
  firm rulings.

**Do not pad Q19b with engineering cost speculation.** The cost input
comes from the PM and from the parallel effort-estimation stream, not
from the facilitator. If the numbers aren't in the room, defer.

---

## Block 7 — Closing + capture (5–10 min)

The facilitator reads back the three rulings, captures them into
`CAPTURE-LEDGER.md` verbatim, identifies homework follow-ups, and
identifies the downstream work-package list (the orchestration
plan's Phase 4).

**The facilitator's closing script (in plain English):**

> To close, let me read back the three rulings:
>
> - Q18 (structural vs. prompt): [counsel's ruling]
> - Q19a (partial-inclusion path-defensibility): [counsel's ruling,
>   per jurisdiction if ruling splits]
> - Q19b (cost comparison): [counsel's ruling, with PM's
>   engineering-cost input]
>
> If the rulings are split or contingent, identify the contingency
> now and assign an owner to resolve it.
>
> The downstream effects of whatever we just ruled:
>
> 1. If Q19a is YES in any jurisdiction, we amend the relevant ADR
>    (most likely MMT-ADR-0011 or a new MMT-ADR-0013) and the
>    `birthYearSchema` flip moves from 11→13 to 11→[new floor] or
>    stays at 13+ depending on the ruling.
> 2. Either way, the seven structural gaps in Section 4 are real and
>    need a workstream — they are not contingent on the floor
>    ruling.
> 3. The "Strictly 11+" docs flagged in the Phase E cleanup need
>    reconciliation; the target reconciliation depends on what we
>    just ruled.
> 4. The Phase F sub-thread this walkthrough sits on produces a
>    handoff and an update to `ROADMAP.md`.
>
> Homework for the Bucket-B questions: counsel, please prioritise Q1
> (ICO Annex B) and Q17 (FTC April 2025 COPPA amendments) for
> re-verification. Q1 is the load-bearing unverified citation; Q17
> affects the engineering cost side of Q19b.
>
> Thanks all. I'll capture the rulings into the ledger within 24
> hours and circulate.

---

## What this walkthrough does *not* cover

- The full research artefact. For that, see `SYNTHESIS.md`.
- The citations. For that, see `SOURCES.md`.
- The verification worklist. For that, see `SOURCES.md` "Verification
  worklist summary" or the briefing packet's "Verification status"
  header.
- The facilitator's operational brief. For that, see
  `FACILITATOR-BRIEF.md`.
- The Phase F / G / H roadmap context. The walkthrough is one
  decision; the roadmap is the bigger picture.

---

*End of walkthrough. The walkthrough decides; the ledger captures.*
