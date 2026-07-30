# Email draft — Reply to Stephan's consolidated response of 2026-07-30

**To:** Stephan Hartmann
**Subject:** RE: Consolidated responses — accepted with three refinement questions; ready to sign

---

Dear Stephan,

Thank you for the consolidated response — this resolves nearly everything on our side. We accept your recommendations as set out below and are ready to execute the appointment. Three points come back to you as refinement questions rather than disagreements, marked (Q) so they are easy to pick out.

**1. DPO contact address — accepted, one operational safeguard proposed (Q1)**

We will configure dpo@zwizzly.com exactly as you describe: a direct, confidential forwarder to your professional address; no shared mailbox and no routinely retained copies in our tenant; administrative access restricted to the minimum named administrators with changes logged; not added to any distribution group; delivery-failure monitoring enabled. We will run the external-address test with you once it is live.

One operational safeguard we will add on our side: because data-subject rights requests sent to dpo@ start deadlines that run against ZWIZZLY AS as controller (Article 12(3): one month), we will retain delivery metadata only — timestamp, sender address, subject line, delivery status — from the forwarding log, so we can evidence receipt dates and maintain continuity. No message content will be retained or accessible in our tenant; the content reaches you first and only, exactly as you specified. Please flag if you see any issue with this; otherwise we will proceed on that basis.

**2. Main-establishment memo — correction accepted**

We will apply your replacement Article 77 sentence verbatim and re-issue the clean signed version. The factual statements on corporate structure and decision-making remain accurate; we will notify you if that changes.

**3. M3 and the launch perimeter — your wording adopted; one narrowing question (Q2)**

We adopt your M3 text verbatim and will enter it into the Advice Record. Our internal records will be corrected accordingly: the United States is provisionally screened as the first Route 2 candidate and is not finally admitted until WI-1116, the launch-day rechecks, and the signed management risk acceptance are closed.

On the local-counsel element: we read "where material local-law questions remain" as requiring counsel confirmation only where the admission screen itself identifies a named, unresolved question of local law that management cannot reasonably risk-accept on the documented record — not as a standing requirement for counsel review of every Route 2 admission. On that reading, once WI-1116 is closed and the launch-day rechecks are clean, the US admission would rest on the screen record and the signed management risk acceptance without a separate counsel opinion. Please confirm this reading, or tell us where you would draw the line differently.

**4. Article 8 and non-EEA minors — accepted as qualified**

We will record the position as a reasoned legal interpretation, not an uncontested rule, subject to your five conditions, and mark only the GDPR element of US screen criterion (a) as satisfied. Your point on contractual capacity is well taken and is distinct from consent; we are routing it to the billing model (for minors, the paying party is the parent/guardian account holder) and will document that analysis separately.

**5. Scope of the DPO engagement — accepted; one commercial clarification (Q3)**

We accept your replacement wording verbatim and will insert it into the Services Agreement. With that, we are ready to sign both the Services Agreement and the Formal Designation, with the effective date linked to activation of the dpo@ address as you propose.

Since EU AI Act work sits outside the statutory DPO function and is provided as separate compliance advice where requested and accepted: could you confirm the commercial basis for that advice (within the existing retainer, or separately engaged and billed), so we can request it with clear expectations? Your section 6 response was exactly the kind of input we will want again.

**6. EU AI Act classification — accepted; we will produce the record; two refinement questions**

We are glad the family-only MVP classification stands without a specialist referral. We will author the classification record as a version-controlled document with all seven additions you list (product/model version, providers and our provider/deployer role, intended purpose and prohibited uses and launch scope, approval owner and review date, the reassessment triggers, the territorial analysis, and the Article 4/5/50 obligations), update the legislative-status section per your corrections, keep it as a separate record cross-referenced from the DPIA, and produce the Article 4 AI-literacy measures and the documented Article 5 prohibited-practices check for the MVP.

Two of the reassessment triggers we would like to pin down precisely before they go into the record:

**(Q4) The teacher-reliance trigger.** MentoMate's core consumer use case is a learner voluntarily using the app to understand and complete homework, which the learner then submits and a teacher grades in the ordinary way. On your decisive factors (voluntary family use, not in or on behalf of an institution, outputs not determining an institutional decision), we understand this learner-initiated, consumer-side use does not engage Annex III point 3 — the trigger is aimed at *institutional* reliance. To avoid the trigger being read against the core product, we would propose wording it as:

> "outputs are transferred to or relied upon by teachers or institutions to determine grades, placement, promotion, certification, access or the direction of formal learning, **where such reliance is arranged, integrated, marketed or contracted by ZWIZZLY, or the system is otherwise used in or on behalf of an institution — excluding incidental, learner-initiated use of outputs in the learner's own schoolwork**."

Please confirm, or adjust the boundary where you see it.

**(Q5) Article 50(2) applicability.** The live product surface is an interactive chat in which the Article 50(1) disclosure is already implemented (a persistent in-chat label stating the user is talking to an AI mentor, plus disclosure at consent). Our reading is that for this conversational surface — where the user is continuously and unambiguously informed they are interacting with an AI — the 50(1) disclosure carries the transparency function, and 50(2) machine-readable marking is relevant, if at all, to content that can leave that context (exported or shareable artifacts such as recap documents), rather than to the ephemeral chat stream itself. Do you concur that we should scope 50(2) implementation to exportable/shareable synthetic content only? The answer determines whether this is a bounded item on the export surfaces or a broader engineering programme, so we would like to fix the scope before building.

**7. Provider evidence requests — pre-confirmation of sufficiency (Q6)**

On actions 8 and 9 of your register: on 26 July we sent written DPA and Article 28 evidence requests to Anthropic, Mistral and Voyage AI (nine items each; Mistral with two additional asks covering the special-categories declaration mismatch and the feedback route), and a follow-up to Cerebras covering their processor evidence items A1–A6 plus concrete transfer-assessment inputs B1–B7 (SCC/DPF status, processing locations, FISA 702 exposure, government-access policy, encryption, onward transfers). The vendors have a 14-day response window ending around 9 August.

So that we do not lose a cycle when the responses arrive: could you confirm that the attached request texts, if answered fully and credibly, cover the evidence requirements of actions 8 and 9 as set out in your register? If any register item is not covered by the asks as sent, a one-line note of the gap while the requests are still open would let us supplement in the same cycle. For Cerebras specifically, we hold dated copies of the self-serve Inference Terms and the DPA (Rev. June 2025) they incorporate by reference, under which SCC Modules 1–3 and the UK Addendum are deemed executed on acceptance; written per-account confirmation is requested and pending. We would value your early view on whether that incorporation-by-reference construction is acceptable as the Article 28 instrument, since Cerebras is the primary inference path.

**Attachments:** provider request text (`evidence/2026-07-26-provider-dpa-request-email.md`), Cerebras follow-up (`evidence/2026-07-26-cerebras-dpa-followup-email.md`).

**Next steps on our side**

1. Configure and test dpo@zwizzly.com (per your answer to Q1).
2. Sign the Services Agreement (with your scope wording) and the Formal Designation; effective date on mailbox activation; then communicate the DPO contact to Datatilsynet.
3. Re-issue the corrected main-establishment memo.
4. Enter your M1–M7 wording into the Advice Record, including M3 as you drafted it.
5. Author the AI Act classification record, the Article 4 measures, and the Article 5 check record, reflecting your answers to Q4 and Q5.

Best regards,
Zuzana Kopecna
Chair, ZWIZZLY AS

---

## Send log

| Date | Status |
|---|---|
| 2026-07-30 | Draft prepared; awaiting operator review and send |
| 2026-07-30 | **Sent** by Zuzana (with Q1 recast as metadata-log notification; Q6 provider-request pre-confirmation included) |
