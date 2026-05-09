# Family Tab Restructure

**Date:** 2026-05-09
**Branch:** `ux-cleanup`
**Status:** Spec — ready to implement
**Siblings:** `2026-05-09-more-tab-restructure.md`, `2026-05-09-parent-home-restructure.md`, `2026-05-09-progress-tab-currently-working-on.md`, `2026-05-09-positive-framing-copy-sweep.md`

## Why

Three things are true today:

1. **The Family tab + child-detail surface already exists** with substantial scaffolding: `family.tsx`, `child/[profileId]/index.tsx`, `reports.tsx`, `weekly-report/[weeklyReportId].tsx`, `report/[reportId].tsx`, `mentor-memory.tsx`, `subjects/[subjectId].tsx`, `topic/[topicId].tsx`, etc. Per-child accommodation editing already works via `useChildLearnerProfile` + `useUpdateAccommodationMode`.
2. **The product computes a lot of parent-relevant data** that never reaches the app — weekly reports (`weekly-report.ts`), monthly reports with LLM highlights + next steps (`monthly-report.ts`), and active focus areas (`learning_profiles.struggles`). All currently surface only via email/push.
3. **The user wants a single home for everything child-related** — child organization (add, switch, edit), per-child mode toggles, and reporting. Today these are split between More (active-profile-only accommodation), Family tab landing, and child-detail. The split forces parents to context-switch (impersonate a kid) just to change a setting.

We consolidate all child-management surfaces into the Family tab, enhance the per-child cards on the landing screen with already-computed data, complete the per-child settings hub on child-detail (no impersonation needed), and sweep all "struggle / declining / weak" copy into positive framing.

## Decisions (banked from discussion)

| ID | Decision |
|---|---|
| **D-FT-1** | Family tab is the single command center for child-related work: organization (add / switch / view kids), per-child mode toggles (accommodation, celebrations follow-up), and reporting (weekly + monthly + history). |
| **D-FT-2** | Per-child accommodation mode editing happens directly from child-detail without impersonation. The existing hook `useUpdateAccommodationMode` already supports per-child writes — just expose it in child-detail without requiring profile-switch. |
| **D-FT-3** | Per-child celebrations follow-up (from D1 of more-tab spec) appears on child-detail under the accommodation section, only when the child's accommodation is `short-burst` or `predictable`. Default `big_only`. |
| **D-FT-4** | The per-child cards on the Family tab landing surface the latest weekly `headlineStat` (computed via `generateWeeklyReportData(getLatestSnapshot(...))`, live mid-week) plus a "Currently working on: [topic name]" line when active focus areas exist. Tap → child detail. |
| **D-FT-5** | "Add a child" affordance lives **only in Family tab** (not duplicated in More). **Note (verified 2026-05-09):** the more-tab spec at `docs/plans/done/2026-05-09-more-tab-restructure.md` is finalized with "Add a child" still in More. Aligning the two is therefore a **code edit in this PR** (remove the "Add a child" row from `apps/mobile/src/app/(app)/more/index.tsx` and any `more.tsx`-equivalent), not a spec edit to the finalized doc. The finalized more-tab spec stays as a historical record; the code aligns with this spec. |
| **D-FT-6** | Empty state (no children, owner on Family/Pro plan) is the primary "Add your first child" flow. Already exists at `family.tsx:441-466` — keep as-is. |
| **D-FT-7** | Child-detail screen `/(app)/child/[profileId]` becomes the per-child settings + reporting hub: latest weekly headline (live), latest monthly highlights (LLM bullets + next steps), browsable history (already exists), per-child accommodation mode + celebrations follow-up, mentor memory link, subjects, sessions. |
| **D-FT-8** | Copy sweep: rewrite all UI-visible "struggle / struggling / declining / weak" to positive framing per `feedback_positive_framing_no_struggle`. Internal instrumentation names (`struggles` table, `struggle_noticed` event) unchanged. **Sweep ships as its own PR ahead of this one** (`2026-05-09-positive-framing-copy-sweep.md`) so Family-tab and the in-flight Progress redesign both inherit clean copy. |
| **D-FT-9** | "Currently working on" data is **not Family-tab-only** — it's a self-view signal too. The dashboard endpoint extension lands the data; Progress consumes it for self-view via the sibling spec `2026-05-09-progress-tab-currently-working-on.md`. Family/child-detail and Progress share the source. |
| **D-FT-10** | We considered unifying Progress and child-detail into a single profile-aware Progress tab (parent passes `?profileId=` to view a child's progress). **Rejected:** different audiences, different copy register (self-view vs. parent third-person), different navigation entry, different settings surfaces. The reuse already happens at the component level (`WeeklyReportCard`, `MonthlyReportCard`, `GrowthChart`, `ReportsListCard`, `RecentSessionsList`) — that's the right seam. Two routes, shared building blocks. |

## Affected Surfaces

### Family tab landing (`apps/mobile/src/app/(app)/family.tsx`)

**Current state:** Greeting + ProfileSwitcher header. `WithdrawalCountdownBanner` + `FamilyOrientationCue`. List of `ParentDashboardSummary` cards per child with stats (sessions, time, exchanges, ratio, streak, XP, subjects). `FamilySharingToggle` (breakdown sharing). `Add a child` card (when adult owner). Empty state with "Add child / Continue solo".

**Changes:**
- Enhance `ParentDashboardSummary` to show:
  - Latest weekly `headlineStat` ("12 words learned, up from 5 last week")
  - "Currently working on: [topic]" line when applicable (positively framed; sourced from `learning_profiles.struggles` JSON)
  - Existing stats (sessions, time, etc.) stay but shrink visually so the headline + working-on lead.
- Move `Add a child` card to a permanent position (above or below the kids list, owner-gated). Remove the `showFamilyManagement` gate that hides it before any kid is added; the empty state already handles "first add", but for a parent with 1 kid + capacity for more, the affordance should always be visible for adult owners.
- Keep `FamilySharingToggle` and `WithdrawalCountdownBanner`.
- Header back button unchanged (honors `returnTo` param).

### Child detail (`apps/mobile/src/app/(app)/child/[profileId]/index.tsx`)

**Current state:** Already imports `useChildLearnerProfile`, `useUpdateAccommodationMode`, `ACCOMMODATION_OPTIONS`, `ReportsListCard`, growth chart, recent sessions, retention signal, subject cards, mentor memory link. The per-child accommodation editing is wired but I need to verify it's actually exposed in the rendered UI (file > 80 lines, only top read).

**Changes:**
- Section order at the top of the scroll content (after header):
  1. **Latest weekly headline card.** Live-computed via `generateWeeklyReportData(getLatestSnapshot(childId))`. Shows the same headline the email surfaces, but in-app. Tap → reports list (already exists).
  2. **Latest monthly highlights card** (when available). Shows the 3 LLM-generated highlights + 2 next-steps from the most recent monthly report. Tap → that monthly report detail (already exists at `report/[reportId].tsx`).
  3. **Currently working on (positively framed).** Lists the active focus areas from `learning_profiles.struggles`. Empty state: hide section. Header copy: "Currently working on" — never "struggles" / "struggling".
  4. **Per-child settings:** accommodation mode picker (using existing `useUpdateAccommodationMode`), celebrations follow-up (only when accommodation is `short-burst` or `predictable`, per D-FT-3). Replaces the "go switch profiles to edit" pattern.
  5. **Existing surfaces:** subjects, growth chart, recent sessions, retention signal, mentor memory link, reports list link.

### `ParentDashboardSummary` component (`apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`)

- Extend props to accept `weeklyHeadline?: { label: string; value: number; comparison: string }` and `currentlyWorkingOn?: string[]` (max 2 entries shown, "and N more" if longer).
- Render new lines at the top of the card before the existing stats.
- All existing props/stats stay (no breaking changes for tests).
- Sweep any "struggling / declining / trend" copy in this component to positive framing.

### Copy sweep (per D-FT-8)

Files identified in initial grep that contain `struggle | declining | trouble | weak`:
- `apps/mobile/src/i18n/locales/{en,nb,de,es,pt,pl,ja}.json` — translation source
- `apps/mobile/src/app/(app)/family.tsx`
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
- `apps/mobile/src/app/(app)/practice/assessment/index.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.tsx`
- `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`
- `apps/mobile/src/components/library/RetentionPill.tsx`
- `apps/mobile/src/components/progress/RemediationCard.tsx`
- `apps/mobile/src/hooks/use-progress.ts`

**Rule per file:** any string that ships to the UI uses positive framing. Variable names, component names, type literals (`'struggling' | 'mastered' | ...`) can stay if internal-only. Translation keys themselves can stay (e.g. `progress.struggling`); only the rendered strings in each locale change.

Suggested replacements:
- "struggling with X" → "currently practicing X" / "working on X"
- "struggle" / "struggles" → "focus areas" / "currently working on"
- "declining" → "needs more time" / "due for review"
- "trouble with" → "practicing"
- "weak in" → "building fluency in"

### Sibling impact: More tab spec

**Update required in `2026-05-09-more-tab-restructure.md`:**
- Remove **D5** entirely. "Add a child" no longer appears in the More tab top section. Lives only in Family tab.
- The top of the More tab landing screen becomes: Learning Mode (with celebrations follow-up under short-burst/predictable, for the active profile only — i.e., the parent's own learning) + Mentor Memory link (conditional). No "Add a child" row.
- The accommodation section in More tab keeps editing the **active profile's own** accommodation only. For a parent's own learning prefs. Per-child accommodation moves to Family tab → child detail.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Weekly snapshot missing for a child | Child has never had a session | `headlineStat` line shows the existing quiet-week copy ("A first week is for warming up.") | Weekly-report generator already handles this. Card still renders. |
| `learning_profiles.struggles` empty for a child | Normal state for many kids | "Currently working on" section hidden | No empty placeholder. Less is more. |
| `learning_profiles.struggles` returns 5+ entries | Heavy practice load | Show first 2 + "and N more →" linking to child detail full list | Cap rendering to keep card compact. Full list visible in child detail. |
| Per-child accommodation update fails | API 5xx | Radio reverts; error alert ("Couldn't save setting") | Existing `onError` in mutation. No regression. |
| Per-child celebrations follow-up tries to write before accommodation save resolves | Race on consecutive taps | Second write may overwrite stale value | Mutations queue per profile; existing TanStack Query caching avoids dupe-fetches. Acceptable: last-write-wins for a setting toggle is fine. |
| Live weekly compute slow on cold load | First open, dashboard cache empty | Family tab cards show skeleton then resolve | `useDashboard` already handles loading. Live-compute happens server-side via the dashboard endpoint, not on the client. |
| Latest monthly report missing | Newly-added child or first month not yet rolled | Highlights card hidden | Section is conditional. Weekly headline still renders. |
| Copy sweep misses a locale | Translator left "struggle" in nb.json | User in Norwegian sees old word | Sweep checklist enumerates all 7 locale files. CI doesn't catch i18n drift; manual verification step in checklist. |
| Translation key renamed | Test or component string mismatch | Renders raw key (`more.family.struggleWith`) instead of human copy | Don't rename keys — only edit the values inside each locale file. Keeps tests stable. |
| Add-a-child shown to a non-adult-owner | Profile birthYear missing or owner is a teen | Row hidden by existing `isAdultOwner` helper | Already handled by `family.tsx:218`. Same helper as more-tab spec D5 (now removed from More). |
| Parent in impersonation lands on Family tab | Active profile is impersonated child | `<ParentOnly>` guard redirects | Already handled by `family.tsx:177-180` (`<ParentOnly>` wrapper). |
| Cross-tab `router.push` to `/(app)/child/[profileId]` from Notifications skipping the chain | Push tap from device | `router.back()` falls through to Home | Push the chain: `/(app)/family` then `/(app)/child/[profileId]`. Or set `unstable_settings.initialRouteName` on `(app)/child/[profileId]/_layout.tsx`. Verify per CLAUDE.md cross-stack rule. |

## Implementation Steps

> **Order:** ship the copy sweep PR (`2026-05-09-positive-framing-copy-sweep.md`) first so this PR doesn't collide with translation-file edits. The Progress "currently working on" PR (`2026-05-09-progress-tab-currently-working-on.md`) can ship before, after, or alongside this one — they share the data source but render in different routes.

0. **Schema + data source (shared with Progress spec).** Extend `apps/api/src/services/learner-profile.ts` to expose `getCurrentlyWorkingOn(profileId): Promise<string[]>`. **Verified 2026-05-09:** `learning_profiles.struggles` shape is `{ subject, topic, lastSeen, attempts, confidence, source }` (`packages/schemas/src/learning-profiles.ts:92-99`) — there is **no `resolvedAt` field**. Helper logic: filter by `lastSeen >= now - 30d` (tighter than the existing 90d archival at `learner-profile.ts:337-344`), optionally filter low-confidence single-shot entries (`confidence === 'low' && attempts < 2`), strip negative-framing prefixes from `topic` field, return `string[]` of bare topic labels. Cap server-side at 10 entries (UI caps at 3). Document the chosen window + confidence rule in the PR. Add `currentlyWorkingOn: string[]` to dashboard + inventory response schemas. Both Family's dashboard endpoint (`GET /v1/dashboard`, route file `apps/api/src/routes/dashboard.ts:65-79`, response schema `packages/schemas/src/progress.ts:358-363`) and Progress's inventory endpoint read from this helper.

1. **Backend: extend dashboard endpoint** to include `weeklyHeadline` and `currentlyWorkingOn` per child. Reuse `generateWeeklyReportData(getLatestSnapshot(childId))` for headline. Pull `currentlyWorkingOn` via the helper from step 0. Update `dashboardSchema` in `@eduagent/schemas`.
2. **Update `ParentDashboardSummary`** to accept and render `weeklyHeadline` + `currentlyWorkingOn`. Sweep any internal "struggle / declining" copy.
3. **Update Family tab landing** (`family.tsx`):
   - Pass new fields into `renderChildCards`.
   - Promote `Add a child` card to always-visible for adult owners (drop the `showFamilyManagement` gate around it). Empty state remains the dedicated path for zero-children.
   - Sweep "struggle / declining" copy.
4. **Enhance child-detail** (`child/[profileId]/index.tsx`):
   - Add latest weekly headline card at top (live).
   - Add latest monthly highlights card (when available).
   - Add "Currently working on" section (when non-empty).
   - Verify per-child accommodation mode picker is exposed in the rendered UI (file beyond line 80 was not read in this spec — implementer to verify and add if missing).
   - Add per-child celebrations follow-up under accommodation when mode is `short-burst` or `predictable`.
5. **Copy sweep — moved to its own PR.** See `2026-05-09-positive-framing-copy-sweep.md`. This PR depends on it landing first. The list of files in [Copy sweep (per D-FT-8)](#copy-sweep-per-d-ft-8) below is preserved here only as the inventory the sweep PR works from.
6. **Update `more.tsx`** (per D-FT-5): remove the "Add a child" row from the top section. (This is also documented in the updated more-tab spec.)
7. **Code edit (not a spec edit) for the More tab.** The more-tab spec at `docs/plans/done/2026-05-09-more-tab-restructure.md` is finalized; do not edit it. Instead, in this PR, remove the live "Add a child" row from `apps/mobile/src/app/(app)/more/index.tsx`. Per the agent verification, the More tab navigates to `/create-profile?for=child` (line 140) with a `child_progress_navigated` track event (line 145). Remove both the row and the track call (or repoint the track to the Family-tab origin if the analytics value matters).
8. **Tests:**
   - `family.test.tsx`: assert weekly headline renders per child card, "currently working on" visible when data present, hidden when empty.
   - `child/[profileId]/index.test.tsx`: assert weekly headline + monthly highlights + currently-working-on sections render, accommodation picker editable, celebrations follow-up appears under short-burst/predictable.
   - `ParentDashboardSummary.test.tsx`: new prop coverage.
   - `dashboard.integration.test.ts`: assert new fields present in response.
9. **Manual test on web + Galaxy S10e:**
   - Family tab with 1, 2, 3 kids — cards readable, scroll fine on small screen.
   - Child detail with full data, with no monthly report yet, with no focus areas, with multiple focus areas.
   - Accommodation mode change persists per child and reflects on next visit.
   - Celebrations follow-up appears/disappears as accommodation toggles.
   - Cross-tab push from Home ChildCard → Family tab → child detail → back returns to Family then Home (correct stack).

## Out of Scope

- Editing a child's name, birthYear, or profile photo from Family tab. Currently goes through `/profiles` and create-profile flow. Defer to a profile-edit pass.
- Deleting a child profile from Family tab. Currently lives elsewhere (likely `/profiles` or account-deletion flow). Defer.
- Reordering children. Defer until a parent with 4+ kids requests it.
- Per-child language preference. Defer — language is currently account-wide via i18n; per-child language is a larger multi-tenant change.
- Per-child notification preferences. Defer — notifications are account-wide today.
- Adding new report types (daily, biweekly, custom range). Defer.
- LLM-inferred "Anna struggled with X" signals. Explicitly out of scope — `learning_profiles.struggles` is real product instrumentation, not LLM inference. We use it positively framed.
- Replacing the existing `ParentDashboardSummary` design wholesale. Enhance, don't redesign.
- Animation / transitions on the new cards. Match the existing card style.
- **Unifying Progress and child-detail into a profile-aware Progress tab.** Considered and rejected — see D-FT-10. Don't reopen this without new evidence (e.g., a measurable confusion problem from real users about which screen shows what).

## Verification Checklist (before PR)

- [ ] Dashboard endpoint returns `weeklyHeadline` + `currentlyWorkingOn` per child.
- [ ] Family tab cards render headline + working-on (when present) above existing stats.
- [ ] Child-detail shows latest weekly headline, monthly highlights (when available), currently-working-on (when non-empty).
- [ ] Per-child accommodation picker on child-detail edits the child's profile (not the parent's). Verify by switching back to parent and confirming parent's accommodation unchanged.
- [ ] Celebrations follow-up appears on child-detail only when accommodation is `short-burst` or `predictable`.
- [ ] "Add a child" card shows on Family tab for adult owners with capacity. Hidden for non-adult, non-owner, at-capacity, in impersonation.
- [ ] No occurrence of "struggle / struggling / declining / trouble / weak" in any rendered UI string across all 7 locales. (Grep `apps/mobile/src/i18n/locales/*.json` and component `Text` children.)
- [ ] Sibling spec `2026-05-09-more-tab-restructure.md` updated: D5 removed, "Add a child" gone from layout + implementation steps.
- [ ] `pnpm exec nx run mobile:test`, `pnpm exec nx run api:test`, `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e — Family tab and child detail readable on 5.8" screen.
- [ ] Cross-stack navigation verified: Home ChildCard → Family → child detail → back stack returns Home → tabs intact.

## Coordination With Sibling Specs

- **Depends on:** `2026-05-09-positive-framing-copy-sweep.md` lands first, so this PR doesn't conflict on locale files.
- **Shares with:** `2026-05-09-progress-tab-currently-working-on.md` — both consume the `getCurrentlyWorkingOn` helper introduced in step 0. Whichever ships first owns the helper; the second consumes it.
- **Affects:** the live `more.tsx` code only (the more-tab spec is in `done/` and stays untouched). The "Add a child" row removal is an implementation step in this PR per step 7.
- **Suggested order:**
  1. Copy sweep (`2026-05-09-positive-framing-copy-sweep.md`) — clears the i18n decks.
  2. Parent home (smallest, deletes Gateway).
  3. Progress "currently working on" (`2026-05-09-progress-tab-currently-working-on.md`) OR Family tab (this doc) — either can go first; whichever does, lands the `getCurrentlyWorkingOn` helper. Other consumes it.
  4. More tab — last, with D5 removed.
