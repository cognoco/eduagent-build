---
title: Parent Home — Mentor Briefing Reshuffle — Implementation Plan
date: 2026-05-30
profile: ui
spec: inline (this document)
status: draft
---

# Parent Home — Mentor Briefing Reshuffle — Implementation Plan

**Goal:** Turn the parent home child card from a mechanical control panel into a
mentor briefing — clean at a glance, rich one tap deeper — reusing existing
components and existing data. The only new builds are the "Learn together" action
and one additive backend field (next-topic on the recap payload).

**Approach:** Reshuffle `ParentHomeScreen` so each child card follows the agreed
mock order — household pulse at top, then per child: identity + status word,
mentor-voice headline, positive-only momentum strip, condensed Solid / Coming-up
line, one state-appropriate starter, demoted action row. Rewire the row arrow to
open the child *overview* (not Progress charts); replace the redundant Progress
button with a "Learn together" action built on the existing clone flow; and at
one child, replace the redundant family-stats panel with a calm mentor slot plus
a quiet "Add a learner" row. No new tabs and no LLM call on home render. The
backend touch is a **targeted next-topic lookup inside `listRecapsForParent`**
that surfaces two already-stored fields on the parent recap payload (additive, no
generation change). This is deliberately *not* threaded through the shared
session hydrator — see T10 and **[Challenge HIGH-2]**.

---

## Adversarial review applied (2026-05-30)

This plan was challenged against the live codebase. Findings folded in below,
each tagged inline by ID:

- **[HIGH-1]** `dashboardChild.weeklyHeadline` is an object
  (`monthlyReportHeadlineSchema = { label, value, comparison }`,
  `packages/schemas/src/snapshots.ts:195-199`), **not** a string — the active-state
  headline fallback and its T1 test are fixed to format it.
- **[HIGH-2]** `toRecapItem` reads from `ChildSession`
  (`childSessionSchema`, `packages/schemas/src/progress.ts:824-847`), which has
  **no** `nextTopic*` fields, and `hydrateChildSessions`
  (`apps/api/src/services/session/session-crud.ts`) does not select them. T10 is
  rewritten to do a narrow lookup inside `listRecapsForParent` instead of mutating
  the shared hydrator.
- **[HIGH-3]** `buildSingleChildPrompts` (`ParentHomeScreen.tsx:352`) and
  `ConversationStarterCard` (`:465`) are local, non-exported — new task **T0**
  extracts them before T1/T6 can reuse them.
- **[HIGH-4]** `FamilySummaryPanel`'s `attentionChild` row renders "may need
  attention" (`ParentHomeScreen.tsx:296`), which the hard copy rule bans — T7 now
  rewords it and extends the guard.
- **[HIGH-5]** The arrow's new target (`child/[profileId]/index.tsx` no-mode view)
  is not yet enriched and currently ends with a "this page only keeps
  child-specific settings" hint (`:1017-1019`) — Design spec trimmed to reality.
- **[HIGH-6]** Added the required **Failure Modes** table.
- Pass 2 (MEDIUM/LOW): `progress` null-guard, negative-framing guard scope,
  dead-code cleanup, aliased join, locale guard gap, streak double-surface.

## Why (grounding)

The current card (verified in `ParentHomeScreen.tsx`):
- Leads with a mechanical snapshot: `formatChildSnapshot` → `"Programming · No activity this week"`.
- Opens **Progress** three ways — the row arrow (`handleOpenProgress`), the
  "Progress" button (`handleOpenProgress`), and the bottom **Progress tab**.
  The arrow and button are duplicates.
- Shows **three** conversation starters at one child (`SINGLE_CHILD_PROMPT_COUNT = 3`),
  filling the screen.
- Renders a **"Your family" panel** that, at one child, restates the same child's
  activity and adds `"Lilly may need attention"` — an alarm that violates the
  positive-framing rule (`feedback_positive_framing_no_struggle`).

Already-built assets we surface instead of building:
- **Recaps** (`useRecaps`, `RecapListItem`): per completed session, stored at
  session end — `highlight` (evidence-bound one-liner), `narrative`,
  `conversationPrompt`. Read is a DB fetch, gated to the family context.
- **Child overview** (`child/[profileId]/index.tsx`): recent sessions, subjects,
  last-session recency. The natural home for the arrow.
- **Mentor memory** (`child/[profileId]/mentor-memory.tsx`): the mentor's
  standing read on the kid — interests, how they learn, "Tell the mentor".
- **Clone flow** (`AddToMyLearningButton` + `useCloneFromChild`, gated
  `navigationContract.gates.showLearnThisToo`): clones a child's topic into the
  parent's own Library. The real spine of "Learn together".
- **DashboardChild** fields already loaded by `useDashboard()`: `weeklyHeadline`,
  `currentlyWorkingOn`, `currentStreak`, `progress.{weeklyDeltaTopicsMastered,
  weeklyDeltaVocabularyTotal, guidance}`, `trend`, `sessionsThisWeek`.

---

## Design spec

### Division of labor
- **Home card = glance + connection.** Calm but rich: headline, momentum strip,
  a condensed **Solid / Coming-up** line, one starter, three actions. Shows only
  *positive* retention ("Solid: …") — never "weak", "forgotten", or "needs
  attention".
- **Child overview (arrow target) = the deeper page.** **[Challenge HIGH-5]**
  Today `child/[profileId]/index.tsx` (no-mode view) already renders subjects with
  retention badges, recent-session history, and a prominent mentor-memory link —
  a reasonable destination. It does **not** yet show "Ready for a refresh" or the
  next-topic *reason* (the rich `ProgressNudgeCard` is gated to `mode==='progress'`,
  `index.tsx:870`), and it currently ends with a hint that reads *"Progress and
  reports live in their own tabs, so this page only keeps child-specific settings"*
  (`index.tsx:1017-1019`). That "full review" enrichment is **out-of-scope
  follow-up #1**. For *this* plan, T4 must also update/remove that contradicting
  hint copy so the page reads as an overview, not a settings dead-end. Depth beyond
  what exists today ships in the follow-up, not here.

### Household pulse (top of screen)
Replace the generic greeting subtitle (`getGreeting` → "Weekend learning? Nice!")
with a real activity roll-up when one exists, derived from each child's `trend` /
`sessionsThisWeek`:
- 2+ children: `t('home.parent.pulse.multi', { count })` → *"Two learners, both
  active this week."* (or *"…one active this week."* when mixed).
- 1 child active: *"Lilly's been active this week."*
- 1 child quiet: *"A quiet week for Lilly."*
- No children: fall back to the existing greeting subtitle.

### Card layout order (top → bottom)
Matches the agreed mock exactly:
1. Identity row: avatar + name + **status word** (right-aligned)
2. **Headline** (mentor voice)
3. **Momentum strip** (positive chips; hidden when empty)
4. **Solid / Coming-up** block (active state only)
5. One **starter** ("Try tonight")
6. Action row: **Learn together · Reports · Nudge**

Then below the card: the **mentor slot**, then **Add a learner**.

### Card states

The card resolves to one of two states from `latestRecap` + `dashboardChild`.
`isActive = sessionsThisWeek > 0 || a recap exists from the last 7 days`.

**Quiet state** (`!isActive`):
- **Status word:** `"Quiet week"` (or `"Just getting started"` if `totalSessions === 0`).
- **Headline (mentor voice, templated — no LLM):**
  - has a focus: `t('home.parent.card.quietWithFocus', { focus })` →
    *"Lilly's having a quiet week — last time she was exploring {focus}."*
  - never studied: `t('home.parent.card.quietNew', { subjects })` →
    *"Lilly's all set up — she chose {subjects}. Here's how to help her begin."*
  - no focus, has history: `t('home.parent.card.quietPlain')` →
    *"Lilly's having a quiet week."*
- **Momentum strip:** hidden (nothing to celebrate → stays calm).
- **Solid / Coming-up:** hidden — the quiet card stays minimal.
- **Starter:** exactly one — the restart prompt from `buildSingleChildPrompts`
  (already produces `promptRestartWithTopic` / `promptNoActivity`).

**Active state** (`isActive`):
- **Status word:** from `currentStreak` (`"On a {n}-day streak"` if `>= 2`) else
  from `trend` (`"Active this week"`).
- **Headline (mentor voice):** prefer `latestRecap.highlight`; fall back to a
  **formatted** `dashboardChild.weeklyHeadline` — note **[Challenge HIGH-1]** this
  is an object `{ label, value, comparison }` (`monthlyReportHeadlineSchema`,
  `packages/schemas/src/snapshots.ts:195-199`), **not** a string, so it must be
  rendered via `t('home.parent.card.headlineFromWeekly', { label, value, comparison })`
  (never assigned directly to a string headline); final fall back to
  `t('home.parent.card.activePlain', { focus })`.
- **Momentum strip:** up to three chips, **positive values only** (omit any zero
  or negative). **[Challenge MEDIUM-1]** `progress` is `nullable().optional()`
  (`progress.ts:369`) — null-guard it before reading any delta; treat a missing
  `progress` as all-zero (strip hidden):
  - 🔥 `currentStreak` → *"{n}-day streak"* (only if `>= 2`)
  - ✦ `progress.weeklyDeltaTopicsMastered` → *"+{n} topics"* (only if `> 0`)
  - 📖 `progress.weeklyDeltaVocabularyTotal` → *"+{n} words"* (only if `> 0`)
  - If all omitted, hide the strip.
- **Solid line:** subjects with `retentionStatus === 'strong'`, comma-joined →
  `t('home.parent.card.solid', { subjects })`. Omit the line if none are strong.
- **Coming-up line:** `latestRecap.nextTopicTitle` (newly exposed on the recap
  payload — see T10) → `t('home.parent.card.comingUp', { topic })`. Omit if null.
- **Starter:** exactly one — prefer `latestRecap.conversationPrompt`; fall back
  to the first `buildSingleChildPrompts` entry.

> **Copy rule (hard):** No card string may contain "weak", "forgotten",
> "struggling", "behind", "declining", or "needs attention" in any state.
> Retention concerns surface only on the overview page, framed as "Ready for a
> refresh".

### Actions (button row)
Replace today's `Progress · Reports · Nudge` with:
- **Learn together** (new) — opens the Learn-together sheet (below). Icon
  `school-outline`.
- **Reports** — unchanged (`pushChildReports`).
- **Nudge** — unchanged (`handleOpenNudge`).

The **row arrow** changes target: `childProfileHref(child.id)` (overview, no
`mode`) instead of `childProfileHref(child.id, 'progress')`. The **avatar** still
opens `childProfileHref(child.id, 'settings')`. Progress remains reachable via
the overview page and the bottom Progress tab.

### Learn-together sheet
A bottom sheet (mirror `NudgeActionSheet` structure) with:
1. **"Learn it yourself"** — embed `AddToMyLearningButton`, sourcing
   `topicId` / `topicTitle` / `subjectName` from `latestRecap` (the recap list
   item carries `topicId`). The button self-hides when `showLearnThisToo` is
   false or `topicId` is null, so the sheet degrades safely.
2. **"Try together this week"** — 2–3 proposals from `buildSingleChildPrompts`
   (reuse; do not invent new copy), rendered as the existing
   `ConversationStarterCard`.
3. If neither is available (no recap topic + gate off), the sheet shows
   `t('home.parent.learnTogether.emptyBody')` and a link to the child's Library.

> **Label decision:** "Learn together", **not** "Study together" — the latter
> implies live co-study, which does not exist. "Learn together" honestly covers
> learn-it-yourself + do-together proposals.

### Mentor slot + Add a learner (replaces family panel at one child)
- **One child:** render `<MentorSlot>` then a quiet "Add a learner" row.
  - `MentorSlot` priority: (1) **celebration** when a client-side rule fires —
    `currentStreak >= 7` OR `progress.weeklyDeltaTopicsMastered >= 3` →
    `t('home.parent.mentorSlot.celebration*', …)`; else (2) **guidance** —
    `progress.guidance` rendered under `t('home.parent.mentorSlot.worksFor', { name })`;
    else (3) render nothing (the slot is optional, not filler).
    **[Challenge LOW-3]** the streak chip in the momentum strip already surfaces
    `currentStreak >= 2`; when the celebration fires on `>= 7`, the streak shows
    twice. Prefer a streak-specific celebration copy that reframes (not restates)
    the number, or suppress the streak chip when the streak celebration is active.
  - "Add a learner" row only when `showAddChild` (existing `isAdultOwner` gate).
- **Two-plus children:** keep `FamilySummaryPanel` (it now summarizes a real
  family), but move the attention row to the top as "who needs you today".
  `MentorSlot` is not shown in this branch for v1.
  - **[Challenge HIGH-4]** The current attention row renders
    `home.parent.familySummary.attentionChild` → *"{name} may need attention"*
    (`ParentHomeScreen.tsx:296`), which **violates the hard copy rule** ("needs
    attention" is banned) and the very alarm the Why section condemns. Relocating
    the row does not fix the wording. Reword the key to positive framing (e.g.
    *"{name} could use a nudge today"* under a "Who needs you today" header) and
    extend the T1 negative-framing guard to cover `FamilySummaryPanel` copy too —
    the guard currently only covers the single-child resolver, so the banned
    phrase would otherwise survive in this branch.

---

## Scope

In scope:
- `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- `apps/mobile/src/components/home/ParentHomeScreen.test.tsx`
- New: `apps/mobile/src/components/home/MentorSlot.tsx` (+ co-located test)
- New: `apps/mobile/src/components/home/parent-card-copy.ts` — pure state→copy resolver (+ test)
- New: `apps/mobile/src/components/home/parent-card-prompts.ts` — **[Challenge HIGH-3]**
  extracted, exported `buildSingleChildPrompts` + `ConversationStarterCard`
  (+ `TonightPrompt` type and the `addPrompt` / `childHasAnySignal` /
  `childHasCurrentActivity` helpers), so `parent-card-copy.ts`, `LearnTogetherSheet.tsx`,
  and `ParentHomeScreen.tsx` can all import them. They are currently **local,
  non-exported** in `ParentHomeScreen.tsx:352, :465`.
- New: `apps/mobile/src/components/family/LearnTogetherSheet.tsx` (+ co-located test)
- `apps/mobile/src/i18n/locales/en.json` (+ `pnpm translate` for the 6 other locales)
- `packages/schemas/src/recaps.ts` — add `nextTopicTitle` + `nextTopicReason` to
  `recapListItemSchema` (additive, both nullable).
- `apps/api/src/services/recaps.ts` — **[Challenge HIGH-2]** do a targeted
  next-topic lookup for the recap sessions inside `listRecapsForParent`, then pass
  the resolved `{ nextTopicTitle, nextTopicReason }` into `toRecapItem`. The data
  lives on `session_summaries.next_topic_id` / `.next_topic_reason`
  (`packages/database/src/schema/sessions.ts:260-263`) — it is **not** on the
  `ChildSession` shape that `toRecapItem` reads today
  (`childSessionSchema`, `progress.ts:824-847`), so it must be fetched here. Do
  **not** extend the shared `hydrateChildSessions` projection to carry it — that
  query also backs the child-overview history and progress and has a far wider
  blast radius than this feature needs.

Out of scope (must not change):
- Tab shape / navigation contract (`navigation-contract.ts`, `_layout.tsx`) —
  this is content only; V0 5-tab production mode must not regress.
- Any LLM / recap *generation* code — no prompt or schema change to
  `session-recap.ts` / `session-completed.ts`; T10 only exposes already-stored
  columns. No migration (columns exist).
- `child/[profileId]/index.tsx` deep redesign — the arrow merely targets it; the
  "rich review" enrichment of that page is a separate follow-up plan. **[Challenge
  HIGH-5]** The one permitted touch here is the small hint-copy fix in T4 so the
  page reads as an overview rather than a settings dead-end; the structural
  enrichment stays out of scope.

---

## Tasks

- [ ] **T0: Extract reusable prompt helpers (prereq for T1/T6).**
  **[Challenge HIGH-3]** Move `buildSingleChildPrompts`, `ConversationStarterCard`,
  the `TonightPrompt` type, and the `addPrompt` / `childHasAnySignal` /
  `childHasCurrentActivity` helpers out of `ParentHomeScreen.tsx` (currently local,
  non-exported at `:352` and `:465`) into a new exported module
  `apps/mobile/src/components/home/parent-card-prompts.ts`. Update
  `ParentHomeScreen.tsx` to import from it. No behavior change.
  — **done when:** `ParentHomeScreen.tsx` imports the symbols, the file's existing
  tests stay green, and `buildSingleChildPrompts` / `ConversationStarterCard` are
  importable from the new module (verified by T1/T6 importing them).

- [ ] **T10: Expose next-topic on the recap payload (backend).**
  **[Challenge HIGH-2]** Add `nextTopicTitle: z.string().nullable()` and
  `nextTopicReason: z.string().nullable()` to `recapListItemSchema`
  (`packages/schemas/src/recaps.ts`). Both null when no next topic. **Do not**
  change `childSessionSchema` (`progress.ts:824-847`) or the shared
  `hydrateChildSessions` projection (`apps/api/src/services/session/session-crud.ts`)
  — they back the overview/progress history and must not be widened for this.
  Instead, in `listRecapsForParent` (`apps/api/src/services/recaps.ts`), after the
  sessions are fetched, run **one targeted lookup** over the recap session ids:
  select `sessionSummaries.sessionId`, `sessionSummaries.nextTopicReason`, and
  `curriculumTopics.title` from `sessionSummaries` left-joined to
  `curriculumTopics` on `sessionSummaries.nextTopicId`, scoped by the same
  `profileId` the recap query already enforces (do not widen access).
  **[Challenge LOW-1]** this is a **second, aliased** `curriculumTopics` join,
  distinct from the current-topic title resolution — alias it so it doesn't
  collide. Build a `Map<sessionId, { nextTopicTitle, nextTopicReason }>` and pass
  each entry into `toRecapItem`; both default to `null` when `next_topic_id` is
  null. `next_topic_id` / `next_topic_reason` already exist on the DB row
  (`packages/database/src/schema/sessions.ts:260-263`) — no migration, no
  generation change.
  — **done when:** `recaps.test.ts` asserts a recap with a stored next topic
  returns its title/reason, one without returns `null` for both, the lookup does
  not leak next-topic across profiles, and existing recap tests stay green.

- [ ] **T1: Pure copy resolver.** Add `parent-card-copy.ts` exporting
  `resolveParentCardCopy(child: DashboardChild, latestRecap: RecapListItem | null, t): ParentCardCopy`
  where `ParentCardCopy = { isActive: boolean; statusWord: string; headline: string;
  momentum: { icon: string; label: string }[]; solid: string | null; comingUp: string | null;
  starter: string | null }`. Implements the quiet/active rules, positive-only
  momentum filter, strong-subjects "solid" line, and `nextTopicTitle` "coming-up"
  line above. Quiet state returns `momentum: []`, `solid: null`, `comingUp: null`.
  **[Challenge HIGH-1]** the `weeklyHeadline` fallback must format the object
  `{ label, value, comparison }` via a template key, never assign it to a string.
  **[Challenge MEDIUM-1]** null-guard `child.progress` (nullable/optional) before
  reading any delta. Import the prompt helpers from `parent-card-prompts.ts` (T0),
  not from `ParentHomeScreen`.
  — **done when:** the T1 tests in `## Tests` pass, including the negative-framing
  guard (no banned **template** string for any fixture).

- [ ] **T2: Wire latest recap into the screen.** In `ParentHomeScreen`, call
  `useRecaps()` once (no `childProfileId`), and compute `latestRecapByChild:
  Map<string, RecapListItem>` = first recap per `childProfileId` (the list is
  newest-first). Pass each child's latest recap into `ChildCommandCard`.
  — **done when:** T2 test asserts a child with a recent recap receives its
  `highlight` as the headline, and a child with none falls back to the quiet
  headline; render does not error when `useRecaps` returns `[]`.

- [ ] **T3: Rebuild `ChildCommandCard` body to the mock order.** Render, top to
  bottom: identity + right-aligned status word; resolved `headline` (replacing
  `formatChildSnapshot`); momentum strip (hidden when empty); the **Solid /
  Coming-up** block (each line hidden when its resolver field is null); exactly
  one starter; then the action row. Remove the 3-starter
  `ChildConversationStarters` block from the card.
  — **done when:** T3 tests assert the element order matches the spec, one
  starter max on the card, headline text matches resolver output, momentum chips
  render only for positive values, and Solid/Coming-up lines are absent in the
  quiet state and present (when non-null) in the active state.

- [ ] **T4: Rewire arrow + avatar targets.** Row `onPress` → new
  `pushChildOverview(id)` calling `router.push(childProfileHref(id))` (no mode).
  Avatar unchanged (`settings`). **[Challenge MEDIUM-3]** Removing the row binding
  + the Progress button (T5) orphans the `onNavigateToProgress` prop threaded into
  `ChildCommandCard` and the top-level `pushChildProgress` handler
  (`ParentHomeScreen.tsx:997`) — delete both (and the now-dead
  `home.parent.childCard.progressAction` key) per "clean up all artifacts", unless
  a remaining caller is found. **[Challenge HIGH-5]** In the same task, update the
  overview's settings-only hint copy (`child/[profileId]/index.tsx:1017-1019`) so
  the page reads as an overview destination, not a settings dead-end.
  — **done when:** T4 test asserts tapping `parent-home-check-child-{id}`
  navigates to `/(app)/child/{id}` with no `mode` param, the avatar still routes to
  `?mode=settings`, and no `onNavigateToProgress` / `pushChildProgress` references
  remain (grep clean).

- [ ] **T5: Swap Progress button → Learn together.** Replace the first
  `ChildActionButton` (Progress) with a `school-outline` "Learn together" button
  that opens `LearnTogetherSheet` for that child. Keep Reports and Nudge.
  — **done when:** T5 test asserts no `parent-home-child-progress-*` button
  renders, a `parent-home-learn-together-*` button does, and pressing it mounts
  the sheet.

- [ ] **T6: Build `LearnTogetherSheet`.** Bottom sheet (model on
  `NudgeActionSheet`): section 1 embeds `AddToMyLearningButton` sourced from the
  child's latest recap topic; section 2 renders 2–3
  `buildSingleChildPrompts` proposals as `ConversationStarterCard` (imported from
  `parent-card-prompts.ts`, T0 — **[Challenge HIGH-3]** these are not exported
  today); empty fallback per spec. Close handler clears state like the nudge sheet.
  — **done when:** T6 tests cover (a) gate-on + recap topic → clone button shown,
  (b) gate-off → clone hidden, proposals still shown, (c) no recap + gate-off →
  empty-state copy renders, no crash.

- [ ] **T7: Build `MentorSlot` + restructure the bottom region.** Add
  `MentorSlot` per the priority rules. In `ParentHomeScreen`, branch on
  `linkedChildren.length`: `=== 1` → `MentorSlot` + quiet "Add a learner" row
  (gated `showAddChild`), drop `FamilySummaryPanel`; `>= 2` → keep
  `FamilySummaryPanel` with the attention row hoisted to top. **[Challenge HIGH-4]**
  Reword `home.parent.familySummary.attentionChild` away from "may need attention"
  (the hard copy rule bans it) to positive framing under a "Who needs you today"
  header, and extend the negative-framing guard (see Tests) to cover
  `FamilySummaryPanel` copy, not just the single-child resolver.
  — **done when:** T7 tests assert: one-child render contains no
  `parent-home-family-summary` testID; celebration variant shows at
  `currentStreak >= 7`; guidance variant shows `progress.guidance`; slot renders
  nothing when both absent; two-child render still shows the family panel; and no
  banned word appears in the rendered family-panel copy.

- [ ] **T11: Household pulse line.** Add `resolveHouseholdPulse(children:
  DashboardChild[], t): string | null` (in `parent-card-copy.ts`) per the
  Household-pulse rules; render it as the greeting subtitle in `ParentHomeScreen`,
  falling back to the existing `getGreeting` subtitle when it returns null.
  — **done when:** T11 test asserts: two active children → multi pulse string;
  one quiet child → quiet string; zero children → existing greeting subtitle
  unchanged.

- [ ] **T8: i18n keys + translations.** Add all new `home.parent.card.*`,
  `home.parent.mentorSlot.*`, `home.parent.learnTogether.*` keys to `en.json`;
  run `pnpm translate`; ensure `scripts/check-i18n-orphan-keys.ts` and
  `check-i18n-staleness.ts` pass.
  — **done when:** orphan-key + staleness checks are green and every new `t(...)`
  call resolves.

- [ ] **T9: Verify quiet/empty/active states end-to-end.** Run the mobile suite
  for the touched files and the existing parent E2E flow
  (`e2e/flows/parent/parent-tabs.yaml`, `child-drill-down.yaml`) against the new
  arrow target.
  — **done when:** `pnpm exec jest --findRelatedTests` is green for all changed
  files and the two parent flows pass (or are updated to the new arrow target,
  matching real behavior — never weakened).

---

## Tests

**T1 — `parent-card-copy.test.ts`** (the load-bearing logic):
- `active recap → highlight headline`: child with `sessionsThisWeek: 2`, recap
  `highlight: 'Cracked equivalent fractions'` → `copy.headline` equals that, `isActive` true.
- `active no recap → weeklyHeadline`: **[Challenge HIGH-1]** `sessionsThisWeek: 1`,
  `latestRecap: null`, `weeklyHeadline: { label, value, comparison }` set → headline
  equals the **formatted** template (e.g. `t('home.parent.card.headlineFromWeekly', …)`),
  not the raw object. Assert the rendered string, never object-equality.
- `quiet with focus`: `sessionsThisWeek: 0`, `currentlyWorkingOn: ['Programming']`
  → headline matches `quietWithFocus`, `starter` non-null, `momentum` empty.
- `quiet new learner`: `totalSessions: 0` → headline matches `quietNew`.
- `momentum positive-only`: `currentStreak: 5`, `weeklyDeltaTopicsMastered: 2`,
  `weeklyDeltaVocabularyTotal: 0` → exactly two chips (streak, topics), no words chip.
- `momentum all-zero → empty`: all deltas 0, streak 1 → `momentum` is `[]`.
- `progress null → empty momentum, no crash`: **[Challenge MEDIUM-1]** `progress:
  null`, `currentStreak: 0` → resolver returns `momentum: []` and does not throw.
- `solid strong-only`: subjects `[{name:'Fractions',retentionStatus:'strong'},
  {name:'Decimals',retentionStatus:'strong'},{name:'Algebra',retentionStatus:'weak'}]`
  → `solid` lists Fractions + Decimals only, never Algebra.
- `solid none → null`: no strong subjects → `solid` is `null`.
- `coming-up from recap`: active recap `nextTopicTitle:'Comparing fractions'` →
  `comingUp` contains it; `nextTopicTitle: null` → `comingUp` is `null`.
- `quiet hides solid/comingUp`: `sessionsThisWeek: 0` → both `null` regardless of
  subject/recap data.
- `negative-framing guard`: **[Challenge MEDIUM-2]** assert the resolver's
  **static template strings** (the keys the app authors) match none of
  `/weak|forgotten|struggl|behind|declining|needs attention/i`. Do **not** scan
  `JSON.stringify(copy)` of fully-interpolated output — that includes
  user-controlled subject/topic names (e.g. a chemistry subject "Weak acids" or a
  history topic "Forgotten empires") and would false-positive on legitimate data.
  Add a fixture with such a subject to prove the guard does **not** trip on
  interpolated names while still catching a banned word in a template.
- **[Challenge LOW-2]** locale note: this guard only covers English. `pnpm
  translate` (T8) can introduce banned words in the 6 other locales with no guard;
  spot-check the machine output for the new `home.parent.card.*` keys, and file a
  follow-up if a cross-locale framing guard is wanted.

**T2–T7:** component tests as specified in each `done when:` (React Native
Testing Library, real hooks with mocked API boundary only — no internal mocks per
GC1/GC6).

---

## Verify at build time (not assumed)
- **Coaching-card parent feed.** `MentorSlot` v1 uses only `progress.guidance` +
  client-side streak/topic rules — both confirmed on `DashboardChild`. It does
  **not** depend on a parent-facing coaching-card stream. If that stream is later
  confirmed, the slot can graduate to the priority engine; do not block v1 on it.
- **Recap recency.** Confirmed: `listRecapsForParent` (`recaps.ts:88`) sorts
  newest-first by `startedAt`, so `[0]` per child is the latest. Use
  `startedAt` for the 7-day `isActive` window (`endedAt` is nullable).

## Failure modes

**[Challenge HIGH-6]** Required by CLAUDE.md (every feature spec must fill the
Recovery column). The home render must never become a dead end.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Recaps fetch errors | `useRecaps` `isError` | Card still renders from `dashboardChild` alone; headline falls back to `weeklyHeadline`/`activePlain`; no "coming-up" line | Silent — recaps are enrichment, not core; card degrades to dashboard-only. No banner. |
| Recaps still loading | `useRecaps` `isLoading` | Card renders dashboard-only headline; no momentum/coming-up flicker | Recap fields fill in on settle; no skeleton needed for an enrichment field. |
| Recaps empty | `useRecaps` returns `[]` | Quiet/active card from dashboard only; no coming-up line | Normal path (already in T2 done-when). |
| Dashboard errors | `useDashboard` `isError` | Existing `ParentHomeScreen` error/empty handling (unchanged by this plan) | Existing retry/fallback — do not regress it. |
| Learn-together: clone fails | `useCloneFromChild` mutation error | Toast/error from existing clone flow; sheet stays open | Reuse `AddToMyLearningButton`'s existing error+undo toast — do not swallow. |
| Learn-together: no topic + gate off | `showLearnThisToo` false and recap `topicId` null | Empty-state body + link to child Library (spec §Learn-together #3) | Library link is the escape; no dead end. |
| Next-topic lookup fails (backend) | T10 join/query throws | Recap returns with `nextTopicTitle`/`nextTopicReason` = `null` | Lookup must be non-fatal — never fail the whole recap list because next-topic resolution failed; default both to `null`. |

## Out-of-scope follow-ups (tracked, not built here)
1. **Rich overview page** — enrich `child/[profileId]/index.tsx` with the mentor
   review ("what's solid / ready for a refresh", what's coming up, mentor-memory
   surfacing). Separate `ui` plan.
2. **Multi-child mentor slot** — extend `MentorSlot` to the `>= 2` branch.
3. **LLM-authored daily headline** — only if templated + recap headlines prove
   too thin in practice; needs an API field and the note-draft hallucination guard.
