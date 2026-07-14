# V2 Screen Function And Access Map

**Last verified:** 2026-07-01  
**Purpose:** Review which V2 screen owns which job, when it appears, why it exists, who can access it, and whether the claim is backed by code or by the V2 plan.

## Source Legend

| Label | Meaning |
|---|---|
| `CODE` | Implemented in current source and cited below. |
| `PARTIAL` | Code exists, but the screen is placeholder, masked, or missing a planned sub-flow. |
| `PLAN` | Required by `docs/plans/v2-plan/` or the shell spec, but not fully implemented in code. |
| `OPEN` | Known gap or decision still needs a build owner before completion. |

## Current V2 Shell Contract

| Surface | Functionality | Trigger | Why | Access | Source |
|---|---|---|---|---|---|
| V2 tab shell | Shows exactly three bottom tabs: Mentor, Subjects, Journal. Legacy Library, Progress, More, Recaps, Home, and Own Learning are hidden from the tab bar when V2 is enabled. | `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true` -> `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`. | Make the mentor relationship the app shell while preserving old shells behind flags until S6. | Signed-in users who clear profile/consent gates in V2-enabled builds. | `CODE`: `apps/mobile/src/lib/feature-flags.ts:32`, `apps/mobile/src/hooks/use-navigation-contract.ts:22`, `apps/mobile/src/hooks/use-navigation-contract.ts:185`, `apps/mobile/src/hooks/use-navigation-contract.ts:194`, `apps/mobile/src/app/(app)/_layout.tsx:744`, `:755`, `:766` |
| V2 floating chrome | Shows scope chip and account avatar; hides legacy `ModeSwitcher`. Full-screen routes still hide tabs. | Mounted by `(app)/_layout.tsx` only when V2 flag is on and proxy chrome is not active. | Replace Study/Family mode switching with a scope lens and move account/admin actions to avatar. | Avatar: active signed-in profile. Scope chip: only supporter-shaped scope lists with scopes. | `CODE`: `_layout.tsx:623`, `:629`, `:653`, `:654`, `:663`; `ScopeChip.tsx:40`; `AccountAvatar.tsx:22` |
| App gates before tabs | Auth redirect, profile loading/error, save wizard, create profile gate, consent pending/withdrawn gates, post-approval landing. | The signed-in layout resolves auth/profile/preview/consent state before rendering tabs. | Legal/profile correctness before any learning surface. | All signed-in users, according to profile/consent state. | `CODE`: `_layout.tsx:453-621` |
| Scope context | Loads available scopes, defaults learners to implicit `me`, persists last chosen supporter scope. | `ScopeContextProvider` calls `GET /scopes`; `ScopeChip` sets active scope. | One shell, different lenses: self, support hub, or a specific supported person. | Learner shape gets `me`; supporter shape gets `supporter-hub`, optional `me`, and person scopes. | `CODE`: `apps/mobile/src/lib/scope-context.tsx:13`, `:99`, `:127`, `:151`; `apps/api/src/routes/scopes.ts:19`; `apps/api/src/services/scope-resolution.ts:71`, `:83` |

## Top-Level V2 Screens

| Screen | Functionality | Trigger | Why | Access | Source |
|---|---|---|---|---|---|
| Mentor tab, `me` scope | Primary learner surface: ranked `/now` card stack, cold-start card, on-track badge, homework prompt, reward receipt, text/voice input bar, camera/homework action, light practice suggestions. | Bottom tab `/mentor`; now deep link `support.hub` routes here; default V2 landing after gates per plan. | Put next-best action and open-ended ask in one high-frequency place. | Self scope for learners and supporters with active `me` scope. | `CODE`: `mentor.tsx:85`, `:88`, `:105`, `:225`, `:273`, `:338`, `:347`; `use-now-feed.ts:29`; `first-real-state.ts:7`; `now-deep-link.ts:48` |
| Mentor tab, supporter hub scope | Lists supported people and opens a person scope. | Scope chip selects `supporter-hub`; Mentor tab renders `SupportHubMentorTab`. | Parent/supporter starts from a hub, not impersonation. | Supporters with at least one person scope. | `PARTIAL`: `mentor.tsx:370`, `SupportHubMentorTab.tsx:16`; lacks full S4 cold-start/co-learning actions. |
| Mentor tab, person scope | Person-scoped mentor/support view for one supported learner. | Scope chip selects a `person` scope. | Focus the supporter on one child/person without becoming that child. | Supporters with that `person` scope. | `PARTIAL`: `mentor.tsx:379`, `SupportHubMentorTab.tsx:16`; current component is a lightweight placeholder/list view. |
| Subjects tab, `me` scope | Browse all subjects grouped by status, search by subject name, see compact mastered/learning/total/due-review counts, create subject, open Subject Hub. | Bottom tab `/subjects`; Now cards and bar intents can deep-link to `subject.hub`. | Replace the legacy Library/Progress split with one browse doorway. | Self scope. | `CODE`: `subjects.tsx:15`, `:56`, `SubjectsBrowse.tsx:19`, `:121`, `:146`, `:185`, `use-subjects-index.ts:34`, `:80`, `now-deep-link.ts:28` |
| Subjects tab, supporter hub scope | Lists supported people as subject-entry cards. | Scope chip selects `supporter-hub`; Subjects tab renders `SupportHubSubjectsTab`. | Let supporter pick a person before seeing masked learning structure. | Supporters with person scopes. | `PARTIAL`: `subjects.tsx:23`, `SupportHubSubjectsTab.tsx:14`; no rich attention grouping yet. |
| Subjects tab, person scope | Structural-only subject list for a supported person; subject rows open a masked read-only Subject Hub built from the same structural mask response, including book/topic structure plus aggregate due-review/mastery signals. | Scope chip selects a `person` scope, then supporter taps a structural subject row. | Preserve visibility contract: supporter sees structure and safe progress signals, not private artifacts. | Supporters with that edge/person scope. | `CODE`: `subjects.tsx:33`, `PersonScopeStructuralSubjects.tsx:18`, `apps/api/src/routes/scopes.ts:25`, `supporter-structural-mask.ts:102` |
| Journal tab, `me` scope | Moments strip, segmented sections for Sessions, Notes, Memory, Reports (`JournalSectionId = 'notes' \| 'sessions' \| 'memory' \| 'reports'` — no Practice section in code). Recaps open session detail; notes archive combines learner notes and mentor bookmarks; memory opens mentor-memory; reports open weekly/monthly reports. | Bottom tab `/journal`; Now deep link `journal`; Journal moments click through via now deep links. | Replace Progress/My Notes/Recaps/Mentor Memory destinations with one private record. | Self scope. | `CODE`: `journal/index.tsx:27`, `JournalTabView.tsx:24`, `:44`, `:214`, `:406`, `:470`, `:593`, `:845`; `now-deep-link.ts:49` |
| Journal tab, supporter hub scope | Shows per-person shared-record cards backed by `GET /visibility/reports/:personId/shared-record`. | Scope chip selects `supporter-hub`; Journal tab renders `SupportHubJournalTab`, which fetches each person record through `useSharedRecord`. | Supporter-facing shared reports/recaps/milestones under the visibility contract. | Supporters with person scopes. | `CODE`: `journal/index.tsx`, `SupportHubJournalTab.tsx`, `use-shared-record.ts`, `shared-record-read-model.ts`; records are API-backed, not local placeholders. |
| Journal tab, person scope | Shows the API-backed shared record for one supported person. | Scope chip selects a `person` scope; `PersonScopeJournalPlaceholder` fetches `GET /visibility/reports/:personId/shared-record`. | Person-specific transparent shared record. | Supporters with that person scope. | `CODE`: `journal/index.tsx`, `PersonScopeJournalPlaceholder.tsx`, `use-shared-record.ts`; mobile is wired to the shared-record API. |
| Account avatar/admin sheet | Opens account/admin hub: accommodation, mentor memory, account, profiles, security, subscription, notifications, add child/more, privacy, help, sign out. | Tap account avatar in V2 chrome -> `/account`. | Re-home the old More tab behind avatar while preserving owner gates. | Active profile; billing/security/add-child/export-delete rows are gate-controlled. | `CODE`: `AccountAvatar.tsx:22`, `account/index.tsx:10`, `AccountAdminSheet.tsx:23`, `:78`, `:83`, `:88`, `:102`, `:111`, `:118`, `:122`, `:150`, `:155`, `:166` |

## Linked Target Screens Kept By V2

| Screen | Functionality | Trigger | Why | Access | Source |
|---|---|---|---|---|---|
| Subject Hub, `/subject-hub/[subjectId]` | Per-subject next-up card, chapters/topics, due review entry, topic detail, notes, in-context note authoring, preparing/stuck/pick-book recovery, manage subject status. | Subjects row, `/now` `subject.hub`, bar intent, next-up chains. | Merge legacy shelf + progress into one subject place. | Self scope; management hidden in parent proxy. Person-scope structural parity is not complete. | `CODE`: `subject-hub/[subjectId]/index.tsx:35`, `:54`, `:76`, `:119`, `:162`, `:250`, `:311`, `:318`; `use-subject-hub.ts:228`, `:278`, `:398`, `:412` |
| Session, `/session` | Core chat/tutoring engine, voice/text, streaming, subject resolution, challenge overlays, note drafting, parking, recovery. V2 Mentor entry adds raw-input start, non-blocking turn-1 subject resolution, first-session wrap-up, homework image first-response. | Mentor input question, `/now` resume, topic/subject actions, homework camera handoff. | V2 changes discovery, not the tutoring engine. | Learning routes are self-scope; legacy family/proxy restrictions still apply through navigation contract. | `CODE`: `session/index.tsx:259`, `:479`, `:924`, `:929`, `:986`, `:1068`, `:1327`, `:1424`, `:1445`; `SessionAccessories.tsx:529` |
| Homework camera, `/homework/camera` | Capture photo, OCR/read problem, classify or pick subject, retry/manual fallback, return to session. Mentor entry preserves `entrySource=mentor` and `returnTo=mentor`. | Mentor camera/homework button or legacy homework entry. | Homework remains a dedicated capture surface but round-trips into the Mentor thread. | Self learning context. | `CODE`: `mentor.tsx:78`, `homework/camera.tsx:57`, `:498`, `:718`, `session-route-params.ts:110` |
| Quiz, Dictation, Practice | Lightweight practice/games and practice history. | Mentor light-practice affordance, Journal practice section, feed cards, legacy deep links. | Retain existing engagement/practice content while moving discovery into Mentor/Journal. | Self learning context. | `CODE`: `mentor.tsx:181`, `:347`; `JournalTabView.tsx:936`; route files under `quiz/`, `dictation/`, `practice/`. |
| Subscription and billing | Subscription status, packages, purchases/restores, top-ups, family pool, billing management. | Avatar/admin sheet, account rows, quota/paywall flows. | Preserve owner billing while removing More tab as primary chrome. | Owner/billing gate; non-owner paywall behavior remains inside subscription screen. | `CODE`: `AccountAdminSheet.tsx:111`, `more/account.tsx:98`, `subscription.tsx:92`, `:710` |
| More subroutes still linked from avatar/account | Account, privacy, help, notifications, accommodation, security sessions. | Avatar/admin sheet and account/privacy rows. | V2 relocates these destinations but has not deleted them. | Gate varies by row; owner-only for security/billing/export-delete. | `CODE`: `AccountAdminSheet.tsx:78`, `:88`, `:102`, `:118`, `:150`, `:155`; `more/security-sessions.tsx:11`, `more/privacy.tsx:25` |

## Plan-Backed Or Partial Screens Still Needed

| Planned screen/job | Expected functionality | Trigger | Access | Current status |
|---|---|---|---|---|
| Support hub cold-start | Variant-zero add-child anchor, child lifecycle card, approve/kickstart states, labeled ghost preview. | Supporter with no child or inactive/pending child opens V2 shell. | Supporters/parents by scope and visibility tier. | `PLAN/PARTIAL`: Spec lines `144-178`; current support components are placeholders/lists. |
| Supporter co-learning/nudge actions | Start together, send a spark, supporter self-learning doorway, quiet non-pressure nudges. | Support hub or person scope attention item. | Supporters with valid edge. | `PLAN`: S4 plan; not present in mobile support components beyond person-list cards. |
| Visibility ceremony screens | Linking/accept/revoke/contract, two-way transparency, appeal affordance, managed/credentialized tier handling. | Link flows and shared-record/report flows. | Supporter/supportee according to visibility contract. | `CODE` for link/accept/revoke: `app/(app)/link/new.tsx`, `app/(app)/link/[contractId].tsx` (both tested); API routes `visibility.ts:71`, `:87`, `:102`, `:129`, `:142`, `:175`. `PARTIAL`: appeal affordance is in-flight rework (WI-1171), tracked separately from this row. |
| Person-scope Subject Hub parity | Drill from structural subject rows into a masked read-only Subject Hub. | Person scope -> Subjects -> subject row. | Supporter with person edge. | `CODE`: `PersonScopeStructuralSubjects.tsx` adapts the masked structural response into `SubjectHub` with `canStudy=false`, no notes, and no learner-private actions. |
| Shared-record mobile data fetch | Renders real `GET /visibility/reports/:personId/shared-record` data in Support hub/person Journal. | Journal in supporter-hub/person scope. | Supporters and supportees with edge contract. | `CODE`: mobile fetches the route; API projects weekly report, recap-presence, and milestone facts through the shared-record contract. |
| S6 deletion/end-state cleanup | Remove V0/V1 shells, ModeSwitcher, proxy, dead legacy screens only after replacement parity and product V0 retirement ruling. | Explicit S6 execution. | Product/engineering release gate, not user access. | `PLAN`: deferred and irreversible; do not execute without human confirmation. |

## V2 Publish-Readiness Smoke Set (WI-1173)

Each row below is an existing or newly-added test proving the **V2-specific**
trigger path for that surface (not the legacy-route default). Re-run the full
set from the repo root (verified: 12 suites, 121 tests):

```bash
pnpm test:v2-parity
```

which wraps — jest's positional args are regexes, so the Expo Router
`(app)`/`[param]` path segments must be escaped:

```bash
pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage --forceExit \
  'apps/mobile/src/app/\(app\)/mentor\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/subjects\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/journal/index\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/subject-hub/\[subjectId\]/index\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/session/index\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/quiz/results\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/dictation/review\.test\.tsx' \
  'apps/mobile/src/components/support/PersonScopeJournalPlaceholder\.test\.tsx' \
  'apps/mobile/src/components/support/SupportHubJournalTab\.test\.tsx' \
  'apps/mobile/src/components/support/PersonScopeStructuralSubjects\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/link/new\.test\.tsx' \
  'apps/mobile/src/app/\(app\)/link/\[contractId\]\.test\.tsx'
```

| Surface | Test | Proves |
|---|---|---|
| Mentor, me scope | `mentor.test.tsx:309` | `pushNowDeepLink` uses `v2-subject-hub` target, not legacy `/shelf` |
| Mentor, supporter-hub scope | `mentor.test.tsx:211` | Support hub cockpit actions route through the selected person scope |
| Mentor, person scope | `mentor.test.tsx:238-251` | Renders person-scope Mentor variant, does not load the Me feed |
| Quiz (light-practice trigger) | `mentor.test.tsx:401-409` | 'capitals' light-practice selection pushes `/(app)/quiz` with `returnTo: 'mentor'` |
| Dictation (light-practice trigger) | `mentor.test.tsx` — "V2 parity: routes the dictation light-practice affordance to the dictation screen" | 'dictation' selection pushes `/(app)/dictation` (previously untested branch) |
| Practice (post-activity landing) | `quiz/results.test.tsx:390`, `dictation/review.test.tsx:158` | Quiz/dictation completion deterministically lands on `/(app)/practice` — the same V2-reached destination the Mentor light-practice round trip ends at |
| Subjects, me scope | `subjects.test.tsx:128` | "routes rows to the V2 subject hub" |
| Subjects, supporter-hub/person scope | `subjects.test.tsx:159-185` | Renders Support hub variant / person-scope structural placeholder |
| Journal, me scope | `journal/index.test.tsx:79` | Mounts V2 Journal tab landing, not the old stub |
| Journal, supporter-hub scope (Support hub) | `journal/index.test.tsx:96`, `SupportHubJournalTab.test.tsx` | Renders shared-record cards backed by the real API |
| Journal, person scope (person Journal) | `journal/index.test.tsx:108`, `PersonScopeJournalPlaceholder.test.tsx` | Fetches real `GET /visibility/reports/:personId/shared-record` |
| Subject Hub, me scope | `subject-hub/[subjectId]/index.test.tsx:172` (+ sibling describes) | Core V2 Subject Hub screen states |
| Subject Hub, person scope (masked) | `PersonScopeStructuralSubjects.test.tsx:156` | Masked read-only Subject Hub drill-in, no private artifacts |
| Session, V2 mentor entry | `session/index.test.tsx:2200` ("V2 first-session Mentor wrap-up") | `entrySource=mentor`, `returnTo=mentor` freeform session renders the in-thread first-session wrap-up, not the legacy summary route |
| Homework camera, V2 mentor entry | `session/index.test.tsx:1956` ("V2 mentor-homework round-trip (T23)") | Captured photo handoff renders in-thread with deterministic help/check actions; `returnTo=mentor` returns to the Mentor tab |
| Visibility ceremony: link/accept/revoke | `link/new.test.tsx`, `link/[contractId].test.tsx:139` | Create link; review + revoke after both sides accept (appeal affordance excluded — WI-1171's own coverage) |

**Not covered — genuine gap, not a test to fake:** Supporter Support hub
job-to-be-done cards are still placeholder/list-only (T3/WI-1170, not yet
code-backed) — excluded per this WI's "once implemented" acceptance
criterion. Separately, no V2-native *forward* trigger reaches the standalone
`/(app)/practice` hub as a browse destination: every non-test reference to
`/(app)/practice` other than the completion landing above is a legacy V0/V1
Progress-tab entry (`LearnerScreen.tsx`) — Mentor's light-practice affordance
pushes directly to `/(app)/quiz` or `/(app)/dictation`, never to
`/(app)/practice` itself. The practice hub is still V2-reachable (as the
shared quiz/dictation completion landing cited above); there is simply no V2
"browse practice" entry point yet. See `07-trigger-flow-logic-map.md` →
"Current Gaps To Review" for the tracked finding.

## Concrete Progress Ownership Split (WI-1172)

**Purpose:** T5's done-condition is "the old Progress tab has no unique publish-critical
job left." This table maps every concrete-progress signal the legacy
`apps/mobile/src/app/(app)/progress/**` tree carries to its V2 owner (Progress Placement
Rule, above), with evidence, and separately records what is genuinely NOT re-homed yet so
it isn't silently dropped ahead of an S6 decision.

| Signal | V2 owner | Status | Evidence |
|---|---|---|---|
| Topic/book/subject mastery + due-review counts | Subjects tab, Subject Hub | `CODE` | `buildSubjectsIndex()` computes `mastered/learning/total/dueReviews` per subject: `apps/mobile/src/hooks/use-subjects-index.ts:34`, asserted with concrete values in `use-subjects-index.test.tsx:72`. `SubjectHubProgressSummary.tsx:10` renders the same triad plus `reviewsDue`/`weeklyMasteredDelta`, asserted in `SubjectHubProgressSummary.test.tsx:19-39`. |
| Reports (weekly/monthly) | Journal, Reports section | `CODE` | `JournalTabView.tsx:44` Reports section; `JournalTabView.test.tsx:154` ("auto-surfaces the latest report inline in the Reports section"). |
| Recaps (session summaries) | Journal, Sessions section | `CODE` | `JournalTabView.test.tsx:287` ("routes self recap rows to the learner session-summary route"). |
| Milestone moments (as they occur) | Journal, moments strip | `CODE` | `JournalTabView.tsx:87-102` renders `milestone_reached` ledger moments; `JournalTabView.test.tsx:128` asserts `'3 learning sessions completed'` renders. |
| Next action / what to do now | Mentor | `CODE` | Continue-card / cold-start / anchor-arc flows: `mentor.tsx:85-181`; asserted in `mentor.test.tsx:239,299,364`. |
| Subjects-tab row rendering of mastery + due-review (`SubjectsBrowse.tsx:289-307`) | Subjects tab | `CODE`, test added | The positive path (mastered/learning/total text + reviews-due chip when `dueReviews > 0`) was already asserted (`SubjectsBrowse.test.tsx:119-120`). The negative path — the chip must NOT render when `dueReviews === 0` — had no assertion; added in this WI (`SubjectsBrowse.test.tsx` → "omits the reviews-due chip when a subject has no due reviews"). |
| CEFR vocabulary browser (`progress/vocabulary.tsx`, `/vocabulary/[subjectId]`) | *(not re-homed)* | `OPEN` | Per-subject CEFR vocabulary breakdown for language-pedagogy subjects has no V2 entry point in Subjects/Subject Hub — confirmed by grep for `vocabular`/`cefr` across those trees; the only hits are Mentor's unrelated `'vocabulary'` light-practice route key (`mentor.tsx:357`, `LightPracticeAffordance.tsx`), not a CEFR count/breakdown display. Legacy route stays live (not being deleted by this WI). Does not appear in WI-1175's publish-critical prompt list, so it doesn't block T5. Tracked for the WI-1174 retirement-gate audit. |
| Full milestone history (server-paged, all-time list) | *(not re-homed)* | `OPEN` | `progress/milestones.tsx` (`useProgressMilestones(50)`) is a durable, browsable milestone history; Journal's moments strip only surfaces milestones as they cross the `/now` ledger feed, not the full history. Same disposition as vocabulary above — legacy route stays live; tracked for WI-1174. |
| Live global engagement glance (current streak, total sessions/minutes, recall-queue due/strong/fading) | *(not re-homed as a live chip)* | `OPEN` | `ProgressStatsChips.tsx` renders these as a live glance; confirmed absent from Mentor/Subjects/Subject Hub/Journal by grep (`streak`, `retentionCards`, `totalActiveMinutes`/`totalWallClockMinutes`/`totalSessions` — no hits in those trees, aside from `OnTrackBadge`'s unrelated `reviewsDue` prop). The underlying values are already captured per-week inside report snapshots owned by Journal (`packages/schemas/src/snapshots.ts:30-48`: `totalSessions`, `totalActiveMinutes`, `currentStreak`, `retentionCardsDue/Strong/Fading`), so the concrete *value* is not lost — only the always-current single-glance chip has no V2 home. Note: streak/leaderboard-style framing is a deliberate Mentor exclusion, not an oversight — `OnTrackBadge.test.tsx:14` and `LightPracticeAffordance.test.tsx:22` assert streak/leaderboard/rank language is absent from Mentor; any future V2 home for this signal should not reintroduce that framing there. Tracked for WI-1174. |
| Guardian nudge action (`childSummaryQuery.nudgeRecommended`) | Support hub (WI-1170 scope) | `OPEN`, different WI | Not a progress-ownership gap — it's a supporter attention/cockpit affordance, tracked under the support-hub job-to-be-done work, not this WI. |

**Scope note:** per the shepherd's GATE-0 ruling, this WI documents and adds targeted
checks for what's already owned; it does not build new UI for the `OPEN` residual rows.
Those rows are the input WI-1174 needs for its per-surface retirement-gate map.
