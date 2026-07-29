# Provider DPA request email — Anthropic / Mistral / Voyage AI

> Sent per DPO interim advice (Stephan Hartmann, 26 Jul 2026), advice item A7 / actions 8–9.
> One base email for all three; Mistral gets the additional block. Address to the provider's
> privacy/legal contact (privacy@anthropic.com · privacy@mistral.ai · legal@voyageai.com — verify
> current addresses on each provider's site before sending).

---

**Subject:** DPA execution and Article 28 documentation request — ZWIZZLY AS (GDPR controller, child-facing service)

Dear [Provider] privacy team,

I am writing on behalf of ZWIZZLY AS (org. no. 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway), a Norwegian company preparing to launch MentoMate, an AI-supported tutoring application for learners aged 13 and above, including minors aged 13–17.

We use, or intend to use, your API services to process our users' personal data. Because our service is directed in part at children, we are completing a Data Protection Impact Assessment under Article 35 GDPR, supervised by our designated external Data Protection Officer. Our DPO requires documented, verifiable Article 28 evidence for every processor that receives our users' personal data before any production use. A standard web link to your terms is not sufficient for this record — we need documentation we can retain as evidence of the agreement actually in force between our two companies.

Could you please provide, or direct us to the authoritative source for:

1. **An executed Data Processing Agreement** — either a countersigned DPA, or written confirmation of our acceptance of your standard DPA, identifying the effective date and the exact version applicable to our account/organisation.
2. **Your current technical and organisational security measures** (TOMs or equivalent security documentation, e.g. SOC 2 / ISO 27001 summary).
3. **Your current subprocessor list**, including each subprocessor's role and processing location, and how we will be notified of changes.
4. **Processing locations / data residency** for API workloads under our account, and whether an EU/EEA processing option is available.
5. **The international transfer mechanism** you rely on for any transfer outside the EEA (adequacy decision, SCC module and version), plus any supporting material relevant to a transfer impact assessment.
6. **Retention and deletion behaviour for API content** — default retention periods, whether a zero-data-retention option is available for our account, and how deletion (including on our request or contract termination) is confirmed.
7. **Written confirmation that API inputs and outputs under our account are not used for model training** or any purposes beyond providing the service.
8. **Any conditions or restrictions applicable to processing minors' (13–17) personal data** through your API, and any controls you require from customers operating child-facing services.
9. A named **contact for data-protection matters** for our records.

We are assembling this documentation for our DPIA on a defined timeline and would appreciate a response within 14 days. If part of this is self-serve (e.g. a DPA acceptance flow in the account dashboard or a trust/security portal), a pointer to the exact location is equally welcome — our requirement is simply that the result is retainable, dated evidence.

Thank you for your assistance.

Kind regards,

[Name]
[Title], ZWIZZLY AS
Org. no. 811 696 072 · Fiskekroken 3B, 0139 Oslo, Norway
[email]

---

## Additional block — Mistral only (insert before the closing paragraph)

In addition, two points specific to your standard documentation:

10. **Special categories of personal data.** Your current standard DPA describes special categories of personal data as "None". Our service processes free-text conversations with learners, and we must account for the possibility that a user unexpectedly includes information of that kind (e.g. health or religion) in a message, even though our service does not request or intentionally use it. Please confirm how such incidental content in API inputs is treated under the DPA, and whether a contractual clarification or amendment is available to reflect this risk.
11. **Feedback features.** Your DPA states that in-product feedback (e.g. thumbs up/down) and associated input/output may be processed by Mistral as an independent controller for training and product improvement. Please confirm which API surfaces or features this applies to, so we can verify that no production user content can reach that route from our integration.

---

## Send log

| Provider | Sent to | Date sent | Response received | Evidence filed |
|----------|---------|-----------|-------------------|----------------|
| Anthropic | | 2026-07-26 | | |
| Mistral | | 2026-07-26 | | |
| Voyage AI | | 2026-07-26 | | |
