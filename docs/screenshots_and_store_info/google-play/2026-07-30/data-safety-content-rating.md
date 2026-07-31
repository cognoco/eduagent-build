# Google Play Data Safety, target audience, and content-rating draft — 2026-07-30.1

**Status:** Repository-evidence draft — **HOLD for legal/admin review**. Nothing
in this file has been submitted to Google.

## Reconciliation outcome

This draft reconciles the older worksheet against the current identity schema,
processor ledger, retention schedule, privacy surfaces, and 13+ launch posture:

- identity uses full birth date and residence jurisdiction; the legacy physical
  location field no longer exists;
- current live recipients relevant to the Android candidate are Cerebras,
  Mistral, OpenAI, Anthropic, Voyage AI, Clerk, Neon, Cloudflare, Inngest,
  Sentry, Resend, RevenueCat, Google Play, Expo push, and FCM. The global
  processor ledger also records Apple App Store and APNs for iOS; those
  iOS-specific recipients are excluded from this Android form draft;
- Gemini/Vertex are policy-excluded, OpenRouter is eval-only,
  DeepInfra/DeepSeek are dormant, and Stripe is production-unconfigured;
- homework images may be sent to a routed LLM vision provider but are not stored
  in an application image column;
- app code receives voice transcripts rather than raw audio bytes, but the
  native/OS speech-recognition processing location and retention are not proven;
- account owners can export data and schedule deletion with a seven-day grace
  period, but provider copies, backups, queues, logs, and several retention
  periods remain externally or legally unresolved.

## Top-level answer draft

| Console question area | Draft posture | Gate before entry |
| --- | --- | --- |
| Does the app collect or share required user data types? | `Yes` — collection is described below | Legal/admin confirms Google definitions and sharing exemptions |
| Is all collected data encrypted in transit? | Application endpoints use HTTPS; do **not** answer until the approved build and every relevant processor path are confirmed | Engineering/admin TLS check plus processor evidence |
| Can users request deletion? | `Yes` — in-app deletion plus live web instructions at `https://mentomate.com/delete-account` | Clean-device recheck and monitored mailbox test |
| Is data processed ephemerally? | Do not claim homework images or voice audio as ephemeral on current evidence | Processor DPA/account setting and native speech evidence |
| Is data shared? | **Legal classification required.** Transfers to processors are proven; whether each qualifies for Google’s service-provider exception is not decided here | Legal/admin, using the active processor ledger |
| Independent security review | No qualifying evidence identified in this package | Admin must answer from external evidence |
| Ads | No ad SDK found in current package/code review | Final dependency/console review |

## Data-type worksheet

“Transfer recipients” names factual data flows; it is not the final Google
`shared` classification.

| Google data family / type | Collected | Required or optional | Linked to user | Purposes supported by repo evidence | Transfer recipients / unresolved point |
| --- | --- | --- | --- | --- | --- |
| Personal info — name/display name | Yes | Required for profile | Yes | App functionality, account management | Clerk/app infrastructure as applicable |
| Personal info — email address | Yes | Required for login/account owner; guardian/contact flows may also use email | Yes | Authentication, account management, developer communications, consent | Clerk, Resend, infrastructure |
| Personal info — user IDs | Yes | Required | Yes | Authentication, app functionality, purchases, security | Clerk, RevenueCat, stores, infrastructure |
| Personal info — birth date / age | Yes | Required for profile | Yes | Age gate, consent regime, age-appropriate experience | Application infrastructure; exact Google subtype must be chosen in console |
| Personal info — parent/learner relationship and consent evidence | Conditional | Required for applicable linked/guardian flows | Yes | Family functionality, legal compliance, security | Application infrastructure, email provider where notices are sent |
| Financial info — purchase history/subscription status | Conditional | Optional paid feature | Yes | Purchases, entitlement, account management, fraud prevention | Google Play, RevenueCat |
| Photos — homework image selected by user | Conditional | Optional | Associated with the active learning request/profile | App functionality | Routed vision provider; provider retention unresolved |
| Audio | **Unresolved** | Optional voice feature | Transcript is linked; raw audio handling not proven | App functionality | Native/OS speech service behavior must be established before selecting raw-audio answers |
| Messages / other user-generated content — prompts, transcripts, homework text | Yes | Core learning input | Yes | App functionality, personalisation within approved gates | Routed LLM providers, infrastructure |
| App activity — interactions, learning/session activity, progress, usage/quota | Yes | Core | Yes or pseudonymous depending record | App functionality, analytics, personalisation, account management | Infrastructure; Sentry where enabled |
| App info and performance — crash logs/diagnostics | Conditional | Collected when Sentry gate/config enables it | May be linked or pseudonymous | Analytics, app quality, security | Sentry |
| Device or other IDs — push token and SDK/service identifiers | Conditional | Optional notification/device flows | Yes or service-linked | Notifications, app functionality, account management | Expo push, APNs/FCM, RevenueCat/Clerk as applicable |
| Location | No current physical-location field or permission | — | — | — | Residence jurisdiction is a legal-routing value, not physical location |
| Contacts/address book | No evidence of collection | — | — | — | Final permission/dependency scan required |
| Advertising data | No evidence of collection for advertising | — | — | — | Final SDK/admin confirmation required |
| Raw payment card details | Not collected by MentoMate code | — | — | — | Google Play handles payment; MentoMate stores transaction/correlation records |

## Retention and deletion statement for the form review

Use only this conservative internal summary:

> Account owners can request deletion in the app or through the published web
> instructions. The request has a seven-day grace period. Application data is
> then deleted subject to limited legal, security, fraud-prevention, accounting,
> backup, and provider-retention exceptions described in the approved notice.

Do not enter a universal deletion deadline or “all data deleted” statement.
The current retention schedule still marks provider copies, Neon backup/PITR,
Inngest event payloads, Sentry retention, dormant accounts, and certain legal
record periods as proposed, unknown, or counsel-owned.

## Target audience draft

| Field | Draft |
| --- | --- |
| Target age groups | `13–15`, `16–17`, and `18+` |
| Under-13 groups | Do not select |
| Primary category | Education |
| Designed for Families / child-directed status | Do not select or declare without explicit product/legal approval |
| Storefront audience vs legal residence | Store selection is distribution scope only; it does not determine residence or consent law |

The 13+ product floor does not mean every 13-year-old may self-consent in every
country. Territory availability remains fail-closed under the separate manifest.

## Content-rating questionnaire draft

Use the exact current questionnaire wording and answer only for the approved
candidate:

| Topic | Repo-evidence posture | Operator answer rule |
| --- | --- | --- |
| Ads | No ad SDK found | Answer `No` only after final dependency and candidate review |
| In-app purchases | Native Google Play purchases are implemented through RevenueCat | Answer `Yes` when the submitted candidate exposes them |
| Person-to-person interaction | No public social feed or person-to-person chat found | Do not count private user-to-AI interaction as person-to-person unless the questionnaire explicitly instructs otherwise |
| User-generated content | Users provide private prompts, text, and homework images to an AI tutor | Read the current definition; do not answer solely from the label |
| AI-generated content | Core tutoring replies are AI-generated | Disclose wherever the current questionnaire requests it |
| Unrestricted web access | No unrestricted browser feature found | Recheck deep links and WebViews in candidate |
| Location sharing | Not implemented | Answer from candidate permissions/features |
| Camera/photo/microphone | Optional homework image and voice-transcription features exist | Disclose in permissions/Data Safety; these are not themselves mature-content ratings |
| Violence, sexual content, drugs, gambling, profanity, fear | Not product-provided content categories; safety controls reject prohibited requests, but users can type arbitrary text and model output risk is not zero | Legal/product must apply the questionnaire’s frequency/context rules to the tested candidate |
| Mental-health/emotional-support positioning | Not an approved use or marketing claim | Any such copy triggers compliance review |

## Decisions that must remain open

1. Legal/admin classification of each processor transfer as Google `shared` or
   covered by a service-provider exception.
2. Raw-audio collection/ephemeral-processing answer for the native speech path.
3. Homework-image provider retention/ephemeral answer.
4. Final diagnostic linkage, Sentry retention, and all-data-encrypted answer.
5. Final target-audience/Designed for Families posture.
6. Exact content-rating questionnaire answers and resulting certificate.
7. Confirmation that the live privacy notice and store form use identical
   processor, purpose, retention, age, and deletion language.
