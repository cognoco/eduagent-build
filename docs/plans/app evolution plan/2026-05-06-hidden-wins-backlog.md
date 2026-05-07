# Hidden Wins Backlog

**Date:** 2026-05-06
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

- **What's there:** `apps/api/src/services/dashboard.ts:832` returns `consentStatus` alongside `exchangesThisWeek`, `engagementTrend`, `currentStreak`, `totalXp` for every child in the same payload — no gating on consent state. Memory note `project_parent_visibility_spec.md` flags an unimplemented parent-privacy/RLS spec.
- **Decision needed:** When a child's consent is `withdrawn` or `pending`, what does the parent see? Options: (a) block the row entirely, (b) coarsen — show name + status only, no metrics, (c) show full data with a banner. This is a data-visibility rule, not a UI badge.
- **If yes, size:** XS (decision + spec) → drives implementation size of the gating itself
- **Why it matters:** A badge on top of unrestricted data is theatre. The badge below is downstream of this decision.

### P1 — Consent badge on family-summary card (downstream of the visibility rule above)

- **What's there:** Same field as above. Currently a withdrawn-consent or pending-consent child looks identical to a healthy one on the family card.
- **Decision needed:** Once the visibility rule is set, render its outcome — badge / color / status pill / hidden row.
- **If yes, size:** S
- **Why it matters:** Whatever the visibility rule is, the parent should see it on the card without drilling in.

### P1 — Engagement trend not rendered

- **What's there:** `engagementTrend: 'increasing' | 'stable' | 'declining'` is computed in `apps/api/src/services/dashboard.ts:502`, typed through to `ParentDashboardSummary.tsx:37` and `family.tsx:78`. No render path.
- **Decision needed:** Add a trend chip on the family summary card.
- **If yes, size:** XS
- **Why it matters:** Single most parent-meaningful signal we already compute — answers "is my kid still engaged."

### P1 — Exchange-count week-over-week deltas hidden

- **What's there:** `exchangesThisWeek` / `exchangesLastWeek` computed at `apps/api/src/services/dashboard.ts:737-762`, returned at lines 839-840. No mobile component reads them.
- **Decision needed:** Render as "+N this week" or sparkline on the family summary card.
- **If yes, size:** XS

### P1 — Guided-vs-immediate ratio computed, never shown

- **What's there:** `guidedVsImmediateRatio` via `calculateGuidedRatio` (`apps/api/src/services/dashboard.ts:848`).
- **Decision needed:** Surface as "X% guided this week" or skip — depends on whether the metric is parent-meaningful. Possibly belongs behind an info tooltip rather than a primary metric.
- **If yes, size:** XS

### P1 — Streak / XP on family summary (drill-down only today)

- **What's there:** `currentStreak`, `longestStreak`, `totalXp` returned in the dashboard payload but `family.tsx`'s local type doesn't declare them. Drill-down `child/[profileId]/index.tsx` (lines 341–365) renders streak + XP only.
- **Decision needed:** Mirror at least `currentStreak` on the family card (XP optional).
- **If yes, size:** XS

### P1 — `MetricInfoDot` tooltips not on family summary

- **What's there:** `MetricInfoDot.tsx` exists with `PARENT_METRIC_TOOLTIPS` vocabulary. Wired in session-detail and child-detail. Top-level family summary screen has no tooltips.
- **Decision needed:** Add to family summary so parents who never drill down can still understand metrics.
- **If yes, size:** XS

### P2 — "How it's working" badge waiting on a screen that doesn't exist

- **What's there:** `child/[profileId]/index.tsx` lines 698–711: a non-pressable badge with the explicit comment *"analytics detail screen is not yet built. Using View (not Pressable) prevents a silent dead-end tap."*
- **Decision needed:** Build the analytics detail screen, OR remove the badge entirely.
- **If yes, size:** M (build) / XS (remove)
- **Why it matters:** The current state is a UI placeholder for promised functionality. Either honor the promise or stop making it.

### P2 — `SamplePreview` blur with no upgrade action

- **What's there:** `apps/mobile/src/components/parent/SamplePreview.tsx` blurs child content with an "unlock" message but has no `onPress` or upgrade link. Used in `ParentDashboardSummary.tsx` line 285 and `child/[profileId]/index.tsx` line 425.
- **Prerequisite:** Identify what triggers the blur today — tier gate (Free can't see)? Consent gate? Pre-launch placeholder? "Remove the blur" is a regression if there's an actual gating intent the blur enforces.
- **Decision needed:** After identifying the trigger — wire to subscription upsell (if tier gate), OR remove the blur (if pre-launch placeholder), OR replace with an explicit denial state (if consent gate).
- **If yes, size:** S (wire) / XS (remove) / S (replace), depending on which trigger is real.

### P2 — Remove-from-family-plan UX missing (function exists with intentional throw)

- **What's there:** `apps/api/src/services/billing/family.ts:414-462` — `ProfileRemovalNotImplementedError` + `removeProfileFromSubscription`, which throws by design. The function header documents this: *"Cross-account detachment is intentionally disabled until the backend has a verifiable invite/claim flow for the destination account."* The throw is a security guard against trusting a caller-supplied `newAccountId`. No mobile UI for removing a child once added to a family plan.
- **Decision needed:** Two distinct paths, ranked together with the family-link/invite item below:
  - (a) Ship **same-account removal** now (parent removes their own non-owner profile from the family plan — possible without the invite/claim flow). Size: M (API + mobile UI + RevenueCat sync).
  - (b) Wait for the cross-account invite/claim flow (separately P3, line 99-103 below) and then enable cross-account detachment.
- **Do NOT:** Remove the function shell. The throw is a security property, not a misleading stub.
- **Why it matters:** Pre-launch is the cheapest time to fix the same-account path. Once a child is on the plan there is no exit; this will become a support escalation source after launch.

### P2 — Family / Pro tier upsell hidden from Free/Plus

- **What's there:** `subscription.tsx` (lines 71–144). Family + Pro tiers show as read-only cards only if the user is already on them. No upsell card from Free/Plus → Family/Pro.
- **Decision needed:** Show Family/Pro upsell to Free/Plus users, OR confirm Family/Pro stay self-discovery (current state) until store SKUs approved (note: blocked per `BUG-899`).
- **If yes, size:** S

### P2 — No family-link / child-invite flow (genuinely missing)

- **What's there:** `handleAddChild` in `more.tsx` (line 473) only creates a new profile. No invite-by-code or link-existing-child flow.
- **Decision needed:** Build cross-account invite/claim, or stay with create-only. (Affects whether existing learner accounts can ever be linked to a parent retroactively.)
- **If yes, size:** L (cross-account flow + email/code + verification)

### P3 — Parent-facing LLM narrative insight

- **What's there:** Nothing. No `parent*Summary` or `family*Insight` service. Parent dashboard is purely stats-derived.
- **Decision needed:** Build a parent-facing narrative ("This week, Mia spent more time on fractions and seemed to struggle with reducing.")? Or stay stats-only?
- **If yes, size:** L (prompt + service + Inngest schedule + UI)

### P2 — `post-session-suggestions` is learner-only

- **What's there:** `apps/api/src/inngest/functions/post-session-suggestions.ts` writes topic suggestions for the learner. No parent-facing surface for them.
- **Decision needed:** Surface to parent ("Mia's mentor is suggesting she try X next") or keep learner-only.
- **If yes, size:** S

---

## Library / Shelf / Notes / Search

### P1 — Search results drilled down to subject only (biggest single library win)

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

- **What's there:** `useBookmarks()` and `apps/api/src/routes/bookmarks.ts` both accept `{ subjectId? }`. `progress/saved.tsx` calls with no args (global list only).
- **Decision needed:** Add per-subject view from shelf or book screen.
- **If yes, size:** XS

### P1 — Note → session has no tap target

- **What's there:** `note.sessionId` is stored, returned, and rendered as text via `formatSourceLine`. No navigation.
- **Decision needed:** Make the source line a tap target that navigates to the session.
- **If yes, size:** XS

### P2 — Book-completed celebration

- **What's there:** `book_completed` snapshot field exists; `MilestoneCard` renders it; static "You finished this book" card on the book screen with no animation, no celebration moment, no continue/next-book prompt.
- **Decision needed:** Add a celebration moment on book screen at the boundary `isBookComplete = true`. (The milestone-detection branch itself is genuinely missing per Section I — that's covered as a Slice 3 quick-win.)
- **If yes, size:** S

### P3 — `library-filters.ts` dead exports

- **What's there:** Tab/sort/filter helpers (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`, etc.) are entirely unused since v3 shipped. Only `EnrichedBook` is consumed externally (in `apps/mobile/src/hooks/use-all-books.ts`).
- **Decision needed:** Realistically just one option — delete them and keep only `EnrichedBook`. The "wire to v3" alternative is mis-sized: the helpers operate on local `Subject[]` (v2 client-filter shape); v3 is server-side via `librarySearchResultSchema` (flattened `subjects`/`books`/`topics`/`notes` arrays). Data shapes don't align — "wiring" is a rebuild, not a refactor.
- **If yes, size:** S (delete). The "wire to v3" path is L if anyone wants to revive it; do not size as M.
- **Why it matters:** ~250 lines of code with one-line live usage. Delete unless someone produces a concrete use case the v3 search endpoint can't already serve.

---

## Practice Hub

### P1 — Mastery celebration missing on `passed` branch

- **What's there:** `practice/assessment/index.tsx` lines 213–224. The `passed` terminal status renders a generic "Done" button. `masteryPercent` and `bandLabel` are computed (lines 133–145) but only displayed under the `borderline` case.
- **Decision needed:** Render mastery percent + band label on `passed` branch too.
- **If yes, size:** XS

### P2 — Quiz "Challenge Mode" hidden from user

- **What's there:** `quiz/launch.tsx` lines 59–76 has full Challenge Mode banner UI that fires when the server flips `difficultyBump = true`. Quiz hub has no card option to opt in.
- **Decision needed:** Either (a) explain to the user when challenge mode triggers ("Mentor is making this harder — you've been crushing it"), OR (b) add a manual "challenge mode" card option.
- **If yes, size:** XS (explain) / S (manual opt-in)

### P3 — XP visible on Practice hub even at 0

- **What's there:** `useXpSummary()` exists. Practice hub conditionally hides XP if `totalXp === 0`.
- **Decision needed:** Always show XP (with 0) so the surface is consistent and discoverable, OR keep hidden until earned.
- **If yes, size:** XS

---

## Memory / Mentor-Memory

### P1 — `interestContext` not rendered (the schema literally says "lands in mobile context-picker commit")

- **What's there:** `interestEntrySchema` line 33 stores `interestContext: 'free_time' | 'school' | 'both'`. Consumed by 6 places in API prompts. `apps/mobile/src/app/(app)/mentor-memory.tsx:457` displays only `interest.label`, not `.context`. Schema comment on line 51: *"lands in mobile context-picker commit"* — that commit hasn't happened. Per memory `project_onboarding_new_dimensions.md` this is a tracked unfinished migration, not net-new work.
- **Prerequisite:** Audit the 6 prompt-consumer sites to confirm they tolerate `interestContext === undefined` cleanly. Existing users have no value set; if any prompt site assumes a present value the picker rollout regresses prompt quality silently. Backfill default ("both"?) if needed before the picker ships.
- **Decision needed:** After the audit — wire the context picker on mentor-memory + render the context badge alongside each interest.
- **If yes, size:** S (picker + badge), assuming audit finds the consumers are null-safe; +XS if backfill is needed.
- **Why it matters:** API already personalizes prompts based on this field; the user has no way to set or correct it.

### P2 — `memory_facts` `confidence` not surfaced

- **What's there:** `memory_facts` table has `confidence: 'low' | 'medium' | 'high'` and `supersededBy` chains. No UI consumer for either.
- **Decision needed:** Show `confidence` (and supersession) in mentor-memory for transparency, OR keep it server-only as LLM-context plumbing. (Trade-off: surfacing increases trust but adds UI complexity for a feature the user can't really act on.)
- **If yes, size:** S

### P2 — Parent and learner mentor-memory views read different sources

- **What's there:** Learner reads structured `learningProfile` fields; child parent-view reads the curated-memory categories endpoint. Same conceptual feature, two data paths.
- **Decision needed:** Pick one source for both views (likely the curated-memory endpoint, since it's parent-friendly), OR confirm divergence is intentional.
- **If yes, size:** M (consolidation)
- **Why it matters:** Future "what does the mentor know about my child" features will diverge in confusing ways if these stay split.

---

## Notifications

### P0 — Push registration failures invisible (spec failure modes before sizing)

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

- **What's there:** `notifications.ts` lines 29–49 declare `streak_warning` in the `NotificationPayload.type` union. No Inngest function fires it. Streak data is fetched and rendered, but nobody pushes a warning.
- **Decision needed:** Either (a) build the cron + sender ("Your streak is about to break"), OR (b) remove `streak_warning` from the type union.
- **If yes, size:** S (build cron + push) / XS (remove)
- **Status:** Addressed for new app code by removing `streak_warning` from `NotificationPayload.type`. The database enum still contains the historical value until a migration is worth carrying; no code path can newly send it through the typed notification service.

### P3 — `struggle_noticed` / `struggle_flagged` / `struggle_resolved` — needs a real spec before "build" is sized

- **What's there:** Three notification types in the union. `learningProfile.struggles` is written to. No notification pipeline reads from it.
- **Decision needed:** Two options, but **(a) is not actually a sized option until prerequisites land**:
  - (a) Build the struggle-detection → parent-notification pipeline. Prerequisites before sizing: (1) Failure Modes table including false-positive handling and parent-correction path, (2) child-consent gating per `project_parent_visibility_spec.md` — does the child consent to parent receiving struggle alerts?, (3) eval scenario set in `apps/api/eval-llm/` covering the threshold tuning. Without these, "M (build)" is a false estimate — the cron + push is the easy part; threshold tuning and false-positive QA are the hard parts.
  - (b) Remove all three types now. Size: XS.
- **Why it matters:** Parent-facing AI inference about child learning difficulty is a high-stakes category — false positives ("Alex is struggling with fractions" when they aren't) damage trust permanently, worse than the missed-notification harm. Don't ship as a backlog "M build" item.

### P2 — Email channel used only for consent

- **What's there:** Resend SDK fully integrated. `consent-reminders.ts` actively sends. No product notification (recall nudge, weekly progress, monthly report) uses email.
- **Decision needed:** Add email as a fallback channel for high-value notifications (weekly progress to parent, recall nudges if push token absent), OR confirm push-only is intentional.
- **If yes, size:** M (per channel × notification type)

---

## Cross-Cutting Cleanups Deferred From This Round

Items skipped from the dead-code PR because each carries a small product question.

### P3 — Deprecated `DELETE /subjects/:subjectId/topics/:topicId/note` route

- **What's there:** `apps/api/src/routes/notes.ts` lines 189–215. Marked `@deprecated`, kept "for backwards compatibility with older mobile versions." Mobile uses `DELETE /notes/:noteId` exclusively. Backed by `deleteNote` function in `services/notes.ts` line 294 (also unused outside this route).
- **Decision needed:** Remove now (app isn't published yet — there are no field binaries to support), OR set a deprecation deadline.
- **If yes, size:** S (route + service function + import + any test)
- **Why it matters:** Any deprecated path that survives launch acquires real-world traffic and becomes much harder to remove.

### P3 — `processTeachBackCompletion(topicId)` dead arg

- **What's there:** `apps/api/src/services/verification-completion.ts` line 186. `topicId` parameter is `void`-suppressed with comment *"reserved for future use."* 5 call sites pass it (1 production, 4 tests).
- **Decision needed:** Either (a) actually use `topicId` (was it intended for topic-level mastery scoring?), OR (b) remove the arg from signature + all 5 call sites.
- **If yes, size:** XS (remove) / S (use)

---

## Summary

| Tier | Item | Size | Surface |
|---|---|---|---|
| P0 | Consent visibility rule (precondition) | XS spec | Parent |
| P0 | Push registration failure visibility | S (after FM table) | Notifications |
| P1 | Consent badge on family summary | S | Parent |
| P1 | Engagement trend chip | XS | Parent |
| P1 | Exchange-count weekly delta | XS | Parent |
| P1 | Guided ratio chip / tooltip | XS | Parent |
| P1 | Streak/XP on family summary | XS | Parent |
| P1 | `MetricInfoDot` on family summary | XS | Parent |
| P1 | Search drill-through | M (after FM table) | Library |
| P1 | Per-subject bookmarks | XS | Library |
| P1 | Note → session tap target | XS | Library |
| P1 | Mastery celebration on `passed` | XS | Practice |
| P1 | `interestContext` picker | S | Memory |
| P2 | "How it's working" detail screen | M / XS | Parent |
| P2 | `SamplePreview` upgrade wire | S / XS | Parent |
| P2 | `removeProfileFromSubscription` | M / XS | Parent |
| P2 | Family/Pro upsell | S | Parent |
| P2 | `post-session-suggestions` to parent | S | Parent |
| P2 | Book-completed celebration | S | Library |
| P2 | Quiz Challenge Mode visibility | XS / S | Practice |
| P2 | `memory_facts.confidence` UI | S | Memory |
| P2 | Mentor-memory data source consolidation | M | Memory |
| P2 | Email channel for product notifications | M | Notifications |
| P3 | Family-link / child-invite flow | L | Parent |
| P3 | Parent-facing LLM insight | L | Parent |
| P3 | `library-filters.ts` wire-or-delete | S / M | Library |
| P3 | XP always visible on Practice hub | XS | Practice |
| P3 | `streak_warning` build-or-remove | S / XS | Notifications |
| P3 | `struggle_*` build-or-remove | M / XS | Notifications |
| P3 | Deprecated note DELETE route | S | API cleanup |
| P3 | `processTeachBackCompletion` arg | S / XS | API cleanup |

**Sequencing note** — the doc's "How to Use This Doc" section says *"Don't bundle items into 'redesigns' — each one is independent."* That rule applies here. Earlier drafts of this section bundled 5 family-summary chips into one PR; that's a redesign in disguise (5 visual additions, 5 type-extension diffs in one design QA cycle on a small phone — Galaxy S10e per user device profile). Don't do that.

**Phase 1-2 status:** Phase 1 type-plumbing prep and Phase 2 P0 prerequisite decisions are captured in `docs/specs/2026-05-06-hidden-wins-phase-1-2-prereqs.md`. The consent decision is **coarsened visibility**: keep the child row visible, but redact learning metrics server-side for `PENDING`, `PARENTAL_CONSENT_REQUESTED`, and `WITHDRAWN` states. Push registration UI remains blocked until the registration hook exposes classified failure states.

**Suggested order (independent PRs, not bundles):**

1. **Type-plumbing prep PR** (no UI): extend `family.tsx`'s local type to declare `currentStreak` / `longestStreak` / `totalXp` so subsequent UI PRs are surgical. XS.
2. **P0 prerequisites first** — consent visibility rule decision (XS spec) and push failure modes table (XS spec). These unblock real sizing of their UI items.
3. **P1 XS chips on family summary, one PR per chip** — engagement trend, exchange delta, guided ratio, streak/XP, MetricInfoDot tooltips. Five separate PRs. Each is cheap to revert if S10e layout breaks.
4. **P1 XS Library items, one PR each** — per-subject bookmarks, note→session tap target. (Mastery celebration on `passed` is in *Practice*, not Library — sequence it independently.)
5. **P0 UI items** — consent badge (after rule from step 2), push registration indicator (after Failure Modes table from step 2).
6. **P1 M items** — search drill-through (after FM table is filled), `interestContext` picker (after the 6-consumer audit).
