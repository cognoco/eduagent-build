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

### P0 — Consent state invisible on family overview

- **What's there:** `dashboard.ts` lines 832–833 return `consentStatus` and `respondedAt` per child on `/dashboard`.
- **Decision needed:** Add a consent badge (or color/state) to the family-summary child card. A withdrawn-consent or pending-consent child currently looks identical to a healthy one until the parent drills in.
- **If yes, size:** S
- **Why it matters:** Privacy-adjacent. A parent should not have to drill into a profile to discover their child's consent isn't active.

### P1 — Engagement trend not rendered

- **What's there:** `engagementTrend: 'increasing' | 'stable' | 'declining'` is computed in `dashboard.ts` (~lines 848–858), typed all the way through to `ParentDashboardSummary.tsx` and `family.tsx`. No render path.
- **Decision needed:** Add a trend chip on the family summary card.
- **If yes, size:** XS
- **Why it matters:** Single most parent-meaningful signal we already compute — answers "is my kid still engaged."

### P1 — Exchange-count week-over-week deltas hidden

- **What's there:** `exchangesThisWeek` / `exchangesLastWeek` computed (`dashboard.ts` lines 737–762, returned at line 839–840). No mobile component reads them.
- **Decision needed:** Render as "+N this week" or sparkline on the family summary card.
- **If yes, size:** XS

### P1 — Guided-vs-immediate ratio computed, never shown

- **What's there:** `guidedVsImmediateRatio` via `calculateGuidedRatio` (`dashboard.ts` line 848).
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
- **Decision needed:** Wire to subscription upsell, OR remove the blur (cosmetic-only blur is worse than no blur).
- **If yes, size:** S (wire) / XS (remove)

### P2 — `removeProfileFromSubscription` permanently throws

- **What's there:** `apps/api/src/services/billing/family.ts` lines 426–459 implement the function but always throw `ProfileRemovalNotImplementedError`. No mobile UI for removing a child once added to a family plan.
- **Decision needed:** Implement, or document it as intentional and remove the misleading function shell. (Once a child is on the plan there is no exit; this will become a support escalation source after launch.)
- **If yes, size:** M (implement: API + mobile UI + RevenueCat sync) / XS (remove)
- **Why it matters:** Pre-launch is the cheapest time to fix this. Post-launch, support tickets.

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

- **What's there:** `librarySearchResultSchema` returns four arrays: `subjects`, `books`, `topics`, `notes` (with `contentSnippet`). `library.tsx` lines 249–256 collapses every hit to `Set<subjectId>` and discards the rest.
- **Decision needed:** Render typed result rows (matched topic, matched note snippet, matched book) under the search bar with tap targets that navigate directly to the match.
- **If yes, size:** M
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

- **What's there:** Tab/sort/filter helpers (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`, etc.) are entirely unused since v3 shipped. Only `EnrichedBook` is consumed externally.
- **Decision needed:** Either (a) wire the helpers to the new v3 search/filter (would naturally support the search drill-through above), OR (b) delete them and keep only `EnrichedBook`.
- **If yes, size:** S (delete) / M (wire to v3)
- **Why it matters:** ~250 lines of code with one-line live usage. Either wire or delete; not both options should sit at zero.

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

- **What's there:** `interestEntrySchema` line 33 stores `interestContext: 'free_time' | 'school' | 'both'`. Consumed by 6 places in API prompts. `mentor-memory.tsx` line 457 displays only `interest.label`, not `.context`. Schema comment on line 51: *"lands in mobile context-picker commit"* — that commit hasn't happened.
- **Decision needed:** Wire the context picker on mentor-memory + render the context badge alongside each interest.
- **If yes, size:** S
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

### P0 — Push registration failures invisible

- **What's there:** `use-push-token-registration.ts` lines 48–52 silently swallow registration errors via `Sentry.captureException`. No user-visible state.
- **Decision needed:** Surface a soft in-app indicator when push registration fails (e.g., recall nudges won't arrive). Even a one-line Settings note ("Notifications: not connected — tap to retry") closes the gap.
- **If yes, size:** S
- **Why it matters:** This is the single highest source of "the app stopped pinging me" complaints in any push-dependent product. Diagnostic gap.

### P3 — `streak_warning` notification type with no sender

- **What's there:** `notifications.ts` lines 29–49 declare `streak_warning` in the `NotificationPayload.type` union. No Inngest function fires it. Streak data is fetched and rendered, but nobody pushes a warning.
- **Decision needed:** Either (a) build the cron + sender ("Your streak is about to break"), OR (b) remove `streak_warning` from the type union.
- **If yes, size:** S (build cron + push) / XS (remove)

### P3 — `struggle_noticed` / `struggle_flagged` / `struggle_resolved` types with no senders

- **What's there:** Three notification types in the union. `learningProfile.struggles` is written to. No notification pipeline reads from it.
- **Decision needed:** Either (a) build the struggle-detection → parent-notification pipeline, OR (b) remove all three types.
- **If yes, size:** M (build) / XS (remove)
- **Why it matters:** This is a parent-facing trust feature ("we'll tell you when your kid is stuck"). High value if built; misleading dead code if not.

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
| P0 | Consent badge on family summary | S | Parent |
| P0 | Push registration failure visibility | S | Notifications |
| P1 | Engagement trend chip | XS | Parent |
| P1 | Exchange-count weekly delta | XS | Parent |
| P1 | Guided ratio chip / tooltip | XS | Parent |
| P1 | Streak/XP on family summary | XS | Parent |
| P1 | `MetricInfoDot` on family summary | XS | Parent |
| P1 | Search drill-through | M | Library |
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

**Suggested first wave (cheap, high-value):** the 5 P1 XS items in Parent (engagement trend, exchange delta, guided ratio, streak/XP, MetricInfoDot) bundle naturally into one PR — same screen, same data, same component. Estimated size: S total.

**Second wave:** the 3 P1 XS items in Library (per-subject bookmarks, note→session tap target, mastery celebration). Same shape — XS individually, S bundled.

**Then:** P0 items (consent badge, push failure visibility), then the M items (search drill-through, interestContext picker).
