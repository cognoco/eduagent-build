# App Privacy And Data Safety Worksheet

Date: 2026-05-15

Refreshed: 2026-07-23 — minimum age, privacy URL/controller identity, seven-day deletion grace, Data Categories identity-v2 schema citations, and homework-image/audio retention open questions re-verified against current source.

Status: repo-evidence draft for Apple App Privacy and Google Play Data Safety. Do not paste this into store consoles without legal/admin review.

## Submission Blockers

- [x] Minimum age (13+), Data Categories legacy-table citations (email/name/age/parent-child/consent rows), and the homework-image and raw-audio retention open questions were stale as of 2026-05-15 and are refreshed against current source below (WI-1561, 2026-07-17).
- [x] Repository configuration and notices identify `https://mentomate.com/privacy` and ZWIZZLY AS as controller.
- [ ] DPO-approved final notice publication and matching store-console privacy metadata are not confirmed.
- [ ] Store account access/status is not confirmed.
- [ ] Final third-party processor list is not confirmed against production configuration.
- [ ] Final tracking/advertising answers require legal/admin review.
- [ ] Final retention/deletion language must match the live privacy policy.

## App Facts From Repo

| Fact | Repo evidence |
| --- | --- |
| App name | `MentoMate` in `apps/mobile/app.json` and store description draft. |
| iOS bundle ID | `com.mentomate.app` in `apps/mobile/app.json`. |
| Android package | `com.mentomate.app` in `apps/mobile/app.json`. |
| Privacy URL configured | `https://mentomate.com/privacy` in `apps/mobile/app.json`; the repository HTML notice remains a pre-launch draft pending the evidence and approvals listed below. |
| Store category draft | Education in `docs/screenshots_and_store_info/store description.md`. |
| Minimum age | 13+ (the v1 launch floor) via `PROFILE_MINIMUM_AGE = 13` in `packages/schemas/src/age.ts:10` and create-profile copy (`apps/mobile/src/app/create-profile.tsx`). Under-13 access is unavailable in every country; any later under-13 phase requires a separate ruling. |
| Parental consent | Current code uses a conservative, location-blind guardian gate through age 16 in `apps/api/src/services/consent.ts`. This is implementation evidence, not the final country policy: launch also requires EEA-country habitual-residence capture and the server/store allowlist in `docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`. |
| Data export | More -> Privacy & Data -> Export my data; schema in `packages/schemas/src/account.ts`. |
| Account deletion | More -> Privacy & Data -> Delete account; typed `DELETE` confirmation and 7-day grace period. |
| Permissions | Camera, photo library, microphone, notifications; see `apps/mobile/app.json` and related hooks/screens. |
| IAP | RevenueCat native IAP integration with webhook-backed entitlements; products need store/admin readiness. |
| Diagnostics | Sentry mobile/API error telemetry; mobile has age/consent gating in `apps/mobile/src/lib/sentry.ts`. |

## Data Categories

Use this as a conservative mapping aid. "Draft disclosure posture" is not a final legal answer.

| Data category | Repo evidence | Draft disclosure posture | Open questions |
| --- | --- | --- | --- |
| Email address | `login.email` (replaces `accounts.email`); guardian/parent identity resolved via `guardianship` → `person` → `login`, replacing `consent_states.parent_email`; Clerk auth; email notifications — `packages/database/src/schema/identity.ts`. | Collected and linked to account/profile. Used for account management, consent, transactional email, and app functionality. | Final legal entity/privacy wording; whether parent and learner emails are both collected in production flows. |
| Name/display name | `person.display_name` (replaces `profiles.display_name`; `packages/database/src/schema/identity.ts`); profile creation asks for display name. | Collected and linked to profile. Used for app functionality and personalization. | Whether profile avatar/photo is enabled in production. |
| Age / birth year | `person.birth_date` (replaces `profiles.birth_year`; now a full date, not a year — `packages/database/src/schema/identity.ts`); create-profile birth date UI; consent and age gating use it. | Collected and linked to profile. Used for age gating, consent, and age-appropriate tutoring. | Console category wording differs by Apple/Google; confirm exact entry. |
| Parent/child relationship | `guardianship` (replaces `family_links`) records consent-authority family links; `supportership` (replaces the legacy `mentor` role value) records opt-in mentor/supporter access — both in `packages/database/src/schema/identity.ts`. Guardian views charge's progress. | Collected and linked. Used for family/account functionality, parental oversight, and opt-in mentor/supporter access. | Legal wording for child profiles and parent/guardian access. |
| Consent records | `consent_grant` (replaces `consent_states`) with purpose, lawful basis, granted/withdrawn status, timestamps, and assurance-token fields — `packages/database/src/schema/identity.ts`. | Collected and linked. Used for compliance and app access gating. | Retention/deletion wording. |
| Learning content | Export schema includes subjects, curricula, curriculum topics, learning sessions, events, summaries, retention cards, assessments, XP, streaks, learning modes, teaching preferences, parking lot items, needs-deepening topics, learning profiles. | Collected and linked. Used for app functionality, progress tracking, personalization, and AI tutoring. | Confirm any retention purge policy and whether all exported tables are live in production. |
| Chat messages and transcripts | Session message schemas and session routes persist learning exchanges; session transcript route exists. | Collected and linked. User content used for AI tutoring and learning history. | Final policy for transcript retention/purge. |
| Homework images/photos | Homework OCR route accepts uploaded images (`apps/api/src/routes/homework.ts`); session message schema and dictation review accept base64 homework images. No image/photo column exists anywhere in the application database schema (`packages/database/src/schema/`), so the API does not persist the image itself. However, the image IS sent to a remotely-selected third-party LLM provider for OCR/vision processing (`apps/api/src/services/ocr.ts` → `apps/api/src/services/llm/router.ts`). | Collected when user chooses camera/photo homework features. Not persisted in the application database. Processed by a third-party LLM provider whose retention behavior is governed by that processor's DPA and is **not** independently verified from this repo — do not claim categorical non-retention. | Provider-side (DPA) retention terms for OCR/vision calls; DPAs in progress. |
| Audio / voice | Microphone permission exists. `expo-speech-recognition`'s native module is invoked with only `lang`/`interimResults`/`continuous` (`apps/mobile/src/hooks/use-speech-recognition.ts:193-197`); the app's own code never receives or uploads raw audio bytes, only `result`/`error` transcript events. | Microphone access is used. Disclose transcript collection as learning content. The app does not upload raw audio, but no independent guarantee is established that speech recognition itself runs purely on-device rather than via an OS/platform-level cloud service — **not** a categorically resolved question. | Whether the native speech-recognition module processes audio on-device only, and any provider-side retention if not. |
| Photos/photo library | Photo library permission copy exists for importing homework. | Accessed when user imports homework. Collected only when user selects an image for homework/dictation review. | Confirm exact current UI paths and retention. |
| Push token and notification settings | `notification_preferences.expo_push_token`, push registration hook, notification settings screen. | Collected and linked to profile when notification permission is granted. Used for app notifications. | Confirm default notification states and opt-out wording. |
| Purchase/subscription data | RevenueCat hooks, webhook payload, subscription/quota/top-up tables. | Collected and linked. Used for purchases, entitlement, quota, and account management. | Final product list and whether Apple/Google/RevenueCat are listed as processors/sharing recipients. |
| Identifiers | Clerk user ID, account/profile IDs, RevenueCat app user ID, push token. | Collected and linked. Used for account, app functionality, purchases, notifications, and diagnostics. | Whether any device IDs are collected by SDKs beyond app code. |
| Diagnostics | Sentry, crash/error captures, breadcrumbs, performance transactions. | Collected where Sentry is enabled. Used for diagnostics and app quality. | Confirm production DSN, age gating, sample rates, and whether diagnostics are linked. |
| Product interaction / usage | Session events, usage/quota, analytics breadcrumbs in Sentry, app flow data. | Collected and linked or pseudonymized depending on implementation. Used for app functionality, analytics, and diagnostics. | Final Apple "Usage Data" and Google "App activity" answers. |
| Location | Not collected under identity-v2 — the legacy `profiles.location` column no longer exists (table dropped; the `person` table has no location/geo field — `packages/database/src/schema/identity.ts`). `person.residenceJurisdiction` is a distinct legal-jurisdiction value (for consent-regime routing), not physical location. | Not collected. | None (resolved 2026-07-17). |
| Advertising data | No ad SDK found in reviewed package files. | Likely not collected for ads, pending final SDK review. | Legal/admin must confirm. |
| Contacts/address book | No address book contact access found in reviewed facts. | Likely not collected, pending final review. | Confirm package/permission scan before final. |
| Financial payment details | Native stores and RevenueCat handle purchases; API stores subscription/product/transaction status. | Do not claim raw card/payment details are collected by MentoMate unless admin confirms. | Confirm store/RevenueCat billing data disclosures. |

## Third-Party / Processor Review

Production configuration and legal review must confirm the final list. Repo evidence points to these systems:

| Processor/system | Evidence | Likely data involved |
| --- | --- | --- |
| Clerk | Auth packages and API auth config. | Authentication identifiers, email, sessions. |
| RevenueCat | `react-native-purchases`, RevenueCat webhook route, RevenueCat memory. | App user ID, purchase/subscription/customer info. |
| Apple App Store / Google Play | Native IAP and platform subscription management links. | Store purchase/subscription data. |
| Sentry | Mobile and API Sentry packages/wrappers. | Crash/error diagnostics, breadcrumbs, possibly user/profile context depending on gate/scope. |
| LLM providers | API config includes Gemini, OpenAI, Anthropic; architecture routes LLM calls through server. | Messages, learning context, homework text/images when used for tutoring/OCR/review. |
| OCR/embedding providers | API config includes Gemini and Voyage. | Homework images/text for OCR; learning/session text for embeddings if enabled. |
| Resend/email | API config and notification services. | Transactional email metadata, consent/digest emails. |
| Expo push notifications | `expo-notifications` and Expo push token registration. | Push token and notification payloads. |
| Neon/PostgreSQL/Cloudflare Workers/KV/Inngest | Architecture/deployment docs. | App database, cached subscription status, async job payloads. |

## Apple App Privacy Mapping Aid

| Apple category area | Draft mapping from repo evidence | Final answer owner |
| --- | --- | --- |
| Contact Info | Email address for account/parent consent and transactional messages. | Legal/admin |
| User Content | Chat messages, homework text/images, dictation review images, learning transcripts/summaries. | Legal/admin |
| Identifiers | User/account/profile IDs, RevenueCat app user ID, push token, possibly SDK-generated identifiers. | Legal/admin |
| Purchases | Subscription/top-up status and purchase transaction identifiers through RevenueCat/webhooks. | Legal/admin |
| Usage Data | Session events, quota usage, product interactions, app analytics breadcrumbs. | Legal/admin |
| Diagnostics | Crash/error diagnostics and performance where Sentry is enabled. | Legal/admin |
| Sensitive Info | Birth year/child data may need conservative disclosure even if not an Apple "Sensitive Info" category. | Legal/admin |
| Location | Not collected — the legacy `profiles.location` column no longer exists under identity-v2 (see Data Categories above). | Legal/admin |
| Tracking | No ad SDK found in reviewed package files, but SDK/processors must be reviewed under Apple's tracking definition. | Legal/admin |

## Google Data Safety Mapping Aid

| Google section | Draft mapping from repo evidence | Final answer owner |
| --- | --- | --- |
| Data collected | Email, profile/display name, birth year, parent/child links, consent records, learning activity/content, images selected for homework, push token, purchase/subscription data, diagnostics. | Legal/admin |
| Data shared | Likely shared with service providers/processors for auth, payments, AI/OCR, diagnostics, email/push, hosting. Final classification depends on Google Data Safety definitions. | Legal/admin |
| Data processed ephemerally | Homework images are not persisted in the application database but ARE sent to a third-party LLM provider for OCR — provider-side retention is governed by DPAs and is not independently verified. Voice input's native module receives no raw audio in the app's own code, but whether the underlying speech-recognition runs on-device only is not independently verified. Neither should be marked ephemeral without legal/DPA confirmation (see Data Categories above). | Engineering/legal/admin |
| Data encrypted in transit | Confirm production HTTPS/TLS posture before answering. | Engineering/admin |
| Users can request deletion | In-app account deletion exists with 7-day grace period; export exists for owner profiles. | Legal/admin |
| Independent security review | No evidence reviewed in repo. | Admin |
| Ads | No ad SDK found in reviewed packages. Final answer requires admin/legal review. | Legal/admin |

## Copy-Ready Internal Notes

Use these for drafting the store forms after legal review:

- The app is an education app for learners aged 13+ (the v1 launch floor) and parents/adult learners; non-US expansion to ages 10-12 outside COPPA remains roadmap, not shipped.
- Account owners can export data and schedule account deletion from More -> Privacy & Data.
- The app collects learning data to provide tutoring, progress tracking, spaced repetition, and parent oversight.
- Camera/photo access is used only when the user chooses to capture or import homework.
- Microphone access is used for voice-based learning; the app's own code never uploads raw audio, but whether the platform speech-recognition module runs purely on-device is not independently verified — confirm before store submission.
- Mobile purchases use native IAP through RevenueCat; Stripe is dormant for future web.

## Review & Sign-off

This worksheet must be reviewed and signed off before either the Apple App Privacy or Google Play Data Safety form is submitted.

- [ ] Reviewed by: ______________________ (name/role)  Date: __________
- [ ] Legal/Compliance sign-off: ______________________  Date: __________
