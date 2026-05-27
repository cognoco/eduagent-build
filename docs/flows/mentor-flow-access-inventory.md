> **STATUS: DRAFT** - mentor audience access map. Created 2026-05-22.
Please walk every single flow on the list from end uers persepective using Playwrithe Chromium. Always rebase to the latest "main". After each phase you complete, check if you are still on the latest phase. If you find a blocker of the type that the flow is impossible to run (missing seed) or a blocker that blocks more than 3 flows address them directly, do not create notion bugs. Do not worry about i18n bugs, this will be a separate clean up. If a flow that is documented in the document is not accurate, missing something, is obsolete or if you find a flow that is not yet documented, amend this document directly. 

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
- Seeded Chrome/Playwright rerun on 2026-05-25 (`28eab43a5f`, local API at `http://127.0.0.1:8787` with staging Doppler config, Playwright `mentor-audit-registry-smoke`) exercised the 15 reachable `mentor-audit-*` registry landings and all 15 passed. This rerun used the seeded registry as the automated browser coverage lane; it does not replace the earlier 167-row manual inventory sweep.
- Four seeded registry entries remain blocked/not covered by the default landing harness: post-approval consent redirect needs a separate API consent-page browser check, session-expired and session-revoked need deterministic auth/session invalidation that actually returns to sign-in banners, and MFA needs a standing Clerk MFA fixture because staging has authenticator-app MFA disabled.
- During the rerun, the harness was updated for current app behavior: welcome intro is skipped by seed sign-in, seeded child profile IDs are preserved as the active profile, stale first-screen routes/test IDs were aligned to the current app, and the rich-child-history seed now inserts only one retention card per profile/topic to match the production uniqueness constraint.
- The local API rerun emitted recurring `account.trial_missing_repair_attempted`, `[safe-send] non-core dispatch timed out`, and `billing.trial_missing_repair_failed` warnings for seeded accounts; the browser assertions still passed, but the noise should be kept visible for API/billing cleanup.
- Latest-main rerun on 2026-05-26 (`44e20638e6`, local web/API with staging Doppler config) re-exercised the previously blocked seeded and browser-spec lanes. Evidence: 15/19 inclusive mentor registry entries passed, 28/47 broader auth/journey/navigation specs passed, and 4/4 learner smoke/UX specs passed. Several old "blocked" rows are now runnable, especially learner, consent-gate, retention, subscription-read, and language/pronoun setup surfaces. Remaining failures are concentrated in four buckets: current Family entry starts on adult `My Learning` with a `Children` switch while older specs expect `parent-home-screen` first; the consent approval URL is an API web page, not mobile `/consent/approve`; session-expired/session-revoked storage mutation still lands on home instead of the expected sign-in banners; and Clerk authenticator-app MFA remains disabled for the seed fixture (`TOTP attach failed (405)`).
- Focused flow rerun on 2026-05-27 (`codex/student-flow-access-audit`, private local API `http://127.0.0.1:8788`, web `http://127.0.0.1:19008`, staging Doppler config, Playwright `mentor-audit-registry-smoke`) exercised the 15 default mentor-audit registry landings and all 15 passed. This run included `mentor-audit-paywall-child-notify`; the child-paywall seed now uses per-profile child quota usage, and the mobile child paywall gate treats owner-only subscription details as non-blocking when the child usage endpoint reports exceeded quota.
- Fresh reclassification on 2026-05-26 separates Done historical Notion blockers from current evidence. The old splash-overlay, family-shell undefined-link, and add-to-learning hang blockers are Done/deleted in Notion and should not remain active blocker labels unless a new latest-main regression reproduces. The child subject route wedge and recap detail click hang remain open live-repro blockers. Family-first versus `My Learning`-first entry is now a product/spec decision, while post-approval consent, session invalidation, MFA, provider, native, and store branches are harness/environment gaps until dedicated fixtures exist.
- Follow-up investigation on 2026-05-26 found why some "fixed" buckets still showed failures: they were not the same fixed bugs. The splash-overlay path now passes (`j24-subject16-conversation-language` 5/5). Parent journey failures are a new E2E/contract mismatch where setup accepts adult `My Learning` even though parent specs require `parent-home-screen` (Notion `36c8bce91f7c8196a766c9bc9ce12aad`). The inclusive mentor audit also now has separate Notion bugs for the wrong consent route (`36c8bce91f7c81b2ad33e27aab4f539a`), non-deterministic session expired/revoked fixtures (`36c8bce91f7c811a9243fdb4ab44a94b`), and the disabled Clerk TOTP seed path (`36c8bce91f7c819f96a1fdae498abaca`).
- A full row-by-row refresh of the `Fail` and `Pass w/ issues` rows on 2026-05-26 started from 52 rows in scope: 16 `Fail` and 36 `Pass w/ issues`. After removing Done/deleted historical bugs from the active failure count, 11 rows remain in those statuses: 1 `Fail` and 10 `Pass w/ issues`. The stale-audit cleanup is tracked in Notion `36c8bce91f7c810dac87c81009503508`.
- "Mentor" here means an adult family-support user. It does not mean the AI mentor/tutor voice or the `mentor-memory` route.
- The original flow IDs are preserved so each row can be traced back to `mobile-app-flow-inventory.md`.
- Adults can be both students and mentors. Mentor access must not replace the adult's own Study flows.
- Mentor mode should expose parent-native child review/support surfaces. Normal mentor review should not require parent proxy/view-as-child mode.
- Mentor-only rows that were previously listed as exclusions in the student inventory are owned here: `PARENT-*`, child memory/consent management, parent gateway/navigation/setup, child reports, and parent-facing cross-cutting vocabulary.
- Student-only direct activity rows are owned by `docs/flows/student-flow-access-inventory.md` and are not duplicated here.

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
| ACCOUNT-16 | Adult owners with child access | Child mentor memory is a mentor child-support surface. It uses child routes and child consent rules, not the student's self memory route. |
| ACCOUNT-17 | Adult owners with child access | Child memory consent prompts appear on child memory/detail surfaces where needed. They are not student self-service prompts. |
| ACCOUNT-18 | Child or adult subject owner, depending on route | Subject analogy preference for a child belongs under child detail/curriculum access, not top-level adult Study Library. |
| ACCOUNT-19 through ACCOUNT-24, ACCOUNT-26 | Adult owners/guardians and affected child profiles | Consent request, handoff, pending, withdrawn, post-approval, and regional variants determine whether child learning data can be shown to the mentor. |
| ACCOUNT-25 | Adult owners with child access | Parent consent management for a child is a mentor flow under child detail. Current browser path is Family Home -> child avatar/profile -> child detail settings. Withdrawing consent switches to the screen-level `Sharing paused` state with a request-consent-again CTA; the old in-section grace-period banner is not the active child-detail surface for withdrawn consent. |
| ACCOUNT-27 | Adult owners/guardians | Parent consent deny confirmation is a mentor/guardian action that affects whether the child can proceed, not a student self-service flow. |
| ACCOUNT-28, ACCOUNT-29 | Adult owners | App language and the current mentor-language/account-language row remain account/profile settings. Do not create a separate "mentor identity" from these settings. |
| ACCOUNT-30 | Compatibility only | Parent-proxy More restrictions apply only if retained proxy mode is entered. Normal mentor flows should not enter proxy. |

## Mentor Home, Navigation, And Family Setup

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| HOME-02 | Adult owners with family access | Parent gateway home becomes the Family/Children home target. It should summarize children and route into child detail, Recaps, Progress, setup, or account actions. Current app mounts `LearnerScreen` at `/(app)/home`; the `ParentHomeScreen` branch activates inside `LearnerScreen` only when mode=family. |
| HOME-03 | Adult owners with family access | Parent-mode navigation target is `home`, `recaps`, `progress`, `more`, not the old guardian hybrid tab set. Current V0 entry may start family-capable adults on adult Study/My Learning with a `Children` switch before the Family branch is shown. |
| HOME-04 | All users | Animated splash and initial shell remain shared. |
| HOME-07 | Adult owners without child links | Add-first-child/family setup is a mentor setup state, not the final Family tab shell. It must offer continue-studying/skip paths. Current Study-mode entry is the learner-home `Set up Family` CTA for eligible adult owners, which leads to More and then Add child rather than a parent-home-only branch. |
| HOME-08 | All app contexts | Home loading-timeout fallback must recover to a Mentor-safe root when in Mentor mode. |

## Child Setup And Curriculum

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| SUBJECT-01, SUBJECT-02 | Through child curriculum only | Creating a subject for a child should reuse the subject creation behavior but launch from child cards/details, scoped to the child, not from the adult top-level Library. |
| SUBJECT-05 through SUBJECT-07 | Through child curriculum where supported | Subject resolution, broad/focused subject, and focused-book flows can be reused for child curriculum management if launched from a child route and scoped to that child. |
| SUBJECT-08 | Child language subject setup where supported | Per-subject language setup belongs to the child learner's subject when a mentor is managing child curriculum. |
| SUBJECT-12 | Child curriculum view | View curriculum without starting a student session should be reachable from child curriculum/detail surfaces. |
| SUBJECT-14 | Child assessment only if product allows mentor-managed assessment | Placement/knowledge assessment should not silently run as the adult. It must be clearly scoped to the child or bridge to adult Study. |
| SUBJECT-16, SUBJECT-17 | Child/profile setup where applicable | Conversation language and pronouns remain profile setup flows for the affected profile. Mentors may trigger/setup for child profiles where allowed. |

## Child Review, Recaps, Reports, And Progress

These are mentor-owned flows. They are not duplicated in the student inventory as student rows.

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| PARENT-01 | Adult owners with child access | Parent dashboard behavior becomes part of the Family/Children home target. Solo adults without child links should remain Study-safe plus setup CTA. (Today `/(app)/dashboard` already redirects to `/(app)/home`; actual parent surface is `ParentHomeScreen` branch inside `LearnerScreen`.) |
| PARENT-02 | Adult owners with multiple children | Multi-child dashboard supports selecting or comparing linked children. |
| PARENT-03 | Adult owners with child access | Child detail is the main mentor drill-down surface. |
| PARENT-04 | Adult owners with child access | Child subject/topic drill-down remains parent-native and must enforce family-link/consent access. |
| PARENT-05 | Adult owners with child access | Child session/transcript drill-down is a mentor review surface. Normal access should not depend on parent proxy. |
| PARENT-06 | Adult owners with child access | Child reports list and report detail remain mentor review flows. Current routes include `/(app)/progress/reports/` and `/(app)/progress/reports/[reportId]`; these are not student-facing Study rows. |
| PARENT-07 | Transition target | Current parent library behavior should become child curriculum access from child routes. Adult self library remains LEARN-08 in Study; the final Mentor shell should not expose the adult top-level Library tab. |
| PARENT-08 | Adult owners with child access | Subject raw-input audit remains a mentor review surface. |
| PARENT-09 | Adult owners with child access | Guided label tooltip remains mentor-facing support copy. |
| PARENT-10 | Adult owners with child access | Child topic Understanding and Retention cards remain mentor-facing interpretation surfaces. |
| PARENT-11 | Adult owners with child access | Child session recap is the content basis for the target Recaps experience. Narrative, highlights, conversation prompt, copy states, and engagement signal remain mentor-facing. |
| PARENT-12 | Adult owners with child access | Child subject retention badges remain mentor-facing and data-gated. |
| PARENT-13 | Adult owners with child access | Child weekly report detail remains push/deep-link capable and marks reports viewed on mount. |
| LEARN-07, LEARN-23 | Read-only source material for mentor recaps | Student session summary/transcript behavior stays owned by the student. Mentor access should use parent-native recap/session routes and family-link checks. |
| LEARN-17 through LEARN-21 | Family progress only | In Mentor mode, Progress is child/family progress only. It must exclude the adult's own progress. |

## Child Curriculum Bridges

| Original ID | Mentor access | How it should work |
| --- | --- | --- |
| LEARN-08 through LEARN-16, LEARN-22, LEARN-25, LEARN-26 | Child curriculum or adult Study, depending on entry | Library/book/topic/review/vocabulary behavior remains student-owned. Mentor mode can expose child curriculum read/manage paths, but learning sessions and writes must be clearly scoped to the child or bridge to adult Study. |

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

## Validation Focus

When the Study/Family navigation work starts, mentor tests should verify:

- Mentor/Family tabs are exactly `home`, `recaps`, `progress`, `more` when V1 mode navigation is enabled.
- Recaps remains guarded by route/API support and is not surfaced as a dead tab if that support is disabled.
- Adults without child links see setup choices and a continue-studying option, not a dead Family shell.
- Family Progress excludes the adult's own Study progress.
- Child detail, reports, recaps, curriculum, memory, accommodation, and consent actions are available only for linked/visible children.
- Normal mentor review does not enter parent proxy mode.
- Bridges such as "Add to my learning" switch the adult into Study and write as the adult, not as the child.
