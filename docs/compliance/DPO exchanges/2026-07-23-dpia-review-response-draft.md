# Response to Stephan’s DPIA review

**Review received:** 23 July 2026<br>
**Response revised:** 24 July 2026<br>
**Purpose:** Request for independent privacy advice during DPIA completion<br>
**Advice record:** [Questions for Stephan](2026-07-24-stephan-decision-annex.md)

Hi Stephan,

Thank you for the detailed review. We accept your findings and are addressing
the technical, operational, contractual, and publication work within ZWIZZLY
AS. This note is intentionally limited to the facts and proposed positions on
which we need your independent advice.

We are not asking you to own implementation, contracts, store configuration,
publication, or the controller’s final decision.

## Roles and controller

The intended controller is:

> **ZWIZZLY AS**<br>
> Organisation number **811 696 072**<br>
> Fiskekroken 3B, 0139 Oslo, Norway

Zuzana Kopečná is the accountable management decision-maker for the DPIA on
behalf of ZWIZZLY AS.

You have agreed in principle to serve as outsourced DPO. DPIA completion is
the agreed prerequisite for the retainer and formal appointment. During this
completion review, we ask for your independent pre-appointment advice as
DPO-designate. After appointment, the final DPIA package will ask you to adopt,
reaffirm, or revise that advice as your formal DPO opinion. The final decision
to proceed remains with ZWIZZLY AS.

### Advice requested

1. Is Norway the supportable main establishment and Datatilsynet the competent
   or lead supervisory authority on the facts supplied?
2. Is the proposed separation between management’s decision and your
   independent DPO advice correct?

## Launch scope and Article 8

ZWIZZLY AS has decided that the initial launch will be:

- direct to consumers;
- limited to credentialled users aged 13 or older;
- unavailable for school or institutional deployment;
- limited to countries whose launch-day verified GDPR Article 8
  self-consent threshold is 13;
- unavailable where residence or the applicable rule is unknown, unsupported,
  stale, or legally unverified.

The current working set is Belgium, Estonia, Finland, Iceland, Latvia, Malta,
Norway, and Sweden. Portugal will be included only if a launch-day legal check
confirms the applicable threshold remains 13. Norway will be rechecked because
a proposal to increase its threshold is pending.

Later expansion will include only countries that MentoMate can lawfully and
operationally support. Higher-threshold countries will not be enabled until
the required guardian-authorisation arrangements are in place.

No public launch has occurred. No other person’s data, including any child’s
data, has been processed.

### Advice requested

1. Is this threshold-13 launch perimeter legally supportable?
2. Is habitual residence the appropriate jurisdictional basis for applying
   Article 8 in this service?
3. What source and review evidence should be retained for each enabled country?

## Legal bases and consent

Our proposed approach is:

| Purpose | Proposed basis for your review |
|---|---|
| Adult account administration and delivery of the paid/free service | Contract, separated from security and legal-record purposes |
| Tutoring conversations and submitted images where consent is required | Consent, including Article 8 where applicable |
| Persistent learning memory and learning profiling | Separate consent unless you advise that another basis is appropriate |
| Guardian/supporter access | Basis determined by the actor, authority, purpose, and information disclosed |
| Age, residence, and authority evidence | Legal obligation and/or legitimate interests, with minimised retention |
| Security and abuse prevention | Legitimate interests and, where applicable, legal obligation |
| Billing, tax, and transaction records | Contract and legal obligation, activity by activity |
| Optional communications | Consent, independently withdrawable |

Consent will be recorded before the processing for which it is required.
Refusal and withdrawal will stop the affected processing without withdrawing
unrelated parts of the service.

### Advice requested

1. Are these proposed legal bases appropriate?
2. Which purposes require separate or more granular consent?
3. Are the proposed consequences of refusal and withdrawal appropriate?

## Sensitive information and Article 9

MentoMate does not ask learners to provide sensitive information and does not
intend to use it for personalising tutoring, assessing learners, advertising,
or training models.

Because learners can write freely, they may nevertheless mention health,
disability, religion, political views, ethnicity, sexual orientation, or other
sensitive matters. The AI may also infer such information.

Our proposed treatment is to:

- discourage unnecessary disclosure in child-readable language;
- prevent the service from soliciting or unnecessarily inferring sensitive
  information;
- exclude it from persistent learning memory and profiling;
- keep incidental sensitive content only for the shortest justified period;
- address genuine crisis content through a separate safeguarding procedure.

### Advice requested

1. Is the distinction between intended use and incidental disclosure legally
   sound?
2. If incidental disclosure or inference constitutes Article 9 processing,
   which condition and safeguards are required?
3. Is the proposed minimisation, suppression, retention, and safeguarding
   approach appropriate?

## Retention

We propose a category-specific retention schedule rather than one period for
all data. The schedule will distinguish:

- raw conversations, images, and attachments;
- verbatim quotations;
- summaries, notes, assessments, mastery, and recommendations;
- embeddings and other derived data;
- identity, residence, authority, and consent evidence;
- security, incident, support, and telemetry records;
- billing, tax, and transaction records;
- dormant accounts;
- deletion evidence, backups, caches, queues, and provider copies.

ZWIZZLY AS will implement, operate, monitor, and evidence the approved
schedule.

### Advice requested

1. What retention period and starting point do you recommend for each category?
2. When should information be deleted, irreversibly abstracted, or retained as
   accountability evidence?
3. Which legal-hold or statutory exceptions should be documented?

## Providers and international transfers

The proposed launch provider set includes OpenAI, Anthropic, Cerebras, Mistral,
and Voyage AI. Gemini and Vertex are not intended launch routes.

The wider recipient review includes Clerk, RevenueCat, Apple, Google, Resend,
Sentry, Inngest, Neon, Cloudflare, Expo, APNs, and FCM to the extent that each
service actually receives personal data.

We will provide the relevant provider packs on a rolling basis, beginning with
OpenAI. Each pack will identify the service, data flow, role, contracting
entity, agreement, subprocessors, locations, retention, training restrictions,
security terms, transfer mechanism, incident support, and rights/deletion
assistance.

### Advice requested

1. Are the provider roles and contractual terms adequate for the proposed
   processing?
2. Are the transfer mechanisms and transfer impact assessments sufficient?
3. Are the retention, training, incident, and rights-support arrangements
   acceptable for the proposed child-data flows?

## Rights, guardian visibility, and safeguarding

Our proposed position is:

- users can exercise access, correction, withdrawal, restriction, objection,
  portability, and erasure rights through an appropriate in-product or manual
  process;
- identity and authority are verified before disclosing or changing data;
- guardian/supporter access is limited to justified recap and progress
  information;
- private learner conversations are not disclosed to a guardian by default;
- a learner can end a support relationship and revoke future access;
- crisis handling uses in-product de-escalation and external help resources
  rather than automatic guardian notification.

### Advice requested

1. Is this rights model appropriate for adults, 13–17-year-old learners,
   guardians, former guardians, and authorised representatives?
2. Is the proposed guardian-visibility boundary necessary, proportionate, and
   consistent with the child’s best interests?
3. Is the safeguarding position appropriate, and what additional procedure or
   escalation boundary do you recommend?

## Transparency and consultation

The final transparency package will explain, in age-appropriate language:

- the controller and DPO contact;
- that the learner is interacting with AI;
- persistent memory and learning profiling;
- guardian visibility;
- purposes, legal bases, recipients, transfers, and retention;
- consent, refusal, withdrawal, and rights;
- safeguarding and crisis-handling limits.

Our proposed Article 35(9) approach is comprehension and usability testing with
children and guardians using prototypes and synthetic content, without
starting live child-data processing.

### Advice requested

1. Does the proposed transparency content cover the required information?
2. Is the proposed consultation method adequate?
3. If direct consultation is not appropriate, what alternative evidence should
   be documented?

## Final opinion and Article 36

After receiving your advice, ZWIZZLY AS will return the final DPIA and evidence
package for your formal DPO opinion following appointment.

At that stage, we will ask:

1. whether the remaining risks are adequately reduced;
2. whether Article 36 prior consultation is required; and
3. what recommendations or conditions should accompany your DPO opinion.

Zuzana Kopečná will then make and record the controller’s final decision.

Best regards,<br>
Zuzana
