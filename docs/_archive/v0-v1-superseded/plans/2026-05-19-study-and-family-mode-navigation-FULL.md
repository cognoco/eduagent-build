# Study and Family Mode Navigation — Implementation Plan

> **PARKED — V0/V1-only (2026-06-27).** Archived to `_archive/v0-v1-superseded/`. Phase 1 (the two-mode V1 shell) shipped and remains the LIVE V1 contract — but the live source of truth is `apps/mobile/src/lib/navigation-contract.ts`, not this plan. The stranded Phase 2/3 tasks are V1 nav UI that the V2 shell supersedes; they will not be built on V1. Design history only.

> **Status (2026-05-25):** Phase 1 foundation solid: migration `0089`, `default_app_context`, `hasFamilyLinks`, `resolveNavigationContract` (`navigation-contract.ts:235-504` + 7 test files), recaps API + screens, `useModeSwitch` hook, `ModeSwitcher` component, `useUpdateProfileAppContext` mutation all shipped. **Hard constraint preserved** — `LEGACY_GUARDIAN_TABS` (5 tabs) and the `legacy-v0-flags-off` branch (`navigation-contract.ts:160-166, 267-277`) confirmed alive; V0 5-tab mode does not regress. **Stranded:** Task 1 (tab-shape rename `guardian|learner` → `study|family` — legacy and new shapes still coexist), Task 6 (`/app/(app)/onboarding/intent.tsx` doesn't exist), Task 8 (`family-setup-empty` testID not in codebase), Task 14 (`own-learning.tsx` redirect still uses legacy `resolveTabShape`/`setMode` instead of contract + `useModeSwitch`), Task 12 (proxy banner still renders in `_layout.tsx:143-187`), Task 19 (no web Playwright family/recaps coverage). **Resume here:** Task 1 (mechanical rename, unblocks downstream), then Tasks 6 + 8 (user-facing first-run flow), then Task 14 rewrite.

> **Status (2026-05-23):** Phase 1 foundation ✅ (migration `0089_ancient_naoko.sql`, `profiles.default_app_context`, `hasFamilyLinks` schema, navigation-contract scaffolding). Task 1 (V0 TabShape rename to study|family) ❌ NOT EXECUTED — `_layout.tsx` still exports `TabShape = 'guardian' | 'learner'` with `GUARDIAN_TABS`/`LEARNER_TABS`. V1 navigation runs via parallel `computeModeVisibleTabs()` behind `MODE_NAV_V1_ENABLED` flag. `FAMILY_TABS` in `navigation-contract.ts` correctly includes `{home, recaps, progress, more}`. Tasks 6, 12, 13, 16-20 require individual verification.

> **Hard constraint (added 2026-05-22).** Today's 5-tab production mode (active when `MODE_NAV_V0_ENABLED=false` in Doppler) **must not regress** across any task in this plan. V0 helpers (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation` in `apps/mobile/src/app/(app)/_layout.tsx:120-180`) and the V0-off short-circuits in `app-context.tsx:37, 44, 61` are **not deleted** as part of this migration. New `resolveNavigationContract` wiring is gated behind a separate `MODE_NAV_V1_ENABLED` flag. Every task must include or carry forward a regression test asserting that with both flags off, a guardian profile sees all 5 tabs. See the "Hard Constraint" section of `docs/specs/2026-05-21-navigation-contract.md` for the full matrix.

> **Amendments from adversarial review (2026-05-19):**
> - **CRITICAL-1**: Task 16 rewritten — `goBackOrReplace` and `homeHrefForReturnTo` already exist at `apps/mobile/src/lib/navigation.ts:16,26`. Extend, do not create parallel implementations.
> - **CRITICAL-2**: Task 1 keeps `Set<string>` for tab-visibility (existing shape at `_layout.tsx:114-126`); plan-wide replace of `.includes(...)` with `.has(...)`.
> - **CRITICAL-3**: Task 0 is verification-only — canonical class is `QuotaExceededError` from `@eduagent/schemas`, re-exported through `apps/mobile/src/lib/api-errors.ts`. Do NOT invent `QuotaExhaustedError`.
> - **HIGH-1**: Task 6 + Task 8 — intent='family' with no children routes through a Family-setup-empty screen; no silent fall-through to Study.
> - **HIGH-2**: Task 14 owns its own `router.replace` because `useModeSwitch` only navigates when leaving a `FAMILY_ONLY_ROUTES` pathname.
> - **HIGH-3**: Forward-compat coercion dropped — `profileSchema.defaultAppContext: appContextSchema.nullable()` (not `.optional()`), `mapProfileRow` casts directly (no `?? null`). Deploy-order is the only defence.
> - **MEDIUM-1**: Single unified return-token set lives in `navigation.ts` (extended, not forked).
> - **MEDIUM-2**: Recaps cursor `decodeCursor` validates the decoded payload with zod and logs a warn on malformed input.
> - **MEDIUM-3**: Migration backfill removed — no production users yet; users see Study tabs once after update and switch via More.
> - **MEDIUM-4**: `mapProfileRow` refactored to options-object so `hasFamilyLinks` is REQUIRED (not silently `false`).
> - **MEDIUM-5**: Engagement-signal seed test must first check whether the column is typed/CHECKed — drop or rewrite as unit test if so.
> - **MEDIUM-6**: Family-setup-empty Playwright case now backed by Task 8 Step 0 (`family-setup-empty` testID).
> - **MEDIUM-7**: Schema-source grep tightened to `sessionSummaries.<column>\b` to avoid false-matching the table name.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **All commits go through `/commit`.** Never `git commit` directly in this repo. See `CLAUDE.md` → "Git Commits".
>
> **Subagents do NOT commit.** Only the coordinator runs `/commit` after a task's verification passes. See `feedback_agents_commit_push`.

**Spec:** `docs/specs/2026-05-19-study-and-family-mode-navigation.md`

**Goal:** Replace the current identity-driven guardian/learner tab shell with context-driven Study/Family modes, add a parent-native Recaps surface, persist per-profile default mode, and remove proxy mode from normal parent UX.

**Architecture:** Mode is per-profile state stored in `profiles.default_app_context`, exposed via existing `GET /profiles` and mutated via `PATCH /profiles/:id`. The mobile tab shell resolves visible tabs from the active context (`'study' | 'family'`) rather than from `isGuardianProfile`. Recaps is a new parent-native API and mobile route that reads existing `session_summaries` recap columns without adding new storage. Family capability is gated server-side by `family_links` and exposed as `hasFamilyLinks: boolean` on profile responses.

**Tech Stack:** Drizzle migration + PostgreSQL CHECK constraint; Hono routes; `@eduagent/schemas` zod; React Native + Expo Router; TanStack Query; Jest (mobile + API integration); Playwright (web smoke).

**Deploy order (mandatory):** migration → API → mobile. Reading `defaultAppContext` on mobile before the API exposes it = schema drift. See `project_schema_drift_pattern`. Per adversarial review §HIGH-3 (round 2), the deploy-order rule is the only defence — no in-code "forward-compat" coercion. `profileSchema.defaultAppContext` is `appContextSchema.nullable()` (always present, may be null). The mapper writes the column value directly without `?? null` fallback. CLAUDE.md "Don't add error handling, fallbacks, or validation for scenarios that can't happen" applies.

**Merge boundaries (phased shipping):**
- **Phase 1 — Foundation** (Tasks 1-5): tab shape rename, migration + capability + intent screen. Independently mergeable and rollback-safe.
- **Phase 2 — Recaps and bridges** (Tasks 6-15): mode switch, Children tab, Recaps, Add to my learning, proxy removal, notifications.
- **Phase 3 — Hardening** (Tasks 16-20): navigation helpers, analytics, leak guards, web E2E, branch-wide validation.

Phase 1 is the cut line for "ship something useful and reviewable in isolation." Phase 2/3 may merge together if review cycle permits.

---

## Pre-flight

- [ ] **Confirm branch state**

```bash
git branch --show-current
git status
```

If not on a feature branch, create one from the current working branch (do not switch trees mid-flight; WIP carries forward per `feedback_branch_carries_wip`):

```bash
git checkout -b study-family-mode-navigation
```

- [ ] **Identify next migration number**

Run:

```bash
ls apps/api/drizzle | grep -E '^[0-9]{4}_' | sort | tail -3
```

Highest at spec time was `0078_webhook_idempotency_keys.sql`. This plan's foundation migration landed as `0089_ancient_naoko.sql`. Use the next available number after `0089` when creating any additional migration in this plan (verify at execution time with `ls apps/api/drizzle | sort | tail -3`).

Throughout this plan we refer to it as `00NN`. Substitute the real number consistently across the `.sql` file, the `.rollback.md` file, and any references.

---

## Task 0: API-client typed error classification (verification only)

Several downstream tasks (`Task 6`, `Task 7`, `Task 13`) catch `err instanceof ForbiddenError` / `err instanceof QuotaExceededError` on the mobile side. Per CLAUDE.md "UX Resilience Rules" → "Classify errors at the API client boundary, not per-screen." The hierarchy already exists — this task only verifies that and pins the canonical names for downstream tasks.

**Files:**
- Verify: `apps/mobile/src/lib/api-errors.ts`

- [ ] **Step 1: Confirm canonical classes are exported**

Open `apps/mobile/src/lib/api-errors.ts`. Confirm it re-exports `ForbiddenError` and `QuotaExceededError` from `@eduagent/schemas` (verified present at lines 18-25, 27-38 of that file). These are the canonical names — `QuotaExceededError` is the 403 quota class; do NOT invent `QuotaExhaustedError` or any other parallel name. Per the comment at api-errors.ts:8-12 (BUG-644 / P-4), the shared classes are sourced from `@eduagent/schemas` so cross-package `instanceof` checks work.

- [ ] **Step 2: Pin downstream import paths**

All downstream tasks that catch quota errors import from `apps/mobile/src/lib/api-errors.ts`:

```ts
import { ForbiddenError, QuotaExceededError } from '../lib/api-errors';
```

Never import `QuotaExceededError` directly from `@eduagent/schemas` in mobile code — go through the re-export so the existing `Object.setPrototypeOf` plumbing in `api-errors.ts` stays in scope.

No code changes in this task. No commit.

---

## Task 1: Terminology + tab shape rename (foundation)

Rename `TabShape = 'guardian' | 'learner'` to a context-driven shape. This is a mechanical rename touching `_layout.tsx` and its callers, but it unlocks every downstream task by removing the identity/visibility semantic collision flagged in spec §HIGH-1.

**Pre-existing shape (verified at `apps/mobile/src/app/(app)/_layout.tsx:70-126`):** `GUARDIAN_TABS` / `LEARNER_TABS` / `PARENT_PROXY_TABS` are `ReadonlySet<string>` literals; `computeVisibleTabs(shape, isParentProxy)` already exists and returns `Set<string>`. Keep `Set<string>` throughout — do NOT introduce arrays — and use `.has(...)` for membership tests. Adversarial review §CRITICAL-2.

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx:91-106` (TabShape type, resolveTabShape)
- Modify: `apps/mobile/src/app/(app)/_layout.tsx:60-75` (visible-tab arrays)
- Test: `apps/mobile/src/app/(app)/_layout.test.tsx` (co-located, create or extend)

- [ ] **Step 1: Write failing test for new shape values**

Create or extend `apps/mobile/src/app/(app)/_layout.test.tsx`:

```tsx
import { computeVisibleTabs, type AppTabContextShape } from './_layout';

describe('computeVisibleTabs', () => {
  it('returns exactly home, library, progress, more for study', () => {
    expect([...computeVisibleTabs('study')].sort()).toEqual(
      ['home', 'library', 'more', 'progress'],
    );
  });

  it('returns exactly home, recaps, progress, more for family', () => {
    expect([...computeVisibleTabs('family')].sort()).toEqual(
      ['home', 'more', 'progress', 'recaps'],
    );
  });

  it('returns the study set for unknown context (defensive default)', () => {
    expect([...computeVisibleTabs(undefined as unknown as AppTabContextShape)].sort()).toEqual(
      ['home', 'library', 'more', 'progress'],
    );
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.test.tsx --no-coverage
```

Expected: FAIL (`computeVisibleTabs is not exported` / `AppTabContextShape is not exported`).

- [ ] **Step 3: Rename `TabShape` to `AppTabContextShape` with values `'study' | 'family'`**

In `apps/mobile/src/app/(app)/_layout.tsx` near line 91, replace:

```ts
export type TabShape = 'guardian' | 'learner';
```

with:

```ts
export type AppTabContextShape = 'study' | 'family';
```

- [ ] **Step 4: Replace visible-tab sets**

Near line 70-83, replace `GUARDIAN_TABS` and `LEARNER_TABS` with `Set` literals (preserving the existing `ReadonlySet<string>` type so consumers using `.has(...)` keep compiling):

```ts
const STUDY_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);

const FAMILY_TABS: ReadonlySet<string> = new Set([
  'home',
  'recaps',
  'progress',
  'more',
]);
// PARENT_PROXY_TABS unchanged — proxy override is preserved.
```

- [ ] **Step 5: Update `computeVisibleTabs()` (already exists)**

The helper already exists at `_layout.tsx:114-126` with signature `(shape: TabShape = 'guardian', isParentProxy = false): Set<string>`. Update its body to the new shape values — do not change the return type or remove the `isParentProxy` overload (it preserves the proxy chrome contract):

```ts
export function computeVisibleTabs(
  context: AppTabContextShape = 'study',
  isParentProxy = false,
): Set<string> {
  if (isParentProxy) return new Set(PARENT_PROXY_TABS);
  return context === 'family' ? new Set(FAMILY_TABS) : new Set(STUDY_TABS);
}
```

All call sites continue using `visibleTabs.has(name)` (Set semantics). Anywhere downstream that the plan shows `visibleTabs.includes(...)` should be read as `visibleTabs.has(...)`.

- [ ] **Step 6: Update `resolveTabShape()` signature**

`resolveTabShape()` (line 93-106) currently takes profile state. It now becomes context-driven. Replace its body:

```ts
export function resolveTabShape({
  isParentProxy,
  defaultAppContext,
  isFamilyCapable,
}: {
  isParentProxy: boolean;
  defaultAppContext: 'study' | 'family' | null;
  isFamilyCapable: boolean;
}): AppTabContextShape {
  if (isParentProxy) return 'study'; // proxy override still uses learner-shape visible tabs
  if (!isFamilyCapable) return 'study';
  return defaultAppContext === 'family' ? 'family' : 'study';
}
```

Note: `isFamilyCapable` and `defaultAppContext` will be wired up in Tasks 2-4. For now, callers pass placeholders that compile.

- [ ] **Step 7: Update callers in `_layout.tsx`**

The single existing caller of `resolveTabShape` in `_layout.tsx` (around lines 1700-1740 in the Tabs.Screen render) must now read the new fields. Temporarily wire:

```ts
const tabShape = resolveTabShape({
  isParentProxy,
  defaultAppContext: null,        // wired in Task 5
  isFamilyCapable: false,         // wired in Task 4
});
```

Add a `// TODO(study-family): wire defaultAppContext from profile query (Task 5)` comment so the next task knows.

- [ ] **Step 8: Run test to verify pass + run typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.test.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS, no type errors.

- [ ] **Step 9: Search for any external uses of removed names**

```bash
```

Use Grep tool with pattern `(GUARDIAN_TABS|LEARNER_TABS|TabShape)\b` in `apps/mobile/src/`. Update any callers (likely only `_layout.tsx` itself, but verify). If a test file references the old names, update it to the new shape.

- [ ] **Step 10: Commit**

Invoke `/commit` with description: `refactor(mobile): rename TabShape to AppTabContextShape with study|family values`

---

## Task 2: Migration + Drizzle schema + shared schema for `defaultAppContext` and `hasFamilyLinks`

This is the deploy-critical task. Migration ships FIRST, then API exposure, then mobile consumption. Until the migration is applied and deployed, the API must not return `defaultAppContext` in `mapProfileRow`.

**Files:**
- Create: `apps/api/drizzle/00NN_profiles_default_app_context.sql`
- Create: `apps/api/drizzle/00NN_profiles_default_app_context.rollback.md`
- Modify: `packages/database/src/schema/profiles.ts:52-103` (profiles table)
- Modify: `packages/schemas/src/profiles.ts:92-109` (profileSchema)
- Modify: `apps/api/src/services/profile.ts:50-75` (mapProfileRow)
- Modify: `apps/api/src/services/profile.ts:84-111` (listProfiles — emit hasFamilyLinks)
- Test: `apps/api/src/services/profile.test.ts` (co-located)

- [ ] **Step 1: Create the SQL migration**

Replace `00NN` with the next available number from pre-flight.

```sql
-- 00NN_profiles_default_app_context.sql
ALTER TABLE profiles
  ADD COLUMN default_app_context text;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_default_app_context_check
  CHECK (
    default_app_context IS NULL
    OR default_app_context IN ('study', 'family')
  );

-- No backfill. Per adversarial review §MEDIUM-3: predicating the backfill on
-- "is_owner AND has non-archived linked child" is looser than the runtime
-- guardian-shape gate `isGuardianProfile(activeProfile, profiles)`, and would
-- pre-flip accounts whose family_links arrived via flows that never intended
-- Family-shape navigation. Per project_pre_launch_no_users.md the store is
-- not live, so there is no production user base to migrate. New and returning
-- users see Study tabs once after update, switch via More if they want
-- Family, and the choice persists from there.
```

- [ ] **Step 2: Create the rollback markdown**

```md
# Rollback: 00NN_profiles_default_app_context

## Rollback

Rollback is possible. Drop `profiles_default_app_context_check`, then drop
`profiles.default_app_context`. This loses the user-set Study/Family
preference; no learning, session, profile, report, or family link data is
lost. After rollback, family-capable adults will need to re-pick their
default mode the next time the column is restored (or remain in the client
default — Study). No backfill was applied, so there is no derived state to
recover.

Recovery procedure:

```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_default_app_context_check;
ALTER TABLE profiles DROP COLUMN IF EXISTS default_app_context;
```

Mobile clients running the new build will see `defaultAppContext: null` from
the API after rollback and will default to Study, which is the safe behavior.
```

- [ ] **Step 3: Add the Drizzle column**

In `packages/database/src/schema/profiles.ts` inside the `profiles = pgTable(...)` block (around line 52-103), add the new column. Place it next to `pronouns: text('pronouns')` for grouping with other user-preference fields:

```ts
  defaultAppContext: text('default_app_context'), // 'study' | 'family' | null; CHECK constraint in migration 00NN
```

- [ ] **Step 4: Generate Drizzle types**

```bash
pnpm run db:generate:dev
```

This regenerates `$inferSelect` so `mapProfileRow` sees the new field. Do NOT run `db:push:dev` — we are migration-driven now.

- [ ] **Step 5: Apply the migration to dev DB**

```bash
pnpm run db:migrate:dev
```

Expected: migration applies cleanly. Verify with `pnpm run db:studio:dev` if needed.

- [ ] **Step 6: Add `appContextSchema` and update `profileSchema`**

In `packages/schemas/src/profiles.ts` near the top (after existing enum schemas):

```ts
export const APP_CONTEXTS = ['study', 'family'] as const;
export const appContextSchema = z.enum(APP_CONTEXTS);
export type AppContext = z.infer<typeof appContextSchema>;
```

Then update `profileSchema` (around lines 92-109) by adding two fields inside the `z.object({...})`:

```ts
  // Per adversarial review §HIGH-3: deploy order (migration → API → mobile) is
  // the only defence. The column is always present in API responses once
  // shipped; it may be null. No `.optional()`, no in-code fallback. CLAUDE.md
  // "no validation for scenarios that can't happen" applies.
  defaultAppContext: appContextSchema.nullable(),
  hasFamilyLinks: z.boolean(),
```

- [ ] **Step 7: Verify `packages/schemas/src/index.ts` barrel re-exports**

The barrel uses `export * from './profiles'` (line 8). The new `APP_CONTEXTS`, `appContextSchema`, and `AppContext` are exported automatically. Confirm by:

```bash
```

Use Grep tool with pattern `export \* from './profiles'` in `packages/schemas/src/index.ts`. If the barrel uses explicit re-exports for some reason, add `AppContext` explicitly.

- [ ] **Step 8: Write failing test for `mapProfileRow` and `listProfiles`**

In `apps/api/src/services/profile.test.ts` (extend or create):

```ts
import { mapProfileRow, listProfiles } from './profile';
// existing imports

describe('mapProfileRow', () => {
  it('exposes defaultAppContext from the row', () => {
    const row = {
      id: 'p1', accountId: 'a1', displayName: 'A', avatarUrl: null,
      birthYear: 1990, birthYearSetBy: null, location: null, isOwner: true,
      hasPremiumLlm: false, conversationLanguage: 'en', pronouns: null,
      defaultAppContext: 'family',
      createdAt: new Date(), updatedAt: new Date(), archivedAt: null,
    } as unknown as typeof profiles.$inferSelect;
    const mapped = mapProfileRow(row);
    expect(mapped.defaultAppContext).toBe('family');
  });

  it('exposes null defaultAppContext as null (no inference at mapper layer)', () => {
    const row = { /* ...same with defaultAppContext: null... */ } as never;
    expect(mapProfileRow(row).defaultAppContext).toBeNull();
  });

  it('defaults hasFamilyLinks to false when not passed', () => {
    const row = { /* ...same... */ } as never;
    expect(mapProfileRow(row).hasFamilyLinks).toBe(false);
  });
});

describe('listProfiles', () => {
  it('sets hasFamilyLinks=true for owners with at least one family_links row', async () => {
    // integration: seed account with owner + family_links + child, call listProfiles, assert owner.hasFamilyLinks === true and child.hasFamilyLinks === false
  });

  it('sets hasFamilyLinks=false for owners with no family_links', async () => {
    // integration: seed account with owner only, assert owner.hasFamilyLinks === false
  });
});
```

The integration cases should live in a `.integration.test.ts` if `listProfiles` requires a DB. Follow the existing pattern in the file.

- [ ] **Step 9: Run the failing tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/profile.ts --no-coverage
```

Expected: FAIL.

- [ ] **Step 10: Export `mapProfileRow`, expose `defaultAppContext`, refactor to options-object**

In `apps/api/src/services/profile.ts:50` the current declaration is `function mapProfileRow(row, consentStatus?, linkCreatedAt?)` — **not exported**. The Step 8 tests import it directly, so:

1. Add the `export` keyword.
2. Per adversarial review §MEDIUM-4, refactor to a single options-object so adding `hasFamilyLinks` cannot silently default to `false` for callers that should have computed it. Positional defaults would let `findOwnerProfile` (line 137) return `hasFamilyLinks: false` for a guardian, polluting any consumer of that helper.
3. Update every existing caller (`profile.ts:103, 137, 155, 243, 339, 363` per plan-time grep — re-verify before editing) to the new options shape. Callers that legitimately don't know `hasFamilyLinks` (e.g. `findOwnerProfile`) compute it explicitly via a small `countActiveChildLinks(db, profileId)` helper.

```ts
export function mapProfileRow(
  row: typeof profiles.$inferSelect,
  opts: {
    consentStatus?: Profile['consentStatus'];
    linkCreatedAt?: Date | null;
    hasFamilyLinks: boolean; // REQUIRED — no default
  },
): Profile {
  return {
    // ...existing fields...
    // Per §HIGH-3: deploy-order is enforced; the column is always present.
    // Direct cast, no `?? null` fallback.
    defaultAppContext: row.defaultAppContext as AppContext | null,
    hasFamilyLinks: opts.hasFamilyLinks,
    consentStatus: opts.consentStatus ?? null,
    linkCreatedAt: opts.linkCreatedAt?.toISOString() ?? null,
    // ...
  };
}

async function countActiveChildLinks(db: Database, parentProfileId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(familyLinks)
    .innerJoin(profiles, eq(familyLinks.childProfileId, profiles.id))
    .where(and(
      eq(familyLinks.parentProfileId, parentProfileId),
      isNull(profiles.archivedAt),
    ));
  return row?.count ?? 0;
}
```

`findOwnerProfile` (line 122-156) computes its own `hasFamilyLinks`:

```ts
const hasFamilyLinks = ownerRow.isOwner && (await countActiveChildLinks(db, ownerRow.id)) > 0;
return mapProfileRow(ownerRow, { consentStatus, hasFamilyLinks });
```

The options-object signature is strictly required: TypeScript will fail the build if any updated caller forgets `hasFamilyLinks`. That's the point — forced acknowledgement at every call site.

- [ ] **Step 11: Update `listProfiles` to derive `hasFamilyLinks`**

In `apps/api/src/services/profile.ts` (lines 84-111), the existing `listProfiles` already queries `family_links` for `linkCreatedAt`. Reuse that query result:

```ts
const familyLinksRows = await db.select(...).from(familyLinks).where(...);
const familyLinksByParent = new Map<string, FamilyLinkRow[]>();
for (const link of familyLinksRows) {
  const arr = familyLinksByParent.get(link.parentProfileId) ?? [];
  arr.push(link);
  familyLinksByParent.set(link.parentProfileId, arr);
}

return rows.map((row) => {
  const links = familyLinksByParent.get(row.id) ?? [];
  return mapProfileRow(row, {
    consentStatus: consentByProfile.get(row.id),
    linkCreatedAt: linkCreatedAtByChildId.get(row.id) ?? null,
    hasFamilyLinks: row.isOwner && links.length > 0,
  });
});
```

Adjust to fit the existing variable names and join shape; the principle is: `hasFamilyLinks = isOwner && exists(family_links where parent_profile_id = row.id AND child.archived_at IS NULL)`. The `family_links` query must join `profiles` on the child side and filter `profiles.archived_at IS NULL` so an owner with only archived children does NOT get `hasFamilyLinks: true`.

- [ ] **Step 12: Re-run tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/profile.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 13: Run integration tests + typecheck**

```bash
cd apps/api && pnpm exec jest src/services/profile.integration.test.ts --no-coverage
cd apps/api && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
pnpm exec nx run @eduagent/schemas:typecheck
```

- [ ] **Step 14: Commit**

`/commit` description: `feat(api): add profiles.default_app_context column + hasFamilyLinks on profile responses`

The commit must include the migration `.sql`, the rollback `.md`, the Drizzle schema change, the shared schema change, and the service changes together. Per CLAUDE.md "Schema and Deploy Safety": migration ships first, but in git we ship one PR; the deploy order is enforced by the deploy script applying migration before code.

---

## Task 3: PATCH /profiles/:id app-context route + service

The mode mutation. Extends the existing `PATCH /profiles/:id` route. Server validates capability before accepting `'family'`, scopes to the active profile, and is idempotent.

**Files:**
- Modify: `apps/api/src/routes/profiles.ts:77-93` (PATCH /profiles/:id)
- Modify: `apps/api/src/services/profile.ts:347-364` (updateProfile)
- Modify: `packages/schemas/src/profiles.ts:60-63` (profileUpdateSchema)
- Test: `apps/api/src/routes/profiles.test.ts` (co-located)
- Test: `apps/api/src/services/profile.test.ts`

- [ ] **Step 1: Extend `profileUpdateSchema`**

In `packages/schemas/src/profiles.ts` around line 60:

```ts
export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  pronouns: pronounsSchema.nullable().optional(),
  conversationLanguage: conversationLanguageSchema.optional(),
  defaultAppContext: appContextSchema.optional(), // 'study' | 'family' only — no null write
});
```

Note: clients cannot write `null` — only the migration default is null. Switching from family to study writes `'study'`, not `null`.

- [ ] **Step 2: Write failing tests for the route**

In `apps/api/src/routes/profiles.test.ts`:

```ts
describe('PATCH /profiles/:id (defaultAppContext)', () => {
  it('accepts study for any active profile', async () => {
    // arrange: signed-in account with owner profile, X-Profile-Id = owner.id
    const res = await client.profiles[':id'].$patch({
      param: { id: ownerProfileId },
      json: { defaultAppContext: 'study' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.defaultAppContext).toBe('study');
  });

  it('accepts family when the active profile is family-capable (owner + adult + has linked child)', async () => {
    // arrange: owner profile (adult), one non-owner child profile, family_links row
    const res = await client.profiles[':id'].$patch({
      param: { id: ownerProfileId },
      json: { defaultAppContext: 'family' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).profile.defaultAppContext).toBe('family');
  });

  it('rejects family for a non-owner profile (child)', async () => {
    // arrange: switch active profile to child via X-Profile-Id
    const res = await client.profiles[':id'].$patch({
      param: { id: childProfileId },
      json: { defaultAppContext: 'family' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects family for an under-18 owner', async () => {
    // arrange: owner with birthYear making them <18
    const res = await client.profiles[':id'].$patch({
      param: { id: minorOwnerProfileId },
      json: { defaultAppContext: 'family' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects family for an owner with no family_links', async () => {
    const res = await client.profiles[':id'].$patch({
      param: { id: childlessOwnerProfileId },
      json: { defaultAppContext: 'family' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects defaultAppContext writes when route :id does not match X-Profile-Id active scope', async () => {
    // arrange: active profile is owner, request patches a sibling profile's mode
    const res = await client.profiles[':id'].$patch({
      param: { id: siblingProfileId },
      json: { defaultAppContext: 'study' },
    });
    expect(res.status).toBe(403);
  });

  it('still accepts non-mode field writes on a sibling profile (onboarding flow compat)', async () => {
    // arrange: active profile is owner, request patches a sibling profile's displayName
    const res = await client.profiles[':id'].$patch({
      param: { id: siblingProfileId },
      json: { displayName: 'New Name' },
    });
    expect(res.status).toBe(200); // scope-match guard is mode-write-specific
  });

  it('is idempotent: writing study twice yields 200 both times', async () => {
    const r1 = await patch(ownerProfileId, 'study');
    const r2 = await patch(ownerProfileId, 'study');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
```

Note: tests must NOT use `jest.mock` for internal modules per GC1/GC6. Use real DB seeded by test setup.

- [ ] **Step 3: Run failing tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/routes/profiles.ts --no-coverage
```

Expected: FAIL on most.

- [ ] **Step 4: Add capability check in service**

In `apps/api/src/services/profile.ts` add (or extend) a helper:

```ts
import { computeAgeBracket } from '@eduagent/schemas';

export async function assertFamilyCapability(
  db: Database,
  profile: typeof profiles.$inferSelect,
): Promise<void> {
  if (!profile.isOwner) {
    throw new ForbiddenError('family-context-requires-owner');
  }
  if (computeAgeBracket(profile.birthYear) !== 'adult') {
    throw new ForbiddenError('family-context-requires-adult');
  }
  const linkCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(familyLinks)
    .innerJoin(profiles, eq(familyLinks.childProfileId, profiles.id))
    .where(and(
      eq(familyLinks.parentProfileId, profile.id),
      isNull(profiles.archivedAt),
    ));
  if ((linkCount[0]?.count ?? 0) === 0) {
    throw new ForbiddenError('family-context-requires-linked-child');
  }
}
```

The exact error class should match the existing typed error hierarchy used in this repo (see `apps/api/src/services/errors.ts` or equivalent). If no `ForbiddenError` exists, throw the existing pattern that produces 403 from the Hono error handler.

- [ ] **Step 5: Extend `updateProfile` in the service**

In `apps/api/src/services/profile.ts` around line 347-364, add capability check when `defaultAppContext === 'family'`:

```ts
export async function updateProfile(
  db: Database,
  profileId: string,
  accountId: string,
  patch: ProfileUpdate,
): Promise<Profile> {
  const existing = await getRawProfileRow(db, profileId, accountId); // existing helper, or inline
  if (!existing) throw new NotFoundError('profile-not-found');

  if (patch.defaultAppContext === 'family') {
    await assertFamilyCapability(db, existing);
  }

  const [updated] = await db
    .update(profiles)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)))
    .returning();

  // Re-derive hasFamilyLinks for the response (cheap; or reuse a single source)
  const hasFamilyLinks = existing.isOwner && (await countLinks(db, profileId)) > 0;
  return mapProfileRow(updated, { hasFamilyLinks });
}
```

- [ ] **Step 6: Enforce route-vs-active-scope match — ONLY for `defaultAppContext` writes**

The existing PATCH `/profiles/:id` route is also used for `displayName`, `avatarUrl`, `pronouns`, `conversationLanguage`, and (via `use-onboarding-dimensions.ts:74, :114`) for dimension/pronoun mutations during onboarding — where the active profile may legitimately not equal `:id` (e.g. parent patching a freshly-created child). A blanket 403 here would regress those flows (adversarial review §CRITICAL-1).

Apply the scope-match guard **only when the patch includes `defaultAppContext`**. Mode is per-profile state set by the profile itself; the other fields keep their existing account-ownership-only semantics.

In `apps/api/src/routes/profiles.ts:77-93`, the PATCH handler:

```ts
.patch(
  '/:id',
  zValidator('param', z.object({ id: z.string().uuid() })),
  zValidator('json', profileUpdateSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const accountId = c.get('account').id;
    const input = c.req.valid('json');

    // Scope-match guard applies ONLY to defaultAppContext writes. Other fields
    // (displayName, pronouns, etc.) keep account-ownership-only semantics so
    // onboarding flows that patch a sibling profile still work.
    if (input.defaultAppContext !== undefined) {
      const activeProfileId = c.get('profileId'); // from profile-scope middleware
      if (activeProfileId !== id) {
        return forbidden(c, 'Default app context can only be changed for the active profile');
      }
    }

    const updated = await updateProfile(c.get('db'), id, accountId, input);
    if (!updated) return notFound(c, 'Profile not found');
    return c.json(profileResponseSchema.parse({ profile: updated }));
  },
)
```

The `profile-scope` middleware at `apps/api/src/middleware/profile-scope.ts` already sets `c.set('profileId', ...)` (confirmed line 113, 166), so no additional plumbing is needed.

Tests must cover both branches: (a) patching `displayName` on a sibling profile is still 200; (b) patching `defaultAppContext` on a non-active profile is 403.

- [ ] **Step 7: Run tests + lint + typecheck**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/routes/profiles.ts src/services/profile.ts --no-coverage
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```

ESLint G1/G5 will reject route-file direct DB access. Keep all DB work in the service.

Expected: PASS.

- [ ] **Step 8: Commit**

`/commit` description: `feat(api): allow PATCH /profiles/:id to update defaultAppContext with capability check`

---

## Task 4: Family capability helper (mobile)

A shared helper so every gating check uses one predicate. Replaces ad-hoc `isGuardianProfile` uses where Family mode access is the question.

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts` (add `isFamilyCapableProfile`)
- Test: `apps/mobile/src/lib/profile.test.ts` (co-located)

- [ ] **Step 1: Write failing tests**

In `apps/mobile/src/lib/profile.test.ts`:

```ts
import { isFamilyCapableProfile } from './profile';
import type { Profile } from '@eduagent/schemas';

const mkProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'p1', accountId: 'a1', displayName: 'A', avatarUrl: null,
  birthYear: 1990, location: null, isOwner: true, hasPremiumLlm: false,
  conversationLanguage: 'en', pronouns: null, consentStatus: null,
  linkCreatedAt: null, createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  defaultAppContext: null, hasFamilyLinks: true,
  ...overrides,
});

describe('isFamilyCapableProfile', () => {
  it('returns true for adult owner with hasFamilyLinks', () => {
    expect(isFamilyCapableProfile(mkProfile())).toBe(true);
  });

  it('returns false for a non-owner profile', () => {
    expect(isFamilyCapableProfile(mkProfile({ isOwner: false }))).toBe(false);
  });

  it('returns false for an under-18 owner with linked children', () => {
    const currentYear = new Date().getFullYear();
    expect(isFamilyCapableProfile(mkProfile({ birthYear: currentYear - 15 }))).toBe(false);
  });

  it('returns false for an adult owner without family links', () => {
    expect(isFamilyCapableProfile(mkProfile({ hasFamilyLinks: false }))).toBe(false);
  });

  it('returns false for a null profile', () => {
    expect(isFamilyCapableProfile(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.ts --no-coverage
```

Expected: FAIL (`isFamilyCapableProfile is not exported`).

- [ ] **Step 3: Implement the helper**

In `apps/mobile/src/lib/profile.ts`:

```ts
import { computeAgeBracket } from '@eduagent/schemas';
import type { Profile } from '@eduagent/schemas';

export function isFamilyCapableProfile(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (!profile.isOwner) return false;
  if (computeAgeBracket(profile.birthYear) !== 'adult') return false;
  return profile.hasFamilyLinks === true;
}
```

Critically: do NOT compute capability from `profiles.some(p => !p.isOwner)`. Per spec Glossary, `hasFamilyLinks` is the server source of truth.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/profile.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): add isFamilyCapableProfile helper for Family mode gating`

---

## Task 5: Wire `defaultAppContext` and `isFamilyCapable` into the tab shell

Connect the new helper + server-backed field to `resolveTabShape()` callers in `_layout.tsx`. Removes the TODOs left in Task 1.

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (caller of resolveTabShape)
- Test: `apps/mobile/src/app/(app)/_layout.test.tsx`

- [ ] **Step 1: Add resolveTabShape integration tests**

Extend `_layout.test.tsx`:

```tsx
import { resolveTabShape } from './_layout';

describe('resolveTabShape', () => {
  it('returns study when not family-capable, regardless of default', () => {
    expect(resolveTabShape({ isParentProxy: false, defaultAppContext: 'family', isFamilyCapable: false })).toBe('study');
  });

  it('returns study when family-capable but defaultAppContext is null', () => {
    expect(resolveTabShape({ isParentProxy: false, defaultAppContext: null, isFamilyCapable: true })).toBe('study');
  });

  it('returns family when family-capable and defaultAppContext is family', () => {
    expect(resolveTabShape({ isParentProxy: false, defaultAppContext: 'family', isFamilyCapable: true })).toBe('family');
  });

  it('returns study override when isParentProxy is true (proxy chrome wins)', () => {
    expect(resolveTabShape({ isParentProxy: true, defaultAppContext: 'family', isFamilyCapable: true })).toBe('study');
  });
});
```

- [ ] **Step 2: Run, expect pass (Task 1 already wired these)**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.test.tsx --no-coverage
```

- [ ] **Step 3: Wire the real call site**

In `_layout.tsx` replace the placeholder call from Task 1:

```ts
const tabShape = resolveTabShape({
  isParentProxy,
  defaultAppContext: activeProfile?.defaultAppContext ?? null,
  isFamilyCapable: isFamilyCapableProfile(activeProfile),
});
```

Add the import at the top of the file:

```ts
import { isFamilyCapableProfile } from '../../lib/profile';
```

- [ ] **Step 4: Update the tab visibility logic to use `computeVisibleTabs(tabShape)`**

Replace any old `tabShape === 'guardian' ? GUARDIAN_TABS : LEARNER_TABS` patterns with `computeVisibleTabs(tabShape)`. The proxy subset remains a separate branch:

```ts
const visibleTabs = isParentProxy
  ? PARENT_PROXY_TABS
  : computeVisibleTabs(tabShape);
```

- [ ] **Step 5: Add a `recaps` Tabs.Screen entry**

In the Tabs.Screen list (around lines 1738-1797), add:

```tsx
<Tabs.Screen
  name="recaps"
  options={{
    title: 'Recaps',
    tabBarLabel: 'Recaps',
    tabBarTestID: 'tab-recaps',
    tabBarIcon: /* existing icon pattern */,
    href: visibleTabs.has('recaps') ? '/(app)/recaps' : null,
    tabBarItemStyle: visibleTabs.has('recaps') ? undefined : { display: 'none' },
  }}
/>
```

Apply the same `href: visibleTabs.has(...) ? ... : null` + `tabBarItemStyle` pattern to every existing tab. This matches the Set semantics of the existing tab-visibility helper at `_layout.tsx:114-126` (do not switch to array `.includes(...)` — see adversarial review §CRITICAL-2).

The Family home tab label is "Children" — when `tabShape === 'family'`, override the `home` tab's `tabBarLabel` to "Children":

```tsx
<Tabs.Screen
  name="home"
  options={{
    title: 'Home',
    tabBarLabel: tabShape === 'family' ? 'Children' : 'My Learning',
    // ...
  }}
/>
```

The "My Learning" label for Study replaces what was formerly `own-learning`. (See Task 11 for `own-learning.tsx` route survival.)

- [ ] **Step 6: Remove or update `resolveHomeTabPresentation()`**

Per spec §MEDIUM-4, with explicit modes this resolver is redundant. Search for its callers:

```bash
```

Use Grep with pattern `resolveHomeTabPresentation` in `apps/mobile/src/`. If only used in `_layout.tsx`, inline the logic at the call site (`tabShape === 'family' ? 'Family' : 'My Learning'`) and delete the helper. Update any test that imported the helper.

- [ ] **Step 7: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx src/lib/profile.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

`/commit` description: `feat(mobile): wire defaultAppContext and isFamilyCapable into tab shell`

---

## Task 6: First-run intent screen

A new onboarding step hosted post-sign-up. Choice is ephemeral until profile creation. Spec §First-Run Intent + AC #34.

**Files:**
- Create: `apps/mobile/src/app/(app)/onboarding/intent.tsx`
- Test: `apps/mobile/src/app/(app)/onboarding/intent.test.tsx`
- Modify: `apps/mobile/src/app/(app)/onboarding/index.tsx` (route to intent.tsx first)

- [ ] **Step 1: Determine current onboarding route order**

Read `apps/mobile/src/app/(app)/onboarding/index.tsx` and `_layout.tsx`. Identify where the flow begins (typically a Stack with sequential routes). The intent screen must come before `language-setup` and `pronouns`.

- [ ] **Step 2: Write failing test**

`onboarding/intent.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { IntentScreen } from './intent';

const mockReplace = jest.fn();
// expo-router is a bare-specifier external module — NOT a GC1 violation, no
// gc1-allow comment needed. GC1 gates only relative-path internal mocks.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ replace: mockReplace }),
}));

describe('IntentScreen', () => {
  it('renders Study and Family choices', () => {
    const { getByTestId } = render(<IntentScreen />);
    expect(getByTestId('intent-choice-study')).toBeTruthy();
    expect(getByTestId('intent-choice-family')).toBeTruthy();
  });

  it('persists nothing in SecureStore (ephemeral choice)', () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('intent-choice-study'));
    // assert no SecureStore.setItemAsync was called (spy on the SecureStore module if needed)
  });

  it('navigates forward with study intent via route state', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('intent-choice-study'));
    fireEvent.press(getByTestId('intent-continue'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/onboarding/language-setup', // or whatever the next step is
        params: { intent: 'study' },
      }),
    );
  });

  it('navigates forward with family intent via route state', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('intent-choice-family'));
    fireEvent.press(getByTestId('intent-continue'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ params: { intent: 'family' } }),
      ),
    );
  });
});
```

The `expo-router` mock uses a bare specifier (external boundary) and is unaffected by GC1, which only gates relative-path internal mocks. Do not add a `gc1-allow` comment to it.

- [ ] **Step 3: Run failing test**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/onboarding/intent.test.tsx --no-coverage
```

Expected: FAIL.

- [ ] **Step 4: Implement `IntentScreen`**

`intent.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { track } from '../../../lib/analytics';

type Intent = 'study' | 'family';

export function IntentScreen() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);

  const onContinue = () => {
    if (!intent) return;
    track('mode_intent_chosen', { intent });
    router.replace({
      pathname: '/(app)/onboarding/language-setup',
      params: { intent },
    });
  };

  return (
    <View>
      <Text>How do you want to use MentoMate?</Text>
      <Pressable
        testID="intent-choice-study"
        onPress={() => setIntent('study')}
        accessibilityState={{ selected: intent === 'study' }}
      >
        <Text>Study (for myself)</Text>
      </Pressable>
      <Pressable
        testID="intent-choice-family"
        onPress={() => setIntent('family')}
        accessibilityState={{ selected: intent === 'family' }}
      >
        <Text>Family (support my children's learning)</Text>
      </Pressable>
      <Pressable testID="intent-continue" disabled={!intent} onPress={onContinue}>
        <Text>Continue</Text>
      </Pressable>
    </View>
  );
}

export default IntentScreen; // Expo Router page; default export per CLAUDE.md exception
```

Copy and styling can be polished later (spec Notes). Use semantic tokens, not hex.

- [ ] **Step 5: Route the onboarding flow through intent first**

In `apps/mobile/src/app/(app)/onboarding/index.tsx`, change the initial redirect/route to send users to `intent.tsx` first. The next-step screen (`language-setup.tsx`) reads `params.intent` and threads it onward until profile creation completes; the create-profile call writes the validated mode (Study always allowed; Family only if capability resolves OK — backend rejects otherwise per Task 3, and the client falls back to Study with plain copy).

- [ ] **Step 6: Add the post-creation resolution**

After profile creation succeeds (find the existing create-profile success handler in onboarding), branch on intent and current family capability. Per adversarial review §HIGH-1, an adult who picked Family but has no children yet must NOT silently fall through to Study — they land on a "Family setup" entry point so the intent is preserved.

```ts
import { isFamilyCapableProfile } from '../../lib/profile';

const intent = params.intent as 'study' | 'family' | undefined;

if (intent === 'family') {
  // Only patch defaultAppContext='family' when capability already resolves.
  // For the under-18 case the server would 403 anyway; for the no-children
  // case we keep the user in a Family-setup landing state with capability
  // unresolved (defaultAppContext stays null), and surface the empty state
  // when the user opens (app)/home (see Task 8 — family-setup-empty).
  if (isFamilyCapableProfile(createdProfile)) {
    await mutateProfile({ defaultAppContext: 'family' });
  }
  // Either way, route to (app)/home. Mode-aware home renders Family setup
  // when intent='family' && !isFamilyCapable, or the Children hub when
  // capable.
  router.replace({
    pathname: '/(app)/home',
    params: { intent: 'family' },
  });
} else {
  // Study intent or unset — leave defaultAppContext as null; client defaults to study
  router.replace('/(app)/home');
}
```

Note: the `params.intent` thread through `/(app)/home` lets the Family-setup-empty branch read the intent. Persisting intent across cold launches is out of scope for Task 6 — a parent who quits before adding a child re-takes the intent screen on next launch.

- [ ] **Step 7: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/onboarding/ --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit**

`/commit` description: `feat(mobile): add first-run Study/Family intent screen + post-create mode resolution`

---

## Task 7: Mode switch entry points + mutation hook

A visible toggle (in More, plus a small affordance in Family home and Study home) lets a family-capable adult switch contexts. The mutation uses optimistic UI with rollback and stale-response protection per spec §Mode Mutation Contract.

**Files:**
- Create: `apps/mobile/src/hooks/use-mode-switch.ts`
- Create: `apps/mobile/src/hooks/use-mode-switch.test.ts`
- Modify: `apps/mobile/src/app/(app)/more.tsx` (or equivalent — locate via Grep)
- Test: mode-switch integration in `_layout.test.tsx` and `more.test.tsx`

- [ ] **Step 1: Write failing tests for the hook**

`use-mode-switch.test.ts`:

```ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useModeSwitch } from './use-mode-switch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('useModeSwitch', () => {
  it('optimistically updates the profile query cache', async () => {
    // arrange: seed profile cache with defaultAppContext: 'study'
    // act: call mutate('family')
    // assert: cache shows 'family' synchronously before await
  });

  it('rolls back on server 4xx', async () => {
    // arrange: server returns 403
    // act: call mutate('family')
    // assert: cache reverts to 'study', error surfaced
  });

  it('rolls back on network error and shows retryable error', async () => {
    // arrange: fetch throws
    // act: call mutate
    // assert: cache reverts, error.retry exists
  });

  it('ignores stale response when active profile changed mid-flight', async () => {
    // arrange: start mutation with active profile A
    // simulate: active profile changes to B before response
    // assert: response is not applied to B's cache
  });

  it('single-flight via button disable: second tap is rejected while first is pending', async () => {
    // arrange: render More tab with the switch button
    // act: tap once, then tap again before the first resolves
    // assert: only ONE PATCH fired; the button is disabled between the taps
    // This is the primary single-flight defence — the inflightSeq ref only
    // guards stale RESPONSES, not duplicate IN-FLIGHT REQUESTS.
  });

  it('stale-response guard handles out-of-order response arrival', async () => {
    // arrange: simulate two PATCH requests racing (server processes in either order)
    // act: mutate('family'), then mutate('study') back-to-back via the hook directly
    // simulate: family response arrives AFTER study response
    // assert: only the latest sequence number commits; older response is dropped
  });
});

it('rolls back optimistic update to the SAME key on server 403', async () => {
  // arrange: seed cache at ['profiles', userId] with defaultAppContext: 'study'
  // arrange: server returns 403 (e.g. under-18, no children)
  // act: mutate('family')
  // assert: cache at ['profiles', userId] equals the pre-mutation snapshot
  // CRITICAL: this test must use the real userId-scoped key. A bare ['profiles']
  // key would silently mask the bug (adversarial review §CRITICAL-2).
});
```

These map to AC #5, #6, #6a.

- [ ] **Step 2: Implement the hook**

```ts
// use-mode-switch.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { client } from '../lib/api-client';
import { track, hashProfileId } from '../lib/analytics';
import { useUserId } from './use-user-id'; // confirm name; whatever surfaces Clerk userId in this app
import type { AppContext, Profile } from '@eduagent/schemas';

// Routes that are mode-incompatible — switching mode while on one of these
// requires router.replace('/(app)/home') because the destination no longer
// exists in the new mode. All other routes stay in place; query
// invalidations refresh visible data.
const FAMILY_ONLY_ROUTES = ['/(app)/recaps'];
const STUDY_ONLY_ROUTES: string[] = []; // currently none; add if Study introduces exclusive routes

export function useModeSwitch(activeProfile: Profile | null) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useUserId();
  const profilesKey = ['profiles', userId] as const; // CRITICAL: must match use-profiles.ts:28
  const inflightSeq = useRef(0);
  const activeProfileIdAtStart = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (next: AppContext) => {
      if (!activeProfile) throw new Error('no-active-profile');
      const seq = ++inflightSeq.current;
      activeProfileIdAtStart.current = activeProfile.id;

      const res = await client.profiles[':id'].$patch({
        param: { id: activeProfile.id },
        json: { defaultAppContext: next },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new ModeSwitchError(res.status, body);
      }
      const data = await res.json();
      return { seq, profile: data.profile as Profile, intended: next };
    },
    onMutate: async (next) => {
      if (!activeProfile) return;
      await qc.cancelQueries({ queryKey: profilesKey });
      const previous = qc.getQueryData<Profile[]>(profilesKey);
      qc.setQueryData<Profile[]>(profilesKey, (old) =>
        (old ?? []).map((p) =>
          p.id === activeProfile.id ? { ...p, defaultAppContext: next } : p,
        ),
      );
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      // CRITICAL: rollback uses the SAME key that onMutate snapshotted.
      // A mismatched key here would leave the optimistic update in place forever.
      if (ctx?.previous) {
        qc.setQueryData(profilesKey, ctx.previous);
      }
    },
    onSuccess: ({ seq, profile, intended }) => {
      // Stale-response guard: only commit if (a) sequence is still the latest, and (b) active profile hasn't changed.
      if (seq !== inflightSeq.current) return;
      if (!activeProfile || activeProfile.id !== activeProfileIdAtStart.current) {
        qc.invalidateQueries({ queryKey: profilesKey });
        return;
      }
      qc.setQueryData<Profile[]>(profilesKey, (old) =>
        (old ?? []).map((p) => (p.id === profile.id ? profile : p)),
      );

      // Scoped invalidations — only the switching profile's data needs refetch.
      // Avoids the refetch storm of bare ['subjects'] / ['progress'] (which
      // would blow caches for every profile in the session).
      const pid = profile.id;
      qc.invalidateQueries({ queryKey: ['progress', pid] });
      qc.invalidateQueries({ queryKey: ['dashboard', pid] });
      qc.invalidateQueries({ queryKey: ['recaps', pid] }); // parent-scoped recaps
      qc.invalidateQueries({ queryKey: ['subjects', pid] });
      qc.invalidateQueries({ queryKey: ['reports', pid] });

      track('mode_switched', {
        from: intended === 'family' ? 'study' : 'family',
        to: intended,
        profileIdHash: hashProfileId(pid),
      });

      // Conditional replace: only navigate if the current route is incompatible
      // with the new mode. Switching mode while in More/Settings should NOT
      // teleport the user away from where they are.
      const incompatible =
        (intended === 'study' && FAMILY_ONLY_ROUTES.some((r) => pathname.startsWith(r))) ||
        (intended === 'family' && STUDY_ONLY_ROUTES.some((r) => pathname.startsWith(r)));
      if (incompatible) {
        router.replace('/(app)/home');
      }
    },
  });
}

export class ModeSwitchError extends Error {
  constructor(public status: number, public body: string) {
    super(`mode-switch-failed-${status}`);
  }
}
```

Query-key discipline (adversarial review §CRITICAL-2):
- The key MUST be `['profiles', userId]` everywhere (`onMutate`, `onError`, `onSuccess`) — matches `use-profiles.ts:28`.
- A test must seed the cache at `['profiles', userId]`, force a 403, and assert the cache returns to the snapshotted value. A green test against the wrong key would silently mask the rollback bug.

Single-flight (adversarial review §HIGH-2):
- The button caller (Task 7 Step 3 below) MUST disable while `isPending` is true. The `inflightSeq` ref only guards stale RESPONSES, not duplicate IN-FLIGHT REQUESTS. Without the button disable, a fast double-tap can fire two PATCHes whose server-processing order is undefined.

- [ ] **Step 3: Add the switch UI to `more.tsx`**

Find the More tab screen via:

```bash
```

Use Glob `apps/mobile/src/app/(app)/more*`. Read it. Add a row for "Switch to Study"/"Switch to Family" visible only when:
- the active profile is family-capable, AND
- `!isParentProxy`

```tsx
const { mutate, isPending } = useModeSwitch(activeProfile);
const current = activeProfile?.defaultAppContext ?? 'study';

{isFamilyCapableProfile(activeProfile) && !isParentProxy && (
  <Pressable
    testID="mode-switch"
    // disabled={isPending} is the single-flight defence — keep it.
    // The hook's inflightSeq ref only guards stale RESPONSES; without this
    // disable, a fast double-tap can fire two PATCHes whose server-
    // processing order is undefined (adversarial review §HIGH-2).
    disabled={isPending}
    onPress={() => mutate(current === 'family' ? 'study' : 'family')}
  >
    <Text>{current === 'family' ? 'Switch to Study mode' : 'Switch to Family mode'}</Text>
  </Pressable>
)}
```

- [ ] **Step 4: Disable mode switch while a profile switch is in flight**

Locate the `switchProfile` mutation (see `apps/api/src/services/profile.ts:371-384` server-side; mobile-side hook). The mode-switch button must read its `isPending` and disable. Use a context or a small `useIsProfileSwitchPending()` selector.

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-mode-switch.ts src/app/\(app\)/more --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

`/commit` description: `feat(mobile): mode switch hook with optimistic+rollback+stale-response guard, More-tab entry point`

---

## Task 8: Children tab + child curriculum bridge

Family mode's Home tab is "Children". It must surface child curriculum management (add/manage subjects/books) without proxy mode — this answers spec §HIGH-2.

**Files:**
- Modify: `apps/mobile/src/components/home/ParentHomeScreen.tsx` (already the Family home content)
- Possibly create: `apps/mobile/src/app/(app)/child/[profileId]/curriculum.tsx` (or extend existing child detail route)
- Modify/extend: the (app)/home route to render a `family-setup-empty` branch when `intent === 'family' && !isFamilyCapable` (adversarial review §HIGH-1 fix — pairs with Task 6 Step 6)

- [ ] **Step 0: Add the Family-setup-empty branch on (app)/home**

In the home screen, after computing `tabShape`:

```tsx
const intentFromParams = useLocalSearchParams().intent;
const wantsFamily = intentFromParams === 'family' || activeProfile?.defaultAppContext === 'family';

if (wantsFamily && !isFamilyCapableProfile(activeProfile)) {
  return (
    <View testID="family-setup-empty">
      <Text>Set up your family</Text>
      <Text>Add a child profile to start tracking their learning.</Text>
      <Pressable testID="family-setup-add-child" onPress={() => router.push('/(app)/add-child')}>
        <Text>Add a child</Text>
      </Pressable>
      <Pressable testID="family-setup-skip-to-study" onPress={() => router.replace('/(app)/home')}>
        <Text>Maybe later — use Study mode</Text>
      </Pressable>
    </View>
  );
}
```

Co-located test asserts both buttons fire the right router/mutation calls. This satisfies the Task 19 Playwright case "Adult with Family intent but no child: sees Family setup, not tabs" without the silent Study fallback the original plan had.

- [ ] **Step 1: Audit current child-card actions in `ParentHomeScreen.tsx`**

Read `ParentHomeScreen.tsx:1110-1140` (child command cards). Identify whether each card currently:
- routes via `router.push('/(app)/child/[profileId]')`, or
- enters proxy mode via `switchProfile(child.id)`.

Any card that enters proxy must be repointed at a parent-native route. The child detail route already exists per Files to Reference; verify with Grep for `'/(app)/child/'`.

- [ ] **Step 2: Add a "Subjects & books" action on each child card**

Decision: use a **sibling route** (not a query param view). Matches Expo Router conventions, gives a stable deep-link target, and keeps the back stack clean. The destination is:

```ts
router.push({
  pathname: '/(app)/child/[profileId]/curriculum',
  params: { profileId: child.id },
});
```

Create `apps/mobile/src/app/(app)/child/[profileId]/curriculum.tsx` if it doesn't exist. The screen renders the child's subjects/books in parent-native chrome (no proxy banner). Reuse existing curriculum components but pass the child id explicitly rather than switching `X-Profile-Id`.

- [ ] **Step 3: Server-side: confirm parent can read child subjects via family-link scope**

Verify there's an existing parent-scoped subjects endpoint (or extend one). The endpoint must:
- accept `?childProfileId=...`
- verify `family_links.parent_profile_id = activeProfile.id` server-side
- never require switching `X-Profile-Id` to the child

If no such endpoint exists, create `apps/api/src/routes/family-curriculum.ts` (or extend an existing parent route). Follow the same pattern Task 9 uses for recaps.

- [ ] **Step 4: Write tests**

Co-located test in `ParentHomeScreen.test.tsx`:

```tsx
it('child card "Subjects & books" navigates to parent-native curriculum, not proxy', async () => {
  const { getByTestId } = render(<ParentHomeScreen activeProfile={ownerProfile} />);
  fireEvent.press(getByTestId(`child-card-${childId}-curriculum`));
  expect(mockRouterPush).toHaveBeenCalledWith({
    pathname: '/(app)/child/[profileId]/curriculum',
    params: { profileId: childId },
  });
  expect(mockSwitchProfile).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/ParentHomeScreen.tsx --no-coverage
pnpm exec nx run api:typecheck
```

- [ ] **Step 6: Commit**

`/commit` description: `feat(mobile): parent-native child curriculum access from Family Children tab (no proxy)`

---

## Task 9: Recaps API — service, route, shared schema

Server-side recap feed. New shared schema in `packages/schemas/src/recaps.ts`, new route under `apps/api/src/routes/recaps.ts`, new service `apps/api/src/services/recaps.ts`. Reads existing `session_summaries` recap columns (`narrative`, `conversation_prompt`, `engagement_signal`). Spec AC #14 forbids new synonym columns.

**Files:**
- Create: `packages/schemas/src/recaps.ts`
- Modify: `packages/schemas/src/index.ts` (re-export)
- Create: `apps/api/src/services/recaps.ts`
- Create: `apps/api/src/routes/recaps.ts`
- Modify: `apps/api/src/index.ts` (wire the new route)
- Test: `apps/api/src/routes/recaps.test.ts`, `apps/api/src/routes/recaps.integration.test.ts`

- [ ] **Step 1: Define `parentRecapFeedItemSchema`**

`packages/schemas/src/recaps.ts`:

```ts
import { z } from 'zod';
import { engagementSignalSchema } from './sessions';

export const parentRecapFeedItemSchema = z.object({
  id: z.string().uuid(),
  childProfileId: z.string().uuid(),
  childDisplayName: z.string(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  subjectName: z.string().nullable(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  completedAt: z.string().datetime(),
  activeDurationMinutes: z.number().int().nullable(),
  narrative: z.string().nullable(),
  conversationPrompt: z.string().nullable(),
  engagementSignal: engagementSignalSchema.nullable(),
});

export type ParentRecapFeedItem = z.infer<typeof parentRecapFeedItemSchema>;

export const parentRecapFeedResponseSchema = z.object({
  items: z.array(parentRecapFeedItemSchema),
  nextCursor: z.string().nullable(),
});

export const parentRecapFeedQuerySchema = z.object({
  childProfileId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

No `highlight` field per spec §HIGH-2 round 4.

- [ ] **Step 2: Re-export from barrel**

In `packages/schemas/src/index.ts`, add (or rely on `export * from './recaps'` if the pattern matches):

```ts
export * from './recaps';
```

- [ ] **Step 3: Write failing integration test**

`apps/api/src/routes/recaps.integration.test.ts`:

```ts
import { app } from '../index';

describe('GET /recaps (parent feed)', () => {
  it('returns recaps for all linked children of the active parent', async () => {
    // arrange: seed parent owner + 2 child profiles + family_links + completed sessions with narrative
    const res = await app.request('/recaps', { headers: { 'X-Profile-Id': parentId, /* auth */ } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i) => i.childProfileId === childA.id || i.childProfileId === childB.id)).toBe(true);
  });

  it('filters to one child via childProfileId', async () => {
    const res = await app.request(`/recaps?childProfileId=${childA.id}`, { headers });
    const body = await res.json();
    expect(body.items.every((i) => i.childProfileId === childA.id)).toBe(true);
  });

  it('rejects child id outside the active parent family with the existing protected/not-found error shape', async () => {
    const res = await app.request(`/recaps?childProfileId=${otherFamilyChildId}`, { headers });
    expect(res.status).toBe(403); // or 404, match existing protected-data shape
    const body = await res.json();
    expect(body.items).toBeUndefined();
  });

  it('returns empty items when no completed sessions exist', async () => {
    const res = await app.request('/recaps', { headers: parentWithChildButNoSessionsHeaders });
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it('selects narrative, conversation_prompt, engagement_signal only (no synonym columns)', async () => {
    // Adversarial review §MEDIUM-7: tighten the regex so it cannot false-match
    // on legitimate identifiers (e.g. the table name `sessionSummaries`, the
    // type name `RecapSummary`, or any JSDoc containing the word "summary").
    // Forbid only the exact column-access shapes that would indicate a
    // synonym column being read from `sessionSummaries`.
    const src = await fs.readFile(path.join(__dirname, '../services/recaps.ts'), 'utf-8');
    expect(src).not.toMatch(/sessionSummaries\.summary\b/);
    expect(src).not.toMatch(/sessionSummaries\.engagementLabel\b/);
    expect(src).toMatch(/sessionSummaries\.narrative\b/);
    expect(src).toMatch(/sessionSummaries\.conversationPrompt\b/);
    expect(src).toMatch(/sessionSummaries\.engagementSignal\b/);
  });

  // Adversarial review §MEDIUM-5: before authoring this test, read the
  // session_summaries Drizzle schema to determine whether engagement_signal
  // is `text` (free), a Postgres `enum`, or has a CHECK constraint. If the
  // column is typed/checked, the raw INSERT below will fail and the test
  // cannot run — drop it (the invariant is enforced at the DB layer) OR
  // rewrite it as a unit test that feeds the mapper an invalid string
  // directly, bypassing the DB. Only keep the integration shape if the
  // column is plain `text`.
  it('returns engagementSignal=null and logs a warning when DB has an invalid value (no silent recovery)', async () => {
    // arrange: insert a session_summary row with engagement_signal = 'happy' directly via raw SQL
    // arrange: spy on the logger.warn call
    const warnSpy = jest.spyOn(logger, 'warn');
    const res = await app.request('/recaps', { headers });
    const body = await res.json();
    const item = body.items.find((i) => i.sessionId === seededInvalidSessionId);
    expect(item.engagementSignal).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'invalid_engagement_signal',
      expect.objectContaining({ rawValue: 'happy', sessionId: seededInvalidSessionId }),
    );
  });

  it('cursor pagination is stable when two rows have identical completedAt (id tiebreaker)', async () => {
    // arrange: seed two session_summaries with the exact same sessions.completed_at timestamp
    const r1 = await app.request('/recaps?limit=1', { headers });
    const b1 = await r1.json();
    const firstId = b1.items[0].id;
    expect(b1.nextCursor).not.toBeNull();
    const r2 = await app.request(`/recaps?limit=1&cursor=${encodeURIComponent(b1.nextCursor)}`, { headers });
    const b2 = await r2.json();
    expect(b2.items[0].id).not.toBe(firstId); // second row not skipped, not duplicated
  });

  it('cursor pagination yields stable latest-first ordering', async () => {
    const r1 = await app.request('/recaps?limit=2', { headers });
    const b1 = await r1.json();
    const r2 = await app.request(`/recaps?limit=2&cursor=${b1.nextCursor}`, { headers });
    const b2 = await r2.json();
    expect(b1.items[0].completedAt >= b1.items[1].completedAt).toBe(true);
    expect(b2.items[0].completedAt < b1.items[1].completedAt).toBe(true);
  });

  it('works for parent-managed child profile with no linked child account', async () => {
    // arrange: parent + child profile owned by parent's account (no separate Clerk user); session_summaries rows exist
    const res = await app.request('/recaps', { headers: parentHeaders });
    expect(res.status).toBe(200);
    expect((await res.json()).items.length).toBeGreaterThan(0);
  });

  it('works for linked child learner account and respects consent', async () => {
    // arrange: separate Clerk user as child, family_links set, consent active
    const res = await app.request('/recaps', { headers });
    expect((await res.json()).items.length).toBeGreaterThan(0);
  });

  it('returns the existing protected-data error shape when consent is withdrawn', async () => {
    // arrange: consent_status = 'withdrawn' for the linked child
    const res = await app.request(`/recaps?childProfileId=${withdrawnChildId}`, { headers });
    expect(res.status).toBe(403); // or whatever the existing protected-data error shape uses
  });
});
```

- [ ] **Step 4: Run failing tests**

```bash
cd apps/api && pnpm exec jest src/routes/recaps.integration.test.ts --no-coverage
```

Expected: FAIL — service/route don't exist.

- [ ] **Step 5: Implement the service**

`apps/api/src/services/recaps.ts`:

```ts
import { sql, and, or, eq, desc, isNull, lt } from 'drizzle-orm';
import type { Database } from '../db';
import { sessionSummaries, sessions, subjects, curriculumTopics, profiles, familyLinks } from '@eduagent/database';
import { engagementSignalSchema, type EngagementSignal } from '@eduagent/schemas';
import type { ParentRecapFeedItem } from '@eduagent/schemas';
import { logger } from '../logger'; // adjust to the existing logger import path

export async function listParentRecaps(
  db: Database,
  params: {
    parentProfileId: string;
    childProfileId?: string;
    cursor?: string; // ISO datetime
    limit: number;
  },
): Promise<{ items: ParentRecapFeedItem[]; nextCursor: string | null }> {
  // Authorization: ensure childProfileId (if given) belongs to parent via family_links.
  if (params.childProfileId) {
    const link = await db
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .innerJoin(profiles, eq(familyLinks.childProfileId, profiles.id))
      .where(and(
        eq(familyLinks.parentProfileId, params.parentProfileId),
        eq(familyLinks.childProfileId, params.childProfileId),
        isNull(profiles.archivedAt),
      ))
      .limit(1);
    if (link.length === 0) {
      throw new ProtectedDataError('recap-child-not-in-family');
    }
  }

  // Cursor decoding: compound cursor of `{completedAt, id}` to break ties when
  // two sessions completed at the same instant (autosave / batch finaliser /
  // clock granularity). Plain `lt(completedAt)` would either skip or duplicate
  // rows on the boundary (adversarial review §HIGH-4).
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;

  // Direct db.select() with parent-chain WHERE — per CLAUDE.md, scoped repo cannot express multi-table joins; parent-chain pattern is sanctioned.
  const rows = await db
    .select({
      id: sessionSummaries.id,
      childProfileId: sessionSummaries.profileId,
      childDisplayName: profiles.displayName,
      sessionId: sessionSummaries.sessionId,
      subjectId: subjects.id,
      subjectName: subjects.name,
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
      completedAt: sessions.completedAt,
      activeDurationMinutes: sessions.activeDurationMinutes,
      narrative: sessionSummaries.narrative,
      conversationPrompt: sessionSummaries.conversationPrompt,
      engagementSignal: sessionSummaries.engagementSignal,
    })
    .from(sessionSummaries)
    .innerJoin(sessions, eq(sessionSummaries.sessionId, sessions.id))
    .innerJoin(profiles, eq(sessionSummaries.profileId, profiles.id))
    .innerJoin(familyLinks, eq(familyLinks.childProfileId, profiles.id))
    .leftJoin(curriculumTopics, eq(sessions.topicId, curriculumTopics.id))
    .leftJoin(subjects, eq(curriculumTopics.subjectId, subjects.id))
    .where(and(
      eq(familyLinks.parentProfileId, params.parentProfileId),
      isNull(profiles.archivedAt),
      params.childProfileId ? eq(sessionSummaries.profileId, params.childProfileId) : undefined,
      // Compound-cursor predicate: completedAt < t  OR  (completedAt = t AND id < lastId)
      cursor
        ? or(
            lt(sessions.completedAt, cursor.t),
            and(eq(sessions.completedAt, cursor.t), lt(sessionSummaries.id, cursor.id)),
          )
        : undefined,
    ))
    .orderBy(desc(sessions.completedAt), desc(sessionSummaries.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const sliced = hasMore ? rows.slice(0, params.limit) : rows;
  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ t: last.completedAt, id: last.id })
    : null;

  const items: ParentRecapFeedItem[] = sliced.map((r) => {
    // No silent .catch(null) on engagement signal — that hides DB invariant
    // violations forever (CLAUDE.md "Silent recovery without escalation is
    // banned"; adversarial review §HIGH-3). Use safeParse, surface invalid
    // values via the logger, and degrade to null in the response.
    const parsed = engagementSignalSchema.nullable().safeParse(r.engagementSignal);
    let signal: EngagementSignal | null = null;
    if (parsed.success) {
      signal = parsed.data;
    } else {
      logger.warn('invalid_engagement_signal', {
        rawValue: r.engagementSignal,
        sessionId: r.sessionId,
        sessionSummaryId: r.id,
        context: 'recaps.listParentRecaps',
      });
    }
    return {
      id: r.id,
      childProfileId: r.childProfileId,
      childDisplayName: r.childDisplayName,
      sessionId: r.sessionId,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      topicId: r.topicId,
      topicTitle: r.topicTitle,
      completedAt: r.completedAt.toISOString(),
      activeDurationMinutes: r.activeDurationMinutes,
      narrative: r.narrative,
      conversationPrompt: r.conversationPrompt,
      engagementSignal: signal,
    };
  });

  return { items, nextCursor };
}

// Compound-cursor helpers — keep encoding opaque to the client.
// Adversarial review §MEDIUM-2: validate the decoded shape so a malformed
// cursor cannot silently degenerate into `new Date('garbage')` (Invalid Date)
// and produce a broken WHERE clause that returns 0 rows or duplicates page 1.
const cursorPayloadSchema = z.object({
  t: z.string().datetime(),
  id: z.string().uuid(),
});

function encodeCursor(c: { t: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: c.t.toISOString(), id: c.id })).toString('base64url');
}

function decodeCursor(s: string): { t: Date; id: string } | null {
  try {
    const raw = JSON.parse(Buffer.from(s, 'base64url').toString('utf-8'));
    const parsed = cursorPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('invalid_recap_cursor', { rawValue: s, issues: parsed.error.issues });
      return null;
    }
    return { t: new Date(parsed.data.t), id: parsed.data.id };
  } catch {
    logger.warn('invalid_recap_cursor_json', { rawValue: s });
    return null;
  }
}
```

When `decodeCursor` returns `null` the query falls back to "first page" — equivalent to no cursor. Tests must seed an invalid cursor (e.g. `cursor=garbage`) and assert the response is the same as the no-cursor first page, plus the `warn` log fires.

Engagement-signal handling (adversarial review §HIGH-3):
- No `.catch(null)` — silent recovery is banned by CLAUDE.md.
- `safeParse` + `logger.warn` makes invalid DB values visible in observability and queryable in 24-hour windows.
- Tests must seed a row with an invalid value (e.g. `'happy'`) and assert (a) the response degrades to `engagementSignal: null` and (b) the warn log fires.

Cursor pagination (adversarial review §HIGH-4):
- Tests must seed two rows with identical `completedAt` and assert both appear, neither skipped nor duplicated, across page boundaries.

- [ ] **Step 6: Implement the route**

`apps/api/src/routes/recaps.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { parentRecapFeedQuerySchema, parentRecapFeedResponseSchema } from '@eduagent/schemas';
import { listParentRecaps } from '../services/recaps';

export const recapsRoute = new Hono()
  .get(
    '/',
    zValidator('query', parentRecapFeedQuerySchema),
    async (c) => {
      const q = c.req.valid('query');
      const result = await listParentRecaps(c.get('db'), {
        parentProfileId: c.get('profileId'),
        childProfileId: q.childProfileId,
        cursor: q.cursor,
        limit: q.limit,
      });
      return c.json(result);
    },
  );
```

ESLint G1/G5: route file has zero direct DB access. All DB calls in the service. The service does direct `db.select(...)` because the query joins through the parent chain — this is the sanctioned exception in CLAUDE.md ("for queries that join through a parent chain"). The WHERE clause enforces `family_links.parent_profile_id = parentProfileId`.

- [ ] **Step 7: Wire into the Hono app**

In `apps/api/src/index.ts`:

```ts
import { recapsRoute } from './routes/recaps';
// ...
const app = new Hono()
  // ...existing routes...
  .route('/recaps', recapsRoute);
```

- [ ] **Step 8: Run tests + lint + typecheck**

```bash
cd apps/api && pnpm exec jest src/routes/recaps.test.ts src/routes/recaps.integration.test.ts --no-coverage
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

`/commit` description: `feat(api): parent-native recaps feed at GET /recaps with family-link scoping`

---

## Task 10: Recaps mobile screen + hook

Mobile route `apps/mobile/src/app/(app)/recaps.tsx`. New hook `use-parent-recaps.ts`. Child chips, latest-first feed, empty states, Learn-this-too CTA (CTA target wired in Task 13).

**Files:**
- Create: `apps/mobile/src/app/(app)/recaps.tsx`
- Create: `apps/mobile/src/app/(app)/recaps.test.tsx`
- Create: `apps/mobile/src/hooks/use-parent-recaps.ts`
- Create: `apps/mobile/src/hooks/use-parent-recaps.test.ts`
- Create: `apps/mobile/src/lib/engagement-signal-copy.ts` (translation-keyed engagement labels)

- [ ] **Step 0: Ship the `useLearnThisToo` stub (so Task 10 compiles before Task 13)**

Create `apps/mobile/src/hooks/use-learn-this-too.ts`:

```ts
// Task 10 stub. Task 13 replaces this with the entitlement-gated mutation.
export function useLearnThisToo() {
  return {
    mutate: (_input: {
      childProfileId: string;
      childSessionId: string;
      subjectId?: string;
      topicId?: string;
    }) => { /* no-op until Task 13 */ },
    isPending: false,
  };
}
```

This keeps the Task 10 commit green on typecheck and tests without merging it with Task 13. Adversarial review §HIGH-6.

- [ ] **Step 1: Engagement signal copy mapping**

`engagement-signal-copy.ts`:

```ts
import type { EngagementSignal } from '@eduagent/schemas';

// Translation-keyed positive/neutral copy. Maps raw signal to UI string.
// AC #16 + spec §Engagement signal rules: never "struggled", "weak", "below grade level", "trouble".
const COPY: Record<EngagementSignal, string> = {
  curious: 'Curious and engaged',
  focused: 'Focused',
  breezing: 'Breezing through',
  stuck: 'Needs more time',         // mapped from raw "stuck" to gentle label
  scattered: 'Finding focus',       // mapped from raw "scattered"
};

export function engagementSignalCopy(signal: EngagementSignal | null): string | null {
  return signal ? COPY[signal] : null;
}
```

Add a co-located test that asserts no banned phrase appears in the COPY values:

```ts
import { engagementSignalCopy } from './engagement-signal-copy';
import { ENGAGEMENT_SIGNALS } from '@eduagent/schemas';

const BANNED = /struggl|weak|trouble|below grade|declining/i;

test('no engagement copy contains banned negative-framing phrases', () => {
  for (const s of ENGAGEMENT_SIGNALS) {
    const copy = engagementSignalCopy(s);
    expect(copy).not.toMatch(BANNED);
  }
});
```

This is a forward-only guard (per CLAUDE.md "Fix Development Rules" → sweep). Add it now so future signal additions are checked.

- [ ] **Step 2: Hook**

`use-parent-recaps.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { client } from '../lib/api-client';
import type { ParentRecapFeedItem } from '@eduagent/schemas';

export function useParentRecaps(opts: { childProfileId?: string }) {
  return useInfiniteQuery({
    queryKey: ['recaps', /* parentProfileId */, opts.childProfileId ?? 'all'],
    queryFn: async ({ pageParam }) => {
      const res = await client.recaps.$get({
        query: {
          childProfileId: opts.childProfileId,
          cursor: pageParam,
          limit: 20,
        },
      });
      if (!res.ok) throw new Error('recaps-fetch-failed');
      return res.json() as Promise<{ items: ParentRecapFeedItem[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
```

The `parentProfileId` must be in the query key — leak invariant. Inject via `useActiveProfile()` or equivalent.

- [ ] **Step 3: Screen**

`recaps.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useParentRecaps } from '../../hooks/use-parent-recaps';
import { useLinkedChildren } from '../../lib/profile';
import { engagementSignalCopy } from '../../lib/engagement-signal-copy';
import { ErrorFallback } from '../../components/common/ErrorFallback'; // verified path; existing per CLAUDE.md UX Resilience Rules
import { useRouter } from 'expo-router';
// Task 13 ships the real implementation. For Task 10 to compile and commit
// independently, ship a stub at this path that exposes `mutate` as a no-op:
//
//   // apps/mobile/src/hooks/use-learn-this-too.ts (Task 10 stub)
//   export function useLearnThisToo() {
//     return { mutate: (_: unknown) => {}, isPending: false };
//   }
//
// Task 13 replaces the stub with the entitlement-gated mutation. The Task 10
// tests for "Add to my learning triggers the hook" can stub `mutate` via
// jest.spyOn — they don't depend on the real implementation existing yet.
// (Adversarial review §HIGH-6.)
import { useLearnThisToo } from '../../hooks/use-learn-this-too';

export default function RecapsScreen() {
  const router = useRouter();
  const children = useLinkedChildren();
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(undefined);
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useParentRecaps({ childProfileId: selectedChildId });
  const learnThisToo = useLearnThisToo();

  if (error) {
    return <ErrorFallback onRetry={refetch} onBack={() => router.replace('/(app)/home')} />;
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View testID="recaps-screen">
      <Text>Recaps</Text>
      <Text>What your kids studied</Text>

      <FlatList
        testID="recaps-child-chips"
        horizontal
        data={[{ id: undefined, displayName: 'All' }, ...children.map((c) => ({ id: c.id, displayName: c.displayName }))]}
        keyExtractor={(c) => c.id ?? 'all'}
        renderItem={({ item }) => (
          <Pressable
            testID={`recaps-chip-${item.id ?? 'all'}`}
            onPress={() => setSelectedChildId(item.id)}
            accessibilityState={{ selected: selectedChildId === item.id }}
          >
            <Text>{item.displayName}</Text>
          </Pressable>
        )}
      />

      {items.length === 0 && !isLoading && (
        <Text testID="recaps-empty">
          {selectedChildId
            ? `${children.find((c) => c.id === selectedChildId)?.displayName ?? 'This child'} hasn't completed a session yet.`
            : 'Recaps appear after your children study.'}
        </Text>
      )}

      <FlatList
        testID="recaps-feed"
        data={items}
        keyExtractor={(r) => r.id}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        renderItem={({ item }) => (
          <View testID={`recap-card-${item.id}`}>
            <Text>{item.childDisplayName} • {item.subjectName ?? '—'}</Text>
            <Text>{item.topicTitle ?? '—'}</Text>
            <Text>{new Date(item.completedAt).toLocaleString()}</Text>
            <Text>{item.activeDurationMinutes ? `${item.activeDurationMinutes} min` : ''}</Text>
            {item.narrative && <Text>{item.narrative}</Text>}
            {item.conversationPrompt && <Text>Ask: {item.conversationPrompt}</Text>}
            {item.engagementSignal && <Text>{engagementSignalCopy(item.engagementSignal)}</Text>}
            <Pressable
              testID={`recap-learn-this-too-${item.id}`}
              onPress={() => learnThisToo.mutate({
                childProfileId: item.childProfileId,
                childSessionId: item.sessionId,
                subjectId: item.subjectId ?? undefined,
                topicId: item.topicId ?? undefined,
              })}
            >
              <Text>Add to my learning</Text>
            </Pressable>
            <Pressable
              testID={`recap-open-detail-${item.id}`}
              onPress={() => router.push({
                pathname: '/(app)/child/[profileId]/session/[sessionId]',
                params: { profileId: item.childProfileId, sessionId: item.sessionId, returnTo: 'family-recaps' },
              })}
            >
              <Text>Open recap detail</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 4: Tests**

`recaps.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RecapsScreen from './recaps';

describe('RecapsScreen', () => {
  it('renders all-child feed by default with chips', async () => {
    // seed query cache with 2 items across 2 children
    const { getByTestId, findAllByTestId } = render(<RecapsScreen />);
    expect(getByTestId('recaps-chip-all')).toBeTruthy();
    expect((await findAllByTestId(/^recap-card-/)).length).toBe(2);
  });

  it('filters when a child chip is selected', async () => {
    const { getByTestId, findAllByTestId } = render(<RecapsScreen />);
    fireEvent.press(getByTestId(`recaps-chip-${childA.id}`));
    const cards = await findAllByTestId(/^recap-card-/);
    expect(cards.length).toBe(1);
  });

  it('renders all-children empty state when no items', async () => {
    const { getByTestId } = render(<RecapsScreen />); // seed empty
    expect(getByTestId('recaps-empty').props.children).toMatch(/recaps appear after your children study/i);
  });

  it('renders per-child empty state when filter selected', async () => {
    const { getByTestId } = render(<RecapsScreen />);
    fireEvent.press(getByTestId(`recaps-chip-${childA.id}`));
    expect(getByTestId('recaps-empty').props.children).toMatch(/hasn't completed a session/i);
  });

  it('Add to my learning triggers the hook with child context', async () => {
    const { getByTestId } = render(<RecapsScreen />);
    fireEvent.press(getByTestId(`recap-learn-this-too-${recapId}`));
    expect(mockLearnThisTooMutate).toHaveBeenCalledWith(expect.objectContaining({
      childProfileId: childA.id,
      childSessionId: sessionId,
    }));
  });

  it('renders translation-keyed engagement copy (not raw)', async () => {
    // seed item with engagementSignal: 'stuck'
    const { getByTestId } = render(<RecapsScreen />);
    const card = getByTestId(`recap-card-${id}`);
    expect(card).toHaveTextContent('Needs more time');
    expect(card).not.toHaveTextContent('stuck');
    expect(card).not.toHaveTextContent(/struggl/i);
  });

  it('shows ErrorFallback on fetch error', async () => {
    // arrange: hook returns error
    const { getByTestId } = render(<RecapsScreen />);
    expect(getByTestId('error-fallback')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/recaps.tsx src/hooks/use-parent-recaps.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

`/commit` description: `feat(mobile): Recaps screen with child filter, latest-first feed, empty + error states`

---

## Task 11: Progress context filtering

Family Progress: child/family only, no parent self picker. Study Progress: self only. Add explicit "Family Progress" vs "My Progress" header copy. Spec ACs #10, #11.

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress/index.tsx:493-557` (profile picker logic)
- Modify: co-located test

- [ ] **Step 1: Read the current picker logic**

The existing logic uses `selectedProfileId` (line 509) and `isViewingSelf` (line 538). The picker offers all profiles. The new behavior:

| Mode | Picker includes self? | Picker includes children? | Header |
|------|-----------------------|---------------------------|--------|
| Study | yes (always) | no | "My Progress" |
| Family | no | yes (all visible children) | "Family Progress" |
| Proxy override | child only | n/a | (existing proxy chrome) |

- [ ] **Step 2: Write failing tests**

In `progress/index.test.tsx`:

```tsx
describe('ProgressScreen — context filtering', () => {
  it('Family mode: picker contains children only, not parent self', () => {
    const { queryByTestId, getByTestId } = renderProgress({ mode: 'family' });
    expect(getByTestId(`progress-picker-child-${childA.id}`)).toBeTruthy();
    expect(getByTestId(`progress-picker-child-${childB.id}`)).toBeTruthy();
    expect(queryByTestId(`progress-picker-self`)).toBeNull();
  });

  it('Study mode: picker contains self only, no child rows', () => {
    const { queryByTestId, getByTestId } = renderProgress({ mode: 'study' });
    expect(getByTestId('progress-picker-self')).toBeTruthy();
    expect(queryByTestId(/^progress-picker-child-/)).toBeNull();
  });

  it('Family mode header reads "Family Progress"', () => {
    const { getByTestId } = renderProgress({ mode: 'family' });
    expect(getByTestId('progress-header')).toHaveTextContent('Family Progress');
  });

  it('Study mode header reads "My Progress"', () => {
    const { getByTestId } = renderProgress({ mode: 'study' });
    expect(getByTestId('progress-header')).toHaveTextContent('My Progress');
  });

  it('Family Progress query key includes app context + child filter', () => {
    // assert via spy on useQuery / queryKey shape
  });
});
```

- [ ] **Step 3: Implement the filtering**

In `progress/index.tsx`, derive `mode` from active profile + context:

```ts
const mode: 'study' | 'family' = isParentProxy
  ? 'study'
  : activeProfile?.defaultAppContext === 'family' && isFamilyCapableProfile(activeProfile)
    ? 'family'
    : 'study';

const eligibleProfiles = mode === 'family'
  ? linkedChildren                       // children only
  : [activeProfile].filter(Boolean);     // self only

const headerLabel = mode === 'family' ? 'Family Progress' : 'My Progress';
```

Update the pill/picker row to render `eligibleProfiles`. Update the header copy. Update the query keys that fetch progress data to include `mode` and the effective profile/child id:

```ts
useQuery({
  queryKey: ['progress', mode, selectedProfileId, /* parentProfileId for family */],
  // ...
});
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/index.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): Progress mode-aware filtering — Family shows children only, Study shows self only`

---

## Task 12: Hide proxy from normal parent UX

Spec §Proxy Handling — Phase 1. Remove "View account" path from `profiles.tsx`. Repoint to Recaps/Progress/child-detail. Synthetic proxy unit tests stay green.

**Files:**
- Modify: `apps/mobile/src/app/profiles.tsx:259-378`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx:180-238` (ProxyBanner switch-back must `router.replace`)
- Test: `apps/mobile/src/app/profiles.test.tsx`

- [ ] **Step 0: Audit every `switchProfile(` callsite (adversarial review §HIGH-9)**

Removing one entry point doesn't remove proxy capability. Grep `apps/mobile/src/` for `switchProfile(` and classify each callsite in the PR description:

| File:line | Type | Verdict |
|-----------|------|---------|
| (audit output) | adult↔adult switch | keep |
| (audit output) | parent→child proxy | repoint at parent-native route |
| (audit output) | test-only synthetic | keep, asserted in Step 4 |

Any callsite classified as "parent→child proxy" outside the explicitly-retained `ProxyBanner` flow must be repointed before the task completes. Use Grep with pattern `switchProfile\s*\(` in `apps/mobile/src/`. Notification handlers (Task 15), child cards (Task 8), and deep-link handlers are the highest-risk surfaces.

- [ ] **Step 1: Write failing tests**

In `profiles.test.tsx`:

```tsx
it('end-user profile row tap does not open a "View account" proxy modal', () => {
  const { queryByText, getByTestId } = render(<ProfilesScreen />);
  fireEvent.press(getByTestId(`profile-row-${childId}`));
  expect(queryByText(/view account/i)).toBeNull();
  expect(mockSwitchProfile).not.toHaveBeenCalledWith(childId, expect.objectContaining({ asProxy: true }));
});

it('end-user profile row tap navigates to parent-native child detail (Family) or own profile detail (Study)', () => {
  // arrange: active profile is owner with family capability
  const { getByTestId } = render(<ProfilesScreen />);
  fireEvent.press(getByTestId(`profile-row-${childId}`));
  expect(mockRouterPush).toHaveBeenCalledWith({
    pathname: '/(app)/child/[profileId]',
    params: { profileId: childId },
  });
});

it('ProxyBanner Switch Back calls switchProfile and router.replace to canonical adult root', async () => {
  // simulate isParentProxy = true
  const { getByText } = render(<ProxyBanner childName="A" onSwitchBack={onSwitchBack} />);
  fireEvent.press(getByText(/switch back/i));
  expect(onSwitchBack).toHaveBeenCalled();
  // and the caller (in _layout.tsx) must router.replace('/(app)/home') after the profile mutation succeeds
});
```

- [ ] **Step 2: Remove "View account" flow**

In `profiles.tsx:337-378`, delete the modal and the proxy entry path. Replace the row press handler:

```tsx
const onProfileRowPress = (target: Profile) => {
  if (target.id === activeProfile?.id) return; // tapping self is a no-op or opens profile settings
  if (target.isOwner) {
    // switch to that owner profile (normal profile switch, not proxy)
    switchProfile(target.id);
    return;
  }
  // Non-owner (child) profile: navigate to parent-native child detail; do not switch profile.
  router.push({ pathname: '/(app)/child/[profileId]', params: { profileId: target.id } });
};
```

- [ ] **Step 3: Make ProxyBanner switch-back use `router.replace`**

In `_layout.tsx:180-238`, the `ProxyBanner` is currently presentational. The `onSwitchBack` caller (the `_layout` body that wires the banner) currently calls `switchProfile(parentProfile.id)`. Wrap that call:

```ts
const onProxyExit = async () => {
  await switchProfileMutation.mutateAsync(parentProfile.id);
  router.replace('/(app)/home'); // canonical adult root; mode-aware home renders ParentHome or LearnerScreen
};

return <ProxyBanner childName={childProfile.displayName} onSwitchBack={onProxyExit} />;
```

This satisfies spec §Navigation Contract → "Proxy exit" and AC #30/32/33 (no stale child detail in back stack).

- [ ] **Step 4: Keep synthetic proxy tests alive**

Search:

```bash
```

Use Grep with pattern `isParentProxy` in `apps/mobile/src/`. For each remaining test that asserts proxy behavior, verify the test still passes by synthesizing the proxy state (e.g., seeding `useParentProxy` mock or testing the `ProxyBanner` component directly). Per spec AC #23, retain those tests. They satisfy the "proxy chrome wins when isParentProxy is true" invariant even after end-user paths are removed.

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/profiles.tsx src/app/\(app\)/_layout.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

`/commit` description: `feat(mobile): remove "View account" proxy entry from normal profile picker; ProxyBanner switch-back uses router.replace`

---

## Task 13: Add to my learning — quota pre-check + same-account Study switch

The bridge from a child recap to adult Study. Pre-check adult entitlement before patching mode. Spec §Learn This Too Contract + AC #17/18/19/28.

**Files:**
- Create: `apps/mobile/src/hooks/use-learn-this-too.ts`
- Create: `apps/mobile/src/hooks/use-learn-this-too.test.ts`
- Possibly extend: `apps/api/src/routes/entitlement.ts` (or whichever existing endpoint exposes quota check). If none exists, the spec footnote points to `createProfileWithLimitCheck()` — that's profile-creation-specific, not session quota. Verify with research.

- [ ] **Step 1: Add `GET /entitlement/study` (decision: option (a) per adversarial review §HIGH-8)**

The existing quota predicate lives in `apps/api/src/middleware/metering.ts` (confirmed via grep). Expose it as a read-only HTTP endpoint. Option (b) — reusing session-start with `dryRun` — was rejected: it risks mutating metering counters and idempotency state if `dryRun` is ever wired imperfectly.

Spec for the new endpoint:

```ts
// apps/api/src/routes/entitlement.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { canStartSession } from '../middleware/metering'; // factor out the predicate

export const entitlementSchema = z.object({
  canStart: z.boolean(),
  reason: z.enum(['daily-cap', 'monthly-cap', 'subscription']).optional(),
});

export const entitlementRoute = new Hono().get('/study', async (c) => {
  const accountId = c.get('account').id;
  const profileId = c.get('profileId');
  const result = await canStartSession(c.get('db'), { accountId, profileId });
  return c.json(entitlementSchema.parse(result));
});
```

Wire `entitlementRoute` at `/entitlement` in `apps/api/src/index.ts`. The route is read-only — no metering counter increments, no idempotency-key writes, no Inngest dispatches.

Add a service-side test that `canStartSession` is purely read-only (no mutations).

- [ ] **Step 2: Write failing hook tests**

```ts
describe('useLearnThisToo', () => {
  it('blocks before mode change when adult quota is exhausted', async () => {
    // arrange: entitlement endpoint returns canStart: false, reason: 'daily-cap'
    const { result } = renderHook(() => useLearnThisToo());
    await act(() => result.current.mutateAsync({ childProfileId: 'c1', childSessionId: 's1' }));
    expect(showQuotaExceededUI).toHaveBeenCalled();
    expect(modeSwitchMutation.mutate).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(trackedEvents).toContainEqual({ name: 'learn_this_too_quota_blocked', /* props */ });
  });

  it('patches defaultAppContext=study then router.replaces to a Study entry with StudySourceContext', async () => {
    // arrange: entitlement canStart: true
    const { result } = renderHook(() => useLearnThisToo());
    await act(() => result.current.mutateAsync({
      childProfileId: 'c1', childSessionId: 's1', subjectId: 'sub1', topicId: 't1',
    }));
    expect(patchProfile).toHaveBeenCalledWith({ defaultAppContext: 'study' });
    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(app)/home', // or the Study entry route
      params: expect.objectContaining({
        studySource: 'child-recap',
        childProfileId: 'c1',
        childSessionId: 's1',
        subjectId: 'sub1',
        topicId: 't1',
      }),
    });
    expect(trackedEvents).toContainEqual(expect.objectContaining({ name: 'learn_this_too_tapped' }));
  });

  it('writes happen on adult profile only — child IDs are metadata, never write scope', () => {
    // arrange + assert: profile/session writes initiated subsequently use activeProfile.id, not childProfileId
  });
});
```

- [ ] **Step 3: Implement the hook**

```ts
// use-learn-this-too.ts
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { client } from '../lib/api-client';
import { track, hashProfileId } from '../lib/analytics';
import { useActiveProfile } from './use-active-profile'; // assumed exists; locate exact path
import type { StudySourceContext } from '@eduagent/schemas';

export function useLearnThisToo() {
  const router = useRouter();
  const { activeProfile } = useActiveProfile();

  return useMutation({
    mutationFn: async (input: {
      childProfileId: string;
      childSessionId: string;
      subjectId?: string;
      topicId?: string;
    }) => {
      if (!activeProfile) throw new Error('no-active-profile');

      track('learn_this_too_tapped', {
        profileIdHash: hashProfileId(activeProfile.id),
        hasSubject: Boolean(input.subjectId),
      });

      // Quota/entitlement pre-check
      const ent = await client.entitlement.study.$get();
      const entBody = await ent.json();
      if (!entBody.canStart) {
        track('learn_this_too_quota_blocked', {
          profileIdHash: hashProfileId(activeProfile.id),
          reason: entBody.reason,
        });
        showQuotaExceededUI(entBody.reason); // existing UI per CLAUDE.md UX Resilience Rules
        return { blocked: true as const, reason: entBody.reason };
      }

      // Patch mode
      await client.profiles[':id'].$patch({
        param: { id: activeProfile.id },
        json: { defaultAppContext: 'study' },
      });

      // Navigate with source context
      router.replace({
        pathname: '/(app)/home',
        params: {
          studySource: 'child-recap',
          childProfileId: input.childProfileId,
          childSessionId: input.childSessionId,
          ...(input.subjectId ? { subjectId: input.subjectId } : {}),
          ...(input.topicId ? { topicId: input.topicId } : {}),
        },
      });

      return { blocked: false as const };
    },
  });
}
```

- [ ] **Step 4: Add `StudySourceContext` to the shared schemas**

In `packages/schemas/src/recaps.ts` (already created in Task 9), add:

```ts
export const studySourceContextSchema = z.object({
  source: z.literal('child-recap'),
  childProfileId: z.string().uuid(),
  childSessionId: z.string().uuid(),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});

export type StudySourceContext = z.infer<typeof studySourceContextSchema>;
```

- [ ] **Step 5: Read `StudySourceContext` on the Study entry route**

In `home.tsx` (or `LearnerScreen.tsx`), parse `useLocalSearchParams()` for `studySource === 'child-recap'`. If present, render a lightweight "Learn the basics" confirmation entry rather than silently creating a subject/book. Hand off the params to the existing learner entry flow.

Crucially: the create-session/create-subject mutations must continue to scope writes to `activeProfile.id`. `StudySourceContext` is metadata only. Add a defensive assertion in the entry route:

```ts
useEffect(() => {
  if (params.studySource === 'child-recap') {
    // assert never sent to any write call
  }
}, [params.studySource]);
```

- [ ] **Step 6: Server-side break test**

Add to `apps/api/src/routes/sessions.test.ts` (or wherever session writes are tested):

```ts
it('session create writes adult profileId even when the request body contains a child id metadata field', async () => {
  const res = await app.request('/sessions', {
    method: 'POST',
    headers: { 'X-Profile-Id': adultId },
    body: JSON.stringify({
      subjectId,
      topicId,
      // intentional payload pollution:
      studySourceChildProfileId: childId,
    }),
  });
  const session = (await res.json()).session;
  expect(session.profileId).toBe(adultId);
  expect(session.profileId).not.toBe(childId);
});

it('the session-create request schema explicitly rejects studySourceChildProfileId (defense-in-depth)', () => {
  // Adversarial review §MEDIUM-4: don't rely on Zod's default strip mode silently
  // dropping the field — that protection vanishes the day someone adds .passthrough().
  // Test the schema directly.
  const { sessionCreateSchema } = require('@eduagent/schemas');
  const parsed = sessionCreateSchema.safeParse({
    subjectId: 'a', topicId: 'b', studySourceChildProfileId: 'c',
  });
  // Either: strict mode rejects, OR strip mode produces output without the polluting key
  if (parsed.success) {
    expect(parsed.data).not.toHaveProperty('studySourceChildProfileId');
  }
});
```

- [ ] **Step 7: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-learn-this-too.ts src/app/\(app\)/recaps.tsx --no-coverage
cd apps/api && pnpm exec jest --findRelatedTests src/routes/sessions.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
```

- [ ] **Step 8: Commit**

`/commit` description: `feat(mobile,api): Add to my learning — adult quota pre-check, mode patch, router.replace into Study with StudySourceContext`

---

## Task 14: `own-learning.tsx` route survival

Per spec §Route Survival: the top-level Own Learning tab is removed from Family mode, but the route survives as a compatibility/deep-link bridge that redirects eligible adults into Study mode.

**Files:**
- Modify: `apps/mobile/src/app/(app)/own-learning.tsx`
- Test: co-located

- [ ] **Step 1: Write failing tests**

```tsx
it('eligible adult opens /(app)/own-learning → switches to Study and replaces to /(app)/home', async () => {
  // arrange: family-capable adult in Family mode
  render(<OwnLearningScreen />);
  await waitFor(() => {
    expect(patchProfile).toHaveBeenCalledWith({ defaultAppContext: 'study' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/home');
  });
});

it('Study-only user opens /(app)/own-learning → routes to /(app)/home (no mode patch)', async () => {
  render(<OwnLearningScreen />);
  await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/home'));
  expect(patchProfile).not.toHaveBeenCalled();
});

it('ineligible non-owner (child profile) opens /(app)/own-learning → no-access fallback returning to Family home', async () => {
  // arrange: active profile is a child on shared parent account
  render(<OwnLearningScreen />);
  expect(screen.getByTestId('own-learning-no-access')).toBeTruthy();
});
```

- [ ] **Step 2: Implement the bridge**

Replace `own-learning.tsx` body with:

```tsx
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { isFamilyCapableProfile } from '../../lib/profile';
import { useModeSwitch } from '../../hooks/use-mode-switch';
import { View, Text, Pressable } from 'react-native';

export default function OwnLearningRedirect() {
  const router = useRouter();
  const { activeProfile } = useActiveProfile();
  const modeSwitch = useModeSwitch(activeProfile);

  useEffect(() => {
    if (!activeProfile) return;
    if (activeProfile.defaultAppContext === 'family' && isFamilyCapableProfile(activeProfile)) {
      // Adversarial review §HIGH-2: useModeSwitch.onSuccess only navigates when
      // the current pathname is in FAMILY_ONLY_ROUTES. /own-learning is not in
      // that list, so this bridge must drive its own router.replace after the
      // mutation resolves.
      modeSwitch.mutateAsync('study')
        .then(() => router.replace('/(app)/home'))
        .catch(() => router.replace('/(app)/home')); // even on failure, don't strand the user
      return;
    }
    if (activeProfile.isOwner) {
      router.replace('/(app)/home');
      return;
    }
    // non-owner child profile: no-access fallback handled below
  }, [activeProfile, modeSwitch, router]);

  if (activeProfile && !activeProfile.isOwner) {
    return (
      <View>
        <Text testID="own-learning-no-access">This space is for adult owners only.</Text>
        <Pressable onPress={() => router.replace('/(app)/home')}>
          <Text>Back to Family home</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}
```

- [ ] **Step 3: Confirm the route is hidden from Family/Study tab bars**

In `_layout.tsx`, ensure `own-learning` is not in `STUDY_TABS` or `FAMILY_TABS` (it is not, per Task 1). The Tabs.Screen entry for `own-learning` (if it exists) should use `href: null` + `display: 'none'` so it remains a deep-linkable route without appearing in either tab bar.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/own-learning.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): own-learning.tsx becomes a Study-mode redirect bridge for deep links`

---

## Task 15: Notification routing — explicit context transitions

Parent/family push taps switch into Family mode and replace into Recaps. During an active full-screen Study session, prompt/queue rather than silently interrupt. Spec §Technical Decisions + AC #29.

**Files:**
- Modify: `apps/mobile/src/hooks/use-notification-response-handler.ts`
- Test: co-located

- [ ] **Step 1: Identify notification types that should land in Family**

Read `use-notification-response-handler.ts:23-51`. Existing case: `type === 'nudge'`. Add cases for parent-facing notifications:

- `type === 'child_session_recap'` → Family + Recaps detail
- `type === 'family_progress'` → Family + Progress

Confirm what notification types the backend sends by Grepping `inngest.send` / `pushNotification` in `apps/api/src/inngest/`. Spec lists `weekly-progress-push.ts` and `recall-nudge-send.ts` as references.

- [ ] **Step 2: Write failing test**

```ts
it('child_session_recap tap while in Study switches to Family and replaces to Recaps detail', async () => {
  const handler = renderHookAndExtractHandler();
  await handler({
    notification: { request: { content: { data: { type: 'child_session_recap', childProfileId: 'c1', sessionId: 's1' } } } },
  });
  expect(patchProfile).toHaveBeenCalledWith({ defaultAppContext: 'family' });
  expect(mockRouterReplace).toHaveBeenCalledWith({
    pathname: '/(app)/child/[profileId]/session/[sessionId]',
    params: { profileId: 'c1', sessionId: 's1', returnTo: 'family-recaps' },
  });
});

it('child_session_recap tap during an active full-screen Study session prompts/queues instead of replacing', async () => {
  // arrange: useActiveSession returns { isActive: true, isFullScreen: true }
  await handler({ notification: { /* same */ } });
  expect(showInterruptPrompt).toHaveBeenCalled();
  expect(mockRouterReplace).not.toHaveBeenCalled();
});

it('family_progress tap while in Family stays in Family and replaces to Progress', async () => {
  await handler({ notification: { request: { content: { data: { type: 'family_progress' } } } } });
  expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/progress');
});
```

- [ ] **Step 3: Implement**

```ts
case 'child_session_recap': {
  const { childProfileId, sessionId } = data;
  if (isFullScreenStudySessionActive()) {
    showInterruptPrompt({
      onConfirm: () => completeFamilyTransition({ childProfileId, sessionId }),
    });
    return;
  }
  await completeFamilyTransition({ childProfileId, sessionId });
  break;
}

async function completeFamilyTransition({ childProfileId, sessionId }) {
  if (activeProfile && isFamilyCapableProfile(activeProfile) && activeProfile.defaultAppContext !== 'family') {
    await modeSwitch.mutateAsync('family');
  }
  router.replace({
    pathname: '/(app)/child/[profileId]/session/[sessionId]',
    params: { profileId: childProfileId, sessionId, returnTo: 'family-recaps' },
  });
}
```

`isFullScreenStudySessionActive()` reads the existing session UI state. If no such helper exists, add a small selector against the session store/context.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-notification-response-handler.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): notification taps switch context explicitly; prompt during active Study sessions`

---

## Task 16: Navigation hardening — extend existing `goBackOrReplace` / `homeHrefForReturnTo` with new return tokens

Spec §Navigation Contract. **Both helpers already exist** at `apps/mobile/src/lib/navigation.ts:16-24` (`homeHrefForReturnTo`) and `apps/mobile/src/lib/navigation.ts:26-36` (`goBackOrReplace`). Adversarial review §CRITICAL-1 / §MEDIUM-1: do NOT create parallel implementations. Extend in place, keep the existing `Href` return type and `string | string[] | undefined` token shape (deep-link params are arrays).

**Files:**
- Modify: `apps/mobile/src/lib/navigation.ts` (extend existing tokens + switch)
- Modify: `apps/mobile/src/lib/navigation.test.ts` (extend existing tests)
- Modify: every detail screen that currently uses bare `router.back()` — locate via Grep

- [ ] **Step 1: Audit existing tokens and consumers**

Read `navigation.ts` end-to-end. Existing tokens: `'own-learning'`, `'learner-home'`, `'practice'`. Search for every `returnTo=` and `homeHrefForReturnTo(...)` call site:

Use Grep with pattern `homeHrefForReturnTo|returnTo=|returnTo:` in `apps/mobile/src/`. Catalogue every token currently in use. The new tokens MUST not collide with these.

- [ ] **Step 2: Add new return tokens + extend `homeHrefForReturnTo`**

Append to `navigation.ts`:

```ts
export const FAMILY_RECAPS_RETURN_TO = 'family-recaps';
export const FAMILY_RECAPS_HREF = '/(app)/recaps';
export const FAMILY_PROGRESS_RETURN_TO = 'family-progress';
export const FAMILY_PROGRESS_HREF = '/(app)/progress';
export const STUDY_PROGRESS_RETURN_TO = 'study-progress';
export const STUDY_PROGRESS_HREF = '/(app)/progress';
export const FAMILY_CHILDREN_RETURN_TO = 'family-children';
export const FAMILY_CHILDREN_HREF = '/(app)/home';
```

Extend `homeHrefForReturnTo` to switch on the new tokens. Keep its existing signature `(returnTo: string | string[] | undefined): Href` — deep-link params can be `string[]`:

```ts
export function homeHrefForReturnTo(
  returnTo: string | string[] | undefined,
): Href {
  const token = firstParam(returnTo);
  if (token === OWN_LEARNING_RETURN_TO) return OWN_LEARNING_HREF as Href;
  if (token === LEARNER_HOME_RETURN_TO) return LEARNER_HOME_HREF as Href;
  if (token === PRACTICE_RETURN_TO) return PRACTICE_HREF as Href;
  if (token === FAMILY_RECAPS_RETURN_TO) return FAMILY_RECAPS_HREF as Href;
  if (token === FAMILY_PROGRESS_RETURN_TO) return FAMILY_PROGRESS_HREF as Href;
  if (token === STUDY_PROGRESS_RETURN_TO) return STUDY_PROGRESS_HREF as Href;
  if (token === FAMILY_CHILDREN_RETURN_TO) return FAMILY_CHILDREN_HREF as Href;
  return '/(app)/home' as Href;
}
```

`goBackOrReplace` already exists with the right shape — do NOT modify its signature. Call sites pass `homeHrefForReturnTo(params.returnTo)` to get the fallback `Href`.

- [ ] **Step 3: Extend tests (do not duplicate)**

In the existing `navigation.test.ts`, add cases for each new token. Do not re-author the existing `goBackOrReplace` tests — they are already correct.

```ts
import {
  homeHrefForReturnTo,
  FAMILY_RECAPS_RETURN_TO,
  FAMILY_RECAPS_HREF,
  FAMILY_PROGRESS_RETURN_TO,
  FAMILY_PROGRESS_HREF,
  STUDY_PROGRESS_RETURN_TO,
  FAMILY_CHILDREN_RETURN_TO,
} from './navigation';

describe('homeHrefForReturnTo — Study/Family tokens', () => {
  it('resolves family-recaps token', () => {
    expect(homeHrefForReturnTo(FAMILY_RECAPS_RETURN_TO)).toBe(FAMILY_RECAPS_HREF);
  });
  it('resolves family-progress token', () => {
    expect(homeHrefForReturnTo(FAMILY_PROGRESS_RETURN_TO)).toBe(FAMILY_PROGRESS_HREF);
  });
  it('resolves study-progress token (same href, different intent)', () => {
    expect(homeHrefForReturnTo(STUDY_PROGRESS_RETURN_TO)).toBe('/(app)/progress');
  });
  it('resolves family-children token to home', () => {
    expect(homeHrefForReturnTo(FAMILY_CHILDREN_RETURN_TO)).toBe('/(app)/home');
  });
  it('accepts string[] from deep-link params (first element wins)', () => {
    expect(homeHrefForReturnTo([FAMILY_RECAPS_RETURN_TO])).toBe(FAMILY_RECAPS_HREF);
  });
  it('falls back to /(app)/home for unknown token', () => {
    expect(homeHrefForReturnTo('totally-bogus')).toBe('/(app)/home');
  });
});
```

- [ ] **Step 4: Apply in detail screens**

Use Grep with pattern `router\.back\(\)` in `apps/mobile/src/app/`. For each match, identify the natural fallback href for that screen's context, then convert to:

```ts
goBackOrReplace(router, homeHrefForReturnTo(params.returnTo) ?? FAMILY_RECAPS_HREF);
```

Priority detail screens to update:
- `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` → fallback `FAMILY_RECAPS_HREF`
- `apps/mobile/src/app/(app)/progress/[profileId]/...` → fallback `FAMILY_PROGRESS_HREF` or `STUDY_PROGRESS_HREF` depending on the rendered mode
- Any recap-related detail screen added later

A returned `Href` from `homeHrefForReturnTo` is never undefined, so the screen passes it directly to `goBackOrReplace` — no separate enum/record lookup required.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): typed return targets + goBackOrReplace; refactor detail-screen back handlers`

---

## Task 17: Analytics events

Required events: `mode_intent_chosen`, `mode_switched`, `learn_this_too_tapped`, `learn_this_too_quota_blocked`, `learn_this_too_completed`. All properties hashed/safe.

**Files:** already touched in Tasks 6, 7, 13. This task is a sweep + a single test that all five events fire from their respective code paths with safe properties.

- [ ] **Step 1: Add a forward-only analytics test**

In `apps/mobile/src/lib/analytics.test.ts` (extend or create):

```ts
import { __getRecordedEvents, __resetRecordedEvents, track } from './analytics';

beforeEach(() => __resetRecordedEvents());

test('analytics event names are stable + properties never include raw profile ids or free-text PII', () => {
  track('mode_intent_chosen', { intent: 'study' });
  track('mode_switched', { from: 'study', to: 'family', profileIdHash: 'v2_abcd' });
  track('learn_this_too_tapped', { profileIdHash: 'v2_abcd', hasSubject: true });
  track('learn_this_too_quota_blocked', { profileIdHash: 'v2_abcd', reason: 'daily-cap' });
  track('learn_this_too_completed', { profileIdHash: 'v2_abcd' });

  const events = __getRecordedEvents();
  for (const e of events) {
    const json = JSON.stringify(e.properties);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no raw UUIDs
    if ('profileIdHash' in (e.properties ?? {})) {
      expect((e.properties as any).profileIdHash).toMatch(/^v2_/);
    }
  }
});
```

`__getRecordedEvents` / `__resetRecordedEvents` may need to be added as test hooks in `analytics.ts` if not already present. Use the existing Sentry breadcrumb capture pattern.

- [ ] **Step 2: Add `learn_this_too_completed` emission**

In the Study entry route receiving `studySource: 'child-recap'`, fire the completed event after the user actually starts the lightweight entry or confirms the seeded subject. Track only on the success path, not on tap (that's `learn_this_too_tapped`).

- [ ] **Step 3: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/analytics.ts src/hooks/use-mode-switch.ts src/hooks/use-learn-this-too.ts --no-coverage
```

- [ ] **Step 4: Commit**

`/commit` description: `feat(mobile): wire analytics for mode_intent_chosen / mode_switched / learn_this_too_* with safe props`

---

## Task 18: Leak hardening — query keys + invalidation on mode/profile switch

Spec §Leak Invariants. Update query keys to include effective profile/context/child filter. Invalidate context-specific queries on mode switch.

**Files:**
- Modify: `use-parent-recaps.ts` (already added in Task 10)
- Modify: progress queries (Task 11)
- Modify: dashboard queries
- Modify: subjects/books queries (if child-scoped)
- Modify: sessions, reports
- Modify: `useModeSwitch` onSuccess (Task 7) to invalidate the right keys

- [ ] **Step 1: Inventory existing query keys**

```bash
```

Use Grep with pattern `queryKey:\s*\[` in `apps/mobile/src/hooks/` and `apps/mobile/src/app/`. List every key. For each, decide:

- **Already context-safe?** (e.g., `['recaps', parentId, childFilter]`) — done.
- **Profile-scoped?** (e.g., `['progress', profileId]`) — ensure profile id is correct.
- **Context-leaky?** (e.g., `['dashboard']` with no profile id) — must add profile id and, where the data is mode-specific, context.

Produce an inline list in the PR description.

- [ ] **Step 2: Confirm `useModeSwitch.onSuccess` invalidates scoped (not bare) keys**

Task 7's hook already invalidates scoped keys — `['progress', pid]`, `['dashboard', pid]`, `['recaps', pid]`, `['subjects', pid]`, `['reports', pid]` — per adversarial review §MEDIUM-6. Bare `['progress']`-style invalidations would blow caches across every profile in the session (refetch storm on slow networks).

If any additional context-sensitive caches surface during the Task 18 inventory (Step 1), add them as scoped invalidations to the existing list. Do not regress to bare prefixes.

- [ ] **Step 3: Add a leak-invariant test**

`apps/mobile/src/hooks/use-mode-switch.test.ts` (extend):

```ts
it('invalidates context-scoped queries on successful mode switch', async () => {
  // seed cache with stale entries for 'progress', 'recaps', 'dashboard'
  // act: mutate('family')
  // assert: those queries are invalidated
});
```

Plus a Recaps break test in `apps/api/src/routes/recaps.integration.test.ts` (already in Task 9) for cross-family child IDs.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-mode-switch.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

`/commit` description: `feat(mobile): leak hardening — context-scoped query keys + mode-switch invalidation`

---

## Task 19: Playwright web journeys

Spec §Testing Strategy → Web/Playwright. Web parity for the new flows. Tests live under `apps/web/tests/e2e/` or wherever existing Playwright suites are; locate via Grep for `test.describe`.

**Files:**
- Create: `apps/web/tests/e2e/study-family-mode.spec.ts` (or extend existing)

- [ ] **Step 1: Locate existing Playwright structure**

```bash
```

Use Glob `apps/web/**/*.spec.ts` and `tests/**/*.spec.ts`. Identify the pattern for: doppler env (CLAUDE.md: `doppler run -c stg`), Clerk testing token, seed endpoint.

- [ ] **Step 2: Write the journeys**

```ts
import { test, expect } from '@playwright/test';

test.describe('Study/Family mode navigation', () => {
  test('Study-only adult: lands in Study tabs, no Recaps tab', async ({ page }) => {
    await seedAdultWithoutChildren(page);
    await page.goto('/(app)/home');
    await expect(page.getByTestId('tab-recaps')).toBeHidden();
    await expect(page.getByText('My Learning')).toBeVisible();
  });

  test('Adult with Family intent but no child: sees Family setup, not tabs', async ({ page }) => {
    await seedAdultWithFamilyIntentNoChild(page);
    await page.goto('/(app)/home');
    await expect(page.getByTestId('family-setup-empty')).toBeVisible();
  });

  test('Family-capable adult: lands in default mode, can switch', async ({ page }) => {
    await seedFamilyCapableAdult(page, { defaultAppContext: 'family' });
    await page.goto('/(app)/home');
    await expect(page.getByText('Children')).toBeVisible();
    await page.goto('/(app)/more');
    await page.getByTestId('mode-switch').click();
    await expect(page.getByText('My Learning')).toBeVisible();
  });

  test('Family Recaps opens and filters by child', async ({ page }) => {
    await seedFamilyCapableAdultWithRecaps(page);
    await page.goto('/(app)/recaps');
    await expect(page.getByTestId('recap-card-' + recapId)).toBeVisible();
    await page.getByTestId(`recaps-chip-${childA.id}`).click();
    await expect(page.getByTestId(`recap-card-${otherChildRecapId}`)).toBeHidden();
  });

  test('Children tab → child curriculum (no proxy)', async ({ page }) => {
    await page.goto('/(app)/home');
    await page.getByTestId(`child-card-${childA.id}-curriculum`).click();
    await expect(page).toHaveURL(/\/child\//);
    await expect(page.getByTestId('proxy-banner')).toBeHidden();
  });

  test('Normal profile picker no longer enters proxy', async ({ page }) => {
    await page.goto('/profiles');
    await page.getByTestId(`profile-row-${childA.id}`).click();
    await expect(page.getByText(/view account/i)).not.toBeVisible();
    await expect(page.getByTestId('proxy-banner')).not.toBeVisible();
  });

  test('Add to my learning switches into Study as the adult', async ({ page }) => {
    await page.goto('/(app)/recaps');
    await page.getByTestId(`recap-learn-this-too-${recapId}`).click();
    await expect(page.getByText('My Learning')).toBeVisible();
    await expect(page.url()).toContain('studySource=child-recap');
  });

  test('Recaps detail Back returns to Recaps (deep link)', async ({ page }) => {
    await page.goto(`/(app)/child/${childA.id}/session/${sessionId}?returnTo=family-recaps`);
    await page.goBack();
    await expect(page).toHaveURL(/\/recaps$/);
  });

  test('Add to my learning followed by Back does not jump to stale Family route', async ({ page }) => {
    await page.goto('/(app)/recaps');
    await page.getByTestId(`recap-learn-this-too-${recapId}`).click();
    await page.goBack();
    await expect(page).not.toHaveURL(/\/recaps/);
  });

  test('Repeated Study/Family switches keep Back inside active context', async ({ page }) => {
    await page.goto('/(app)/more');
    await page.getByTestId('mode-switch').click(); // family → study
    await page.getByTestId('mode-switch').click(); // study → family
    await page.goBack();
    // expect either family-home or 404, never a stale proxy/child detail
    await expect(page.getByTestId('proxy-banner')).not.toBeVisible();
  });
});
```

- [ ] **Step 3: Run Playwright smoke**

```bash
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke
```

If smoke passes, run full suite:

```bash
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

- [ ] **Step 4: Commit**

`/commit` description: `test(web): Playwright journeys for Study/Family mode, Recaps, Add to my learning, navigation`

---

## Task 20: Final verification + branch-wide validation

Per CLAUDE.md "Required Validation": run integration tests (skipped by pre-commit/pre-push hooks) and the change-class checker.

- [ ] **Step 1: Run cross-package integration tests**

```bash
cd apps/api && pnpm exec jest --testMatch '**/*.integration.test.ts' --no-coverage
cd apps/mobile && pnpm exec jest --testMatch '**/*.integration.test.ts' --no-coverage
pnpm exec jest tests/integration --no-coverage
```

- [ ] **Step 2: Run change-class checker on the full branch**

```bash
bash scripts/check-change-class.sh --branch
bash scripts/check-change-class.sh --run --branch
```

Address any class advisory it emits.

- [ ] **Step 3: Full validation matrix**

```bash
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t test
```

- [ ] **Step 4: Re-verify the deploy-order invariant**

The migration commit must be applied to dev (Task 2 Step 5) AND to staging via the deploy pipeline BEFORE the API/mobile changes are pushed to production. Per CLAUDE.md "Schema and Deploy Safety": "A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns."

If shipping today, confirm:
- Migration `00NN_profiles_default_app_context.sql` exists in `apps/api/drizzle/` ✓
- Rollback markdown exists ✓
- API code that reads `defaultAppContext` will not deploy until migration applies ✓
- Mobile code tolerates `defaultAppContext: null` (Task 4 helper returns false) ✓

- [ ] **Step 5: AC sweep — answer each AC from the spec**

For each acceptance criterion in `docs/specs/2026-05-19-study-and-family-mode-navigation.md` §Acceptance Criteria, point to the file and test that proves it:

| AC # | Proven by |
|------|-----------|
| 1 | `_layout.test.tsx` — `computeVisibleTabs('study')` |
| 2 | `_layout.test.tsx` — `computeVisibleTabs('family')` + capability gate |
| 3 | `profile.test.ts` — under-18 owner with non-owner profile → `isFamilyCapableProfile` false |
| 4 | `profile.test.ts` (server) — mode patch updates only `:id` |
| 5 | `use-mode-switch.test.ts` — onError rollback + retryable toast |
| 6 | `use-mode-switch.test.ts` — stale-response guard |
| 6a | `use-mode-switch.test.ts` — single-flight double-tap |
| 6b | `use-mode-switch.test.ts` — optimistic atomic tab render |
| 7 | `use-mode-switch.test.ts` — profile switch does not overwrite |
| 8 | `_layout.test.tsx` — `computeVisibleTabs('family')` exact set |
| 9 | `_layout.test.tsx` — `computeVisibleTabs('study')` exact set |
| 10 | `progress/index.test.tsx` — Family picker excludes self |
| 11 | `progress/index.test.tsx` — Study picker excludes children |
| 12 | `ParentHomeScreen.test.tsx` — child-card curriculum path |
| 13 | `recaps.test.tsx` — feed + chips |
| 14 | `recaps.integration.test.ts` — service source grep |
| 15 | `recaps.test.tsx` — empty states |
| 16 | `recaps.integration.test.ts` — schema parse + UI copy test |
| 17 | `use-learn-this-too.test.ts` — `StudySourceContext` passed |
| 18 | `use-learn-this-too.test.ts` — quota pre-check |
| 19 | Study entry route test — lightweight entry, no silent subject create |
| 20 | `recaps.integration.test.ts` — parent-managed child |
| 21 | `recaps.integration.test.ts` — linked child + consent |
| 22 | `profiles.test.tsx` — no proxy from picker |
| 23 | retained synthetic proxy test |
| 24 | nested layout assertion (if Recaps gets nested children, add `unstable_settings`) |
| 25 | Study deep-link to `/(app)/recaps` → guard or fallback |
| 26 | `own-learning.test.tsx` — eligible adult redirect |
| 27 | `recaps.integration.test.ts` — cross-family child id rejected |
| 28 | sessions break test — adult-only write scope |
| 29 | `use-notification-response-handler.test.ts` — Study session prompt |
| 30 | `use-mode-switch.test.ts` — `router.replace` after success |
| 31 | `use-mode-switch.test.ts` — no replace on failure |
| 32 | navigation/recap detail test — Back goes to Recaps |
| 33 | `use-learn-this-too.test.ts` — Back behavior |
| 34 | onboarding intent test — re-prompt predicate |
| 35 | `analytics.test.ts` — events fire with safe props |

Add the missing AC #25 test if not already covered:

```tsx
it('Study mode user opening /(app)/recaps deep link is redirected to study-home', () => {
  // arrange: active profile in study mode, family-capable
  render(<RecapsScreen />);
  expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/home');
});
```

Add AC #24 unstable_settings guard if a nested `recaps/` layout was introduced.

- [ ] **Step 6: Final commit + push**

```bash
git status
```

Confirm clean working tree. If anything is staged from a sweep, run `/commit`. Per CLAUDE.md → "Commit early + push after every commit": push has been happening through `/commit` already.

**No PR creation** — per `feedback_no_pr_unless_asked`. The user opens the PR when ready.

---

## Notes for the executing engineer

- **Subagents do not commit.** If you dispatch subagents to write code in parallel, they report which files they changed; the coordinator runs `/commit`.
- **Internal mocks forbidden (GC1/GC6).** Any new internal `jest.mock('./...')` requires `// gc1-allow: <reason>` on the same line. Prefer `jest.requireActual()` overrides — see `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` for the canonical pattern.
- **External-boundary mocks OK.** `expo-router`, Stripe, Clerk JWKS, RevenueCat, push, email, `routeAndCall` — all bare-specifier mocks are fine.
- **Pre-commit hook does NOT run integration tests.** Run them manually before shipping any task that touches DB behavior, auth/profile scoping, or cross-package contracts.
- **ESLint G1/G4/G5.** Route files: no `drizzle-orm` imports, no `c.get('db').op()`, no `process.env`, no default exports. Service files do DB work. Recaps service uses the sanctioned parent-chain direct-select pattern.
- **Drift trap.** If `db:push:dev` is ever needed, follow `project_dev_schema_drift_trap` — but for this plan, always `db:generate:dev` then `db:migrate:dev`.
- **Persona-fossil-guard.** Do not reintroduce `personaFromBirthYear`, `isLearner`, or local `Persona` types — enforced by `persona-fossil-guard.test.ts`. Use `computeAgeBracket` from `@eduagent/schemas` only.

---

## Self-review against the spec

- Spec §Family capability predicate → Task 4 helper + Task 2 server `hasFamilyLinks`.
- Spec §Profile App Context Field → Task 2 (migration, Drizzle, schema) + Task 3 (mutation).
- Spec §Mode Mutation Contract (idempotent, scope-matched, optimistic+rollback, stale-response) → Tasks 3 + 7.
- Spec §Technical Decisions (no `X-App-Context`, startup no-flicker, proxy override, switchProfile rules) → Tasks 5, 7, 12.
- Spec §Risk Hardening + §Leak Invariants → Task 18.
- Spec §Navigation Contract → Task 16 (helpers) + Tasks 7, 12, 13, 14 (call sites) + Task 19 (Playwright).
- Spec §First-Run Intent → Task 6.
- Spec §Recaps Surface → Tasks 9 + 10.
- Spec §Learn This Too Contract → Task 13.
- Spec §Proxy Handling Phase 1 → Task 12.
- Spec §Route Survival → Task 14.
- Spec §Notification → Task 15.
- Spec §Analytics → Tasks 6, 7, 13, 17.
- Spec §Tests in Testing Strategy → Tasks 1-19 each include matching tests; Task 20 sweeps ACs.
- Spec §Failure Modes table — every row is exercised by at least one test added in the relevant task (search "Step N — Write failing test" sections).
