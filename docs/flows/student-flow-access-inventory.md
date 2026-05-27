> **STATUS: DRAFT** - student audience access map. Created 2026-05-22.

# Student Flow Access Inventory

This document maps the existing mobile flow inventory to the **student / Study** audience.
Please walk every single flow on the list from end uers persepective using Playwrithe Chromium. Always rebase to the latest "main". After each phase you complete, check if you are still on the latest phase. If you find a blocker of the type that the flow is impossible to run (missing seed) or a blocker that blocks more than 3 flows address them directly, do not create notion bugs. Do not worry about i18n bugs, this will be a separate clean up. If a flow that is documented in the document is not accurate, missing something, is obsolete or if you find a flow that is not yet documented, amend this document directly. 

Source of truth used for this map:

- `docs/flows/mobile-app-flow-inventory.md`
- `docs/specs/2026-05-21-navigation-contract.md`
If you during the walk through the flows find a missing flow, wrong flow or incomplete flow, please update this document. 

Notes:

- This is not a new implementation plan and does not claim the Study/Family navigation contract is already shipped.
- The original flow IDs are preserved so each row can be traced back to `mobile-app-flow-inventory.md`.
- "Student" means the active user's own learning context. This includes under-18 learners, adult learners, child profiles using the app directly, and adults who also have mentor/family access but are currently studying as themselves.
- Every adult can still be a student. Mentor/Family access must not remove or weaken the adult's own Study flows.
- These flows should keep working as they do today unless a row explicitly says the entry point changes.

## Student Audience Contract

| Decision | Student behavior |
| --- | --- |
| Primary context | The active profile studies as itself. Reads and writes are scoped to that active profile. |
| Target tabs | `home`, `library`, `progress`, `more`. |
| Home surface | `LearnerScreen` / My Learning home. |
| Learning routes | Surfaced directly from Home, Library, Progress, Practice, Homework, Quiz, Dictation, and session routes. |
| Mentor/family routes | Not surfaced from the Study shell. Adults can switch to Mentor/Family when eligible, but Study remains their own learning space. |
| Parent proxy | Not a normal student flow. If a retained internal path enters proxy, it is compatibility behavior and must not redefine Study access. |
| Billing | Owner profiles can manage billing. Child/non-owner student profiles see student-safe paywall or notify-parent paths, not purchase management. |

## Auth And Access

| Original ID | Student access | How it should work |
| --- | --- | --- |
| AUTH-01 | All users | Launch and auth gates route the user to the authenticated app only after auth/profile readiness. With no profile loaded, default to a Study-safe shell. |
| AUTH-02, AUTH-03 | All users | Email sign-up and verification remain shared onboarding flows before audience-specific app access is known. |
| AUTH-04, AUTH-05 | All users | Sign-in and additional verification preserve the requested student route when it is reachable by the active profile. |
| AUTH-06, AUTH-07 | All users | Forgot-password and auth navigation stay audience-neutral. |
| AUTH-08, AUTH-09 | All users | OAuth sign-in/sign-up and callback fallback remain shared account access flows. |
| AUTH-10 | All users | Sign-out is available from permitted account surfaces and consent gates. |
| AUTH-11 | All users | Session-expired forced sign-out returns to sign-in with the re-entry banner. |
| AUTH-12 | All users | First-time vs returning copy is shared. |
| AUTH-13 | All users | Deep-link redirect preservation may restore student routes such as session, library, progress, quiz, dictation, homework, or More when reachable. Browser walk on 2026-05-26 validated a signed-out `/quiz` deep link returning to Quiz after sign-in. |
| AUTH-14 | All users | Sign-in transition spinner and stuck-state recovery are shared. |

## Profile, Account, Consent, And More

| Original ID | Student access | How it should work |
| --- | --- | --- |
| ACCOUNT-01 | All new users | First profile creation starts the student identity unless the adult selects family setup or later completes mentor/family setup. Current adult first-profile creation includes a Study/Family intent choice and must work before any active profile exists. |
| ACCOUNT-02 | Account owners | Additional profile creation remains available where allowed, but creating a child profile is a mentor setup path, not required for student use. |
| ACCOUNT-03, ACCOUNT-05 | Adult owners only | Add-child and family-plan gating are not required to study. If shown in Study, they are optional setup affordances and must never trap the user. Current browser path for an eligible adult owner is Study Home `Set up Family` -> More `Add child` -> `/create-profile?for=child`; the Add Child action must tolerate subscription data still hydrating when the navigation gate is already ready. |
| ACCOUNT-04 | All profile-capable accounts | Switching to another real profile loads that profile's own student context unless the user explicitly enters mentor/family support. |
| ACCOUNT-06 | All users, role-gated rows | More remains the student's settings hub. Account/security/privacy rows are role-gated; adult owner family rows may be visible as optional setup. |
| ACCOUNT-07 | All users | Notification and digest switches remain available through More -> Notifications when permitted. |
| ACCOUNT-08 | All users | Learning preferences and accommodation settings apply to the active student's own learning experience. |
| ACCOUNT-09 | Owner profiles | Account password/security rows are owner-only. Child/non-owner profiles do not see them. |
| ACCOUNT-10, ACCOUNT-11, ACCOUNT-12 | Owner profiles | Export/delete/scheduled deletion actions are account-owner flows only. They are hidden from child/non-owner profiles. Direct `/delete-account` entry is valid for owners and must wait for profile ownership to load before applying any redirect; scheduled deletion opens the keep-account state. |
| ACCOUNT-13, ACCOUNT-14 | All users | Privacy policy and terms are available from More -> Privacy & Data where surfaced. |
| ACCOUNT-15 | All students | Self mentor memory is the active student's own memory/preferences surface. Owner profiles must not show child/parent badge copy as if set by someone else. |
| ACCOUNT-16, ACCOUNT-17 | Not a Study surface | Child mentor memory and child memory consent prompts belong to mentor/family support surfaces. |
| ACCOUNT-18 | All students with subjects | Subject analogy preference is available on the active student's own subject screen, hidden on language subjects as today. |
| ACCOUNT-19 through ACCOUNT-24, ACCOUNT-26 | Underage/shared-account student flows where applicable | Consent request, handoff, pending, withdrawn, post-approval, and regional variants gate student access without changing the underlying learning flows. |
| ACCOUNT-25, ACCOUNT-27 | Mentor/guardian action | Parent consent management and deny confirmation are mentor-side actions that affect whether student flows can proceed. Current browser path is Family Home -> child avatar/profile -> child detail settings. Withdrawing consent now switches to the screen-level `Sharing paused` state with a request-consent-again CTA; the old in-section grace-period banner is not the active child-detail surface for withdrawn consent. |
| ACCOUNT-28, ACCOUNT-29 | All users where surfaced | App language and the current mentor-language/account-language entry remain account/profile settings, not separate Study-vs-Mentor identities. |
| ACCOUNT-30 | Compatibility only | Impersonated-child More restrictions apply only if a retained proxy path is active. Normal Study access should use the active real profile. |

## Home, Navigation, And Subject Setup

| Original ID | Student access | How it should work |
| --- | --- | --- |
| HOME-01 | All students | Student home keeps the current learner home behavior: subject carousel, add/study-new action, Ask Anything, Homework, Practice, and optional CoachBand. |
| HOME-02, HOME-03 | Not Study surfaces | Parent gateway home and parent-mode navigation move to Mentor/Family access. All users mount `LearnerScreen` at `/(app)/home`; the `ParentHomeScreen` branch activates inside `LearnerScreen` only when mode=family. Study-mode adults see the learner-home branch of `LearnerScreen`. |
| HOME-04 | All users | Animated splash and initial shell remain shared. |
| HOME-05 | All students with no subjects | Empty first-user state deep-links to subject creation and must not require mentor setup. |
| HOME-06 | All students | Resume interrupted session continues the active student's session. |
| HOME-07 | Adult owner setup only | Add-first-child is optional mentor setup, not a blocker to Study. Current Study-mode entry is the learner-home `Set up Family` CTA for eligible adult owners, which leads to More and then Add child rather than a parent-home-only branch. |
| HOME-08 | All students | Home loading timeout fallback should land on Study-safe recovery actions. |
| SUBJECT-01, SUBJECT-02 | All students | Create subject from Home or Library remains a direct Study action for the active learner. |
| SUBJECT-03 | All students | Chat subject fallback creates/returns to a subject for the active learner. |
| SUBJECT-04 | All students | Homework can create a needed subject for the active learner. |
| SUBJECT-05 | All students | Subject resolution, suggestions, and "use my words" remain student-owned. |
| SUBJECT-06, SUBJECT-07 | All students | Broad/focused subject and focused-book flows start learning for the active learner. |
| SUBJECT-08 | Language-learning students | Per-subject native-language setup remains tied to the student's language subject. |
| SUBJECT-12 | All students | View curriculum without starting a session remains available from student library/book routes. |
| SUBJECT-14 | All students | Placement/knowledge assessment records the active student's level. |
| SUBJECT-16, SUBJECT-17 | All students during onboarding where age-eligible | Conversation language is mandatory profile setup; pronouns are optional and shown/skipped by the existing age gate. The pronouns screen supports preset options plus a free-text Other path; Skip must never block progress, and standalone/direct entry without a subject returns to Study Home. |

## Learning, Library, Retention, And Progress

| Original ID | Student access | How it should work |
| --- | --- | --- |
| LEARN-01 | All students | Ask Anything opens a freeform session for the active learner. |
| LEARN-02, LEARN-03, LEARN-04 | All students | Guided sessions, first session, and core learning loop remain active-learner tutoring flows. |
| LEARN-05, LEARN-06 | All students | Coach bubble variants, voice input, and voice-speed controls remain part of live student sessions. |
| LEARN-07 | All students | Session summary belongs to the session owner. Continue-learning and transcript links preserve student ownership. |
| LEARN-08, LEARN-09, LEARN-10, LEARN-11, LEARN-25 | All students | Library, shelf, book detail, manage-subject status, and inline search are Study tab flows for the active learner. |
| LEARN-12 through LEARN-16 | All students | Topic detail, recall, remediation, relearn, and retention review remain student-owned learning and review flows. |
| LEARN-17 through LEARN-21 | All students | Progress tab, subject progress, streaks, milestones, and vocabulary browser show the active student's own progress in Study mode. |
| LEARN-22 | Language-learning students | Per-subject vocabulary list belongs to the active student's subject. |
| LEARN-23 | Session owner; mentor read access is separate | Read-only transcript is available for the active student's own completed sessions. Parent/mentor recap access should use mentor routes, not student transcript ownership. |
| LEARN-24 | All students | Saved bookmarks show the active student's saved messages and allow delete where the active role permits it. |
| LEARN-26 | All students | First-curriculum session entry creates the first materialized session for the active student's subject. |

## Practice, Quiz, And Dictation

| Original ID | Student access | How it should work |
| --- | --- | --- |
| PRACTICE-01 through PRACTICE-04 | All students | Practice hub, overdue review shortcut, recitation, and all-caught-up states remain non-tab student practice routes. |
| QUIZ-01 through QUIZ-13 | All students where quota/consent allows | Quiz picker, generation, play, results, history, detail, malformed-round guard, dispute, launch retry, and answer-check warnings remain student-owned activity flows. Errors use the existing typed quota/consent/forbidden handling. |
| DICT-01 through DICT-10 | All students where quota/consent allows | Dictation choice, OCR preview, generated dictation, playback, exit confirm, completion, photo review, remediation, perfect score, and result recording remain student-owned activity flows. |

## Homework

| Original ID | Student access | How it should work |
| --- | --- | --- |
| HOMEWORK-01 | All students | Homework starts from learner home and opens the active student's homework capture path. It is not surfaced from More. |
| HOMEWORK-02, HOMEWORK-07 | All students | Camera permission first-request and permanently-denied states remain student-safe recovery flows. |
| HOMEWORK-03 | All students | Manual fallback remains available when OCR is weak or fails. |
| HOMEWORK-04 | All students | Homework tutoring session operates as the active student's learning session. |
| HOMEWORK-05, HOMEWORK-06 | All students | Gallery import and image pass-through remain student homework/vision extensions. |

## Billing And Monetization

| Original ID | Student access | How it should work |
| --- | --- | --- |
| BILLING-01 through BILLING-05 | Owner profiles | Subscription details, upgrade, trial/usage state, restore, and manage billing are owner account flows reachable from More -> Account/Profile and the `/subscription` route after owner sign-in. Browser walk on 2026-05-26 validated the active-trial manage-billing surface on web; Restore purchases is native-only and hidden on web, while web shows Manage billing/contact support copy. |
| BILLING-06 | Child/non-owner students without entitlement | ChildPaywall appears when the student lacks entitlement. It offers notify-parent rather than direct purchase. |
| BILLING-07 | Adult/student quota path | Daily quota exceeded uses the existing paywall/recovery surface. |
| BILLING-08 | Family owners | Family pool details are account/family billing information. They may be visible to eligible owners, but they do not change Study ownership of learning data. |
| BILLING-09, BILLING-10 | Owner profiles | Top-up and BYOK waitlist remain account/billing surfaces where enabled. |
| BILLING-11, BILLING-12 | Owner profiles | Trial and static comparison cards remain subscription details under Account/Profile. |

## Additional Surfaces Without Canonical Student Flow IDs

| Route | Notes |
| --- | --- |
| `/(app)/own-learning.tsx` | V0 guardian tab bridge. Adult owners in the 5-tab `GUARDIAN_TABS` shape see this tab. It is not a student-only surface but should be noted: Study-mode adults on the guardian shape access their own learning from `own-learning` rather than the `library` tab slot. |
| `/(app)/progress/reports/` (`reports/index.tsx` + `reports/[reportId].tsx`) | Child-reports list and detail. These exist as routes under `/(app)/progress/` and are referenced in PARENT-06 as an entry point, but have no standalone student-facing flow row. |
| `/(app)/my-notes` and `/(app)/my-notes/[kind]` | Shipped Study surface without a canonical flow ID. Learner Home exposes `My Notes`; the hub links to Sessions, Notes, and Bookmarks lists, with search, date/subject grouping, pagination, and links back into session detail or topic detail where an item has a target. |
| Invalid saved active-profile fallback | Shipped resilience behavior without a canonical flow ID. If local storage points at a profile that no longer belongs to the account, `/home` falls back to the owner Study profile and rewrites `mentomate_active_profile_id`; it does not force the user into Family mode. |

## Mentor-Only Flows Excluded From Student Surface

| Original ID | Student behavior |
| --- | --- |
| PARENT-01 through PARENT-13 | Not surfaced from Study. Adults use Mentor/Family mode for child dashboards, child detail, reports, recaps, consent management, child curriculum, and child progress. Child consent management is reached from the child avatar/profile entry on Family Home, not the progress-only dashboard row. |
| ACCOUNT-16, ACCOUNT-17, ACCOUNT-25, ACCOUNT-27 | Not surfaced as student self-service. These are adult support/guardian actions. |
| HOME-02, HOME-03, HOME-07 | Not part of the Study shell, except optional setup prompts for eligible adult owners. |
| PARENT-07 | Current parent-library behavior should be split: adult self library remains LEARN-08 in Study; child curriculum belongs to Mentor/Family child routes. |

## Cross-Cutting Student Behaviors

| Original ID | Student access |
| --- | --- |
| CC-01 through CC-06 | Apply to active-student tutoring, continuation, back navigation, animation, and purchase confidence where relevant. |
| CC-07 | Student sees self accommodations; child accommodation editing belongs to mentor surfaces. |
| CC-08 | Parent-facing vocabulary belongs to mentor surfaces, not the student Study shell. |
| CC-09 through CC-18 | Apply where their routes are active, especially tab background safety, soft-fail completion side effects, i18n, feedback, stream error recovery, envelope stripping, stale-send block, HMR-safe error guards, profile-as-lens, and stable list refs. |

## Validation Focus

When the Study/Family navigation work starts, student tests should verify:

- Study tabs are exactly `home`, `library`, `progress`, `more`.
- Adults with family access can switch into Study and see their own Library, Progress, Practice, Homework, Quiz, Dictation, and sessions.
- Family/mentor child routes are not surfaced from Study.
- Child/non-owner students cannot manage billing/export/delete, but can reach student-safe paywall and consent recovery.
- All learning writes from Study are scoped to the active student profile.
