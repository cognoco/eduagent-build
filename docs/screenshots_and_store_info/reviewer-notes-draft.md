# Reviewer Notes Draft

Date: 2026-05-15

Status: draft for App Store / Google Play reviewer notes. This cannot be final until a reviewer account, sandbox testers, IAP products, and store account access are confirmed.

## Required Admin Inputs

- Reviewer test account email: NEEDS USER/ADMIN INPUT
- Reviewer test account password: NEEDS USER/ADMIN INPUT
- Reviewer profile setup: NEEDS USER/ADMIN INPUT
- Whether reviewer should use a parent account, learner account, or both: NEEDS PRODUCT INPUT
- Sandbox tester account(s): NEEDS STORE ADMIN INPUT
- Apple/Google IAP product readiness: NEEDS STORE ADMIN INPUT
- Live privacy URL and legal entity: NEEDS USER/ADMIN INPUT

Do not submit placeholder credentials.

## Draft Review Notes

MentoMate is an education app for learners aged 11+ and for parents/adult learners. The app provides AI-guided tutoring, homework help, practice, spaced repetition, progress tracking, and parent oversight.

The core learning flow is private to the signed-in account. There is no public social feed. Learners can type questions, use voice transcription, or choose camera/photo homework capture to send learning content to the tutor. The AI tutoring and OCR/review features are processed through the app's backend services.

Account deletion and data export are available in the app:

- More -> Privacy & Data -> Export my data
- More -> Privacy & Data -> Delete account

The delete-account flow uses an in-screen warning, exact `DELETE` typed confirmation, and a 7-day grace period before deletion is processed. The app also includes parental-consent flows for younger learners according to the current 11+ / consent-through-age-16 product posture.

Camera access is used for photographing homework. Photo library access is used to import homework images. Microphone access is used for voice-based learning. Push notifications are optional and are used for learning reminders/progress notifications.

Mobile purchases use native in-app purchases through RevenueCat. Stripe code exists for future web billing but is dormant for mobile store launch.

## Reviewer Test Flow Draft

Use the final reviewer account once provided:

1. Sign in with the reviewer account.
2. Confirm the profile shown after sign-in matches the intended reviewer scenario.
3. Open Home and start a simple tutoring prompt, for example a safe school topic.
4. Open Library or Progress to view learning history and retention/progress features.
5. Open More -> Privacy & Data to see export and delete-account controls.
6. Open More -> Account/Profile -> Subscription to view the subscription screen.
7. If IAP products are ready in the store sandbox, test purchase or restore using the sandbox tester account.

## IAP Readiness Notes

Repo evidence shows RevenueCat/native IAP integration and these product IDs in the API webhook mapping:

| Product ID | Type/tier in repo | Readiness |
| --- | --- | --- |
| `com.eduagent.plus.monthly` | Plus subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.plus.yearly` | Plus subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.family.monthly` | Family subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.family.yearly` | Family subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.pro.monthly` | Pro subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.pro.yearly` | Pro subscription, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.plus.monthly.android` | Plus subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.plus.yearly.android` | Plus subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.family.monthly.android` | Family subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.family.yearly.android` | Family subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.pro.monthly.android` | Pro subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.pro.yearly.android` | Pro subscription, Android | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.topup.500` | 500-credit consumable, iOS | NEEDS STORE ADMIN CONFIRMATION |
| `com.eduagent.topup.500.android` | 500-credit consumable, Android | NEEDS STORE ADMIN CONFIRMATION |

Important: `apps/mobile/src/app/(app)/subscription.tsx` currently surfaces Free and Plus in the public static comparison, while Family/Pro cards are read-only for existing Family/Pro customers. Product/admin must confirm the final public product set before store submission.

## Reviewer Account Matrix

Choose one or more scenarios before submission:

| Scenario | Purpose | Status |
| --- | --- | --- |
| Adult owner / solo learner | Fastest review path through Home, Library, Progress, Privacy & Data, Subscription. | NEEDS USER/ADMIN INPUT |
| Parent with linked child | Demonstrates parent oversight and child progress. | NEEDS USER/ADMIN INPUT |
| Learner requiring consent | Demonstrates consent gate, but can slow review if not explained. | NEEDS PRODUCT DECISION |
| Paid/sandbox subscriber | Demonstrates IAP and entitlements. | NEEDS STORE ADMIN INPUT |

## Notes To Avoid Unsupported Claims

- Do not say the privacy policy is live until the URL is verified.
- Do not say IAP products are ready until the products are available in the relevant store sandbox/console.
- Do not say the app is COPPA/GDPR compliant in reviewer notes unless legal signs off.
- Do not claim raw audio is or is not collected until production speech-recognition behavior is reviewed.
- Do not claim Family/Pro are public purchase options unless product/admin confirms store listing.

