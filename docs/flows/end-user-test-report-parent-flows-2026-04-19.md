# End-User Test Report — Parent Flows — 2026-04-19

Live audit of the **new parental flows introduced on the `improvements` branch** via the Expo Web preview (`localhost:8081`), authenticated as the production account "Zuzana" (Parent) with linked child "TestKid".

This report mirrors the structure of `end-user-test-report-2026-04-18.md` and focuses only on the surfaces that were added or reshaped under the parent-visibility, parent-narrative, and progress-highlights specs. Findings are numbered `F-PV-xx` to keep the namespace separate from the main report.

## What's "new" on the parent side

Scope was derived from these commits on `improvements` and related specs:

| Commit | Scope |
|---|---|
| `73820b7d feat(api,mobile): remove transcript, add session detail endpoint [PV-S1]` | Privacy boundary — transcript endpoint removed; parent session detail now renders `displaySummary` only |
| `8a642f24 feat(schemas,api): add streak/XP fields to DashboardChild` | Streak & XP surfaced on dashboard |
| `8f63997c feat(api): add streak/XP queries + curated memory service [PV-S2/S3]` | Curated memory service |
| `16fdec07 feat(api,mobile): add curated memory route, streak/XP stats, hooks [PV-S2/S3]` | `GET /dashboard/children/:id/memory`, mobile stats row |
| `02a6edda feat(mobile): curated mentor memory view for parents [PV-S3]` | New mentor-memory screen with categorized items + escape hatch |
| `450fb25f docs: add parent-access RLS policies to Phase 2-4 plan [PV-S4/S5]` | RLS migration design (doc-only) |
| `45448a54 feat(api): lower milestone thresholds for early engagement [PEH-S1]` | Milestone thresholds `[1, 3, 5, …]` |
| `6ad4cf7c feat(api): session highlights service with injection break tests [PEH-S2, PEH-BT1-4]` | Session highlight pipeline |
| `68a2288c feat: code review fixes + parent narrative phase 1` | Parent narrative: narrative / highlight / conversationPrompt / engagementSignal + DB migration 0034 |

Corresponding specs:
- `docs/specs/Done/2026-04-18-parent-visibility-privacy-design.md`
- `docs/specs/Done/2026-04-18-progress-empty-states-highlights-design.md`
- `docs/specs/Done/2026-04-10-parent-report-empty-state-design.md`

## Test environment

- **Surface:** Expo Web preview via `.claude/launch.json` `mobile` target.
- **Auth:** Pre-existing Clerk session for the owner "Zuzana".
- **API:** `https://api-stg.mentomate.com` (staging worker).
- **Active child link:** `TestKid` (`019da076-0104-7762-88ce-770beeac8e75`).
- **Caveats:** Web has no SecureStore/camera/mic/TTS/IAP/push. Alert.alert is a no-op on web — withdraw-consent and memory-deletion confirm dialogs can't be exercised live.
- **Data discipline:** Read-only. No destructive mutations (no withdraw-consent, no memory-item deletion, no settings toggles).

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Tested live — works as expected |
| ⚠️ | Tested live — issue found (see Findings) |
| 🔴 | Tested live — broken or blocked |
| 🔍 | Inspected via code/spec only |
| ⏭️ | Not yet tested |

## Coverage map

### Parent Gateway (Home for parent profiles)
| ID | Flow | Status | Notes |
|---|---|---|---|
| PG-01 | Parent gateway renders on profile switch to parent | ✅ | `parent-gateway` test-id present. Greeting "Good afternoon, Zuzana!" + subtitle "Weekend learning? Nice!" — Saturday variant of `getGreeting`. |
| PG-02 | `gateway-check-progress` CTA with child highlight | ⚠️ | Renders "No activity this week" when `totalTimeThisWeek === 0`. See **F-PV-01** — copy drops the child's name in the zero-activity branch, which becomes ambiguous for accounts with multiple children. |
| PG-03 | `gateway-learn` CTA routes to /create-subject | ✅ | Confirmed — parent ends up on their OWN create-subject flow with their existing subjects ("Continue General Studies / Spanish / History / Geography / Start Math …"). By design — parent is also a learner. |
| PG-04 | Profile switcher chip opens menu | ✅ | `profile-switcher-chip` → `profile-switcher-menu` with `profile-option-{id}` rows and ✓ marker on active profile. |
| PG-05 | Dashboard error fallback on gateway | 🔍 | `parent-dashboard-error` renders via `isError` branch in `ParentGateway.tsx:85-100`. Cannot be triggered live without breaking staging. |

### Parent Dashboard (`/dashboard`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| PD-01 | Dashboard loads for linked parent | ✅ | `GET /v1/dashboard` → 200. Renders `← Back / Child progress / How your children are doing` and one `parent-dashboard-summary` card for TestKid. |
| PD-02 | Dashboard response shape carries streak/XP | ✅ | Response includes `currentStreak: 1, longestStreak: 1, totalXp: 0` per PV-S2. Confirmed via network tap. |
| PD-03 | Retention-trends teaser copy | ⚠️ | `parent-dashboard-teaser` renders "After 3 more sessions, you'll see TestKid's retention trends and detailed progress here." — but the progress snapshot is ALSO rendered below, so the teaser copy reads as stale. See **F-PV-02**. |
| PD-04 | `engagementTrend` / `retentionTrend` correctness | ⚠️ | TestKid has 1 lifetime session yet the dashboard returns `retentionTrend: 'improving'` AND `progress.engagementTrend: 'declining'` in the SAME response. See **F-PV-03** — both signals are premature/false at N=1. |
| PD-05 | `parent-dashboard-summary-primary` drill-down | ✅ | `View details` navigates to `/child/:profileId`. |
| PD-06 | Dashboard back button | ✅ | `dashboard-back` → `/home`, implemented via `goBackOrReplace`. |
| PD-07 | Refresh control | 🔍 | Pull-to-refresh wired to `refetch()` — can't trigger cleanly on web. |
| PD-08 | Empty state (no children) | 🔍 | `dashboard-empty` copy "No children linked yet. Add a child profile…" — parent has a linked child, not reachable. |
| PD-09 | Dashboard demo / preview banner | 🔍 | `demo-banner` + `demo-link-child-cta` gated on `dashboard.demoMode === true`. Real dashboard returns `demoMode: false`. |

### Child Detail (`/child/[profileId]`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| CD-01 | Child detail screen renders | ✅ | Shows header, streak/XP stats, Visible progress, Monthly reports card, Recent growth, Subjects, Recent Sessions, Mentor Memory link, Learning Accommodation radio, Consent section. |
| CD-02 | Streak & XP stats row [PV-S2] | ⚠️ | `streak-xp-stats` container renders "1-day streak" (flame icon) when `currentStreak > 0`. XP text is hidden because `totalXp === 0`. See **F-PV-04** — the "1-day streak / 0 XP" combination on the dashboard drills into child detail showing a streak but no XP, which reads as "credit for existing without credit for learning" when both values come from the same Inngest `update-dashboard` step. |
| CD-03 | Plural/copy grammar | ⚠️ | Mathematics subject card reads **"1 sessions"** (missing pluralization). See **F-PV-05**. |
| CD-04 | Subject drill-down | 🔴 | **Critical.** Tapping `subject-card-…` navigates to `/child/:id/subjects/:subjectId?subjectName=Mathematics` and the screen renders `topics-load-unknown` with "Topics could not be loaded. Tap to try again." `GET /v1/dashboard/children/:id/subjects/:subjectId` returns **500 INTERNAL_ERROR / "Too many subrequests by single Worker invocation"**. See **F-PV-06** — Cloudflare Workers subrequest limit hit. Retry from the fallback screen does not change the outcome (same endpoint). This blocks every parent who taps through to a child's subject. |
| CD-05 | Subject retention pills | ✅ | Dashboard subject list renders correct retention tokens for Biology (strong) + Mathematics (strong). |
| CD-06 | Monthly reports empty state [parent-report-empty-state design] | ✅ | `child-reports-link` → `child-reports-empty` with copy "Your first report is on its way / Reports are generated on the 1st of each month, summarizing your child's learning from the previous month. TestKid's first report will arrive on May 1, 2026 / Your first report arrives in about 12 days / See TestKid's progress now / You'll get a push notification when the report is ready." Testids present: `child-reports-back`, `child-reports-empty`, `child-reports-empty-time-context`, `child-reports-empty-progress`. |
| CD-07 | Growth chart empty state | ✅ | `Recent growth / Weekly changes in topics mastered and vocabulary / Progress becomes easier to spot after a few more sessions.` Empty state copy present. |
| CD-08 | Recent Sessions empty state | ⚠️ | "No sessions yet. When TestKid starts learning, you'll see what they work on here." — however `dashboard.totalSessions = 1` for this child. See **F-PV-07** — `/dashboard/children/:id/sessions` returned `{sessions: []}` while the dashboard summary reports 1 session. Either summary-less sessions are filtered out of the list (and the counter should align) or a session without a summary row leaks into the aggregate count. |
| CD-09 | Accommodation mode radio | ✅ | Four options render with "Active" label on the user's current selection (Audio-First). Did not tap — would mutate. |
| CD-10 | Memory consent prompt (in-place) | ⚠️ | `memory-consent-grant` / `memory-consent-decline` render inline on child-detail (and again on mentor-memory). Gated on `learnerProfile.memoryConsentStatus === 'pending'`. See **F-PV-08** — the prompt duplicates in two locations and the associated flags are internally inconsistent (see below). |
| CD-11 | IDOR guard | ✅ | `useProfile.profiles.some(p => p.id === profileId)` — code path present in `index.tsx:140-143` + `mentor-memory.tsx:175-200`. Per BUG-382. Not driven live from a foreign ID because browser has no foreign child. |
| CD-12 | Consent section & withdraw button | ✅ | `consent-section` + `withdraw-consent-button` present for `CONSENTED` status. Did not tap — destructive, `platformAlert` no-op on web. Code path opens native alert with "Withdraw / Cancel" + 7-day grace. |
| CD-13 | Child detail "Profile no longer available" state | 🔍 | `child-profile-unavailable` renders when `child === null && !isLoading` OR `isError`. Has both primary (Back to dashboard) action — good. Not reachable on web without breaking staging. |

### Curated Mentor Memory (`/child/[profileId]/mentor-memory`) [PV-S3]
| ID | Flow | Status | Notes |
|---|---|---|---|
| CM-01 | Screen loads via `mentor-memory-link` | ✅ | `GET /v1/dashboard/children/:id/memory` → 200. Response shape matches spec: `{memory: {categories[], parentContributions[], settings{memoryEnabled, collectionEnabled, injectionEnabled, accommodationMode}}}`. |
| CM-02 | Settings toggles render | ✅ | "Learn about this child" (collectionEnabled: false) and "Use what the mentor knows" (injectionEnabled: true) — both Switch controls visible. Did not toggle. |
| CM-03 | Tell-the-mentor input | ✅ | `TellMentorInput` rendered with "Add something important for the mentor to remember about TestKid. / Save". |
| CM-04 | Empty-categories state | ✅ | "No learning observations yet. As TestKid uses the app, the mentor will learn about their preferences and pace." Matches spec copy. |
| CM-05 | Something-else-is-wrong escape hatch | ✅ | `something-wrong-button` visible at bottom, expands to `correction-input` + `correction-submit`. Submits `[parent_correction] …` via `POST /learner-profile/:id/tell`. |
| CM-06 | Privacy section — Export | ✅ | "Export mentor memory summary" button calls `GET /learner-profile/:id/export-text` then `Share.share`. Native-only share; web falls back to platformAlert on error. |
| CM-07 | Privacy section — Clear all | ✅ | "Clear all mentor memory" visible. Did not tap — destructive. Confirm-dialog is `platformAlert` (web no-op). |
| CM-08 | Suppressed inferences UI | 🔍 | `CollapsibleMemorySection "Hidden Items"` only renders when `profile.suppressedInferences.length > 0`. Child has empty array — not reachable. |
| CM-09 | Memory-state flag consistency | ⚠️ | Returned state: `memoryEnabled:true, memoryConsentStatus:'pending', collectionEnabled:false, injectionEnabled:true`. See **F-PV-09** — injection is on while consent is still pending and collection is off; semantics are defensible but confusing. |

### Child Session Detail (`/child/[profileId]/session/[sessionId]`) [PV-S1 + parent narrative]
| ID | Flow | Status | Notes |
|---|---|---|---|
| CS-01 | `session-not-found` state | ✅ | Live-tested via direct URL with fake sessionId → API returned 404 `{"error":"Session not found"}` → screen rendered `session-not-found` with icon + copy "This session is no longer available." + Go Back button. Single-action escape; no trailing dead-end. |
| CS-02 | Retry + Go Back on `isError` | 🔍 | Code path at `session/[sessionId].tsx:82-108` — `retry-session` + `error-go-back` testids, both primary and secondary actions per the UX Resilience rules. Not triggerable live. |
| CS-03 | Metadata row (duration + type) | 🔍 | `session-metadata` testid — reachable only when a real summarized session exists. TestKid has none. |
| CS-04 | Narrative / Highlight / Engagement / Conversation prompt panels | 🔍 | Code verified at `session/[sessionId].tsx:185-246` — four separate panels render via `session.narrative`, `session.highlight`, `session.engagementSignal`, `session.conversationPrompt`. All four originate in the `generate-session-highlight` Inngest step. Not reachable without a session with `exchangeCount >= 3` whose highlight pipeline has completed. |
| CS-05 | `copy-conversation-prompt` | 🔍 | `Clipboard.setStringAsync(session.conversationPrompt)` with `Copied ✓` / `Copy failed` / `Copy` label cycle + 2s auto-reset. Web clipboard API works, but no real session to exercise. |
| CS-06 | `narrative-unavailable` fallback | 🔍 | Renders when none of narrative/highlight/prompt/engagement are populated — backfill gap for pre-PEH sessions. Has single action (Go Back). Not reachable live. |
| CS-07 | Transcript section removed | ✅ | Screen no longer fetches `/transcript`. Grep confirms `ChildSessionTranscript`, `TranscriptExchange`, `getChildSessionTranscript` are absent from `apps/mobile/src/app/(app)/child/[profileId]/session/` and from route files. Matches PV-S1 cleanup. |

### Child Subject & Topic Drill-Down
| ID | Flow | Status | Notes |
|---|---|---|---|
| CST-01 | Subject topics list | 🔴 | Blocked by **F-PV-06** (500 from `/subjects/:id`). Cannot list topics for a subject. |
| CST-02 | Topic detail | ⏭️ | Unreachable until CST-01 is fixed. Code path at `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx` reads `useChildSessions` and parent-vocab helpers; signal pills via `RetentionSignal parentFacing`. |

### Engagement Chip Component [PN-1]
| ID | Flow | Status | Notes |
|---|---|---|---|
| EC-01 | Renders one of 5 signals | 🔍 | `curious / stuck / breezing / focused / scattered` → icon + label + themed pill (`engagement-chip-{signal}` testid). Logic lives in `apps/mobile/src/components/parent/EngagementChip.tsx`. No live session carries `engagementSignal` yet, so visual rendering is code-only this pass. |
| EC-02 | Accessibility | 🔍 | `accessibilityRole="text"` + `accessibilityLabel="Engagement: {Label}"` — good for screen readers. |

### Progress Highlights & Milestones [PEH-S1]
| ID | Flow | Status | Notes |
|---|---|---|---|
| PH-01 | Milestone thresholds lowered to start at 1 | ⚠️ | `apps/api/src/services/milestone-detection.ts` has new arrays starting at 1/3/5 for SESSION_THRESHOLDS, 1/3 for TOPIC_THRESHOLDS, 3 for STREAK_THRESHOLDS. But Zuzana (the parent-as-learner, 7 lifetime sessions) sees "Recent milestones / Complete your first session to earn your first milestone / Keep learning". See **F-PV-10** — either milestones were not backfilled for pre-spec users, or the empty-state copy is fired even when the API simply hasn't caught up. |
| PH-02 | Celebration throttle ≤ 2 per session | 🔍 | Code behaviour per spec; not exercised — would require completing a session end-to-end. |

### Parent API — Privacy Break Tests
| ID | Probe | Status | Notes |
|---|---|---|---|
| BT-01 | `GET /dashboard/children/:id/sessions/:sid/transcript` | ✅ | Returns **`404 Not Found`** (plain text) — route truly removed from Hono, not left as an empty handler. Matches PV-S1 spec. |
| BT-02 | `GET /dashboard/children/{foreign-child-uuid}/memory` | ✅ | Returns **403 FORBIDDEN** `{"code":"FORBIDDEN","message":"You do not have access to this child profile."}` — `assertParentAccess` enforces isolation. |
| BT-03 | `GET /dashboard/children/:id/memory` (own child) | ✅ | Returns **200** with curated shape `{memory:{categories:[],parentContributions:[],settings:{memoryEnabled, collectionEnabled, injectionEnabled, accommodationMode}}}`. |
| BT-04 | `GET /dashboard/children/:id/sessions/{fake-uuid}` (non-existent session) | ✅ | Returns **404** `{"error":"Session not found"}` — JSON 404 body, screen handles via `session-not-found`. |
| BT-05 | `GET /dashboard/children/:id/subjects/:sid` | 🔴 | **500 INTERNAL_ERROR** — see **F-PV-06**. Not a privacy issue, but a correctness issue. |
| BT-06 | RLS policies for `family_links` / parent-read subquery | ⏭️ | RLS Phase 2-4 migration still pending — this pass can't verify DB-level isolation. Spec (Sections 4-5) is documented; implementation is separate. |

---

## Findings (running list)

> Severity: 🔴 high · 🟡 medium · 🟢 low · 🔵 info-only · 🌐 web-only artifact.

### F-PV-01 🟢 Parent gateway "No activity this week" drops the child's name
- **Where:** `apps/mobile/src/components/home/ParentGateway.tsx:23-28` — `getChildHighlight`.
- **Observed:** Subtitle on `gateway-check-progress` card shows `No activity this week` (no child name) when `totalTimeThisWeek === 0`. When there IS activity, the copy correctly says "TestKid practiced N min this week".
- **User impact:** For accounts with multiple children, a "No activity this week" subtitle without naming the child is ambiguous — the parent can't tell which child is quiet from the gateway alone.
- **Suggested fix:** Render `${child.displayName} hasn't practiced this week` (or similar) in the zero-activity branch, consistent with the other branch.

### F-PV-02 🟡 `parent-dashboard-teaser` fires alongside populated progress snapshot
- **Where:** `parent-dashboard-teaser` row on `/dashboard`.
- **Observed:** The teaser reads "After 3 more sessions, you'll see TestKid's retention trends and detailed progress here." yet the card already shows the progress snapshot (`0 topics mastered`, guidance line "Quiet week — maybe suggest a quick session on Biology?"). The teaser's promise is redundant at best and misleading at worst — retention trends ARE already being surfaced (`retentionTrend: 'improving'` is in the payload).
- **User impact:** Parent sees mixed signals — "retention trends are N sessions away" while retention-trend-driven copy is already showing.
- **Suggested fix:** Hide the teaser once `totalSessions >= N` or once `progress` is non-null. Alternatively tighten the copy so it only talks about detailed charts, not trends.

### F-PV-03 🟡 Premature `retentionTrend` / `engagementTrend` at N=1
- **Where:** `GET /v1/dashboard` response for TestKid.
- **Observed:** `totalSessions: 1`, yet `retentionTrend: 'improving'` and `progress.engagementTrend: 'declining'` — two conflicting signals in the same payload, at a sample size that cannot support either. Dashboard rendered "0-day streak" for Zuzana and "Quiet week — maybe suggest a quick session on Biology?" for TestKid.
- **User impact:** "Improving" + "declining" in the same frame is not informative. At N=1 both trends are effectively noise; they should be gated on a minimum sample.
- **Suggested fix:** Require `totalSessions >= 3` (or `sessionsThisWeek + sessionsLastWeek >= 2`) before returning a non-"stable" trend value. Keep the trend columns populated internally but serialize them as `null` or `"insufficient_data"` to the client until the threshold is met.

### F-PV-04 🟢 "1-day streak / 0 XP" paradox visible on child detail
- **Where:** `streak-xp-stats` row in `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:352-374`.
- **Observed:** `currentStreak: 1` renders the flame + "1-day streak", while `totalXp: 0` hides the XP chip entirely. Visually the parent sees a streak without XP — a logical inconsistency because both fields are populated by the same `update-dashboard` Inngest step after a completed session.
- **User impact:** Mild — parents will read "1-day streak" as success but "0 XP" as nothing happened. The inconsistency hints at an upstream issue: the single completed session likely credited the streak but did not award XP (possibly an ended-early or zero-exchange session).
- **Suggested fix:** Either (a) don't credit streak days for sessions that also fail to award XP, or (b) surface a single cohesive stat row ("1 day · 0 XP") so the parent isn't left guessing.

### F-PV-05 🟢 Copy bug: "1 sessions" on subject card
- **Where:** `apps/mobile/src/components/progress/SubjectCard.tsx` (the Mathematics subject card on child detail).
- **Observed:** Renders "1 sessions" when `sessionCount === 1`. Should be "1 session".
- **User impact:** Minor copy polish.
- **Suggested fix:** Standard `{count} session{count === 1 ? '' : 's'}` pluralization.

### F-PV-06 🔴 Child subject drill-down hits Cloudflare Workers subrequest limit
- **Where:** `GET /v1/dashboard/children/:profileId/subjects/:subjectId`.
- **Observed:** Returns `500 {"code":"INTERNAL_ERROR","message":"Error connecting to database: Too many subrequests by single Worker invocation. To configure this limit, refer to https://developers.cloudflare.com/workers/wrangler/configuration/#limits"}`. The mobile screen handles this gracefully (`topics-load-unknown` with Retry) — but Retry hits the same endpoint and fails again.
- **User impact:** Every parent who taps a subject card from the child detail sees a hard error. This is the primary drill-down path for the parent→child→subject→topic flow, which is the core value proposition of the visibility spec.
- **Likely cause:** `getChildSubjectTopics` (or whatever powers this route) is issuing per-topic queries in a loop rather than a single batched query, exceeding the 50-subrequest-per-invocation limit. The dashboard summary route does not hit this limit because it aggregates at the child level.
- **Suggested fix:** Profile the route, collapse the N+1 into a single JOIN (topics + mastery + sessions aggregates), or page the topics list. Add a break test that calls the endpoint with a subject that has ≥ 15 topics to prevent regression.

### F-PV-07 🟡 `dashboard.totalSessions` and `getChildSessions` disagree
- **Where:** `GET /v1/dashboard` returns `children[0].totalSessions: 1`, while `GET /v1/dashboard/children/:id/sessions` returns `{sessions: []}`. The child detail screen's "Recent Sessions" renders "No sessions yet. …" despite the dashboard claiming one session.
- **User impact:** Parent reads the dashboard and sees "1 session" (via `totalSessions`) but the detail screen says the child hasn't started. Two sources, same profile, different answers.
- **Likely cause:** The aggregate count includes non-summarized / incomplete sessions (e.g., sessions that never ran `session-completed` Inngest), while the list endpoint filters to sessions with `session_summaries` rows only.
- **Suggested fix:** Pick one definition of "session" and use it everywhere. If the list is rightly filtered to summarized sessions, the dashboard aggregate should be `completedSessions` / `summarizedSessions`, not `totalSessions`. Otherwise the list should include a minimal placeholder row for unsummarized sessions.

### F-PV-08 🟢 Memory-consent prompt duplicates across child detail and mentor-memory screens
- **Where:** `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:631-668` AND `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:229-266`. Both gate on `profile?.memoryConsentStatus === 'pending'`.
- **Observed:** The parent sees `memory-consent-grant` / `memory-consent-decline` on child detail AND on mentor-memory. Tapping Grant on one would dismiss both, but until then the prompt appears twice.
- **User impact:** Minor — double prompting feels naggy. More importantly, there's no single "source of truth" for where the parent grants consent.
- **Suggested fix:** Render the prompt only on the mentor-memory screen (the authoritative settings surface); on child detail, replace it with a single CTA "Set up mentor memory →" that deep-links into mentor-memory.

### F-PV-09 🟡 Memory flags internally inconsistent while consent is `pending`
- **Where:** `GET /learner-profile/:id` returns `memoryEnabled: true, memoryConsentStatus: 'pending', memoryCollectionEnabled: false, memoryInjectionEnabled: true`. `GET /dashboard/children/:id/memory` mirrors `collectionEnabled:false, injectionEnabled:true`.
- **Observed:** The system is *injecting* whatever memory exists (empty bag today) while *not collecting* new memory — and the parent hasn't granted consent yet. The mentor-memory toggles reflect this faithfully but the combination is confusing: "Use what the mentor knows" is ON, "Learn about this child" is OFF, and the banner above it says "Help the mentor learn about TestKid" (which is the collection pitch).
- **User impact:** Parent can't easily reason about what state memory is in. In the worst case they assume collection is on because the consent prompt is present, but it isn't.
- **Likely cause:** `memoryEnabled` (global master), `memoryConsentStatus` (GDPR flag), `memoryCollectionEnabled` (write), `memoryInjectionEnabled` (read) are four orthogonal flags that can disagree.
- **Suggested fix:** Make consent status the gate for both collection AND injection — if `memoryConsentStatus !== 'granted'`, force both flags to `false`. Otherwise add a derived `memoryState: 'pending' | 'active' | 'read_only' | 'off'` that the client can render cleanly, so the three Switches aren't the source of truth.

### F-PV-10 🟡 Lowered milestone thresholds don't backfill existing users
- **Where:** `/(app)/progress` for Zuzana (parent-as-learner, 7 completed sessions).
- **Observed:** Under the new `SESSION_THRESHOLDS = [1, 3, 5, 10, 25, 50, 100, 250]`, Zuzana should have crossed the 1-, 3-, and 5-session milestones already. The Milestones strip shows "Complete your first session to earn your first milestone" anyway — API returned no milestones.
- **User impact:** Users who onboarded before the lowered thresholds shipped don't benefit. The "honest over inflated" design principle is undermined — we lowered thresholds precisely for early-users, but they can only cross them after ONE MORE session.
- **Suggested fix:** Run a one-shot backfill migration: for every `(profile_id, session_count)` row, insert `celebrations` rows for every threshold the session_count now meets. This is safer than retroactive toasts — the celebrations screen/list fills in without spamming users.

### F-PV-11 🔵 Transcript route is now gone — plain-text 404 vs. JSON 404
- **Where:** `GET /dashboard/children/:id/sessions/:sid/transcript`.
- **Observed:** Hono returns **plain-text** `404 Not Found`, not the JSON shape used by sibling routes. This is Hono's default for unmatched paths, and actually serves as useful evidence that the route is truly *removed* (not stubbed or left dangling). Informational.
- **User impact:** None — no mobile code still references this path; any bookmarked URL an old parent might have hits the plain-text 404 in the browser only.

### F-PV-12 🔵 `celebrations/pending?viewer=child` fires before profile-switch lands
- **Where:** Network tap showed `GET /v1/celebrations/pending?viewer=child` firing once before the profile switch to Zuzana completed; after the switch, `?viewer=parent` fires on the child-detail screen. No incorrect data ended up on screen.
- **User impact:** None observed — one extra stale call during the switch. Flagging in case it matters for quota accounting.

---

## Summary by area

| Area | Status | Confidence |
|---|---|---|
| Privacy boundary (transcript removed) | ✅ Enforced | High — break test passed |
| Parent-access guard on `/memory` | ✅ Enforced | High — 403 on foreign child |
| Streak & XP surfaced on dashboard | ✅ Works | High |
| Curated mentor memory endpoint | ✅ Works | High — shape matches spec |
| Mentor-memory "Something else wrong" escape hatch | ✅ Wired | Medium — not submitted live |
| Parent session detail (summary/narrative/engagement) | ⏭️ Needs real session | Medium — code verified, no live data |
| EngagementChip rendering | 🔍 Code-only | Medium |
| Monthly reports empty state | ✅ Renders | High |
| Parent subject drill-down | 🔴 **Broken** | High — reproducible 500 |
| Trend signals at low N | ⚠️ Noisy | High — F-PV-03 reproducible |
| Milestone backfill for existing users | ⚠️ Missing | High — F-PV-10 reproducible |
| Memory flag state machine | ⚠️ Confusing | Medium — F-PV-09 |
| Data consistency (totalSessions vs. list) | ⚠️ Disagrees | High — F-PV-07 reproducible |
| Web accessibility / copy polish | 🟢 Minor | — F-PV-01, F-PV-04, F-PV-05, F-PV-08 |

## Priorities for next pass

1. **F-PV-06 (🔴):** Fix the `GET /dashboard/children/:id/subjects/:subjectId` subrequest blowout. This silently breaks the primary parent drill-down the spec was written for.
2. **F-PV-10 (🟡):** Backfill milestones for existing users so the lowered thresholds actually land.
3. **F-PV-07 (🟡):** Align `totalSessions` with the sessions list — pick one definition and propagate.
4. **F-PV-03 (🟡):** Gate `retentionTrend` / `engagementTrend` on a minimum-sample threshold before serializing non-stable values.
5. **F-PV-09 (🟡):** Collapse the four memory flags into a single derived state the UI can render cleanly.
6. **F-PV-02, -04, -05, -08, -01 (🟢):** Copy & duplication polish — low effort, visible win.
7. **Follow-up:** Once a TestKid session with `exchangeCount >= 3` lands, come back and live-verify CS-04 (narrative / highlight / engagement / conversation prompt panels) + EC-01 (EngagementChip pill rendering).
