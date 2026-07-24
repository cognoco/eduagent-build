# Mistral AI and Voyage AI DPA acquisition research

**Research date / source access date:** 2026-07-24<br>
**Organization:** ZWIZZLY AS<br>
**Product context:** MentoMate / EduAgent<br>
**Status:** Internal procurement and compliance research; not legal advice and not a signed approval<br>
**Source rule:** Only vendor-owned legal pages, help centers, documentation, and trust materials were used. No form was submitted and neither vendor was contacted.

## Bottom line

Neither vendor currently requires ZWIZZLY AS to request or countersign a
separate DPA for ordinary self-serve API use:

| Vendor | How the DPA is formed | Paid-plan gate for the DPA | Organization/account ID required by the public DPA? |
|---|---|---|---|
| Mistral AI | The online DPA is incorporated by reference into the commercial agreement. It begins on the earlier of the agreement effective date or first processing. Mistral says it cannot sign the stock DPA offline. | No DPA-specific plan gate found. | No. The public DPA identifies the customer through the underlying agreement. |
| Voyage AI | The online DPA is incorporated into the Terms of Service or other service/subscription agreement and is effective with that agreement. The SCC annexes are deemed signed by entering into the agreement. | No DPA-specific plan gate found. | No. For the SCC party details, Voyage uses the customer account-owner email or the chosen legal-communications email. |

The practical task is therefore not “request a DPA.” It is to ensure that the
account and production API key belong to **ZWIZZLY AS**, retain evidence of the
online contract version and acceptance, and separately configure the
retention, training, and region controls required for MentoMate.

### Standard online DPA versus negotiated alternative

- **Mistral:** the self-serve path is the incorporated online DPA. Mistral
  expressly says it cannot sign that DPA offline. Enterprise procurement may
  use an Order Form and negotiated commercial terms, but no official source
  reviewed promises a separately countersigned version of the stock DPA.
- **Voyage:** the incorporated online DPA is the standard path. The Terms
  expressly contemplate that a separately executed DPA can exist and say it
  would supersede the online DPA. Voyage publishes no DPA-request form or
  required-field list; if procurement requires a named/countersigned copy,
  the official legal-notice route is `legal@voyageai.com` with “Legal” in the
  subject. This research did not contact Voyage.

## Recommended actions

### Mistral AI

1. Use a Mistral Organization named **ZWIZZLY AS**, administered by a person
   authorized to bind the company. Mistral's
   [organization-creation guide](https://docs.mistral.ai/admin/set-up-organization/create-organization)
   says the setup asks for an organization name and acceptance of the terms;
   the [Commercial Terms](https://legal.mistral.ai/terms/commercial-terms-of-service)
   say click acceptance, an Order Form, or business use binds the represented
   organization and that the accepter represents authority to bind it.
2. Make the billing profile and future invoices identify ZWIZZLY AS. Mistral's
   [billing documentation](https://docs.mistral.ai/admin/billing-usage/billing)
   describes organization billing management, but the public documentation
   does not enumerate every billing-profile field.
3. Archive the current
   [Mistral Data Processing Addendum](https://legal.mistral.ai/terms/data-processing-addendum)
   (effective 2026-03-12), the
   [Commercial Terms](https://legal.mistral.ai/terms/commercial-terms-of-service)
   (effective 2026-05-28), and the applicable
   [Additional Product Terms](https://legal.mistral.ai/terms/additional-terms).
   There is no separate DPA-request or signature step.
4. Create the production API key inside the intended company Workspace and
   retain its non-secret metadata. Mistral documents that
   [API keys are scoped to a Workspace, not directly to the Organization](https://help.mistral.ai/en/articles/316465-how-do-i-create-api-keys-within-a-workspace).
5. Configure production to call `https://api.eu.mistral.ai/`. Mistral's
   [regional-inference documentation](https://docs.mistral.ai/studio-api/regional-inference)
   says this guarantees inference in EU/EFTA data centers and that processed
   data does not leave the region. This does not establish that account,
   billing, support, or all operational metadata remain in-region.
6. Decide separately whether to request ZDR. It is not part of DPA execution.
   See “Mistral operational controls” below.
7. Subscribe to changes on Mistral's
   [subprocessor page](https://trust.mistral.ai/subprocessors). The DPA gives
   the customer ten days to object on data-protection grounds by writing to
   `privacy@mistral.ai`.

### Voyage AI

1. In the Voyage dashboard, verify that the selected Organization represents
   **ZWIZZLY AS**, that the account owner/legal-communications email is a
   company-controlled address, and that an authorized person is an
   Organization Admin. Voyage explains that every account starts with a
   default Organization and that billing, data controls, rate limits, and API
   keys are managed at Organization level in its
   [Organizations and Projects guide](https://docs.voyageai.com/docs/organizations-and-projects).
   Treating the default organization as ZWIZZLY AS is a recommended evidence
   practice; the public DPA does not prescribe an organization-name field.
2. Archive the [Voyage AI Terms of Service](https://www.voyageai.com/tos)
   (last updated 2026-05-27) and the
   [Voyage AI Data Processing Addendum](https://www.voyageai.com/dpa).
   The DPA page does not display a visible “last updated” or version date, so a
   dated snapshot is especially important.
3. Do not request a countersignature unless counsel requires negotiated terms.
   The public DPA and SCC annexes already become part of the agreement. If
   negotiated terms are required, the official legal-notice route is
   `legal@voyageai.com` with “Legal” in the subject; general questions may go
   to `contact@voyageai.com`, as stated in
   [Terms §18](https://www.voyageai.com/tos).
4. In `Organization > Terms of Service`, use an Organization Admin account to
   switch data use to **Opted Out**. Voyage requires a payment method on file.
   Its [official FAQ](https://docs.voyageai.com/docs/faq) says the opt-out gives
   hosted model API data zero-day retention; the Terms say content submitted
   after opt-out is immediately deleted after processing and is not used for
   future-model training. Retain a dated screenshot of the resulting state.
5. Create or rotate the production `VOYAGE_API_KEY` under the verified company
   Organization/project and retain its non-secret organization/project/key
   metadata. The current MentoMate implementation calls the legacy hosted
   endpoint `https://api.voyageai.com/v1/embeddings`
   (`apps/api/src/services/embeddings.ts`).
6. Do not treat the DPA or opt-out as evidence of EU-region processing. No
   official public source located in this review offers a region selector or
   EU-processing guarantee for `api.voyageai.com`. Escalate that unresolved
   location question to the DPO/counsel before enabling Voyage for launch,
   obtain written vendor evidence, and complete a transfer impact assessment
   for the US importer and its onward subprocessors.

## Mistral AI findings

### DPA formation and eligibility

The [Mistral DPA](https://legal.mistral.ai/terms/data-processing-addendum)
states that it forms part of the agreement, is incorporated by reference, and
commences on the earlier of the agreement effective date and the date Mistral
first processes personal data for the customer. The
[Commercial Terms §12.3](https://legal.mistral.ai/terms/commercial-terms-of-service)
say that when a commercial customer uses Mistral infrastructure and Mistral
processes personal data as processor, the online DPA applies.

Mistral's [DPA help article](https://help.mistral.ai/en/articles/347641-where-can-i-find-your-dpa-data-processing-agreement)
directs customers to the online addendum. Its
[ZDR help article](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr)
expressly says Mistral cannot sign the DPA offline.

No official source reviewed limits the stock DPA to Scale, Team, or Enterprise
customers. Its applicability depends on commercial use and Mistral processing
personal data as processor. Scale is a requirement for ZDR, not for the DPA.

### Required customer and account details

The public DPA has no signature form. It identifies “Customer” through the
underlying commercial agreement. The public setup materials require an
Organization name and terms acceptance; account data includes name and email,
and paid billing data can include billing address and invoices, as described
in Mistral's [Privacy Policy](https://legal.mistral.ai/terms/privacy-policy).

No public source reviewed requires a Norwegian organization number, VAT
number, signing title, or Mistral Organization ID to execute the DPA. The
Organization ID is useful for API administration and support identification,
but is not stated to be contractual party data. Product-role authority and
legal signing authority are distinct: an Organization Admin should perform the
acceptance, but the accepter must also be legally authorized to bind ZWIZZLY
AS.

### Contracting entity and transfers

For direct self-serve service, the commercial provider and stock-DPA processor
are:

> Mistral AI, a French limited joint-stock corporation, Paris registration
> number 952 418 325, 15 rue des Halles, 75001 Paris, France.

An Order Form can name an affiliate instead. The DPA's privacy contact is
`privacy@mistral.ai`.

Norway is in the EEA, so the DPA's restricted-country SCC Module 4 clause does
not apply to ZWIZZLY AS. Mistral and ZWIZZLY AS are both in the EEA for the
direct relationship. For onward transfers to non-EEA subprocessors, DPA §8.1
authorizes adequacy or other safeguards, including SCCs. Mistral's
[data-location help article](https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data)
says data is hosted in the EU by default, that some features may temporarily
transfer data outside the EU, and that Mistral attaches current SCCs to
contracts with non-EU providers lacking adequacy.

The EU regional API endpoint is a separate technical control. It guarantees
regional inference for supported stateless requests. Mistral documents a 10%
regional-inference price premium and says Agents, Batch, and Files APIs are
not available on regional endpoints.

### Mistral operational controls separate from the DPA

**Default API retention.** Mistral's
[Privacy Policy §5](https://legal.mistral.ai/terms/privacy-policy) says that,
except for specific APIs, API input and output are retained for generation and
then for 30 rolling days for abuse monitoring unless ZDR is active. Agents
retain input/output until account termination; fine-tuning data remains until
customer deletion or account termination.

**Zero Data Retention.** ZDR is available only on the paid Scale API plan and
only for the listed stateless endpoints, including chat/FIM completions,
embeddings, moderation/classification, OCR, speech, and transcription.
Mistral says to request it through the authenticated Help Center/support
workflow and provide sufficient legitimate reasons. Approval is discretionary.
ZDR does not cover Agents, Batch, Files, Conversations, Libraries, Vibe Work,
or Chat. Approval should appear in the Admin Console privacy settings; a
rejection is sent by email. See the
[official ZDR procedure](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr).

**Training.** Scale API customers are opted out of training by default, while
free API users can disable `Anonymous improvement data` in the Admin Console,
according to Mistral's
[training opt-out article](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training).
Training choice and ZDR are separate. The DPA also reserves controller-side
use of explicit thumbs-up/down feedback and associated input/output. Labs
models have distinct training terms. Conservative launch configuration is:
Scale, training disabled, no Labs models, and no feedback submission involving
production data.

### Material Mistral qualification

The stock DPA's Exhibit 1 says **“Special categories of personal data:
None.”** If MentoMate could send health, disability, religion, biometrics, or
other Article 9 data, that processing would not match the stock description.
The current product policy is to exclude Article 9 data; that exclusion must
be enforced and verified. Otherwise, obtain Enterprise/legal clarification or
negotiated terms before such processing.

## Voyage AI findings

### DPA formation and eligibility

[Voyage Terms §6](https://www.voyageai.com/tos) says that, to the extent Voyage
processes personal data on the customer's behalf, the
[online Voyage DPA](https://www.voyageai.com/dpa) is incorporated and controls
over conflicting Terms provisions concerning personal-data processing. A
separately executed DPA, if one exists, supersedes the online DPA.

The DPA itself says it is incorporated into the Terms or other applicable
service/subscription agreement and is effective on the agreement's effective
date. The Terms bind a user by using or accessing any part of the service.
Nothing in the official DPA or Terms reviewed restricts the online DPA to a
particular paid tier.

The DPA has no fillable or signature fields and makes no public requirement
for a company registration number, address, title, plan, or Voyage
Organization ID. For SCC Annex I party details, it uses the customer's account
owner email or the email selected for legal communications. The absence of a
public company-name field makes the Organization display name, billing
identity, account owner, and acceptance record important corroborating
evidence that the customer is ZWIZZLY AS rather than an individual.

### Contracting entity and transfers

The public Terms and DPA identify the provider/data importer as **Voyage AI
Innovations, Inc.** The Terms are governed by California law and list
`legal@voyageai.com` for legal notices. Voyage is now part of MongoDB, but the
legacy `voyageai.com` Terms and DPA still name Voyage AI Innovations, Inc.;
do not silently substitute MongoDB, Inc. as contracting party for the existing
legacy API account.

The DPA supports the customer either as controller with Voyage as processor,
or as processor with Voyage as subprocessor. It incorporates the applicable
module(s) of the EU Commission 2021/914 SCCs for transfers from the EEA to a
non-adequate country. It specifies:

- customer as data exporter;
- Voyage AI as data importer;
- customer account-owner/legal-communications email as exporter contact;
- applicable SCC annexes deemed signed on the agreement effective date;
- Irish law under SCC Clause 17 and Irish courts under Clause 18(b);
- continuous transfer for the agreement duration; and
- the DPA's Appendix B and MongoDB's
  [embedding/reranking technical and organizational measures](https://www.mongodb.com/legal/customer-service-agreement/technical-and-organizational-security-measures-embedding-services)
  as the transfer description and security controls.

For MentoMate's expected controller-to-processor relationship, SCC Module 2 is
the natural applicable module. This is a legal inference from the party roles;
the online DPA says “applicable module(s)” rather than explicitly selecting
Module 2 by number.

The DPA currently names Amazon Web Services, Inc. and Google LLC as
subprocessors and promises at least 30 days' notice before a new subprocessor.
The DPA page does not provide an independent subscription mechanism for those
updates.

MongoDB's
[Data Privacy Framework statement](https://www.mongodb.com/legal/data-privacy-framework-statement)
also says Voyage AI Innovations, Inc. is within MongoDB's EU-US Data Privacy
Framework certification. The operative Voyage DPA nevertheless expressly
configures SCCs; this review does not substitute the DPF statement for the
contractual SCC mechanism.

### Voyage operational controls separate from the DPA

By default, [Voyage Terms §3](https://www.voyageai.com/tos) grants Voyage
rights to use customer content to train and improve the service. An
Organization Admin with a payment method on file can opt out in the dashboard
under `Organization > Terms of Service`. Voyage's
[official FAQ](https://docs.voyageai.com/docs/faq) describes this as zero-day
retention for Voyage-hosted API endpoints. The Terms state that:

- opt-out applies only to content submitted after the opt-out time;
- post-opt-out customer content is immediately deleted after processing; and
- pre-opt-out content may remain subject to the earlier training license.

This opt-out is a distinct organization-level data control, not a condition
for or consequence of the DPA. Retain its activation timestamp and do not rely
on it retroactively.

No official source reviewed establishes EU-only or customer-selectable
regional processing for the legacy `api.voyageai.com` hosted endpoint. The
public DPA lists AWS and Google but not their processing regions. Accordingly,
the SCCs, a documented transfer impact assessment, and evaluation of
supplementary measures remain relevant even with zero-day retention. The
final transfer-risk acceptance belongs with the DPO/counsel, not this
research note.

**Batch/Files exception.** Voyage's
[pricing documentation](https://docs.voyageai.com/docs/pricing) says Files API
files are retained for 30 days. Voyage also publishes
[single-file deletion](https://docs.voyageai.com/reference/delete-file) and
[bulk deletion](https://docs.voyageai.com/reference/bulk-delete-files)
endpoints. Do not assume the general hosted-endpoint zero-day statement
overrides Batch/Files retention. MentoMate's current integration uses the
stateless embeddings endpoint, not Batch/Files.

Voyage/MongoDB also documents customer-VPC deployment options on
[AWS](https://docs.voyageai.com/docs/aws-marketplace-mongodb-voyage) and
[Azure](https://docs.voyageai.com/docs/azure-marketplace-mongodb-voyage),
where data stays in the customer's VPC/VNet. Those are separate deployment and
contracting paths, not settings on MentoMate's existing hosted Voyage API.

### Legacy Voyage API versus the newer MongoDB service

Current MentoMate code uses `api.voyageai.com`. MongoDB now documents a newer
Atlas Embedding and Reranking API at `ai.mongodb.com`, managed through MongoDB
Atlas, with its own
[MongoDB Cloud agreement and incorporated MongoDB DPA](https://www.mongodb.com/legal/cloud-subscription-agreement/january-2026).

If MentoMate migrates to `ai.mongodb.com`, treat that as a new procurement and
data-flow decision. Do not assume that the legacy Voyage DPA, account opt-out,
API key, data location, or contracting entity automatically carries over.

## Evidence to retain

For each vendor, preserve:

1. Dated PDF/HTML copies of the DPA, base commercial/usage terms, and applicable
   additional terms, plus a cryptographic hash and the source URL.
2. The displayed effective/last-updated dates. For Voyage's undated DPA page,
   record the capture timestamp and HTTP source URL.
3. Organization and Workspace/project screenshots showing the exact company
   name, non-secret Organization ID, account owner, admins, and billing entity.
4. Acceptance evidence: accepter name and company email, product role, basis
   of legal authority, date/time, and Order Form if any.
5. Non-secret production-key metadata: vendor Organization, Workspace/project,
   key name/identifier suffix, creator, creation/rotation date, and deployment
   secret name. Never retain the secret key in the compliance evidence.
6. Dated privacy-setting evidence:
   - Mistral training state, Labs exclusion, EU endpoint configuration, and ZDR
     request/approval plus active Admin Console indicator if pursued.
   - Voyage organization-level Opted Out state, activation time, and payment
     account association.
7. Current TOM/security and subprocessor snapshots, update-subscription
   confirmation where available, and any objection or vendor correspondence.
8. A production configuration/test artifact proving the actual request host:
   `api.eu.mistral.ai` for Mistral and the approved Voyage/MongoDB endpoint.

## Open uncertainties requiring closure

1. **Voyage hosted API region:** no official public source found in this review
   identifies the hosting/processing countries for `api.voyageai.com` or
   offers an EU regional endpoint. Obtain written evidence or have the DPO
   accept the SCC/TIA position before production use.
2. **Voyage legal identity evidence:** the public DPA uses the customer account
   owner/legal email but does not expose a DPA certificate or company-name
   field. Confirm the dashboard Organization and billing records identify
   ZWIZZLY AS; counsel may decide whether that clickwrap evidence is adequate.
3. **Voyage DPA versioning:** the public page shows no visible version date.
   Preserve a dated snapshot and monitor the Terms/DPA for changes.
4. **Voyage SCC drafting:** Appendix C contains apparent drafting errors. In
   the data-importer block it repeats “Data Exporter Role” and again says the
   exporter is deemed to have signed; it also invokes whichever SCC module is
   applicable rather than selecting Module 2 or 3 by number. Have counsel
   assess whether the online annex is adequate for the intended
   controller-to-processor flow or whether to seek a separately executed DPA.
5. **Mistral billing fields:** public documentation does not enumerate every
   field or provide an acceptance certificate. Preserve invoices and account
   screenshots.
6. **Mistral special-category mismatch:** the stock DPA says none. Keep Article
   9 data technically out of the vendor flow or obtain different terms.
7. **Online terms can change:** both vendors update online terms and related
   security/subprocessor materials. A live URL alone is not durable evidence
   of the version accepted for launch.
