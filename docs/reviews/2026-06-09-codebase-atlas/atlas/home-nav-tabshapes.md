# Home, navigation contract & tab shapes — Functional Atlas

Scope: the navigation spine of the EduAgent mobile app — the `(app)` tab shell, the two
tab shapes (guardian/family vs learner/study), the V0 (5-tab) vs V1 (4-tab) flag matrix,
the home-screen branching between `LearnerScreen` and `ParentHomeScreen`, and the full
route tree with quantified nesting depth.

Branch: `new-llm`. All citations are `file:line` against the working tree.

---

## Tab system — the source of truth

There are **two parallel contract engines** and a flag that selects between them:

| Engine | File | Active when |
|---|---|---|
| **V1 contract** (`resolveNavigationContract`) | `apps/mobile/src/lib/navigation-contract.ts:245` | `MODE_NAV_V1_ENABLED === true` |
| **V0 legacy helpers** (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation`) | `apps/mobile/src/lib/legacy-navigation-contract.ts:62-131` | `MODE_NAV_V1_ENABLED === false` |

**Flag defaults (production reality):** both flags read from env and are **OFF by default** —
`MODE_NAV_V0_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV === 'true'` and
`MODE_NAV_V1_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 === 'true'`
(`apps/mobile/src/lib/feature-flags.ts:30-31`). So unless Doppler sets these, the app runs
the **"flags-off" guardian fallback** path (`navigation-contract.ts:274-283`), which keeps
the 5-tab `LEGACY_GUARDIAN_TABS` shell for owners-with-children while reporting `FamilyHome`
for the home tab.

**The five tab-set definitions** (`navigation-contract.ts:146-169`):
- `STUDY_TABS` = `home, library, progress, more` (4) — learner shape
- `FAMILY_TABS` = `home, recaps, progress, more` (4) — **V1 guardian** shape
- `PROXY_TABS` = `home, library, progress` (3) — parent impersonating a child
- `LEGACY_GUARDIAN_TABS` = `home, own-learning, library, progress, more` (5) — **V0 guardian** shape

The legacy file (`legacy-navigation-contract.ts:4-36`) additionally defines mode-driven sets
used only on the V0 path: `GUARDIAN_TABS` (5), `LEARNER_TABS` (4), `PARENT_PROXY_TABS` (3),
`FAMILY_MODE_TABS` = `home, progress, more` (3), `STUDY_MODE_TABS` = `home, library, progress, more` (4).
A V0 family-capable owner who flips into "family" mode collapses to a **3-tab** shell
(`resolveShellVisibleTabs` → `computeModeVisibleTabs('family')`, `legacy-navigation-contract.ts:180`).

**The V1 guardian redesign replaces `own-learning` + `library` with a single `recaps` tab.**
So the same physical owner sees a **5-tab** shell on V0, a **4-tab** shell on V1, and a
**3-tab** shell on the V0 family-mode sub-state — three different tab counts for one user
depending on flags.

### Which shape who gets (V1 contract, `resolveNavigationContract` `navigation-contract.ts:266-315`)

| Branch | Condition | shape | visibleTabs | reason |
|---|---|---|---|---|
| no profile | `!activeProfile` | study | STUDY_TABS | `profile-loading` |
| flags-off guardian | V1 off + V0 off + owner-with-children + not proxy | study* | **LEGACY_GUARDIAN_TABS (5)** | `legacy-v0-flags-off` |
| V1 disabled | V1 off | study | STUDY_TABS | `v1-disabled` |
| parent proxy | `isParentProxy` | study | **PROXY_TABS (3)** | `parent-proxy` |
| child on parent acct | `!activeProfile.isOwner` | study | STUDY_TABS | `child-study-only` |
| explicit family | `appContext==='family'` && familyCapable | **family** | **FAMILY_TABS (4)** | `explicit-family` |
| default family | `appContext===null` && familyCapable && `defaultAppContext==='family'` | **family** | **FAMILY_TABS (4)** | `profile-default-family` |
| (fallthrough) | else | study | STUDY_TABS | `explicit-study` |

\* Note the deliberate quirk: the flags-off guardian keeps `shape: 'study'` (so V1-only
family child routes stay closed) but still renders `FamilyHome` and the 5-tab shell
(`navigation-contract.ts:280-283`).

`isFamilyCapable` requires `isAdultOwner(profile) && profile.hasFamilyLinks === true`
(`navigation-contract.ts:204-207`). `isFamilyHubEligible` additionally requires owner role,
not-proxy, ≥1 linked child, and a ready subscription with a non-null access tier
(`navigation-contract.ts:209-218`).

### Tab-bar rendering (`apps/mobile/src/app/(app)/_layout.tsx`)

The shell uses a **whitelist Tabs pattern**: `screenOptions` hides any route not in
`visibleTabs` via `{ href: null, tabBarItemStyle: { display: 'none' } }`
(`_layout.tsx:613-657`). All six possible tabs are declared (`home`, `own-learning`,
`library`, `recaps`, `progress`, `more`, `_layout.tsx:659-734`); the contract decides which
render. `FULL_SCREEN_ROUTES` (`_layout.tsx:60-70`) collapse the tab bar to height 0 for
immersive screens (session, homework, dictation, quiz, practice, shelf+children, onboarding).
`HIDDEN_TAB_ROUTES` (`_layout.tsx:83-100`) is a belt-and-braces `href:null` list (20 routes)
to stop Expo Router web auto-discovery from surfacing `/quiz`, `/shelf/undefined`, etc. as
phantom tabs (Bug 763).

---

## Screens (route → purpose)

This domain owns the shell + home; the leaf screens below belong to sibling domains but are
listed because they are the **destinations** of home/tab navigation (depth analysis needs them).

### Shell-owned screens
| Route | File | Purpose |
|---|---|---|
| `(app)/_layout` | `_layout.tsx:136` | Tab navigator + 9 gate layers (auth, redirect-replay, profile-load, profile-error, preview-probe, SaveWizard, CreateProfile, consent-pending, consent-withdrawn, post-approval) |
| `(app)/home` | `home.tsx:17` | Tab root. Mounts `ParentHomeScreen` OR `LearnerScreen` based on `contract.home.screen`. Hosts celebration overlay + post-grace consent notice toast |
| `(app)/dashboard` | `dashboard.tsx:10` | **Pure redirect** to `/(app)/home` (preserves `returnTo`). Legacy deep-link/notification target |
| `(app)/own-learning` | `own-learning.tsx:12` | V0-guardian-only "Own Learning" hub (renders `LearnerScreen`). Redirects learners to `/home` (`own-learning.tsx:33`) |
| `(app)/library` | `library.tsx:149` | Learner/study tab root: subject shelves, search, manage-subjects modal. `Redirect` to home if `!canEnter('library')` (`library.tsx:151`) |
| `(app)/recaps/index` | `recaps/index.tsx:15` | V1-guardian tab root: list of children's session recaps. `Redirect` to home if `!canEnter('recaps')` (`recaps/index.tsx:22`) |
| `(app)/progress/index` | `progress/index.tsx:63` | Progress tab root: self OR child progress, reports, stats, sessions |
| `(app)/more/index` | `more/index.tsx:35` | More tab root: settings rows, add-child, sign-out |

### Home sub-components (`components/home/`)
| Component | File | Renders for |
|---|---|---|
| `LearnerScreen` | `LearnerScreen.tsx:110` | learner/study home: greeting, My Notes, EarlyAdopterCard, NudgeBanner, CoachBand, 4 intent actions, subject carousel, family-setup CTA, proxy placeholder |
| `ParentHomeScreen` | `ParentHomeScreen.tsx:684` | guardian/family home: household pulse, child-cap banners, per-child command cards, family summary panel, nudge + learn-together sheets |
| `CoachBand` / `IntentCard` / `SubjectTile` / `ChildQuotaLine` / `EarlyAdopterCard` / `MentorSlot` | `components/home/*` | LearnerScreen + ParentHomeScreen building blocks |

---

## Capabilities (user task → backend process file:line)

The shell itself is mostly **navigation + gating**; data writes happen on leaf screens. The
home/tab-root capabilities and their backing hooks/services:

| User task | Entry (file:line) | Hook → backend |
|---|---|---|
| Switch mode Study↔Family | `ModeSwitcher.tsx:49,82` → `useModeSwitch` → `app-context.tsx:99 setMode` | `useUpdateProfileAppContext` PATCHes `profiles.defaultAppContext` (`app-context.tsx:115`) |
| Switch active profile (proxy in/out) | `_layout.tsx:599` `switchProfile`; `LearnerScreen.tsx:194` | `useProfile().switchProfile` |
| Resume last session | `LearnerScreen.tsx:355` `pushLearningResumeTarget`; `progress/index.tsx:296` | `useLearningResumeTarget` (`/progress/resume-target`) → seeds `/home` then `/session` (`navigation.ts:120-135`) |
| Recover crashed session | `LearnerScreen.tsx:326` | `readSessionRecoveryMarker` (SecureStore) → `/session` |
| Home intent: Homework | `LearnerScreen.tsx:73` → `/(app)/homework/camera` | homework OCR flow (sibling domain) |
| Home intent: Ask anything | `LearnerScreen.tsx:80` → `/(app)/session?mode=freeform` | session flow |
| Home intent: Practice | `LearnerScreen.tsx:87` → `/(app)/practice` | practice flow |
| Home intent: Study new | `LearnerScreen.tsx:94` → `/create-subject` | create-subject (sibling domain) |
| Open My Notes | `LearnerScreen.tsx:514` → `/(app)/my-notes` | notes domain |
| Open subject card | `LearnerScreen.tsx:643` → `/(app)/progress/[subjectId]` | progress domain |
| Quiz discovery card | `LearnerScreen.tsx:381` → `/(app)/quiz`; `useMarkQuizDiscoverySurfaced` (`LearnerScreen.tsx:258`) | coaching-card service |
| Ack post-grace consent notice | `home.tsx:76` `ackNotice.mutate` | `useAckNotice` (`use-dashboard`) → dashboard notice ack |
| Mark celebrations seen | `home.tsx:36` `markCelebrationsSeen.mutateAsync` | `useMarkCelebrationsSeen` → celebrations service |
| Add a child | `more/index.tsx:56` `handleAddChild`; `ParentHomeScreen.tsx:829`; `LearnerScreen.tsx:749` family-setup CTA | → `/create-profile?for=child` (gated by `gates.showAddChild`) |
| Open child command card | `ParentHomeScreen.tsx:842` `pushChildOverview` → `/(app)/child/[profileId]` | `useDashboard`, `useChildMemory`, `useChildProgressSummary` |
| Open child reports | `ParentHomeScreen.tsx:849` → `/(app)/child/[profileId]/reports` | reports domain |
| Send nudge to child | `ParentHomeScreen.tsx:858` `setSheetChildId` → `NudgeActionSheet` | nudge service |
| Learn together | `ParentHomeScreen.tsx:863` → `LearnTogetherSheet` | `/(app)/topic/relearn?for=child` bridge |
| Dismiss child-cap notification | `ParentHomeScreen.tsx:923` `dismissChildCapNotification.mutate` | `useDismissChildCapNotification` |
| Toggle family-pool breakdown sharing | `more/index.tsx:193` | `useUpdateFamilyPoolBreakdownSharing` |
| Sign out (cache+SecureStore wipe) | `more/index.tsx:243` `signOutWithCleanup` | `lib/sign-out` (Clerk signOut + cleanup) |
| Open progress for a child | `progress/index.tsx:495` `ProgressPillRow` | `useChildInventory` / `useChildProgressSummary` |

The shell reads profile state via `useProfile()` and resolves the contract via
`useNavigationContract` / `useNavigationShellContract` / `useNavigationHomeContract`
(`hooks/use-navigation-contract.ts:115,142,191`). Each variant tunes which subscription
query is enabled — note `useNavigationHomeContract` enables subscription **unconditionally**
(`use-navigation-contract.ts:197`) so the family-home gate resolves under any flag combo.

---

## Navigation depth map

Depth = taps from a **tab root** (depth 0) to reach the capability. Flagged: anything **>2**.

### Learner/study shape (the common solo-user case)
| Tab root (d0) | d1 | d2 | d3 | d4 |
|---|---|---|---|---|
| **home** | My Notes; intent → session/homework/practice/create-subject; subject card → `progress/[subjectId]` | session → `session-summary`; `progress/[subjectId]/sessions` | shelf book → topic | — |
| **library** | shelf `/(app)/shelf/[subjectId]` | book `/(app)/shelf/[subjectId]/book/[bookId]` | **topic `/(app)/topic/[topicId]`** ; **session detail** | **(planned) chapter — see CLAUDE.md** |
| **progress** | `progress/[subjectId]`; `progress/saved`; `progress/vocabulary`; `progress/reports`; report detail | `progress/[subjectId]/sessions`; `progress/reports/[reportId]`; `progress/weekly-report/[weeklyReportId]` | — | — |
| **more** | account; privacy; notifications; help; accommodation; mentor-memory; learning-preferences; celebrations; security-sessions | (billing inside account; export/delete inside privacy) | — | — |

**Library is the deepest study branch: library → shelf → book → topic is depth 3.**
`shelf/[subjectId]/book/[bookId]` is a real 3-segment nested layout
(`app/(app)/shelf/[subjectId]/book/[bookId].tsx`), and `library.tsx:379` pushes
shelf-then-book as a 2-step chain to seed the back stack.

### Guardian / family shape
| Tab root (d0) | d1 | d2 | d3 |
|---|---|---|---|
| **home (FamilyHome)** | child overview `/(app)/child/[profileId]`; child reports; child settings (`?mode=settings`); nudge sheet; learn-together sheet; add-child | child `reports/weekly`; child `curriculum`; child `subjects/[subjectId]`; child `topic/[topicId]`; child `session/[sessionId]`; child `report/[reportId]`; child `weekly-report/[weeklyReportId]`; child `mentor-memory` | (child curriculum → subject → topic detail) |
| **recaps** (V1) | `recaps/[recapId]` | — | — |
| **progress** | child picker → child report detail (`pushChildReport`/`pushChildWeeklyReport` seed parent chain) | report detail | — |
| **more** | (same as learner) | — | — |

**The child sub-tree is the deepest in the whole app:** `home → child/[profileId] →
child/[profileId]/subjects/[subjectId]` (and `.../topic/[topicId]`, `.../session/[sessionId]`,
`.../report/[reportId]`, `.../weekly-report/[weeklyReportId]`) is **depth 2–3** under a single
tab, and these are full nested Expo Router stacks. The cross-tab pushes from Progress into a
child report have to manually seed the parent chain (`navigation.ts:149-175`,
`pushChildReport`/`pushChildWeeklyReport`) precisely because the nesting is deep enough that
`router.back()` otherwise falls through to Home.

### Depth violations (>2 levels deep)
1. **Library → shelf → book → topic** = 3 (and CLAUDE.md notes a *planned* `.../chapter/[chapterId]` = 4).
2. **Family home → child → subjects/[subjectId] / topic/[topicId] / session/[sessionId]** = 2–3 within one tab.
3. **Mode switch is a hidden 4th dimension:** the SAME tab root renders different content
   depending on Study/Family mode (`ModeSwitcher` toggles `defaultAppContext`), so "how deep
   is X" depends on which invisible mode you're in. The mode switcher only appears for
   family-capable owners (`navigation-contract.ts:475-478`).

---

## Backend processes & data model

The shell reads/writes one core piece of state and orchestrates many query hooks:

- **Mode state** lives on the profile: `profiles.defaultAppContext` (`'study' | 'family'`).
  Written by `setMode` via `useUpdateProfileAppContext` (`app-context.tsx:115-148`), with
  optimistic override + rollback and a `modeRequestSeq` race guard.
- **Tab/home decisions** are pure functions of `{activeProfile, profiles, isParentProxy,
  appContext(mode), role, subscription, flags}` (`resolveNavigationContract` input,
  `use-navigation-contract.ts:73-103`). No server call decides the shape.
- **Subscription gate** feeds `isFamilyHubEligible` — `useSubscriptionStatus` provides
  `tier`, `effectiveAccessTier`, `billingAccess` (`use-navigation-contract.ts:50-59`).
- **Home data** is a fan-out of TanStack queries: `useDashboard`, `useSubjects`,
  `useOverallProgress`, `useProgressInventory`, `useReviewSummary`, `useLearningResumeTarget`,
  `useQuizDiscoveryCard`, `usePendingCelebrations`, `useRecaps`, `useChildCapNotifications`
  (`LearnerScreen.tsx:121-134`, `ParentHomeScreen.tsx:695-702`).
- **Proxy chrome**: when impersonating a child, `ProxyBanner` (`_layout.tsx:596`) plus a
  recolored scene/tab (`getProxyChromeColors`, `_layout.tsx:157`) and a 3-tab `PROXY_TABS`
  shell; writes are blocked (`canWrite = !isParentProxy`, e.g. `library.tsx:169`).
- **Gates object** (`NavigationGates`, `navigation-contract.ts:359-376`) is the content-level
  authority used inside leaf screens: `showBilling`, `showAccountSecurity`, `showExportDelete`,
  `showAddChild`, `showProgressProfilePicker`, `progressScope`, etc. Screens switch on these
  rather than re-deriving owner/proxy/age.

---

## Complexity signals & redesign notes

For the "deliver all of this on ONE screen" question, the spine is the single biggest source
of accidental complexity:

1. **Three tab counts for one user (3/4/5).** A family owner is 5 tabs on V0, 4 tabs on V1,
   3 tabs in V0-family-mode. Two whole contract engines (`navigation-contract.ts` +
   `legacy-navigation-contract.ts`) coexist behind two flags that are both **off by default**,
   so the production default is the *legacy* path. A one-screen redesign should pick ONE
   shape and delete the matrix.

2. **A hidden mode dimension.** Study vs Family is an invisible toggle that re-skins every
   tab root. The user has to know which mode they're in to predict what a tab shows
   (`ModeSwitcher.tsx`, `app-context.tsx`). Collapsing modes removes an entire axis.

3. **Home is itself a fork, not a screen.** `home.tsx:161` branches `ParentHomeScreen` vs
   `LearnerScreen`, and `LearnerScreen.tsx:492` re-branches into `ParentHomeScreen` *again*
   (`showParentHome && gates.showFamilyHome`). Same fork is duplicated in two files.

4. **Deep nesting users can't discover.** Library → shelf → book → topic (depth 3, planned 4)
   and Family → child → subject/topic/session (depth 2–3). These need manual back-stack
   seeding (`navigation.ts:99-175`) which is itself evidence the tree is too deep for the
   framework's defaults.

5. **Redundant entry points & redirects.** `dashboard.tsx` is a pure redirect to `home`.
   `own-learning` renders the *same* `LearnerScreen` as `home` but redirects learners away
   (`own-learning.tsx:33`) — it only exists for the V0 5-tab guardian shape, the very shape
   V1 deletes. Multiple "go home / go library / go more" timeout escape hatches are
   hand-rolled per screen (`home.tsx:119-154`, `LearnerScreen.tsx:461-480`).

6. **Phantom-route defense is load-bearing.** 20 routes need explicit `href:null` entries
   (`_layout.tsx:83-100`) plus a dynamic whitelist callback just to stop the tab bar from
   surfacing junk — a symptom of cramming the entire app under one `(app)` tab group.

7. **Gating logic sprawls across layers.** Tab visibility (contract), content visibility
   (`gates.*`), `isOwner`, `role`, age (`isAdultOwner`), proxy, subscription, and two flags
   all interact. `navigation-contract.ts:318-357` alone juggles `addChildGate`,
   `childEditorGate`, `moreScreenChildEditorGate`, `removeFamilyMemberGate`, `learnThisTooGate`,
   plus 3 separate "show family home" booleans for the V0/V1/flags-off permutations.

---

## Overlaps with other domains

- **Progress shown in ≥3 places.** Subject progress is reachable from home subject card
  (`LearnerScreen.tsx:643` → `progress/[subjectId]`), the Library shelf, AND the Progress tab.
  Child progress shows on ParentHomeScreen command cards, the Progress tab child-picker, and
  the child overview screen.
- **Reports reachable from ≥4 entry points.** Progress tab (`progress/index.tsx:613`),
  ParentHomeScreen reports button (`ParentHomeScreen.tsx:849`), child overview, and the
  LatestReportCard on Progress. Self vs child report routes diverge
  (`progress/reports/[reportId]` vs `child/[profileId]/reports`), doubling the report screen count.
- **Recaps vs reports vs session-summary** are three overlapping "what happened" surfaces.
  Recaps is a whole V1 tab; reports live under Progress and child; session-summary is a leaf.
- **Add-child has 3 entry points:** More tab (`more/index.tsx:56`), ParentHomeScreen
  (`ParentHomeScreen.tsx:829,1013`), and the LearnerScreen family-setup CTA
  (`LearnerScreen.tsx:746`) — all routing to `/create-profile?for=child`.
- **Session entry has 4+ paths:** home intent (Ask anything), resume coach band, recovery
  marker, quiz discovery, plus subject-tile flows — all converge on `/(app)/session`.
- **My Notes / saved / vocabulary** overlap the notes domain; reachable from home header
  (`LearnerScreen.tsx:514`) and Progress (`progress/saved`, `progress/vocabulary`).
- **Account/billing/security/export** are nested two levels inside More (account.tsx /
  privacy.tsx own them), but ParentHomeScreen also links straight to `more/account`
  (`ParentHomeScreen.tsx:876`), bypassing the More tab.
</content>
</invoke>
