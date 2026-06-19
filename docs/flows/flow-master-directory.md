# Flow Master Directory

> **STATUS: PARKED — revive after V2 cutover (decided 2026-06-18).** Master flow map for audience access, scope, and verification. Created 2026-05-22. The per-flow detail-page system (`master-directory/`) reached only ~12.5% coverage (21/168) and is framed against the V0/V1 nav model. Rather than finish it against a shell that V2 ("mentor-is-the-app", `docs/plans/v2-plan/`) retires, it is intentionally frozen. **Revive plan:** once the V2 shell lands (S6 cutover), rebuild this register + the per-flow pages V2-shell-aware (Mentor/Subjects/Journal + scope chip, not Family/Study mode). The current-state index/mapping job is meanwhile carried by `mobile-app-flow-inventory.md` (canonical) + `docs/plans/v2-plan/02-flow-map.md` (inventory→V2 bridge). Do not invest further here pre-V2; do not delete.

This document is the durable directory of product flows. It is intentionally separate from the revision plans:

- Plans under `docs/flows/plans/` answer: what are we testing now?
- Access inventories answer: which audience should have access?
- This directory answers: what is the flow, who owns it, where does it live, and what must stay true?

Detailed flow pages live under [`master-directory/`](master-directory/README.md).

## Related documents

- [`docs/specs/2026-05-21-navigation-contract.md`](../specs/2026-05-21-navigation-contract.md) — target navigation contract (`resolveNavigationContract`, `study` / `family` shapes). Flow pages cite it when their audience access depends on the contract.
- [`docs/specs/2026-05-23-freeform-library-filing.md`](../specs/2026-05-23-freeform-library-filing.md) and [`docs/plans/2026-05-23-freeform-library-filing-plan.md`](../plans/2026-05-23-freeform-library-filing-plan.md) — freeform session history vs Library filing contract. Flow pages must not claim upstream Ask First / Unsorted auto-subject is delivered until that separate work lands.
- [`docs/audience-matrix.md`](../audience-matrix.md) — current-state inventory of scattered gating (F1–F14). Flow pages that touch gated surfaces (home, more, account, privacy, progress) should cite the matrix.
- [`master-directory/README.md`](master-directory/README.md) — schema and grouping for the per-flow detail pages.
- `CLAUDE.md` — authoritative for **current** profile shapes and `isOwner` gating rules.

## Vocabulary — audience axis (overlapping vocabularies)

Four documents describe the same audience axis with different vocabularies. Translation table:

| This directory | `CLAUDE.md` (today) | Navigation contract (target) | Audience matrix |
| --- | --- | --- | --- |
| `Study-only` | `learner` shape | `study` mode | `mode === 'study'` |
| `Family-only` | `guardian` shape, with linked children | `family` mode | `mode === 'family'`, `hasLinkedChildren`, `isParentProxy` |
| `Shared same behavior` | both shapes, same screen | both modes, same contract | n/a |
| `Shared different scope` | both shapes, different content gates | both modes, different `gates.*` | `isOwner`, `role`, `tier` reads |
| `Owner/account shared` | `isOwner: true` | `gates.showBilling / showAccountSecurity / showExportDelete` | `isOwner`, `role` |

The fact that "two shapes" means `guardian/learner` in CLAUDE.md and `study/family` in the navigation-contract spec is **intentional**: CLAUDE.md is V0 reality; the spec is FULL target.

> See CLAUDE.md 'Profile Shapes' table for the V0-vs-V1 tab count difference.

## Audience Access Labels

| Label | Meaning |
| --- | --- |
| `Study-only` | Available from the student's own Study context. |
| `Family-only` | Available only from mentor/family support context. |
| `Shared same behavior` | Same flow and same data scope for Study and Family users. |
| `Shared different scope` | Both audiences can use it, but entry point, data scope, or permitted actions differ. |
| `Owner/account shared` | Account-owner flow; available based on ownership rather than Study/Family context. |
| `Native-only` | Requires mobile-native capability for full validation. |
| `Removed` | Intentionally no longer in product. |
| `Needs product decision` | Current docs/code do not make the intended audience clear. |

## Flow Detail Schema

Every per-flow page should use the template at [`master-directory/_template.md`](master-directory/_template.md) and include:

- canonical inventory source
- student behavior
- mentor/family behavior
- shared-vs-different scope decision
- route and entry-point map
- data ownership rules
- expected no-access behavior
- native/web validation notes
- current known bugs or doc drift

## Mapped Flow Pages

These rows have deep flow pages. The complete register below still tracks every canonical flow, including rows that are not mapped yet.

| Flow ID | Detail page | Access label | Status | Notes |
| --- | --- | --- | --- | --- |
| ACCOUNT-03 | [`master-directory/account/ACCOUNT-03.md`](master-directory/account/ACCOUNT-03.md) | `Owner/account shared` | Draft | Add-child is optional owner/family setup, not required for Study. |
| ACCOUNT-04 | [`master-directory/account/ACCOUNT-04.md`](master-directory/account/ACCOUNT-04.md) | `Shared different scope` | Draft | Real profile switching vs parent-native child review/proxy compatibility. |
| ACCOUNT-30 | [`master-directory/account/ACCOUNT-30.md`](master-directory/account/ACCOUNT-30.md) | `Owner/account shared` | Draft | Proxy-only More restrictions are safety guards, not normal Study access. |
| AUTH-04 | [`master-directory/auth/AUTH-04.md`](master-directory/auth/AUTH-04.md) | `Shared same behavior` | Draft | Shared sign-in gate; audience scope begins after auth/profile load. |
| AUTH-13 | [`master-directory/auth/AUTH-13.md`](master-directory/auth/AUTH-13.md) | `Shared different scope` | Draft | Redirect preservation is shared; destination authorization differs by route/context. |
| HOME-01 | [`master-directory/home/HOME-01.md`](master-directory/home/HOME-01.md) | `Study-only` | Draft | Learner home is the active user's Study surface; current V0 reuses route for Family. |
| HOME-02 | [`master-directory/home/HOME-02.md`](master-directory/home/HOME-02.md) | `Family-only` | Draft | Parent gateway home is the Family home target, not Study home. |
| HOME-03 | [`master-directory/home/HOME-03.md`](master-directory/home/HOME-03.md) | `Family-only` | Draft | Parent-mode navigation target; current V0 differs from FULL Recaps shape. |
| HOME-07 | [`master-directory/home/HOME-07.md`](master-directory/home/HOME-07.md) | `Family-only` | Draft | Add-first-child is setup and must not trap adults away from Study. |
| HOME-08 | [`master-directory/home/HOME-08.md`](master-directory/home/HOME-08.md) | `Shared different scope` | Draft | Home timeout recovery differs between Study-safe and Family-safe contexts. |
| SUBJECT-03 | [`master-directory/subject/SUBJECT-03.md`](master-directory/subject/SUBJECT-03.md) | `Study-only` | Draft | Chat classifier miss creates/resolves an active-learner subject; this is not Library filing. |
| SUBJECT-05 | [`master-directory/subject/SUBJECT-05.md`](master-directory/subject/SUBJECT-05.md) | `Shared different scope` | Draft | Subject clarification can be reused only with explicit child scoping; filed Library topics still belong to subjects. |
| LEARN-01 | [`master-directory/learn/LEARN-01.md`](master-directory/learn/LEARN-01.md) | `Study-only` | Draft | Ask Anything saves session history; meaningful freeform chats may later file into Library. |
| LEARN-07 | [`master-directory/learn/LEARN-07.md`](master-directory/learn/LEARN-07.md) | `Shared different scope` | Draft | Learner summary/reflection vs mentor child session recap. |
| LEARN-08 | [`master-directory/learn/LEARN-08.md`](master-directory/learn/LEARN-08.md) | `Study-only` | Draft | Library is active-student Study; child curriculum needs parent-native routes. |
| LEARN-17 | [`master-directory/learn/LEARN-17.md`](master-directory/learn/LEARN-17.md) | `Shared different scope` | Draft | Study self progress vs Family child progress. |
| LEARN-24 | [`master-directory/learn/LEARN-24.md`](master-directory/learn/LEARN-24.md) | `Study-only` | Draft | Saved bookmarks are active-student owned; mentor mutation is not target UX. |
| HOMEWORK-01 | [`master-directory/homework/HOMEWORK-01.md`](master-directory/homework/HOMEWORK-01.md) | `Shared different scope` | Draft | Student starts homework; mentor review is later and read-only. |
| BILLING-04 | [`master-directory/billing/BILLING-04.md`](master-directory/billing/BILLING-04.md) | `Owner/account shared` | Draft | Restore purchases belongs to owner account across Study/Family. |
| PARENT-03 | [`master-directory/parent/PARENT-03.md`](master-directory/parent/PARENT-03.md) | `Family-only` | Draft | Child detail drill-down is parent-native Family review, not proxy. |
| QUIZ-09 | [`master-directory/learn/QUIZ-09.md`](master-directory/learn/QUIZ-09.md) | `Study-only` | Draft | Quiz history is learner-owned; Family review belongs in reports/recaps. |

## Complete Flow Register

This register mirrors every flow ID currently listed in mobile-app-flow-inventory.md. Rows marked Not mapped do not have a deep flow page yet.

| Flow ID | Canonical flow | Detail page | Access label | Mapping status |
| --- | --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | Not created | TBD | Not mapped |
| AUTH-02 | Sign up with email and password | Not created | TBD | Not mapped |
| AUTH-03 | Sign-up email verification code | Not created | TBD | Not mapped |
| AUTH-04 | Sign in with email and password | [master-directory/auth/AUTH-04.md](master-directory/auth/AUTH-04.md) | `Shared same behavior` | Draft |
| AUTH-05 | Additional sign-in verification | Not created | TBD | Not mapped |
| AUTH-06 | Forgot password and reset password | Not created | TBD | Not mapped |
| AUTH-07 | Auth screen navigation | Not created | TBD | Not mapped |
| AUTH-08 | OAuth sign in / sign up — platform-conditional: Google on Android/web, Apple on iOS only, OpenAI if Clerk strategy registered | Not created | TBD | Not mapped |
| AUTH-09 | SSO callback completion and fallback return to sign in | Not created | TBD | Not mapped |
| AUTH-10 | Sign out | Not created | TBD | Not mapped |
| AUTH-11 | Session-expired forced sign-out and re-entry banner | Not created | TBD | Not mapped |
| AUTH-12 | First-time vs returning sign-in copy | Not created | TBD | Not mapped |
| AUTH-13 | Deep-link auth redirect preservation: unauthenticated deep links are stored in `pending-auth-redirect.ts` (5-minute TTL, sessionStorage on web) and restored after sign-in (BUG-530, commit 6f75c488) | [master-directory/auth/AUTH-13.md](master-directory/auth/AUTH-13.md) | `Shared different scope` | Draft |
| AUTH-14 | Sign-in transition spinner and stuck-state recovery: after `setActive()` succeeds, sign-in shows a "Signing you in…" spinner; if the auth-layout redirect doesn't fire within `SESSION_TRANSITION_MS`, an `ErrorFallback` renders with a Try-again button and a Sign-up escape; phase-2 timeout (+15 s) resets the form with an inline error | Not created | TBD | Not mapped |
| ACCOUNT-01 | Create first profile | Not created | TBD | Not mapped |
| ACCOUNT-02 | Create additional profile | Not created | TBD | Not mapped |
| ACCOUNT-03 | Add child profile from More or Profiles | [master-directory/account/ACCOUNT-03.md](master-directory/account/ACCOUNT-03.md) | `Owner/account shared` | Draft |
| ACCOUNT-04 | Profile switching | [master-directory/account/ACCOUNT-04.md](master-directory/account/ACCOUNT-04.md) | `Shared different scope` | Draft |
| ACCOUNT-05 | Family-plan gating and max-profile gating for adding children | Not created | TBD | Not mapped |
| ACCOUNT-06 | More is a hub, not one long settings page. User opens More, then chooses Learning preferences, Mentor memory, Account/Profile, Notifications, Privacy & Data, or Help. Account/Profile opens profile, password, app-language, and subscription controls; Privacy & Data opens privacy policy, terms, export, deletion, and withdrawal-archive controls; Learning preferences opens the accommodation picker. Eligible adult owners also see add-child and family-breakdown sharing controls on the hub. | Not created | TBD | Not mapped |
| ACCOUNT-07 | User opens More, taps Notifications, and manages push-notification and weekly-digest switches on the notifications sub-screen. Back returns to the More hub. | Not created | TBD | Not mapped |
| ACCOUNT-08 | User opens More, taps Learning preferences, sees the current accommodation summary, then taps the accommodation row. The accommodation screen lets them select accommodation modes; some selected modes reveal celebration-level choices (`all`, `big_only`, `off`) inline below that mode. | Not created | TBD | Not mapped |
| ACCOUNT-09 | User opens More, taps Account/Profile, then uses the Change password row rendered by `AccountSecurity`. Owners see the row; non-owner profiles do not. | Not created | TBD | Not mapped |
| ACCOUNT-10 | User opens More, taps Privacy & Data, then taps Export my data. Native platforms open the share sheet with the JSON export; web downloads `mentomate-data-export.json`. Errors show an export alert. | Not created | TBD | Not mapped |
| ACCOUNT-11 | User opens More, taps Privacy & Data, then taps Delete account. The delete-account screen walks through warning, exact `DELETE` typed confirmation, family/subscription advisory copy, and scheduled deletion. | Not created | TBD | Not mapped |
| ACCOUNT-12 | If deletion is already scheduled, user lands on the scheduled state of `/delete-account`, taps Keep account (`delete-account-keep`), the cancellation mutation runs, and the app returns to More with the account intact. | Not created | TBD | Not mapped |
| ACCOUNT-13 | Privacy policy | Not created | TBD | Not mapped |
| ACCOUNT-14 | Terms of service | Not created | TBD | Not mapped |
| ACCOUNT-15 | Self mentor memory (BUG-918: 'Set by your parent' badge copy hidden for owner profiles) | Not created | TBD | Not mapped |
| ACCOUNT-16 | Child mentor memory | Not created | TBD | Not mapped |
| ACCOUNT-17 | Child memory consent prompt | Not created | TBD | Not mapped |
| ACCOUNT-18 | Subject analogy preference after setup (hidden on language subjects per BUG-939) | Not created | TBD | Not mapped |
| ACCOUNT-19 | Consent request during underage profile creation | Not created | TBD | Not mapped |
| ACCOUNT-20 | Child handoff to parent consent request | Not created | TBD | Not mapped |
| ACCOUNT-21 | Parent email entry, send consent link, resend, and change email. Validates child cannot enter own email as parent (server-side rejection with inline error) | Not created | TBD | Not mapped |
| ACCOUNT-22 | Consent pending gate | Not created | TBD | Not mapped |
| ACCOUNT-23 | Consent withdrawn gate | Not created | TBD | Not mapped |
| ACCOUNT-24 | Post-approval landing after consent is granted | Not created | TBD | Not mapped |
| ACCOUNT-25 | Parent consent management for a child | Not created | TBD | Not mapped |
| ACCOUNT-26 | Regional consent variants | Not created | TBD | Not mapped |
| ACCOUNT-27 | Parent consent deny confirmation: when the parent declines from the email link, a confirmation dialog gates the deny commit | Not created | TBD | Not mapped |
| ACCOUNT-28 | User opens More, taps Account/Profile, then taps App language. A bottom-sheet language picker opens; selecting a locale updates `i18next`, persists the language to SecureStore, and closes the sheet. | Not created | TBD | Not mapped |
| ACCOUNT-29 | User opens More and taps Mentor language. Today that row opens Account/Profile rather than a separate tutor-language setup screen; there is no distinct current save flow beyond the account/language controls already listed in ACCOUNT-28. | Not created | TBD | Not mapped |
| ACCOUNT-30 | When a parent is viewing as a child, More still shows safe child-context rows, but account-level actions are hidden. Sign out is hidden on the hub; Subscription is hidden on Account/Profile; Export my data and Delete account are hidden on Privacy & Data. | [master-directory/account/ACCOUNT-30.md](master-directory/account/ACCOUNT-30.md) | `Owner/account shared` | Draft |
| HOME-01 | Learner home — redesigned (commit 435a7b89): subject-tint carousel (`home-subject-carousel`, `home-subject-card-{id}`), add-subject tile (`home-add-subject-tile`), empty-subjects state (`home-empty-subjects`, `home-add-first-subject`), Ask Anything bar (`home-ask-anything`), quick-action row (`home-action-study-new`, `home-action-homework`, `home-action-practice`), CoachBand (gated by `FEATURE_FLAGS.COACH_BAND_ENABLED`). Replaces the previous IntentCard pattern | [master-directory/home/HOME-01.md](master-directory/home/HOME-01.md) | `Study-only` | Draft |
| HOME-02 | Parent gateway home | [master-directory/home/HOME-02.md](master-directory/home/HOME-02.md) | `Family-only` | Draft |
| HOME-03 | Parent tabs and parent-mode navigation | [master-directory/home/HOME-03.md](master-directory/home/HOME-03.md) | `Family-only` | Draft |
| HOME-04 | Animated splash and initial shell | Not created | TBD | Not mapped |
| HOME-05 | Empty first-user state (no subjects yet) — surfaced through the learner home action set; CTA `home-action-study-new` is the primary entry; `home-add-subject-tile` / `home-add-first-subject` IDs remain in the empty-subjects branch | Not created | TBD | Not mapped |
| HOME-06 | Resume interrupted session (driven by SecureStore session-recovery marker + `useContinueSuggestion`; surfaced as the active-subject card or a recovery affordance on the home carousel) | Not created | TBD | Not mapped |
| HOME-07 | Add-first-child gate for parent owners on family/pro plans without a child profile yet — "Add a child to get started" branch on parent home; CTA navigates to `/create-profile` | [master-directory/home/HOME-07.md](master-directory/home/HOME-07.md) | `Family-only` | Draft |
| HOME-08 | Home loading-timeout fallback | [master-directory/home/HOME-08.md](master-directory/home/HOME-08.md) | `Shared different scope` | Draft |
| SUBJECT-01 | Create subject from learner home | Not created | TBD | Not mapped |
| SUBJECT-02 | Create subject from library empty state | Not created | TBD | Not mapped |
| SUBJECT-03 | Create subject from chat when classifier cannot match an existing subject | [master-directory/subject/SUBJECT-03.md](master-directory/subject/SUBJECT-03.md) | `Study-only` | Draft |
| SUBJECT-04 | Create subject from homework | Not created | TBD | Not mapped |
| SUBJECT-05 | Subject resolution and clarification suggestions | [master-directory/subject/SUBJECT-05.md](master-directory/subject/SUBJECT-05.md) | `Shared different scope` | Draft |
| SUBJECT-06 | Broad subject flow: create a broad subject, then pick a book | Not created | TBD | Not mapped |
| SUBJECT-07 | Focused subject or focused-book flow | Not created | TBD | Not mapped |
| SUBJECT-08 | Per-subject native-language setup for language-learning subjects (four-strands pedagogy). Distinct from the profile-wide `conversationLanguage` set in SUBJECT-16 | Not created | TBD | Not mapped |
| SUBJECT-12 | View curriculum without committing to a learning session | Not created | TBD | Not mapped |
| SUBJECT-14 | Placement / knowledge assessment | Not created | TBD | Not mapped |
| SUBJECT-16 | Conversation-language picker (mandatory, profile-wide). Sets `conversationLanguage`. First entry: post-create-profile onboarding before pronouns | Not created | TBD | Not mapped |
| SUBJECT-17 | After conversation-language setup, learners at or above `PRONOUNS_PROMPT_MIN_AGE` see a pronouns picker with preset options and a free-text Other path. Learners below the age gate skip this screen automatically and continue onboarding. | Not created | TBD | Not mapped |
| LEARN-01 | Freeform chat: "Just ask anything" | [master-directory/learn/LEARN-01.md](master-directory/learn/LEARN-01.md) | `Study-only` | Draft |
| LEARN-02 | Guided learning session from a subject or topic | Not created | TBD | Not mapped |
| LEARN-03 | First session experience | Not created | TBD | Not mapped |
| LEARN-04 | Core learning loop | Not created | TBD | Not mapped |
| LEARN-05 | Coach bubble visual variants | Not created | TBD | Not mapped |
| LEARN-06 | Voice input and voice-speed controls | Not created | TBD | Not mapped |
| LEARN-07 | Session summary: submit summary or skip summary; "View full transcript" CTA navigates to LEARN-23. Includes `session-next-topic-card` (LLM-generated `nextTopicTitle` + `nextTopicReason` + "Continue learning" CTA → opens a guided session at `nextTopicId`); applies to all tutoring paths (freeform, guided, homework, practice, relearn, recitation). `nextTopicReason` is fed into the next session's system prompt via `session-context-builders.ts:324`. Audit Section E + Slice 2 wire `topicOrder` ordered-list rendering and the second-session-open home teaser, both of which are missing today | [master-directory/learn/LEARN-07.md](master-directory/learn/LEARN-07.md) | `Shared different scope` | Draft |
| LEARN-08 | Library v3 — subject-first shelf list with retention pills and an inline search bar (LEARN-25). Tapping a subject opens the subject shelf, where books and suggestions live. Replaces the previous shelves/books/topics tab architecture (PR #144) | [master-directory/learn/LEARN-08.md](master-directory/learn/LEARN-08.md) | `Study-only` | Draft |
| LEARN-09 | Subject shelf -> book selection. Distinguishes empty-shelf (no books yet) from unstarted-topics (books exist, no progress) per BUG-920 | Not created | TBD | Not mapped |
| LEARN-10 | Book detail and start learning from a book | Not created | TBD | Not mapped |
| LEARN-11 | Manage subject status: active, paused, archived | Not created | TBD | Not mapped |
| LEARN-12 | Topic detail (redesigned in commit 855a632f) | Not created | TBD | Not mapped |
| LEARN-13 | Recall check | Not created | TBD | Not mapped |
| LEARN-14 | Failed recall remediation | Not created | TBD | Not mapped |
| LEARN-15 | Relearn flow: same method or different method. **Data-layer anomaly:** does not flow through the canonical `startSession` service — `apps/api/src/services/retention-data.ts:858-873` inserts directly into `learning_sessions` with `metadata: { effectiveMode: 'relearn' }`. Any session-start logic added centrally (e.g., topic-intent matching from audit Section J / Slice 1 PR 5i) needs to be extended here too, or relearn sessions will silently miss it | Not created | TBD | Not mapped |
| LEARN-16 | Retention review from library or review surfaces | Not created | TBD | Not mapped |
| LEARN-17 | Progress overview (top-level tab) | [master-directory/learn/LEARN-17.md](master-directory/learn/LEARN-17.md) | `Shared different scope` | Draft |
| LEARN-18 | Subject progress detail | Not created | TBD | Not mapped |
| LEARN-19 | Streak display | Not created | TBD | Not mapped |
| LEARN-20 | Milestones list | Not created | TBD | Not mapped |
| LEARN-21 | Cross-subject vocabulary browser | Not created | TBD | Not mapped |
| LEARN-22 | Per-subject vocabulary list (delete words, view CEFR + word/phrase badges; vocab quiz card label per BUG-891) | Not created | TBD | Not mapped |
| LEARN-23 | Read-only session transcript view (BUG-889). Renders exchange history from `GET /sessions/:sessionId/transcript`, filters out `isSystemPrompt` rows, applies `stripEnvelopeJson` per bubble (BUG-941). Registered as `fullScreenModal` in root `_layout.tsx`. `goBackOrReplace` back navigation. Gated for parent-proxy mode at the LEARN-07 link | Not created | TBD | Not mapped |
| LEARN-24 | Saved bookmarks screen — paginated list of bookmarked chat messages with subject name, optional topic title, relative date, and truncated content with expand-on-tap; swipe/trash delete with confirm; parent-proxy mode disables delete | [master-directory/learn/LEARN-24.md](master-directory/learn/LEARN-24.md) | `Study-only` | Draft |
| LEARN-25 | Library inline search — `LibrarySearchBar` with 300 ms debounce drives `useLibrarySearch`; nested book / topic / note matches keep their parent subject visible, then the subject shelf handles the next level (PR #144) | Not created | TBD | Not mapped |
| LEARN-26 | First-curriculum session entry (the post-onboarding wall — see "Path 0" in `docs/flows/learning-path-flows.md`). `POST /subjects/:subjectId/sessions/first-curriculum` waits for the first materialized topic before creating a `learning_sessions` row. Server picks the first topic by `sortOrder` (`findFirstAvailableTopicId` in `apps/api/src/services/session/session-crud.ts`), so topic-grain learner intent is dropped here. **Audit Section A (pre-warm, PR 5d) shrinks the wait; Section J (topic matching, PR 5i) closes the intent-drop**. Entry comes from create-subject, book detail, and language setup after submit. Error path on topic timeout returns a 504-style "still preparing your subject" error to the screen | Not created | TBD | Not mapped |
| PRACTICE-01 | Practice hub menu (Review topics, Recite, Dictation, Quiz) | Not created | TBD | Not mapped |
| PRACTICE-02 | Review topics shortcut (jumps directly into the next overdue topic relearn flow) | Not created | TBD | Not mapped |
| PRACTICE-03 | Recitation session (recite a poem / text from memory) | Not created | TBD | Not mapped |
| PRACTICE-04 | "All caught up" empty state with next-review countdown | Not created | TBD | Not mapped |
| QUIZ-01 | Quiz activity picker (Capitals, Vocabulary per language, Guess Who). Vocabulary cards dynamically label as "<lang> basics" with a starter-words subtitle when the learner has fewer than `PERSONAL_VOCAB_QUIZ_THRESHOLD` (5) recorded words (BUG-891); locked-vocab card (testID `quiz-vocab-locked`) shown when no four_strands subject exists | Not created | TBD | Not mapped |
| QUIZ-02 | Round generation loading screen with rotating "shuffling / picking a theme" copy and 20-second "still trying" hint | Not created | TBD | Not mapped |
| QUIZ-03 | Round play screen — multiple choice (Capitals / Vocabulary). When `currentQuestion.freeTextEligible === true`, renders a TextInput + Submit button (testIDs `quiz-free-text-input`, `quiz-free-text-field`, `quiz-free-text-submit`) instead of option buttons. `answerState`, `selectedAnswer`, `freeTextAnswer`, `guessWhoCluesUsed`, and the per-question timer (`elapsedMs`, `questionStartTimeRef`) all reset in the same React batch on advance (BUG-929 + CR-PR129-M4). Server checks each answer via `POST /quiz/rounds/:id/check` | Not created | TBD | Not mapped |
| QUIZ-04 | Round play screen — Guess Who clue reveal (clues unlock progressively, score scaled by `cluesUsed`). `guessWhoCluesUsed` reset to 1 and `freeTextAnswer` cleared in the same batch as `answerState` on advance | Not created | TBD | Not mapped |
| QUIZ-05 | Mid-round quit with confirm-style escape (close icon top-left). In-app Modal (not `Alert.alert` / `window.confirm`) to avoid web renderer-freeze (BUG-892) | Not created | TBD | Not mapped |
| QUIZ-06 | Round complete error retry | Not created | TBD | Not mapped |
| QUIZ-07 | Results screen with celebration tier (perfect / great / nice), score, theme, XP earned, Play Again, Done. Streak recording is soft-failed via try/catch so API errors cannot block the celebration screen | Not created | TBD | Not mapped |
| QUIZ-08 | Quiz quota / consent / forbidden errors render typed-error message + suppress Retry | Not created | TBD | Not mapped |
| QUIZ-09 | Quiz history: list of completed rounds grouped by Today / Yesterday / locale date, with empty state that deep-links back to the quiz index | [master-directory/learn/QUIZ-09.md](master-directory/learn/QUIZ-09.md) | `Study-only` | Draft |
| QUIZ-10 | Quiz round detail: drill into a completed round and see each question with correct answer + accepted aliases. Guess Who rows show the first clue (truncated to 60 chars) as the collapsed-row prompt instead of the literal string "Guess Who" (BUG-932) | Not created | TBD | Not mapped |
| QUIZ-11 | Malformed-round guard: `capitals`/`vocabulary` questions whose options array dedupes to fewer than 2 unique values render an actionable error screen instead of a dead-end single-button question (BUG-812 / F-015) | Not created | TBD | Not mapped |
| QUIZ-12 | Wrong-answer dispute: a "Not quite right?" affordance flags the question; the card swaps to "Noted — we'll review this" (BUG-469, restricted to wrong answers per BUG-927) | Not created | TBD | Not mapped |
| QUIZ-13 | Answer-check failure non-blocking warning: when `POST /quiz/rounds/:id/check` fails, an inline warning ("Answer check failed — result may be inaccurate") renders and the round continues assuming wrong (IMP-7, BUG-799) | Not created | TBD | Not mapped |
| DICT-01 | Dictation choice screen ("I have a text" vs "Surprise me") | Not created | TBD | Not mapped |
| DICT-02 | OCR text preview + edit before starting (homework path) | Not created | TBD | Not mapped |
| DICT-03 | "Surprise me" LLM-generated dictation (`POST /dictation/generate`). Surfaces typed errors via `formatApiError` Alert. 20s hard timeout shows an inline error with retry (`dictation-timeout-error` / `dictation-timeout-retry`); in-flight generation can be cancelled (`dictation-loading-cancel`); late responses after timeout/cancel are suppressed via `generateCancelledRef` | Not created | TBD | Not mapped |
| DICT-04 | Playback screen (TTS reads each sentence; pace + punctuation + skip + repeat controls; tap-to-pause; countdown in target language) | Not created | TBD | Not mapped |
| DICT-05 | Mid-dictation exit confirm dialog ("Are you sure?") on hardware back | Not created | TBD | Not mapped |
| DICT-06 | Completion screen (Well done! Check my writing / I'm done / Try another dictation). Includes review-in-progress spinner with cancel and a 20s review timeout; deep-link / stale-context guard renders a recovery CTA. i18n: alert buttons use `t('common.ok')` / `t('errors.generic')` (commit 3d2c373a) | Not created | TBD | Not mapped |
| DICT-07 | Photo review of handwritten dictation via multimodal LLM | Not created | TBD | Not mapped |
| DICT-08 | Sentence-level remediation (rewrite each mistake; autocorrect disabled; accepts whatever child types) | Not created | TBD | Not mapped |
| DICT-09 | Perfect-score celebration screen | Not created | TBD | Not mapped |
| DICT-10 | Recording dictation result on "I'm done" or after review (`POST /dictation/results`) with retry alert if save fails | Not created | TBD | Not mapped |
| HOMEWORK-01 | Start homework from learner home | [master-directory/homework/HOMEWORK-01.md](master-directory/homework/HOMEWORK-01.md) | `Shared different scope` | Draft |
| HOMEWORK-02 | Camera permission, capture, preview, and OCR. Permission phase has two distinct sub-states: first-request prompt (`grant-permission-button`) and permanently-denied/Settings-redirect (`open-settings-button`); auto-refreshes on app resume (commit 22c7c99c). i18n keys now render translated strings (C-1 fix, commit d0e1efdc); null-safety + fetch-boundary tests added (commit fc8413ed) | Not created | TBD | Not mapped |
| HOMEWORK-03 | Manual fallback when OCR is weak or fails | Not created | TBD | Not mapped |
| HOMEWORK-04 | Homework tutoring session with multi-problem navigation | Not created | TBD | Not mapped |
| HOMEWORK-05 | Gallery import (pick existing photo instead of camera capture) | Not created | TBD | Not mapped |
| HOMEWORK-06 | Image pass-through to multimodal LLM (vision) for richer help | Not created | TBD | Not mapped |
| HOMEWORK-07 | Camera permission onboarding — first-request prompt and permanently-denied Settings-redirect state; auto-refreshes permission on return from OS Settings so camera unlocks without a manual restart | Not created | TBD | Not mapped |
| PARENT-01 | Parent dashboard (parents only — solo accounts without linked children render `LearnerScreen`, not a dashboard). `MetricInfoDot` + `SamplePreview` parent components active across child detail / session / topic surfaces (commit 02e4c519). Route `/(app)/dashboard` is a permanent redirect to `/(app)/home`; the parent home surface is rendered by `ParentHomeScreen` branch inside `LearnerScreen`. | Not created | TBD | Not mapped |
| PARENT-02 | Multi-child dashboard | Not created | TBD | Not mapped |
| PARENT-03 | Child detail drill-down | [master-directory/parent/PARENT-03.md](master-directory/parent/PARENT-03.md) | `Family-only` | Draft |
| PARENT-04 | Child subject -> topic drill-down | Not created | TBD | Not mapped |
| PARENT-05 | Child session / transcript drill-down. Transcript link gated in parent-proxy mode (CR-PR129-M5, commit 3c542326); `as never` cast removed (CR-PR129-M8, commit 6d9a3bc4) | Not created | TBD | Not mapped |
| PARENT-06 | Child reports list (weekly snapshots + monthly reports) and report detail. Weekly snapshot cards deep-link into the new `weekly-report/[weeklyReportId]` route (PARENT-13) | Not created | TBD | Not mapped |
| PARENT-07 | Parent library view | Not created | TBD | Not mapped |
| PARENT-08 | Subject raw-input audit for parents | Not created | TBD | Not mapped |
| PARENT-09 | Guided label tooltip | Not created | TBD | Not mapped |
| PARENT-10 | Parent child-topic "Understanding" card (plain-English mastery label) with data-gated Retention card | Not created | TBD | Not mapped |
| PARENT-11 | Parent child-session recap: narrative block, highlight block, Conversation prompt with copy-to-clipboard (Copied! / Copy failed states), and `EngagementChip` (curious / stuck / breezing / focused / scattered) | Not created | TBD | Not mapped |
| PARENT-12 | Parent child-subject detail retention badges gated on data presence | Not created | TBD | Not mapped |
| PARENT-13 | Child weekly report detail — push-notification-driven weekly progress screen (sessions, time on app, topics-mastered metrics for a given week); marks report viewed on mount | Not created | TBD | Not mapped |
| BILLING-01 | Owner opens More, taps Account/Profile, then taps Subscription. The subscription screen shows current plan, status badge, optional trial banner, usage meter with daily sub-meter for free tier, and any cancellation notice. | Not created | TBD | Not mapped |
| BILLING-02 | Owner opens Subscription from Account/Profile, selects an upgrade, and RevenueCat purchase starts. While webhook confirmation is pending, the screen shows `purchase-polling-indicator`; if the plan is already purchased, the user is prompted to Restore. | Not created | TBD | Not mapped |
| BILLING-03 | Trial, plan usage, and family-pool states all render on the same subscription screen after the Account/Profile entry. Trial users see the trial banner and Trial status; family users can see family-pool usage when family data is available. | Not created | TBD | Not mapped |
| BILLING-04 | Owner opens Subscription from Account/Profile and taps Restore purchases. The subscription screen invokes the restore action and handles already-purchased or restore result states inline. | [master-directory/billing/BILLING-04.md](master-directory/billing/BILLING-04.md) | `Owner/account shared` | Draft |
| BILLING-05 | Owner opens Subscription from Account/Profile and taps Manage billing. The app deep-links out to App Store / Play subscriptions when the platform provides a management URL. | Not created | TBD | Not mapped |
| BILLING-06 | A child profile without entitlement reaches the subscription screen state that renders `ChildPaywall`. From there the child can use notify-parent rather than purchasing directly; the subscription row itself is hidden while the parent is impersonating a child. | Not created | TBD | Not mapped |
| BILLING-07 | Daily quota exceeded paywall (adult quota path; rendered inline on the same screen as BILLING-06) | Not created | TBD | Not mapped |
| BILLING-08 | Family owner opens Subscription from Account/Profile. When `useFamilySubscription` returns data for `tier === 'family'`, the screen renders `family-pool-section` with family usage details; Family static comparison is also available in PLANS for Family users. | Not created | TBD | Not mapped |
| BILLING-09 | Top-up question credits | Not created | TBD | Not mapped |
| BILLING-10 | BYOK waitlist | Not created | TBD | Not mapped |
| BILLING-11 | Trial user opens Subscription from Account/Profile. The screen shows `trial-banner` above Current Plan with "Trial active" copy, optional `subscription.trialEndsAt`, and a status badge that reads Trial. | Not created | TBD | Not mapped |
| BILLING-12 | Pro or Family customer opens Subscription from Account/Profile and views PLANS. If RevenueCat offerings are unavailable, `getTiersToCompare(currentTier)` appends a read-only comparison card for the other approved tier, with no public upsell action for store-unapproved SKUs. | Not created | TBD | Not mapped |
| CC-01 | Conversation-stage-aware chips and feedback gating in tutoring sessions | Not created | TBD | Not mapped |
| CC-02 | Greeting-aware subject classification | Not created | TBD | Not mapped |
| CC-03 | Animation polish (icon transitions, intent card press, celebrations, permission onboarding) | Not created | TBD | Not mapped |
| CC-04 | `goBackOrReplace(router, fallback)` is mandatory on every back button | Not created | TBD | Not mapped |
| CC-05 | Continue-where-you-left-off card | Not created | TBD | Not mapped |
| CC-06 | Top-up purchase confidence | Not created | TBD | Not mapped |
| CC-07 | Accommodation badge surfaces | Not created | TBD | Not mapped |
| CC-08 | Parent-facing metric vocabulary canon | Not created | TBD | Not mapped |
| CC-09 | Opaque web layout backgrounds to prevent screen bleed-through | Not created | TBD | Not mapped |
| CC-10 | Soft-fail side effects on completion screens | Not created | TBD | Not mapped |
| CC-11 | i18n / `t()` cross-cutting string layer (commits b7e478a8 + 61dd2a2e + d0e1efdc) | Not created | TBD | Not mapped |
| CC-12 | FeedbackProvider + shake-to-feedback on all gate screens (commit 08cf3749) | Not created | TBD | Not mapped |
| CC-13 | Streaming error classification + stream-fallback guard (commits 2a7b08aa, 855a632f) | Not created | TBD | Not mapped |
| CC-14 | Envelope-strip render guard at chat-bubble boundary (BUG-941, commit 34b13650) | Not created | TBD | Not mapped |
| CC-15 | RN Web stale-send block in ChatShell (BUG-886) | Not created | TBD | Not mapped |
| CC-16 | HMR-safe error type guards in `format-api-error.ts` (BUG-947) | Not created | TBD | Not mapped |
| CC-17 | Profile-as-lens navigation pattern (commit a72ebfac) | Not created | TBD | Not mapped |
| CC-18 | Stable FlatList refs (PERF-10, commit 088640c8) | Not created | TBD | Not mapped |

## Recently Shipped Routes Without Canonical Flow IDs

The following routes exist in `apps/mobile/src/app/(app)/` but have not yet been assigned flow IDs in the Complete Flow Register above. They should be assigned IDs in the next inventory pass.

| Route | Notes |
| --- | --- |
| `/(app)/progress/reports/` (`reports/index.tsx` + `reports/[reportId].tsx`) | Child report list and detail; covered under PARENT-06 as entry point but never assigned a standalone student-facing ID |
| `/(app)/progress/weekly-report/[weeklyReportId]` | Push-driven weekly report detail; covered under PARENT-13 as entry point |

## Full Expansion Rule

After the first pass, add one row for every flow ID in `mobile-app-flow-inventory.md`. The row can start as `Not mapped`; it should only become `Mapped` when the matching per-flow page exists and has been checked against:

- `student-flow-access-inventory.md`
- `mentor-flow-access-inventory.md`
- `docs/specs/2026-05-21-navigation-contract.md`
- current routes/screens in `apps/mobile`
