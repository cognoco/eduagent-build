# Epic 12 Final Cleanup — Remove birthDate + personaType

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Epic 12 by removing all `birthDate` and `personaType` references from source and test files, making `birthYear` (integer) the sole age field across the entire stack.

**Architecture:** The `personaType` enum was removed from DB and Zod schemas in earlier work but still lingers in ~9 test fixtures. The `birthDate` column/field exists alongside `birthYear` in the DB schema, Zod schemas, and ~20 source files. We remove `birthDate` everywhere, simplify `computeAgeBracket()` to year-only, and drop the DB column via migration. Zero users means no backwards-compat or data migration needed.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, Hono, React Native (Expo), Jest

**Key files (read these first for orientation):**
- `packages/schemas/src/age.ts` — age bracket computation + date-to-year helpers (being simplified)
- `packages/schemas/src/profiles.ts` — Zod schemas for profile create/update/response
- `packages/database/src/schema/profiles.ts` — Drizzle table definition
- `apps/api/src/services/profile.ts` — profile CRUD (heaviest birthDate usage)
- `apps/api/src/services/session.ts:1103` — birthDate fallback in exchange context
- `apps/mobile/src/app/create-profile.tsx` — mobile date picker + API call

---

## Task 1: Simplify age utilities

**Files:**
- Modify: `packages/schemas/src/age.ts`
- Modify: `packages/schemas/src/age.test.ts`

This task removes the `birthDate`-based overload from `computeAgeBracket()` and deletes the `birthYearFromDateLike` and `birthDateFromBirthYear` helper functions. After this, `computeAgeBracket` only accepts numbers.

- [ ] **Step 1: Update `age.test.ts` — remove birthDate-dependent tests**

Replace the entire file content. Remove tests for `birthYearFromDateLike` and the birthDate-string/Date tests for `computeAgeBracket`:

```typescript
import { computeAgeBracket } from './age.js';

describe('computeAgeBracket', () => {
  it('returns child for ages under 13', () => {
    expect(computeAgeBracket(2015, 2026)).toBe('child');
  });

  it('returns adolescent for ages 13 through 17', () => {
    expect(computeAgeBracket(2012, 2026)).toBe('adolescent');
    expect(computeAgeBracket(2009, 2026)).toBe('adolescent');
  });

  it('returns adult for ages 18 and above', () => {
    expect(computeAgeBracket(2008, 2026)).toBe('adult');
  });

  it('uses current year when currentYear not provided', () => {
    const thisYear = new Date().getFullYear();
    // A 20-year-old should be adult
    expect(computeAgeBracket(thisYear - 20)).toBe('adult');
    // A 10-year-old should be child
    expect(computeAgeBracket(thisYear - 10)).toBe('child');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schemas && pnpm exec jest age.test.ts --no-coverage`
Expected: FAIL — old tests import `birthYearFromDateLike` which will be removed next.

Actually the test file is self-contained and only imports from `./age.js`. The test should pass against the OLD code since we only removed tests. But it will be a baseline.

- [ ] **Step 3: Rewrite `age.ts` — year-only computation**

Replace the entire file:

```typescript
export type AgeBracket = 'child' | 'adolescent' | 'adult';

/**
 * Computes an age bracket from birthYear for consent gating and voice tone.
 *
 * Uses `currentYear - birthYear`, which can overestimate by up to 11 months.
 * Callers that need conservative safety gating (consent, minimum-age checks)
 * should use `<=` thresholds to compensate.
 */
export function computeAgeBracket(
  birthYear: number,
  currentYear?: number
): AgeBracket {
  const year = currentYear ?? new Date().getFullYear();
  const age = year - birthYear;

  if (age < 13) return 'child';
  if (age < 18) return 'adolescent';
  return 'adult';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/schemas && pnpm exec jest age.test.ts --no-coverage`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/age.ts packages/schemas/src/age.test.ts
git commit -m "refactor(schemas): simplify computeAgeBracket to year-only [Epic-12]

Remove birthDate overload, birthYearFromDateLike, and birthDateFromBirthYear.
birthYear is now the sole age input across the entire stack.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Update Zod schemas — birthYear is the sole age field

**Files:**
- Modify: `packages/schemas/src/profiles.ts`
- Modify: `packages/schemas/src/auth.ts`

This task removes `birthDate` from profile creation input, profile response, and auth registration schemas. `birthYear` becomes required (not optional) on create.

- [ ] **Step 1: Update `profiles.ts` — remove birthDate, make birthYear required**

Replace the entire file:

```typescript
import { z } from 'zod';
import { consentStatusSchema } from './consent.ts';

export const locationSchema = z.enum(['EU', 'US', 'OTHER']);
export type LocationType = z.infer<typeof locationSchema>;

export const birthYearSchema = z
  .number()
  .int()
  .refine((y) => y >= new Date().getFullYear() - 120, {
    message: 'birthYear is too far in the past',
  })
  .refine((y) => y <= new Date().getFullYear(), {
    message: 'birthYear cannot be in the future',
  });

export const profileCreateSchema = z.object({
  displayName: z.string().min(1).max(50),
  birthYear: birthYearSchema,
  avatarUrl: z.string().url().optional(),
  location: locationSchema.optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

export const profileUpdateSchema = profileCreateSchema
  .partial()
  .omit({ birthYear: true, location: true })
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const profileSwitchSchema = z.object({
  profileId: z.string().uuid(),
});

export type ProfileSwitchInput = z.infer<typeof profileSwitchSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  birthYear: birthYearSchema.nullable(),
  location: locationSchema.nullable(),
  isOwner: z.boolean(),
  hasPremiumLlm: z.boolean().default(false),
  consentStatus: consentStatusSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
```

Key changes:
- `profileCreateSchema`: no `superRefine`, no `birthDate`, `birthYear` is required (not optional)
- `profileUpdateSchema`: derives from `profileCreateSchema` directly (no `profileCreateFields` intermediate)
- `profileSchema` (response): no `birthDate` field, `birthYear` is the only age field

- [ ] **Step 2: Update `auth.ts` — remove birthDate from register schema**

Replace `birthDate` with `birthYear`:

In `packages/schemas/src/auth.ts`, change line 12:
```typescript
// Old:
  birthDate: z.string().date().optional(),
// New:
  birthYear: z.number().int().optional(),
```

The full `registerSchema` becomes:
```typescript
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  birthYear: z.number().int().optional(),
  location: z.enum(['EU', 'US', 'OTHER']).optional(),
});
```

Update the type export (no change needed — `RegisterInput` auto-infers).

- [ ] **Step 3: Verify schemas package compiles**

Run: `cd packages/schemas && pnpm exec tsc --noEmit`
Expected: PASS (or errors in downstream consumers — those are fixed in subsequent tasks).

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/profiles.ts packages/schemas/src/auth.ts
git commit -m "refactor(schemas): remove birthDate from profile + auth schemas [Epic-12]

birthYear is now required on profile creation (no longer optional).
birthDate removed from create input, response type, and register schema.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Update profile service — remove birthDate handling

**Files:**
- Modify: `apps/api/src/services/profile.ts`
- Modify: `apps/api/src/services/profile.test.ts`

This is the biggest source change. The profile service currently has BD-06 logic that treats `birthDate` as the source of truth. After this task, `birthYear` from input is used directly.

- [ ] **Step 1: Update profile service imports and mapProfileRow**

In `apps/api/src/services/profile.ts`:

Remove the age utility imports (lines 13-16):
```typescript
// DELETE these lines:
import {
  birthDateFromBirthYear,
  birthYearFromDateLike,
} from '@eduagent/schemas';
```

Replace `mapProfileRow` (lines 52-72) with:
```typescript
function mapProfileRow(
  row: typeof profiles.$inferSelect,
  consentStatus: Profile['consentStatus'] = null
): Profile {
  return {
    id: row.id,
    accountId: row.accountId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    birthYear: row.birthYear ?? null,
    location: row.location ?? null,
    isOwner: row.isOwner,
    hasPremiumLlm: row.hasPremiumLlm,
    consentStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

Key change: removed `birthDate` from the returned object entirely. `birthYear` reads directly from the DB row.

- [ ] **Step 2: Simplify createProfile — use birthYear directly**

Replace the BD-06 block and insert in `createProfile` (lines 155-193):

```typescript
  const birthYear = input.birthYear;

  // Pre-compute consent check (single call — used for both age gate and consent state)
  const consentCheck = checkConsentRequired(birthYear);

  // Enforce minimum age (PRD line 386: ages 6-10 out of scope)
  if (consentCheck?.belowMinimumAge) {
    throw new ProfileValidationError(
      'CHILD_AGE_VIOLATION',
      'birthYear',
      'Users must be at least 11 years old to create a profile'
    );
  }

  const [row] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthYear,
      location: input.location ?? null,
      isOwner: isOwner ?? false,
    })
    .returning();
```

Key changes:
- `birthYear` comes from `input.birthYear` directly (required by Zod, no null check needed)
- Removed the `birthDate` branch, `birthYearFromDateLike`, and BD-06 comment
- Removed `birthDate` from insert values entirely

- [ ] **Step 3: Remove unused error code**

`ProfileValidationCode` type — remove `'BIRTH_YEAR_REQUIRED'` since `birthYear` is now required by Zod (never reaches the service layer without it):

```typescript
export type ProfileValidationCode = 'CHILD_AGE_VIOLATION';
```

Also remove the `if (birthYear == null)` guard and its `ProfileValidationError` throw — Zod guarantees birthYear is present.

- [ ] **Step 4: Update profile.test.ts — remove birthDate from fixtures and tests**

In `apps/api/src/services/profile.test.ts`:

4a. Update `mockProfileRow` — remove `birthDate` from the type and default:
```typescript
function mockProfileRow(
  overrides?: Partial<{
    id: string;
    accountId: string;
    displayName: string;
    avatarUrl: string | null;
    birthYear: number | null;
    location: 'EU' | 'US' | 'OTHER' | null;
    isOwner: boolean;
  }>
) {
  return {
    id: overrides?.id ?? 'profile-1',
    accountId: overrides?.accountId ?? 'account-123',
    displayName: overrides?.displayName ?? 'Test User',
    avatarUrl: overrides?.avatarUrl ?? null,
    birthYear: overrides?.birthYear ?? null,
    location: overrides?.location ?? null,
    isOwner: overrides?.isOwner ?? false,
    createdAt: NOW,
    updatedAt: NOW,
    hasPremiumLlm: false,
  };
}
```

Remove `const BIRTH = new Date('1990-01-15T00:00:00.000Z');` if it's only used for `birthDate`.

4b. Update test "includes input fields in returned profile" (~line 203):
```typescript
  it('includes input fields in returned profile', async () => {
    const row = mockProfileRow({
      accountId: 'acct-1',
      displayName: 'Custom Name',
      avatarUrl: 'https://example.com/avatar.png',
      birthYear: 1990,
    });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createProfile(db, 'acct-1', {
      displayName: 'Custom Name',
      avatarUrl: 'https://example.com/avatar.png',
      birthYear: 1990,
    });

    expect(result.displayName).toBe('Custom Name');
    expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    expect(result.birthYear).toBe(1990);
    expect(result.accountId).toBe('acct-1');
  });
```

4c. Update test "stores a derived legacy birthDate for birthYear-only input" (~line 315) — **DELETE this test entirely**. There is no longer a derived birthDate.

4d. Update test "throws when neither birthDate nor birthYear is provided" (~line 337) — **DELETE this test**. Zod now enforces `birthYear` is required; this case never reaches the service.

4e. Remove any remaining `birthDate` references (check with `grep birthDate profile.test.ts`). The `expect(result).toHaveProperty('birthDate')` assertion (~line 160) should be changed to `expect(result).toHaveProperty('birthYear')`.

- [ ] **Step 5: Run profile service tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/profile.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/profile.ts apps/api/src/services/profile.test.ts
git commit -m "refactor(api): remove birthDate from profile service [Epic-12]

birthYear is the sole age input. Removed BD-06 dual-source logic,
birthDate from mapProfileRow response, and birthDate from insert values.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Update remaining API services

**Files:**
- Modify: `apps/api/src/services/session.ts` (line 47, line 1103-1104)
- Modify: `apps/api/src/services/session.test.ts` (line 875)
- Modify: `apps/api/src/services/export.ts` (lines 246-248)
- Modify: `apps/api/src/services/export.test.ts` (line 20-31)
- Modify: `apps/api/src/services/test-seed.ts` (lines 36-37, 334, 345, 1587)
- Modify: `apps/api/src/middleware/profile-scope.ts` (comment only, lines 16-27)

- [ ] **Step 1: Update session.ts — remove birthYearFromDateLike import and fallback**

In `apps/api/src/services/session.ts`:

1a. Remove the import (line 47):
```typescript
// DELETE this line:
import { birthYearFromDateLike } from '@eduagent/schemas';
```

1b. Simplify the birthYear line (~line 1103-1104):
```typescript
// Old:
    birthYear:
      profile?.birthYear ?? birthYearFromDateLike(profile?.birthDate ?? null),
// New:
    birthYear: profile?.birthYear ?? null,
```

- [ ] **Step 2: Update session.test.ts — remove birthDate from fixture**

In `apps/api/src/services/session.test.ts` (~line 875):
```typescript
// Old:
        { birthDate: new Date('2014-06-15T00:00:00.000Z') },
// New:
        { birthYear: 2014 },
```

The mock DB factory's `profileSelectResults` should match the new column shape.

- [ ] **Step 3: Update export.ts — replace birthDate with birthYear in GDPR export**

In `apps/api/src/services/export.ts` (~lines 241-254):
```typescript
    profiles: profileRows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      birthYear: row.birthYear ?? null,
      location: row.location ?? null,
      isOwner: row.isOwner,
      hasPremiumLlm: row.hasPremiumLlm,
      consentStatus: consentStatusByProfileId.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
```

Key change: replaced `birthDate: row.birthDate ? ... : null` with `birthYear: row.birthYear ?? null`.

- [ ] **Step 4: Update export.test.ts — remove birthDate and personaType from fixture**

In `apps/api/src/services/export.test.ts`, the `mockProfileRow` (~line 20-31):
```typescript
function mockProfileRow(id: string, displayName: string) {
  return {
    id,
    accountId: 'account-1',
    displayName,
    avatarUrl: null,
    birthYear: 2010,
    isOwner: false,
    hasPremiumLlm: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
```

Remove `birthDate: BIRTH` and `personaType: 'LEARNER' as const`. Add `birthYear: 2010` and `hasPremiumLlm: false`.

If there are assertions on `birthDate` in the test expectations, update them to `birthYear`.

- [ ] **Step 5: Update test-seed.ts — remove birthDate parameter**

In `apps/api/src/services/test-seed.ts`:

5a. Remove imports (~lines 36-37):
```typescript
// DELETE:
import {
  birthDateFromBirthYear,
  birthYearFromDateLike,
} from '@eduagent/schemas';
```

These functions no longer exist in the schemas package.

5b. Simplify `createBaseProfile` (~lines 327-348):
```typescript
async function createBaseProfile(
  db: Database,
  accountId: string,
  opts: {
    displayName: string;
    birthYear: number;
    isOwner?: boolean;
  }
): Promise<string> {
  const profileId = generateUUIDv7();

  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: opts.displayName,
    birthYear: opts.birthYear,
    isOwner: opts.isOwner ?? true,
  });
  return profileId;
}
```

Remove the `birthDate` parameter and the `birthDateFromBirthYear` fallback from the insert.

5c. Update the export/summary function (~line 1587):
```typescript
// Old:
            birthYear: birthYearFromDateLike(prof.birthDate),
// New:
            birthYear: prof.birthYear,
```

- [ ] **Step 6: Update profile-scope.ts comment**

In `apps/api/src/middleware/profile-scope.ts`, update the JSDoc comment on `ProfileMeta` (lines 16-27):
```typescript
/**
 * Profile metadata injected into Hono context by profileScopeMiddleware.
 *
 * `birthYear` is populated from the `birth_year` column.
 *
 * Consumers that depend on `birthYear` being non-null:
 *   - LLM context injection (system prompt age bracketing)
 *   - Sentry age-gating (under-13 PII scrubbing)
 *   - Consent checks (GDPR under-16 / COPPA under-13)
 */
```

Remove the migration dependency warning about `birthDate` fallback since that fallback no longer exists.

- [ ] **Step 7: Run related tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/session.ts src/services/export.ts src/services/test-seed.ts src/middleware/profile-scope.ts --no-coverage`
Expected: PASS (or failures in test files that still have old fixtures — those are cleaned up in Task 6).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/session.ts apps/api/src/services/session.test.ts apps/api/src/services/export.ts apps/api/src/services/export.test.ts apps/api/src/services/test-seed.ts apps/api/src/middleware/profile-scope.ts
git commit -m "refactor(api): remove birthDate from session, export, test-seed, middleware [Epic-12]

Session service no longer falls back to birthYearFromDateLike.
Export uses birthYear directly. Test-seed simplified.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Update mobile client

**Files:**
- Modify: `apps/mobile/src/app/create-profile.tsx`
- Modify: `apps/mobile/src/hooks/use-rating-prompt.ts`

- [ ] **Step 1: Update create-profile.tsx — stop sending birthDate to API**

In `apps/mobile/src/app/create-profile.tsx`:

1a. Remove `formatDateForApi` function (~line 42):
```typescript
// DELETE this function:
function formatDateForApi(date: Date): string {
  ...
}
```

1b. Update the submit handler body (~lines 109-113):
```typescript
      const body = {
        displayName: trimmedName,
        birthYear: birthYear!,
      };
```

Remove `birthDate: formatDateForApi(birthDate)`. The `birthYear!` non-null assertion is safe because `canSubmit` guards that `birthDate !== null`, and `birthYear` is derived from `birthDate.getFullYear()`.

**Note:** Keep the date picker UI unchanged — it's good UX for entering age. The `birthDate` local state and `formatDateForDisplay` helper stay. Only the API call changes.

- [ ] **Step 2: Update use-rating-prompt.ts — remove birthDate from computeAgeBracket call**

In `apps/mobile/src/hooks/use-rating-prompt.ts` (~lines 63-68):
```typescript
// Old:
    if (
      computeAgeBracket(
        activeProfile.birthYear,
        activeProfile.birthDate ?? undefined
      ) === 'adult'
    )
// New:
    if (computeAgeBracket(activeProfile.birthYear) === 'adult')
```

The `computeAgeBracket` function now only accepts `(birthYear, currentYear?)`.

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS (or errors in test files — those are fixed in Task 6).

If there are type errors from other mobile files reading `profile.birthDate`, fix them here — likely just removing the reference.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/create-profile.tsx apps/mobile/src/hooks/use-rating-prompt.ts
git commit -m "refactor(mobile): stop sending birthDate, use birthYear only [Epic-12]

Date picker UI unchanged (good UX). Only birthYear sent to API.
computeAgeBracket simplified to year-only call.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Clean up all test fixtures

**Files:**
- Modify: `apps/api/src/middleware/profile-scope.test.ts`
- Modify: `apps/api/src/routes/profiles.test.ts`
- Modify: `apps/api/src/routes/consent.test.ts`
- Modify: `apps/api/src/routes/consent-web.test.ts`
- Modify: `apps/api/src/routes/curriculum.test.ts`
- Modify: `apps/api/src/routes/assessments.test.ts`
- Modify: `apps/api/src/services/billing.test.ts`
- Modify: `apps/mobile/src/app/create-profile.test.tsx`
- Modify: `apps/mobile/src/hooks/use-profiles.test.ts`
- Modify: `apps/mobile/src/lib/profile.test.tsx`
- Modify: `apps/mobile/src/app/profiles.test.tsx`
- Modify: `apps/mobile/src/components/common/ProfileSwitcher.test.tsx`
- Modify: `apps/api/src/routes/auth.test.ts`

All changes are mechanical: remove `personaType` properties and replace `birthDate` with `birthYear` in mock profile objects.

- [ ] **Step 1: Fix `profile-scope.test.ts`**

In `apps/api/src/middleware/profile-scope.test.ts`:

Remove `personaType: 'LEARNER'` and `birthDate: '2014-06-15'` from all three mock return values (lines 12, 27, 149). Keep `birthYear: 2014`. The mock should match what the real service now returns.

Line 8-17 mock `getProfile`:
```typescript
      return Promise.resolve({
        id: 'valid-profile-id',
        accountId: 'test-account-id',
        displayName: 'Test',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
      });
```

Line 22-33 mock `findOwnerProfile`:
```typescript
      return Promise.resolve({
        id: 'owner-profile-id',
        accountId: 'test-account-id',
        displayName: 'Owner',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
      });
```

Line ~149: same pattern — remove `personaType`, keep `birthYear`.

- [ ] **Step 2: Fix `profiles.test.ts`**

In `apps/api/src/routes/profiles.test.ts`:

2a. Mock `createProfileWithLimitCheck` (~lines 59-76): remove `personaType: input.personaType ?? 'LEARNER'` and `birthDate: input.birthDate ?? null`:
```typescript
  createProfileWithLimitCheck: jest
    .fn()
    .mockImplementation((_db, accountId, input) => ({
      id: 'test-profile-id',
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthYear: input.birthYear ?? null,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
```

2b. Mock `getProfile` (~lines 77-90): remove `personaType: 'LEARNER'` and `birthDate: null`:
```typescript
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    avatarUrl: null,
    birthYear: null,
    location: null,
    isOwner: false,
    hasPremiumLlm: false,
    consentStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
```

2c. Mock `updateProfile` (~lines 91+): same pattern.

2d. Test "returns 201 with valid profile data" (~line 154): remove `personaType: 'LEARNER'` from request body and response assertion. Change `birthDate: '2008-06-15'` to `birthYear: 2008`:
```typescript
      body: JSON.stringify({
        displayName: 'Test User',
        birthYear: 2008,
      }),
```
Remove `expect(body.profile.personaType).toBe('LEARNER');`.

2e. Test "returns 400 when displayName is missing" (~line 202): remove `personaType: 'TEEN'` and `birthDate: '2014-03-10'` from body, add `birthYear: 2014`:
```typescript
      body: JSON.stringify({
        birthYear: 2014,
      }),
```

- [ ] **Step 3: Fix remaining API route tests**

3a. `consent.test.ts` (~line 76-87): mock `getProfile` — remove `personaType: 'TEEN'` and `birthDate: null`, add `birthYear: 2010`:
```typescript
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    avatarUrl: null,
    birthYear: 2010,
    isOwner: false,
    hasPremiumLlm: false,
    consentStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
```

3b. `consent-web.test.ts` (~line 58-69): same pattern — remove `personaType: 'TEEN'` and `birthDate: null`, add `birthYear: 2010`.

3c. `curriculum.test.ts` (~line 45-55): remove `personaType: 'LEARNER'`, add `birthYear: 2010`.

3d. `assessments.test.ts` (~line 38-48): remove `personaType: 'LEARNER'`, add `birthYear: 2010`.

- [ ] **Step 4: Fix billing.test.ts**

In `apps/api/src/services/billing.test.ts` (~line 151-159): remove `personaType: 'LEARNER'` from mock profile factory, add `birthYear: 2010`.

- [ ] **Step 5: Fix auth.test.ts**

In `apps/api/src/routes/auth.test.ts` (~line 33): change `birthDate: '2010-05-15'` to `birthYear: 2010`.

- [ ] **Step 6: Fix mobile test files**

6a. `create-profile.test.tsx` (~lines 127-137, 169-180): remove `personaType: 'PARENT'`/`'TEEN'` and change `birthDate` to `birthYear`:
```typescript
    // Adult profile fixture:
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      isOwner: false,
      hasPremiumLlm: false,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    // Child profile fixture:
    const newProfile = {
      id: 'child-id',
      accountId: 'a1',
      displayName: 'Kid',
      avatarUrl: null,
      birthYear: 2014,
      isOwner: false,
      consentStatus: 'PENDING',
      hasPremiumLlm: false,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };
```

6b. `use-profiles.test.ts` (~lines 65, 76): change `birthDate: null` → remove it; ensure `birthYear` is present.

6c. `profile.test.tsx` (~lines 25, 39): change `birthDate: null` → remove it, `birthDate: '2012-05-15'` → remove it. Ensure `birthYear` is present.

6d. `profiles.test.tsx` (~lines 27, 42): change `birthDate: null` → remove it, `birthDate: '2012-05-15'` → remove it. Ensure `birthYear` is present.

6e. `ProfileSwitcher.test.tsx` (~line 10): change `birthDate: null` → remove it. Ensure `birthYear` is present.

- [ ] **Step 7: Run all tests**

Run: `cd apps/api && pnpm exec jest --no-coverage`
Then: `cd apps/mobile && pnpm exec jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 8: Grep audit — verify zero remaining references**

```bash
grep -r "personaType" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist | grep -v docs
grep -r "birthDate" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist | grep -v docs
```

Expected: Zero hits for `personaType`. Zero hits for `birthDate` EXCEPT possibly `create-profile.tsx` (local UI state for the date picker — this is expected and correct, it's not sent to the API).

**If any references remain:** fix them before committing. Common stragglers:
- Import statements that reference deleted functions
- Type annotations that include `birthDate`
- Test assertions that check for `birthDate` in responses

- [ ] **Step 9: Commit**

```bash
git add -A apps/api/src/routes/*.test.ts apps/api/src/middleware/*.test.ts apps/api/src/services/billing.test.ts apps/mobile/src/app/create-profile.test.tsx apps/mobile/src/hooks/use-profiles.test.ts apps/mobile/src/lib/profile.test.tsx apps/mobile/src/app/profiles.test.tsx apps/mobile/src/components/common/ProfileSwitcher.test.tsx apps/api/src/routes/auth.test.ts
git commit -m "test: remove personaType + birthDate from all test fixtures [Epic-12]

Mechanical cleanup: 13 test files updated. Mock profiles now match
the actual Profile type (birthYear only, no personaType).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update Drizzle DB schema + generate migration

**Files:**
- Modify: `packages/database/src/schema/profiles.ts`
- Create: `apps/api/drizzle/NNNN_*.sql` (auto-generated migration)

- [ ] **Step 1: Update Drizzle schema — remove birthDate, add birthYearSetBy**

In `packages/database/src/schema/profiles.ts`, update the `profiles` table definition:

Remove the `birthDate` column (line 57) and update `birthYear` to not-null. Add `birthYearSetBy`:

```typescript
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    birthYear: integer('birth_year').notNull(),
    birthYearSetBy: uuid('birth_year_set_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    location: locationTypeEnum('location'),
    isOwner: boolean('is_owner').notNull().default(false),
    hasPremiumLlm: boolean('has_premium_llm').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('profiles_account_id_idx').on(table.accountId)]
);
```

Changes:
- Removed `birthDate: timestamp('birth_date', { mode: 'date' })`
- Changed `birthYear: integer('birth_year')` → `integer('birth_year').notNull()`
- Added `birthYearSetBy: uuid('birth_year_set_by')` with self-referencing FK

- [ ] **Step 2: Generate migration**

Run: `pnpm run db:generate`

This generates a migration SQL file. Review it to confirm it:
1. Drops the `birth_date` column
2. Sets `birth_year` to NOT NULL (may need a DEFAULT or UPDATE first for zero-user DB)
3. Adds `birth_year_set_by` column

- [ ] **Step 3: Review generated migration**

Read the generated SQL file. For a zero-user database, the migration should be straightforward. If `drizzle-kit` generates an `ALTER COLUMN SET NOT NULL` without handling existing NULL rows, manually add a guard:

```sql
-- Backfill any NULL birth_year rows (zero-user DB, this is a safety net)
UPDATE "profiles" SET "birth_year" = 2000 WHERE "birth_year" IS NULL;
```

Before the `ALTER COLUMN ... SET NOT NULL`.

- [ ] **Step 4: Apply migration to dev DB**

Run: `pnpm run db:push:dev` or `pnpm run db:migrate:dev`

Expected: Migration applies successfully.

- [ ] **Step 5: Verify typecheck passes with new schema**

Run: `pnpm exec nx run api:typecheck`

This confirms that all code referencing `profiles.birthDate` (which no longer exists in the Drizzle schema) has been cleaned up. If there are type errors, fix them — they indicate missed `birthDate` references.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/profiles.ts apps/api/drizzle/
git commit -m "migrate(db): drop birth_date column, add birth_year_set_by [Epic-12]

birth_year is now NOT NULL (sole age field).
birth_year_set_by tracks parent-locked birth years (FR203.3).
birth_date column dropped — zero users, no data migration needed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification pass

- [ ] **Step 1: Full typecheck**

```bash
pnpm exec nx run api:typecheck
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Both PASS with zero errors.

- [ ] **Step 2: Full lint**

```bash
pnpm exec nx run api:lint
pnpm exec nx lint mobile
```

Expected: PASS

- [ ] **Step 3: Full test suite**

```bash
pnpm exec nx run api:test
cd apps/mobile && pnpm exec jest --no-coverage
```

Expected: ALL PASS

- [ ] **Step 4: Final grep audit**

```bash
grep -r "personaType" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist
grep -r "birthDate" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist
grep -r "birth_date" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist
grep -r "birthDateFromBirthYear\|birthYearFromDateLike" --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v node_modules | grep -v dist
```

Expected results:
- `personaType`: Zero hits (excluding docs/)
- `birthDate`: Only in `apps/mobile/src/app/create-profile.tsx` (local date picker state — expected)
- `birth_date`: Zero hits (column name gone from Drizzle schema)
- Deleted helpers: Zero hits

- [ ] **Step 5: Push**

```bash
git push
```

---

## Summary of what changes

| Area | Before | After |
|------|--------|-------|
| `age.ts` | 68 lines, 3 exported functions | ~18 lines, 1 exported function |
| Profile Zod create | `birthDate` OR `birthYear` (optional, superRefine) | `birthYear` (required) |
| Profile Zod response | includes `birthDate` + `birthYear` | `birthYear` only |
| Profile service | BD-06 dual-source logic, birthDate in insert | Direct `birthYear` from input |
| Session service | `birthYearFromDateLike` fallback | Direct `birthYear` |
| Export service | Maps `birthDate` timestamp to ISO string | Maps `birthYear` directly |
| Mobile create-profile | Sends both `birthDate` + `birthYear` | Sends only `birthYear` |
| DB schema | `birth_date` + `birth_year` (both nullable) | `birth_year` NOT NULL + `birth_year_set_by` |
| Test fixtures | 17 `personaType` refs, ~25 `birthDate` refs | Zero |
