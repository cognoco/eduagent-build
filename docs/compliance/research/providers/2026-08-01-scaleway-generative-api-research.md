# Scaleway Generative APIs provider research

**Research date / source access date:** 2026-08-01  
**Organization:** ZWIZZLY AS  
**Product context:** MentoMate / EduAgent; consumer tutoring for learners aged 13+, including minors aged 13–17  
**Status:** Internal procurement and compliance research; not legal advice and not a vendor approval  
**Source rule:** Scaleway-owned legal pages, contracts, product documentation, and the authenticated ZWIZZLY AS console were used.

## Bottom line

Scaleway is a **stronger compliance candidate than Databricks, but is not yet
approved for minor traffic**. Its published and service-specific materials say
that standard synchronous Generative API inference uses zero content retention:
prompts and outputs are not logged, are not available to model providers or
third parties, and are not used for training or service improvement. Scaleway
hosts the service on its own European infrastructure and says Generative API
personal data may be stored in Paris, France.

The important qualification is that Scaleway's ZDR has exceptions. A full HTTP
request may be retained and accessed for up to two weeks when rare errors or
suspected malicious activity harm service operation. Batch inputs are stored
for up to 24 hours. Aggregated/anonymized usage data is stored for up to six
months. MentoMate's model-vetting runbook requires ZDR for under-18 traffic, so
the DPO must rule whether the exceptional two-week content store is compatible
with that gate or whether Scaleway must contractually exclude minor traffic from
it.

The authenticated console showed a professional organization with a validated
DPA (version displayed as `10/2024`) and validated General Terms of Service
(`05/2026`). It did not list the AI Specific Conditions. Those displayed
versions do not cleanly match the currently linked public PDFs, so retainable
copies of the exact account-bound documents and their acceptance dates are
still required. Written clarification of child end-user permission, the exact
Generative API subprocessor set, and the ISO 27001 certificate scope also remain
open.

## Scope and model fit

This assessment covers **Scaleway Generative APIs - Serverless standard
synchronous inference**, primarily `gpt-oss-120b`. Scaleway's current catalog
also includes serverless Mistral, Qwen, Gemma, Llama, Whisper, and embedding
models. Batch processing and Dedicated Deployment have different retention and
networking behavior and require separate configuration evidence.

Scaleway's console currently lists `gpt-oss-120b` as a serverless model. The
public model page documents a 128k context window, up to 32k output tokens, and
Apache 2.0 licensing. Technical capability and safety evaluation remain a
separate admission gate; this note addresses provider/legal evidence only.

## Twelve-point provider evidence matrix

| # | Evidence point | Finding | Status / what remains |
|---|---|---|---|
| 1 | Applicable Art. 28 DPA | Scaleway's DPA forms part of the service contract and applies when the customer is controller/processor and Scaleway is processor/subprocessor. It covers customer-uploaded data and end users. | **Supported in principle.** Obtain the exact account-bound DPA and written confirmation that it covers Generative APIs Serverless, `gpt-oss-120b`, exceptional request capture, and any moderation/abuse processing. |
| 2 | Acceptance, version, and effective date | The authenticated console shows the DPA as **Validated**, version `10/2024`, and General Terms as **Validated**, version `05/2026`. The currently public DPA identifies a different 2024 date, and AI Specific Conditions were not listed in the account table. | **Account evidence incomplete.** Download/procure the exact bound copies, acceptance timestamps, applicable AI Specific Conditions, and contracting-entity confirmation. |
| 3 | Security measures and assurance | The DPA and TOMs describe access control, logging, testing, resilience, physical security, data minimization, retention controls, and privacy by design. Product docs state TLS in transit, API-key/IAM controls, and encryption at rest when data is stored. Scaleway advertises ISO/IEC 27001:2022 and HDS certification; SecNumCloud remains in progress. | **Mostly supported.** Obtain the current ISO certificate, Statement of Applicability/TOMs, audit material, and confirmation that Generative APIs is inside the certified scope. Do not treat SecNumCloud as obtained. |
| 4 | Contracting entity, service, and account tier | Public contracts identify Scaleway SAS in Paris. The console shows a professional organization on the Basic/free support plan; serverless inference is pay-as-you-go. | **Mostly supported.** Confirm the exact contracting entity, production billing status, project/service IDs, support escalation route, and that Basic support does not change privacy commitments. |
| 5 | Subprocessors and change notice | Scaleway publishes a general subprocessor list. The DPA gives general authorization, makes Scaleway responsible for subprocessors, and provides 30 days' advance notice if the customer subscribes to update notifications. Generative API docs say model creators and third-party services cannot access prompts/outputs. | **Incomplete mapping.** Obtain the exact Generative API and support subprocessor subset, purposes, locations, content access, and notification-subscription evidence. |
| 6 | Processing location and residency | Scaleway says models are hosted on its own infrastructure in Europe without third-party interaction and that Generative API personal data may be stored in Paris, France. The DPA says services are EU-located by default. Serverless requests use public internet endpoints; Dedicated Deployment offers private networking and selectable regions. | **Strong public evidence, still confirm.** Obtain a binding country/region statement for standard, exceptional, support, backup, and failover processing for each production mode. |
| 7 | International transfers and TIA support | The DPA says it will not store/process outside the EU without prior notice and applies the 2021 SCCs plus supplementary measures where a non-adequate transfer occurs. The service-specific privacy page says AI inference is not subject to the US CLOUD Act. | **Conditional.** Obtain the actual transfer map for the account, including US-headquartered EU colocation providers, global support, and any exceptional access; complete a TIA wherever SCCs rather than EU-only processing are relied upon. |
| 8 | Retention, deletion, and ZDR | Default standard inference is described as ZDR: no prompt/output logging or post-processing storage. Exception: full HTTP request content may be stored/accessed for rare harmful errors or malicious activity for **up to two weeks**. Batch input is stored for **up to 24 hours**. Aggregated/anonymized usage data is retained for **up to six months**. The DPA provides deletion at contract end subject to legal/legitimate-interest exceptions. | **DPO GATE.** Confirm whether the two-week exception can be disabled or contractually excluded for minor traffic; define deletion/backup behavior and whether error capture includes outputs, identifiers, headers, attachments, or safety-review copies. Do not use batch for minor conversations unless separately approved. |
| 9 | No training or service improvement | The AI Specific Conditions say prompts, completions, and training data are not used to train/retrain/improve base models, are not used to improve the service, and are not accessible to model providers or third-party services. The product privacy page repeats the no-training commitment. | **Strong public/contractual evidence.** Obtain account-specific written confirmation covering every candidate model, exceptional request copies, evaluations, and anonymized/aggregated data. |
| 10 | Privacy, logging, and configuration | Serverless has no stored product configuration beyond per-request parameters. Cockpit exposes token/request metrics and currently stores no Generative API logs. Standard prompts are not logged. Serverless is internet-accessible; private endpoints are not available, although IAM policy conditions can restrict access. Dedicated Deployment can use private networking. | **Configuration evidence required.** Use standard synchronous calls only, avoid batch, restrict API keys/IAM, confirm no content logging in Cockpit/support tooling, and document whether any prompt cache or safety-retention feature exists. |
| 11 | Incident notification and data-subject-rights support | The DPA requires written breach notice as soon as possible after awareness, follow-up information, mitigation cooperation, and a breach register. It requires reasonable DSR assistance; requests can be handled in the console or via `privacy@scaleway.com`. | **Supported but not time-bounded.** Obtain the incident contact/escalation path and any fixed notification SLA, plus the procedure for deleting data from exceptional request stores and subprocessors. |
| 12 | Minor/child-facing use and model-specific restrictions | Scaleway's general privacy policy says it does not provide services to children, but children may use services when accompanied and under an adult's responsibility. The DPA contemplates customer end users. AI conditions require the customer to follow applicable AI law and each model's license/use restrictions, but no explicit authorization for a child-facing tutoring service was found. | **BLOCKER pending written interpretation.** Confirm that an adult-owned business account may process tutoring conversations of learners aged 13–17 through `gpt-oss-120b`, and provide all minor-facing, model-license, moderation, and acceptable-use conditions. |

## Recommended technical posture if the open gates close

- Use paid `Generative APIs - Serverless` standard synchronous inference only;
  do not send minor conversations through batch processing.
- Allowlist the exact production model ID, beginning with `gpt-oss-120b`; repeat
  model-specific legal and capability vetting before adding another model.
- Use a dedicated application API key with least-privilege IAM policy and
  rotation; restrict source context using IAM conditions where available.
- Keep prompts free of names and direct identifiers; continue application-side
  logging and Sentry scrubbing. ZDR at the provider does not sanitize local logs.
- Do not use the web playground for real learner content.
- Archive the exact DPA, General Terms, AI Specific Conditions, TOMs/certificate,
  subprocessor snapshot, notification subscription, account settings, and the
  dated vendor reply.
- Treat model lifecycle changes as a new vetting trigger. Scaleway may deprecate
  models and, in some cases, reroute traffic to a similar model.

## Ready-to-send support ticket

**Submit via:** Scaleway console → Support → Create ticket → Generative APIs  
**Subject:** ZWIZZLY AS — Generative APIs DPA, ZDR exception and permission for learners aged 13–17

Dear Scaleway Privacy and Generative APIs team,

I am writing on behalf of ZWIZZLY AS. We are assessing Scaleway Generative APIs
for MentoMate, an AI-supported tutoring service for learners aged 13 and above,
including minors aged 13–17. Our initial production candidate is standard
synchronous Serverless inference using `gpt-oss-120b`; we do not propose to use
batch processing for learner conversations.

Our Scaleway console currently shows a validated DPA with version `10/2024` and
validated General Terms of Service with version `05/2026`. Because our GDPR
Article 35 DPIA and provider approval require retainable, account-specific
evidence, please confirm or provide the following:

1. The exact DPA and General Terms bound to our organization, their effective
   and acceptance dates, the contracting Scaleway entity, and a copy/export of
   the acceptance record. Please explain the date/version difference between
   the console and the documents currently linked on the public Contracts page.
2. The AI Specific Conditions applicable to Generative APIs Serverless and
   confirmation that they form part of our contract. Please confirm that the
   DPA covers prompts, outputs, attachments, metadata, abuse/security review,
   and support processing for `gpt-oss-120b` and any later approved model.
3. Current Generative API TOM/security material, the ISO/IEC 27001:2022
   certificate and scope/Statement of Applicability, and any independent audit
   report available under NDA. Is Generative APIs explicitly in scope?
4. The exact subprocessors that can process Generative API account data,
   metadata, prompts, or outputs, with purpose and country; whether any model
   developer receives content; and how we subscribe to the 30-day change notice.
5. The exact processing and storage locations for normal inference, exceptional
   error/abuse investigation, metrics, support access, backups, and failover.
   Can any of these leave France or the EEA?
6. For any non-EEA access or transfer, the applicable adequacy mechanism or
   2021 SCC module and your current TIA/Schrems II support material.
7. A precise retention map for standard synchronous prompts/outputs, full HTTP
   requests captured for errors or suspected malicious activity, human review,
   safety systems, caches, logs, metrics, backups, support tickets, and model-
   provider copies. Please state what data each store contains and its maximum.
8. Whether the exceptional full-request retention of up to two weeks can be
   disabled or contractually excluded for traffic from minors. If not, please
   explain its trigger, access controls, deletion method, backup behavior, and
   whether both input and output content can be retained. Is any stricter
   contractual ZDR option available?
9. How per-request erasure, a GDPR data-subject request, account deletion, and
   contract termination propagate to exceptional stores, logs, backups, support
   systems, and subprocessors, with maximum deletion times.
10. Written confirmation that our prompts and outputs—including exceptional
    copies—will not be used by Scaleway or any model provider for training,
    fine-tuning, evaluation, safety-model development, or service/model
    improvement, including after de-identification or aggregation.
11. The effective privacy controls for Serverless: Cockpit logging, prompt
    caching, safety/abuse retention, IAM conditions, and private connectivity.
    Please identify which controls are defaults, customer-configurable, or
    available only on Dedicated Deployment.
12. Written confirmation that an adult-owned professional account may use
    `gpt-oss-120b` to process tutoring conversations from learners aged 13–17,
    together with every applicable minors/child-facing, acceptable-use,
    moderation, model-license, and safety condition. Please clarify how the
    statement “Scaleway does not provide services to children” applies when the
    Scaleway customer is a company and children are its end users under adult
    responsibility.

Please also confirm the operational privacy/DSR and security-incident contacts
for our records. A dated email response, authoritative document links, or a
Trust Center/console export is suitable if it is retainable.

Kind regards,

Zuzana Kopecna  
Chair, ZWIZZLY AS  
[email]

## Primary sources

- [Generative APIs data privacy](https://www.scaleway.com/en/docs/generative-apis/reference-content/data-privacy/)
- [Generative APIs security and reliability](https://www.scaleway.com/en/docs/generative-apis/reference-content/security-and-reliability/)
- [Generative APIs supported models](https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/)
- [Generative APIs FAQ](https://www.scaleway.com/en/docs/generative-apis/faq/)
- [Scaleway contracts](https://www.scaleway.com/en/contracts/)
- [Data Processing Agreement](https://www-uploads.scaleway.com/DPA_2024_ENG_b0abb5cc26.pdf)
- [Specific Conditions for AI Services](https://www-uploads.scaleway.com/Conditions_Particulieres_Services_IA_61a1a5f301.pdf)
- [Technical and Organizational Measures](https://www-uploads.scaleway.com/Technical_and_Organizational_Measures_v17072024_a74508104e.pdf)
- [Subprocessor list](https://www.scaleway.com/en/subprocessorlist/)
- [Security and compliance](https://www.scaleway.com/en/security-and-compliance/)
- [General privacy policy](https://www.scaleway.com/en/privacy-policy/)
- [How to download account-bound contracts](https://www.scaleway.com/en/docs/account/how-to/download-scaleway-contracts/)
