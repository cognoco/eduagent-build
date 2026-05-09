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

It also captures one inherited dependency (the copy sweep spec must land first) and a small follow-on cleanup that naturally falls out of touching this surface.

## Decisions

| ID | Decision |
|---|---|
| **D-PT-1** | Progress shows a "Currently working on" section for the active profile, sourced from `learning_profiles.struggles` filtered to active/non-resolved entries, positively rephrased at the API edge. Same helper as the Family-tab spec. |
| **D-PT-2** | Section placement: between the hero card (`progress.hero.*`) and the `GrowthChart`. Rationale: hero answers "how much did I accumulate?", the new section answers "what am I doing right now?", growth chart answers "what's the trend?" — it reads top-to-bottom as present-tense → past-tense. |
| **D-PT-3** | Copy register: child / parent / teen via `copyRegisterFor(role)`, same pattern as the existing `progress.register.*` keys. Section header is "Currently working on" / age-appropriate equivalent in each register. Never "struggle / struggling / declining / weak / trouble". |
| **D-PT-4** | Empty state: hide the section entirely. Less is more. A learner with no detected focus areas does not need a placeholder telling them so. (Same rule as the Family-tab spec.) |
| **D-PT-5** | Cap at 3 entries rendered inline. If more exist, render "and N more" as a non-link text suffix. **Do not** add a deep-link to a "full list" screen on Progress — that screen doesn't exist for self-view, and we are not building it in this spec. (Compare with Family-tab spec, which links to child-detail's full list — that surface exists.) |
| **D-PT-6** | The data source is the same helper introduced in `2026-05-09-family-tab-restructure.md` step 0: `getCurrentlyWorkingOn(profileId): Promise<string[]>`. Whichever spec ships first owns the helper; the other consumes it. The Progress endpoint we extend is `useProgressInventory` (returns `KnowledgeInventory`). Add a new field `currentlyWorkingOn: string[]` to the inventory response shape; do not introduce a separate query. |
| **D-PT-7** | Copy sweep on Progress files (`use-progress.ts`, `RemediationCard.tsx`, `RetentionPill.tsx`, locale files) is **inherited from `2026-05-09-positive-framing-copy-sweep.md`** and ships in that PR, not this one. This spec only adds new copy keys for the new section. |
| **D-PT-8** | Out of scope: profile-aware Progress (parent passes `?profileId=` to view a child). See Family-tab spec D-FT-10 — explicitly rejected. Progress remains active-profile self-view only. |

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

- After the hero card (line ~388 `View className="bg-coaching-card rounded-card p-5"` block, before the `<View className="mt-6"><GrowthChart .../></View>` block), add a new conditional section:
  ```tsx
  {inventory?.currentlyWorkingOn?.length ? (
    <CurrentlyWorkingOnCard
      items={inventory.currentlyWorkingOn}
      register={register}
      testID="progress-currently-working-on"
    />
  ) : null}
  ```
- No changes to the hero, growth chart, weekly report, monthly report, recent sessions, milestones, saved, or reports list sections.

#### New component: `apps/mobile/src/components/progress/CurrentlyWorkingOnCard.tsx`

- Props: `{ items: string[]; register: CopyRegister; testID?: string }`.
- Renders: section title from `progress.register.${register}.currentlyWorkingOnTitle`, a comma-separated list of the first 3 items (or `<bulleted list>` if that reads better in design — implementer chooses, document choice in PR), and "and N more" suffix when `items.length > 3`.
- No tap target. Static info card. Matches existing `bg-coaching-card rounded-card p-5` styling — should look like a sibling of the hero card, not a CTA.
- Co-located test: `CurrentlyWorkingOnCard.test.tsx` covering: 0 items (renders null — but the screen guards it; component should also guard for safety), 1 item, 3 items, 5 items (renders 3 + "and 2 more"), each register.

#### i18n (`apps/mobile/src/i18n/locales/{en,nb,de,es,pt,pl,ja}.json`)

Add new keys (positive framing only):
- `progress.register.child.currentlyWorkingOnTitle` — e.g. EN: "What you're working on right now"
- `progress.register.parent.currentlyWorkingOnTitle` — e.g. EN: "Currently working on"
- `progress.register.teen.currentlyWorkingOnTitle` — e.g. EN: "Currently working on"
- `progress.currentlyWorkingOn.andNMore` — e.g. EN: "and {{count}} more"

Translator note: each locale needs a register-aware version. Keep tone consistent with existing `progress.register.*` keys (encouraging for child, neutral for parent/teen).

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

## Implementation Steps

> **Order:** ship copy sweep PR first (`2026-05-09-positive-framing-copy-sweep.md`). Then this PR (or the Family-tab PR) introduces the `getCurrentlyWorkingOn` helper. The second consumer reuses it.

1. **Backend — helper.** If not already present from Family-tab spec: add `getCurrentlyWorkingOn(profileId)` per D-PT-6. Unit test in `learner-profile.test.ts` covering: empty, 1 active entry, 5 active entries, mix of resolved + active (only active returned), prefix stripping ("struggling with X" → "X").
2. **Backend — inventory endpoint.** Extend the response to include `currentlyWorkingOn: string[]`. Update `KnowledgeInventory` in `@eduagent/schemas`. Update existing inventory integration tests to assert the field is present (default `[]`).
3. **Schemas.** Update test fixtures that construct `KnowledgeInventory` literals — typecheck will surface the call sites.
4. **Mobile — component.** Create `CurrentlyWorkingOnCard.tsx` + co-located test. Register-aware title, capped to 3, "and N more" suffix. No tap target.
5. **Mobile — Progress screen.** Insert the conditional render between hero and growth chart. No other layout changes.
6. **i18n.** Add the new keys in all 7 locale files. Translator-friendly: keep keys parallel across locales.
7. **Tests.**
   - `progress.test.tsx`: assert section renders when `currentlyWorkingOn` non-empty, hidden when empty, capped at 3 with "and N more" beyond.
   - `CurrentlyWorkingOnCard.test.tsx`: as above.
   - `learner-profile.test.ts`: helper unit tests.
   - Inventory integration test: response shape includes the new field.
8. **Manual test on web + Galaxy S10e:**
   - Active profile with 0 active focus areas — section hidden.
   - Active profile with 1 — single label, no suffix.
   - Active profile with 5 — 3 labels + "and 2 more".
   - Switch profile mid-session — section updates (TanStack Query invalidation already keyed on `activeProfile.id`).
   - Each register (child, parent, teen) — title copy reads correctly.

## Verification Checklist (before PR)

- [ ] Inventory response includes `currentlyWorkingOn: string[]`, defaulting to `[]`.
- [ ] No rendered label in the new section contains "struggle", "struggling", "declining", "trouble", "weak". Grep tested across 7 locales + the new component.
- [ ] Section hidden when empty. Section visible with 1+ entries. Capped at 3 + "and N more" beyond.
- [ ] All 3 registers (child, parent, teen) have a localized title in all 7 locales.
- [ ] No tap target on the new card (it's information, not navigation).
- [ ] No new query — feature reuses `useProgressInventory`.
- [ ] `pnpm exec nx run mobile:test`, `pnpm exec nx run api:test`, `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e — Progress screen still readable on 5.8" with the extra section.
- [ ] Family-tab spec's `getCurrentlyWorkingOn` helper is reused, not duplicated. (Whichever PR shipped first.)

## Out of Scope

- Profile-aware Progress (parent passes `?profileId=`). Rejected in Family-tab spec D-FT-10.
- Tap-to-deep-link from a "currently working on" entry to the topic detail. Defer until we have evidence learners want navigation from this surface — for now it's a status reading, not a launchpad.
- A standalone "all current focus areas" screen for self-view. Family-tab has one for parents (child-detail). Self-view doesn't need one yet — capped list is sufficient.
- Showing historical / resolved focus areas ("things you used to work on"). Different feature, different intent.
- Reordering or prioritizing entries by recency / severity. Server returns in whatever order the helper produces; UI doesn't sort. If the order looks wrong in production, that's a server-side fix.
- Replacing `learning_profiles.struggles` with a new positively-named table. The internal name stays — see D-FT-8 in Family-tab spec.
- The copy sweep itself. See `2026-05-09-positive-framing-copy-sweep.md`.

## Coordination With Sibling Specs

- **Depends on:** `2026-05-09-positive-framing-copy-sweep.md` lands first, so the existing Progress-tab copy is clean before this layers new copy on top.
- **Shares with:** `2026-05-09-family-tab-restructure.md` — both consume `getCurrentlyWorkingOn`. Whichever ships first owns the helper.
- **Independent of:** parent-home-restructure, more-tab-restructure. Can ship in any relative order with those.
