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
| Workspace for Education — **available to users of all ages when an Education admin turns it on**; Gemini in the consumer / non-Education context defaults to 18+. Source: <https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off?co=DASHER._Family=Education&p=edu_supported_editions>. Verbatim: "available to Google Workspace for Education users of all ages" and "Google Workspace with Gemini is unavailable to users under age 18" (the latter is the non-Education default). | — | — | — | ⚠ (admin-gated, all-ages when on) |

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
- **Age posture (resolves a §1 cell):** Verbatim from the Workspace admin help page cited in the 2026-06-04 age-floor minutes (URL: <https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off?co=DASHER._Family=Education&p=edu_supported_editions>): "available to Google Workspace for Education users of all ages" when an Education admin enables the feature. The non-Education default is 18+: "By default, the Gemini app is available to all users over age 18." Some features are gated to 18+ within Education: "Some features are only available to users 18 and over." **This means K-12 students in a Workspace for Education tenant can use Gemini when their admin turns it on** — the surface is genuinely viable for district-deployed use, not just a marketing claim.
- **Training / human review posture:** "Their content is not human reviewed or used for Generative AI model training outside their domain without permission." Same source. Within the Education domain, no human review, no improvement.
- **Data retention:** "conversation history is saved by default for 18 months" — admin-configurable to 3, 18, or 36 months, or off entirely. "Google may still store these conversations for up to 72 hours" (operational buffer; not configurable). "The minimum conversation retention time is 3 months."
- **ZDR / region / CMEK:** Inherits Workspace commitments. The 72-hour hard floor and the 3-month minimum retention are explicit non-ZDR defaults; true ZDR requires admin to turn history off, after which the 72-hour operational buffer may still apply.
- **Verdict:** **Genuinely viable for K-12 districts buying the Education SKU on behalf of their students.** The all-ages admin-gated line resolves the under-13 gate that the original §1 cell marked as ⚠ (silent). The integration shape is the new question: MentoMate doesn't natively live inside a Workspace tenant, so this path requires either Workspace federation, becoming a Workspace Education add-on partner, or selling the MentoMate deployment as a district-procured service that uses the district's own Education tenant for the Gemini leg.

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

### §3 update (2026-06-05, round 2 of the counter-evidence sweep)

The original workflow's named-edtech sweep was blocked by WebSearch 400s. Round 2 of the sweep landed the following with verbatim quotes where available:

**MagicSchool AI — privacy policy, no public LLM disclosure.** The privacy policy says: *"We utilize application program interfaces ('API') to power the AI functionality of our Services from multiple AI vendors. A current list of these vendors can be found in our subprocessors list."* Source: <https://www.magicschool.ai/privacy-policy>. The sub-processor list at `go.magicschool.ai/sub-processors` returned empty content (likely gated behind authentication or a JavaScript-driven render). The terms-of-service confirms: "Our Services use certain artificial intelligence and deep learning platforms, algorithms, tools and models, including those provided by third parties" — generic, no vendor named. Source: <https://www.magicschool.ai/terms>.

**MagicSchool AI — student-data commitments are rigorous and AI-specific.** From the same privacy policy, section "Magic School's Commitments Regarding Student Data":
- *"Use Student Data to train, fine-tune, or improve artificial intelligence or machine learning models, including large language models, or permit any third-party AI provider to do so."*
- *"Data transmitted through artificial intelligence APIs is retained only for a limited period ... and is deleted within thirty (30) days."*
- *"Students under the age of 18 may only access the Service through MagicSchool's agreement with a Customer."*

The 30-day AI-API retention is the key number — it suggests MagicSchool has chosen an AI sub-processor with a contractually limited retention window. **Vertex AI's 55-day default for general Paid Services and 30-day default for Search/Maps grounding are in the same range.** This is consistent with MagicSchool being on Vertex AI (with the Search-grounding path likely off), but does not confirm it. The "permit any third-party AI provider to do so" language is the contractual floor that any AI sub-processor must meet.

**MagicSchool AI — Google integration is for Classroom / Drive / Docs, not for AI.** Verbatim: *"MagicSchool may access limited information from Google Classroom, Google Drive, and Google Docs to provide requested features."* and *"MagicSchool's use of information received from Google APIs complies with the Google API Services User Data Policy, including the Limited Use requirements."* This is the Workspace APIs (a different "API" from the Gemini API), and the Limited Use requirements are the standard Workspace data-handling commitment. The AI leg is a different question.

**Khan Academy / Khanmigo — no usable public disclosure.** The Khan Academy privacy policy URL returned only the page title with no body. The third-party tweet on the Khan Labs page ("Khanmigo, the GPT-4-powered chatbot by @khanacademy") remains the only public signal, and it points to OpenAI.

**Quill, Eduaide, Curipod — 404 / 429 / empty bodies.** Same as round 1; these vendors' privacy pages are not retrievable through WebFetch in this environment.

**Workspace for Education Gemini — round 2 resolved a §1 cell.** This is the major non-MagicSchool finding. From <https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off?co=DASHER._Family=Education&p=edu_supported_editions>:
- *"available to Google Workspace for Education users of all ages"* — when an Education admin turns the feature on.
- *"Google Workspace with Gemini is unavailable to users under age 18"* — the non-Education default.
- *"By default, the Gemini app is available to all users over age 18"* — outside Education.
- *"Some features are only available to users 18 and over"* — per-feature gating within Education.
- *"conversation history is saved by default for 18 months"* — admin-configurable to 3, 18, or 36 months, or off.
- *"Google may still store these conversations for up to 72 hours"* — operational buffer, not configurable.
- *"Their content is not human reviewed or used for Generative AI model training outside their domain without permission"* — within the Education domain.
- *"Your chats and uploaded files in Gemini Apps won't be reviewed by human reviewers or otherwise used to improve generative AI models"* — within the Education context.

**Implication of the Workspace finding for the §1 matrix and §5 synthesis:** the "Khanmigo and MagicSchool obviously use Gemini for minors" framing is most likely pointing at **Workspace for Education Gemini deployed inside a district tenant**, not at Vertex AI directly. The Workspace surface has the all-ages admin-gated clause that resolves the under-13 question; Vertex AI has the ZDR controls; neither of them is a drop-in for MentoMate's current architecture. **Both are procurement paths, not just Vertex AI alone.** This is a real change to the recommendation.

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

**Why:** Vertex AI is the only Google surface whose public terms do not contain a minors prohibition, and which offers a documented path to ZDR (four opt-outs above). The Gemini API is closed; the Consumer Gemini app is consumer-only; Workspace for Education is now confirmed as a viable third surface (all-ages when an Education admin enables it; admin-controlled retention; no human review within the Education domain) but requires MentoMate to integrate with a district's Workspace tenant, which is a separate product decision.

**Reconciliation with the 2026-06-04 age-floor minutes:** the new minutes (commit `04b407b33`, file `docs/meetings/2026-06-04-age-floor-decision-minutes.md`, Section 5 "Follow-up market overview") read: *"Google Gemini API / Google Cloud generative-AI services are not launch candidates for a teen-facing app under the public/default terms unless Google gives written permission or different terms."* This is correct as far as it goes. The "written permission or different terms" path is exactly the path my recommendation describes: Vertex AI under a Cloud DPA, with the four ZDR opt-outs, executed as a custom addendum to the standard Vertex AI agreement. The "permission" comes in the form of the abuse-monitoring ZDR exception, the Section 17 training restriction (already in the standard terms), the CMEK addendum, and the region-pinning addendum. None of these is a Google-written exception for MentoMate specifically; they are standard knobs on the standard contract. The minutes' framing of "not launch candidates unless Google gives written permission" is therefore accurate at the model-route level, but the practical implementation is "execute the standard enterprise controls and add the DPA addendum" — not "negotiate a one-off exception."

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
| Workspace for Education is **not** a documented workaround for the under-13 gate on Vertex AI's behalf. | **2/5** → revised to **4/5** after the round-2 follow-up: the Workspace for Education Gemini admin page explicitly states "available to Google Workspace for Education users of all ages" when admin-enabled. The remaining 1/5 uncertainty is the integration shape (MentoMate is not natively a Workspace app), not the contractual posture. |
| Named edtech products (Khanmigo, MagicSchool, etc.) do not publicly disclose their Gemini surface. | **4/5** | WebSearch and WebFetch both blocked; what did land is consistent with "no public disclosure," but the absence of evidence is not evidence of absence. |
| Vertex AI doc-rot will not weaken the Section 17 training restriction. | **1/5** | Unverified. The banner is on the page. Sales confirmation is the only mitigation. |

---

## Appendix A — Working notes on the evidence base

- **Raw workflow output:** `_research-raw/workflow-output-full.json` (full TaskOutput log, 33 KB) and `_research-raw/deep-research-workflow-output.json` (pointer + stats).
- **Workflow stats:** 98 agent calls, 16 sources fetched, 59 claims extracted, 25 verified, 19 confirmed, 6 refuted. Source set: <https://ai.google.dev/gemini-api/terms>, <https://ai.google.dev/terms>, <https://policies.google.com/terms/generative-ai/use-policy>, <https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>, <https://workspace.google.com/terms/>, <https://support.google.com/>, <https://edu.google.com/workspace-for-education/>, <https://business.safety.google/processorterms/>, <https://ai.google.dev/available_regions>, <https://khanmigo.ai/>, <https://www.magicschool.ai/privacy>, <https://www.eduaide.ai/>, <https://www.curipod.com/>, <https://www.quill.org/privacy-policy>, <https://cloud.google.com/vertex-ai/generative-ai/docs/learn/responsible-ai>.
- **Adversarial verification:** 3-vote per claim, 2/3 refutes kills. Six refuted claims are listed in §4. Two were killed for "solely" overstating the Paid Services logging purpose; four were killed for missing or overbroad sourcing on Workspace for Education clauses.
- **Tooling gap acknowledged:** WebSearch 400s blocked the workflow's named-edtech sweep; WebFetch 404/429/empty-body errors blocked most of the manual follow-up pass. The §3 counter-evidence ledger is best-effort within that constraint.

## Appendix C — Pricing comparison: Vertex AI vs Gemini API (added 2026-06-05)

The Vertex AI and Gemini API / AI Studio surfaces charge the **same per-token model prices for the same models**. Pricing-page economics are identical at the unit level. The differences are in the envelope around the price.

**Free tier:**
- **Gemini API / AI Studio:** A real free tier exists, with rate limits (~5–15 RPM, ~1M–4M TPM depending on model). Prompts/responses on the free tier are on the Unpaid Services track — used by Google to improve products and may be human-reviewed. **Not usable for a minors-facing product** (training/human-review posture + 18+ clause).
- **Vertex AI:** No free tier. Google Cloud's $300 trial credit is the closest, but Vertex AI itself is metered from the first call. Cloud DPA-backed data handling from day one.

**Per-token pricing (reference, 2026-06-05):**

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| Gemini 2.5 Pro | ~$1.25 (≤200K ctx) / ~$2.50 (>200K ctx) | ~$10.00 / ~$15.00 |
| Gemini 2.5 Flash | ~$0.30 / ~$0.60 by context | ~$2.50 / ~$3.50 |
| Gemini 2.0 Flash | ~$0.10 / ~$0.70 split | |
| Gemini 2.0 Flash-Lite | ~$0.025 / ~$0.075 split | |

Same numbers on both surfaces. The bill arrives through different meters (Google Cloud billing vs. AI Studio billing) but the unit economics are identical.

**What Vertex AI adds that costs money (engineering time, not SKU fees):**
- **CMEK** (Customer-Managed Encryption Keys) — bring your own keys from Cloud KMS. Currently in Preview for Vertex AI. Free in itself; requires Cloud KMS setup and per-project configuration.
- **VPC Service Controls** — a flat per-project fee for VPC-SC itself, not Vertex AI. Network-level exfiltration prevention.
- **Provisioned Throughput** — committed-use discounts of 20–50% versus on-demand, depending on term. Trade: pay the minimum even when usage dips. No equivalent on the Gemini API.
- **Web Grounding for Enterprise** — the ZDR-compatible Search-grounding alternative. Per-query fee on top of model tokens. Significantly more expensive than ungrounded.
- **Batch predictions** — 50% discount for asynchronous bulk inference. Useful for the Challenge Round assessment path if latency budget allows. No equivalent on the Gemini API.
- **ZDR abuse-monitoring exception** — free; it's a policy request, not a SKU. Operational cost is the request + monitoring.
- **Region pinning with explicit commitments** — available on both surfaces, but Vertex AI's commitments are clearer in the Cloud DPA.

**Honest procurement read:** at the per-token level, the surfaces are the same price. The cost differentiator for a minors-facing product is whether you pay the engineering cost to wire up Vertex AI's enterprise controls (CMEK, ZDR opt-out, region pinning, batch discounting) — and the answer is yes, because the contractual posture is the product. The Gemini API's free tier is a real money-saver for prototyping but is contractually out for production use with minors.

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
