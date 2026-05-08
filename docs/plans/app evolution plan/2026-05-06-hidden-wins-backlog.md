# Hidden Wins Backlog

**Date:** 2026-05-06
**Last verified:** 2026-05-08 (full codebase audit)
**Status:** Active backlog
**Companion to:** `2026-05-06-learning-product-evolution-audit.md`
**Branch context:** discovered during the codebase verification pass behind the learning-product-evolution audit

## What This Doc Is

Items the codebase has **already built** but that are not visible to users today. Each one has a small product question attached: "do we want to expose this, and if so when?" — that's why these items don't go in the dead-code cleanup PR.

**Companion deletion:** A small cleanup PR landed alongside this doc, removing four orphan files (`BookRow.tsx`+test, `LibraryEmptyState.tsx`+test) and unused props on `BookCard.tsx`. Those were strict deletions with no product question. Everything below has a decision attached.

## How to Use This Doc

Each entry has the same shape:
- **What's there** — concrete file path or schema field
- **Decision needed** — the product call, framed as a yes/no or pick-one
- **If yes, size** — XS/S/M from the audit's size key
- **Why it matters** — one-line value or risk

Pick items by ratio: high "why matters" + low size = ship. Don't bundle items into "redesigns" — each one is independent.

## Priority Tiers

- **P0** — privacy / safety / shipped-but-broken state. Address regardless of slice.
- **P1** — hidden value with a clear user benefit, small size.
- **P2** — nice to surface, larger or unclear product fit.
- **P3** — flag exists for a feature that may or may not be wanted; needs explicit kill-or-keep call.

---

## Parent / Family / Child Surfaces

### P0 — Decide visibility rule for non-active consent states (precondition for badge)

**Status as of 2026-05-08: DONE** — `dashboard.ts:231-278`, commit `7567a23b`. `isChildLearningDataVisible()` returns `false` for PENDING, PARENTAL_CONSENT_REQUESTED, and WITHDRAWN. `redactDashboardChild()` zeros out all learning metrics. Mobile respects it in `ParentDashboardSummary.tsx:276-288`.

- **What's there:** `apps/api/src/services/dashboard.ts:832` returns `consentStatus` alongside `exchangesThisWeek`, `engagementTrend`, `currentStreak`, `totalXp` for every child in the same payload — no gating on consent state. Memory note `project_parent_visibility_spec.md` flags an unimplemented parent-privacy/RLS spec.
- **Decision needed:** When a child's consent is `withdrawn` or `pending`, what does the parent see? Options: (a) block the row entirely, (b) coarsen — show name + status only, no metrics, (c) show full data with a banner. This is a data-visibility rule, not a UI badge.
- **If yes, size:** XS (decision + spec) → drives implementation size of the gating itself
- **Why it matters:** A badge on top of unrestricted data is theatre. The badge below is downstream of this decision.

### P1 — Consent badge on family-summary card (downstream of the visibility rule above)

**Status as of 2026-05-08: DONE** — `ParentDashboardSummary.tsx:256-275`. Danger/red badge with `testID="consent-status-badge"`, maps PENDING/PARENTAL_CONSENT_REQUESTED/WITHDRAWN to i18n keys via `consentStatusLabelKey()`.

- **What's there:** Same field as above. Currently a withdrawn-consent or pending-consent child looks identical to a healthy one on the family card.
- **Decision needed:** Once the visibility rule is set, render its outcome — badge / color / status pill / hidden row.
- **If yes, size:** S
- **Why it matters:** Whatever the visibility rule is, the parent should see it on the card without drilling in.

### P1 — Engagement trend not rendered

**Status as of 2026-05-08: DONE** — `ParentDashboardSummary.tsx:291-301`. Renders as a trend chip with MetricInfoDot (`testID="engagement-trend-chip"`). Gated: only shows when `showFullSignals && !hasRestrictedConsent`.

- **What's there:** `engagementTrend: 'increasing' | 'stable' | 'declining'` is computed in `apps/api/src/services/dashboard.ts:502`, typed through to `ParentDashboardSummary.tsx:37` and `family.tsx:78`. No render path.
- **Decision needed:** Add a trend chip on the family summary card.
- **If yes, size:** XS
- **Why it matters:** Single most parent-meaningful signal we already compute — answers "is my kid still engaged."

### P1 — Exchange-count week-over-week deltas hidden

**Status as of 2026-05-08: DONE** — `ParentDashboardSummary.tsx:302-310`. `exchangeDelta` calculated at line 243; rendered as `"{signedDelta(exchangeDelta)} exchanges"` chip with MetricInfoDot (`testID="exchange-delta-chip"`).

- **What's there:** `exchangesThisWeek` / `exchangesLastWeek` computed at `apps/api/src/services/dashboard.ts:737-762`, returned at lines 839-840. No mobile component reads them.
- **Decision needed:** Render as "+N this week" or sparkline on the family summary card.
- **If yes, size:** XS

### P1 — Guided-vs-immediate ratio computed, never shown

**Status as of 2026-05-08: DONE** — `ParentDashboardSummary.tsx:311-321`. `guidedPercent = Math.round(guidedVsImmediateRatio * 100)` rendered as `"{guidedPercent}% guided"` when > 0 (`testID="guided-ratio-chip"`).

- **What's there:** `guidedVsImmediateRatio` via `calculateGuidedRatio` (`apps/api/src/services/dashboard.ts:848`).
- **Decision needed:** Surface as "X% guided this week" or skip — depends on whether the metric is parent-meaningful. Possibly belongs behind an info tooltip rather than a primary metric.
- **If yes, size:** XS

### P1 — Streak / XP on family summary (drill-down only today)

**Status as of 2026-05-08: DONE** — `family.tsx:74-76` declares `currentStreak`/`longestStreak`/`totalXp`; `ParentDashboardSummary.tsx:322-337` renders them as `"{currentStreak}-day streak • {totalXp} XP"` when either > 0 (`testID="streak-xp-chip"`).

- **What's there:** `currentStreak`, `longestStreak`, `totalXp` returned in the dashboard payload but `family.tsx`'s local type doesn't declare them. Drill-down `child/[profileId]/index.tsx` (lines 341–365) renders streak + XP only.
- **Decision needed:** Mirror at least `currentStreak` on the family card (XP optional).
- **If yes, size:** XS

### P1 — `MetricInfoDot` tooltips not on family summary

**Status as of 2026-05-08: DONE** — `ParentDashboardSummary.tsx:16` imports `MetricInfoDot`; used 4× at lines 299, 309, 319, 335 alongside each chip.

- **What's there:** `MetricInfoDot.tsx` exists with `PARENT_METRIC_TOOLTIPS` vocabulary. Wired in session-detail and child-detail. Top-level family summary screen has no tooltips.
- **Decision needed:** Add to family summary so parents who never drill down can still understand metrics.
- **If yes, size:** XS

### P2 — "How it's working" badge waiting on a screen that doesn't exist

**Status as of 2026-05-08: TODO** — No evidence of this badge or an analytics detail screen in `child/[profileId]/index.tsx` around lines 698-711. The code at that location shows mentor-memory setup CTAs; the badge and its placeholder comment appear to have been removed without replacement.

- **What's there:** `child/[profileId]/index.tsx` lines 698–711: a non-pressable badge with the explicit comment *"analytics detail screen is not yet built. Using View (not Pressable) prevents a silent dead-end tap."*
- **Decision needed:** Build the analytics detail screen, OR remove the badge entirely.
- **If yes, size:** M (build) / XS (remove)
- **Why it matters:** The current state is a UI placeholder for promised functionality. Either honor the promise or stop making it.

### P2 — `SamplePreview` blur with no upgrade action

**Status as of 2026-05-08: TODO** — `SamplePreview.tsx` is still a View with overlay text and no `onPress`. Used as a teaser for new learners (no sessions yet) and growth chart preview. Upgrade trigger and intent remain unresolved.

- **What's there:** `apps/mobile/src/components/parent/SamplePreview.tsx` blurs child content with an "unlock" message but has no `onPress` or upgrade link. Used in `ParentDashboardSummary.tsx` line 285 and `child/[profileId]/index.tsx` line 425.
- **Prerequisite:** Identify what triggers the blur today — tier gate (Free can't see)? Consent gate? Pre-launch placeholder? "Remove the blur" is a regression if there's an actual gating intent the blur enforces.
- **Decision needed:** After identifying the trigger — wire to subscription upsell (if tier gate), OR remove the blur (if pre-launch placeholder), OR replace with an explicit denial state (if consent gate).
- **If yes, size:** S (wire) / XS (remove) / S (replace), depending on which trigger is real.

### P2 — Remove-from-family-plan UX missing (function exists with intentional throw)

**Status as of 2026-05-08: PARTIAL** — `family.ts:504` still throws `ProfileRemovalNotImplementedError` for cross-account removal. Same-account archival is implemented (lines 507-521) but has no mobile UI. No remove/leave buttons exist in any family management screen.

- **What's there:** `apps/api/src/services/billing/family.ts:414-462` — `ProfileRemovalNotImplementedError` + `removeProfileFromSubscription`, which throws by design. The function header documents this: *"Cross-account detachment is intentionally disabled until the backend has a verifiable invite/claim flow for the destination account."* The throw is a security guard against trusting a caller-supplied `newAccountId`. No mobile UI for removing a child once added to a family plan.
- **Decision needed:** Two distinct paths, ranked together with the family-link/invite item below:
  - (a) Ship **same-account removal** now (parent removes their own non-owner profile from the family plan — possible without the invite/claim flow). Size: M (API + mobile UI + RevenueCat sync).
  - (b) Wait for the cross-account invite/claim flow (separately P3, line 99-103 below) and then enable cross-account detachment.
- **Do NOT:** Remove the function shell. The throw is a security property, not a misleading stub.
- **Why it matters:** Pre-launch is the cheapest time to fix the same-account path. Once a child is on the plan there is no exit; this will become a support escalation source after launch.

### P2 — Family / Pro tier upsell hidden from Free/Plus

**Status as of 2026-05-08: DONE (by policy)** — `subscription.tsx:136-146`. `getTiersToCompare()` returns only Free+Plus for non-family/pro users; Family and Pro cards append only when user is already on those tiers. Intentionally gated pending SKU approval (BUG-899/BUG-917). Revisit when store SKUs are approved.

- **What's there:** `subscription.tsx` (lines 71–144). Family + Pro tiers show as read-only cards only if the user is already on them. No upsell card from Free/Plus → Family/Pro.
- **Decision needed:** Show Family/Pro upsell to Free/Plus users, OR confirm Family/Pro stay self-discovery (current state) until store SKUs approved (note: blocked per `BUG-899`).
- **If yes, size:** S

### P2 — No family-link / child-invite flow (genuinely missing)

**Status as of 2026-05-08: TODO** — `more.tsx:473` still navigates to `/create-profile?for=child` only. No invite-by-code or link-existing-child flow implemented.

- **What's there:** `handleAddChild` in `more.tsx` (line 473) only creates a new profile. No invite-by-code or link-existing-child flow.
- **Decision needed:** Build cross-account invite/claim, or stay with create-only. (Affects whether existing learner accounts can ever be linked to a parent retroactively.)
- **If yes, size:** L (cross-account flow + email/code + verification)

### P3 — Parent-facing LLM narrative insight

**Status as of 2026-05-08: TODO** — No `parent*Summary` or `family*Insight` service exists. Parent dashboard remains stats-derived only.

- **What's there:** Nothing. No `parent*Summary` or `family*Insight` service. Parent dashboard is purely stats-derived.
- **Decision needed:** Build a parent-facing narrative ("This week, Mia spent more time on fractions and seemed to struggle with reducing.")? Or stay stats-only?
- **If yes, size:** L (prompt + service + Inngest schedule + UI)

### P2 — `post-session-suggestions` is learner-only

**Status as of 2026-05-08: TODO** — `post-session-suggestions.ts` writes topic suggestions to `topicSuggestions` table for the learner only. No dashboard field, push notification, or mobile UI surfaces these suggestions to parents.

- **What's there:** `apps/api/src/inngest/functions/post-session-suggestions.ts` writes topic suggestions for the learner. No parent-facing surface for them.
- **Decision needed:** Surface to parent ("Mia's mentor is suggesting she try X next") or keep learner-only.
- **If yes, size:** S

---

## Library / Shelf / Notes / Search

### P1 — Search results drilled down to subject only (biggest single library win)

**Status as of 2026-05-08: PARTIAL** — `library.tsx:249-257` still collapses all search results to `Set<subjectId>`. The code extracts `books`, `topics`, and `notes` from `searchResult.data` but only uses them to populate the subject-ID filter set. Typed result rows with tap targets are not rendered.

- **What's there:** `librarySearchResultSchema` returns four arrays: `subjects`, `books`, `topics`, `notes` (with `contentSnippet`). `apps/mobile/src/app/(app)/library.tsx:249-256` collapses every hit to `Set<subjectId>` and discards the rest.
- **Decision needed:** Render typed result rows (matched topic, matched note snippet, matched book) under the search bar with tap targets that navigate directly to the match.
- **Failure modes to spec before sizing:**

  | State | Trigger | User sees | Recovery |
  |---|---|---|---|
  | Stale FK — note's session deleted | Tap note result, source session gone | ? | ? |
  | Stale FK — book archived | Tap book result, book in archive | ? | ? |
  | Stale FK — topic reassigned | Tap topic result, topic moved books | ? | ? |
  | Empty result, valid query | Server returns `{subjects:[],books:[],topics:[],notes:[]}` | ? | ? |

  Note→topic→book→subject is a 3-hop FK chain; any link can be stale. Fill the table before sizing.
- **If yes, size:** M (with the table done).
- **Why it matters:** Search currently feels broken even when the API works perfectly. Highest single library wire-up win.

### P1 — Bookmarks per-subject filter unused

**Status as of 2026-05-08: DONE** — `progress/saved.tsx:115` calls `useBookmarks({ subjectId })` derived from URL params. Per-subject filtering is wired end-to-end.

- **What's there:** `useBookmarks()` and `apps/api/src/routes/bookmarks.ts` both accept `{ subjectId? }`. `progress/saved.tsx` calls with no args (global list only).
- **Decision needed:** Add per-subject view from shelf or book screen.
- **If yes, size:** XS

### P1 — Note → session has no tap target

**Status as of 2026-05-08: DONE** — `shelf/[subjectId]/book/[bookId].tsx:651-663` defines `handleNoteSourcePress()` which pushes to `/session-summary/[sessionId]`. `InlineNoteCard` renders `sourceLine` as a `Pressable` when `onSourcePress` is provided (line 66-83). End-to-end navigation is live.

- **What's there:** `note.sessionId` is stored, returned, and rendered as text via `formatSourceLine`. No navigation.
- **Decision needed:** Make the source line a tap target that navigates to the session.
- **If yes, size:** XS

### P2 — Book-completed celebration

**Status as of 2026-05-08: DONE** — `book/[bookId].tsx:1562-1572`. When `isBookComplete` flips to `true` (detected at line 544-553), `showBookCompletionBurst` triggers a `CelebrationAnimation` render (`testID="book-complete-celebration"`).

- **What's there:** `book_completed` snapshot field exists; `MilestoneCard` renders it; static "You finished this book" card on the book screen with no animation, no celebration moment, no continue/next-book prompt.
- **Decision needed:** Add a celebration moment on book screen at the boundary `isBookComplete = true`. (The milestone-detection branch itself is genuinely missing per Section I — that's covered as a Slice 3 quick-win.)
- **If yes, size:** S

### P3 — `library-filters.ts` dead exports

**Status as of 2026-05-08: PARTIAL** — `apps/mobile/src/lib/library-filters.ts` exists but helper functions (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`) are already gone from the file. Only `EnrichedBook` interface remains, still used by `hooks/use-all-books.ts`. Cleanup is ~1-line: delete the file and update the one import.

- **What's there:** Tab/sort/filter helpers (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`, etc.) are entirely unused since v3 shipped. Only `EnrichedBook` is consumed externally (in `apps/mobile/src/hooks/use-all-books.ts`).
- **Decision needed:** Realistically just one option — delete them and keep only `EnrichedBook`. The "wire to v3" alternative is mis-sized: the helpers operate on local `Subject[]` (v2 client-filter shape); v3 is server-side via `librarySearchResultSchema` (flattened `subjects`/`books`/`topics`/`notes` arrays). Data shapes don't align — "wiring" is a rebuild, not a refactor.
- **If yes, size:** XS (inline `EnrichedBook` type into `use-all-books.ts` and delete the file). The "wire to v3" path is L if anyone wants to revive it; do not size as M.
- **Why it matters:** ~250 lines of code with one-line live usage. Delete unless someone produces a concrete use case the v3 search endpoint can't already serve.

---

## Practice Hub

### P1 — Mastery celebration missing on `passed` branch

**Status as of 2026-05-08: DONE** — `practice/assessment/index.tsx:153-154`. The `passed` result card renders `"You got {masteryPercent}%! {bandLabel}."`. Both are calculated at lines 133-145.

- **What's there:** `practice/assessment/index.tsx` lines 213–224. The `passed` terminal status renders a generic "Done" button. `masteryPercent` and `bandLabel` are computed (lines 133–145) but only displayed under the `borderline` case.
- **Decision needed:** Render mastery percent + band label on `passed` branch too.
- **If yes, size:** XS

### P2 — Quiz "Challenge Mode" hidden from user

**Status as of 2026-05-08: DONE (explainer)** — Hub explainer card shipped in commit `af79a85e` (2026-05-06). Manual opt-in card not built; intentional, per "quiet defaults / surface controls only when sought."

- **What's there:** `quiz/launch.tsx` lines 156–190 renders the in-quiz banner when the server flips `difficultyBump = true` (trigger: 3 consecutive perfect rounds within 14 days, see `services/quiz/difficulty-bump.ts`). `quiz/index.tsx:228-238` renders an explainer card on the hub (testID `quiz-challenge-explainer`); copy shipped in all 7 locales (`quiz.index.challengeExplainerTitle/Body`).
- **Outcome:** Option (a) — explainer — shipped. Option (b) — manual opt-in — deferred (no signal that users want the control).

### P3 — XP visible on Practice hub even at 0

**Status as of 2026-05-08: DONE** — `practice/index.tsx:76,80,81`. `${totalXp} XP` is included in subtitle strings unconditionally; no `=== 0` hide-check present.

- **What's there:** `useXpSummary()` exists. Practice hub conditionally hides XP if `totalXp === 0`.
- **Decision needed:** Always show XP (with 0) so the surface is consistent and discoverable, OR keep hidden until earned.
- **If yes, size:** XS

---

## Memory / Mentor-Memory

### P1 — `interestContext` not rendered (the schema literally says "lands in mobile context-picker commit")

**Status as of 2026-05-08: DONE** — `mentor-memory.tsx:490` renders `InterestContextRow` for each interest. `mentor-memory-sections.tsx:234-291` implements the picker as radio-button-style options for `free_time | school | both`. Context badge renders alongside each interest.

- **What's there:** `interestEntrySchema` line 33 stores `interestContext: 'free_time' | 'school' | 'both'`. Consumed by 6 places in API prompts. `apps/mobile/src/app/(app)/mentor-memory.tsx:457` displays only `interest.label`, not `.context`. Schema comment on line 51: *"lands in mobile context-picker commit"* — that commit hasn't happened. Per memory `project_onboarding_new_dimensions.md` this is a tracked unfinished migration, not net-new work.
- **Prerequisite:** Audit the 6 prompt-consumer sites to confirm they tolerate `interestContext === undefined` cleanly. Existing users have no value set; if any prompt site assumes a present value the picker rollout regresses prompt quality silently. Backfill default ("both"?) if needed before the picker ships.
- **Decision needed:** After the audit — wire the context picker on mentor-memory + render the context badge alongside each interest.
- **If yes, size:** S (picker + badge), assuming audit finds the consumers are null-safe; +XS if backfill is needed.
- **Why it matters:** API already personalizes prompts based on this field; the user has no way to set or correct it.

### P2 — `memory_facts` `confidence` not surfaced

**Status as of 2026-05-08: DONE** — `child/[profileId]/mentor-memory.tsx:46-51` defines `confidenceDetail()` helper; line 478 passes `detail={confidenceDetail(item.confidence, t)}` to `MemoryRow`. Visible in parent view of child memory.

- **What's there:** `memory_facts` table has `confidence: 'low' | 'medium' | 'high'` and `supersededBy` chains. No UI consumer for either.
- **Decision needed:** Show `confidence` (and supersession) in mentor-memory for transparency, OR keep it server-only as LLM-context plumbing. (Trade-off: surfacing increases trust but adds UI complexity for a feature the user can't really act on.)
- **If yes, size:** S

### P2 — Parent and learner mentor-memory views read different sources

**Status as of 2026-05-08: PARTIAL** — Learner view: `mentor-memory.tsx:49` calls `useLearnerProfile()` (`/learner-profile/me`). Parent view: `child/[profileId]/mentor-memory.tsx:63-64` calls `useChildLearnerProfile(childProfileId)` + `useChildMemory(childProfileId)`. Two distinct data paths confirmed; consolidation not done.

- **What's there:** Learner reads structured `learningProfile` fields; child parent-view reads the curated-memory categories endpoint. Same conceptual feature, two data paths.
- **Decision needed:** Pick one source for both views (likely the curated-memory endpoint, since it's parent-friendly), OR confirm divergence is intentional.
- **If yes, size:** M (consolidation)
- **Why it matters:** Future "what does the mentor know about my child" features will diverge in confusing ways if these stay split.

---

## Notifications

### P0 — Push registration failures invisible (spec failure modes before sizing)

**Status as of 2026-05-08: DONE** — `use-push-token-registration.ts:8-17`. Hook now exports a `PushRegistrationFailure` tagged union (`permission_denied | expo_token_unavailable | api_registration_failed | unsupported_device`) and `PushRegistrationState`. Each cause is individually caught and classified (lines 52-91). Sentry captures are tagged with the failure reason.

- **What's there:** `apps/mobile/src/hooks/use-push-token-registration.ts:24-54` — single `try/catch` collapses all failure causes into one `Sentry.captureException` call. No user-visible state, no error-type discrimination.
- **Decision needed:** Spec a Failure Modes table first. The four causes need different recoveries:

  | Cause | Trigger | Recovery |
  |---|---|---|
  | OS permission denied | `Notifications.getPermissionsAsync()` ≠ granted | Re-prompt or deep-link to OS Settings |
  | Expo push token endpoint unreachable | `getExpoPushTokenAsync` throws | Retry with backoff |
  | Our `/push-token` mutation 5xx | `registerPushToken.mutateAsync` throws | Retry; flag server-side |
  | Emulator / unsupported device | No push capability | Suppress entirely — never surface |

  Then design: probably an in-app indicator + tap action, but the action depends on cause (retry button can't fix OS-permission-denied).
- **If yes, size:** S (with the Failure Modes table done; do not size before).
- **Why it matters:** A "tap to retry" UI that retries OS-permission failures degrades trust. Per `CLAUDE.md` "Spec failure modes before coding."

### P3 — `streak_warning` notification type with no sender

**Status as of 2026-05-08: DONE** — `streak_warning` is not in `NotificationPayload.type` union (`notifications.ts:29-47`). No Inngest function fires it. DB enum retains historical value.

- **What's there:** `notifications.ts` lines 29–49 declare `streak_warning` in the `NotificationPayload.type` union. No Inngest function fires it. Streak data is fetched and rendered, but nobody pushes a warning.
- **Decision needed:** Either (a) build the cron + sender ("Your streak is about to break"), OR (b) remove `streak_warning` from the type union.
- **If yes, size:** S (build cron + push) / XS (remove)
- **Status:** Addressed for new app code by removing `streak_warning` from `NotificationPayload.type`. The database enum still contains the historical value until a migration is worth carrying; no code path can newly send it through the typed notification service.

### P3 — `struggle_noticed` / `struggle_flagged` / `struggle_resolved` — needs a real spec before "build" is sized

**Status as of 2026-05-08: PARTIAL — missing consent gate (P0 risk)** — Detection and push pipeline are wired: `detectStruggleNotifications()` in `learner-profile.ts`, `sendStruggleNotification()` in `notifications.ts:480-544` (with 24h per-type dedup), triggered from `session-completed.ts:1313-1327`. However, `sendStruggleNotification` only checks for a `familyLinks` row — it does **not** check `consentStatus`. Struggle pushes currently fire for parents of children with `WITHDRAWN` or `PENDING` consent. The original prereq (consent gating per `project_parent_visibility_spec.md`) was never applied. This is a privacy gap that must be fixed before these notifications can be considered correctly implemented.

- **What's there:** Three notification types in the union. `learningProfile.struggles` is written to. No notification pipeline reads from it.
- **Decision needed:** Two options, but **(a) is not actually a sized option until prerequisites land**:
  - (a) Build the struggle-detection → parent-notification pipeline. Prerequisites before sizing: (1) Failure Modes table including false-positive handling and parent-correction path, (2) child-consent gating per `project_parent_visibility_spec.md` — does the child consent to parent receiving struggle alerts?, (3) eval scenario set in `apps/api/eval-llm/` covering the threshold tuning. Without these, "M (build)" is a false estimate — the cron + push is the easy part; threshold tuning and false-positive QA are the hard parts.
  - (b) Remove all three types now. Size: XS.
- **Why it matters:** Parent-facing AI inference about child learning difficulty is a high-stakes category — false positives ("Alex is struggling with fractions" when they aren't) damage trust permanently, worse than the missed-notification harm. Don't ship as a backlog "M build" item.

### P2 — Email channel used only for consent

**Status as of 2026-05-08: PARTIAL** — Resend + `sendEmail` fully integrated (`notifications.ts:265-312`). `EmailPayload.type` covers consent and feedback only. `weekly_progress`, `recall_nudge`, and `progress_refresh` remain push-only. No email send in any product-notification Inngest function.

- **What's there:** Resend SDK fully integrated. `consent-reminders.ts` actively sends. No product notification (recall nudge, weekly progress, monthly report) uses email.
- **Decision needed:** Add email as a fallback channel for high-value notifications (weekly progress to parent, recall nudges if push token absent), OR confirm push-only is intentional.
- **If yes, size:** M (per channel × notification type)

---

## Cross-Cutting Cleanups Deferred From This Round

Items skipped from the dead-code PR because each carries a small product question.

### P3 — Deprecated `DELETE /subjects/:subjectId/topics/:topicId/note` route

**Status as of 2026-05-08: TODO (intentional back-compat)** — `notes.ts:172-199`. Route is retained as an intentional back-compat shim (comment updated to reflect this). Mobile uses `DELETE /notes/:noteId` exclusively. Since the app is not yet published, no field binaries need this route — remove before launch.

- **What's there:** `apps/api/src/routes/notes.ts` lines 189–215. Marked `@deprecated`, kept "for backwards compatibility with older mobile versions." Mobile uses `DELETE /notes/:noteId` exclusively. Backed by `deleteNote` function in `services/notes.ts` line 294 (also unused outside this route).
- **Decision needed:** Remove now (app isn't published yet — there are no field binaries to support), OR set a deprecation deadline.
- **If yes, size:** S (route + service function + import + any test)
- **Why it matters:** Any deprecated path that survives launch acquires real-world traffic and becomes much harder to remove.

### P3 — `processTeachBackCompletion(topicId)` dead arg

**Status as of 2026-05-08: DONE** — `verification-completion.ts:186`. `topicId` parameter removed from function signature. TEACH_BACK assessments store structured data in the session event (lines 228-242) and don't need topic-level difficulty rung updates.

- **What's there:** `apps/api/src/services/verification-completion.ts` line 186. `topicId` parameter is `void`-suppressed with comment *"reserved for future use."* 5 call sites pass it (1 production, 4 tests).
- **Decision needed:** Either (a) actually use `topicId` (was it intended for topic-level mastery scoring?), OR (b) remove the arg from signature + all 5 call sites.
- **If yes, size:** XS (remove) / S (use)

---

## Summary

| Tier | Item | Size | Surface | Status (2026-05-08) |
|---|---|---|---|---|
| P0 | Consent visibility rule (precondition) | XS spec | Parent | **DONE** |
| P0 | Push registration failure visibility | S (after FM table) | Notifications | **DONE** |
| P1 | Consent badge on family summary | S | Parent | **DONE** |
| P1 | Engagement trend chip | XS | Parent | **DONE** |
| P1 | Exchange-count weekly delta | XS | Parent | **DONE** |
| P1 | Guided ratio chip / tooltip | XS | Parent | **DONE** |
| P1 | Streak/XP on family summary | XS | Parent | **DONE** |
| P1 | `MetricInfoDot` on family summary | XS | Parent | **DONE** |
| P1 | Search drill-through | M (after FM table) | Library | **PARTIAL** (collapses to subjectId) |
| P1 | Per-subject bookmarks | XS | Library | **DONE** |
| P1 | Note → session tap target | XS | Library | **DONE** |
| P1 | Mastery celebration on `passed` | XS | Practice | **DONE** |
| P1 | `interestContext` picker | S | Memory | **DONE** |
| P2 | "How it's working" detail screen | M / XS | Parent | **TODO** (badge removed, no screen) |
| P2 | `SamplePreview` upgrade wire | S / XS | Parent | **TODO** (still no onPress) |
| P2 | `removeProfileFromSubscription` | M / XS | Parent | **PARTIAL** (API throws; no mobile UI) |
| P2 | Family/Pro upsell | S | Parent | **DONE** (gated by BUG-899, intentional) |
| P2 | `post-session-suggestions` to parent | S | Parent | **DEFERRED** (post-launch; part of broader "parent visibility into past/present/future" theme alongside parent-facing LLM insight) |
| P2 | Book-completed celebration | S | Library | **DONE** |
| P2 | Quiz Challenge Mode visibility | XS / S | Practice | **DONE** (explainer shipped 2026-05-06 `af79a85e`; manual opt-in deferred) |
| P2 | `memory_facts.confidence` UI | S | Memory | **DONE** (parent view only) |
| P2 | Mentor-memory data source consolidation | M | Memory | **PARTIAL** (two paths confirmed) |
| P2 | Email channel for product notifications | M | Notifications | **PARTIAL** (infra ready; consent-only) |
| P3 | Family-link / child-invite flow | L | Parent | **TODO** |
| P3 | Parent-facing LLM insight | L | Parent | **TODO** |
| P3 | `library-filters.ts` wire-or-delete | XS | Library | **PARTIAL** (helpers gone, file+EnrichedBook remain) |
| P3 | XP always visible on Practice hub | XS | Practice | **DONE** |
| P3 | `streak_warning` build-or-remove | S / XS | Notifications | **DONE** (removed) |
| P3 | `struggle_*` build-or-remove | M / XS | Notifications | **DONE** (consent gate + 5 break tests shipped 2026-05-08 `2292b415`) |
| P3 | Deprecated note DELETE route | S | API cleanup | **TODO** (kept as back-compat; remove before launch) |
| P3 | `processTeachBackCompletion` arg | S / XS | API cleanup | **DONE** (arg removed) |

**Sequencing note** — the doc's "How to Use This Doc" section says *"Don't bundle items into 'redesigns' — each one is independent."* That rule applies here. Earlier drafts of this section bundled 5 family-summary chips into one PR; that's a redesign in disguise (5 visual additions, 5 type-extension diffs in one design QA cycle on a small phone — Galaxy S10e per user device profile). Don't do that.

**Phase 1-2 status:** Phase 1 type-plumbing prep and Phase 2 P0 prerequisite decisions are captured in `docs/specs/2026-05-06-hidden-wins-phase-1-2-prereqs.md`. The consent decision is **coarsened visibility**: keep the child row visible, but redact learning metrics server-side for `PENDING`, `PARENTAL_CONSENT_REQUESTED`, and `WITHDRAWN` states. Push registration UI remains blocked until the registration hook exposes classified failure states. **Both P0s are now DONE.**

**Remaining open work (as of 2026-05-08):**

1. **Search drill-through** (P1, M) — highest-value remaining item. Failure Modes table now drafted in `docs/specs/2026-05-08-library-search-drill-through.md`; ready for sizing + typed result rows.
2. **SamplePreview trigger identification** (P2) — determine gating intent before deciding wire vs. remove.
3. **removeProfileFromSubscription same-account path** (P2, M) — pre-launch is the cheapest window.
4. **Mentor-memory data source consolidation** (P2, M) — pick one source before adding new features.
5. **Email product notifications** (P2, M) — infrastructure ready; add weekly-progress and recall-nudge channels.
7. **`library-filters.ts` final delete** (P3, XS) — inline `EnrichedBook` into `use-all-books.ts`, delete file.
8. **Deprecated note DELETE route** (P3, S) — remove before launch.

**Closed since this doc was written:**
- Struggle notification consent gate (`2292b415`, 2026-05-08).
- Quiz Challenge Mode hub explainer (`af79a85e`, 2026-05-06).
9. **post-session-suggestions to parent** (P2, S) — decide exposure model first.
10. **"How it's working" badge** (P2) — decide: build analytics screen (M) or remove placeholder (XS).
