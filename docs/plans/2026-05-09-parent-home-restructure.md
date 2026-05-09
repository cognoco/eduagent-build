# Parent Home Restructure

**Date:** 2026-05-09
**Branch:** `ux-cleanup`
**Status:** Spec — ready to implement
**Sibling:** `2026-05-09-more-tab-restructure.md`

## Why

Parents with linked children currently land on `ParentGateway.tsx` — a forced-choice screen with two intent cards (`Check child's progress` and `Learn something`). Both destinations duplicate things that already exist:

- **`Check child's progress`** → routes to `FAMILY_HOME_PATH`, the same destination as the **Family tab in the bottom nav**.
- **`Learn something`** → reveals `LearnerScreen` (the actual home with subjects, sessions, homework camera, ask-anything, practice).

Net effect: every visit, a parent must take an extra tap to reach the real home, and the "extra value" they get from the gate is a single weak signal ("TestKid hasn't practiced this week") that already lives in the Family tab. The Gateway is dead weight — it gatekeeps the home from itself.

We delete the Gateway, land parents directly on `LearnerScreen`, and add a single prominent **ChildCard** at the top of the home that gives parents a real glance at every linked child.

## Decisions (banked from discussion)

| ID | Decision |
|---|---|
| **D-PH-1** | Delete `ParentGateway.tsx`. Parents (owners with linked children) land on `LearnerScreen` directly, same render path as solo learners. |
| **D-PH-2** | Add a **ChildCard** at the top of `LearnerScreen`, conditional on having linked children. Visual weight matches existing `IntentCard`. Tapping anywhere on the card navigates to the Family tab. |
| **D-PH-3** | ChildCard layout: **1 child** = single-line headline + status; **2+ children** = stacked compact mini-rows (one row per child). Glance shows all children, not a sample. |
| **D-PH-4** | Signal logic = **reuse the weekly report `headlineStat`**. Single source of truth with the existing email + Family tab. Already handles quiet weeks gracefully ("No activity this week — that's OK. A nudge can help."). Computed server-side via `generateWeeklyReportData(getLatestSnapshot(childId))` and returned per child on the dashboard endpoint. **Depends on the dashboard-endpoint extension committed in `2026-05-09-family-tab-restructure.md` D-FT-4.** No `lastActivityAt` field needed. No invented inactivity-first logic. |
| **D-PH-5** | Move `WithdrawalCountdownBanner` from `ParentGateway` into `LearnerScreen` (rendered at top, above the ChildCard if both present). It's not Gateway-specific. |
| **D-PH-6** | The `?view=learner` query param on `/home` becomes a no-op. Remove the `useEffect` that reads it. Any internal callers that pushed `?view=learner` simply push `/home` instead. |
| **D-PH-7** | The parent's own intent actions (Homework, Ask anything, Practice) and subjects render below the ChildCard, unchanged. Parents who don't actively learn fall through the existing empty-subjects state — no special handling. |

## Final Layout

```
─── Home (parent with 2 linked children) ───
[ Greeting: "Good afternoon, Zuzana!" ]
[ Subtitle: weekend / time-of-day copy   ]

[ WithdrawalCountdownBanner (conditional) ]

┌─ Children ───────────────────────────────┐
│  TestKid                                 │
│  Hasn't practiced in 7 days              │
│  ────────────────────────                │
│  Anna                                    │
│  24 min this week                        │
│                                       →  │
└──────────────────────────────────────────┘

[ Homework intent card (highlighted) ]
[ Ask anything intent card           ]
[ Practice intent card               ]
[ Subjects grid                       ]
[ EarlyAdopterCard / CoachBand        ]
```

```
─── Home (solo learner, no children) ───
[ Greeting + subtitle ]
[ Homework + intents + subjects ] ← unchanged from today
```

## Behavior Changes

### `home.tsx` simplification (D-PH-1, D-PH-6)
- Remove `ParentGateway` import and JSX branch.
- Remove `showLearnerView` state, `setShowLearnerView`, and the `view === 'learner'` `useEffect`.
- Remove `isParentGatewayEligible` / `showParentGateway` / `hasLinkedChildren`.
- Always render `<LearnerScreen profiles={profiles} activeProfile={activeProfile} />`.
- The `onBack` prop on `LearnerScreen` (used to return to Gateway) becomes unused — drop it from the props and call sites.

### `LearnerScreen.tsx` — child-aware top section (D-PH-2, D-PH-3, D-PH-5)
- New props: none required — read `profiles` and `activeProfile` already in scope, derive `linkedChildren` locally.
- Render order at the top of the scroll content (after greeting):
  1. `<WithdrawalCountdownBanner />` (moved from Gateway, no-op when no pending withdrawal — already self-conditional)
  2. `<ChildCard linkedChildren={linkedChildren} dashboard={dashboard} />` — only when `activeProfile?.isOwner && linkedChildren.length > 0`
  3. Existing intent actions + subjects grid + coach band (unchanged)

### New `ChildCard` component (D-PH-2, D-PH-3, D-PH-4)
- File: `apps/mobile/src/components/home/ChildCard.tsx`
- Props: `{ linkedChildren: ReadonlyArray<Profile>, dashboard: DashboardData | undefined }`
- Reads `dashboard.children` to get per-child stats. If dashboard is loading/error: render a skeleton with the children's names but no signal — never block the home on dashboard load.
- Signal logic per child (D-PH-4): render `child.weeklyHeadline` directly. The shape is `{ label: string; value: number; comparison: string }` already produced by `generateWeeklyReportData` server-side. Example UI: `Anna · 12 words learned · up from 5 last week`.
- No client-side computation, no new signal heuristics. Single source of truth with email + Family tab.
- 1 child: single block layout.
- 2+ children: stacked mini-rows separated by a thin divider. Each row is `name` + signal line.
- Whole card is one `Pressable`, `onPress` navigates to `FAMILY_HOME_PATH` (same destination the Gateway used).
- testID: `home-child-card`. Per-row testID: `home-child-card-row-{profileId}`.
- Reuses existing `dashboard.ts` shape — no new schema or API needed.

### Field added to dashboard (committed in sibling spec)
- The dashboard endpoint extension lives in `2026-05-09-family-tab-restructure.md` step 1 (`weeklyHeadline` per child, plus `currentlyWorkingOn` for Family tab). The home ChildCard reads the same `weeklyHeadline` field. Both surfaces ship together or in either order — the home spec depends on this field being present but doesn't own the server change.

## Failure Modes

Per CLAUDE.md UX Resilience: every feature must enumerate failure paths with a Recovery column.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Dashboard query fails for parent | API 5xx / network | ChildCard renders names only with no signal line; no error UI | Card stays present and tappable → Family tab. Family tab shows the real error UI. Acceptable: home should never block on dashboard. |
| Dashboard query slow on cold start | First open, network | ChildCard renders skeleton (children names + "—") while loading | Skeleton resolves on data arrival. No spinner — silent loading. |
| `linkedChildren` is empty array | Owner with no kids (e.g., on Family/Pro plan but hasn't added a child yet) | ChildCard not rendered | Same as solo learner experience. The "Add a child" affordance lives in More tab (per D5 of more-tab spec) and Family tab. |
| `linkedChildren` has children but none in `dashboard.children` | Stale dashboard cache after adding a kid | ChildCard renders stale child set; new kid invisible | `useDashboard` invalidates on profile-list change. If race persists: card refreshes on next mount. Acceptable. |
| Parent in impersonation (viewing a child's home as the parent) | Active profile is impersonated child | ChildCard hidden | Use `activeProfile?.isOwner === true` for the gate (matches existing LearnerScreen logic). When impersonating, the active profile is the child (not owner), so the card naturally hides. Do not introduce `useActiveProfileRole()` here — keep one consistent predicate across the file. |
| `WithdrawalCountdownBanner` and ChildCard both present | Pending withdrawal + linked children | Both render; banner above card | Acceptable. Banner is rare and important — should not be hidden. |
| `?view=learner` deep link from a notification or external source | Pre-deploy notification with old param | Lands on home; param ignored | No-op. Drop the `useEffect`. Internal callers updated to push `/home` plain. |
| `IntentCard` "Learn something" still referenced in i18n / tests | Stale references after Gateway delete | Build passes but dead translations | Sweep `home.parentGateway.*` keys after delete. Note as part of step 7 below. |
| Parent has 5+ kids | Edge case for some homeschool families | Card grows tall, scrolls into the page | Acceptable visually. If it becomes a problem: cap mini-rows at 4 with "and N more →" tail. Defer until reported. |
| Tap on the ChildCard during a mid-loading state | Dashboard not yet loaded but card rendered | Navigates to Family tab; Family tab handles its own loading | Family tab already owns its loading state. No special handling needed. |
| Child has never practiced | New child profile, no sessions yet | `weeklyHeadline.comparison` falls into the existing `weekly-report.ts` quiet-week branch: "No activity this week — that's OK. A nudge can help." or "A first week is for warming up." | Correct, no special handling. The headline generator already covers this. |

## Implementation Steps

1. **Verify `weeklyHeadline` is present on `dashboard.children[i]`.** This field is added by the sibling Family tab spec (`2026-05-09-family-tab-restructure.md` step 1). If that spec hasn't shipped yet, ship it first, or include the dashboard endpoint extension in this PR. No `lastActivityAt` needed — the weekly headline already encodes activity / inactivity gracefully via the existing `weekly-report.ts` quiet-week handling.
2. **Create `ChildCard.tsx`** in `apps/mobile/src/components/home/`. Co-located test file `ChildCard.test.tsx` covers: 1-child render, 2+ children render, dashboard loading state, dashboard error state, navigation on tap.
3. **Update `LearnerScreen.tsx`:**
   - Import `ChildCard` and `WithdrawalCountdownBanner`.
   - Derive `linkedChildren` from `profiles` + `activeProfile`.
   - Render banner + card at top, before existing intent actions.
   - Drop unused `onBack` prop.
4. **Update `home.tsx`:**
   - Remove `ParentGateway` import + branch.
   - Remove `showLearnerView`, `setShowLearnerView`, `view === 'learner'` effect.
   - Remove `hasLinkedChildren`, `isParentGatewayEligible`, `showParentGateway`.
   - Render `<LearnerScreen />` unconditionally (after loading guard).
5. **Delete `ParentGateway.tsx` + `ParentGateway.test.tsx`.**
6. **Sweep `home.parentGateway.*` i18n keys.** Locate and remove orphans across all locale files.
7. **Sweep callers of `?view=learner`.** Grep for `view=learner` and `view: 'learner'`. Update to push `/home` plain. Remove the param from any deep links.
8. **Update `LearnerScreen.test.tsx`:** add coverage for the parent path (owner + linked children → ChildCard renders). Existing solo-learner coverage stays.
9. **Update `home.test.tsx`:** remove Gateway-related assertions; add assertion that parent with linked kids sees `LearnerScreen` directly with the ChildCard present.
10. **Manual test on web + Galaxy S10e:**
    - Parent with 1 linked kid: card renders, taps → Family.
    - Parent with 2-3 linked kids: stacked rows, all visible, tap → Family.
    - Parent with 0 kids on Family plan: same view as solo learner, no ChildCard.
    - Parent in impersonation: ChildCard hidden, viewing the impersonated child's learner home.
    - Solo learner: completely unchanged.
    - Pending withdrawal: banner renders above ChildCard.

## Out of Scope

- Per-child detail view inside the card (clicking a single row vs. the whole card). Whole-card-to-Family is the v1; per-row drill-in is a follow-up if usage warrants.
- "Today feed" of signals (struggled with X, finished book Y) — explicitly deferred. Requires real signal-quality work and risks false-confidence claims (`feedback_llm_prompt_injection_surfacing` adjacent concern).
- Removing the `Family` tab from bottom nav. Stays. ChildCard supplements it, doesn't replace it.
- Restructuring the Family tab landing screen. Separate concern.
- Greeting copy revisions ("Weekend learning? Nice!" assumes the user is a learner — currently fires for parents too). Defer to a copy pass.
- Any changes to `CoachBand`, `EarlyAdopterCard`, intent action icons, or subject grid behavior.
- Server-side dashboard schema changes if `lastActivityAt` is missing — see step 1 for branch decision.

## Verification Checklist (before PR)

- [ ] `ParentGateway.tsx` and `.test.tsx` deleted.
- [ ] `home.tsx` no longer imports `ParentGateway`; `showLearnerView` state gone.
- [ ] No matches in repo for `parentGateway`, `view=learner`, `view: 'learner'`, `showParentGateway`.
- [ ] `LearnerScreen.tsx` renders `WithdrawalCountdownBanner` and `ChildCard` at the top for owners with linked kids.
- [ ] `ChildCard` hidden for: solo learners, owners without children, impersonated child profiles.
- [ ] 1-child layout: single block. 2+ children: stacked mini-rows.
- [ ] Tapping anywhere on the card navigates to `FAMILY_HOME_PATH`.
- [ ] Dashboard loading: card shows skeleton, never blocks home render.
- [ ] Dashboard error: card shows names without signal lines, still tappable.
- [ ] `pnpm exec nx run mobile:test` and `pnpm exec nx lint mobile` clean.
- [ ] `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e (5.8") — card readable, tappable, doesn't push intent actions off-screen.
- [ ] Smoke-tested on web.

## Coordination With Sibling Specs

- **`2026-05-09-family-tab-restructure.md`:** owns the dashboard-endpoint extension that adds `weeklyHeadline` per child (step 1 of that spec). The home ChildCard reads the same field. Either ship Family tab first, or include the server change in this PR. The two surfaces are designed to share the same per-child payload.
- **`2026-05-09-more-tab-restructure.md`:** independent. No shared files.
- **Suggested order:** Family tab first (server change + per-child surfaces), then this spec (home consumes the new field), then More tab (cleanup of the cross-cutting "Add a child" duplication, etc.). All three can also ship together.
