---
title: V2 Flow Coverage Map
date: 2026-06-11
profile: planning
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
source_inventory: docs/flows/mobile-app-flow-inventory.md
---

# V2 Flow Coverage Map

This is the missing bridge between the mobile flow inventory and the
Mentor-is-the-app V2 plan set. The inventory remains the source of truth for
what exists today. This file records, for every inventory row family, who
triggers it, when it is triggered, why V2 still needs it, how V2 should surface
it, and which phase owns the work.

The rule for implementation is simple: a V2 phase task that creates, moves,
retires, or replaces a surface must cite the affected flow IDs from this map.
If a flow is not cited, it is not covered.

A flow may appear in more than one matrix row when different phases own
different aspects of it (e.g. `ACCOUNT-37` rename sits in both the gate-stack
row and the avatar-admin row); the Phase Backlinks table is the union of those
assignments.

> Revised 2026-06-12 (adversarial review): denominator corrected to 280; S6
> backlink expanded to the S6 plan's full deletion scope; backlinks reconciled
> with the matrix/gaps owner assignments; Library cross-subject browse heir
> clarified per spec EU-6 (Journal, not the hub); push re-routing, route-key
> mismatch, and stale-yaml gaps carried in from the inventory.

## Coverage Denominator

Rows counted from `docs/flows/mobile-app-flow-inventory.md` on 2026-06-11:

| Family | Rows | Exact coverage set |
|---|---:|---|
| Auth | 18 | `AUTH-01..AUTH-18` |
| Account / profiles / consent | 51 | `ACCOUNT-01..ACCOUNT-46`, `ACCOUNT-48..ACCOUNT-52` |
| Home | 16 | `HOME-01..HOME-16` |
| Subject setup | 16 | `SUBJECT-01..SUBJECT-08`, `SUBJECT-12`, `SUBJECT-14`, `SUBJECT-17..SUBJECT-22` |
| Learning | 55 | `LEARN-01..LEARN-55` |
| Practice | 5 | `PRACTICE-01..PRACTICE-05` |
| Quiz | 18 | `QUIZ-01..QUIZ-18` |
| Dictation | 13 | `DICT-01..DICT-13` |
| Homework | 12 | `HOMEWORK-01..HOMEWORK-12` |
| Parent / supporter | 24 | `PARENT-01..PARENT-06`, `PARENT-08..PARENT-25` |
| Billing | 16 | `BILLING-01..BILLING-16` |
| QA / regression | 15 | `QA-01..QA-15` |
| Cross-cutting | 21 | `CC-01..CC-21` |

Total denominator: 280 inventory rows.

## Trigger Vocabulary

| Trigger | Who fires it | When it fires | Why it exists in V2 | How V2 surfaces it |
|---|---|---|---|---|
| Auth gate | Pre-auth visitor, returning signed-out user, auth-expired user | App launch, protected deep link, session expiry, SSO callback | V2 starts after a real authenticated profile exists; auth is not a shell experiment | Preserve existing pre-auth routes and `(app)` gate stack |
| Profile / consent gate | Signed-in account with no active usable profile; self-registering minor; owner managing a child | After sign-in, profile create, consent state changes | The mentor shell cannot render without a lawful active learning subject | Preserve gate stack before V2 tabs; route into existing profile and consent screens |
| Now feed card | System, from durable state | App open, refresh, post-session, due-work windows, parked/deepening windows | V2 needs deterministic "what needs me now" without LLM ranking | S0 `GET /now`; S1 Mentor home card stack; S4 supporter scopes |
| Mentor bar intent | Learner or owner studying as self | User types, speaks, taps chip, or uses camera/homework entry | Replaces scattered start points with one deliberate input spine | S1 ever-present bar; local deterministic intent matcher; camera attachment path |
| Subject hub row | Learner, supporter person-scope viewer after S4 | Browse subject, tap next-up/topic/book/chapter, deep link | Replaces library/progress split with one subject map | S2 Subject hub for Me; S4 masked hub for supporter person scopes |
| Journal / avatar | Learner/self, owner/non-owner account holder | User opens paper trail or admin settings | Rehomes More, My Notes, memory, recaps, and privacy/account actions without losing gates | S3 Journal tab plus avatar admin sheet |
| Support hub / scope chip | Adult supporter, guardian, credentialized supporter | User changes scope, opens support hub, follows cross-scope pointer | Replaces mode/proxy/tab-shape matrix with explicit relationship lens | S4 scope chip, support hub, person scope, server structural mask |
| Visibility ceremony | Supporter, supportee, guardian/managed actor | Link, consent, transparency, appeal, revocation, graduation | Trust and minors privacy are not UI hiding; they are a product contract | S5 visibility contract and shared-record surfaces |
| Push / deep link | OS notification, email link, external store link, old bookmark | Notification tap, consent email, billing portal, legacy route | V2 cannot strand existing entry points | Preserve route guards; translate relevant pushes to V2 routes as phases land; every new V2 route must be covered by auth-redirect sanitizing/replay |
| QA / regression trigger | CI, QA agent, release operator | Pre-merge, release, smoke run, regression verification | Flow coverage only matters if tests continue to express it | Update QA rows as paths move; retire placeholders deliberately |

## Inventory Coverage Matrix

| Flow IDs | Who | When | Why | V2 how | Owner phase | Gap / note |
|---|---|---|---|---|---|---|
| `AUTH-01..AUTH-18` | Pre-auth users, signed-out users, Clerk/SSO callbacks, auth-expired users | Launch, sign-in/up, SSO, reset, MFA, sign-out, deep-link replay, not-found | V2 cannot start until auth/profile gates hand it a valid signed-in state | Preserve existing auth routes and `(app)` auth guard before V2 shell mounts; signed-in launch/post-auth redirect must resolve to the V2 Mentor shell when the V2 flag is on | Preserve; S1 for post-auth landing; S3 for manual sign-out row; S6 only for dormant cleanup | `AUTH-13` must cover new protected V2 routes (`mentor`, `subjects`, `journal`, `account`, future link routes); `AUTH-15` preview/parent carrier needs S4/S5 add-child/linking alignment; `AUTH-17` session-revoked banner is server-built/mobile-dormant |
| `ACCOUNT-01..ACCOUNT-05`, `ACCOUNT-33..ACCOUNT-38` | Signed-in account, first-time user, adult owner adding child, profile-cap owner, profile switch/rename users | First profile, add child, preview/save wizard, profile-limit failure, profile modal, access-blocked, consent-gate switch escape | V2 still needs lawful profile creation and family setup before the shell can personalize | Preserve profile/create-profile flows; S3 avatar exposes profile/admin entry; S4/S5 later re-express family linking through identity model | Preserve now; S3/S4/S5 for identity-aligned successor | Post-create V2 landing, save-wizard family fork, profile-limit upgrade, rename, legacy `/profiles`, access-blocked, and consent-gate switch escape need explicit phase acceptance before S6 |
| `ACCOUNT-06..ACCOUNT-14`, `ACCOUNT-28..ACCOUNT-31`, `ACCOUNT-37`, `ACCOUNT-43..ACCOUNT-46`, `ACCOUNT-48` | Active profile; owner/non-owner gates decide rows | User opens settings, language, notifications, security, privacy, help, sign out | More tab disappears in V2, but account/admin flows do not | S3 avatar admin sheet links to existing screens and preserves owner gates | S3; S6 deletes More tab only after parity | S3 must cite every row in avatar-admin tests, including rare rows like devices, withdrawal archive, breakdown sharing |
| `ACCOUNT-15..ACCOUNT-17`, `ACCOUNT-49..ACCOUNT-52` | Learner self, owner managing child memory | Mentor memory view, consent prompt, export, correction | Memory is part of the learner's paper trail and trust model | S3 Journal exposes self memory; avatar/child settings preserve management; S5 governs supporter visibility | S3 for self/admin; S5 for trust | S3 must cover self memory consent/toggles/delete/tell, not just read-only memory. Parent-managed child memory/export/correction must be classified as deliberate admin/rights or removed; it must not leak into Me-scope Journal or supporter scope before S5 |
| `ACCOUNT-18` | Learner in a subject | Subject settings gear | Subject analogy preference belongs with the subject, not account chrome | S2 Subject hub settings affordance, preserving current server guard | S2 | Four-strands language subjects still need the current hidden/empty behavior |
| `ACCOUNT-19..ACCOUNT-27`, `ACCOUNT-32`, `ACCOUNT-38..ACCOUNT-42` | Self-registering minor, parent outside app, owner restoring consent | Consent request, handoff, pending/withdrawn gates, server-web approval/denial, reminders, email failure, withdrawal countdown | These flows are legal/safety gates and must preempt the mentor shell | Preserve gate stack before V2; S5 later aligns with identity visibility ceremony | Preserve; S5 for identity-era ceremony | S5 must map current mobile consent gates, web deny, reminder cascade, while-you-wait previews, switch escape, and restore/withdrawal flows one by one. Age floor remains 11 in code while launch decision says 13+ |
| `HOME-01`, `HOME-05..HOME-08`, `HOME-14..HOME-16` | Learner self or child learner; owner-only home overlays (`HOME-07` add-child CTA, `HOME-15` consent notices + withdrawal countdown) | App home, empty state, resume, add child CTA, loading/error/overlay/nudge states | These are the existing learner-home jobs S1 replaces or absorbs | S1 Mentor home: now cards, calm on-track state, homework/camera, bar, cold-start | S1 | S1 must preserve recovery/timeout escapes, app-wide overlays, and `HOME-16` early-adopter/nudge behavior, not just happy cards |
| `HOME-02` | Guardian/supporter | Family home open | Current parent home is the seed for the Support hub | Preserve until S4; replace with Support hub and scoped feed | S4 | Current V1 Recaps-only assumptions are not enough for all parent rows |
| `HOME-03`, `HOME-09`, `HOME-11..HOME-13` | Guardian in legacy modes, old deep links, proxy test paths | Tab rendering, ModeSwitcher, own-learning bridge, proxy shell, legacy dashboard | V2 intentionally retires the mode/proxy/tab-shape matrix, but not before parity | S4 scope chip supersedes; S6 deletes after V0 retirement ruling | S4 then S6 | `HOME-12` proxy is dormant; S6 must decide delete vs keep test seam |
| `HOME-04`, `HOME-10` | All users | Splash, app-layout gates, timeout/error fallback | Shell-independent reliability | Preserve; S1/S4 must not bypass gate order | Preserve | Existing timeout/error paths lack strong E2E coverage |
| `SUBJECT-01..SUBJECT-05`, `SUBJECT-07`, `SUBJECT-18..SUBJECT-20`, `SUBJECT-22` | Learner via home/bar/chat/homework/library | Create subject, resolve ambiguity, ready interstitial, continue rows, limit recovery, pick-book failures | V2 still needs subject creation, but entry should be through mentor input and hub | S1 bar/homework entry plus S2 hub handoffs; preserve existing creation machine | S1/S2 | Subject-limit recovery and `/ready` need explicit V2 entry/return mapping. Homework create-subject has no return-to-camera; do not claim it does |
| `SUBJECT-06`, `SUBJECT-08`, `SUBJECT-12`, `SUBJECT-14` | Learner browsing or assessing knowledge | Pick book, language subject setup, browse curriculum, assessment | These are subject-map jobs, not global navigation jobs | S2 Subject hub and assessment entry; preserve guards until hub owns them | S2 | S2 must specify the top-level `subjects` tab list as well as the per-subject hub. Assessment screens lack their own guard today; S2 should not copy that gap |
| `SUBJECT-17`, `SUBJECT-21` | No production user | Manual deep link only, server-only retry endpoint | Orphaned/dormant surfaces create false coverage | Keep dark until S6 decision | S6 | Pronouns picker and retry-curriculum need explicit wire/keep/delete decision |
| `LEARN-01..LEARN-07`, `LEARN-41..LEARN-53`, `LEARN-55` | Learner in session; system stream; session recovery | Ask anything, guided session, voice, summary, crash/offline/reconnect, parking, topic switch, challenge overlays | Session is still the core learning engine; V2 changes how users arrive, not the engine | S1/S2 push into existing session paths; S3 adds park-and-return eval gate; S6 may dissolve exit funnel | Preserve plus S1/S2/S3 | `LEARN-44` parking lot must prove return via S3 evals before session-summary deletion |
| `LEARN-08..LEARN-12`, `LEARN-16`, `LEARN-18`, `LEARN-25`, `LEARN-30..LEARN-37` | Learner browsing library/book/topic/progress artifacts | Subject/library open, book/topic rows, search, notes, delete/archive, generation lifecycle | Library/progress split is the biggest V2 consolidation target | Split by job (spec §5.4/§7/EU-6): S2 Subjects tab + hub absorb STRUCTURE browsing (subject list, books, topics, next-up, retention affordances, per-subject notes) — Subjects is the Library tab's heir for the shelf job; the cross-subject saved-items archive plus the notes/sessions slice of search (`LEARN-25`) re-home to the S3 Journal browsable archive; the next-action card's job (`LEARN-30`) moves to the S1 now feed | S2; S3 cross-subject artifact archive + search slice; S1 next-action | Proxy write-gating, archive-first server enforcement, and lifecycle coverage are known gaps; `/library` pushes must be repointed by job (structure → Subjects, saved-items → Journal), never wholesale to one tab |
| `LEARN-13`, `LEARN-14`, `LEARN-20`, `LEARN-38`, `LEARN-54` | No production user | Orphaned recall/milestones/book params/interleaved endpoint | Dormant surfaces should not be preserved by accident | S6 wire/keep/delete ledger | S6 | If any are revived, they need explicit V2 trigger rows and tests |
| `LEARN-15`, `LEARN-26`, `LEARN-51` | Learner with due/recovery/new curriculum state | Relearn, first-curriculum polling, auto-resume | These are deterministic continuation jobs | S0/S1 now card and S2 hub next-up; preserve fallback session behavior | S0/S1/S2 | First-curriculum timeout YAML remains draft |
| `LEARN-17`, `LEARN-19`, `LEARN-21..LEARN-24`, `LEARN-27..LEARN-29`, `LEARN-39`, `LEARN-40` | Learner self; proxy read-only in legacy | Progress, vocabulary, bookmarks, transcripts, My Notes, reports, archived transcript | V2 must keep the paper trail while killing tab clutter | S3 Journal/notes/recaps/memory; S2 hub for subject-local details; preserve progress until S6 | S2/S3/S6 | S3 must be browse-first, not search-only. Self reports, vocabulary browser/list, and archived transcripts need a named V2 home before Progress deletion |
| `PRACTICE-01..PRACTICE-05` | Learner choosing practice, assessment, review, recitation | Practice hub or return-to-practice | Practice is a mode/action, not a top-level V2 tab | S1 mentor bar intent plus S2 hub assessment/review entries; keep route until S6 | S1/S2; Preserve | Add route-catalog/intention coverage for Practice. Sup owner enterability without FamilyHome affordance must be decided |
| `QUIZ-01..QUIZ-18` | Learner in practice/quiz; server-driven quiz state | Picker, launch, play, results, history, malformed/error/quit paths | Quiz remains a practice activity and needs deterministic entry | S1 bar and due/discovery cards; S2 subject context where relevant; preserve quiz routes | S1/S2; Preserve | `QUIZ-16` home-discovery needs a `/now` replacement; challenge banner, Save&Finish, history/detail still need coverage |
| `DICT-01..DICT-13` | Learner practicing dictation; E2E-only gallery path | Practice dictation choice, playback, review, result | Dictation remains a practice action | S1 bar/practice intent; preserve dictation stack and route gate | S1; Preserve | Add an explicit V2 discovery trigger. Dictation has no camera-OCR path from homework; V2 must not imply one |
| `HOMEWORK-01..HOMEWORK-12` | Learner/child, sometimes owner studying self | Homework chip/camera/manual/gallery/session/voice/problem edits | Homework is one of the clearest mentor-bar intents | S1 dedicated Homework chip plus camera button; session engine remains Path 3 | S1 | S1 must cover manual entry, gallery, attach failure, truncation, and close semantics, not just camera OCR |
| `PARENT-01`, `PARENT-02`, `PARENT-24` | Guardian/supporter | Family home open, child count variants, ambient transition | This is the current support landing | S4 Support hub cold-start and household overview | S4 | Parent transition notice uses SecureStore only; do not document API ack. `PARENT-24` ambient quirks need explicit disposition |
| `PARENT-03..PARENT-06`, `PARENT-08..PARENT-10`, `PARENT-12`, `PARENT-17..PARENT-19` | Supporter/guardian with linked child | Child card, reports, subject/topic/session drill-down, progress/settings modes | V2 person scope must preserve useful structural visibility without artifact leakage | S4 person-scope Subject hub and structural mask; S5 for shared-record/trust layer | S4/S5 | S4 must read live supportee tables through server mask, not copied dashboard data. Report/detail parity is currently implied and must be mapped per flow ID |
| `PARENT-11`, `PARENT-13`, `PARENT-14`, `PARENT-20` | Guardian/supporter | Recaps, weekly report, Learn This Too, Learn Together | These are family bridge and recap flows, not generic learner flows | Preserve until S4/S5; re-home into Support hub/shared record with visibility contract | S4/S5 | V1-only Recaps cannot be the whole support story. `PARENT-14` clone-from-child / Learn This Too needs explicit preserve/replace semantics |
| `PARENT-15`, `PARENT-16`, `PARENT-21`, `PARENT-25` | Supporter sending nudge or reacting to quota signal | Nudge sheet, rate limit, child-cap warning, progress-tab nudge | Support actions must remain deliberate and rate-limited | S4 Support hub action entry; S5 trust/visibility rules; billing notification loop preserved | S4/S5 | Child-cap notify proxy guard is a known server gap; the child quota -> parent hub attention loop must be named, not just preserved |
| `PARENT-22`, `PARENT-23` | Guardian in wrong mode, zero-child dashboard data fallback | Child route in study mode, demo fallback | These are artifacts of the old mode/proxy/dashboard model | S4 supersedes; S6 delete/keep decision | S6 | Demo fallback can mask true empty state; decide before Support hub launch |
| `BILLING-01..BILLING-05`, `BILLING-07..BILLING-12`, `BILLING-16` | Owner | Subscription/account admin, purchase/restore/manage/top-up/BYOK/error | Billing is account admin, not a learning tab | S3 avatar admin links to subscription screen; preserve RevenueCat and error behavior | S3; Preserve | Web/native differences, RevenueCat purchase/restore, top-up, BYOK, family-pool removal, breakdown-sharing, and timeout/error states need V2 acceptance coverage |
| `BILLING-06`, `BILLING-13` | Child at quota, owner/child in session quota error | Child paywall, in-chat quota card | Quota blocks learning actions and must be legible at point of need | Preserve paywall/session cards; S1 sessions surface same quota branches; S4/S5 should turn child notify-parent into support-hub attention | Preserve; S1; S4/S5 | In-chat quota card has no E2E coverage; child-cap parent loop is not yet explicit in phase plans |
| `BILLING-14`, `BILLING-15` | Owner via failure branch or push | Upgrade from profile cap/clone/assessment, subscription push tap | Cross-feature upsell and notification routes must not strand users | Preserve deep links; route into avatar-admin subscription target under V2 | S3; Preserve | Push routes and the closed route catalog need a normalized `subscription/account billing` destination |
| `QA-01..QA-15` | CI, QA, release operator | Smoke, regression, nightly/surgical checks | Tests are the executable proof the flow still exists | Update test manifests as V2 entries replace old ones; retire placeholders deliberately | Each owning phase; S6 final sweep | `QA-12` placeholder and `QA-14` draft should not be counted as live coverage |
| `CC-01..CC-21` | System invariant, session engine, navigation, i18n, streaming, persistence | Across all flows | These are behavior contracts that V2 must preserve while moving surfaces | Add as phase-level non-regression assertions, not separate screens | All phases | See "Cross-cutting invariants" below |

## Phase Backlinks

| Phase | Flow coverage it must cite before build |
|---|---|
| S0 backend primitives | `CC-21`, `LEARN-15`, `LEARN-26`, `LEARN-44`, `LEARN-49..LEARN-50`, `LEARN-55`; plus `/now` source rows that become cards |
| S0-R retention gate | `LEARN-15..LEARN-16`, `SUBJECT-14`, `QUIZ-07`, `CC-10`, `CC-21` |
| S1 Mentor home | `AUTH-01`, `AUTH-13`, `AUTH-15`, `ACCOUNT-01`, `ACCOUNT-33..ACCOUNT-36`, `HOME-01`, `HOME-04..HOME-08`, `HOME-10`, `HOME-14..HOME-16`, `SUBJECT-01..SUBJECT-05`, `SUBJECT-07`, `SUBJECT-18..SUBJECT-20`, `SUBJECT-22`, `LEARN-01..LEARN-07`, `LEARN-30`, `LEARN-41..LEARN-53`, `LEARN-55`, `PRACTICE-01..PRACTICE-05`, `QUIZ-01..QUIZ-18`, `DICT-01..DICT-13`, `HOMEWORK-01..HOMEWORK-12`, `BILLING-06`, `BILLING-13`, `QA-01..QA-07`, `QA-10..QA-11`, `QA-13..QA-14`, `CC-01..CC-05`, `CC-09`, `CC-13..CC-16`, `CC-19`, `CC-21`; plus re-routing the home-targeted pushes (`recall_nudge`, `dictation_review`) |
| S2 Subject hub | `ACCOUNT-18`, `SUBJECT-06`, `SUBJECT-08`, `SUBJECT-12`, `SUBJECT-14`, `LEARN-08..LEARN-12`, `LEARN-16`, `LEARN-18`, `LEARN-22`, `LEARN-25`, `LEARN-28`, `LEARN-30..LEARN-37` |
| S2 -> S3 evidence gate | Flow-level evidence for S1/S2 entry success: feed card open, bar intent match, hub reach, topic/session start, homework start, cold-start conversion |
| S3 Journal and avatar | `AUTH-10`, `ACCOUNT-04`, `ACCOUNT-06..ACCOUNT-17`, `ACCOUNT-28..ACCOUNT-31`, `ACCOUNT-37`, `ACCOUNT-43..ACCOUNT-46`, `ACCOUNT-48..ACCOUNT-52`, `LEARN-17`, `LEARN-19`, `LEARN-21..LEARN-25` (`LEARN-25` = notes/sessions search slice only; structure search stays S2), `LEARN-27..LEARN-29`, `LEARN-39..LEARN-40`, `LEARN-44`, `BILLING-01..BILLING-05`, `BILLING-07..BILLING-12`, `BILLING-14..BILLING-16`, `CC-06..CC-08`, `CC-11..CC-12`, `CC-18` |
| S4 Scope chip and Support hub | `AUTH-15`, `ACCOUNT-01..ACCOUNT-05`, `ACCOUNT-33..ACCOUNT-36`, `HOME-02..HOME-04`, `HOME-09..HOME-13`, `PARENT-01..PARENT-06`, `PARENT-08..PARENT-10`, `PARENT-12`, `PARENT-17..PARENT-19`, `PARENT-21..PARENT-24`, `BILLING-06`, `BILLING-13`, `QA-08`, `CC-17`, `CC-19..CC-20` |
| S5 Visibility contract | `AUTH-15`, `ACCOUNT-01..ACCOUNT-05`, `ACCOUNT-15..ACCOUNT-17`, `ACCOUNT-19..ACCOUNT-27`, `ACCOUNT-32..ACCOUNT-36`, `ACCOUNT-38..ACCOUNT-42`, `ACCOUNT-49..ACCOUNT-52`, `BILLING-06`, `BILLING-13`, `PARENT-11`, `PARENT-13..PARENT-16`, `PARENT-20..PARENT-21`, `PARENT-25`, `QA-09`, `QA-12`, `QA-15` |
| S6 Cutover and deletions | By deletion subject, matching the S6 plan's task table: exit funnel `LEARN-07` (gated on `LEARN-44` park-return evidence); ModeSwitcher + mode shells `HOME-03`, `HOME-09`, `HOME-11`; proxy mode `HOME-12`, `LEARN-52`, `ACCOUNT-30`; `ParentHomeScreen` `HOME-02`, `PARENT-01..PARENT-02`, `PARENT-21`, `PARENT-24`; More tab + My Notes + Recaps + self mentor-memory `ACCOUNT-06..ACCOUNT-15`, `ACCOUNT-28..ACCOUNT-31`, `ACCOUNT-43..ACCOUNT-46`, `ACCOUNT-48`, `LEARN-27`, `PARENT-11`; Library tab `LEARN-08`, `LEARN-25`, `LEARN-30..LEARN-32`; `child/[profileId]/*` routes `PARENT-03..PARENT-06`, `PARENT-08..PARENT-10`, `PARENT-12..PARENT-13`, `PARENT-17..PARENT-19`, `ACCOUNT-16..ACCOUNT-17` (classification per S5); Progress tab `LEARN-17`, `LEARN-19`, `LEARN-21..LEARN-24`, `LEARN-28..LEARN-29`, `LEARN-39..LEARN-40`; practice-route disposition `PRACTICE-01..PRACTICE-05` (route kept as bar/feed target; XP-label removal touches `PRACTICE-01`); push re-routing for deleted targets (`PARENT-11`, `PARENT-13`); nav-contract retirement `CC-19` + XP readers `CC-03`/`CC-10`; dormant/orphaned rows `AUTH-17`, `SUBJECT-17`, `SUBJECT-21`, `LEARN-13`, `LEARN-14`, `LEARN-20`, `LEARN-38`, `LEARN-54`; old shell rows `HOME-13`, `PARENT-22`, `PARENT-23`; and, per completion rule 4, every flow file in any cited row's Coverage column whose entry path changes |

## Cross-Cutting Invariants

These rows should be treated as phase acceptance criteria whenever the phase
touches the relevant surface:

| IDs | Invariant |
|---|---|
| `CC-01`, `CC-02` | Conversation-stage chips and greeting classification stay deterministic; V2 bar must not make every greeting a session |
| `CC-03`, `CC-10` | Celebration/streak/XP behavior stays scoped: V2 shell does not introduce XP/streak, old V0/V1 readers are not removed before S6 |
| `CC-04` | `goBackOrReplace` remains the default back pattern for new V2 routes |
| `CC-05` | Continue-where-left-off priority must match `/now`/CoachBand continuation semantics |
| `CC-06` | Top-up purchase polling confidence survives avatar-admin re-home |
| `CC-07`, `CC-08` | Accommodation badges and parent metric vocabulary keep current role-sensitive meaning |
| `CC-09`, `CC-18` | Layout backgrounds and list ref stability remain non-regression checks for new routes |
| `CC-11` | All new V2 copy routes through `t()` and same i18n guards |
| `CC-12` | FeedbackProvider remains available from gates/help/admin surfaces |
| `CC-13`, `CC-14`, `CC-15`, `CC-16` | Streaming errors, envelope stripping, stale-send block, and HMR-safe error guards are session invariants |
| `CC-17`, `CC-19`, `CC-20` | Profile-as-lens, mode navigation, and parent bridge provenance are superseded only by S4/S5, not silently broken earlier |
| `CC-21` | Post-session pipeline remains the single durable close path; V2 cards and Journal moments consume it rather than forking it |

## Current Gaps To Carry Into Build

These are not blockers to writing this map, but each must be owned by the
relevant phase before code execution:

| Gap | Flow IDs | Owner |
|---|---|---|
| Proxy write-gating on shelf/book and supporter structural mask parity | `LEARN-09..LEARN-12`, `LEARN-33..LEARN-37`, `PARENT-03..PARENT-10` | S2 now, S4 final |
| Assessment screens lack their own guard | `SUBJECT-14`, `PRACTICE-05` | S2 |
| Server-side archive-first enforcement | `LEARN-11` | S2 or S6, depending on deletion timing |
| Age floor 11 vs 13+ launch decision | `ACCOUNT-01`, `ACCOUNT-19..ACCOUNT-27` | Pre-launch policy work; not shell-specific |
| Child-cap notify proxy guard | `BILLING-06`, `BILLING-13`, `PARENT-21` | S4 (support-hub attention loop); server proxy guard tracked on the pre-launch checklist |
| Subscription/account billing route-catalog destination | `BILLING-14`, `BILLING-15`, `AUTH-13` | S3/S6 |
| Practice, quiz, and dictation V2 discovery | `PRACTICE-01..PRACTICE-05`, `QUIZ-01..QUIZ-18`, `DICT-01..DICT-13` | S1/S2 |
| Save wizard and post-profile landing into V2 shell | `ACCOUNT-01`, `ACCOUNT-33..ACCOUNT-36`, `AUTH-15` | S1/S4/S5 |
| Child memory/export/correction vs artifact wall classification | `ACCOUNT-16..ACCOUNT-17`, `ACCOUNT-50..ACCOUNT-52` | S5 |
| Draft/placeholder QA rows | `QA-12`, `QA-14`, plus first-curriculum draft under `LEARN-26` | Owning phase before coverage claims |
| Dormant/orphaned surfaces need explicit disposition | `AUTH-17`, `SUBJECT-17`, `SUBJECT-21`, `LEARN-13`, `LEARN-14`, `LEARN-20`, `LEARN-38`, `LEARN-54` | S6 |
| Parent/support story cannot be reduced to Recaps | `PARENT-01..PARENT-25` | S4/S5 |
| S3 avatar must preserve obscure account rows, not just billing/sign-out | `ACCOUNT-28..ACCOUNT-31`, `ACCOUNT-43..ACCOUNT-46`, `ACCOUNT-48` | S3 |
| Home-targeted pushes land on surfaces V2 replaces: `recall_nudge` + `dictation_review` route to `/home` (S1 replaces it); recaps/weekly-report pushes target screens S6 deletes | `LEARN-13` (push note), `DICT-01..DICT-13` (preamble), `PARENT-11`, `PARENT-13`, `BILLING-15` | S1 for home-targeted pushes; S4/S6 for recap/report pushes |
| Contract route-key mismatch: `FAMILY_CHILD_ROUTES` key `child/[profileId]/reports/weekly` has no matching screen file (actual: `weekly-report/[weeklyReportId].tsx`) | `PARENT-13` | S4 (catalog must be truthful before scope-chip work); swept again in the S6 `child/*` deletion |
| `retention/library.yaml` premise predates the retention-pill removal — assertions may be stale | `LEARN-08`, `LEARN-16` | S2 |

## Completion Rule

A V2 phase is not ready for implementation until its plan has:

1. A "Flow coverage" section citing exact rows from this map.
2. At least one negative-path or parity test for every re-homed gated surface.
3. A S6 disposition for every flow it removes, hides, or makes unreachable.
4. A test-manifest update for every cited flow whose inventory Coverage column
   lists a flow file with a changed entry path — the per-row Maestro yamls
   (~100 files across all families), not only the `QA-01..QA-15` rows.
