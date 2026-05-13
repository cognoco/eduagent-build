# Profile-as-Lens — Phase 3 (PR 11) Implementation Plan: Withdrawal Consent Rev

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) — Phase 3 PR 11 (lines 285-300)
**Phase:** 3

**Goal:** Replace the current withdraw-consent confirmation copy with the spec's privacy-law-aligned copy, add a forward-looking `archive_when_i_withdraw_consent` setting (Auto · Always archive · Never archive) in More, branch grace-expiry behavior on (a) the setting and (b) the child's age (under-13 → no archive, regardless of setting), and surface a one-time toast after grace expiry.

**Architecture:** Three independent layers, each independently testable.

1. **Modal copy:** Replace `parentView.index.withdrawConsentBody` text. No structural change to the modal at `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:792-868`.
2. **Forward-looking setting:** New row in More following the `useCelebrationLevel` settings pattern: schema column on a new `withdrawalArchivePreferences` table, `settings.ts` service + route, mobile hook, segmented control row in More.
3. **Grace-expiry branching:** Modify the existing `consent-revocation.ts` Inngest function (whose deletion step lives at line 110-113) to read `(setting, childAge)` and decide: delete-now vs. archive-30d. The "archive" branch is net-new; today the function deletes uniformly. Add a `consent.archived` push notification type and a one-time client-side toast surfaced via dashboard payload extension OR via the existing notification stream.

**Tech Stack:** Drizzle (postgres), Hono, React Query, react-i18next, Inngest, NativeWind, Expo push.

---

## Scope statement — what this plan does NOT cover

- **No archive UX surface ("Closed accounts" tab).** Spec line 222 names the Archived soft state but PR 9 owns the rendering. This plan ships the *server-side archive* (data retained read-only for 30 days) without UI to view it. Within 30 days, "archive" means: the child's profile + sessions remain in DB with a flag, but normal queries filter them out.
- **No region-specific grace duration.** Spec Q4 resolved as fixed 30-day archive for 13+, immediate deletion for under-13. We ship those exact numbers.
- **No toast for the parent at grace expiry if they aren't currently in the app.** Push is the asynchronous channel; the in-app toast surfaces only on the next app open after expiry, sourced from a server-side flag.

## Pre-conditions

- Branch: `pr-11-withdrawal-consent-rev` off main.
- PR 6b (`docs/plans/2026-05-06-profile-as-lens-phase-2-pr-6b-withdrawal-countdown.md`) ideally landed, since this plan extends `consent-revocation.ts` further. If 6b hasn't landed, this plan still works — coordinate with whoever owns 6b on the merge order to avoid conflicts in that file.
- Verified ground truth (2026-05-06):
  - Withdraw modal lives at `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:792-868`, callback at line 167.
  - i18n keys at `en.json:1503-1509`, no existing archive toggle.
  - `birthYear` column at `schema/profiles.ts:58` (no `birthDate`).
  - `calculateAge(birthYear)` at `services/consent.ts:129-132`, exports `MINIMUM_AGE = 11`.
  - Inngest function at `apps/api/src/inngest/functions/consent-revocation.ts:1-141`, deletion at line 110-113, no current archive logic.
  - Settings pattern: `useCelebrationLevel` at `apps/mobile/src/hooks/use-settings.ts:84-156`, service at `apps/api/src/services/settings.ts`, route at `apps/api/src/routes/settings.ts:116-141`.
  - Toast pattern: `setConfirmationToast` state + 5s auto-dismiss in `mentor-memory.tsx:63-72`.

## Storage decisions

**Setting key:** `withdrawal_archive_preference` with values `'auto' | 'always' | 'never'`.

**Where stored:** New `withdrawalArchivePreferences` table keyed by `ownerProfileId` (one row per family, owner-set). Co-parents inherit the owner's preference. Children never see this setting.

**Archive flag:** New `archivedAt` timestamp column on `profiles`. When set, the profile is treated as deleted by normal queries (filter `archivedAt IS NULL`) but data remains for 30 days, after which a separate Inngest cleanup job hard-deletes.

**Archive cleanup:** Add a second Inngest function `archive-cleanup.ts` that runs on a `app/profile.archived` event with `step.sleep('archive-window', '30d')` then hard-deletes via the existing `deleteProfile()` cascade.

---

## File structure

**Schema + migration:**
- Modify: `packages/database/src/schema/profiles.ts` — add `archivedAt` column to `profiles`, new `withdrawalArchivePreferences` table
- Modify: `packages/database/src/schema/index.ts`
- Generate: `apps/api/drizzle/00XX_withdrawal_archive.sql`
- Create: `apps/api/drizzle/00XX_withdrawal_archive.rollback.md`

**Repository / scoped reads:**
- Audit: every place that reads profiles needs the `archivedAt IS NULL` filter. Likely candidates: `apps/api/src/services/dashboard.ts` (children list), `apps/api/src/services/consent.ts` (consent state lookups). The plan adds a single helper `excludeArchived()` that callers thread through, rather than scattering the predicate.

**Setting service + route + hook:**
- Modify: `apps/api/src/services/settings.ts`
- Modify: `apps/api/src/services/settings.test.ts`
- Modify: `apps/api/src/routes/settings.ts`
- Modify: `apps/mobile/src/hooks/use-settings.ts`
- Modify: `apps/mobile/src/hooks/use-settings.test.ts`

**Modal copy:**
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 other locales)
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx` — verify new copy renders

**Inngest archive logic:**
- Modify: `apps/api/src/inngest/functions/consent-revocation.ts` — deletion step branches on (setting, age)
- Modify: `apps/api/src/inngest/functions/consent-revocation.test.ts`
- Create: `apps/api/src/inngest/functions/archive-cleanup.ts`
- Create: `apps/api/src/inngest/functions/archive-cleanup.test.ts`
- Modify: `apps/api/src/inngest/index.ts` (or wherever functions are registered)

**Toast surface:**
- Modify: dashboard service + payload schema → add `pendingNotices: Array<{ id: string; type: 'consent_archived' | 'consent_deleted'; childName: string }>` once the parent's child has been archived/deleted.
- Modify: `apps/mobile/src/app/(app)/home.tsx` — toast component reads `pendingNotices` and dismisses after seen
- Add: `POST /v1/notices/:id/seen` endpoint to ack the notice

**More tab UI:**
- Modify: `apps/mobile/src/app/(app)/more.tsx` — add segmented row for the setting

---

## Task 1: Modal copy update

The smallest, lowest-risk task. Do this first — closes the highest-priority piece (privacy-law-aligned wording) without waiting on the rest.

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.json:1505-1509` (and 6 other locales)
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx`

- [ ] **Step 1: Add the failing assertion to the existing modal test**

```tsx
// child/[profileId]/index.test.tsx — extend existing withdraw-modal test
it('shows the privacy-law-aligned withdrawal copy', () => {
  // ... existing setup that opens the modal ...
  expect(
    screen.getByText(
      /account and learning data will be deleted after a 7-day grace period/i,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/under-13 accounts, deletion is immediate/i),
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/child/[profileId]/index.tsx' --no-coverage
```

- [ ] **Step 3: Update the i18n key**

In `en.json:1505-1509`, change `parentView.index.withdrawConsentBody` from:

> "Withdrawing consent will stop all learning sessions for this child and delete their data."

to:

> "{childName}'s account and learning data will be deleted after a 7-day grace period. (For under-13 accounts, deletion is immediate at grace expiry to align with privacy law.)"

If the existing copy doesn't take a `{{childName}}` interpolation, add it. The modal already has the child's name in scope — verify by reading lines 792-868 of `child/[profileId]/index.tsx` and ensuring the rendered `t()` call passes `{ childName: ... }`.

Copy the same English value into `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json`. LLM i18n pipeline owns translations later.

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/child/[profileId]/index.tsx' --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/i18n/locales/ 'apps/mobile/src/app/(app)/child/:(literal)[profileId]/index.test.tsx' 'apps/mobile/src/app/(app)/child/:(literal)[profileId]/index.tsx'
git commit -m "feat(mobile): privacy-law-aligned withdrawal confirmation copy"
```

---

## Task 2: Schema + migration for archive support

**Files:**
- Modify: `packages/database/src/schema/profiles.ts`
- Modify: `packages/database/src/schema/index.ts`
- Generate: `apps/api/drizzle/00XX_withdrawal_archive.sql`
- Create: `apps/api/drizzle/00XX_withdrawal_archive.rollback.md`

- [ ] **Step 1: Extend profiles + add preferences table**

```ts
// packages/database/src/schema/profiles.ts
export const profiles = pgTable('profiles', {
  // ... existing columns ...
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const withdrawalArchivePreference = pgEnum('withdrawal_archive_preference', [
  'auto',
  'always',
  'never',
]);

export const withdrawalArchivePreferences = pgTable('withdrawal_archive_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerProfileId: uuid('owner_profile_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  preference: withdrawalArchivePreference('preference').notNull().default('auto'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate migration**

```bash
pnpm run db:generate
```

Inspect the generated SQL. It should `ALTER TABLE profiles ADD COLUMN archived_at`, create the enum, and create the preferences table.

- [ ] **Step 3: Rollback notes**

`apps/api/drizzle/00XX_withdrawal_archive.rollback.md`:

```markdown
# 00XX_withdrawal_archive rollback

## Rollback possibility

**PARTIAL.** The new table and enum can be dropped safely. The `archived_at` column on `profiles` is also safe to drop, but **rolling back will hard-delete archive intent for any profile currently in the 30-day archive window** — those rows become indistinguishable from never-archived ones.

## What is lost on rollback

- Per-owner archive preferences (no user impact; default behavior was identical to "auto" before this PR).
- The "archived" state for profiles currently within the 30-day window. After rollback, those profiles re-appear in normal queries as if they were never archived. Operators may want to manually `DELETE FROM profiles WHERE archived_at IS NOT NULL` first.

## Procedure

```sql
-- 1. Optional: hard-delete profiles already in the archive window
DELETE FROM profiles WHERE archived_at IS NOT NULL;

-- 2. Drop preferences
DROP TABLE IF EXISTS withdrawal_archive_preferences;
DROP TYPE IF EXISTS withdrawal_archive_preference;

-- 3. Drop archive flag
ALTER TABLE profiles DROP COLUMN IF EXISTS archived_at;
```
```

- [ ] **Step 4: Apply locally + verify**

```bash
pnpm run db:migrate:dev
psql $DATABASE_URL -c '\d profiles' | grep archived_at
psql $DATABASE_URL -c '\d withdrawal_archive_preferences'
```

- [ ] **Step 5: Commit**

```bash
git add packages/database/src apps/api/drizzle
git commit -m "feat(db): add archived_at + withdrawal archive preferences"
```

---

## Task 3: Setting service + route

Mirrors PR 5-slice Task 2/3 closely.

**Files:**
- Modify: `apps/api/src/services/settings.ts` — add `getWithdrawalArchivePreference` + `upsertWithdrawalArchivePreference`
- Modify: `apps/api/src/services/settings.test.ts`
- Modify: `apps/api/src/routes/settings.ts` — GET + PUT routes, owner-only

- [ ] **Step 1: Failing service tests**

```ts
describe('withdrawalArchivePreference', () => {
  it('returns "auto" by default', async () => {
    expect(await getWithdrawalArchivePreference(db, ownerProfileId)).toBe('auto');
  });

  it('persists upserted value', async () => {
    await upsertWithdrawalArchivePreference(db, ownerProfileId, 'always');
    expect(await getWithdrawalArchivePreference(db, ownerProfileId)).toBe('always');
    await upsertWithdrawalArchivePreference(db, ownerProfileId, 'never');
    expect(await getWithdrawalArchivePreference(db, ownerProfileId)).toBe('never');
  });
});
```

- [ ] **Step 2: Run, confirm fail; then implement**

```ts
// services/settings.ts (append)
export type WithdrawalArchivePreferenceValue = 'auto' | 'always' | 'never';

export async function getWithdrawalArchivePreference(
  db: Database,
  ownerProfileId: string,
): Promise<WithdrawalArchivePreferenceValue> {
  const row = await db
    .select({ value: withdrawalArchivePreferences.preference })
    .from(withdrawalArchivePreferences)
    .where(eq(withdrawalArchivePreferences.ownerProfileId, ownerProfileId))
    .then((r) => r[0]);
  return row?.value ?? 'auto';
}

export async function upsertWithdrawalArchivePreference(
  db: Database,
  ownerProfileId: string,
  value: WithdrawalArchivePreferenceValue,
): Promise<void> {
  await db
    .insert(withdrawalArchivePreferences)
    .values({ ownerProfileId, preference: value })
    .onConflictDoUpdate({
      target: withdrawalArchivePreferences.ownerProfileId,
      set: { preference: value, updatedAt: new Date() },
    });
}
```

- [ ] **Step 3: Failing route integration tests**

```ts
it('GET /v1/settings/withdrawal-archive returns "auto" default', async () => {
  const { profileId } = await seedOwnerProfile(db);
  const res = await app.request('/v1/settings/withdrawal-archive', { headers: authHeaders(profileId) });
  expect((await res.json()).value).toBe('auto');
});

it('PUT accepts auto|always|never', async () => {
  const { profileId } = await seedOwnerProfile(db);
  for (const value of ['auto', 'always', 'never'] as const) {
    const res = await app.request('/v1/settings/withdrawal-archive', {
      method: 'PUT',
      headers: authHeaders(profileId),
      body: JSON.stringify({ value }),
    });
    expect(res.status).toBe(200);
  }
});

it('PUT rejects invalid enum', async () => {
  const { profileId } = await seedOwnerProfile(db);
  const res = await app.request('/v1/settings/withdrawal-archive', {
    method: 'PUT',
    headers: authHeaders(profileId),
    body: JSON.stringify({ value: 'sometimes' }),
  });
  expect(res.status).toBe(400);
});

it('PUT rejects when caller is not owner', async () => {
  const { profileId } = await seedNonOwnerProfile(db);
  const res = await app.request('/v1/settings/withdrawal-archive', {
    method: 'PUT',
    headers: authHeaders(profileId),
    body: JSON.stringify({ value: 'always' }),
  });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 4: Implement routes mirroring celebration-level**

```ts
const archiveInput = z.object({ value: z.enum(['auto', 'always', 'never']) });

app.get('/withdrawal-archive', async (c) => {
  const profileId = c.get('activeProfileId');
  const value = await getWithdrawalArchivePreference(c.var.db, profileId);
  return c.json({ value });
});

app.put('/withdrawal-archive', zValidator('json', archiveInput), async (c) => {
  const profileId = c.get('activeProfileId');
  const profile = await c.var.db
    .select({ isOwner: profiles.isOwner })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .then((r) => r[0]);
  if (!profile?.isOwner) return c.json({ error: 'forbidden' }, 403);
  await upsertWithdrawalArchivePreference(c.var.db, profileId, c.req.valid('json').value);
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Run, confirm all pass; commit**

```bash
cd apps/api && pnpm exec jest --testPathPattern settings --no-coverage
git add apps/api/src/services/settings.ts apps/api/src/services/settings.test.ts apps/api/src/routes/settings.ts apps/api/src/routes/settings.test.ts
git commit -m "feat(api): expose withdrawal archive preference service+route"
```

---

## Task 4: Mobile setting hook + More tab row

**Files:**
- Modify: `apps/mobile/src/hooks/use-settings.ts`
- Modify: `apps/mobile/src/hooks/use-settings.test.ts`
- Modify: `apps/mobile/src/app/(app)/more.tsx` (Settings/Account section, owner-only)
- Modify: `apps/mobile/src/app/(app)/more.test.tsx`
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 locales)

**i18n keys (under `more.privacy`):**

```json
{
  "more": {
    "privacy": {
      "withdrawalArchiveTitle": "When I withdraw consent for a child",
      "withdrawalArchiveAuto": "Automatic",
      "withdrawalArchiveAutoDescription": "Under-13 accounts are deleted at grace expiry. 13+ accounts are archived for 30 days, then deleted.",
      "withdrawalArchiveAlways": "Always archive (30 days)",
      "withdrawalArchiveAlwaysDescription": "13+ accounts only. Under-13 always deletes immediately for privacy compliance.",
      "withdrawalArchiveNever": "Never archive — delete immediately",
      "withdrawalArchiveError": "Couldn't update setting. Try again."
    }
  }
}
```

- [ ] **Step 1: Failing hook + UI tests**

```ts
// use-settings.test.ts
it('useWithdrawalArchivePreference returns "auto" before any update', async () => {
  // mock $get → {value: 'auto'}
  const { result } = renderHook(() => useWithdrawalArchivePreference(), { wrapper });
  await waitFor(() => expect(result.current.data).toBe('auto'));
});
```

```tsx
// more.test.tsx
it('owner sees segmented withdrawal archive row', () => {
  mockUseProfile({ activeProfile: { id: 'owner-1', isOwner: true } });
  mockUseWithdrawalArchivePreference('auto');
  render(<More />);
  expect(screen.getByTestId('more-withdrawal-archive-auto')).toBeTruthy();
  expect(screen.getByTestId('more-withdrawal-archive-always')).toBeTruthy();
  expect(screen.getByTestId('more-withdrawal-archive-never')).toBeTruthy();
});

it('non-owner does NOT see the row', () => {
  mockUseProfile({ activeProfile: { id: 'co-1', isOwner: false } });
  render(<More />);
  expect(screen.queryByTestId('more-withdrawal-archive-auto')).toBeNull();
});

it('selecting "always" calls update mutation', () => {
  const mutate = jest.fn();
  mockUseUpdateWithdrawalArchivePreference({ mutate });
  mockUseProfile({ activeProfile: { id: 'owner-1', isOwner: true } });
  mockUseWithdrawalArchivePreference('auto');
  render(<More />);
  fireEvent.press(screen.getByTestId('more-withdrawal-archive-always'));
  expect(mutate).toHaveBeenCalledWith('always');
});
```

- [ ] **Step 2: Implement the hook (mirror useCelebrationLevel)**

```ts
const ARCHIVE_KEY = ['settings', 'withdrawal-archive'];

export function useWithdrawalArchivePreference() {
  const { activeProfile } = useProfile();
  return useQuery({
    queryKey: [...ARCHIVE_KEY, activeProfile?.id],
    enabled: !!activeProfile?.id && activeProfile.isOwner,
    queryFn: async () => {
      const res = await api.settings['withdrawal-archive'].$get();
      if (!res.ok) throw new Error('failed');
      return (await res.json()).value as 'auto' | 'always' | 'never';
    },
  });
}

export function useUpdateWithdrawalArchivePreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: 'auto' | 'always' | 'never') => {
      const res = await api.settings['withdrawal-archive'].$put({ json: { value } });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ARCHIVE_KEY }),
  });
}
```

- [ ] **Step 3: Implement segmented row in More**

Add to `more.tsx` in the Settings or Family section, owner-gated. Use a 3-button segmented control (or 3 individual list rows with checkmarks — match the `LearningModeOption` pattern at the same file):

```tsx
const archivePref = useWithdrawalArchivePreference();
const updateArchivePref = useUpdateWithdrawalArchivePreference();

{activeProfile?.isOwner && (
  <View>
    <Text className="text-base font-semibold">{t('more.privacy.withdrawalArchiveTitle')}</Text>
    {(['auto', 'always', 'never'] as const).map((value) => (
      <Pressable
        key={value}
        testID={`more-withdrawal-archive-${value}`}
        onPress={() =>
          updateArchivePref.mutate(value, {
            onError: () => platformAlert(t('more.privacy.withdrawalArchiveError')),
          })
        }
      >
        {/* checkmark when archivePref.data === value */}
        <Text>{t(`more.privacy.withdrawalArchive${value[0].toUpperCase()}${value.slice(1)}`)}</Text>
        <Text className="text-xs text-muted-foreground">
          {t(`more.privacy.withdrawalArchive${value[0].toUpperCase()}${value.slice(1)}Description`, { defaultValue: '' })}
        </Text>
      </Pressable>
    ))}
  </View>
)}
```

- [ ] **Step 4: Add i18n keys; run tests; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/more.tsx' --no-coverage
git add apps/mobile/src/hooks/use-settings.ts apps/mobile/src/hooks/use-settings.test.ts 'apps/mobile/src/app/(app)/more.tsx' 'apps/mobile/src/app/(app)/more.test.tsx' apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): expose withdrawal archive preference in More"
```

---

## Task 5: Inngest archive branching at grace expiry

The deletion step currently at `consent-revocation.ts:110-113` is replaced with a branch.

**Decision matrix at grace expiry (when status is still WITHDRAWN):**

| Setting   | Child age | Action                                                |
|-----------|-----------|-------------------------------------------------------|
| any       | < 13      | Hard delete now (privacy law)                         |
| `auto`    | ≥ 13      | Set `archivedAt = now()`, schedule 30d hard-delete    |
| `always`  | ≥ 13      | Set `archivedAt = now()`, schedule 30d hard-delete    |
| `never`   | ≥ 13      | Hard delete now                                       |

Note: with `MINIMUM_AGE = 11`, the 11-12 cohort is "under-13" for purposes of this rule. Verified at `services/consent.ts:139`.

**Files:**
- Modify: `apps/api/src/inngest/functions/consent-revocation.ts:110-113`
- Modify: `apps/api/src/inngest/functions/consent-revocation.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('hard-deletes regardless of setting when child is under 13', async () => {
  // child birthYear gives age 11
  // setting = 'always'
  // expect deleteProfile to have been called, archivedAt never set
});

it('archives 13+ when setting is "auto"', async () => {
  // setting = 'auto', child age 14
  // expect archivedAt set, deleteProfile NOT called, app/profile.archived event sent
});

it('archives 13+ when setting is "always"', async () => {
  // setting = 'always', child age 16
  // expect archivedAt set
});

it('hard-deletes 13+ when setting is "never"', async () => {
  // setting = 'never', child age 14
  // expect deleteProfile called, archivedAt NOT set
});

it('falls back to "auto" when no preference row exists', async () => {
  // age 14, no preference set
  // expect archivedAt set (auto archives 13+)
});
```

- [ ] **Step 2: Implement branching**

In `consent-revocation.ts`, replace the unconditional delete step:

```ts
await step.run('finalize', async () => {
  const status = await getConsentStatus(db, event.data.childProfileId);
  if (status !== 'WITHDRAWN') return;

  const childProfile = await getProfile(db, event.data.childProfileId);
  const ownerProfileId = await getFamilyOwner(db, event.data.parentProfileId); // owner may differ from revoker (co-parent case)
  const preference = await getWithdrawalArchivePreference(db, ownerProfileId);
  const age = calculateAge(childProfile.birthYear);
  const isUnder13 = age < 13;

  const action: 'delete' | 'archive' =
    isUnder13 ? 'delete'
    : preference === 'never' ? 'delete'
    : 'archive'; // auto + always

  if (action === 'delete') {
    await deleteProfile(db, event.data.childProfileId);
    await sendPushNotification(db, {
      profileId: event.data.parentProfileId,
      type: 'consent_expired',
      title: 'Account closed',
      body: `${childProfile.name}'s account has been deleted.`,
    });
    await recordPendingNotice(db, {
      ownerProfileId: event.data.parentProfileId,
      type: 'consent_deleted',
      childName: childProfile.name,
    });
  } else {
    await db
      .update(profiles)
      .set({ archivedAt: new Date() })
      .where(eq(profiles.id, event.data.childProfileId));
    await inngest.send({
      name: 'app/profile.archived',
      data: { profileId: event.data.childProfileId, parentProfileId: event.data.parentProfileId },
    });
    await sendPushNotification(db, {
      profileId: event.data.parentProfileId,
      type: 'consent_archived',
      title: 'Account archived',
      body: `${childProfile.name}'s account is now archived. Data is retained for 30 days, then deleted.`,
    });
    await recordPendingNotice(db, {
      ownerProfileId: event.data.parentProfileId,
      type: 'consent_archived',
      childName: childProfile.name,
    });
  }
});
```

`recordPendingNotice` is a new helper that writes to a `pendingNotices` table (see Task 6); for the moment, leave a stubbed `console.log` and red-test the call site, then fill it in Task 6.

- [ ] **Step 3: Run; commit**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/inngest/functions/consent-revocation.test.ts --no-coverage
git add apps/api/src/inngest/functions/consent-revocation.ts apps/api/src/inngest/functions/consent-revocation.test.ts
git commit -m "feat(api): branch withdrawal grace-expiry on archive preference + age"
```

---

## Task 6: Archive cleanup Inngest function

**Files:**
- Create: `apps/api/src/inngest/functions/archive-cleanup.ts`
- Create: `apps/api/src/inngest/functions/archive-cleanup.test.ts`
- Modify: registration index

- [ ] **Step 1: Failing test**

```ts
it('hard-deletes profile after 30-day archive window', async () => {
  const event = { data: { profileId: 'p1', parentProfileId: 'parent-1' } };
  const step = mockStep({ /* ... */ });
  await archiveCleanup.fn({ event, step } as never);
  expect(step.sleep).toHaveBeenCalledWith('archive-window', '30d');
  expect(deleteProfile).toHaveBeenCalledWith(expect.anything(), 'p1');
});

it('does NOT delete if profile was un-archived during the window', async () => {
  // mock getProfile → { archivedAt: null } (parent restored consent)
  // expect deleteProfile NOT called
});
```

- [ ] **Step 2: Implement**

```ts
export const archiveCleanup = inngest.createFunction(
  { id: 'archive-cleanup', concurrency: { limit: 1, key: 'event.data.profileId' } },
  { event: 'app/profile.archived' },
  async ({ event, step }) => {
    await step.sleep('archive-window', '30d');
    await step.run('hard-delete', async () => {
      const profile = await getProfile(db, event.data.profileId);
      if (!profile?.archivedAt) return; // un-archived during window
      await deleteProfile(db, event.data.profileId);
    });
  },
);
```

- [ ] **Step 3: Register + run; commit**

Modify the Inngest registration file to include `archiveCleanup`.

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/inngest/functions/archive-cleanup.test.ts --no-coverage
git add apps/api/src/inngest/functions/archive-cleanup.ts apps/api/src/inngest/functions/archive-cleanup.test.ts apps/api/src/inngest/index.ts
git commit -m "feat(api): add archive-cleanup Inngest function for 30d hard-delete"
```

---

## Task 7: Pending-notice plumbing for in-app toast

**Files:**
- Modify: `packages/database/src/schema/...` — add `pendingNotices` table (`id`, `ownerProfileId`, `type`, `payloadJson`, `createdAt`, `seenAt`)
- Generate migration
- Modify: dashboard service to include `pendingNotices` in the response
- Modify: dashboard payload schema in `@eduagent/schemas`
- Add: `POST /v1/notices/:id/seen` route + service to set `seenAt`
- Modify: `apps/mobile/src/app/(app)/home.tsx` — render notice as toast, fire-and-forget the seen mutation

- [ ] **Step 1: Migration + schema** (mirror Task 2 structure)

```ts
export const pendingNotices = pgTable('pending_notices', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerProfileId: uuid('owner_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'consent_archived' | 'consent_deleted'
  payloadJson: jsonb('payload_json').notNull(), // { childName: string }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp('seen_at', { withTimezone: true }),
});
```

- [ ] **Step 2: Failing test for `recordPendingNotice` + dashboard inclusion**

```ts
it('dashboard returns unseen notices for the owner', async () => {
  const { ownerProfileId } = await seedOwnerProfile(db);
  await recordPendingNotice(db, {
    ownerProfileId,
    type: 'consent_archived',
    childName: 'Liam',
  });
  const res = await app.request('/v1/dashboard', { headers: authHeaders(ownerProfileId) });
  const body = await res.json();
  expect(body.pendingNotices).toHaveLength(1);
  expect(body.pendingNotices[0].type).toBe('consent_archived');
  expect(body.pendingNotices[0].payload.childName).toBe('Liam');
});

it('seen notices are excluded', async () => {
  // ack notice via POST /v1/notices/:id/seen, then GET dashboard, expect empty
});
```

- [ ] **Step 3: Implement service + route + dashboard inclusion + run tests**

(Standard pattern; mirrors existing dashboard payload extension shape.)

- [ ] **Step 4: Failing UI test for the toast**

```tsx
// home.test.tsx
it('renders pending consent_archived notice as toast and acks it', async () => {
  mockUseDashboard({ data: { pendingNotices: [{ id: 'n1', type: 'consent_archived', payload: { childName: 'Liam' } }] } });
  const ackMutate = jest.fn();
  mockUseAckNotice({ mutate: ackMutate });
  render(<Home />);
  expect(screen.getByText(/Liam.*archived.*30 days/i)).toBeTruthy();
  // toast auto-dismisses; on dismiss, ack fires
  await waitFor(() => expect(ackMutate).toHaveBeenCalledWith({ id: 'n1' }));
});
```

- [ ] **Step 5: Implement toast in Home + ack mutation; run; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/home.tsx' --no-coverage
git add packages/database/src apps/api/drizzle apps/api/src/services apps/api/src/routes packages/schemas apps/mobile/src/hooks 'apps/mobile/src/app/(app)/home.tsx' 'apps/mobile/src/app/(app)/home.test.tsx'
git commit -m "feat: pending-notice plumbing for post-grace toasts"
```

---

## Task 8: Filter archived profiles out of normal queries

The `archivedAt IS NULL` predicate must reach every query that lists or fetches profiles for normal use. Audit and fix:

**Files to audit:**
- `apps/api/src/services/dashboard.ts` — children list
- `apps/api/src/services/consent.ts` — consent state lookups
- `apps/api/src/services/billing/family.ts` — usage breakdown queries
- `apps/api/src/services/profile.ts` (if exists) — profile fetch helpers
- Any other call to `db.select().from(profiles)` — search with `grep -rn 'from(profiles)' apps/api/src`

- [ ] **Step 1: Run the audit grep**

```bash
grep -rn 'from(profiles)' apps/api/src | grep -v test
```

For each result, decide: is this a "normal use" query (children list, dashboard, billing) or an "operator-level" query (admin tools, deletion job, archive cleanup)? Normal use queries get the `archivedAt IS NULL` filter; operator queries skip it.

- [ ] **Step 2: Failing integration test**

```ts
it('archived child profile does not appear in dashboard children list', async () => {
  const { ownerProfileId, childProfileId } = await seedFamily(db);
  await db.update(profiles).set({ archivedAt: new Date() }).where(eq(profiles.id, childProfileId));
  const res = await app.request('/v1/dashboard', { headers: authHeaders(ownerProfileId) });
  expect((await res.json()).children).toHaveLength(0);
});
```

- [ ] **Step 3: Add the filter to each call site**

```ts
.where(and(/* existing predicates */, isNull(profiles.archivedAt)))
```

- [ ] **Step 4: Run integration tests; full API suite to catch regressions**

```bash
cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage
cd apps/api && pnpm exec jest --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services
git commit -m "feat(api): exclude archived profiles from normal queries"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Cross-package validation**

```bash
pnpm exec nx run-many -t typecheck && pnpm exec nx run-many -t lint && pnpm exec nx run-many -t test
cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage
```

- [ ] **Step 2: Manual smoke**

```bash
cd apps/mobile && pnpm exec expo start --android
```

1. Sign in as owner. Open child detail → withdraw consent. Confirm new copy renders ("{Name}'s account and learning data will be deleted after a 7-day grace period. (For under-13 accounts, deletion is immediate at grace expiry to align with privacy law.)").
2. More → confirm segmented row "When I withdraw consent for a child" with three options. Default `Automatic`. Switch to `Always archive`, switch to `Never archive`, back to `Automatic`. Each tap should persist after a navigation away and back.
3. Non-owner co-parent: confirm row absent.
4. Child profile: confirm row absent and modal copy still shown when accessed via deep-link inspection (children should never reach the withdraw flow as actor — only parent can).
5. Inngest end-to-end (using Inngest dev CLI to fast-forward sleeps): verify all four matrix entries (under-13/auto, under-13/never, 13+/auto, 13+/never).

- [ ] **Step 3: Push**

```bash
git push -u origin pr-11-withdrawal-consent-rev
```

---

## Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Setting write fails | API down | Toast "Couldn't update setting. Try again." Segmented control reverts. | Tap again |
| `archivedAt IS NULL` filter missing on a callsite | Drift after PR | Archived child unexpectedly appears in dashboard | Audit + add filter |
| Archive cleanup runs after un-archive | Owner restored consent during window | Cleanup function checks `archivedAt`; no-ops if null. | None — covered by Task 6 test |
| Pending-notice never acked | App crash during toast | Notice resurfaces on next dashboard fetch | Self-heal — eventually acks |
| Push for `consent_archived` already sent in 24h | Worker retry | Recent-24h dedup guard from PR 6b applies | None |
| Operator restores profile from archive | Manual `archivedAt = NULL` | Profile reappears; archive-cleanup function still scheduled but no-ops | None — function is restart-safe |

## Spec coverage

- Spec lines 286-291 (modal copy) → Task 1.
- Spec lines 292-296 (forward-looking setting + decision matrix) → Tasks 2, 3, 4, 5.
- Spec line 297 ("After grace expiry: one-time toast confirms") → Task 7.
- Spec line 299 (under-13 immediate deletion) → Task 5 decision matrix, enforced regardless of setting.

## Self-review checklist

- [ ] No `eslint-disable`.
- [ ] No internal mocks in integration tests.
- [ ] Migration includes rollback notes covering data-loss scenarios.
- [ ] Under-13 path is unconditional regardless of setting (privacy law, not user preference).
- [ ] Setting is owner-only at both UI and API layer.
- [ ] Every `db.select().from(profiles)` in normal use paths filters `archivedAt IS NULL`.
- [ ] Archive cleanup function is restart-safe (re-checks `archivedAt` before deleting).
- [ ] Pending-notice ack is idempotent (multiple acks land on the same row, no error).
