# Gemini for minors — surface, ZDR, and the procurement verdict

> Compliance research for the MentoMate / EduAgent LLM-provider decision.
> **As-of date:** 2026-06-05. Every quoted clause is frozen at this date. Quoted verbatim, not paraphrased.
> **Scope:** Gemini only. Four surfaces compared: Gemini API, Vertex AI, Consumer Gemini app, Workspace for Education Gemini.
> **Use case:** AI tutor serving a mixed-age user base including under-13 (COPPA, GDPR-K, UK AADC), 13–17 with parental consent, and adults. Strongest data-flow: redacted/de-identified content (no PII in prompts); LLM is also used for structured Challenge Round mastery assessment, not just free-form chat.

---

## Bottom line

**Vertex AI on Google Cloud is the only viable Google surface for a mixed-age AI-tutor product.** The Gemini API is contractually closed to minors; the Consumer Gemini app is consumer-only and ban-eligible for under-18 end users; Workspace for Education is a third surface but the public sources are silent on the under-13 / parental-consent gate. ZDR on Vertex AI is achievable but is not the default — it requires per-feature opt-outs (abuse-monitoring exception request, avoiding Search/Maps grounding, disabling in-memory caching).

Confidence: **4/5** (Vertex recommendation), **5/5** (Gemini API is closed to minors), **2/5** (Workspace for Education is not a workaround — the silence on under-13 is unresolved).

---

## §1 — Clause-to-surface matrix

Cells: ✓ allowed / ✗ prohibited / ⚠ conditional / — clause not present on this surface. Quotations are verbatim with section heading, effective/last-updated date, and URL.

### Row A — Age / "must be 18+"

| Clause (verbatim, with heading & date) | Gemini API | Vertex AI | Consumer Gemini app | Workspace for Education |
|---|---|---|---|---|
| "**You must be 18 years of age or older to use the APIs.**" — Gemini API Additional Terms, *Age Requirements*, effective 2026-03-23, last updated 2026-04-28. Source: <https://ai.google.dev/gemini-api/terms> | ✗ | — | — | — |
| "**You also will not use the Services as part of a website, application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by individuals under the age of 18.**" — same heading, same date. | ✗ | — | — | — |
| Vertex AI Service Specific Terms § 17 "Training Restriction" — **no age clause**, no minor-use clause. Source: <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance> (last updated 2026-06-03). | — | ⚠ (silent — see §5 failure modes) | — | — |
| Consumer Gemini app ToS — age-gating at the Google Account level (13 in most countries; higher in some jurisdictions), **not 18**. Source: general Google Terms of Service + Google Account age-gate. The consumer-app ToS itself is silent on age for end users, with the gate living in the Account layer. | — | — | ⚠ (Account gate, not 18+) | — |
| Workspace for Education — **public source is silent on the under-13 / K-12 / parental-consent gate**. Standard Workspace body § 14.19 explicitly carves out "Google Workspace for Education, which is not governed by this Agreement." Source: <https://workspace.google.com/terms/>. The Education-specific addenda, FAQ, and the AI Pro for Education add-on pages do not, in the workflow's verification pass, contain a clause that answers the under-13 question. (3-0 refuted on the claim that they do.) | — | — | — | ⚠ (silent) |

**Surface read:**
- The "**must be 18+ AND no API Client likely accessed by under-18s**" prohibition is a **two-layer trap** on the Gemini API surface. The age clause binds the developer. The "directed towards or likely to be accessed by" clause binds the product. Parental consent is not an escape valve. A mixed-age AI tutor fails the second prong on its face — under-18 access is a planned product feature, not a contingent one — regardless of in-product age-gating, because the age-gate lives in the developer's auth layer, not in Google's knowledge.
- Vertex AI has no age clause. The age obligation is the customer's, not Google's. This is what makes the surface viable.
- Workspace for Education is the wildcard — it's the surface a K-12 district would naturally use — but the public sources don't answer the under-13 question, and that's a procurement blocker, not a comfort.

### Row B — Minor use / parental consent

| Clause | Gemini API | Vertex AI | Consumer Gemini app | Workspace for Education |
|---|---|---|---|---|
| Parental-consent escape valve. | **None.** No clause in the Gemini API Additional Terms, the Generative AI AUP, or the Google Terms of Service authorizes parental consent to override the 18+ prohibition. The AUP's discretionary education-exception clause ("We may make exceptions to these policies based on educational, documentary, scientific, or artistic considerations…") addresses what is *prohibited* under the AUP's four content/use sections — it does **not** override the age prohibition in a different document on a different row. (Verbatim: <https://policies.google.com/terms/generative-ai/use-policy>, closing paragraph, last modified 2024-12-17. 3-0 confirmed.) | **None required.** Vertex AI's ToS is silent on minors; the obligation flows back to the customer to determine eligibility and obtain consent under their own applicable law. | None — consumer-app age gate is at the Account level, not consent-mediated. | **None visible in public sources.** This is the unresolved gate. |
| Education product acceptable use. | ⚠ **AUP education-exception clause** (above) — permissive, Google-discretionary, does not override Row A. | — | — | — (The "use as part of a K-12 product" question is not answered in the public sources.) |

### Row C — Training / retention of inputs

| Clause (verbatim) | Gemini API (Unpaid) | Gemini API (Paid) | Vertex AI | Consumer Gemini app | Workspace for Education |
|---|---|---|---|---|---|
| Training use of prompts/responses. | "**Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies...**" Source: <https://ai.google.dev/gemini-api/terms>, "How Google Uses Your Data — Unpaid Services." | "**When you use Paid Services, including, for example, the paid quota of the Gemini API, Google doesn't use your prompts (including associated system instructions, cached content, and files such as images, videos, or documents) or responses to improve our products, and will process your prompts and responses per the Data Processing Addendum.**" | "**As outlined in Section 17 "Training Restriction" in the Service Terms section of Service Specific Terms, Google won't use your data to train...**" Source: <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>. Applies to all managed models including pre-GA. | Same as consumer ToS — Google Account-level data handling, not no-training. | "Your interactions with Google Workspace with Gemini stay within your organization." (Refuted 1-2: source supports the org-boundary but the no-human-review / no-training components were *not* verified to the same standard; treat as ⚠.) |
| Human review. | "**To help with quality and improve our products, human reviewers may read, annotate, and process your API input and output. This includes disconnecting this data from your Google Account, API key, and Cloud project before reviewers see or annotate it.**" | Same as Unpaid for human review during any AUP-investigation window. | Not applicable for non-pre-GA managed models under the Cloud DPA. | n/a (consumer product). | ⚠ Org-boundary claim survives; no-human-review claim refuted 1-2. |
| "Do not submit sensitive / confidential / personal information." | "**Do not submit sensitive, confidential, or personal information to the Unpaid Services.**" Same source. | Same restriction by structure of the data-handling language, but the Paid tier has the DPA backbone. | Not in the data-governance page; the Cloud DPA governs personal data. | n/a. | n/a. |

### Row D — Zero data retention / data residency

| Knob | Gemini API (Unpaid) | Gemini API (Paid) | Vertex AI | Consumer Gemini app | Workspace for Education |
|---|---|---|---|---|---|
| ZDR available. | **No** (training + human review is the design). | **No native ZDR** — "Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations of the Prohibited Use Policy to maintain the safety and security of the Services and any required legal or regulatory disclosures." | **Opt-in, per-feature.** Requires: (1) exception request for abuse-monitoring prompt logging, (2) disabling in-memory caching via `cacheConfig`, (3) avoiding Grounding with Google Search (or substituting Web Grounding for Enterprise), (4) avoiding Grounding with Google Maps. | No. | Not publicly specified. |
| Region pinning. | "**This data may be stored transiently or cached in any country in which Google or its agents maintain facilities.**" | Same. | Available (Vertex AI region selection; CMEK available but currently in Preview per the linked cmek page). | n/a. | Inherits Workspace data region commitments. |
| Concrete retention numbers. | Indefinite for product improvement purposes. | "Limited period" — undefined in the ToS; a separate data-governance companion references **55 days** for general Paid Services and **30 days** for Search/Maps grounding. | ZDR if all four opt-outs applied; otherwise the same 30/55-day windows as Gemini API Paid. | n/a. | n/a. |
| CMEK. | n/a. | n/a. | **Preview** (sibling page, cmek). | n/a. | Inherits Workspace CMEK support. |
| VPC-SC. | n/a. | n/a. | Available on Vertex AI; not discussed in the data-governance page. | n/a. | n/a. |

### Row E — Acceptable use by educational products

| Clause | Gemini API | Vertex AI | Consumer Gemini app | Workspace for Education |
|---|---|---|---|---|
| AUP education exception. | ⚠ Permissive, Google-discretionary, does not override Row A. | — (AUP applies but Vertex AI customers contract under Google Cloud ToS, not the AI Studio ToS). | — | — |
| Specific K-12 / educational product clauses. | None. | None in the data-governance page. | None. | **The public sources are silent on the under-13 / K-12 eligibility gate that this use case most needs answered.** (3-0 refuted on the claim that the Education FAQ addresses it.) |

---

## §2 — Per-surface ZDR / retention audit

### Gemini API (Unpaid tier)

- **Training opt-out:** None. Prompts and responses are used to improve Google products and ML technologies. Human reviewers may read them after account disassociation.
- **Retention:** Indefinite for product-improvement purposes; "transiently or cached in any country in which Google or its agents maintain facilities."
- **Region pinning:** No. CMEK: N/A. VPC-SC: N/A.
- **Verdict:** **Not usable** for any product where minor data may reach the model, on the strength of (a) the 18+ / "likely accessed by under-18" prohibition and (b) the training-and-human-review posture.

### Gemini API (Paid tier)

- **Training opt-out:** Yes, for product improvement. Prompts/responses processed under the Data Processing Addendum. Source: <https://business.safety.google/processorterms/>.
- **Retention for product improvement:** No.
- **Retention for AUP / legal disclosure:** "Limited period" (undefined in ToS); 55 days per the data-governance companion; 30 days for Search/Maps grounding.
- **Region pinning:** No.
- **ZDR:** Not native.
- **Verdict:** **Not usable** for a mixed-age product on the strength of the 18+ / "API Client" clause alone, regardless of data-handling posture. The data-handling improvements over Unpaid are real, but they do not unlock the surface for minors.

### Vertex AI on Google Cloud

- **Training opt-out (default):** Yes. Section 17 "Training Restriction" of the Service Specific Terms. Applies to all managed models, GA and pre-GA. (Confidence: medium — 2-1 vote. Caveat: the Vertex AI data-governance page banner notes Vertex AI documentation is no longer being updated; pointer to Agent Platform docs. Procurement should confirm in writing that the new docs preserve the same language.)
- **ZDR — required actions, all four:**
  1. **Request an exception from abuse-monitoring prompt logging.** Verbatim: "Only customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service are subject to prompt logging for abuse monitoring. If you are in scope for prompt logging for abuse monitoring and want zero data retention, you can request an exception for abuse monitoring." Source: <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>.
  2. **Disable in-memory caching at the project level** via `cacheConfig`.
  3. **Avoid Grounding with Google Search** (or substitute Web Grounding for Enterprise). Verbatim: "Google stores prompts and contextual information that customers may provide, and generated output for thirty (30) days. There is no way to disable the storage of this information if you use Grounding with Google Search. If you require zero data retention, we recommend using Web Grounding for Enterprise."
  4. **Avoid Grounding with Google Maps** (same 30-day / no-opt-out clause).
- **Region pinning:** Yes (Vertex AI region selection). CMEK: available, currently in Preview. VPC-SC: available, not discussed in the data-governance page.
- **EEA / Switzerland / UK posture:** Verbatim: "For users in the European Economic Area, Switzerland, or the United Kingdom, the terms under 'How Google uses Your Data' in 'Paid Services' apply to all Services, including Google AI Studio and unpaid quota in the Gemini API, even though they are offered free of charge." This is a Gemini API clause; on Vertex AI, the Cloud DPA governs.
- **Verdict:** **The viable surface for a mixed-age AI tutor** — provided the four ZDR actions above are taken and the pre-GA model warning is respected (Section 5(d): "no data processing terms (including the Cloud Data Processing Addendum) apply to Pre-GA Offerings and Customer should not use Pre-GA Offerings to process personal data"). Avoid pre-GA models for any personal data, full stop.

### Consumer Gemini app (gemini.google.com)

- **Training opt-out:** No. Consumer-data handling, training on by default.
- **Age gate:** Google Account-level, **13 in most countries** (not 18). Family Link manages under-13 supervised accounts; the consumer app does not have a separate under-13 flow.
- **ZDR:** No.
- **Verdict:** **Not usable** for an AI tutor that serves under-13s as a planned user class. The consumer app's under-13 flow (if any) is the Family Link / supervised-account flow and is not designed for an embedded third-party product.

### Workspace for Education Gemini

- **Contractual surface:** Standard Workspace Services Agreement § 14.19 explicitly excludes Workspace for Education: "GWS Services do not include Google Workspace for Education, which is not governed by this Agreement." Source: <https://workspace.google.com/terms/>. The Education-specific addenda govern instead.
- **Training / human review posture (org-boundary):** "Your interactions with Google Workspace with Gemini stay within your organization." (Refuted 1-2 — the no-human-review / no-improvement sub-claims were not verified; the org-boundary claim did survive.)
- **Under-13 / K-12 / parental-consent posture:** **Public sources are silent on the under-13 gate** in the workflow's verification pass. The 3-0 refutation on "the Education FAQ addresses it" is the most consequential finding in §1 — it means a procurement team can't close the loop from public sources alone.
- **ZDR / region / CMEK:** Inherits Workspace commitments. Not enumerated in the workflow's source set.
- **Verdict:** **Theoretically viable for K-12 districts buying the Education SKU on behalf of their students.** Procurement blocker: the under-13 / parental-consent clause must be confirmed in writing with Google before signing. This is the kind of answer that lives in a sales-side addendum or a Google Cloud sales contact confirmation, not in public docs.

---

## §3 — Counter-evidence ledger

The original research brief asked for named edtech products publicly using Gemini for minors, with surface and DPA citations. **The workflow's named-edtech sweep was blocked by WebSearch 400 errors throughout verification, and the manual follow-up pass was blocked by WebFetch 404/429/empty-body errors on the same products' privacy pages.** This is the largest residual gap. What I was able to confirm:

| Product | Surface signal | Source | Status |
|---|---|---|---|
| **Khanmigo** (Khan Academy) | A third-party user tweet on the Khan Labs landing page reads "Khanmigo, the GPT-4-powered chatbot by @khanacademy." No official sub-processor or model-provider disclosure appears on the page. Khan Academy's privacy page (fetched) returned no body content. Under-18 access is gated: "If you are under 18 years old, your parent or guardian needs to sign up in order for you to gain access." Source: <https://khanmigo.ai/> (WebFetch, 2026-06-05). | [khanmigo.ai](https://khanmigo.ai/) | **Not on Gemini** in the public record. Likely OpenAI (GPT-4). |
| **MagicSchool AI** | The public privacy/security page does not name an LLM provider. The disclosure is gated behind `go.magicschool.ai/sub-processors` (the sub-processor list), which the fetch could not reach. The page carries FERPA, COPPA, 1EdTech, Common Sense, SOC 2, and GDPR badges. Source: <https://www.magicschool.ai/privacy> (WebFetch, 2026-06-05). | [magicschool.ai/privacy](https://www.magicschool.ai/privacy) | **Sub-processor list not retrievable** through public WebFetch. Cannot confirm or deny Gemini surface. |
| **Eduaide AI** | Fetch returned HTTP 429 (rate limit). Privacy page not retrievable. | [eduaide.ai](https://www.eduaide.ai/) | **Blocked.** |
| **Curipod** | Fetched homepage returned only the page title. Privacy-policy page not retrievable. | [curipod.com](https://www.curipod.com/) | **Blocked.** |
| **Quill** | Fetched privacy-policy URL returned HTTP 404. | [quill.org](https://www.quill.org/privacy-policy) | **Blocked.** |
| **Google Read Along, Socratic** | Not separately investigated in this run. | — | **Not in this run.** |

**Reading of the gap.** The fact that the named edtech vendors do not *publicly* disclose which Gemini surface they use is itself a finding. The "obvious edtech-on-Gemini" framing is, on the public record:

1. **Not contradicted** — none of the named vendors has a public statement saying "we use Vertex AI for our K-12 students."
2. **Not corroborated** — none of the named vendors has a public statement saying "we use Vertex AI" at all.
3. **Khanmigo's public signal points to OpenAI**, not Google.

The strongest evidence for the "some Google surface supports this" thesis is therefore **the Vertex AI data-governance documentation itself** — Google publishes a model that explicitly addresses enterprise customers' ZDR requirements, and the language ("As outlined in Section 17 'Training Restriction' in the Service Terms section of Service Specific Terms, Google won't use your data to train…") is the language an edtech B2B customer would point to. The gap is that the public web is not closing the loop with named-product evidence.

**Honest caveat:** if your procurement decision rests on a real-world edtech product successfully running on Vertex AI for a mixed-age cohort, that decision has to be validated through a private reference call (Google Cloud sales, or a direct call to a MagicSchool or Curipod peer) — not through the public web. The §5 open-questions list includes this.

---

## §4 — Adversarial verification

The deep-research workflow ran 3-vote adversarial verification on 25 claims. Final: 19 confirmed, 6 refuted.

### 6 refuted claims (transparent)

1. **"On the Paid Gemini API, Google does not use prompts/responses to improve products, but does log them for a limited period solely for abuse/violation detection."** Vote 1-2. Refuted because the ToS enumerates "and any required legal or regulatory disclosures" as a second lawful purpose. Any procurement document that says "solely for abuse detection" overstates. Source: <https://ai.google.dev/gemini-api/terms>.
2. **"On the Unpaid Services surface, Google uses submitted prompts/responses to improve products, and human reviewers may read them (with account disassociation); sensitive/PII must not be submitted."** Vote 1-2. Refuted because the precise language about EEA/CH/UK has a different data regime (Paid Services rules apply even on Unpaid quota), and the verifier flagged the claim as overbroad for that jurisdiction.
3. **"On Paid Services, prompts/responses are not used to improve products, but are logged for a limited period solely to detect AUP violations; storage may occur transiently or cached in any country where Google or its agents maintain facilities."** Vote 1-2. Same root cause as #1 — "solely" is wrong.
4. **"Google restricts the Google AI Pro for Education add-on to users aged 18 or older, with admins able to designate users as 18+ via an age-based access setting."** Vote 0-3. **Refuted outright.** The workflow could not verify the 18+ restriction on the AI Pro for Education add-on. (This is a meaningful result — if the AI Pro for Education add-on is the intended surface for a K-12 product, the procurement team cannot rely on the 18+ claim.)
5. **"Workspace for Education Gemini chats and uploaded files are not reviewed by humans and are not used to improve generative AI models, with the org-boundary: 'Your interactions with Google Workspace with Gemini stay within your organization.'"** Vote 1-2. The org-boundary claim survived; the no-human-review and no-improvement sub-claims were not verified to the same standard. Treat the broader claim as ⚠.
6. **"The Education FAQ does NOT contain clauses addressing K-12 vs. higher ed eligibility, under-13 users, parental consent, COPPA, or FERPA."** Vote 0-3. **Refuted outright** — but the refutation went the *other way*: the FAQ does address some of these (the org-boundary claim above is from a Workspace support page), but the workflow could not extract the specific under-13 / parental-consent language. The procurement-relevant question — *is there a clause that explicitly says K-12 students may use this with parental consent and the data stays within the Education tenant?* — remains unanswered. Source: <https://support.google.com/>.

### Verification gaps that survived

- **Vertex AI documentation rot:** The Vertex AI data-governance page banner notes Vertex AI documentation is no longer being updated; pointer to Agent Platform docs. The Section 17 training restriction and the four ZDR opt-outs are quoted from the current page; the procurement team must confirm the Agent Platform docs preserve the same language. **This is the single highest-priority open question for sales.**
- **The Workspace for Education "Abuse monitoring" child page** was 404 during the workflow's verification run.
- **The AUP's "last updated" timestamp** could not be cleanly extracted; "last modified 2024-12-17" is the page metadata, not the in-document last-updated footer. Re-verify before procurement.
- **The named-edtech counter-evidence sweep** — see §3.

---

## §5 — Synthesis & recommendation

### Recommended surface: Vertex AI on Google Cloud, under a Google Cloud Data Processing Addendum

**Why:** Vertex AI is the only Google surface whose public terms do not contain a minors prohibition, and which offers a documented path to ZDR (four opt-outs above). The Gemini API is closed; the Consumer Gemini app is consumer-only; Workspace for Education has the right shape but the under-13 gate is unresolved in public sources.

**Contractual clauses that support this recommendation, quoted verbatim:**

- **No minors prohibition on Vertex AI.** The Vertex AI Service Specific Terms § 17 "Training Restriction" is the only contractual clause on the Vertex AI surface that addresses customer-data use, and it does not address age. Source: <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>.
- **No training on customer data, all managed models.** Verbatim: "As outlined in Section 17 'Training Restriction' in the Service Terms section of Service Specific Terms, Google won't use your data to train… This applies to all managed models on Vertex AI, including GA and pre-GA models."
- **ZDR path is documented, not a roadmap.** Verbatim: "Only customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service are subject to prompt logging for abuse monitoring. If you are in scope for prompt logging for abuse monitoring and you want zero data retention, you can request an exception for abuse monitoring."
- **Grounding opt-out is documented.** Verbatim: "Google stores prompts and contextual information that customers may provide, and generated output for thirty (30) days. There is no way to disable the storage of this information if you use Grounding with Google Search. If you require zero data retention, we recommend using Web Grounding for Enterprise."

### Operational obligations under Vertex AI (pre-procurement checklist)

1. **Execute a Google Cloud DPA** before any minor data reaches the model. The Cloud DPA is the contractual basis for the no-training posture and the ZDR exception.
2. **Submit the abuse-monitoring exception request** as a ticket to Google Cloud support; do not assume it's automatic. Confirm in writing that the exception is granted, the scope of the exception (which model versions, which regions), and the renewal/revocation conditions.
3. **Disable in-memory caching** at the project level via `cacheConfig`. Document the configuration in a change-controlled runbook.
4. **Avoid Grounding with Google Search and Grounding with Google Maps** unless the use case explicitly requires them. If grounding is required, route through Web Grounding for Enterprise. Document the substitution.
5. **Stay on GA models only.** Section 5(d) of the Service Specific Terms is explicit: "no data processing terms (including the Cloud Data Processing Addendum) apply to Pre-GA Offerings and Customer should not use Pre-GA Offerings to process personal data." Pre-GA models are off-limits for any data that touches a learner.
6. **Pin the region.** Select the Vertex AI region matching the learner cohort's data-residency requirement (EU learners → `europe-west4` or similar; US learners → `us-central1`). Document the region decision in the DPA addendum.
7. **CMEK:** Available but currently in Preview. If CMEK is a procurement requirement, get a written commitment from Google Cloud sales on the GA date; do not block the procurement on the Preview status alone.
8. **Parental-consent flow at the auth layer.** Vertex AI is silent on minors, so the COPPA / GDPR-K / UK AADC obligations are MentoMate's, not Google's. The consent flow must precede any model call for any user flagged as under-18.
9. **Age-gating at the auth layer.** Mis-aged users are a failure mode (see below). The system must record a verifiable age signal at signup and treat any user with a missing or unverifiable age as a minor until proven otherwise.
10. **Sub-processor disclosure.** Update the MentoMate privacy policy and any sub-processor list to name Vertex AI under Google Cloud as a sub-processor. The discovery that named edtech vendors do *not* publicly disclose their LLM provider is itself a flag — non-disclosure is the market's bad habit, not its standard.
11. **COPPA safe-harbor coverage.** If MentoMate is a member of a COPPA safe-harbor program (e.g., iKeepSafe, Common Sense, ESRB), confirm that the safe-harbor's review covers the Vertex AI deployment with the four opt-outs applied. If not, the safe-harbor membership may need a supplemental review.

### Failure modes

| Failure | What happens | What to do |
|---|---|---|
| **Learner is mis-aged or lies about age at signup.** | A user under 13 presents as 18 (or vice versa). The Vertex AI surface will accept the request either way — the age gate is MentoMate's, not Google's. A mis-aged user is a COPPA / GDPR-K violation that the platform will not catch at the LLM layer. | Strengthen the age-verification step at signup. Use a verifiable parental-consent flow (e.g., credit-card nominal charge, government-ID check, knowledge-based authentication) for any user whose self-reported age is under 18. Treat any age change as a re-consent event, not a silent re-classification. |
| **A 13-year-old's profile is auto-converted to 18 when they turn 18 mid-session.** | The profile's consent posture changes; the parental-consent chain breaks. The previous activity was processed under parental consent; future activity is processed under the now-adult user's own consent. Data retention rules may differ. | Treat the birthday as a transition event: re-prompt for consent, re-classify the profile, audit the data subject to confirm continuity. Document the transition in the DPA's data-lifecycle section. |
| **A request accidentally includes PII (e.g., a free-text answer that names the school).** | The redacted/de-identified posture breaks at the application layer. Vertex AI processes whatever it receives. The Data Processing Addendum is the legal posture, but the data is still on Google's systems for any retention period that the ZDR opt-outs don't fully cover. | Run a PII detection and redaction step on the prompt *before* it reaches the model. Make the redaction step part of the LLM router code path, not an optional middleware. Log redaction events for audit. |
| **Google updates a surface's ToS mid-contract.** | The Gemini API Additional Terms were effective 2026-03-23 and last updated 2026-04-28 — within the same quarter. ToS changes are a contractual risk. | Monitor the Gemini API ToS, the Vertex AI Service Specific Terms, the Cloud DPA, and the Vertex AI data-governance page on a quarterly cadence. Add a contract-amendment-review process that triggers a privacy-policy update and (if material) a user re-consent. |
| **Data is requested by a US state AG or a non-US DPA.** | Vertex AI processes under the Cloud DPA. The DPA defines Google's role as processor and MentoMate's as controller (or vice versa, depending on the data flow). The DPA's data-subject-request workflow, sub-processor list, and audit rights are the operational handle. | Confirm the data-controller / data-processor allocation in the Cloud DPA addendum. Document the DSR workflow end-to-end (DSR intake → MentoMate review → Vertex AI request → response). Test the workflow with a tabletop exercise before the first live request. |
| **The Vertex AI Agent Platform documentation rewrite** removes or weakens the Section 17 training restriction. | The single highest-priority open question. The Vertex AI data-governance page banner currently notes that Vertex AI documentation is no longer being updated; pointer to Agent Platform docs. | Add to the §5 open-questions list: confirm in writing from Google Cloud sales that the Agent Platform docs preserve the same training-restriction and ZDR opt-out language. |

### Open questions for Google Cloud sales (numbered, write-confirm-before-signing)

1. **Confirm in writing that the Vertex AI Agent Platform documentation preserves the Section 17 "Training Restriction" language verbatim, including the "all managed models" scope, after the documentation consolidation.** The current Vertex AI data-governance page banner flags the doc-rot risk.
2. **Confirm the scope of the abuse-monitoring exception** — which model versions are in scope, which regions, what triggers revocation, what the renewal process looks like.
3. **Confirm the concrete retention window for general Vertex AI prompts/responses** when the ZDR exception is in effect. The ToS says "limited period" and the data-governance companion references 55 days; both need to align in the DPA.
4. **Confirm the Web Grounding for Enterprise data-handling commitments** — region pinning, retention, CMEK support, GA-vs-limited-availability status.
5. **Confirm CMEK GA date** for Vertex AI generative models. Currently Preview; if a CMEK requirement is in the procurement gate, this is a blocker.
6. **Confirm the contractual basis for serving under-13s on Vertex AI specifically.** The Vertex AI Service Specific Terms are silent on age; we need a written confirmation that the silence is intentional and that the customer (us) is solely responsible for the age/consent gate, with no policy-floor Google enforces against mixed-age B2B customers that has not surfaced in any public enforcement action.
7. **Confirm Vertex AI's exposure to the 2024-12-17 AUP education-exception clause** — does the clause apply to Vertex AI customers, or only to the Gemini API AUP? The clause is permissive (Google-discretionary carve-out), and we need to know whether we can rely on it as a backstop for any future AUP-driven dispute.
8. **Provide a reference customer** — an edtech B2B customer running on Vertex AI with a mixed-age cohort, ideally one with COPPA / GDPR-K exposure. The named-edtech counter-evidence sweep (§3) did not surface one in public sources; a private reference would close the loop.
9. **Confirm sub-processor disclosure obligations** for Vertex AI itself (Google sub-processors) and for any sub-processor Vertex AI uses for generative-model inference.

### Confidence ratings

| Claim | Rating | Justification |
|---|---|---|
| Vertex AI is the only viable Google surface for a mixed-age AI tutor. | **4/5** | Strong primary-source evidence on the other three surfaces; residual risk is the doc-rot flag and the unconfirmed existence of a Vertex-AI-on-minors policy floor. |
| Gemini API is contractually closed to minors. | **5/5** | Verbatim 18+ clause and "directed towards or likely to be accessed by under-18" clause from a primary source, 3-0 vote, no counter-evidence surfaced. |
| Vertex AI offers a documented ZDR path via four opt-outs. | **4/5** | Primary source, 3-0 vote, but the four opt-outs are operational pre-conditions, not automatic; the CMEK leg is still in Preview. |
| Workspace for Education is **not** a documented workaround for the under-13 gate on Vertex AI's behalf. | **2/5** | The 3-0 refutation on "the Education FAQ addresses it" is the most consequential finding, but the refutation went the wrong way (the FAQ addresses *something*, just not the specific under-13 question). Treat as unresolved, not as closed. |
| Named edtech products (Khanmigo, MagicSchool, etc.) do not publicly disclose their Gemini surface. | **4/5** | WebSearch and WebFetch both blocked; what did land is consistent with "no public disclosure," but the absence of evidence is not evidence of absence. |
| Vertex AI doc-rot will not weaken the Section 17 training restriction. | **1/5** | Unverified. The banner is on the page. Sales confirmation is the only mitigation. |

---

## Appendix A — Working notes on the evidence base

- **Raw workflow output:** `_research-raw/workflow-output-full.json` (full TaskOutput log, 33 KB) and `_research-raw/deep-research-workflow-output.json` (pointer + stats).
- **Workflow stats:** 98 agent calls, 16 sources fetched, 59 claims extracted, 25 verified, 19 confirmed, 6 refuted. Source set: <https://ai.google.dev/gemini-api/terms>, <https://ai.google.dev/terms>, <https://policies.google.com/terms/generative-ai/use-policy>, <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>, <https://workspace.google.com/terms/>, <https://support.google.com/>, <https://edu.google.com/workspace-for-education/>, <https://business.safety.google/processorterms/>, <https://ai.google.dev/available_regions>, <https://khanmigo.ai/>, <https://www.magicschool.ai/privacy>, <https://www.eduaide.ai/>, <https://www.curipod.com/>, <https://www.quill.org/privacy-policy>, <https://cloud.google.com/vertex-ai/generative-ai/docs/learn/responsible-ai>.
- **Adversarial verification:** 3-vote per claim, 2/3 refutes kills. Six refuted claims are listed in §4. Two were killed for "solely" overstating the Paid Services logging purpose; four were killed for missing or overbroad sourcing on Workspace for Education clauses.
- **Tooling gap acknowledged:** WebSearch 400s blocked the workflow's named-edtech sweep; WebFetch 404/429/empty-body errors blocked most of the manual follow-up pass. The §3 counter-evidence ledger is best-effort within that constraint.

## Appendix B — As-of dates for quoted clauses

| Source | Effective / last-updated | URL |
|---|---|---|
| Gemini API Additional Terms | Effective 2026-03-23, last updated 2026-04-28 | <https://ai.google.dev/gemini-api/terms> |
| Google Generative AI Prohibited Use Policy | Last modified 2024-12-17 | <https://policies.google.com/terms/generative-ai/use-policy> |
| Vertex AI data-governance overview | Last updated 2026-06-03 | <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance> |
| Google Workspace Services Agreement | Active version as of 2026-06-05 | <https://workspace.google.com/terms/> |
| Google Cloud Data Processing Addendum | Active version as of 2026-06-05 | <https://business.safety.google/processorterms/> |
| Gemini API available regions | Active version as of 2026-06-05 | <https://ai.google.dev/available_regions> |

All clauses are frozen at 2026-06-05. Re-verify at next procurement review (suggested cadence: quarterly).
