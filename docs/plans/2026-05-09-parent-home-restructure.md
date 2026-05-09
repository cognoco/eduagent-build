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
| **D-PH-4** | Signal logic = **reuse the weekly report headline**. Single source of truth with the existing email + Family tab. Already handles quiet weeks gracefully ("No activity this week — that's OK. A nudge can help."). The dashboard endpoint exposes a per-child `weeklyHeadline: { label, value, comparison }` field, populated server-side from the existing `generateWeeklyReportData` output. **The wiring (snapshot fetch → metrics → `generateWeeklyReportData` → dashboard response) is owned by `2026-05-09-family-tab-restructure.md` step 1.** This spec consumes `child.weeklyHeadline` only. No `lastActivityAt` field needed. No invented inactivity-first logic. |
| **D-PH-5** | Move `WithdrawalCountdownBanner` from `ParentGateway` into `LearnerScreen` (rendered at top, above the ChildCard if both present). It's not Gateway-specific. |
| **D-PH-6** | The `?view=learner` query param on `/home` becomes a no-op. Remove the `useEffect` that reads it. Any internal callers that pushed `?view=learner` simply push `/home` instead. |
| **D-PH-7** | The parent's own intent actions (Homework, Ask anything, Practice) and subjects render below the ChildCard, unchanged. Parents who don't actively learn fall through the existing empty-subjects state — no special handling. |

## Final Layout

```
─── Home (parent with 2 linked children) ───
[ Greeting: "Hey Zuzana!" (existing LearnerScreen copy) ]
[ Subtitle: weekend / time-of-day copy                  ]

[ EarlyAdopterCard (existing, top of scroll)            ]
[ CoachBand (existing, conditional)                     ]
[ WithdrawalCountdownBanner (conditional, moved here)   ]

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
```

> Greeting reads "Hey Zuzana!" not "Good afternoon, Zuzana!" — `LearnerScreen.tsx:458` renders `Hey {firstName}!`. A parent-aware greeting branch is **out of scope** for this spec; see Out of Scope.

> Render order matches the existing `LearnerScreen` ScrollView: `EarlyAdopterCard` and `CoachBand` stay at the top (they precede ChildCard). The new ChildCard slots **between CoachBand and the intent actions**.

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
- Render order inside the existing ScrollView (preserves current layout, slots two new blocks):
  1. `EarlyAdopterCard` (existing, line 473 today — unchanged)
  2. `CoachBand` (existing, line 480 today — unchanged)
  3. `<WithdrawalCountdownBanner />` **(new at this position)** — moved from Gateway, no-op when no pending withdrawal (already self-conditional)
  4. `<ChildCard linkedChildren={linkedChildren} dashboard={dashboard} />` **(new)** — only when `activeProfile?.isOwner === true && linkedChildren.length > 0`
  5. Intent actions block (existing, line 489 — unchanged)
  6. Subjects grid (existing, line 540 — unchanged)
- `ChildQuotaLine` (currently rendered at `LearnerScreen.tsx:463` for any non-impersonated profile) must hide when the same parent-with-kids predicate holds — adult owners with linked children don't need to see their own daily quota under "Hey Zuzana!". Update the line to `{!isParentProxy && !(activeProfile?.isOwner === true && linkedChildren.length > 0) ? <ChildQuotaLine /> : null}`.

### New `ChildCard` component (D-PH-2, D-PH-3, D-PH-4)
- File: `apps/mobile/src/components/home/ChildCard.tsx`
- Props: `{ linkedChildren: ReadonlyArray<Profile>, dashboard: DashboardData | undefined }`
- Reads `dashboard.children` to get per-child stats. If dashboard is loading/error: render a skeleton with the children's names but no signal — never block the home on dashboard load.
- Signal logic per child (D-PH-4): render `child.weeklyHeadline` directly. The shape is `{ label: string; value: number; comparison: string }`, populated server-side from the existing `generateWeeklyReportData` output by the dashboard endpoint. Example UI: `Anna · 12 words learned · up from 5 last week`.
- No client-side computation, no new signal heuristics. Single source of truth with email + Family tab.
- **Component decision:** intentionally a separate component from `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`. The home glance is one line per child (compact, scannable); the dashboard summary is the full stats grid. Both consume `dashboard.children[i]` but render different layouts. Duplication is acceptable for two surfaces with different visual budgets — do not extract a shared abstraction yet.
- 1 child: single block layout.
- 2+ children: stacked mini-rows separated by a thin divider. Each row is `name` + signal line.
- Whole card is one `Pressable`, `onPress` navigates to `FAMILY_HOME_PATH` (same destination the Gateway used).
- testID: `home-child-card`. Per-row testID: `home-child-card-row-{profileId}`.
- Reuses existing `dashboard.ts` shape — no new schema or API needed.

### Field added to dashboard (committed in sibling spec)
- The dashboard endpoint extension lives in `2026-05-09-family-tab-restructure.md` step 1 (`weeklyHeadline` per child, plus `currentlyWorkingOn` for Family tab). The home ChildCard reads the same `weeklyHeadline` field. **This PR is a hard consumer:** Family tab step 1 must land first. See Coordination section for the order pin.
- **Field name:** the dashboard schema field is `weeklyHeadline` (the underlying weekly-report internal field is `headlineStat` — different surface, different name on purpose). The sibling spec's D-FT-4 uses `headlineStat` colloquially; the schema name to align on across both PRs is `weeklyHeadline`.

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

1. **Verify `weeklyHeadline` is present on `dashboard.children[i]`.** This field is added by the sibling Family tab spec (`2026-05-09-family-tab-restructure.md` step 1). **Ship Family tab step 1 first — it is a hard prerequisite for this PR.** The home ChildCard cannot render without the field. No `lastActivityAt` needed — the weekly headline already encodes activity / inactivity gracefully via the existing `weekly-report.ts` quiet-week handling. (If for any reason the order has to flip, the dashboard schema + handler change must be lifted into this PR with: extend `dashboardChildSchema` in `packages/schemas/src/progress.ts:309-330`, wire the snapshot fetch + `generateWeeklyReportData` call in `apps/api/src/services/dashboard.ts` next to the existing `getLatestSnapshot` import at line 56-57, and add an integration-test assertion that the new field is present in the response.)
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
7. **Retire `?view=learner` end-to-end.** The constant `LEARNER_HOME_HREF = '/(app)/home?view=learner'` at `apps/mobile/src/lib/navigation.ts:6` is the central choke point — change it to `/(app)/home`. That alone fixes the four production callers (`practice/index.tsx`, `quiz/index.tsx`, `topic/relearn.tsx`, `create-subject.tsx`). Then update the test files that assert the URL string literally:
   - `apps/mobile/src/app/(app)/practice/index.test.tsx:100`
   - `apps/mobile/src/app/(app)/quiz/index.test.tsx:199`
   - `apps/mobile/src/app/create-subject.test.tsx:828`
   - `apps/mobile/src/app/(app)/topic/relearn.test.tsx:61` (factory mapping `returnTo === 'learner-home'`)
   - `apps/mobile/src/app/(app)/home.test.tsx:150-156` (the "restores the parent learner view when view=learner is in the route" test — delete; the behavior no longer exists)
   Then grep `view=learner` and `view: 'learner'` repo-wide and confirm no surviving occurrences.
8. **Update `LearnerScreen.test.tsx`:** add coverage for the parent path (owner + linked children → ChildCard renders). Existing solo-learner coverage stays.
9. **Update `home.test.tsx`:** remove Gateway-related assertions; add assertion that parent with linked kids sees `LearnerScreen` directly with the ChildCard present.
10. **Sweep Maestro E2E flows.** ~14 flow YAMLs reference Gateway testIDs (`parent-gateway`, `gateway-check-progress`, `gateway-learn`) or step through the Gateway as setup; deleting the JSX without updating them will break the parent suite end-to-end. Update or replace:
    - `apps/mobile/e2e/flows/_setup/return-to-home-check-gateway.yaml` (rename or repurpose; gateway no longer exists)
    - `apps/mobile/e2e/flows/_setup/dismiss-post-approval.yaml`
    - `apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml`
    - `apps/mobile/e2e/flows/_setup/open-family-dashboard.yaml`
    - All parent flows under `apps/mobile/e2e/flows/parent/`: `add-first-child-gate.yaml`, `parent-tabs.yaml`, `child-session-recap.yaml`, `multi-child-dashboard.yaml`, `add-child-profile.yaml`, `child-drill-down.yaml`, `consent-management.yaml`, `subject-raw-input-audit.yaml`, `parent-dashboard.yaml`, `parent-library.yaml`, `child-memory-consent-prompt.yaml`, `guided-label-tooltip.yaml`
    - `apps/mobile/e2e-web/testid-audit.md` — refresh the audit reference
    Land parents directly on `learner-screen` and tap the new `home-child-card` where flows previously routed through the Gateway. Run `/e2e` suite green before merging.
11. **Manual test on web + Galaxy S10e:**
    - Parent with 1 linked kid: card renders, taps → Family.
    - Parent with 2-3 linked kids: stacked rows, all visible, tap → Family.
    - Parent with 0 kids on Family plan: same view as solo learner, no ChildCard, no `ChildQuotaLine` visual change.
    - Parent in impersonation: ChildCard hidden, viewing the impersonated child's learner home.
    - Solo learner: completely unchanged — `ChildQuotaLine` still rendered for them.
    - Parent owner with kids: `ChildQuotaLine` hidden under greeting (no daily quota line for adults who don't actively learn).
    - Pending withdrawal: banner renders above ChildCard.

## Out of Scope

- Per-child detail view inside the card (clicking a single row vs. the whole card). Whole-card-to-Family is the v1; per-row drill-in is a follow-up if usage warrants.
- "Today feed" of signals (struggled with X, finished book Y) — explicitly deferred. Requires real signal-quality work and risks false-confidence claims (`feedback_llm_prompt_injection_surfacing` adjacent concern).
- Removing the `Family` tab from bottom nav. Stays. ChildCard supplements it, doesn't replace it.
- Restructuring the Family tab landing screen. Separate concern.
- Greeting copy revisions. Parents will see `Hey {firstName}!` (current `LearnerScreen` greeting), not the gateway-style `Good afternoon, X`. Subtitle still uses `getGreeting()` for time-of-day flavor, but the headline stays kid-flavored. A parent-aware greeting branch (`activeProfile?.isOwner === true && linkedChildren.length > 0` → render `getGreeting().title`) is **deferred** to a separate copy pass — adding it here would couple two unrelated changes. Acknowledged compromise.
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
- [ ] `LEARNER_HOME_HREF` updated to `/(app)/home`; no repo-wide matches for `view=learner` or `view: 'learner'` outside this plan doc.
- [ ] `home.test.tsx` "restores the parent learner view when view=learner" test deleted (behavior gone).
- [ ] `ChildQuotaLine` hidden for parent owners with linked children; still visible for solo learners.
- [ ] Maestro parent flows updated; no surviving references to `parent-gateway`, `gateway-check-progress`, `gateway-learn` in `apps/mobile/e2e/flows/**` or `e2e-web/testid-audit.md`.
- [ ] `/e2e` parent suite green on staging.
- [ ] `pnpm exec nx run mobile:test` and `pnpm exec nx lint mobile` clean.
- [ ] `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e (5.8") — card readable, tappable, doesn't push intent actions off-screen.
- [ ] Smoke-tested on web.

## Coordination With Sibling Specs

- **`2026-05-09-family-tab-restructure.md`:** owns the dashboard-endpoint extension that adds `weeklyHeadline` per child (step 1 of that spec). **Hard prerequisite for this PR** — the home ChildCard cannot render without the field. If the order has to flip, the server change moves into this PR (see step 1 of Implementation Steps).
- **Field-name alignment:** the dashboard schema field is `weeklyHeadline` (not `headlineStat`). The sibling spec's D-FT-4 references `headlineStat` colloquially because that's the internal weekly-report field name; both specs must agree the **schema** name on `dashboardChildSchema` is `weeklyHeadline`.
- **`2026-05-09-more-tab-restructure.md`:** independent. No shared files.
- **Suggested order:** copy sweep → Family tab (server + per-child surfaces) → **this spec** (home consumes the new field) → Progress "currently working on" → More tab. The Family-tab spec's own "Suggested order" puts Parent Home before Family tab — that is incorrect given the dependency above; resolve in favor of Family-tab-first, or accept lifting the dashboard change into this PR.
