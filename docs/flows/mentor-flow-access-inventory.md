> **STATUS: DRAFT** - mentor audience access map. Created 2026-05-22.

# Mentor Flow Access Inventory

This document maps the existing mobile flow inventory to the **mentor / Family** audience.

Source of truth used for this map:

- `docs/flows/mobile-app-flow-inventory.md`
- `docs/specs/2026-05-21-navigation-contract.md`
If you during the walk through the flows find a missing flow, wrong flow or incomplete flow, please update this document. 

Notes:

- This is not a new implementation plan and does not claim the Study/Family navigation contract is already shipped.
- Current code has the navigation contract and selected contract consumers. Full Study/Family navigation is not in place; rows below are target mentor behavior unless explicitly marked as current V0 behavior.
- Chrome walkthrough on 2026-05-25 (`d8d1ca6d2`, staging API, `parent-multi-child` seed) confirmed the current Family shell can sign in, show Children home, child detail, Reports, and Recaps, but still exposes old/extra navigation (`My Learning`, `Library`, and hidden route links with undefined params). Child subject drill-down from child detail reached the child subject URL and then made the browser automation session unresponsive.
- "Mentor" here means an adult family-support user. It does not mean the AI mentor/tutor voice or the `mentor-memory` route.
- The original flow IDs are preserved so each row can be traced back to `mobile-app-flow-inventory.md`.
- Adults can be both students and mentors. Mentor access must not replace the adult's own Study flows.
- Mentor mode should expose parent-native child review/support surfaces. Normal mentor review should not require parent proxy/view-as-child mode.

## Mentor Audience Contract

| Decision | Mentor behavior |
| --- | --- |
| Primary context | An adult owner supports child learners they are allowed to see. |
| Capability | Adult owner profile with server-sourced family links. Adults without links may see setup, not the final Family shell. |
| Target tabs | `home`, `recaps`, `progress`, `more`. The minimal Recaps path is implemented in the navigation-contract branch; if Recaps is disabled or rolled back, the tab must not be surfaced as a dead tab. (V1 target; current V0 family-mode = `home, progress, more` only — recaps tab requires `MODE_NAV_V1_ENABLED=true`) |
| Home surface | Family/Children home, replacing the old guardian hybrid home as the target experience. |
| Child data access | Parent-native child routes and APIs scoped by family-link/consent rules. |
| Learning routes | Not directly surfaced from Mentor mode. "Add to my learning" and similar bridges switch the adult into Study as themselves. |
| Child curriculum | Reachable from child cards/details, not through the adult's top-level Library tab. |
| Parent proxy | Compatibility/internal only. Normal mentor flows use child detail, Recaps, Progress, reports, and curriculum routes. |

## Auth, Account, And Setup

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| AUTH-01 through AUTH-14 | All mentors | Auth, launch, sign-in, SSO, sign-out, session expiry, redirects, and stuck-state recovery remain shared account access flows. Deep links to mentor-only routes must be checked against family access. |
| ACCOUNT-01 | New adult owners | First profile creation can capture Study/Family intent after sign-up, but an adult without child links remains Study-safe until setup is complete. |
| ACCOUNT-02 | Account owners | Additional profile creation supports creating adult/child profiles where allowed. |
| ACCOUNT-03 | Adult owners | Add-child from More or Profiles is a mentor setup flow. It must stay optional; adults can keep studying without adding a child. |
| ACCOUNT-04 | Adult owners and shared accounts | Profile switching should choose real profiles. Normal child review should route to parent-native mentor surfaces, not proxy mode. |
| ACCOUNT-05 | Adult owners | Family-plan and max-profile gates protect add-child/setup flows and point to subscription where needed. |
| ACCOUNT-06 | Adult owners, role-gated | More is the mentor settings hub too. Family rows such as add-child, family breakdown/sharing, child support links, and account controls appear only when allowed. |
| ACCOUNT-07 | Adult owners | Notifications include mentor-relevant push/digest controls where supported. |
| ACCOUNT-08 | Adult owners and child editors where allowed | Learning preferences can expose child accommodation/celebration editors only through mentor gates. |
| ACCOUNT-09 through ACCOUNT-14 | Owner profiles | Change password, export, delete, privacy policy, and terms remain owner account controls. |
| ACCOUNT-15 | Adult self only | Self mentor memory remains the adult's own student/account surface. It is not the child memory editor. |
| ACCOUNT-16 | Adult owners with child access | Child mentor memory is a mentor child-support surface. It uses child routes and child consent rules. |
| ACCOUNT-17 | Adult owners with child access | Child memory consent prompts appear on child memory/detail surfaces where needed. |
| ACCOUNT-18 | Child or adult subject owner, depending on route | Subject analogy preference for a child belongs under child detail/curriculum access, not top-level adult Study Library. |
| ACCOUNT-19 through ACCOUNT-24, ACCOUNT-26, ACCOUNT-27 | Adult owners/guardians and affected child profiles | Consent request, handoff, pending, withdrawn, post-approval, regional variants, and deny confirmation determine whether child learning data can be shown to the mentor. |
| ACCOUNT-25 | Adult owners with child access | Parent consent management for a child is a mentor flow under child detail. |
| ACCOUNT-28, ACCOUNT-29 | Adult owners | App language and the current mentor-language/account-language row remain account/profile settings. Do not create a separate "mentor identity" from these settings. |
| ACCOUNT-30 | Compatibility only | Parent-proxy More restrictions apply only if retained proxy mode is entered. Normal mentor flows should not enter proxy. |

## Mentor Home, Navigation, And Family Setup

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| HOME-01 | Bridge only | Learner home is the adult's Study surface. From Mentor mode, use an explicit switch/bridge to Study if the adult wants to learn. |
| HOME-02 | Adult owners with family access | Parent gateway home becomes the Family/Children home target. It should summarize children and route into child detail, Recaps, Progress, setup, or account actions. |
| HOME-03 | Adult owners with family access | Parent-mode navigation target is `home`, `recaps`, `progress`, `more`, not the old guardian hybrid tab set. |
| HOME-04 | All users | Animated splash and initial shell remain shared. |
| HOME-05, HOME-06 | Bridge only | Empty first-user and resume-session states are Study concerns for the adult as learner, not mentor child-review surfaces. |
| HOME-07 | Adult owners without child links | Add-first-child/family setup is a mentor setup state, not the final Family tab shell. It must offer continue-studying/skip paths. |
| HOME-08 | All app contexts | Home loading-timeout fallback must recover to a Mentor-safe root when in Mentor mode. |

## Child Setup And Curriculum

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| SUBJECT-01, SUBJECT-02 | Through child curriculum only | Creating a subject for a child should reuse the subject creation behavior but launch from child cards/details, scoped to the child, not from the adult top-level Library. |
| SUBJECT-03, SUBJECT-04 | Not a normal Mentor route | Chat/homework classifier fallbacks are active-learner flows. If a mentor wants to study the topic, bridge to adult Study. |
| SUBJECT-05 through SUBJECT-07 | Through child curriculum where supported | Subject resolution, broad/focused subject, and focused-book flows can be reused for child curriculum management if launched from a child route and scoped to that child. |
| SUBJECT-08 | Child language subject setup where supported | Per-subject language setup belongs to the child learner's subject when a mentor is managing child curriculum. |
| SUBJECT-12 | Child curriculum view | View curriculum without starting a student session should be reachable from child curriculum/detail surfaces. |
| SUBJECT-14 | Child assessment only if product allows mentor-managed assessment | Placement/knowledge assessment should not silently run as the adult. It must be clearly scoped to the child or bridge to adult Study. |
| SUBJECT-16, SUBJECT-17 | Child/profile setup where applicable | Conversation language and pronouns remain profile setup flows for the affected profile. Mentors may trigger/setup for child profiles where allowed. |

## Child Review, Recaps, Reports, And Progress

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| PARENT-01 | Adult owners with child access | Parent dashboard behavior becomes part of the Family/Children home target. Solo adults without child links should remain Study-safe plus setup CTA. (Today `/(app)/dashboard` already redirects to `/(app)/home`; actual parent surface is `ParentHomeScreen` branch inside `LearnerScreen`.) |
| PARENT-02 | Adult owners with multiple children | Multi-child dashboard supports selecting or comparing linked children. |
| PARENT-03 | Adult owners with child access | Child detail is the main mentor drill-down surface. |
| PARENT-04 | Adult owners with child access | Child subject/topic drill-down remains parent-native and must enforce family-link/consent access. |
| PARENT-05 | Adult owners with child access | Child session/transcript drill-down is a mentor review surface. Normal access should not depend on parent proxy. |
| PARENT-06 | Adult owners with child access | Child reports list and report detail remain mentor review flows. |
| PARENT-07 | Transition target | Current parent library behavior should become child curriculum access from child routes. The final Mentor shell should not expose the adult top-level Library tab. |
| PARENT-08 | Adult owners with child access | Subject raw-input audit remains a mentor review surface. |
| PARENT-09 | Adult owners with child access | Guided label tooltip remains mentor-facing support copy. |
| PARENT-10 | Adult owners with child access | Child topic Understanding and Retention cards remain mentor-facing interpretation surfaces. |
| PARENT-11 | Adult owners with child access | Child session recap is the content basis for the target Recaps experience. Narrative, highlights, conversation prompt, copy states, and engagement signal remain mentor-facing. |
| PARENT-12 | Adult owners with child access | Child subject retention badges remain mentor-facing and data-gated. |
| PARENT-13 | Adult owners with child access | Child weekly report detail remains push/deep-link capable and marks reports viewed on mount. |
| LEARN-07, LEARN-23 | Read-only source material for mentor recaps | Student session summary/transcript behavior stays owned by the student. Mentor access should use parent-native recap/session routes and family-link checks. |
| LEARN-17 through LEARN-21 | Family progress only | In Mentor mode, Progress is child/family progress only. It must exclude the adult's own progress. |
| LEARN-24 | Not a normal Mentor surface | Saved bookmarks are student-owned. Parent proxy delete restrictions are compatibility behavior, not the target mentor UX. |

## Learning, Practice, Homework, Quiz, And Dictation

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| LEARN-01 through LEARN-06 | Bridge to adult Study | Freeform chat, guided sessions, core learning, coach bubbles, and voice controls are not directly surfaced in Mentor mode. If the adult wants to learn, switch to Study as the adult. |
| LEARN-08 through LEARN-16, LEARN-22, LEARN-25, LEARN-26 | Child curriculum or adult Study, depending on entry | Library/book/topic/review/vocabulary behavior remains student-owned. Mentor mode can expose child curriculum read/manage paths, but learning sessions and writes must be clearly scoped to the child or bridge to adult Study. |
| PRACTICE-01 through PRACTICE-04 | Not directly surfaced | Practice hub and recitation/review activities are student flows. Mentor mode may link to them only by switching the adult into Study as themselves. |
| QUIZ-01 through QUIZ-13 | Not directly surfaced | Quiz is a student activity. Mentor mode may show child quiz history/recaps only through parent-native review surfaces, not by launching a child quiz as the mentor. |
| DICT-01 through DICT-10 | Not directly surfaced | Dictation is a student activity. Mentor mode may show child progress/recaps, but dictation playback/review remains active-student work. |
| HOMEWORK-01 through HOMEWORK-07 | Not directly surfaced as child impersonation | Homework capture/tutoring is a student flow. A mentor can help through review/support surfaces or switch to Study as themselves; normal mentor mode should not start child homework by proxy unless a separately designed guardian-assist flow exists. |

## Recaps Target

The Recaps tab route lives at `apps/mobile/src/app/(app)/recaps.tsx`. It is gated behind `MODE_NAV_V1_ENABLED=true` in the navigation contract; the V0 guardian bridge for the 5-tab `LEGACY_GUARDIAN_TABS` shape is `apps/mobile/src/app/(app)/own-learning.tsx`.

The original inventory did not have a first-class Recaps flow. The target Mentor/Family map derives the minimal Recaps feed from these existing flows:

| Source IDs | Target Recaps behavior |
| --- | --- |
| PARENT-11 | Recaps list item/detail reuses child session recap narrative, highlight, conversation prompt, copy states, and engagement signal. |
| PARENT-05 | Recap detail can reuse or deep-link to child session detail if the route remains parent-native and has `/(app)/recaps` as back fallback. |
| PARENT-06, PARENT-13 | Reports and weekly reports remain adjacent mentor review surfaces and can deep-link into Recaps where appropriate. |
| LEARN-07 | Student session summary remains the source event, but mentor Recaps must not write or mutate the student session. |

## Billing And Monetization

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| BILLING-01 through BILLING-05 | Adult owners | Subscription details, upgrades, trial/usage, restore, and manage billing are available from owner account surfaces. |
| BILLING-06 | Child path plus mentor notification | ChildPaywall belongs to the student side, but notify-parent creates a mentor-facing response path. |
| BILLING-07 | Adult owner quota | Daily quota paywall for the adult remains account/student billing behavior, not child progress review. |
| BILLING-08 | Family owners | Family pool details are mentor/family billing content and should be visible to eligible family owners. |
| BILLING-09 through BILLING-12 | Adult owners | Top-up, BYOK waitlist, trial, and static comparison cards remain owner subscription surfaces. |

## Mentor-Only Or Mentor-Primary Cross-Cutting Behaviors

| Original ID | Mentor access |
| --- | --- |
| CC-04 | Mentor child/detail/recap routes need explicit back fallbacks such as Family home or Recaps, not stale Study routes. |
| CC-07 | Accommodation badge and child accommodation controls are mentor-gated when editing a child. |
| CC-08 | Parent-facing metric vocabulary applies to child topic/session/report surfaces. |
| CC-09 | Opaque layout backgrounds apply to nested Family/child/Recaps stacks. |
| CC-11 | Mentor copy must use i18n keys like the rest of the app. |
| CC-12 | Feedback sheet applies to gates and More in mentor contexts. |
| CC-17 | Profile-as-lens pattern is especially important for child routes: child profile IDs must come through the navigation lens and server checks, not screen-level guesses. |
| CC-18 | Stable list refs apply to child lists, Recaps feed, reports, and family progress. |

## Student Flows Excluded From Mentor Surface

| Original ID | Mentor behavior |
| --- | --- |
| HOME-01, HOME-05, HOME-06 | Not surfaced in Mentor mode except through an explicit switch to Study. |
| LEARN-01 through LEARN-06 | Adult can access these as a student, not as a mentor acting on a child. |
| PRACTICE-01 through PRACTICE-04 | Student-only direct activity surface. |
| QUIZ-01 through QUIZ-13 | Student-only direct activity surface; mentor can review outcomes only where parent-native review exists. |
| DICT-01 through DICT-10 | Student-only direct activity surface; mentor can review outcomes only where parent-native review exists. |
| HOMEWORK-01 through HOMEWORK-07 | Student-only direct capture/tutoring surface unless a future guardian-assist flow is explicitly designed. |
| LEARN-24 | Saved bookmarks remain student-owned unless a separate parent-readable bookmark view is designed. |

## Validation Focus

When the Study/Family navigation work starts, mentor tests should verify:

- Mentor/Family tabs are exactly `home`, `recaps`, `progress`, `more` when V1 mode navigation is enabled.
- Recaps remains guarded by route/API support and is not surfaced as a dead tab if that support is disabled.
- Adults without child links see setup choices and a continue-studying option, not a dead Family shell.
- Family Progress excludes the adult's own Study progress.
- Child detail, reports, recaps, curriculum, memory, accommodation, and consent actions are available only for linked/visible children.
- Normal mentor review does not enter parent proxy mode.
- Bridges such as "Add to my learning" switch the adult into Study and write as the adult, not as the child.
