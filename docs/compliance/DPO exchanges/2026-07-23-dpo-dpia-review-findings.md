Hi Zuzana,
Thank you for the update. Yes, please send me the OpenAI DPA now. There is no need to wait until the Anthropic and Cerebras documents are ready, as I can review the provider documentation on a rolling basis.
I have now cross-read the main DPIA v0.3 and the Technical DPIA Companion v0.2. The documents contain a substantial amount of useful information, but the combined review also reveals a number of material inconsistencies and evidentiary gaps. These will need to be resolved before the DPIA can be approved or relied upon for the launch of processing involving children.
The OpenAI DPA is therefore important, but the DPA alone will not be sufficient. It must be matched to the actual OpenAI service, account configuration, models and data flows used by MentoMate.
For the OpenAI review, please provide, where available:
•	the complete DPA applicable to MentoMate;
•	evidence of signature or electronic acceptance, including the applicable version and date;
•	all annexes, security schedules and incorporated contractual documents;
•	the identity and location of the contracting OpenAI entity;
•	the product or account tier being used;
•	the applicable subprocessor list;
•	the applicable international-transfer mechanism, including the relevant Standard Contractual Clauses or Data Privacy Framework information;
•	the agreed retention and deletion terms;
•	confirmation of whether prompts, outputs or other customer data can be used for model training or service improvement;
•	details of any special privacy or retention configuration enabled for MentoMate;
•	the provider’s incident-notification and data-subject-rights support arrangements.
Please obtain the equivalent documentation for Anthropic and Cerebras. In Cerebras’s case, this is particularly important because the Technical Companion describes it as a possible fallback route for minors. If that remains accurate, we will need clear evidence of its processing role, hosting arrangement, retention, training restrictions, subprocessors, deletion procedures and international-transfer safeguards before it can receive children’s data.
In addition to the provider contracts, I need the following issues addressed during the substantive review.
1.	Controller identity and establishment
The documents currently contain a fundamental inconsistency regarding the controller. One source refers to an entity established in Norway, while the later material indicates that the published privacy notice may name Cognoco s.r.o.
Please provide:
•	the full legal name and registered address of the intended controller;
•	relevant corporate registration evidence;
•	confirmation of where the principal decisions concerning the purposes and means of processing are made;
•	the identity and role of the accountable management decision-maker;
•	confirmation of the competent or lead supervisory authority;
•	confirmation that the same entity is identified consistently in the DPIA, RoPA, privacy notices, contracts and app-store materials.
This issue needs to be resolved early because it affects the controller’s accountability, the applicable establishment analysis, the competent authority, the contracts and the exercise of data-subject rights.
2.	Current production architecture and LLM routing
The two documents do not yet provide one consistent description of the production system.
The Technical Companion identifies OpenAI, Anthropic, Cerebras and Google as active routes and describes Gemini/Vertex as available for adults but excluded for minors. The later main DPIA suggests that Gemini/Vertex may be blocked for the entire application and does not identify the exact active LLM routes.
Please ask Engineering to provide one current, authoritative production inventory showing:
•	every active provider and model;
•	whether each route is primary, fallback, testing-only, configured but inactive, or fully disabled;
•	which routes can receive data relating to children;
•	the complete fallback chain;
•	the circumstances that trigger a fallback;
•	the data sent to each provider;
•	the identifiers removed before transmission;
•	the applicable provider retention configuration;
•	the geographic processing location;
•	the treatment of prompts and outputs;
•	the behaviour of the system if an approved route is unavailable;
•	evidence that prohibited routes fail closed rather than receiving the data.
The inventory should be supported by the production allowlist, relevant configuration, routing tests and, where possible, representative request traces.
3.	Scope, launch countries and current processing status
The DPIA cannot be finalised until its scope is fixed. Please confirm:
•	the countries in which MentoMate is intended to launch;
•	the expected number and age range of users;
•	the anticipated data volume;
•	whether the service will initially be consumer-only;
•	whether school or institutional use is planned;
•	whether any production processing involving children has already begun;
•	whether the earlier statement that there were no production users remains correct as of the current review date.
Any future extension to younger children, additional jurisdictions, schools, grading, placement decisions, advertising, emotion recognition or model training on user data would require the DPIA to be reviewed again before implementation.
4.	Legal bases, consent and Article 8 GDPR
The current documents list possible legal bases but do not yet map each purpose, data category and data-subject role to a specific legal basis.
A final matrix is required covering, at minimum:
•	adult account administration;
•	child tutoring conversations;
•	persistent learning memory;
•	learning assessments and progress profiling;
•	guardian and mentor access;
•	age and residence determination;
•	security and telemetry;
•	billing;
•	transactional communications;
•	optional communications and waitlist data.
Where consent is relied upon for a service offered directly to a child, the national Article 8 threshold and parental-authorisation requirements must be implemented for every launch country. The consequences of refusing or withdrawing consent must also be clearly documented and tested.
A global “13+” designation is not sufficient on its own.
5.	Special-category data
The statement that no Article 9 data are collected or inferred is not currently supportable for an open-text AI tutoring service used by children.
A learner may voluntarily disclose information concerning health, disability, religion, political views, sexual orientation or other sensitive matters. Sensitive information may also be generated or inferred by the LLM and then stored in the persistent learning memory.
Before approval, I will need evidence of:
•	instructions discouraging users from sharing sensitive information;
•	controls preventing the system from soliciting or unnecessarily inferring such information;
•	server-side detection and suppression of sensitive content;
•	exclusion of sensitive information from persistent memory;
•	appropriately short retention and deletion rules;
•	testing across all memory fields;
•	a defined safeguarding and crisis-content procedure;
•	a documented legal conclusion concerning Article 9 GDPR.
6.	Retention and deletion
The claimed 30-day retention period appears to relate primarily to the raw transcript. Derived information—including summaries, mastery records, misconceptions, quotes and embeddings—may remain for considerably longer.
Please provide:
•	the approved retention period for every main data category;
•	the inactivity or dormancy period for accounts;
•	the treatment of verbatim quotes extracted from transcripts;
•	the retention of consent and financial records;
•	the retention of telemetry and error information;
•	evidence that scheduled deletion jobs actually execute;
•	failure monitoring and alerts;
•	database sampling demonstrating deletion;
•	coverage of backups, caches, vector stores and external providers;
•	an end-to-end account-erasure test.
The existence of a purge function, cron job or configuration flag is useful evidence of design, but it does not by itself prove that the data are deleted in production.
7.	Other providers and international transfers
The contractual review will not be limited to the three LLM providers. The documents also identify Clerk, Voyage AI, RevenueCat, Resend, Sentry, Inngest, Neon/AWS, Cloudflare, Expo, APNs and FCM.
For each provider, the evidence pack should include:
•	the precise processing function;
•	the data disclosed;
•	the provider’s legal role;
•	the contracting entity;
•	the applicable DPA or other terms;
•	the subprocessor list;
•	processing locations;
•	retention and deletion conditions;
•	security documentation;
•	the applicable transfer mechanism;
•	any required transfer impact assessment.
Apple and Google should be assessed activity by activity, since they may act as independent controllers rather than processors for some app-store, payment or notification functions.
8.	Rights, access controls and guardian visibility
The claimed rights functionality also requires end-to-end testing. This should cover:
•	access to all relevant personal data, including raw and derived learning data;
•	portability;
•	correction of profile, age, residence and inferred learning information;
•	withdrawal of consent;
•	restriction and objection;
•	deletion across all internal and external systems;
•	guardian and mentor authorisation;
•	cross-profile and cross-tenant access controls;
•	privileged staff access;
•	identity verification for rights requests.
The scope of guardian visibility requires particular attention. Derived progress information may be appropriate, but unrestricted disclosure of a child’s private conversations should not be enabled by default without a documented necessity and best-interests assessment.
9.	Transparency, child consultation and AI disclosure
The final transparency package should include:
•	a complete adult privacy notice;
•	a genuinely child-readable summary;
•	an understandable explanation of persistent memory and learning profiling;
•	accurate recipient, transfer and retention information;
•	the correct controller and DPO contact details;
•	just-in-time notices where appropriate;
•	a clear point-of-interaction indication that the learner is communicating with an AI system;
•	updated and consistent app-store disclosures.
The use of the UK Children’s Code as a design reference is helpful, but it does not replace the Article 35(9) assessment. The controller should either conduct age-appropriate comprehension and usability testing with children and guardians or document why such consultation is not appropriate.
10.	Approval process
At this stage, my position remains that the DPIA is not ready for signature and that production processing involving children should not begin until the material blockers have been closed and evidenced.
Once the above information has been supplied, the next steps will be:
1.	reconcile the main DPIA and Technical Companion with the verified production facts;
2.	complete the legal-basis, Article 8 and Article 9 analyses;
3.	review the provider contracts and international transfers;
4.	verify the technical controls and test evidence;
5.	update the retention and transparency materials;
6.	reassess each residual risk;
7.	determine whether prior consultation under Article 36 GDPR is required;
8.	submit the final DPIA to accountable management for its decision;
9.	record my separate DPO opinion and recommendations.
The controller’s management—not the DPO—must make and document the final decision to proceed. My signature would record my independent advice and review, not constitute the controller’s approval.
Please send the OpenAI documentation when convenient. In parallel, it would be helpful if you could begin collecting the controller evidence and ask Engineering for the current provider/model routing inventory, as these are the most immediate factual dependencies.
I remain on track to complete the review within the agreed 14-day period. I will consolidate any remaining questions after reviewing the OpenAI documents and the additional evidence, so that the team receives one coordinated list rather than multiple fragmented requests.
Best regards,
Stephan
