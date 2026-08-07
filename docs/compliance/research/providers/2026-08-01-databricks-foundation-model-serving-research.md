# Databricks Foundation Model Serving provider research

**Research date / source access date:** 2026-08-01  
**Organization:** ZWIZZLY AS  
**Product context:** MentoMate / EduAgent; consumer tutoring for learners aged 13+, including minors aged 13–17  
**Status:** Internal procurement and compliance research; not legal advice and not a vendor approval  
**Source rule:** Databricks-owned legal pages and documentation were used, plus model-provider policies linked directly by Databricks.

## Bottom line

Databricks is **not currently approvable for minor traffic under MentoMate's
published model-vetting gate**. Databricks publicly documents that Foundation
Model API inputs and outputs may be stored for abuse and safety purposes for up
to 30 days. No public zero-data-retention option was located. MentoMate requires
ZDR for under-18 traffic.

The public evidence is otherwise comparatively strong: the current MCSA
incorporates the DPA and Security Addendum; paid Model Serving accounts receive
a no-training/no-service-improvement commitment; Europe-Geo processing can be
enforced; subprocessors and change notices are published; SCC/DPF transfer
materials exist; and the DPA includes security-incident and data-subject-rights
support.

Databricks could become a candidate only if it supplies retainable account-level
evidence and, most importantly, a binding ZDR/non-persistence commitment that
covers Databricks, safety/abuse systems, prompt caches, logs, backups, and every
partner model provider used.

## Scope distinction

This assessment covers **Databricks-hosted Foundation Model APIs / Model
Serving**, not an external-model endpoint configured with ZWIZZLY's own OpenAI,
Anthropic, or other provider credentials. External endpoints add a separate
provider contract and retention boundary.

The linked open-model pricing page lists GPT OSS 120B and GPT OSS 20B. The wider
supported-model documentation also lists proprietary OpenAI and Anthropic
models. The current supported-model list reviewed did not list Mistral Small 4,
so Databricks is not a complete replacement for MentoMate's current model set.

## Twelve-point provider evidence matrix

| # | Evidence point | Public finding | Status / what remains |
|---|---|---|---|
| 1 | Applicable Art. 28 DPA | The MCSA incorporates the then-current Databricks DPA. The public DPA covers Databricks acting as processor for Customer Personal Data and includes Annex A plus SCC Modules 2 and 3. | **Conditional.** Confirm that the DPA covers the exact Foundation Model API modes and candidate model IDs. |
| 2 | Acceptance, version, and effective date | PayGo use binds the customer to the MCSA, but the public DPA PDF identifies itself as v3 dated 2023-07-21 and also contains signature-oriented wording. | **Missing account evidence.** Obtain a binding acceptance record or countersigned DPA naming ZWIZZLY AS, the exact version, and effective date. |
| 3 | Security measures and assurance | The incorporated Security Addendum describes NIST/ISO-based controls, encryption, access controls, testing, and annual third-party audits. It lists SOC 1 Type II, SOC 2 Type II, ISO 27001, ISO 27017, and ISO 27018. Model Serving documents AES-256 at rest and TLS 1.2+ in transit. | **Publicly supported.** Retain the then-current addendum and obtain the current reports/certificates from the Trust Center. |
| 4 | Contracting entity, service, and account tier | The public MCSA and DPA name Databricks, Inc.; Marketplace or reseller procurement can change the operative agreement. No-training documentation applies to paid Model Serving accounts, not a free trial. | **Account-specific.** Confirm contracting route, paid tier, workspace ID, cloud, deployment mode, and exact model IDs. |
| 5 | Subprocessors and change notice | Databricks publishes cloud providers and AI-backed providers including Anthropic and OpenAI, plus support subprocessors and global Databricks affiliates. The DPA requires 30 days' notice and allows a data-protection objection within 10 days. | **Mostly supported.** Obtain the exact subprocessor subset and content access for each candidate model; confirm that OpenAI receives no content for Databricks-hosted GPT OSS weights. |
| 6 | Processing location and residency | Foundation Model APIs are a Designated Service. With a Europe-Geo workspace and cross-Geo processing disabled, customer content stays within the Europe Geo; that Geo includes the EEA, Switzerland, and the UK. Processing may occur outside the precise workspace region/cloud while remaining inside the Geo. Some models are US-only or global. | **Conditional.** Confirm the selected workspace region, cross-Geo setting, model-by-model region, failover behavior, and whether a country-level location can be provided. |
| 7 | International transfers and TIA support | The DPA incorporates 2021 SCC Modules 2 and 3. Databricks also states that it participates in the EU-US DPF and publishes a TIA FAQ and supplementary-measures summary. | **Publicly supported but not closed.** Map onward transfers for the actual cloud, support path, affiliates, and partner models; complete MentoMate's TIA where SCCs are relied upon. |
| 8 | Retention, deletion, and ZDR | Foundation Model API inputs/outputs may be stored in the workspace region for abuse/safety purposes for up to 30 days. Build logs are retained up to 30 days and metrics up to 14 days. Partner providers may have additional safety retention. The DPA provides deletion controls and deletion/assistance within 30 days after termination on written request. | **BLOCKER.** No public ZDR option was found. The public 30-day maximum fails MentoMate's mandatory ZDR gate for under-18 traffic. Per-request/DSR deletion from abuse stores, backups, and partner stores is not established. |
| 9 | No training or service improvement | Databricks says that for all paid Model Serving accounts it does not use inputs or outputs to train models or improve Databricks services. The Service Specific Terms also prohibit using Customer Content, Inputs, or Outputs to train third-party-available GenAI models. | **Supported for paid use.** Obtain written confirmation for the account and for every underlying partner provider; do not rely on a free trial for production evidence. |
| 10 | Privacy, logging, and cache configuration | AI Gateway payload logging/inference tables can store raw requests and responses in customer Delta tables when enabled. Usage tracking stores operational/token metadata. The API also exposes optional extended prompt caching up to 24 hours. | **Configuration evidence required.** Disable payload logging for production minor traffic unless separately governed; do not request extended caching; document default cache behavior and retention; retain screenshots/API output for the effective settings. |
| 11 | Incident notification and data-subject-rights support | The DPA requires written breach notice without undue delay and no later than 72 hours after awareness. It provides controls and cooperation for DSRs and promptly forwards identifiable requests. | **Publicly supported.** Confirm the operational contact/escalation route and how DSR deletion reaches non-customer-controlled abuse/safety stores and partner providers. |
| 12 | Minor/child-facing use and model-specific restrictions | No blanket minor prohibition was found in Databricks' base MCSA/AUP. Model-specific terms still apply. Databricks' Google Model Terms prohibit services directed to or likely accessed by under-18s. Anthropic requires its minors safeguards. OpenAI models carry Databricks-published grounding and external-user authentication/monitoring requirements. | **Model-specific gate.** Google models remain excluded. Obtain written confirmation that each exact non-Google model may process 13–17-year-old tutoring content under the proposed configuration. |

## Recommended technical configuration if the contractual blocker closes

- Paid production account owned by ZWIZZLY AS; no free-trial traffic.
- Europe-Geo workspace with `Enforce data processing within workspace
  Geography for Designated Services` enabled; cross-Geo processing disabled.
- Exact model allowlist; Google models excluded.
- Payload logging/inference tables disabled for conversational content unless a
  separately approved first-party retention schedule is implemented.
- Extended prompt caching disabled; confirm the default cache lifecycle in
  writing.
- Use only documented production/GA model versions; pin and monitor model
  retirement.
- Archive the account/order evidence, MCSA, DPA, Security Addendum,
  subprocessor list, workspace settings, exact model terms, and vendor reply.

## Ready-to-send vendor ticket

**To:** `privacy@databricks.com` and the Databricks account team/support contact  
**Subject:** ZWIZZLY AS — ZDR, DPA and child-facing Foundation Model API evidence (learners aged 13–17)

Dear Databricks privacy and Model Serving team,

I am writing on behalf of ZWIZZLY AS (org. no. 811 696 072, Fiskekroken 3B,
0139 Oslo, Norway). We are assessing paid Databricks Foundation Model APIs /
Model Serving for MentoMate, an AI-supported tutoring service for learners aged
13 and above, including minors aged 13–17.

Our intended scope is Databricks-hosted Foundation Model APIs, not an external
endpoint using our own third-party provider credentials. The candidate model
set is `databricks-gpt-oss-120b` and potentially
`databricks-gpt-5-mini`, `databricks-gpt-5-4`, and
`databricks-claude-sonnet-4-6`, subject to final technical vetting. We intend to
use a paid Europe-Geo workspace, disable cross-Geo processing and inference
payload tables, and avoid extended prompt caching.

Because children will use the service, our GDPR Article 35 DPIA and provider
approval require retainable, account-specific evidence. Could you please
confirm or provide the following:

1. The binding DPA applicable to our organization/account, its version and
   effective date, the contracting Databricks entity, and an acceptance record
   or countersigned copy identifying ZWIZZLY AS.
2. Written confirmation that the DPA, Security Addendum, and SCC annexes cover
   paid Foundation Model APIs in both pay-per-token/priority and provisioned
   throughput modes for each candidate model above.
3. Your current security/TOM documentation and current SOC 2 Type II and ISO
   27001/27017/27018 evidence (Trust Center access under NDA is acceptable).
4. The exact subprocessors that can process inference inputs or outputs for
   each candidate model, their roles and processing locations, and the change-
   notification mechanism. In particular, please confirm whether OpenAI
   receives any prompts or outputs when Databricks hosts GPT OSS 120B weights.
5. The exact processing Geo/regions and cloud providers for each candidate
   model when the workspace is in Europe and cross-Geo processing is disabled,
   including failover behavior and whether any prompt/output can leave the
   Europe Geo.
6. The transfer mechanism for each relevant onward transfer (adequacy/DPF or
   2021 SCC module), plus any current TIA/Schrems II support material.
7. The exact retention lifecycle for prompts and outputs: ordinary processing,
   abuse/safety stores, human-review queues, prompt caches, service/build logs,
   metrics, backups, and partner-provider copies. Please identify which of
   these can contain full or partial prompt/output content.
8. Whether contractual **zero data retention** is available for our paid
   account so that prompts and outputs from minors are not persistently stored
   by Databricks or any partner provider. If available, please state the
   activation process, covered models/modes, exclusions, and provide written
   confirmation once enabled. If unavailable, please confirm that explicitly.
9. How per-request deletion, a GDPR data-subject deletion request, account
   deletion, and contract termination propagate to abuse/safety stores,
   caches, logs, backups, and partner providers, including the maximum deletion
   time and evidence available to the customer.
10. Written confirmation that, on our paid account, inputs and outputs are not
    used by Databricks or any underlying model provider for training,
    fine-tuning, evaluation, or service/model improvement, including in
    de-identified or aggregated form.
11. The effective privacy controls for our account: cross-Geo enforcement,
    inference/payload logging, usage tracking, default and extended prompt
    caching, and any safety-retention setting. Please identify which settings
    are customer-configurable and which require Databricks support.
12. Written confirmation that the named candidate models may process tutoring
    conversations from learners aged 13–17, together with all applicable
    child-facing/minors conditions. We understand that Google models are
    prohibited for services directed to or likely accessed by under-18s and do
    not propose to use them.

Please also confirm the operational privacy/DSR and incident-notification
contacts for our records. A response by email, links to authoritative documents,
or an export from your Trust Center/account console is suitable as long as the
result is dated and retainable.

Kind regards,

Zuzana Kopecna  
Chair, ZWIZZLY AS  
Org. no. 811 696 072 · Fiskekroken 3B, 0139 Oslo, Norway  
[email]

## Primary sources

- [Foundation Model Serving pricing](https://www.databricks.com/product/pricing/foundation-model-serving)
- [Model Serving data protection, retention, and no-training](https://docs.databricks.com/aws/en/machine-learning/model-serving)
- [Foundation Model APIs compliance, residency, and regional model availability](https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/compliance)
- [Databricks Geos and cross-Geo controls](https://docs.databricks.com/aws/en/resources/databricks-geos)
- [Master Cloud Services Agreement](https://www.databricks.com/legal/mcsa)
- [Data Processing Addendum](https://www.databricks.com/legal/dpa)
- [Security Addendum](https://www.databricks.com/legal/security-addendum)
- [Databricks subprocessors](https://www.databricks.com/legal/databricks-subprocessors)
- [International transfers / TIA FAQ](https://www.databricks.com/legal/tia-faq)
- [Service Specific Terms](https://www.databricks.com/legal/service-specific-terms)
- [Applicable model terms](https://docs.databricks.com/aws/en/machine-learning/model-serving/acceptable-use-models)
- [AI Gateway logging and privacy controls](https://docs.databricks.com/aws/en/ai-gateway/configure-ai-gateway-endpoints)
- [Foundation Model API request parameters, including prompt-cache retention](https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/api-reference)
