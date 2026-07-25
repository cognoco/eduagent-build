# Data Processing Agreement

## ZWIZZLY AS proposed draft for Cerebras Systems Inc.

**Based on:** Cerebras Data Processing Agreement, Revision June 2025
**Prepared:** 25 July 2026
**Status:** Negotiation draft — not signed and not yet binding

> **Cover note for Cerebras**
>
> ZWIZZLY AS has used the structure and substance of the Cerebras June 2025
> DPA template and completed it for MentoMate's actual use of the Cerebras
> Inference API. The proposed changes make the annex accurate for an AI tutoring
> service used by learners aged 13 and above and align the contractual terms
> with Cerebras's published no-training and inference-retention statements.
>
> Cerebras may implement these terms by countersigning this document or by
> issuing its own execution copy or order form that contains the same
> protections. This cover note may be removed from the signature version.

### Principal changes requested

1. The DPA names both parties and can be executed directly; it does not depend
   on an unidentified future enterprise agreement.
2. It expressly covers MentoMate's use of the Cerebras Inference API.
3. Cerebras's published no-training, non-persistent inference retention, and
   prompt-cache limits are made contractual.
4. The annex accurately recognises that open learner text may incidentally
   contain special-category or otherwise highly sensitive personal data.
5. Cerebras must notify ZWIZZLY AS of a personal-data breach without undue
   delay and no later than 24 hours after becoming aware of it.
6. The retention description is specific to inference content and operational
   logs rather than the entire business relationship.
7. The Norwegian Data Protection Authority, Datatilsynet, is identified as the
   competent supervisory authority.
8. Subprocessor access is limited by function. Analytics, communications, and
   CRM providers may not receive inference prompts, outputs, or learner
   identifiers.
9. The Standard Contractual Clauses use the controller-to-processor module for
   the parties' current relationship.

---

## Parties and effective date

This Data Processing Agreement, including its annexes (the **DPA**), is entered
into between:

**ZWIZZLY AS**, a Norwegian private limited company, organisation number
811 696 072, with its business address at Fiskekroken 3B, 0139 Oslo, Norway
(**Customer**); and

**Cerebras Systems Inc.**, with its address at 1237 E. Arques Ave.,
Sunnyvale, California 94085, United States (**Cerebras**).

The DPA takes effect on the date of the last signature below (the **Effective
Date**). It applies to Customer's use of the Cerebras Inference API and any
related Cerebras service through which Cerebras processes Customer Personal
Data (the **Service**).

This DPA forms part of the agreement governing Customer's use of the Service,
including any applicable Cerebras online terms, enterprise agreement, API
account agreement, or order form (the **Agreement**). The parties may execute
this DPA directly even if no separate enterprise agreement or order form
exists. If this DPA conflicts with the Agreement on the processing or
protection of Customer Personal Data, this DPA prevails.

## 1. Definitions

### 1.1 Applicable Data Protection Law

**Applicable Data Protection Law** means every law and binding regulation that
applies to the processing of Customer Personal Data under the Agreement,
including, where applicable:

- Regulation (EU) 2016/679 (**GDPR**) as incorporated into the European
  Economic Area;
- the Norwegian Personal Data Act;
- the United Kingdom GDPR and Data Protection Act 2018;
- the Swiss Federal Act on Data Protection; and
- applicable United States federal and state privacy laws, including the
  California Consumer Privacy Act as amended by the California Privacy Rights
  Act.

### 1.2–1.10 Data-protection terms

**Controller**, **processor**, **data subject**, **personal data**,
**processing**, **special categories of personal data**, and **supervisory
authority** have the meanings given to them in Applicable Data Protection Law.

**Customer Personal Data** means personal data processed by Cerebras or a
subprocessor on Customer's behalf in connection with the Service.

**Personal Data Breach** means a breach of security leading to the accidental
or unlawful destruction, loss, alteration, unauthorised disclosure of, or
access to Customer Personal Data transmitted, stored, or otherwise processed.

### 1.11 Instructions

**Documented Instructions** means the Agreement, this DPA, Customer's lawful
use and configuration of the Service, and additional written instructions
agreed by the parties.

### 1.12 Standard Contractual Clauses

**SCCs** means the standard contractual clauses in the Annex to European
Commission Implementing Decision (EU) 2021/914 of 4 June 2021, as amended,
replaced, or formally adapted for the EEA from time to time.

### 1.13 Subprocessor

**Subprocessor** means a third party appointed by Cerebras to process Customer
Personal Data on Customer's behalf in connection with the Service.

### 1.14 Restricted Transfer

**Restricted Transfer** means a transfer of Customer Personal Data from the
EEA, United Kingdom, or Switzerland to a country that is not recognised as
providing an adequate level of protection, where Applicable Data Protection
Law requires an approved transfer safeguard.

## 2. Roles and scope

### 2.1 Customer

For the processing described in Annex I, Customer acts as controller and is
responsible for determining the purposes and means of the processing.

### 2.2 Cerebras

Cerebras acts as Customer's processor. Cerebras will process Customer Personal
Data only:

1. to provide and secure the Service;
2. on Customer's Documented Instructions;
3. as described in this DPA and Annex I; or
4. where required by applicable law, after informing Customer of that legal
   requirement before processing unless the law prohibits such notice.

### 2.3 No independent use

Cerebras will not:

- sell or share Customer Personal Data;
- use it for targeted or cross-context behavioural advertising;
- process it for Cerebras's own model training, model improvement, profiling,
  or product-development purposes;
- combine it with personal data received from another customer or collected
  through Cerebras's own interactions with a data subject, except where
  strictly necessary to protect the security of the Service and permitted by
  Applicable Data Protection Law; or
- retain, use, or disclose it outside the direct business relationship with
  Customer or for a purpose unrelated to providing and securing the Service.

The parties agree that Customer Personal Data is disclosed only for the
limited and specified purposes in this DPA and that Cerebras does not receive
it as consideration for the Agreement.

## 3. Obligations of the parties

### 3.1 Customer obligations

Customer will:

1. comply with Applicable Data Protection Law;
2. provide lawful, fair, and transparent information to data subjects;
3. establish and document an appropriate legal basis for the processing;
4. obtain any consent that Applicable Data Protection Law requires;
5. issue only lawful Documented Instructions; and
6. use reasonable measures to minimise personal data submitted to the Service,
   particularly data relating to children and sensitive disclosures.

### 3.2 Cerebras obligations

Cerebras will:

1. comply with Applicable Data Protection Law applicable to Cerebras as a
   processor;
2. notify Customer promptly if, in Cerebras's opinion, an instruction infringes
   Applicable Data Protection Law;
3. notify Customer without undue delay if Cerebras can no longer meet its
   obligations under this DPA and take reasonable steps to remediate the issue;
4. ensure that every person authorised to process Customer Personal Data is
   subject to an appropriate duty of confidentiality and receives relevant
   privacy and security training;
5. implement and maintain the technical and organisational measures in
   Annex II;
6. taking into account the nature of the processing, assist Customer through
   appropriate technical and organisational measures to respond to requests
   from data subjects;
7. promptly notify Customer of a request from a data subject concerning
   Customer Personal Data and not respond except on Customer's instructions or
   as required by law;
8. assist Customer with security obligations, personal-data-breach
   notifications, data-protection impact assessments, and prior consultation
   with a supervisory authority, taking into account the nature of processing
   and the information available to Cerebras;
9. provide information reasonably necessary to demonstrate compliance with
   Article 28 GDPR and this DPA;
10. make available current independent security-assurance reports and permit
    audits in accordance with section 6;
11. return or delete Customer Personal Data in accordance with section 4; and
12. immediately stop and remediate any processing that Customer reasonably
    identifies as unauthorised under this DPA.

### 3.3 Service-specific no-training and retention commitments

Cerebras will ensure that:

1. prompts, message history, system instructions, and outputs submitted through
   or generated by the Service are not used to train, fine-tune, evaluate, or
   improve any model or service, except where Customer gives a separate,
   specific written instruction;
2. inference prompts and outputs are not persistently stored after the
   inference request has completed;
3. if automatic prompt caching is used, cached prompt prefixes remain
   organisation-isolated, in volatile memory only, and are deleted no later
   than one hour after their creation;
4. inference prompts and outputs are not copied into backups;
5. operational logs do not contain inference prompts, inference outputs, or
   direct learner identifiers;
6. operational logs containing Customer account or request metadata are
   retained for no longer than 30 days, unless a longer period is necessary for
   a documented security incident or binding legal obligation; and
7. data retained under an exception in item 6 is access-restricted, used only
   for that exception, and deleted promptly when the exception ends.

If Cerebras cannot meet any commitment in this section, Cerebras will notify
Customer before the affected processing begins. Customer may suspend the
affected processing without penalty until the parties agree an acceptable
written alternative.

### 3.4 Special-category and sensitive data

The Service is not intended to solicit special-category data. Cerebras
nevertheless acknowledges that open learner text and learning context may
incidentally contain or reveal special-category or otherwise highly sensitive
personal data. Cerebras will apply this DPA's protections to that data and will
not intentionally infer, classify, enrich, or use it for any purpose other
than generating the response requested by Customer.

## 4. Return and deletion

### 4.1 During the term

On Customer's written request, Cerebras will delete or return Customer Personal
Data in its possession or control unless continued processing is necessary to
provide the Service on Customer's instructions.

### 4.2 At termination

At the end of the Agreement, Cerebras will delete or return all remaining
Customer Personal Data, at Customer's choice, and delete existing copies unless
applicable law requires retention. If retention is legally required, Cerebras
will:

- inform Customer of the relevant requirement unless prohibited by law;
- isolate and protect the retained data;
- process it only for the legally required purpose; and
- delete it when the required retention period ends.

### 4.3 Confirmation

On request, Cerebras will provide written confirmation that deletion required
by this section has been completed. The service-specific limits in section 3.3
apply throughout the term and are not extended by this section.

## 5. Security and Personal Data Breaches

### 5.1 Security

Taking into account the state of the art, implementation costs, and the nature,
scope, context, and purposes of processing as well as the risk to data
subjects, Cerebras will implement and maintain the technical and organisational
measures in Annex II. Cerebras will not materially reduce the overall security
of the Service during the term.

### 5.2 Personal Data Breach notification

Cerebras will notify Customer of a confirmed Personal Data Breach without
undue delay and in any event no later than 24 hours after becoming aware of it.
The initial notice may be phased and will include, to the extent then known:

1. the nature of the breach, including the categories and approximate numbers
   of affected data subjects and records;
2. the date and time the breach began, was detected, and was contained;
3. the likely consequences;
4. the measures taken or proposed to investigate, contain, remediate, and
   mitigate the breach;
5. the Customer Personal Data and subprocessors involved;
6. the countries in which the affected data was processed; and
7. a contact from whom Customer can obtain further information.

Cerebras will:

- provide material updates without undue delay;
- preserve relevant evidence;
- cooperate with Customer's investigation and notifications;
- take reasonable steps to contain, investigate, remediate, and mitigate the
  breach; and
- not notify a data subject, regulator, or third party on Customer's behalf
  without Customer's instruction unless required by law.

Notification under this section does not constitute an admission of fault or
liability.

## 6. Demonstrating compliance and audits

### 6.1 Compliance information

Cerebras will make available the information reasonably necessary to
demonstrate compliance with this DPA, including current SOC 2 Type 2 or
equivalent independent assurance, penetration-test summaries, security
policies, incident-response information, and the current subprocessor register.

### 6.2 Audits

Customer or an independent auditor mandated by Customer may conduct an audit,
including an inspection, where:

- the information in section 6.1 is not sufficient to demonstrate compliance;
- a Personal Data Breach or material compliance concern has occurred;
- a supervisory authority requires the audit; or
- Applicable Data Protection Law otherwise requires it.

Audits will be conducted on reasonable notice, during normal business hours,
and in a manner that avoids unnecessary disruption and protects other
customers' confidential information. Cerebras will promptly address material
findings relating to Customer Personal Data.

## 7. Subprocessors

### 7.1 General authorisation

Customer gives Cerebras general written authorisation to use the
subprocessors listed in Annex III, subject to this section.

### 7.2 Conditions

Before a subprocessor processes Customer Personal Data, Cerebras will:

1. conduct appropriate privacy and security due diligence;
2. enter into a written agreement imposing data-protection obligations no less
   protective than those in this DPA;
3. restrict the subprocessor to the data and purpose stated in Annex III;
4. ensure an appropriate transfer safeguard is in place for every Restricted
   Transfer; and
5. remain fully liable to Customer for the subprocessor's performance.

### 7.3 Changes

Cerebras will give Customer at least 14 days' prior written notice of a new or
replacement subprocessor, including its name, location, purpose, and whether it
may access inference content. Customer may object on reasonable
data-protection grounds. The parties will work in good faith to resolve the
objection. If no reasonable resolution is available, Customer may stop using
the affected Service without penalty.

### 7.4 Function-based access restriction

Only infrastructure subprocessors that technically require access to
inference traffic may process prompts or outputs. Analytics, communications,
sales, and customer-relationship-management subprocessors must not receive:

- learner prompts or conversation history;
- model outputs;
- learning-memory or accommodation content;
- learner names or MentoMate profile, account, or session identifiers; or
- data derived from inference content that could identify or single out a
  learner.

Aggregate metrics supplied to an analytics subprocessor must be configured so
that they do not contain Customer Personal Data.

## 8. Government and third-party requests

If Cerebras receives a legally binding request from a public authority or third
party for Customer Personal Data, Cerebras will, unless prohibited by law:

1. notify Customer without undue delay before disclosure;
2. review the legality of the request;
3. challenge a request where there are reasonable grounds to consider it
   unlawful, overbroad, or disproportionate;
4. seek to redirect the requester to Customer;
5. disclose only the minimum data legally required; and
6. document the request, response, and data disclosed.

Cerebras will provide Customer, at least annually and on reasonable request,
available information about government requests affecting Customer Personal
Data. If Cerebras is prohibited from notifying Customer, it will use lawful
efforts to obtain a waiver of that prohibition.

## 9. International transfers

### 9.1 Transfer safeguard

Where Customer Personal Data is transferred from the EEA to Cerebras in the
United States and the transfer is not covered by an applicable adequacy
decision, the SCCs are incorporated into this DPA as follows:

- Module 2 (controller to processor) applies;
- Customer is the data exporter;
- Cerebras is the data importer;
- Clause 7 (docking clause) applies;
- in Clause 9, Option 2 applies and the notice period is 14 days;
- the optional language in Clause 11 does not apply;
- in Clause 17, Option 1 applies and the governing law is the law of Ireland;
- in Clause 18, the courts of Ireland have jurisdiction;
- Annex I of this DPA completes Annex I of the SCCs;
- Annex II of this DPA completes Annex II of the SCCs; and
- Annex III of this DPA completes Annex III of the SCCs.

The parties do not select Modules 1 or 3 for the processing described in this
DPA. If their roles change, they will execute the appropriate module before
the changed processing begins.

### 9.2 United Kingdom transfers

For a Restricted Transfer governed by United Kingdom data-protection law, the
SCCs are supplemented by the then-current mandatory UK International Data
Transfer Addendum issued by the UK Information Commissioner's Office. The
information in this DPA completes the corresponding tables of that addendum.

### 9.3 Swiss transfers

For a Restricted Transfer governed by Swiss data-protection law:

- references in the SCCs to the GDPR include the Swiss Federal Act on Data
  Protection;
- references to a Member State include Switzerland where required for the
  clauses to apply;
- the competent supervisory authority is the Swiss Federal Data Protection
  and Information Commissioner; and
- Swiss data subjects may enforce their rights in Switzerland.

### 9.4 Priority

If this DPA conflicts with the SCCs, the SCCs prevail. If the Agreement
conflicts with this DPA on the protection of Customer Personal Data, this DPA
prevails.

## 10. Liability, term, and general provisions

### 10.1 Liability

Each party's liability arising from this DPA is subject to the liability terms
of the Agreement, except to the extent Applicable Data Protection Law or the
SCCs prohibit that limitation.

### 10.2 Term

This DPA remains in force for as long as Cerebras or a subprocessor processes
Customer Personal Data.

### 10.3 Changes in law or processing

The parties will amend this DPA where reasonably necessary to comply with a
change in Applicable Data Protection Law, the Service, the processing, or the
parties' roles. Cerebras will notify Customer before a material change to:

- the use of prompts or outputs;
- model training or evaluation practices;
- retention or prompt caching;
- the serving location;
- subprocessors with access to inference content; or
- the security measures in Annex II.

### 10.4 Governing law

Except for the SCCs and mandatory provisions of Applicable Data Protection
Law, this DPA is governed by the governing-law clause in the Agreement. If the
Agreement has no governing-law clause, this DPA is governed by Norwegian law
and disputes are subject to the courts of Oslo, Norway.

### 10.5 Entire agreement on data processing

This DPA and its annexes state the parties' agreement concerning Cerebras's
processing of Customer Personal Data. A waiver or amendment must be in writing
and signed by authorised representatives of both parties.

---

# Annex I — Details of processing and transfer

## A. List of parties

### Data exporter / Customer

| Field | Details |
|---|---|
| Name | ZWIZZLY AS |
| Organisation number | 811 696 072 |
| Address | Fiskekroken 3B, 0139 Oslo, Norway |
| Privacy contact | Zuzana Kopečná |
| Contact email | support@mentomate.com |
| Activities relevant to the transfer | Operation of MentoMate, a consumer AI tutoring and learning-support service. Customer sends minimised learner requests and learning context to the Cerebras Inference API to generate tutoring and related educational outputs. |
| Role | Controller |

### Data importer / Processor

| Field | Details |
|---|---|
| Name | Cerebras Systems Inc. |
| Address | 1237 E. Arques Avenue, Sunnyvale, California 94085, United States |
| Contact | General Counsel |
| Contact email | privacy@cerebras.ai |
| Activities relevant to the transfer | Provision and security of the Cerebras Inference API and supporting infrastructure. |
| Role | Processor |

## B. Description of processing and transfer

### Categories of data subjects

- MentoMate learners aged 13 and above, including learners aged 13–17;
- adult MentoMate users;
- parents, guardians, and supporters using or assisting with MentoMate; and
- other people whom a user may mention in free text.

At launch, Customer intends to offer the service only in countries where a
13-year-old can provide the applicable digital-services consent. Customer may
later add countries when the required consent and guardian workflows are
supported. This launch limitation does not reduce the protection given to any
data processed under this DPA.

### Categories of personal data

Depending on the feature used, Customer Personal Data may include:

- a learner's current message and relevant prior learner, tutor, or
  system-message history;
- subject, topic, curriculum, homework, assessment, quiz, vocabulary, book, or
  other educational content;
- learning interests, strengths, difficulties, communication notes, recent
  learning summaries, and accommodation needs;
- language, pronoun preference, and age-calibrated communication instructions;
- an adult user's selected display name where relevant; Customer strips stored
  display names from minor prompts;
- model-generated tutoring content, classifications, summaries, evaluations,
  recaps, progress material, and topic extraction;
- identifying or third-party information that a user voluntarily includes in
  open text; and
- Customer API-account, request-timing, security, and server-egress metadata
  necessary to operate and protect the Service.

Customer's direct integration does not intentionally send MentoMate learner
IDs, profile IDs, session IDs, account email addresses, device identifiers, or
end-user IP addresses to Cerebras.

### Special-category and otherwise highly sensitive data

The service does not intentionally ask learners to provide special-category
data. Because users can enter open text and because learning context may
include accommodation or safeguarding information, incidental disclosure or
inference is foreseeable. It may include:

- health, disability, neurodiversity, or mental-health information;
- racial or ethnic origin;
- religious or philosophical beliefs;
- political opinions;
- trade-union membership;
- sex life or sexual orientation;
- genetic or biometric information if voluntarily typed by a user; and
- allegations or information concerning criminal conduct or safeguarding.

The applicable restrictions and safeguards are:

- no use for model training, profiling, advertising, or unrelated purposes;
- no persistent storage of prompts or outputs;
- organisation-isolated, volatile prompt caching for no more than one hour;
- data minimisation and stripping of stored minor display names by Customer;
- encryption in transit;
- access limited to authorised personnel with a service or security need;
- confidentiality and privacy/security training;
- function-based subprocessor restrictions;
- audit logging and incident monitoring;
- deletion and breach-notification obligations; and
- Customer's ability to suspend Cerebras routing.

### Frequency

Continuous while an authorised MentoMate user uses a feature routed to the
Cerebras Inference API.

### Nature of processing

Receipt of encrypted API traffic; transient processing of text and structured
instructions; model inference; generation and return of output; ephemeral
organisation-isolated prompt caching where enabled; security monitoring; and
deletion in accordance with section 3.3.

### Purpose

To provide AI-generated tutoring and educational support requested by
Customer, including conversational tutoring, curriculum and learning-material
generation, assessment questions, homework assistance, learner-profile
analysis, language exercises, summaries, recaps, progress material, and topic
extraction, and to secure and maintain the Service.

### Duration and retention

- Inference prompts and outputs: transient processing only; no persistent
  storage after completion of the request.
- Automatic prompt cache: volatile, organisation-isolated memory; deleted no
  later than one hour after creation.
- Operational logs: no prompts, outputs, or direct learner identifiers;
  retained no longer than 30 days except for a documented security incident or
  binding legal obligation.
- Customer account and contract records: retained only as necessary to
  administer the business relationship or comply with law and must not include
  inference prompts or outputs.
- On termination: deletion or return under section 4.

### Subprocessor processing

Infrastructure subprocessors may process encrypted traffic and, only where
technically necessary to deliver the inference service, inference content.
Analytics, communications, and CRM subprocessors may process only the limited
aggregate, business-contact, or account-administration data stated in Annex
III. They may not receive inference prompts, outputs, or learner identifiers.

## C. Competent supervisory authority

For transfers under the SCCs from ZWIZZLY AS as a Norwegian exporter, the
competent supervisory authority is:

**Datatilsynet (Norwegian Data Protection Authority)**
Postboks 458 Sentrum
0105 Oslo
Norway
[https://www.datatilsynet.no](https://www.datatilsynet.no)

---

# Annex II — Technical and organisational measures

Cerebras will maintain measures appropriate to the risks of the processing,
including at least the following:

## 1. Security governance

- a documented information-security programme with accountable ownership;
- risk assessments and policies reviewed at least annually;
- current independent SOC 2 Type 2 or equivalent assurance covering the
  Inference Cloud service; and
- remediation tracking for identified control deficiencies.

## 2. Personnel security

- confidentiality obligations for authorised personnel;
- background screening where lawful and appropriate;
- privacy and security training at onboarding and regularly thereafter; and
- prompt revocation of access when a person changes role or leaves.

## 3. Access control

- least-privilege and role-based access;
- multi-factor authentication for privileged and production access;
- unique user accounts and periodic access reviews;
- restricted, logged, and time-bounded administrative access; and
- no routine human access to inference prompts or outputs.

## 4. Encryption and key management

- encryption of Customer Personal Data in transit using current industry
  standards;
- encryption at rest for any permitted persistent account or operational data;
- secure key management, rotation, and access restriction; and
- protection of secrets and API credentials.

## 5. Isolation and minimisation

- logical isolation of Customer's organisation and prompt cache;
- volatile-only prompt caching with the maximum duration in section 3.3;
- no persistent prompt or output stores or backups;
- operational-log filtering that excludes prompts, outputs, and direct learner
  identifiers; and
- production controls preventing analytics or CRM tools from receiving
  inference content.

## 6. Secure development and vulnerability management

- documented secure-development and change-management practices;
- dependency, vulnerability, and configuration scanning;
- timely risk-based remediation of vulnerabilities;
- regular independent penetration testing; and
- protection against malware and unauthorised code.

## 7. Logging, monitoring, and detection

- security logging for access to production systems and Customer Personal Data;
- central monitoring and alerting for suspicious or unauthorised activity;
- protection of logs from unauthorised alteration;
- documented escalation paths; and
- log retention limited in accordance with section 3.3.

## 8. Incident response

- a documented and regularly tested incident-response plan;
- trained response personnel and clear escalation responsibilities;
- procedures to identify, contain, investigate, remediate, and learn from
  incidents;
- evidence preservation; and
- Customer notification in accordance with section 5.2.

## 9. Availability and resilience

- appropriate redundancy, backup, recovery, and business-continuity measures
  for the Service;
- periodic recovery testing; and
- backups designed not to contain inference prompts or outputs.

## 10. Deletion and disposal

- automated enforcement of the inference and prompt-cache retention limits;
- secure deletion of permitted stored data at the end of its retention period;
- secure disposal or sanitisation of storage media; and
- documented deletion confirmation on reasonable request.

## 11. Subprocessor security

- privacy and security due diligence before engagement;
- written obligations equivalent to this DPA;
- ongoing monitoring proportionate to risk;
- transfer safeguards where required; and
- prompt removal or remediation of a subprocessor that cannot meet its
  obligations.

---

# Annex III — Approved subprocessors

The following table reflects the Cerebras Trust Center register reviewed by
Customer on 24 July 2026. Cerebras must correct the table before signature if
any entry or access description is inaccurate.

| Subprocessor | Purpose | Processing location | Permitted inference-content access |
|---|---|---|---|
| Amazon Web Services | Cloud infrastructure supporting the front-end interface for the Cerebras inference service | United States | Only where technically necessary to host or deliver the Service |
| Cloudflare | Security, delivery, and performance of the web application and service edge | United States | Only where technically necessary to transmit, protect, or deliver the Service |
| Mixpanel | Aggregate inference-service analytics | United States | **None** — no prompts, outputs, learning context, or learner identifiers |
| SendGrid | Communications with Cerebras service users | United States | **None** — business-contact or API-account communication data only |
| HubSpot | Customer relationship management | United States | **None** — business-contact and account-administration data only |
| Salesforce | Customer relationship management | United States | **None** — business-contact and account-administration data only |

---

# Signatures

The authorised representatives of the parties agree to this DPA and its
annexes.

| For ZWIZZLY AS | For Cerebras Systems Inc. |
|---|---|
| **Signature:**  | **Signature:**  |
| **Name:**  | **Name:**  |
| **Title:**  | **Title:**  |
| **Date:**  | **Date:**  |
