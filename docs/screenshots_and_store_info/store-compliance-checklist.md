# Store Compliance Checklist

Date: 2026-05-15

Status: working checklist for SC-1 through SC-5 from `docs/audit/2026-05-15-persona-store-compliance-triage.md`. This is not a record of completed App Store Connect or Google Play Console work.

## Source Snapshot

Repo evidence reviewed for this checklist:

- `apps/mobile/app.json` - app identifiers, permissions, iOS privacy manifest, privacy URL.
- `docs/screenshots_and_store_info/store description.md` - current store description draft.
- `docs/flows/mobile-app-flow-inventory.md` - current mobile flow inventory as of 2026-05-14.
- `packages/schemas/src/account.ts` and `apps/api/src/services/export.ts` - exportable data shape.
- `apps/mobile/src/app/(app)/more/privacy.tsx` and `apps/mobile/src/app/delete-account.tsx` - Privacy & Data, export, and delete-account flows.
- `apps/api/src/services/consent.ts` - 11+ minimum and parental-consent gating.
- `apps/mobile/src/hooks/use-revenuecat.ts`, `apps/mobile/src/app/(app)/subscription.tsx`, and `apps/api/src/routes/revenuecat-webhook.ts` - mobile IAP and product ID evidence.
- `.claude/memory/project_revenuecat_setup.md`, `.claude/memory/project_apple_enrollment.md`, `.claude/memory/google_play_publishing.md`, and `.claude/memory/billing-payments.md` - historical store/admin blockers and billing decisions. Treat these as context, not current admin truth.

## Open Admin Inputs

Do not mark the store package ready until these are answered by the user or store admin:

- [ ] Live privacy policy URL and final legal entity.
- [ ] App Store Connect and Google Play Console access/status.
- [ ] Screenshot scene list, captions, target locales, and final device requirements from the current consoles.
- [ ] Age-rating questionnaire answers and final Education vs Kids category posture.
- [ ] Reviewer test account, reviewer-safe seed data, sandbox testers, and IAP product readiness.

## SC-1 Privacy Policy URL

Current repo fact:

- `apps/mobile/app.json` sets `privacyPolicyUrl` to `https://mentomate.app/privacy`.
- The mobile Privacy & Data screen opens in-app `/privacy` and `/terms` routes.
- The triage doc records that DNS lookup for `https://mentomate.app/privacy` failed on 2026-05-15.

Checklist:

- [ ] Confirm final legal entity name, physical/contact address if required, support email, privacy contact, and data controller/processor language.
- [ ] Publish the policy at `https://mentomate.app/privacy`, or choose a different live URL.
- [ ] If the URL changes, update `apps/mobile/app.json` and both store metadata entries.
- [ ] Confirm Terms of Service URL and in-app `/terms` content are live and consistent.
- [ ] Verify the URL from a clean browser/device before store submission.

Status: blocked on user/admin input. Do not claim complete from repo-only evidence.

## SC-2 App Privacy And Google Data Safety

Artifact:

- `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`

Current repo fact:

- The app stores account email, profile data, consent records, learning/session data, notification preferences, subscription/quota data, and exportable learning data.
- Camera/photo flows support homework capture and OCR. Microphone is used for voice-based learning through speech recognition; inspected code sends transcripts/messages, not raw audio files from the speech hook.
- RevenueCat handles native IAP identity/offering/customer-info flows; the API processes RevenueCat webhooks.
- Sentry is used for crash/error telemetry and analytics breadcrumbs, with age/consent gating on mobile.
- No ad SDK or ad network package was found in the package files reviewed, but final "tracking" answers need legal/admin review.

Checklist:

- [ ] Legal/admin review of the worksheet before copying any answers into Apple or Google forms.
- [ ] Confirm all third-party processors for production: Clerk, RevenueCat, Sentry, LLM/OCR providers, Resend/email, Expo push, Apple/Google stores, database/hosting.
- [ ] Confirm whether any production telemetry or third-party SDK behavior counts as tracking under Apple/Google rules.
- [ ] Confirm whether legacy optional `profiles.location` data exists in production exports and needs disclosure, even though the current create-profile flow does not collect location.
- [ ] Confirm data deletion and retention wording with the live privacy policy.

Status: draftable from repo evidence, but store-console submission is blocked on admin/legal input.

## SC-3 Screenshots

Current repo fact:

- `docs/screenshots_and_store_info/` had store description copy but no screenshot set before this pass.
- The current app flow inventory lists the modern Home, Library, Session, Homework, Progress, Parent, More, Privacy & Data, and Subscription flows.

Suggested scene pool for product selection:

| Scene | Why it may belong | Needs input |
| --- | --- | --- |
| Learner home with subject carousel / Ask Anything | Shows the first useful screen, not marketing copy. | Choose seeded subject and caption. |
| Library or subject shelf | Shows structured learning content and retention/library value. | Choose subject/book data. |
| AI tutoring session | Core product value. | Use a safe educational prompt and avoid unsupported outcome claims. |
| Homework capture / OCR flow | Explains camera/photo permission and homework use case. | Decide whether to show camera UI or post-capture review. |
| Progress overview / subject progress | Shows retention, streaks, milestones, or reports. | Choose learner progress seed and exact caption. |
| Parent child-progress view | Shows parent oversight if store positioning includes parents. | Choose parent/child seed and privacy-safe data. |
| Privacy & Data screen | Useful for review notes but usually not a marketing screenshot. | Product decision only. |

Caption guardrails:

- Avoid "COPPA/GDPR compliant" unless legal signs off.
- Avoid "learn any subject instantly", "guaranteed grades", or other outcome guarantees.
- Use "AI-guided", "practice", "review", "progress", and "parent oversight" only where the screenshot visibly supports the claim.
- Use synthetic learner names and synthetic schoolwork. Never use real child data.

Checklist:

- [ ] Confirm current Apple and Google screenshot device/size requirements in the consoles or current official docs.
- [ ] Pick final scene list and captions.
- [ ] Capture screenshots from a production-like build with reviewer-safe seeded data.
- [ ] Review each screenshot for private data, unsupported claims, stale UI, missing permissions, and text overflow.
- [ ] Store final exported images under a clear subfolder once captured.

Status: blocked on screenshot scene/caption choices and store account/device requirements.

## SC-4 Age Rating

Current repo fact:

- Product posture in memory and docs is strictly 11+.
- `apps/api/src/services/consent.ts` defines `MINIMUM_AGE = 11`.
- The current consent check rejects under-11 users and requires parental consent through age 16 using the GDPR-everywhere model.
- `apps/mobile/src/app/create-profile.tsx` tells users the minimum age is 11.
- The store description draft uses category `Education`.

Draft questionnaire guidance, pending final console wording:

| Area | Draft posture from repo evidence | Needs product/legal confirmation |
| --- | --- | --- |
| Intended audience | Learners aged 11+ and parents/adult learners. | Exact age band to enter in Apple/Google. |
| Kids category / Designed for Families | Do not mark as complete without explicit product/legal decision. The app serves teens and adults and uses AI, Sentry, Clerk, RevenueCat, and LLM providers. | Final category posture. |
| User-generated content | No public social feed found. Learners send private prompts, homework text/images, and transcripts to the AI tutor. | How the console classifies private AI chat/input. |
| Unrestricted web access | No unrestricted browser feature found in the reviewed app facts. | Confirm before answering. |
| Purchases | Yes. Native IAP subscriptions/top-ups are implemented via RevenueCat, with store products still needing admin readiness. | Exact product set and availability. |
| Ads/tracking | No ad SDK found in reviewed package files. Tracking answer still requires legal/admin review of third-party SDK use. | Final Apple tracking/Data Safety answer. |
| Mature content | Product is educational; LLM router has a safety preamble to refuse prohibited content. Learners can type arbitrary text, so answer carefully. | Exact age-rating questionnaire responses. |
| Camera/microphone | Yes. Camera/photo for homework; microphone for voice-based learning. | Confirm disclosure wording. |

Status: draft guidance only. Final age rating is blocked on store-console questionnaire answers and product/legal sign-off.

## SC-5 Reviewer Notes

Artifact:

- `docs/screenshots_and_store_info/reviewer-notes-draft.md`

Current repo fact:

- App Review should be told where account deletion and data export live: More -> Privacy & Data.
- AI tutoring, camera/photo homework capture, microphone voice mode, push notifications, parental consent, and IAP all need concise reviewer context.
- RevenueCat products and store account connections are not proven ready by repo evidence.

Checklist:

- [ ] Create or confirm reviewer test account credentials.
- [ ] Decide reviewer seed profile: adult owner, teen learner, parent with child, or multiple accounts.
- [ ] Confirm whether reviewer should test consent flow, IAP purchase, restore purchase, subscription management, homework capture, and notifications.
- [ ] Confirm sandbox tester accounts and that App Store/Play products are approved/available.
- [ ] Paste final reviewer notes into each console only after credentials and products are live.

Status: draft exists, but cannot be final until reviewer account and IAP readiness are confirmed.

