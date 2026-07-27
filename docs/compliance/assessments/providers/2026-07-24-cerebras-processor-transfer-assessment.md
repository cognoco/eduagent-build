# Cerebras processor and international-transfer assessment

- **Controller:** ZWIZZLY AS, organisation no. 811 696 072
- **Processor under review:** Cerebras Systems Inc., United States
- **Service:** Cerebras Inference API, currently serving `gpt-oss-120b`
- **Assessment date:** 24 July 2026
- **Assessed against:** `main` at
  `32346b19a96b055c63e7e5946302d6bf6224df11`
- **Decision:** **Conditionally suitable, but not yet approved for launch use.**

This is ZWIZZLY AS's operational processor and transfer assessment. It is not
independent legal advice. Accountable management remains responsible for the
decision after receiving the DPO/privacy advice needed for the DPIA.

## 1. Bottom line

Cerebras appears technically and organisationally capable of acting as an AI
processor. Its current public documentation says that API requests are not used
to train models and that inference inputs and outputs are not retained. Its
authenticated Trust Center provides an Inference Cloud SOC 2 Type 2 report,
security policies, a penetration-test report, a subprocessor register, and a
June 2025 DPA containing Article 28 terms and the 2021 EU Standard Contractual
Clauses.

The DPA available in the Trust Center is nevertheless a generic, unexecuted
template. It becomes binding only through an enterprise agreement or order form.
Its annex also conflicts with MentoMate's real processing in several material
ways: it records no sensitive data, uses a business-relationship retention
period, names the Irish Data Protection Commission rather than the Norwegian
Datatilsynet, and describes generic customer-support processing. The DPA's
72-hour processor breach-notification period also needs to be tightened to
"without undue delay" so ZWIZZLY AS can meet its own GDPR deadline.

ZWIZZLY AS may approve Cerebras only after Cerebras supplies a binding agreement
that resolves the items in section 8. Until then, Cerebras must remain a launch
gate for EEA personal data, especially data from 13–17-year-old learners.

## 2. Actual processing on current `main`

The live model register records Cerebras-US as the universal primary text route
for all tiers and ages, including asynchronous deep jobs. The planned
residence-aware substitution of EU-hosted providers is not built, so EEA
traffic currently takes the Cerebras-US primary path
([model register](../../../registers/llm-models/master.md)).

The direct adapter posts server-to-server to
`https://api.cerebras.ai/v1/chat/completions`. It sends the model name, complete
message array, output limit, response format, reasoning effort, and API
credential. It does not add a learner ID, profile ID, session ID, email address,
device identifier, or end-user IP address
([adapter](../../../../apps/api/src/services/llm/providers/cerebras.ts)).

For an ordinary tutoring exchange, the provider-bound message array can contain:

- the current learner message;
- replayable prior learner, tutor, and system-prompt events selected from a
  scan capped at the latest 400 stored session events;
- subject, topic, homework, assessment, quiz, vocabulary, or curriculum text;
- selected learning-memory material, including interests, strengths,
  difficulties, communication notes, recent summaries, and accommodations;
- an age-calibrated communication style, language and pronoun preferences;
- generated classifications, summaries, evaluations, recaps, and progress
  material used by the other router-backed LLM flows.

The exchange construction and history projection are in
[`session-exchange.ts`](../../../../apps/api/src/services/session/session-exchange.ts)
and [`exchanges.ts`](../../../../apps/api/src/services/exchanges.ts). The same
central router is also used for curriculum and book generation, assessment
questions, homework processing, learner-profile analysis, language exercises,
summaries, recaps, and topic extraction.

Current controller-side reductions are meaningful:

- an LLM-disclosure consent withdrawal is checked before exchange preparation
  or provider dispatch;
- a minor's display name is removed at both context construction and prompt
  egress; only an unambiguously adult owner may have a display name included;
- the adapter sends no direct MentoMate account or session identifier;
- raw learner disclosures are excluded from MentoMate's safety telemetry;
- provider traffic is encrypted in transit.

These measures pseudonymise and minimise the transfer, but they do not
anonymise it. A learner can type identifying information, and conversation,
learning-memory, accommodation, or safeguarding text may reveal or allow an
inference about health, disability, religion, ethnicity, sexual orientation, or
other special-category information.

## 3. Evidence reviewed

### Authenticated Cerebras Trust Center, under NDA

Access was approved for Zuzana Kopecna on 24 July 2026. The following evidence
was reviewed. Confidential security-report contents are not reproduced here;
the current subprocessor register is summarised only to the extent needed for
this assessment:

- `Cerebras Data Processing Agreement.pdf`, revision June 2025, nine pages;
- `2025_CEREBRAS_SYSTEMS_INC. - Inference Cloud - Final Report.pdf`, SOC 2
  Type 2, covering 1 December 2024 through 30 November 2025;
- the penetration-test report, network diagram, information-security policy,
  incident-response material, encryption controls, access-control material,
  and breach-notification material;
- the Trust Center subprocessor register.

The Trust Center status "Review in progress" is a workflow label, not evidence
that ZWIZZLY AS has approved the processor or entered into the DPA.

### Public provider statements

- Cerebras states that inference inputs and outputs are not retained, while
  service logs are deleted when no longer needed:
  [Cerebras Privacy Policy](https://www.cerebras.ai/privacy-policy).
- Cerebras states that Playground and API requests are never used to train
  models:
  [Cerebras Inference Playground documentation](https://inference-docs.cerebras.ai/console/playground).
- Automatic prompt caching is enabled for `gpt-oss-120b`. Cached prompt
  prefixes remain in organisation-isolated ephemeral memory, normally for five
  minutes and potentially for up to one hour; Cerebras describes this as
  ZDR-compliant because the cache is not persisted:
  [Cerebras prompt-caching documentation](https://inference-docs.cerebras.ai/capabilities/prompt-caching).
- The public Terms apply to the inference-as-a-service API and say that
  third-party model terms can also govern prompts and outputs:
  [Cerebras Terms of Use](https://www.cerebras.ai/terms-of-service).

## 4. Article 28 assessment

| Requirement | Evidence and finding | Status |
|---|---|---|
| Binding processor contract | The Trust Center DPA says it is executed through the associated enterprise agreement/order form. No such agreement naming ZWIZZLY AS is yet in place. | **Open — vendor dependent** |
| Scope and documented instructions | The DPA restricts processing to the agreement, the service, law, and documented customer instructions. Unauthorised processing is prohibited. | Suitable once binding |
| No sale, sharing, unrelated use, or combination | The DPA prohibits sale/share, processing outside the direct relationship, unrelated purposes, and combining customer data with other sources. This supports the no-training position. | Suitable once binding |
| Confidentiality | Authorised personnel must be bound by confidentiality. | Suitable once binding |
| Security | High-level DPA safeguards plus current Inference Cloud SOC 2 Type 2 and the Trust Center security evidence provide reasonable preliminary assurance. | Suitable; monitor annually |
| Subprocessors | General authorisation, written equivalent obligations, Cerebras liability, 14-day notice, and a current register are provided. | Suitable with clarification in section 8 |
| Data-subject rights | Cerebras must notify ZWIZZLY AS of requests and provide commercially reasonable assistance. | Suitable once binding |
| DPIA and regulatory assistance | The DPA provides assistance with DPIAs, authority consultation, and compliance information. | Suitable once binding |
| Audit | The DPA provides information, audit, and inspection rights. Trust Center reports are an efficient first-line assurance mechanism. | Suitable once binding |
| Return/deletion | The DPA provides return or destruction on request or termination, subject to legal retention. | **Clarification required** because Annex I separately says data may be retained for the business relationship |
| Personal-data breach | Cerebras commits to notify within 72 hours after discovery and assist with investigation and mitigation. | **Amendment required** to require notice without undue delay, preferably within 24 hours and in all cases no later than 72 hours |

## 5. Subprocessors and locations

The Trust Center register listed these subprocessors on 24 July 2026:

| Subprocessor | Stated purpose | Location | Assessment |
|---|---|---|---|
| Amazon Web Services | Front-end cloud infrastructure for the inference service | US | Expected to handle inference-service traffic |
| Cloudflare | Secure web-application performance | US | May handle traffic at the service edge |
| Mixpanel | Aggregate inference-service analytics | US | Confirm that prompt/output content and learner identifiers are excluded |
| SendGrid | Inference-service user communications | US | Confirm that it receives account/contact data only |
| HubSpot | Customer relationship management | US | Confirm that it receives account/contact data only |
| Salesforce | Customer relationship management | US | Confirm that it receives account/contact data only |

The DPA annex generically gives subprocessors the same subject matter, nature,
and duration as Cerebras. That wording is broader than the stated purposes in
the register. Cerebras should confirm which subprocessors can access inference
content and that analytics and CRM subprocessors do not receive prompts or
outputs.

## 6. Transfer impact assessment

### Transfer

- **Exporter:** ZWIZZLY AS, Norway, controller.
- **Importer:** Cerebras Systems Inc., United States, processor.
- **Data subjects:** EEA learners aged 13+, adult users, and people mentioned
  by them.
- **Data:** the categories in section 2, including foreseeable incidental
  special-category data.
- **Frequency:** continuous while the service is used.
- **Access needed:** Cerebras must process prompt text in plaintext to provide
  inference; encryption cannot protect the content while the model is using it.

### Transfer tool

The draft DPA incorporates the 2021 EU Standard Contractual Clauses and selects
Modules 1, 2, and 3. Module 2 is the relevant controller-to-processor module for
MentoMate. SCCs can provide Article 46 safeguards only after the DPA and its
associated agreement are validly executed
([Commission Decision (EU) 2021/914](https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj)).
This assessment does not rely on Cerebras participation in the EU-US Data
Privacy Framework; no provider certification under that framework was supplied
as part of the evidence reviewed.

The DPA names the Irish Data Protection Commission as competent supervisory
authority. For ZWIZZLY AS as a Norwegian exporter, the annex should instead
identify the Norwegian Datatilsynet unless independent advice confirms another
authority is legally correct.

### Third-country law and supplementary measures

The European Commission says that the US national-security safeguards and
redress mechanism apply to GDPR transfers to US companies regardless of the
transfer mechanism, including transfers using SCCs rather than the Data Privacy
Framework
([European Commission EU-US data-transfer guidance](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_en)).
The EDPB nevertheless requires exporters using a transfer tool to understand
the transfer, assess the destination law and practice, add effective safeguards
where needed, and re-evaluate over time
([EDPB Recommendations 01/2020](https://www.edpb.europa.eu/documents/recommendation/recommendations-012020-on-measures-that-supplement-transfer-tools-to_en)).

Supplementary measures for this transfer are:

- TLS transport and Cerebras security controls;
- direct server-to-server requests without learner account/session identifiers
  or end-user IP forwarding;
- removal of minors' stored display names from prompts;
- purpose limitation and no-training commitments;
- non-persistence of inputs and outputs;
- organisation-isolated, memory-only prompt caching for no more than one hour;
- contractual government-request notice, where legally permitted;
- return/deletion rights, subprocessor controls, and audit rights;
- a controller-side kill switch and EU-provider fallbacks if Cerebras becomes
  unsuitable or unavailable.

These measures materially reduce exposure but cannot make plaintext inference
immune from a lawful access demand while processing is occurring. Because the
service is for children and free text may contain sensitive disclosures, the
residual transfer risk is **medium before contractual closure**. It can be
accepted as **low–medium** only after the section 8 conditions are met and
accountable management records the decision after DPO/privacy advice.

## 7. Retention and training conclusion

"Zero data retention" must be stated precisely:

- Cerebras publicly commits not to retain inference inputs or outputs.
- It publicly commits not to train models on API requests.
- It automatically keeps prompt-prefix representations in ephemeral,
  organisation-isolated memory for five minutes and potentially up to one
  hour.
- It keeps service logs for an undefined period described only as necessary to
  provide the service.
- The draft DPA annex says personal data may be kept for the duration of the
  business relationship.

ZWIZZLY AS should therefore not claim that Cerebras holds no data at any point.
The accurate description is: prompt content is transiently processed and may
be held in a non-persistent prompt cache for up to one hour; inputs and outputs
are not persistently retained or used for training, subject to a binding
agreement that resolves the DPA's broader retention wording and defines whether
logs can contain prompt/output content.

## 8. Conditions for approval

ZWIZZLY AS has completed the code/data-flow review and the evidence assessment
that can be completed before the vendor responds. Launch approval additionally
requires DPO/privacy advice and an accountable-management decision after
Cerebras provides a binding enterprise agreement/order form and DPA that:

1. names ZWIZZLY AS and expressly covers the Cerebras Inference API used by
   MentoMate;
2. makes the no-training and non-persistent input/output retention commitments
   contractual, records the prompt-cache maximum, and defines service-log
   contents and retention;
3. replaces "Sensitive data: None" with an accurate statement that incidental
   special-category data may occur in open learner text, together with the
   applicable safeguards;
4. identifies the Norwegian Datatilsynet as competent supervisory authority,
   unless independent advice confirms a different authority;
5. requires breach notification without undue delay, preferably within 24
   hours and never later than 72 hours after discovery;
6. confirms that Mixpanel, SendGrid, HubSpot, and Salesforce do not receive
   inference prompts or outputs, and identifies every subprocessor that can
   access inference content;
7. resolves the annex's business-relationship retention wording in favour of
   the service-specific retention commitments; and
8. is signed or otherwise demonstrably incorporated into a binding agreement
   before any launch processing.

ZWIZZLY AS asked Cerebras through the authenticated Trust Center on 24 July
2026 to provide the DPA for signature and confirm coverage of the Inference API
and EEA-to-US safeguards. The vendor response is pending.

ZWIZZLY AS has prepared a
[Cerebras-format proposed DPA](2026-07-25-cerebras-dpa-proposed-zwizzly.md)
containing the requested corrections. It is a negotiation draft and does not
become evidence of contractual closure until Cerebras accepts and executes it.

## 9. Decision record

| Role | Decision |
|---|---|
| Engineering/privacy evidence review | Complete on 24 July 2026 |
| Accountable management — Zuzana Kopecna or Jørn | Pending the section 8 evidence and DPO/privacy advice |
| DPO/privacy advice | Pending |
| Current launch disposition | **Do not launch EEA personal-data processing through Cerebras until section 8 is closed** |

Reassess annually and whenever Cerebras changes its DPA, retention, training
use, model host, prompt caching, subprocessors, security report, or serving
region, or when MentoMate expands its age/country scope.
