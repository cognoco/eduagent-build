# Progress Tab — "Currently Working On" + Self-View Polish

**Date:** 2026-05-09
**Branch:** `ux-cleanup`
**Status:** Spec — ready to implement
**Siblings:** `2026-05-09-family-tab-restructure.md`, `2026-05-09-positive-framing-copy-sweep.md`

## Why

The Progress tab is the active profile's self-view. Today it answers "how much have I done overall?" (mastered topics, words, sessions, time, streak) and "how is the trend?" (growth chart, weekly/monthly reports, recent sessions, milestones). The thing it does **not** answer well is the question users open Progress to ask first:

> *"What am I working on right now?"*

Meanwhile, `learning_profiles.struggles` already records exactly that — active, non-resolved focus areas the system has detected from real session signal. It's surfaced to parents (in email/push reports, and via the Family-tab spec on per-child cards and child-detail), but never to the learner themselves on their own Progress screen. That's a missed signal.

This spec adds a single section to Progress — **Currently working on** — using the same data source the Family-tab spec extracts via the `getCurrentlyWorkingOn(profileId)` helper. Family/child-detail and Progress share the source. Different audiences, same signal.

While we're touching Progress, three real bugs in the existing weekly/monthly report cards must be fixed in the same PR. They're the reason power users (including the product owner) have never seen a useful report despite the data existing:

1. **`MonthlyReportCard` and `WeeklyReportCard` render only the headline stat.** The underlying schema (`monthlyReportRecordSchema` in `packages/schemas/src/snapshots.ts`) carries `highlights: string[]` (capped at 3 LLM-generated bullets) and `nextSteps: string[]` (capped at 2 supportive next-steps). The LLM generates them (`apps/api/src/services/monthly-report.ts:169-220`). The mobile cards drop both arrays on the floor. Result: a 3-line stat where a substantive monthly summary should be.
2. **Empty-state copy is parent-flavored on a self-view surface.** `WeeklyReportCard` empty state renders `parentView.reports.weeklySnapshotsEmpty` with `{ name: 'your child' }`. `MonthlyReportCard` empty state renders `parentView.index.firstReportSoon`. Self-view users see parent copy about their child on their own profile.
3. **The cards live below the growth chart**, past hero + stats + delta chips + growth chart + (after this spec) currently-working-on. On a 5.8" screen they fall well below the fold.

Fixing the rendering and the copy is small. Reordering is a one-line decision. Doing all three in the same PR as "currently working on" turns Progress from "vague stats screen" into "a learner can see what they're working on, what they accomplished, and what's next" in one ship.

This spec also captures one inherited dependency (the copy sweep spec must land first).

## Decisions

| ID | Decision |
|---|---|
| **D-PT-1** | Progress shows a "Currently working on" section for the active profile, sourced from `learning_profiles.struggles` filtered to active/non-resolved entries, positively rephrased at the API edge. Same helper as the Family-tab spec. |
| **D-PT-2** | Section placement: between the hero card (`progress.hero.*`) and the `GrowthChart`. Rationale: hero answers "how much did I accumulate?", the new section answers "what am I doing right now?", growth chart answers "what's the trend?" — it reads top-to-bottom as present-tense → past-tense. |
| **D-PT-3** | Copy register: child / parent / teen via `copyRegisterFor(role)`, same pattern as the existing `progress.register.*` keys. Section header is "Currently working on" / age-appropriate equivalent in each register. Never "struggle / struggling / declining / weak / trouble". |
| **D-PT-4** | Empty state: hide the section entirely. Less is more. A learner with no detected focus areas does not need a placeholder telling them so. (Same rule as the Family-tab spec.) |
| **D-PT-5** | Cap at 3 entries rendered inline. If more exist, render "and N more" as a non-link text suffix. **Do not** add a deep-link to a "full list" screen on Progress — that screen doesn't exist for self-view, and we are not building it in this spec. (Compare with Family-tab spec, which links to child-detail's full list — that surface exists.) |
| **D-PT-6** | The data source is the same helper introduced in `2026-05-09-family-tab-restructure.md` step 0: `getCurrentlyWorkingOn(profileId): Promise<string[]>`. Whichever spec ships first owns the helper; the other consumes it. The Progress endpoint we extend is `useProgressInventory` (returns `KnowledgeInventory`). Add a new field `currentlyWorkingOn: string[]` to the inventory response shape; do not introduce a separate query. **Verified 2026-05-09:** `learning_profiles.struggles` shape is `{ subject, topic, lastSeen, attempts, confidence, source }` (`packages/schemas/src/learning-profiles.ts:92-99`). There is **no `resolvedAt` field**; "active" is defined by recency of `lastSeen`. The 90-day archival is upstream (`learner-profile.ts:337-344`); this helper applies a tighter window (suggested: 30 days) and may also filter by `confidence` to avoid surfacing low-confidence single-shot signals as "currently working on." Final window + confidence threshold to be tuned during implementation; document the chosen values in the PR. |
| **D-PT-7** | Copy sweep on Progress files (`use-progress.ts`, `RemediationCard.tsx`, `RetentionPill.tsx`, locale files) is **inherited from `2026-05-09-positive-framing-copy-sweep.md`** and ships in that PR, not this one. This spec only adds new copy keys for the new section. |
| **D-PT-8** | Out of scope: profile-aware Progress (parent passes `?profileId=` to view a child). See Family-tab spec D-FT-10 — explicitly rejected. Progress remains active-profile self-view only. |
| **D-PT-9** | Each "currently working on" entry renders a sub-label `"Detected from recent sessions"` (or register-appropriate equivalent) under the topic name. Borrowed from the redesign mockup at `mentomate_progress_redesign_with_working_on.html`. Frames the section as system-observed, not as a verdict — important for the positive-framing principle. |
| **D-PT-10** | `MonthlyReportCard` is extended to render `highlights` (up to 3 bullets) and `nextSteps` (up to 2 bullets) from the latest report record, in addition to the existing headline stat. Visual: bullets below the headline, separated by a divider, no card-in-card nesting. **The monthly detail screen at `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx:181-221` already renders highlights + nextSteps correctly** — the card fix mirrors that detail-screen render pattern. Don't reinvent; copy the working code. |
| **D-PT-11** | **Verified 2026-05-09:** `weeklyReportRecordSchema` (`packages/schemas/src/snapshots.ts:232-249`) does **not** carry `highlights` or `nextSteps`. Weekly is structurally lighter than monthly — only `{ childName, weekStart, thisWeek, lastWeek, headlineStat }`. **Weekly card stays headline-only.** Only fix the empty-state copy bug per D-PT-12. Extending the weekly schema with rich content is a separate, larger product decision (would need server-side LLM rollup for weekly cadence) — not in scope here. |
| **D-PT-12** | Empty-state copy for both cards is moved off the `parentView.*` namespace. New keys: `progress.weeklyReport.empty` and `progress.monthlyReport.empty`, register-aware (child / parent / teen). The parent surfaces (Family-tab child-detail) keep using the existing `parentView.*` keys — they're correct *there*. |
| **D-PT-13** | Section order on Progress, top to bottom: page title → hero (stats / mastery summary) → **Currently working on** → **Latest weekly report** → **Latest monthly report** → growth chart → recent sessions → milestones → saved → reports list link → keep-learning CTA. Reports move up from below growth chart to above it. Rationale: weekly/monthly are *substantive content* (LLM bullets, next-steps); growth chart is *trend visualization*. Content before chart. |
| **D-PT-14** | Streak emphasis on Progress is **out of scope for this PR**. The mockup leads with a giant streak hero; today's hero leads with mastery. We do not change the hero balance in this PR. If we want to elevate streak (or de-emphasize it further), that's a separate, intentional product decision deserving its own spec — not a side-effect of fixing reports. |
| **D-PT-15** | **Live mini-summary in weekly empty state.** When `WeeklyReportCard` has no latest record yet (days 1-6 of a new account, or new week not yet rolled up), do not show a "wait until next week" placeholder. Instead compute a live mini-summary from data we already have — sessions this week, words practiced this week, topics touched this week — and render it in the same card layout. Card always shows substantive content. Server-side: extend the inventory endpoint with `thisWeekMini: { sessions: number, wordsLearned: number, topicsTouched: number }` (cheap to compute from existing snapshot data). Client-side: when `latest` from `useProfileWeeklyReports` is undefined, render the mini-summary instead of empty copy. |
| **D-PT-16** | **Date-anchored monthly empty copy.** When `MonthlyReportCard` has no latest record yet, replace the vague "soon" copy with a concrete date: `"Your first monthly summary lands at the end of {{month}}"`. Compute end-of-current-month client-side from `new Date()`. Calm progress signal, not a lock. |
| **D-PT-17** | **Do not hide the Progress tab before week-1.** Conflicts with the no-gating philosophy. Progress is always visible (today's behavior), and we keep that. Empty/thin states on day 1 are addressed via D-PT-15/D-PT-16 (live mini-summary, date-anchored copy) — show what we have, calmly. |
| **D-PT-18** | **Remove the `newLearner` progressive-disclosure gate.** Today `apps/mobile/src/app/(app)/progress/index.tsx:354-378` swaps the real Progress UI for an "X sessions to unlock full progress" teaser when `isNewLearner(totalSessions)` is true (threshold = 4 per `NEW_LEARNER_SESSION_THRESHOLD` in `packages/schemas/src/profiles.ts:154`). This is exactly the soft-gate pattern `feedback_never_lock_topics` warns against — the user sees a locked-feature teaser instead of their actual progress. Remove the gate; show real Progress UI from session 1. **Sweep callers first:** before deletion, grep for `isNewLearner` and `sessionsUntilFullProgress` across the codebase; confirm Progress is the only consumer. If other surfaces depend on the gate, scope the removal narrower. |

## Surfaces Affected (entry paths)

**Progress tab entry paths** — verified 2026-05-09:
- Tab nav (`apps/mobile/src/app/(app)/_layout.tsx:1646-1656`) — always visible, no role/tier gate
- Book completion redirect (`apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`)
- Subscription upgrade upsell (`apps/mobile/src/app/(app)/subscription.tsx`)
- Home intent card (`apps/mobile/src/components/home/LearnerScreen.tsx`)
- Sub-routes: `progress/vocabulary`, `progress/milestones`, `progress/saved`, `progress/[subjectId]/sessions`
- Web target confirmed by `apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts:22-25`

**Child-detail entry paths (parent dashboard surface)** — affected by the shared component fixes:
- Family tab card tap (`apps/mobile/src/app/(app)/family.tsx:216`)
- Internal nav (reports list, weekly-report detail back-nav)
- Push notifications: `weekly_progress` push at `apps/api/src/inngest/functions/weekly-progress-push.ts:40` carries `{ type, parentId }` but no explicit deep-link URL — tap routing is app-level (`useNotificationListener`), end-to-end behavior **unverified**. Out of scope for this PR; flag as follow-up.

**Family tab gating coherence:** owner-only with linked children (`_layout.tsx:64`). Progress is universal. So a non-learning parent may see Progress with sparse data — D-PT-15/D-PT-16 must read sensibly for that user too, not just for the active child learner.

## Affected Surfaces

### Backend

#### `apps/api/src/services/learner-profile.ts` (or closest service)

- Add `getCurrentlyWorkingOn(profileId): Promise<string[]>` if the Family-tab spec hasn't already added it. Reads `learning_profiles.struggles` JSON, filters to entries where `resolvedAt` is null and the entry is active per existing product semantics, returns positively-phrased topic labels (strip "struggling with" / "trouble with" / "weak in" prefixes — convert to bare topic name; the UI prefixes with "Currently working on:").
- Profile-scoped: must use `createScopedRepository(profileId)` per CLAUDE.md.

#### `apps/api/src/routes/progress` (or wherever `useProgressInventory` resolves to)

- Extend the inventory response to include `currentlyWorkingOn: string[]`. Update `KnowledgeInventory` schema in `@eduagent/schemas`.
- Cap response array server-side at e.g. 10 entries (defense in depth — UI caps at 3 anyway).

### Mobile

#### `apps/mobile/src/app/(app)/progress/index.tsx`

Reorder per D-PT-13. After the hero card (line ~388, the `View className="bg-coaching-card rounded-card p-5"` block) and before the `<View className="mt-6"><GrowthChart .../></View>` block:

```tsx
{inventory?.currentlyWorkingOn?.length ? (
  <CurrentlyWorkingOnCard
    items={inventory.currentlyWorkingOn}
    register={register}
    testID="progress-currently-working-on"
  />
) : null}

{activeProfile ? (
  <>
    <TrackedView
      eventName="progress_report_viewed"
      dwellMs={1000}
      properties={{
        profile_id_hash: activeProfileHash,
        is_active_profile_owner: activeProfile.isOwner,
        report_type: 'weekly',
      }}
      testID="progress-weekly-report-tracker"
    >
      <WeeklyReportCard
        profileId={activeProfile.id}
        title={t(`progress.register.${register}.weekTitle`)}
      />
    </TrackedView>
    <TrackedView
      eventName="progress_report_viewed"
      dwellMs={1000}
      properties={{
        profile_id_hash: activeProfileHash,
        is_active_profile_owner: activeProfile.isOwner,
        report_type: 'monthly',
      }}
      testID="progress-monthly-report-tracker"
    >
      <MonthlyReportCard
        profileId={activeProfile.id}
        title={t(`progress.register.${register}.monthTitle`)}
      />
    </TrackedView>
  </>
) : null}
```

Then the existing growth chart, recent sessions (which moves out from inside the report block above — it's currently bundled with the reports), milestones, saved, reports list, keep-learning CTA — all in their current relative order.

The `<RecentSessionsList profileId={activeProfile.id} />` line currently lives inside the same `{activeProfile ? <>...</> : null}` block as the report cards. When the reports move up, leave `RecentSessionsList` where it currently sits relative to the growth chart (i.e. after growth chart, before milestones). Effectively: split the existing `activeProfile ?` block into two — reports above growth chart, sessions below.

#### New component: `apps/mobile/src/components/progress/CurrentlyWorkingOnCard.tsx`

- Props: `{ items: string[]; register: CopyRegister; testID?: string }`.
- Renders: section title from `progress.register.${register}.currentlyWorkingOnTitle`, then a vertical list of up to 3 entries. Each entry shows the topic label as the primary line and the sub-label `"Detected from recent sessions"` (per D-PT-9) as a smaller secondary line. "And N more" suffix when `items.length > 3`.
- No tap target. Static info card. Matches existing `bg-coaching-card rounded-card p-5` styling — should look like a sibling of the hero card, not a CTA.
- Optional left-side icon slot per entry: stick to the existing icon system (Ionicons). Do **not** use emoji glyphs even though the redesign mockup does — emoji icons in source are banned by the global "no emojis unless explicitly requested" rule. If we want per-topic visual differentiation later, drive it from `subjects.pedagogyMode` via a small icon map; for v1 it's fine to omit per-row icons entirely.
- Co-located test: `CurrentlyWorkingOnCard.test.tsx` covering: 0 items (renders null — but the screen guards it; component should also guard for safety), 1 item, 3 items, 5 items (renders 3 + "and 2 more"), each register, and the "Detected from recent sessions" sub-label rendering on every entry.

#### i18n (`apps/mobile/src/i18n/locales/{en,nb,de,es,pt,pl,ja}.json`)

Add new keys (positive framing only):
- `progress.register.child.currentlyWorkingOnTitle` — e.g. EN: "What you're working on right now"
- `progress.register.parent.currentlyWorkingOnTitle` — e.g. EN: "Currently working on"
- `progress.register.teen.currentlyWorkingOnTitle` — e.g. EN: "Currently working on"
- `progress.currentlyWorkingOn.andNMore` — e.g. EN: "and {{count}} more"

Translator note: each locale needs a register-aware version. Keep tone consistent with existing `progress.register.*` keys (encouraging for child, neutral for parent/teen).

#### `apps/mobile/src/components/progress/MonthlyReportCard.tsx`

Render the rich content the schema already carries. Current behavior: only `latest.headlineStat.value/label/comparison`. New behavior:

- Headline stat block stays as-is.
- Below it, when `latest.highlights.length > 0`: a divider, then a `Text` heading ("Highlights" / register-aware) followed by each bullet rendered as its own `<Text>` line (no native bullet character — use a leading "• " or rely on row layout). Cap at 3 (the schema already caps server-side).
- Below highlights, when `latest.nextSteps.length > 0`: a second divider, then "What's next" heading and each next-step as a line. Cap at 2.
- When the latest report has empty `highlights` and empty `nextSteps` (initial scaffold before LLM enrichment, see `monthly-report.ts:114-115`): render only the headline. Don't show empty section headers.
- Empty state (no `latest`): replace `parentView.index.firstReportSoon` with a new register-aware key `progress.monthlyReport.empty` (per D-PT-12).

#### `apps/mobile/src/components/progress/WeeklyReportCard.tsx`

- Empty state: replace `parentView.reports.weeklySnapshotsEmpty` (which interpolates "your child") with the live mini-summary per D-PT-15. If even the mini-summary has zero data (brand-new account with zero sessions this week), fall back to encouraging copy from a new register-aware key `progress.weeklyReport.empty.{child,parent,teen}` per D-PT-12.
- **Body stays headline-only when populated** — verified via `weeklyReportRecordSchema` (`packages/schemas/src/snapshots.ts:232-249`), which lacks `highlights` and `nextSteps`. Rendering rich content for weekly is out of scope per D-PT-11.

#### `apps/mobile/src/i18n/locales/{en,nb,de,es,pt,pl,ja}.json`

In addition to the new "currently working on" keys, add:
- `progress.weeklyReport.empty.child`, `.parent`, `.teen` — self-view empty state copy. EN child example: "Your first weekly summary is on its way." EN parent example: "Your first weekly summary lands after a full week of learning."
- `progress.monthlyReport.empty.child`, `.parent`, `.teen` — same shape, monthly cadence.
- Optional: `progress.monthlyReport.highlightsTitle.{child,parent,teen}` and `progress.monthlyReport.nextStepsTitle.{child,parent,teen}` — section headings inside the rendered card. Or use a single non-register-varying key if all three registers can share the heading.

The existing `parentView.*` keys stay in place — they're still the right copy for the parent surfaces (Family-tab child-detail). Don't delete them.

### `useProgressInventory` typing

- `KnowledgeInventory` in `@eduagent/schemas` gains `currentlyWorkingOn: string[]`. Default to `[]` server-side when no entries exist (do not return `undefined`) so the mobile guard `inventory?.currentlyWorkingOn?.length` reads cleanly.
- Update any test fixtures that construct a full `KnowledgeInventory` to include the new field.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `learning_profiles.struggles` empty for the active profile | Normal state for new learners or those without detected focus areas | Section hidden | None needed. Empty = absent, not placeholder. |
| `currentlyWorkingOn` returns labels with leftover negative prefixes (e.g. "struggling with") | API edge stripper has a bug | Card renders "struggling with fractions" verbatim | Treat as a bug to fix at the API edge. Add a unit test in `learner-profile.test.ts` that asserts no rendered label contains the banned tokens. |
| Inventory query fails | Network / 5xx | Existing `isError` branch at `progress/index.tsx:251-323` already shows `ErrorFallback` covering the whole page | No change. The new section renders inside the same success branch as everything else. |
| 5+ entries returned | Heavy practice load | Section shows first 3 + "and N more" suffix | UI cap. Server cap (D-PT-6) is the safety net. |
| Active profile is impersonated child (parent in kid's account) | Parent navigated via impersonation | Renders with `child` register copy | Correct behavior — Progress is always self-view of active profile, regardless of who's holding the device. |
| Section header copy missing in a locale | Translator omitted a key | `react-i18next` returns the key string literally | Sweep checklist enumerates all 7 locales for the new keys. CI doesn't catch i18n drift; manual verification step in checklist. |
| Inventory schema mismatch (server returns old shape without `currentlyWorkingOn`) | Old API deployed against new mobile build | `inventory?.currentlyWorkingOn?.length` is `undefined?.length` → falsy → section hidden | Optional chaining handles it. No crash. Worst case: feature silently absent until API ships. |
| `struggles` entry has malformed/legacy shape | Pre-schema entry without `lastSeen` field | Helper skips entry, doesn't crash | Helper validates each entry against the active schema; skips on parse failure |
| `newLearner` gate removed but other surface depended on `isNewLearner()` | D-PT-18 sweep missed a caller | That caller renders unintended state | Sweep `isNewLearner` / `sessionsUntilFullProgress` callers across mobile before deleting (per D-PT-18). If non-Progress consumers exist, scope the removal narrower or update them in the same PR. |
| Live weekly mini-summary has 0 of everything | Brand-new account, zero sessions this week | Fall back to register-aware empty copy per D-PT-15 | Mini-summary is computed; when all three counts are 0, render the empty-copy fallback rather than "0 sessions, 0 words" |
| Push notification "weekly_progress" tap behavior | Tap from device | Unverified | Out of scope this PR; tracked as follow-up. Routing is app-level (`useNotificationListener`); needs end-to-end verification before relying on deep-link behavior. |

## Implementation Steps

> **Order:** ship copy sweep PR first (`2026-05-09-positive-framing-copy-sweep.md`). Then this PR (or the Family-tab PR) introduces the `getCurrentlyWorkingOn` helper. The second consumer reuses it.

1. **Backend — helper.** If not already present from Family-tab spec: add `getCurrentlyWorkingOn(profileId)` per D-PT-6. Unit test in `learner-profile.test.ts` covering: empty, 1 active entry, 5 active entries, mix of resolved + active (only active returned), prefix stripping ("struggling with X" → "X").
2. **Backend — inventory endpoint.** Extend the response to include `currentlyWorkingOn: string[]`. Update `KnowledgeInventory` in `@eduagent/schemas`. Update existing inventory integration tests to assert the field is present (default `[]`).
3. **Schemas.** Update test fixtures that construct `KnowledgeInventory` literals — typecheck will surface the call sites. Also confirm whether `weeklyReportRecordSchema` carries highlights/next-steps (D-PT-11 dependency).
4. **Mobile — `CurrentlyWorkingOnCard`.** Create the new component + co-located test. Register-aware title, capped to 3, "and N more" suffix, "Detected from recent sessions" sub-label per row. No tap target.
5. **Mobile — `MonthlyReportCard`.** Render `highlights` + `nextSteps` per D-PT-10. Co-located test covers: latest with full bullets + steps, latest with empty arrays (initial scaffold), no latest at all (empty state with new register-aware copy), schema cap respected.
6. **Mobile — `WeeklyReportCard`.** Empty-state copy migrated off `parentView.*` per D-PT-12. If the weekly schema has highlights/next-steps fields, mirror the MonthlyReportCard render; otherwise leave headline-only and document.
7. **Mobile — Progress screen.** Reorder per D-PT-13: insert `CurrentlyWorkingOnCard` + report cards between hero and growth chart; sessions stay below growth chart. See the code block under Affected Surfaces for the exact diff target.
8. **i18n.** Add new keys in all 7 locale files: `progress.register.${register}.currentlyWorkingOnTitle`, `progress.currentlyWorkingOn.detected` (sub-label), `progress.currentlyWorkingOn.andNMore`, `progress.weeklyReport.empty.{child,parent,teen}`, `progress.monthlyReport.empty.{child,parent,teen}`, optional highlight/next-step section headings.
9. **Tests.**
   - `progress.test.tsx`: section ordering matches D-PT-13, currently-working-on renders when non-empty, weekly + monthly render rich content when present and self-view empty copy when not.
   - `CurrentlyWorkingOnCard.test.tsx`: per D-PT-9.
   - `MonthlyReportCard.test.tsx`: bullets + next-steps render, empty arrays don't render section headers, register-aware empty state.
   - `WeeklyReportCard.test.tsx`: empty state uses self-view copy.
   - `learner-profile.test.ts`: helper unit tests.
   - Inventory integration test: response shape includes `currentlyWorkingOn`.
10. **Manual test on web + Galaxy S10e:**
    - Active profile with 0 active focus areas — section hidden.
    - Active profile with 1 / 5 entries — render + cap.
    - Profile that has at least one monthly report with bullets + next-steps populated — verify the rich content renders. (Use a seeded test account or wait for one to roll up; per CLAUDE.md, "real implementation > mocks" — don't fake the report.)
    - Profile that has no report yet — verify self-view empty copy (no "your child" leak).
    - Switch profile mid-session — all sections update.
    - Each register (child, parent, teen) — title and empty-state copy read correctly.

## Verification Checklist (before PR)

### "Currently working on"
- [ ] Inventory response includes `currentlyWorkingOn: string[]`, defaulting to `[]`.
- [ ] No rendered label contains "struggle", "struggling", "declining", "trouble", "weak". Grep tested across 7 locales + the new component.
- [ ] Section hidden when empty. Section visible with 1+ entries. Capped at 3 + "and N more" beyond.
- [ ] "Detected from recent sessions" sub-label renders on every entry (D-PT-9).
- [ ] No tap target on the card.
- [ ] No emoji glyphs used as icons. (If row icons added, they're Ionicons.)
- [ ] No new query — feature reuses `useProgressInventory`.
- [ ] Family-tab spec's `getCurrentlyWorkingOn` helper is reused, not duplicated.

### Weekly + monthly report fixes
- [ ] `MonthlyReportCard` renders `highlights` (capped at 3) and `nextSteps` (capped at 2) when populated.
- [ ] `MonthlyReportCard` does **not** render empty section headers when `highlights` / `nextSteps` are empty arrays.
- [ ] `WeeklyReportCard` empty state no longer uses `parentView.reports.weeklySnapshotsEmpty` or interpolates "your child" on a self-view surface.
- [ ] `MonthlyReportCard` empty state no longer uses `parentView.index.firstReportSoon`.
- [ ] All 3 registers (child, parent, teen) have a localized empty-state in all 7 locales for both weekly and monthly cards.
- [ ] On Family-tab child-detail (parent third-person view), the existing `parentView.*` empty copy still renders — we did not break the parent surfaces.
- [ ] Section order on Progress matches D-PT-13: hero → currently working on → weekly → monthly → growth chart → recent sessions → milestones → saved → reports list → CTA.
- [ ] Verified by opening Progress on a real account that has at least one populated monthly report — confirmed the rich content renders.

### Cross-cutting
- [ ] `pnpm exec nx run mobile:test`, `pnpm exec nx run api:test`, `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e — Progress screen still readable on 5.8" with the extra section + reordered cards.
- [ ] All 3 registers (child, parent, teen) verified on the new "currently working on" title in all 7 locales.

## Out of Scope

- Profile-aware Progress (parent passes `?profileId=`). Rejected in Family-tab spec D-FT-10.
- Tap-to-deep-link from a "currently working on" entry to the topic detail. Defer until we have evidence learners want navigation from this surface — for now it's a status reading, not a launchpad.
- A standalone "all current focus areas" screen for self-view. Family-tab has one for parents (child-detail). Self-view doesn't need one yet — capped list is sufficient.
- Showing historical / resolved focus areas ("things you used to work on"). Different feature, different intent.
- Reordering or prioritizing entries by recency / severity. Server returns in whatever order the helper produces; UI doesn't sort. If the order looks wrong in production, that's a server-side fix.
- Replacing `learning_profiles.struggles` with a new positively-named table. The internal name stays — see D-FT-8 in Family-tab spec.
- The copy sweep itself. See `2026-05-09-positive-framing-copy-sweep.md`.
- **Streak-vs-knowledge hero rebalance** (per D-PT-14). The redesign mockup leads with a giant streak hero. Today's hero leads with mastery. We don't change that balance in this PR. Worth a separate spec if we want to elevate streak gamification — but that's a product positioning decision, not a side-effect of fixing reports.
- **Visual redesign of the Progress tab.** The mockup at `mentomate_progress_redesign_with_working_on.html` is a richer redesign (streak hero, milestone tiles, gradient hero card, condensed weekly summary). This PR only adopts the "currently working on" placement, the "Detected from recent sessions" sub-label, and fixes the report rendering bugs. The rest of the redesign (visual hero treatment, milestone tile layout, "weekly report unlocks soon" placeholder) is **not** adopted here — those are a separate design pass.
- **Removing surfaces the redesign mockup omits** (`MonthlyReportCard` rich content, `ReportsListCard` history link, saved items link, vocabulary deep-link pill). We keep them. The mockup's omissions are not endorsements.

## Coordination With Sibling Specs

- **Depends on:** `2026-05-09-positive-framing-copy-sweep.md` lands first, so the existing Progress-tab copy is clean before this layers new copy on top.
- **Shares with:** `2026-05-09-family-tab-restructure.md` — both consume `getCurrentlyWorkingOn`. Whichever ships first owns the helper.
- **Independent of:** parent-home-restructure, more-tab-restructure. Can ship in any relative order with those.
