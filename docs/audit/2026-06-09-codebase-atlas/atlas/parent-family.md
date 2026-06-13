# Parent / guardian / family — Functional Atlas

Branch: `new-llm`. All paths absolute-relative to repo root `apps/...`. READ-ONLY audit; citations are `file:line`.

Scope owned: the guardian experience — Parent home/mentoring hub, the entire `child/[profileId]/**` stack (overview, curriculum, reports list, monthly report, weekly report, session detail, subject topics, topic detail, mentor-memory), proxy mode, add-child, child quota caps, parent→child nudges, and the parent→own-library "Learn this too" bridge.

---

## Screens (route → purpose)

### Parent home (the mentoring hub)
The guardian home is **not** a route — `home.tsx` always mounts `<LearnerScreen>`, and `LearnerScreen` branches internally to render `ParentHomeScreen` when the owner has linked children / mode=family (per CLAUDE.md; the `showParentHome` branch).

| Surface | File | Purpose |
|---|---|---|
| ParentHomeScreen | `apps/mobile/src/components/home/ParentHomeScreen.tsx:684` | Mentoring hub. Greeting + household pulse; per-child "command cards"; family summary panel (2+ children); single-child mentor slot; child-cap banners; withdrawal-countdown banners; add-child entry. |
| ChildCommandCard | `ParentHomeScreen.tsx:335` | One card per child. Mentor-voice headline/momentum chips/solid/coming-up/conversation starter, plus a 3-button action row: **Learn together · Reports · Nudge** (`:530-552`). Identity row taps → child overview; avatar taps → child settings. |
| ChildCapNotificationBanner | `ParentHomeScreen.tsx:108` | "Child hit daily/monthly cap" dismissible banner. |
| WithdrawalCountdownBanner | `apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx` (rendered `ParentHomeScreen.tsx:911`) | Grace-period countdown for consent-withdrawn children. |
| FamilySummaryPanel | `ParentHomeScreen.tsx:564` | 2+ children: activity roll-up, "who needs you" attention row, profile-limit row, add-profile footer. |
| SingleChildMentorSlot / MentorSlot | `ParentHomeScreen.tsx:87`, `./MentorSlot` | 1 child: calm mentor insight slot. |

### Child detail stack — `apps/mobile/src/app/(app)/child/[profileId]/**`
Wrapped by a Stack layout guarded by `RequireFamilyContext` (`_layout.tsx:19`); `unstable_settings.initialRouteName='index'` (`_layout.tsx:7`).

| Route | File | Purpose / actions |
|---|---|---|
| `child/[profileId]` (index) | `index.tsx:743` | Child overview. Three modes via `?mode=` query param: default = subjects + recent sessions; `?mode=progress` = a single "progress nudge" card; `?mode=settings` = accommodation row, mentor-memory link, profile-details, **consent management (withdraw/restore)**. Subject cards tap → subjects screen. Consent withdraw schedules deletion (`:585-612`). |
| `child/[profileId]/curriculum` | `curriculum.tsx:158` | Browse child's subjects → tap → subjects screen. V1 gated via `navigationContract.canEnter` (`:189-199`). |
| `child/[profileId]/reports` | `reports.tsx:150` | Reports hub: latest weekly-report header summary + list of older weekly + monthly reports. Tap → weekly-report or report detail. |
| `child/[profileId]/report/[reportId]` | `report/[reportId].tsx:23` | Monthly report detail; marks viewed on mount. |
| `child/[profileId]/weekly-report/[weeklyReportId]` | `weekly-report/[weeklyReportId].tsx:76` | Weekly report detail; metric cards, practice summary; marks viewed; empty-week → opens NudgeActionSheet. |
| `child/[profileId]/subjects/[subjectId]` | `subjects/[subjectId].tsx:49` | Topics within a subject for the child + recent subject sessions. Tap topic → topic detail; tap session → session detail. |
| `child/[profileId]/topic/[topicId]` | `topic/[topicId].tsx:54` | Topic detail: status, understanding %, review status, recent fluency drills, session history, **AddToMyLearningButton**. Receives title/mastery/etc as query params (NaN-guarded `:109-136`). |
| `child/[profileId]/session/[sessionId]` | `session/[sessionId].tsx:44` | Session recap: narrative/highlight/engagement/"try asking" prompt (copyable), summary, homework help, **AddToMyLearningButton**, continue-topic CTA. |
| `child/[profileId]/mentor-memory` | `mentor-memory.tsx:56` | Manage what the mentor remembers about the child: collection/injection toggles, "Tell the mentor", interests, curated categories, hidden items, export, clear-all, "something else is wrong" correction. Consent-gated. |

### Proxy chrome
| Surface | File | Purpose |
|---|---|---|
| ProxyBanner | `apps/mobile/src/app/(app)/_components/ProxyBanner.tsx:11` | "PARENT PREVIEW — Viewing {name}" top banner with Switch-Back. Only when explicit proxy mode (`use-parent-proxy.ts:33`). |

---

## Capabilities (user task → backend process file:line)

| Task | UI entry | API route | Service (file:line) |
|---|---|---|---|
| View per-child overview / subjects | child index | `useChildDetail` → dashboard | `getChildDetail` `apps/api/src/services/dashboard.ts:1060` (consent-gated `assertChildDashboardDataVisible:310`) |
| View family dashboard (all children) | ParentHomeScreen | dashboard | `getChildrenForParent` `dashboard.ts:727`; `buildChildProgressSummariesBatch:516` |
| Browse child curriculum / subject topics | curriculum, subjects | child-subject-topics | `getChildSubjectTopics` `dashboard.ts:1267` (consent gate `:1275`) |
| View child sessions / session detail | recent sessions, topic | child sessions | `getChildSessions` `dashboard.ts:1359`; `getChildSessionDetail:1378` (both consent-gated) |
| View child inventory (subjects index) | subjects | child inventory | `getChildInventory` `dashboard.ts:1488` |
| View monthly reports + detail; mark viewed | reports, report detail | child reports | `getChildReports` `dashboard.ts:1516`; `getChildReportDetail:1528`; `markChildReportViewed:1545` |
| View weekly reports + detail; mark viewed | reports, weekly-report | weekly-report | (via `use-progress` hooks; backed by `weekly-report.ts`) |
| Manage child mentor memory (toggles, tell, delete, unsuppress, export, consent) | mentor-memory | `/learner-profile/:profileId/{collection,injection,memory-enabled,tell,item,all,unsuppress,consent,export-text,accommodation-mode}` | `apps/api/src/routes/learner-profile.ts:87-471`; service `apps/api/src/services/learner-profile.ts`. Every `:profileId` route gated by `assertOwnerAndParentAccess` + `assertChildDashboardDataVisible`. |
| Set child accommodation mode | child settings → accommodation | `/learner-profile/:profileId/accommodation-mode` | `learner-profile.ts:449`; `updateAccommodationMode` |
| Withdraw / restore child consent | child settings (ConsentManagementSection) | consent routes (via `use-consent`) | `apps/api/src/services/consent.ts` |
| Send parent→child nudge | NudgeActionSheet (home, weekly-report) | `POST /nudges` | `createNudge` `apps/api/src/services/nudge.ts:77` (parent-access + consent + rate-limit + quiet-hours; push via `sendPushNotification`). `assertNotProxyMode` at route `nudges.ts:35`. |
| "Add this to my learning" (clone child topic into parent library) | AddToMyLearningButton (topic, session, LearnTogether) | clone-from-child | `cloneTopicFromChild` `apps/api/src/services/family-bridge.ts:388`; snapshot `getChildTopicSnapshotForParent:98`; undo `undoCloneFromChild:553` (all `assertParentAccess`-gated) |
| Add a child profile | ParentHomeScreen add-child → `/create-profile?for=child` | `POST /profiles` | `createProfileWithLimitCheck` (gated `assertProfileCreationAllowed`) `apps/api/src/routes/profiles.ts:58-79` |
| Dismiss child-cap notification | ChildCapNotificationBanner | (via `use-child-cap-notifications`) | `dismissChildCapNotification` `apps/api/src/services/child-cap-notifications.ts:144`; list `listActiveChildCapNotifications:116` |
| Recaps surfaced on parent cards | ChildCommandCard / LearnTogether | recaps | `apps/api/src/services/recaps.ts` (via `useRecaps`) |

### Background / Inngest
| Process | File | Trigger |
|---|---|---|
| Notify parent on child cap hit | `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts:13` | event `app/billing.profile_quota.exhausted` → records a `childCapNotifications` row (`recordChildCapNotificationForAccount/Subscription` `child-cap-notifications.ts:180-201`) |
| Recall nudge (hourly) + send | `recall-nudge.ts:45`, `recall-nudge-send.ts:21` | **NOT the parent→child nudge** — this is a learner-facing SRS recall reminder. Distinct system from `nudges` table / NudgeActionSheet. (Overlap-naming hazard.) |

---

## Navigation depth map (taps from a tab root)

Tab root = guardian home (Home tab). Levels = pushes/taps.

| Capability | Path | Depth | Flag |
|---|---|---|---|
| See child status headline + starter | Home (ChildCommandCard) | **0–1** | — |
| Send a nudge | Home → Nudge button → sheet | **1** (modal) | — |
| Learn together (clone / starters) | Home → Learn together → sheet | **1** (modal) | — |
| Open child overview | Home → card identity row | **1** | — |
| Open child reports | Home → Reports button | **1** | — |
| Open child settings (consent/memory) | Home → avatar | **1** | — |
| Monthly report detail | Home → Reports → tap report | **2** | — |
| Weekly report detail | Home → Reports → tap weekly | **2** | — |
| Subject topics | Home → overview → subject card | **2** | — |
| Mentor-memory management | Home → avatar(settings) → mentor-memory row | **2** | — |
| Withdraw consent | Home → avatar(settings) → ConsentManagementSection → confirm alert | **2 + alert** | — |
| **Topic detail** | Home → overview → subject → topic | **3** ⚠️ | — |
| **Topic understanding / review status / drills** | (same as topic detail) | **3** ⚠️ | — |
| **Session detail from a topic** | Home → overview → subject → topic → session | **4** ⚠️⚠️ | — |
| **Add-to-my-learning (clone)** lives at depth 3–4 | topic/session detail | **3–4** ⚠️ | gated `showLearnThisToo` |
| Curriculum browse | Progress tab → child curriculum, OR via overview | **1–2** | V1 gated |
| Child reports from Progress tab | Progress → reports button | **1–2** | — |

Flagged (>2 levels): topic detail and everything inside it (drills, add-to-my-learning, session history), and session detail reached via the topic chain (4 deep). The same session detail is also reachable at depth 2 via overview→recent-sessions and depth 3 via subject→recent-sessions — inconsistent depth for one screen.

---

## Backend processes & data model

- **Authorization spine (consistent, well-enforced):** every parent-on-behalf action goes through `assertOwnerAndParentAccess` (isOwner gate + IDOR parent→child family-link check) `family-access.ts:126`, layered with `assertChildDashboardDataVisible` (consent read-gate) `dashboard.ts:310`. Self-routes that a proxy parent could abuse are blocked by `assertNotProxyMode` `proxy-guard.ts:34` (server-derived from `profileMeta.isOwner`, not the client header) and `assertCanManageOwnConsent` `family-access.ts:76` (minor non-owners cannot self-toggle consent).
- **Family link** = `familyLinks(parentProfileId, childProfileId)` (`hasParentAccess` `family-access.ts:26`). This single table defines the entire guardian relationship.
- **Nudges** = `nudges` table, rate-limited 4/24h with pg advisory lock, consent-checked, quiet-hours (21:00–07:00 child-local) suppressed, push via `sendPushNotification` (`nudge.ts:77-198`). Distinct from SRS recall-nudge.
- **Child caps** = `childCapNotifications` table, unique on (owner, child, kind, occurredOn), populated by the `app/billing.profile_quota.exhausted` Inngest fn; surfaced + dismissed on ParentHomeScreen.
- **Parent bridge (clone)** = `family-bridge.ts:388` resolves/creates subject→curriculum→book→topic in the **parent's** own library, tagging `source='parent_bridge'`, `sourceChildProfileId` (FK ON DELETE SET NULL — no PII in title `:351-359`). 60s idempotency cache; undo allowed only if no session started.
- **Consent withdrawal** schedules deletion with a grace period; ParentHomeScreen shows countdown, child index shows withdraw/restore + a hard "consent withdrawn" empty state (`index.tsx:939`, `mentor-memory.tsx:329`).
- **Proxy mode** is explicit-flag-only (`use-parent-proxy.ts:22-37`); normal child review uses parent-native `child/[profileId]/**` routes, NOT proxy. Proxy is a retained internal/test path.

---

## Complexity signals & redesign notes

1. **Same data surfaced through 3+ entry points with different depth.**
   - *Session detail* reachable from: child overview recent-sessions (depth 2), subject recent-sessions (depth 3), topic session-history (depth 4), and weekly-report CTA. One screen, four ancestor chains.
   - *Reports* reachable from: Home Reports button, Progress tab reports button, child overview is NOT a reports entry but weekly-report empty-state loops back. The weekly/monthly split inside `reports.tsx` is itself two report types in one list.
   - *Child overview* reachable via `childProfileHref` with three different `?mode=` variants (default/progress/settings) — one file, three personalities (`index.tsx:756-757`). This is a redesign smell: the "settings" mode buries consent + memory + accommodation behind a query param off the avatar tap.

2. **Deep nesting (4 levels) for high-value actions.** "Add this to my learning" (the headline parent→learner crossover feature) lives at depth 3–4 inside topic/session detail. A parent would rarely find it.

3. **Modal-on-modal / sheet proliferation.** ParentHomeScreen drives two distinct bottom sheets (NudgeActionSheet, LearnTogetherSheet) plus inline banners; weekly-report screen ALSO opens NudgeActionSheet. Nudge entry exists in ≥2 places with duplicated wiring.

4. **Mentor-memory is a dense second app.** `mentor-memory.tsx` (696 lines) packs 2 toggles + tell-mentor + interests-with-context + curated categories + hidden-items + export + clear-all + free-text correction. Buried at depth 2 off the avatar→settings mode. Almost certainly under-discovered.

5. **Consent management buried inside `?mode=settings`** on the child overview (`ConsentManagementSection` `index.tsx:558`). Withdraw/restore is a legally significant action reached only by tapping the child avatar (not the card body) on Home.

6. **Report-type redundancy.** Weekly reports + monthly reports are separate generation paths, separate detail screens, separate "mark viewed", separate empty/error states, merged into one `ReportsList`. Two cadences, ~2× the screens/states.

7. **Curriculum vs Subjects overlap.** `curriculum.tsx` and the subjects section of `index.tsx` render nearly the same subject list with the same tap target (`subjects/[subjectId]`). Curriculum adds little beyond a different header and a V1 gate.

8. **Three home shapes within ParentHomeScreen** (0 / 1 / 2+ children) each render different bottom regions (`:977-1042`) — heavy conditional UI in one component.

9. **Query-param-as-state for topic detail.** Topic detail receives title/mastery/retention/totalSessions as URL params and must NaN-guard them (`topic/[topicId].tsx:109-136`), implying these screens are deep-linkable but fragile — a one-screen redesign removes this class of bug.

---

## Overlaps with other domains

- **Progress domain:** the Progress tab is an alternate entry into `child/[profileId]/curriculum` and `child/[profileId]/reports` (`progress/index.tsx:448,616,645`). Progress for a child is shown on ParentHomeScreen (cards), child overview, subject screen (mastery bars), topic screen (understanding %), AND the Progress tab. `RecentSessionsList`, `RetentionSignal`, `MetricCard`, `PracticeActivitySummaryCard`, `ReportsList` are shared `components/progress/*` reused inside the child stack.
- **Recaps domain:** parent cards and LearnTogetherSheet consume `useRecaps`; session detail's "try asking" prompt overlaps recap content. The V1 nav redesign replaces own-learning+library with a `recaps` tab (CLAUDE.md), so guardian recaps will overlap that tab.
- **Memory domain:** `mentor-memory.tsx` is the child-scoped twin of the learner's own `more/mentor-memory`; same components (`mentor-memory-sections`, `tell-mentor-input`, `MemoryConsentPrompt`), same `learner-profile` service, differing only by `:profileId` vs self routes.
- **Consent / account-deletion domain:** consent withdraw/restore + grace-period deletion is surfaced here but owned by the consent service; child cap notifications tie into billing/quota (`app/billing.profile_quota.exhausted`).
- **Onboarding domain:** add-child routes to `/create-profile?for=child` (a non-`child/**` route) — the guardian "add child" action leaves this domain entirely.
- **Naming-collision hazard:** parent→child **nudges** (`nudges` table, NudgeActionSheet) vs learner **recall-nudge** (SRS, `recall-nudge*.ts` Inngest) — same word, unrelated systems.
