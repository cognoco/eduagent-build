# Profile-as-Lens — Phase 2 (PR 5 slice) Implementation Plan: Family-Pool Breakdown Sharing Toggle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) — Scope decision (rev 5) → "Phase 2 PR 5-slice"
**Phase:** 2 — single toggle, not the full Privacy & Lenses panel

**Goal:** Add an owner-only `family_pool_breakdown_shared` toggle in **More → Family** that, when enabled, lets non-owner family members see the full per-profile usage breakdown on `/subscription`. Children remain hidden from the breakdown unless this toggle is on.

**Architecture:** New profile-scoped setting (or family-scoped) following the established `useCelebrationLevel` pattern: Drizzle column on a settings table → `settings.ts` service → GET/PUT in `routes/settings.ts` → `useFamilyPoolBreakdownSharing` mobile hook → toggle row in More → Family section. Server-side gate in `services/billing/family.ts:304-306` extends to OR the new flag, so non-owners receive the full breakdown when the owner has enabled sharing.

**Tech Stack:** Drizzle (postgres), Hono, React Query, react-i18next, NativeWind, existing settings infrastructure.

---

## Scope statement — what this plan does NOT cover

- **No Privacy & Lenses panel.** The other four rows (Self lens visibility, per-child preferences, withdraw-consent default, notifications group) all depend on PRs that aren't being built or aren't yet built. Skip the panel; ship the one toggle that's standalone.
- **No new breakdown UI.** The breakdown rows already render in `subscription.tsx:1363-1398`. We change who *sees* them, not how they look.
- **No child-side display.** Per spec line 275, children never see the breakdown unless owner explicitly enables. Sharing-on means non-owner *adults* (co-parent/spouse) see it; children stay restricted by separate gate added in PR 10.

## Pre-conditions

- Branch: feature branch off main (suggested `pr-5-breakdown-sharing`).
- Verify Phase 1 PR 2 has shipped: `apps/mobile/src/app/(app)/subscription.tsx:1363-1398` renders `usage.byProfile.map(...)` and `apps/api/src/services/billing/family.ts:303-306` has the `isOwnerBreakdownViewer` gate. Both verified 2026-05-06.
- Confirm settings infrastructure: `apps/api/src/services/settings.ts`, `apps/api/src/routes/settings.ts`, `apps/mobile/src/hooks/use-settings.ts` all exist and follow the celebration-level pattern.

## Storage choice — profile vs. family

The setting belongs to the **owner profile**, not the family link. Reasoning:

- Only owners can toggle it (writes verified via `verifyProfileOwnership()`).
- Read at the boundary of "who is requesting the breakdown" — i.e., when a non-owner queries usage, the API looks up the *owner's* setting on the owner's profile.
- No `familySettings` table exists today, and creating one for a single boolean is over-engineering.

Implementation: add a column to an existing owner-relevant settings table or create a small dedicated `familyPreferences` table keyed on `ownerProfileId`. The plan below uses a dedicated table because the celebration-level/notifications tables are per-profile general-purpose, not family-scoped — mixing concerns invites future drift.

---

## File structure

**Database migration (new):**
- Create: `apps/api/drizzle/00XX_family_preferences.sql` (number is current_max+1)
- Create: `apps/api/drizzle/00XX_family_preferences.rollback.md`
- Modify: `packages/database/src/schema/profiles.ts` — add `familyPreferences` table
- Modify: `packages/database/src/schema/index.ts` — re-export the new table

**API service + route (modify):**
- Modify: `apps/api/src/services/settings.ts` — add `getFamilyPoolBreakdownSharing(db, ownerProfileId)` + `upsertFamilyPoolBreakdownSharing(db, ownerProfileId, value)`
- Modify: `apps/api/src/services/settings.test.ts`
- Modify: `apps/api/src/routes/settings.ts` — add GET + PUT routes
- Modify: `apps/api/src/routes/settings.test.ts` (or add a new integration test)
- Modify: `apps/api/src/services/billing/family.ts:303-306` — extend `isOwnerBreakdownViewer` to OR the sharing flag
- Modify: `apps/api/src/services/billing/family.test.ts` (or wherever `getUsageBreakdownForProfile` is tested)

**Mobile hook + UI (modify/create):**
- Modify: `apps/mobile/src/hooks/use-settings.ts` — add `useFamilyPoolBreakdownSharing()` + `useUpdateFamilyPoolBreakdownSharing()`
- Modify: `apps/mobile/src/app/(app)/more.tsx:582-597` — add toggle row in the existing Family section
- Modify: `apps/mobile/src/app/(app)/more.test.tsx` (extend existing test file)
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ copy English values into 6 other locales)

---

## Task 1: Add `familyPreferences` table + migration

**Files:**
- Modify: `packages/database/src/schema/profiles.ts`
- Modify: `packages/database/src/schema/index.ts`
- Generate: `apps/api/drizzle/00XX_family_preferences.sql`
- Create: `apps/api/drizzle/00XX_family_preferences.rollback.md`

- [ ] **Step 1: Add the table to the schema**

```ts
// packages/database/src/schema/profiles.ts (append near other family-related tables, ~line 99-126 area)
export const familyPreferences = pgTable('family_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerProfileId: uuid('owner_profile_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  poolBreakdownShared: boolean('pool_breakdown_shared').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FamilyPreferences = InferSelectModel<typeof familyPreferences>;
export type NewFamilyPreferences = InferInsertModel<typeof familyPreferences>;
```

- [ ] **Step 2: Re-export from `index.ts`**

```ts
export { familyPreferences } from './profiles';
export type { FamilyPreferences, NewFamilyPreferences } from './profiles';
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm run db:generate
```

This produces `apps/api/drizzle/00XX_family_preferences.sql`. Inspect it: it should contain `CREATE TABLE "family_preferences" (...)`. If drizzle generates extra unrelated diffs because the local DB drifted from the schema, run `pnpm run db:push:dev` first to align, then regenerate.

- [ ] **Step 4: Add rollback notes (drop is safe — no data loss because feature is new)**

```markdown
# 00XX_family_preferences rollback

This migration creates a new table `family_preferences`. Rollback is safe because the table is new and only stores a sharing toggle that defaults to `false`.

## Procedure

```sql
DROP TABLE IF EXISTS family_preferences;
```

Data lost: per-owner sharing-toggle values. After rollback, all non-owners revert to seeing only their own usage row, which is the pre-PR-5 behavior. No downstream impact.
```

- [ ] **Step 5: Apply locally + verify**

```bash
pnpm run db:migrate:dev
psql $DATABASE_URL -c '\d family_preferences'
```

Expected: table exists with 5 columns.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src apps/api/drizzle
git commit -m "feat(db): add family_preferences table for breakdown sharing toggle"
```

---

## Task 2: Service functions for the toggle

**Files:**
- Modify: `apps/api/src/services/settings.ts`
- Modify: `apps/api/src/services/settings.test.ts`

- [ ] **Step 1: Failing test**

```ts
// settings.test.ts (extend existing file)
describe('familyPoolBreakdownSharing', () => {
  it('returns false when no row exists', async () => {
    const value = await getFamilyPoolBreakdownSharing(db, ownerProfileId);
    expect(value).toBe(false);
  });

  it('returns the stored value after upsert', async () => {
    await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, true);
    expect(await getFamilyPoolBreakdownSharing(db, ownerProfileId)).toBe(true);
    await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, false);
    expect(await getFamilyPoolBreakdownSharing(db, ownerProfileId)).toBe(false);
  });

  it('upsert touches updatedAt on subsequent writes', async () => {
    await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, true);
    const first = await db.select().from(familyPreferences).where(eq(familyPreferences.ownerProfileId, ownerProfileId)).then((r) => r[0].updatedAt);
    await new Promise((r) => setTimeout(r, 10));
    await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, false);
    const second = await db.select().from(familyPreferences).where(eq(familyPreferences.ownerProfileId, ownerProfileId)).then((r) => r[0].updatedAt);
    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/services/settings.test.ts -t 'familyPoolBreakdownSharing' --no-coverage
```

- [ ] **Step 3: Implement**

```ts
// settings.ts (append, mirror existing celebration-level pattern at the same file)
import { familyPreferences } from '@eduagent/database';

export async function getFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
): Promise<boolean> {
  const row = await db
    .select({ value: familyPreferences.poolBreakdownShared })
    .from(familyPreferences)
    .where(eq(familyPreferences.ownerProfileId, ownerProfileId))
    .then((r) => r[0]);
  return row?.value ?? false;
}

export async function upsertFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
  value: boolean,
): Promise<void> {
  await db
    .insert(familyPreferences)
    .values({ ownerProfileId, poolBreakdownShared: value })
    .onConflictDoUpdate({
      target: familyPreferences.ownerProfileId,
      set: { poolBreakdownShared: value, updatedAt: new Date() },
    });
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/services/settings.test.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/settings.ts apps/api/src/services/settings.test.ts
git commit -m "feat(api): add family pool breakdown sharing service"
```

---

## Task 3: GET + PUT routes (owner-only)

**Files:**
- Modify: `apps/api/src/routes/settings.ts`
- Modify: existing settings integration test (mirror `/settings/celebration-level` test)

- [ ] **Step 1: Failing integration test**

```ts
it('GET /v1/settings/family-pool-breakdown-sharing returns false by default', async () => {
  const { profileId } = await seedOwnerProfile(db);
  const res = await app.request('/v1/settings/family-pool-breakdown-sharing', {
    headers: authHeaders(profileId),
  });
  expect(res.status).toBe(200);
  expect((await res.json()).value).toBe(false);
});

it('PUT /v1/settings/family-pool-breakdown-sharing accepts boolean and persists', async () => {
  const { profileId } = await seedOwnerProfile(db);
  const res = await app.request('/v1/settings/family-pool-breakdown-sharing', {
    method: 'PUT',
    headers: authHeaders(profileId),
    body: JSON.stringify({ value: true }),
  });
  expect(res.status).toBe(200);
  const after = await app.request('/v1/settings/family-pool-breakdown-sharing', {
    headers: authHeaders(profileId),
  });
  expect((await after.json()).value).toBe(true);
});

it('PUT rejects when caller is not an owner', async () => {
  const { profileId } = await seedNonOwnerProfile(db);
  const res = await app.request('/v1/settings/family-pool-breakdown-sharing', {
    method: 'PUT',
    headers: authHeaders(profileId),
    body: JSON.stringify({ value: true }),
  });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/api && pnpm exec jest --testPathPattern settings --no-coverage
```

- [ ] **Step 3: Add the routes**

```ts
// routes/settings.ts (mirror the celebration-level routes, ~line 116-141 area)
const familyPoolSharingInput = z.object({ value: z.boolean() });

app.get('/family-pool-breakdown-sharing', async (c) => {
  const profileId = c.get('activeProfileId');
  const value = await getFamilyPoolBreakdownSharing(c.var.db, profileId);
  return c.json({ value });
});

app.put(
  '/family-pool-breakdown-sharing',
  zValidator('json', familyPoolSharingInput),
  async (c) => {
    const profileId = c.get('activeProfileId');
    const profile = await c.var.db
      .select({ isOwner: profiles.isOwner })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .then((r) => r[0]);
    if (!profile?.isOwner) return c.json({ error: 'forbidden' }, 403);
    const { value } = c.req.valid('json');
    await upsertFamilyPoolBreakdownSharing(c.var.db, profileId, value);
    return c.json({ ok: true });
  },
);
```

(Reuse `verifyProfileOwnership()` if that's the pattern in the rest of `settings.ts`; sketch above shows the inline form for clarity.)

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/api && pnpm exec jest --testPathPattern settings --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/settings.ts apps/api/src/routes/settings.test.ts
git commit -m "feat(api): expose owner-only family-pool-breakdown-sharing routes"
```

---

## Task 4: Extend `getUsageBreakdownForProfile` to honor the sharing flag

**Files:**
- Modify: `apps/api/src/services/billing/family.ts:303-306`
- Modify: existing test file for that service (likely `apps/api/src/services/billing/family.test.ts`)

- [ ] **Step 1: Failing test**

```ts
it('non-owner sees full breakdown when owner has enabled sharing', async () => {
  const { ownerProfileId, childProfileId, coParentProfileId } = await seedFamilyWithCoParent(db);
  await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, true);

  const result = await getUsageBreakdownForProfile(db, {
    activeProfileId: coParentProfileId,
  });

  expect(result.byProfile.length).toBeGreaterThan(1);
  expect(result.byProfile.some((r) => r.profileId === childProfileId)).toBe(true);
});

it('non-owner sees only own row when sharing is disabled', async () => {
  const { ownerProfileId, coParentProfileId } = await seedFamilyWithCoParent(db);
  await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, false);

  const result = await getUsageBreakdownForProfile(db, {
    activeProfileId: coParentProfileId,
  });

  expect(result.byProfile).toHaveLength(1);
  expect(result.byProfile[0].profileId).toBe(coParentProfileId);
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/api && pnpm exec jest --testPathPattern billing --no-coverage
```

- [ ] **Step 3: Modify the service**

In `services/billing/family.ts:303-306`, change:

```ts
const isOwnerBreakdownViewer = viewer.isOwner && viewer.hasChildLink;
```

to:

```ts
const sharingEnabled = await getFamilyPoolBreakdownSharing(db, viewer.familyOwnerProfileId);
const isOwnerBreakdownViewer =
  (viewer.isOwner && viewer.hasChildLink) || (sharingEnabled && viewer.hasChildLink);
```

(`viewer.familyOwnerProfileId` may need to be added to the viewer object — derive it by following `family_links` from the active profile's parent. If the existing query already loads the family's owner ID, reuse that; otherwise extend the SELECT.)

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/api && pnpm exec jest --testPathPattern billing --no-coverage
```

- [ ] **Step 5: Run full API test suite to catch regressions**

```bash
cd apps/api && pnpm exec jest --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/billing
git commit -m "feat(api): respect breakdown sharing flag for non-owner viewers"
```

---

## Task 5: Mobile hook

**Files:**
- Modify: `apps/mobile/src/hooks/use-settings.ts`
- Modify: `apps/mobile/src/hooks/use-settings.test.ts`

- [ ] **Step 1: Failing test**

```ts
// use-settings.test.ts — add tests mirroring useCelebrationLevel
it('useFamilyPoolBreakdownSharing returns server value', async () => {
  // mock api.settings['family-pool-breakdown-sharing'].$get to return {value: true}
  const { result } = renderHook(() => useFamilyPoolBreakdownSharing(), { wrapper });
  await waitFor(() => expect(result.current.data).toBe(true));
});

it('useUpdateFamilyPoolBreakdownSharing PUTs and invalidates query', async () => {
  // mock $put, assert call + invalidation
});
```

- [ ] **Step 2: Implement (mirror `useCelebrationLevel` at `use-settings.ts:84-156`)**

```ts
const FAMILY_POOL_KEY = ['settings', 'family-pool-breakdown-sharing'];

export function useFamilyPoolBreakdownSharing() {
  const { activeProfile } = useProfile();
  return useQuery({
    queryKey: [...FAMILY_POOL_KEY, activeProfile?.id],
    enabled: !!activeProfile?.id,
    queryFn: async () => {
      const res = await api.settings['family-pool-breakdown-sharing'].$get();
      if (!res.ok) throw new Error('failed');
      const body = await res.json();
      return body.value as boolean;
    },
  });
}

export function useUpdateFamilyPoolBreakdownSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: boolean) => {
      const res = await api.settings['family-pool-breakdown-sharing'].$put({ json: { value } });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FAMILY_POOL_KEY });
      qc.invalidateQueries({ queryKey: ['subscription', 'usage'] }); // also bust cached breakdown
    },
  });
}
```

- [ ] **Step 3: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-settings.ts --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/use-settings.ts apps/mobile/src/hooks/use-settings.test.ts
git commit -m "feat(mobile): add useFamilyPoolBreakdownSharing hook"
```

---

## Task 6: Toggle row in More → Family section

**Files:**
- Modify: `apps/mobile/src/app/(app)/more.tsx:582-597` (Family section)
- Modify: `apps/mobile/src/app/(app)/more.test.tsx`
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 other locales)

**i18n keys to add (under `more.family`):**

```json
{
  "more": {
    "family": {
      "breakdownSharingTitle": "Share usage breakdown with family",
      "breakdownSharingDescription": "Let everyone in your family see how each profile uses the family pool. Children only see the breakdown when this is on.",
      "breakdownSharingError": "Couldn't update setting. Try again."
    }
  }
}
```

- [ ] **Step 1: Failing test**

```tsx
// more.test.tsx — add to existing test file
it('owner sees the breakdown sharing toggle in Family section', () => {
  mockUseProfile({ activeProfile: { id: 'owner-1', isOwner: true } });
  mockUseFamilyPoolBreakdownSharing(false);
  render(<More />);
  expect(screen.getByTestId('more-breakdown-sharing-toggle')).toBeTruthy();
});

it('non-owner does NOT see the toggle', () => {
  mockUseProfile({ activeProfile: { id: 'child-1', isOwner: false } });
  render(<More />);
  expect(screen.queryByTestId('more-breakdown-sharing-toggle')).toBeNull();
});

it('toggle press calls update mutation', () => {
  const mutate = jest.fn();
  mockUseProfile({ activeProfile: { id: 'owner-1', isOwner: true } });
  mockUseFamilyPoolBreakdownSharing(false);
  mockUseUpdateFamilyPoolBreakdownSharing({ mutate });
  render(<More />);
  fireEvent(screen.getByTestId('more-breakdown-sharing-toggle'), 'valueChange', true);
  expect(mutate).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/more.tsx' --no-coverage
```

- [ ] **Step 3: Add the toggle row**

In `more.tsx:582-597` (the existing `{activeProfile?.isOwner && (...)}` Family section), add a row using whatever `ToggleRow` / `SettingsRow` pattern already exists in the file:

```tsx
import { useFamilyPoolBreakdownSharing, useUpdateFamilyPoolBreakdownSharing } from '@/hooks/use-settings';

// inside the owner-gated Family section:
const breakdownSharing = useFamilyPoolBreakdownSharing();
const updateBreakdownSharing = useUpdateFamilyPoolBreakdownSharing();

<ToggleRow
  testID="more-breakdown-sharing-toggle"
  title={t('more.family.breakdownSharingTitle')}
  description={t('more.family.breakdownSharingDescription')}
  value={breakdownSharing.data ?? false}
  onValueChange={(v) =>
    updateBreakdownSharing.mutate(v, {
      onError: () => platformAlert(t('more.family.breakdownSharingError')),
    })
  }
  disabled={updateBreakdownSharing.isPending}
/>
```

(Match the actual prop names used by the existing `ToggleRow` in this file; the sketch shows the shape.)

- [ ] **Step 4: Add i18n keys**

Append the keys above to `en.json` under `more.family`. Copy the same English values into `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json` — real translations are deferred to the LLM i18n pipeline.

- [ ] **Step 5: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/more.tsx' --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add 'apps/mobile/src/app/(app)/more.tsx' 'apps/mobile/src/app/(app)/more.test.tsx' apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add breakdown sharing toggle in More → Family"
```

---

## Task 7: Manual smoke + integration verification

- [ ] **Step 1: Run cross-package validation**

```bash
pnpm exec nx run-many -t typecheck && pnpm exec nx run-many -t lint
pnpm exec nx run-many -t test
```

- [ ] **Step 2: Run integration tests (skipped by pre-commit hook)**

```bash
cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage
```

- [ ] **Step 3: Manual smoke**

Read `e2e-emulator-issues.md` first.

```bash
cd apps/mobile && pnpm exec expo start --android
```

1. Sign in as the **owner**, navigate to More → Family. Confirm: toggle visible, default off.
2. Open `/subscription`. Note the breakdown shows full per-profile rows.
3. Switch to a **non-owner co-parent profile** in the same family. Confirm: `/subscription` shows only their own row.
4. Switch back to owner, flip the toggle on. Switch back to co-parent. Confirm: `/subscription` now shows the full breakdown.
5. Sign in as a **child profile**. Confirm: cannot reach `/subscription` from More (already gated by `isImpersonating` check, per ground-truth verification 2026-05-06). The toggle has no observable effect on child UI in this slice — child-side restriction is owned by PR 10.

- [ ] **Step 4: Push**

```bash
git push -u origin pr-5-breakdown-sharing
```

---

## Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Toggle write fails (network) | API down | Toast: "Couldn't update setting. Try again." Toggle reverts to previous value. | Tap again |
| Setting query fails | API down | Toggle disabled with skeleton; Family section still shows child count | Pull to refresh from Home |
| Non-owner attempts toggle by API call | Manipulated client | 403 returned | UI never offered the toggle — defensive only |
| Cached breakdown stale after toggle flip | Mutation onSuccess invalidation | Brief flicker, then correct rows | Auto-resolved by query invalidation |

## Spec coverage

- Spec line 231: "Phase 2 adds the `family_pool_breakdown_shared` toggle (owner-only setting in Privacy & Lenses). When enabled, non-owners see the full per-profile breakdown. Default off." → Tasks 1–6.
- Spec line 233: "Children never see the breakdown unless owner explicitly enables sharing." → Server gate stays the source of truth (Task 4); child-UI gating is PR 10 territory.

## Self-review checklist

- [ ] No `eslint-disable`.
- [ ] No internal mocks in integration tests (uses real DB per `feedback_testing_no_mocks.md`).
- [ ] Migration has rollback notes.
- [ ] Owner-only enforced server-side (route + service), not just hidden in UI.
- [ ] Mobile mutation invalidates both the setting query AND the subscription/usage query.
- [ ] Toggle absent for non-owners and impersonated-child sessions.
