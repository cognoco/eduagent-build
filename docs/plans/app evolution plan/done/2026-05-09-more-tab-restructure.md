# More Tab Restructure

**Date:** 2026-05-09
**Branch:** `ux-cleanup`
**Status:** Spec — ready to implement

## Why

The More tab in `apps/mobile/src/app/(app)/more.tsx` currently flattens 9 sections (~1000 lines) into a single scroll. Some are core product config (Learning Accommodation, Mentor Memory). Most are visited rarely (Notifications, Privacy/Withdrawal Archive, Account, Help, Legal, Export, Delete). Mixing both makes the meaningful settings feel skippable and the rare ones feel like clutter — the screen reads as a junk drawer.

We restructure into a **master/detail** layout: live product config stays inline at the top; rarely-visited groups become link rows that open dedicated sub-screens with back navigation. We also remove the user-facing `Celebrations` choice (everyone gets all celebrations by default; accommodation users get an inline follow-up).

## Decisions (banked from discussion)

| ID | Decision |
|---|---|
| **D1** | Celebrations always-on by default. No global menu entry. When user picks `short-burst` or `predictable` accommodation, an inline follow-up appears under the radio: `All / Big wins only / Off`, defaulting to `Big wins only`. |
| **D2** | More tab becomes master/detail. Top: live product config (Accommodation, Mentor Memory, Add child). Bottom: 4 link rows opening sub-screens with back nav. |
| **D3** | No "Other" bucket. Items split into `Privacy & data` (withdrawal archive, privacy policy, terms, export, delete) and `Help & feedback` (help, report a problem). |
| **D4** | Sign out stays at the bottom of the main More screen (not inside Account) — destructive, expected to be visible. |
| ~~**D5**~~ | ~~"Add a child" visible to all owners aged 18+~~ **Superseded by `2026-05-09-family-tab-restructure.md` D-FT-5: "Add a child" lives only in Family tab. Remove the row from the More tab top section.** |

## Final Layout

```
─── More tab landing screen ───
┌─ Learning Mode ──────────────┐
│  ○ None                      │
│  ○ Short-burst   ┐ inline    │
│    └ Celebrations: All / Big │
│      wins only / Off         │
│  ○ Audio-first               │
│  ○ Predictable   ┐ inline    │
│    └ Celebrations: All / Big │
│      wins only / Off         │
└──────────────────────────────┘
[ What my mentor knows  → ]   conditional: !hideMentorMemory
[ Add a child           → ]   conditional: owner && age >= 18
─────────────────────────────
[ Notifications        → ]
[ Account              → ]
[ Privacy & data       → ]
[ Help & feedback      → ]
─────────────────────────────
[ Sign out ]                  hidden in impersonation
v1.4.2
```

## Sub-screen Contents

### `(app)/more/notifications.tsx`
- Push notifications (toggle)
- Weekly digest push (toggle)
- Weekly email digest (toggle)
- Monthly email digest (toggle)

### `(app)/more/account.tsx`
- Profile → `/profiles`
- Account security (existing `<AccountSecurity />` block, owner only)
- App language (converted from in-page modal to inline picker on this screen, owner + non-owner)
- Subscription (owner only)

### `(app)/more/privacy.tsx`
- Withdrawal archive preference (3 radios, owner only)
- Privacy policy → `/privacy`
- Terms of service → `/terms`
- Export my data (owner only)
- Delete account → `/delete-account` (owner only)

### `(app)/more/help.tsx`
- Help & support (mailto)
- Report a problem (opens FeedbackProvider)

## Routes

Sub-screens live under `(app)/more/` so the namespace is clean and Expo Router treats them as nested routes. The existing `(app)/more.tsx` is **moved** to `(app)/more/index.tsx` — Expo Router does not allow both `more.tsx` and a `more/` directory to coexist (the directory wins and the sibling file becomes unreachable). This matches the convention used by every other nested route in this app (`progress/`, `quiz/`, `practice/`, `shelf/`, etc.).

- `apps/mobile/src/app/(app)/more/_layout.tsx` — Stack with header back button. **Must export `unstable_settings = { initialRouteName: 'index' }`** per CLAUDE.md repo guardrail and matches `progress/_layout.tsx:4-6`.
- `apps/mobile/src/app/(app)/more/index.tsx` — landing (moved from `more.tsx`, restructured)
- `apps/mobile/src/app/(app)/more/notifications.tsx`
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(app)/more/privacy.tsx`
- `apps/mobile/src/app/(app)/more/help.tsx`

After the move, `notifications/account/privacy/help` are nested under More via the folder. CLAUDE.md's cross-stack push rule applies if anything ever deep-links to `/more/account` from another tab — `unstable_settings.initialRouteName = 'index'` is the safety net. Nothing currently deep-links there, so this is future-proofing.

The corresponding `more.test.tsx` should also move to `more/index.test.tsx`.

## Behavior Changes

### Celebrations (D1)
- `useCelebration` (in `apps/mobile/src/hooks/use-celebration.tsx`) currently reads `celebrationLevel` from settings and applies `filterByLevel`.
- After this change: `useCelebration` accepts `accommodationMode` AND `celebrationLevel`. If accommodation is `none` or `audio-first`, treat level as `'all'` regardless of stored value. If accommodation is `short-burst` or `predictable`, honor the stored value (default `'big_only'` on first set).
- Consumers in `home.tsx` and `session/index.tsx` pass both values.
- The DB column, route (`/celebrations`), and service stay — they're still actively used by the inline follow-up under accommodation. Only the standalone Celebrations section in More is removed; nothing is vestigial.

### Add a child (D5)
- New helper: `isAdultOwner(profile)` returning `role === 'owner' && (currentYear - profile.birthYear) >= 18`.
- Use existing `packages/schemas/src/age.ts` helper or extend it. Conservative bias is unnecessary — downstream `handleAddChild` still gates on plan tier and profile capacity.
- Renders the `Add a child` row in two places: top of More tab landing screen (always for adult owners) AND existing Family tab (already does so).

## Failure Modes

Per CLAUDE.md UX Resilience rules: every feature must enumerate failure paths with a Recovery column.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Sub-screen route fails to load | Bundle split error / network | Blank/white screen on tap | Sub-screens are static; failure is a build-time bug. Smoke-test all 4 routes on web + mobile in PR. |
| Back nav from sub-screen falls through to Home (cross-tab pollution) | User deep-links into `/(app)/more/account` from notification or external link | `router.back()` lands on Home, not More | Sub-screens push the chain: `router.push('/(app)/more')` then push the sub-screen. Or rely on `_layout.tsx` Stack default — verified per cross-stack rule in CLAUDE.md. |
| `handleAddChild` shown to a minor owner | birthYear missing or stale on profile | Minor sees row, taps, hits upsell | Defensive: if `birthYear` is `null/undefined`, hide the row (treat as "unknown age, conservative hide"). |
| `useCelebration` receives missing accommodation mode | Profile load race | `accommodationMode` is undefined on first render | Default to `'none'` when undefined → celebrations always-on. Matches D1's "always-on by default". |
| Language picker fails to open / write | Stored language IO fails | Picker doesn't dismiss / language unchanged | Existing error handling in `handleLanguageChange` (alert with retry copy) carries over to the new sub-screen. |
| Withdrawal archive write fails | API 5xx | Radio reverts; error alert | Existing `onError` in mutation. No regression. |
| Sign out fails in impersonation | Should never render in impersonation | n/a | Already gated by `!isImpersonating`. |
| Celebration follow-up not shown for accommodation mode that needs it | Logic bug in conditional | Quiet-needing user gets full celebrations | Snapshot test for the inline follow-up presence per accommodation mode. |

## Implementation Steps

1. **Add `isAdultOwner` helper** in `packages/schemas/src/age.ts` (or adjacent). Add unit tests including null/undefined birthYear, edge ages 17/18/19.
2. **Create `(app)/more/_layout.tsx`** as a Stack with default header back button. Must export `unstable_settings = { initialRouteName: 'index' }` (mirror `progress/_layout.tsx:4-6`).
3. **Move `(app)/more.tsx` → `(app)/more/index.tsx`** (and `more.test.tsx` → `more/index.test.tsx`). Use `git mv` so history is preserved. Do this before creating sub-screens so Expo Router doesn't see a `more.tsx` + `more/` collision mid-edit.
4. **Create the 4 sub-screens** (`notifications.tsx`, `account.tsx`, `privacy.tsx`, `help.tsx`) — each is a thin extraction of the existing section JSX from the moved `index.tsx`. Move the in-page language Modal into `account.tsx` as a navigated picker (keep modal pattern OK if conversion is risky, defer to follow-up).
5. **Rewrite `more/index.tsx`** to the master/detail layout. Keep the top three sections (Accommodation + inline celebrations follow-up, Mentor Memory link conditional, Add child conditional with new gate). Replace the bottom 5 inline sections with 4 link rows + Sign out.
6. **Update `useCelebration`** to accept `accommodationMode` and ignore `celebrationLevel` when mode is `none` or `audio-first`. Update consumers in `home.tsx` and `session/index.tsx`.
7. **Inline celebrations follow-up** in the Accommodation section — render only when selected mode is `short-burst` or `predictable`. Reuses existing `useCelebrationLevel` / `useUpdateCelebrationLevel` hooks unchanged.
8. **Update tests:**
   - `more/index.test.tsx` (moved from `more.test.tsx`) — assert top 3 visible, 4 link rows visible, no inline celebrations section, sub-screen routes navigable. The existing inline assertions for the moved sections relocate to the sub-screen tests below — don't drop them.
   - New `more/notifications.test.tsx`, `more/account.test.tsx`, `more/privacy.test.tsx`, `more/help.test.tsx` — relocate the existing interactive assertions for each section (toggles wire to mutations, language picker writes, withdrawal radios, mailto/feedback), plus renders + back works.
   - `use-celebration.tsx` test for accommodation-aware gating.
   - Snapshot of inline follow-up under `short-burst` and `predictable` (and absence under `none` and `audio-first`).
9. **i18n:** Add new keys for the 4 sub-screen titles + the inline celebrations follow-up. Existing `more.celebrations.*` keys can be reused (they describe the levels, not the section header).
10. **Manual test on web + Galaxy S10e** (per `user_device_small_phone.md`): verify thumb reach to bottom link rows, back navigation depth, language picker.
11. **Sweep follow-up (separate PR, deferred):** drop unused `more.celebrations.sectionHeader` translation key and any standalone references; consider whether `celebration_level` column should be dropped (deferred — keep for now, the inline follow-up still uses it).

## Out of Scope

- Renaming "More" tab to "You" or "Settings" — separate UX call, can defer.
- Avatar in nav corner / dropdown alternative — explicitly rejected this round (top-right is poor mobile ergonomics).
- Dropping the `celebration_level` DB column / `/celebrations` route — deferred sweep, the inline follow-up still uses them.
- Restructuring the Family tab to remove duplicate "Add a child" affordance — duplicate entry points are intentional (D5 implication).

## Verification Checklist (before PR)

- [ ] Top 3 sections render correctly across all role/accommodation combinations.
- [ ] All 4 sub-screen routes load on web + mobile.
- [ ] Back navigation from each sub-screen returns to More tab landing (not Home).
- [ ] "Add a child" hidden for: child profiles, impersonated profiles, minor owners (<18), owners with null birthYear.
- [ ] Inline celebrations follow-up renders for `short-burst` + `predictable` only.
- [ ] Sign out works on landing screen, hidden in impersonation.
- [ ] `pnpm exec nx run mobile:test` and `pnpm exec nx lint mobile` clean.
- [ ] `pnpm exec tsc --build` clean.
- [ ] Smoke-tested on Galaxy S10e (5.8") for thumb reach to bottom rows.
