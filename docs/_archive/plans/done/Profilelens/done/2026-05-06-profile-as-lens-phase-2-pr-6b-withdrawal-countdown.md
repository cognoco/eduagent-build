# Profile-as-Lens — Phase 2 (PR 6b) Implementation Plan: Withdrawal Countdown Banner + 24h Push

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) (rev 4, 2026-04-29) — Move 2 (PR 6) → "Withdrawing consent" paragraph
**Phase:** 2 of 3 — scoped to PR 6b only (countdown banner + 24h pre-expiry push)
**Predecessor:** [`docs/plans/done/2026-05-06-profile-as-lens-phase-2-family-tab.md`](done/2026-05-06-profile-as-lens-phase-2-family-tab.md) (PR 6a)

**Goal:** When a parent has withdrawn consent for a child profile, surface a countdown banner ("{Child}'s account closes in {N} days · Reverse") on Home and Family while the 7-day grace runs, and fire a single push notification 24 hours before grace expires reminding the parent they can still reverse.

**Architecture:** Mount a shared `WithdrawalCountdownBanner` component on Home and Family. It reads the existing dashboard payload — extended once to include `consentStatus` and `respondedAt` per child — filters to children in `WITHDRAWN` state with grace remaining, computes days-left from `respondedAt + 7d`, and offers a `Reverse` CTA wired to the already-existing `restoreConsent` mutation. The 24h warning push is added as a new `step.sleepUntil` + `step.run` pair inside the existing `consent-revocation.ts` Inngest function, before its existing 7-day deletion step.

**Tech Stack:** React Native + Expo Router, NativeWind, react-i18next, React Query (existing `useDashboard`), Hono RPC, Drizzle, Inngest (existing function modification), expo-push (via existing `sendPushNotification`).

---

## Scope statement — what this plan does NOT cover

- **No schema migration.** `consentStates.respondedAt` + 7d already encodes the grace deadline. We do not add `grace_expires_at`.
- **No "Closed accounts" archive surface** (spec line 222, "Archived" soft state). Phase 2 PR 9 territory.
- **No region-specific grace duration** (spec Q4: 30-day archive for 13+, immediate deletion for under-13). PR 6b respects whatever the existing Inngest function already does — this plan only adds a warning, not a deletion-rule change.
- **No nudge/notification preference toggle.** PR 5 territory.
- **No web parity check.** Mobile-only; the banner uses `Pressable` + NativeWind which already render on RN Web, but no new web-specific behaviour.

## Pre-conditions

- Branch: continue on the existing `profilelens` branch, or rebase to a fresh `pr-6b-withdrawal-countdown` branch off `main` if PR 6a is already merged. Confirm `gh pr checks` is green on the predecessor before starting.
- Sanity: `pnpm exec nx run-many -t typecheck` and `pnpm exec nx run-many -t test` pass on the base.
- Verify the predecessor PR 6a actually landed: `apps/mobile/src/app/(app)/family.tsx` exists and renders.
- Verify the existing endpoint `restoreConsent` is wired through the mobile RPC client (`apps/mobile/src/lib/api.ts` or equivalent). If it isn't, add an extra task before Task 4 to wire it — but the spec text in `services/consent.ts:633-679` describes a service function, not necessarily a route. Check `apps/api/src/routes/consent.ts` for an `app.post('/restore', ...)` style export. If the route is missing, this plan adds it (see Task 0 below as conditional).

## File structure

**Shared util (new):**
- Create: `apps/mobile/src/lib/consent-grace.ts` — pure functions, no React.
- Create: `apps/mobile/src/lib/consent-grace.test.ts`

**Mobile component (new):**
- Create: `apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx`
- Create: `apps/mobile/src/components/family/WithdrawalCountdownBanner.test.tsx`

**Mobile mutation hook (new — only if missing):**
- Create or modify: `apps/mobile/src/hooks/use-restore-consent.ts`

**Mobile screens (modify):**
- Modify: `apps/mobile/src/app/(app)/home.tsx` — mount banner at top of scroll content
- Modify: `apps/mobile/src/app/(app)/family.tsx` — mount banner at top of scroll content
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:97-105` — replace inline `getGracePeriodDaysRemaining` import with the shared util

**Backend dashboard payload (modify):**
- Modify: `apps/api/src/services/dashboard.ts` (whichever file builds the children list returned by the dashboard route) — add `consentStatus` + `respondedAt` to each child
- Modify: `packages/schemas/src/dashboard.ts` (or wherever the dashboard response schema lives) — extend the per-child schema
- Modify: `apps/api/src/routes/dashboard.test.ts` (or the existing integration test for `GET /v1/dashboard`)

**Backend Inngest (modify):**
- Modify: `apps/api/src/inngest/functions/consent-revocation.ts` — replace single 7d sleep with 6d sleep → warning push → 1d sleep → existing deletion logic
- Modify: `apps/api/src/inngest/functions/consent-revocation.test.ts`

**i18n (modify):**
- Modify: `apps/mobile/src/i18n/locales/en.json` — add the canonical English keys
- The other 6 locale files (`de`, `es`, `ja`, `nb`, `pl`, `pt`) get the same keys added with the English copy as fallback. Per the project's market-language pivot memory, real translations come later via the LLM i18n pipeline. Don't hand-translate.

---

## Task 0 (conditional): Wire `restoreConsent` route if missing

**Skip this task if `apps/api/src/routes/consent.ts` already exports a route that calls `restoreConsent(db, childProfileId, parentProfileId)`.** Check first: `grep -n 'restoreConsent\|/restore' apps/api/src/routes/consent.ts`.

If a route is missing, add one. Otherwise skip to Task 1.

**Files:**
- Modify: `apps/api/src/routes/consent.ts`
- Modify: `apps/api/src/routes/consent.integration.test.ts` (or whatever the existing integration test is named)

- [ ] **Step 1: Add a failing integration test for the route**

```ts
// in consent.integration.test.ts
it('POST /v1/consent/restore returns 200 and flips consent state back to CONSENTED', async () => {
  const { parentProfileId, childProfileId } = await seedWithdrawnFamily(db);
  const res = await app.request('/v1/consent/restore', {
    method: 'POST',
    headers: authHeaders(parentProfileId),
    body: JSON.stringify({ childProfileId }),
  });
  expect(res.status).toBe(200);
  const state = await db
    .select()
    .from(consentStates)
    .where(eq(consentStates.profileId, childProfileId))
    .then((r) => r[0]);
  expect(state.status).toBe('CONSENTED');
});
```

- [ ] **Step 2: Run it to confirm it fails (route 404)**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/routes/consent.integration.test.ts -t 'restore' --no-coverage
```

Expected: FAIL with 404 from the request.

- [ ] **Step 3: Add the route**

```ts
// in apps/api/src/routes/consent.ts (mirror the existing revoke route)
const restoreInput = z.object({ childProfileId: z.string().uuid() });

app.post(
  '/restore',
  zValidator('json', restoreInput),
  async (c) => {
    const { childProfileId } = c.req.valid('json');
    const parentProfileId = c.get('activeProfileId');
    await restoreConsent(c.var.db, childProfileId, parentProfileId);
    return c.json({ ok: true });
  },
);
```

- [ ] **Step 4: Run test, confirm PASS**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/routes/consent.integration.test.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/consent.ts apps/api/src/routes/consent.integration.test.ts
git commit -m "feat(api): expose POST /v1/consent/restore route"
```

---

## Task 1: Lift `getGracePeriodDaysRemaining` into shared util

The helper currently lives inline in the child detail screen. Multiple surfaces will need it, so DRY first.

**Files:**
- Create: `apps/mobile/src/lib/consent-grace.ts`
- Create: `apps/mobile/src/lib/consent-grace.test.ts`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:97-105` — import the helper instead of redeclaring

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/consent-grace.test.ts
import { GRACE_PERIOD_DAYS, getGracePeriodDaysRemaining, isInGracePeriod } from './consent-grace';

describe('consent-grace', () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });

  function freezeTime(iso: string) {
    Date.now = () => new Date(iso).getTime();
  }

  it('returns 7 on the same day withdrawal happened', () => {
    freezeTime('2026-05-06T10:00:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(7);
  });

  it('returns 1 with 24h left', () => {
    freezeTime('2026-05-12T09:59:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(1);
  });

  it('returns 0 once grace has elapsed', () => {
    freezeTime('2026-05-13T10:01:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(0);
  });

  it('returns 0 for null respondedAt', () => {
    expect(getGracePeriodDaysRemaining(null)).toBe(0);
  });

  it('isInGracePeriod is true when days remaining > 0', () => {
    freezeTime('2026-05-10T10:00:00Z');
    expect(isInGracePeriod('2026-05-06T09:59:00Z')).toBe(true);
  });

  it('isInGracePeriod is false when grace elapsed', () => {
    freezeTime('2026-05-13T11:00:00Z');
    expect(isInGracePeriod('2026-05-06T09:59:00Z')).toBe(false);
  });

  it('GRACE_PERIOD_DAYS is 7', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/consent-grace.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the util**

```ts
// apps/mobile/src/lib/consent-grace.ts
export const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getGracePeriodDaysRemaining(respondedAt: string | Date | null): number {
  if (!respondedAt) return 0;
  const responded = typeof respondedAt === 'string' ? new Date(respondedAt) : respondedAt;
  const expiresAt = responded.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY;
  const msLeft = expiresAt - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / MS_PER_DAY);
}

export function isInGracePeriod(respondedAt: string | Date | null): boolean {
  return getGracePeriodDaysRemaining(respondedAt) > 0;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/consent-grace.test.ts --no-coverage
```

Expected: 7 passed.

- [ ] **Step 5: Replace inline copy in child detail screen**

Open `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`. Find the inline `getGracePeriodDaysRemaining` (around lines 97–105) and any local `GRACE_PERIOD_DAYS` constant. Delete them. Add at the top of the imports:

```ts
import { getGracePeriodDaysRemaining } from '@/lib/consent-grace';
```

(Use whatever import alias the rest of the file uses — `@/...`, `~/...`, or a relative path. Match neighbours.)

- [ ] **Step 6: Run mobile typecheck and the child screen's test**

```bash
cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec jest --findRelatedTests src/app/\(app\)/child/\[profileId\]/index.tsx --no-coverage
```

Expected: typecheck clean; child screen tests still green.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/consent-grace.ts apps/mobile/src/lib/consent-grace.test.ts 'apps/mobile/src/app/(app)/child/:(literal)[profileId]/index.tsx'
git commit -m "refactor(mobile): lift getGracePeriodDaysRemaining into shared util"
```

(Use `:(literal)` prefix per project memory — `[profileId]` is treated as a glob without it.)

---

## Task 2: Extend dashboard payload with `consentStatus` + `respondedAt` per child

**Files:**
- Modify: the schema file that types the dashboard response (`packages/schemas/src/dashboard.ts` or `apps/api/src/routes/dashboard.ts` — locate via `grep -rn 'DashboardChild\|dashboardChildSchema' packages/schemas apps/api/src`).
- Modify: `apps/api/src/services/dashboard.ts` — the SELECT that builds the children list. Join `consentStates` on `profileId = childProfile.id` and project `consentStates.status` and `consentStates.respondedAt`.
- Modify: the integration test for the dashboard endpoint (`apps/api/src/routes/dashboard.integration.test.ts` — if missing, add one).

- [ ] **Step 1: Locate the schema**

```bash
grep -rn 'DashboardChild\|dashboardChildSchema\|children.*z\.array' packages/schemas/src apps/api/src/services apps/api/src/routes | head -40
```

Note: paths below use `dashboardChildSchema` as a placeholder. Substitute the actual export name found by the grep above.

- [ ] **Step 2: Write the failing integration test extension**

In whichever dashboard integration test exists, add (or extend):

```ts
it('returns consentStatus and respondedAt for each child', async () => {
  const { parentProfileId, childProfileId } = await seedWithdrawnFamily(db);
  const res = await app.request('/v1/dashboard', { headers: authHeaders(parentProfileId) });
  const body = await res.json();
  const child = body.children.find((c: { id: string }) => c.id === childProfileId);
  expect(child).toBeDefined();
  expect(child.consentStatus).toBe('WITHDRAWN');
  expect(typeof child.respondedAt).toBe('string'); // ISO string
});
```

If `seedWithdrawnFamily` doesn't exist, mirror whatever helper the existing consent integration test uses to insert into `consentStates` — see `apps/api/src/services/consent.test.ts:1-80` for the shape.

- [ ] **Step 3: Run, confirm fail**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/routes/dashboard.integration.test.ts --no-coverage
```

Expected: FAIL — `child.consentStatus` undefined.

- [ ] **Step 4: Extend the schema**

Find the per-child schema and add:

```ts
consentStatus: z.enum(['PENDING', 'PARENTAL_CONSENT_REQUESTED', 'CONSENTED', 'WITHDRAWN']).nullable(),
respondedAt: z.string().datetime().nullable(),
```

(Use the same enum values as `packages/database/src/schema/profiles.ts:128-160`. If the enum is already exported from `@eduagent/schemas`, reuse it instead of redeclaring.)

- [ ] **Step 5: Extend the service query**

In `apps/api/src/services/dashboard.ts` (or whichever file holds the children SELECT), join `consentStates`:

```ts
import { consentStates } from '@eduagent/database';
// ... in the SELECT:
const rows = await db
  .select({
    // ... existing columns ...
    consentStatus: consentStates.status,
    respondedAt: consentStates.respondedAt,
  })
  .from(profiles)
  .leftJoin(consentStates, eq(consentStates.profileId, profiles.id))
  .where(/* existing parent-scoped where */);
```

Map `respondedAt` to ISO string in the response (`row.respondedAt?.toISOString() ?? null`).

- [ ] **Step 6: Run integration test, confirm pass**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/routes/dashboard.integration.test.ts --no-coverage
```

- [ ] **Step 7: Commit**

```bash
git add packages/schemas apps/api/src/services/dashboard.ts apps/api/src/routes/dashboard.integration.test.ts
git commit -m "feat(api): include consentStatus and respondedAt per dashboard child"
```

---

## Task 3: Add or verify `useRestoreConsent` mutation hook

**Files:**
- Create or modify: `apps/mobile/src/hooks/use-restore-consent.ts`
- Create: `apps/mobile/src/hooks/use-restore-consent.test.ts`

Check first: `grep -rn 'restoreConsent\|RestoreConsent' apps/mobile/src/hooks`. If a hook already exists, skip ahead to verifying it invalidates the dashboard query and adjust if not.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/hooks/use-restore-consent.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRestoreConsent } from './use-restore-consent';

jest.mock('@/lib/api', () => ({
  api: {
    consent: { restore: { $post: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) } },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('invalidates the dashboard query on success', async () => {
  const { result } = renderHook(() => useRestoreConsent(), { wrapper });
  await result.current.mutateAsync({ childProfileId: 'child-1' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
```

(Adjust the mock `api` shape to match the actual mobile RPC client structure used in other hooks in `apps/mobile/src/hooks/`.)

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-restore-consent.test.ts --no-coverage
```

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/hooks/use-restore-consent.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRestoreConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childProfileId }: { childProfileId: string }) => {
      const res = await api.consent.restore.$post({ json: { childProfileId } });
      if (!res.ok) throw new Error(`restore failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

(Match the actual RPC client surface — Hono RPC clients vary. If `api.consent.restore.$post` isn't the right shape, mirror an existing mutation hook in the same folder.)

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-restore-consent.test.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-restore-consent.ts apps/mobile/src/hooks/use-restore-consent.test.ts
git commit -m "feat(mobile): add useRestoreConsent mutation hook"
```

---

## Task 4: Build `WithdrawalCountdownBanner` component

**Files:**
- Create: `apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx`
- Create: `apps/mobile/src/components/family/WithdrawalCountdownBanner.test.tsx`
- Modify: `apps/mobile/src/i18n/locales/en.json` (and the other six locales — copy English values as placeholders)

**i18n keys to add (under `family.withdrawal`):**

```json
"family": {
  "withdrawal": {
    "bannerTitleSingle": "{{name}}'s account closes in {{days}} {{daysWord}}",
    "bannerTitleMulti": "{{count}} accounts closing soon",
    "bannerCta": "Reverse",
    "bannerCtaShort": "Undo",
    "daysOne": "day",
    "daysOther": "days",
    "restoreErrorTitle": "Couldn't reverse withdrawal",
    "restoreErrorBody": "Try again in a moment.",
    "restoreSuccessToast": "Withdrawal reversed for {{name}}"
  }
}
```

**Component contract:**

```ts
type Props = {
  // optional override for testing; in real use the component reads useDashboard internally
  testChildren?: Array<{ id: string; name: string; consentStatus: string | null; respondedAt: string | null }>;
};
```

Behaviour:
- Reads `useDashboard()` to get `children`.
- Filters: `consentStatus === 'WITHDRAWN' && isInGracePeriod(respondedAt)`.
- Renders nothing if filtered list is empty (`return null`).
- Single child: shows "{Name}'s account closes in {N} day(s) · Reverse".
- Multiple children: shows "{count} accounts closing soon" with each child as a row inside a collapsible group, each with its own Reverse button. (Decision: do the multi-child grouping inline in the same banner — do not split into per-child cards. See spec line 222 — banners are explicitly cross-cutting surfaces.)
- Tapping Reverse calls `useRestoreConsent().mutate({ childProfileId })`. While pending, button shows spinner. On error, shows toast with `restoreErrorTitle` / `restoreErrorBody`.
- testID: `withdrawal-countdown-banner`. Per-row testID: `withdrawal-countdown-row-${childId}`. Reverse button testID: `withdrawal-countdown-reverse-${childId}`.

- [ ] **Step 1: Write the failing test**

```tsx
// WithdrawalCountdownBanner.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { WithdrawalCountdownBanner } from './WithdrawalCountdownBanner';

const mockMutate = jest.fn();
jest.mock('@/hooks/use-restore-consent', () => ({
  useRestoreConsent: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockUseDashboard = jest.fn();
jest.mock('@/hooks/use-dashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));

beforeEach(() => {
  mockMutate.mockClear();
  // freeze time at 3 days into a 7-day grace
  jest.useFakeTimers().setSystemTime(new Date('2026-05-09T10:00:00Z'));
});

afterEach(() => jest.useRealTimers());

const respondedAt = '2026-05-06T10:00:00Z';

it('renders nothing when no children are in grace', () => {
  mockUseDashboard.mockReturnValue({ data: { children: [] } });
  render(<WithdrawalCountdownBanner />);
  expect(screen.queryByTestId('withdrawal-countdown-banner')).toBeNull();
});

it('renders countdown for a single child in grace', () => {
  mockUseDashboard.mockReturnValue({
    data: { children: [{ id: 'c1', name: 'Liam', consentStatus: 'WITHDRAWN', respondedAt }] },
  });
  render(<WithdrawalCountdownBanner />);
  expect(screen.getByTestId('withdrawal-countdown-banner')).toBeTruthy();
  // 7 days total, 3 days elapsed → 4 days left
  expect(screen.getByText(/Liam's account closes in 4 days/)).toBeTruthy();
  expect(screen.getByTestId('withdrawal-countdown-reverse-c1')).toBeTruthy();
});

it('hides children whose grace has expired', () => {
  jest.setSystemTime(new Date('2026-05-15T10:00:00Z')); // > 7 days after respondedAt
  mockUseDashboard.mockReturnValue({
    data: { children: [{ id: 'c1', name: 'Liam', consentStatus: 'WITHDRAWN', respondedAt }] },
  });
  render(<WithdrawalCountdownBanner />);
  expect(screen.queryByTestId('withdrawal-countdown-banner')).toBeNull();
});

it('hides children whose consent is CONSENTED again', () => {
  mockUseDashboard.mockReturnValue({
    data: { children: [{ id: 'c1', name: 'Liam', consentStatus: 'CONSENTED', respondedAt }] },
  });
  render(<WithdrawalCountdownBanner />);
  expect(screen.queryByTestId('withdrawal-countdown-banner')).toBeNull();
});

it('renders multi-child summary when ≥2 children in grace', () => {
  mockUseDashboard.mockReturnValue({
    data: {
      children: [
        { id: 'c1', name: 'Liam', consentStatus: 'WITHDRAWN', respondedAt },
        { id: 'c2', name: 'Mia', consentStatus: 'WITHDRAWN', respondedAt },
      ],
    },
  });
  render(<WithdrawalCountdownBanner />);
  expect(screen.getByText('2 accounts closing soon')).toBeTruthy();
  expect(screen.getByTestId('withdrawal-countdown-row-c1')).toBeTruthy();
  expect(screen.getByTestId('withdrawal-countdown-row-c2')).toBeTruthy();
});

it('calls useRestoreConsent.mutate with the right id when Reverse pressed', () => {
  mockUseDashboard.mockReturnValue({
    data: { children: [{ id: 'c1', name: 'Liam', consentStatus: 'WITHDRAWN', respondedAt }] },
  });
  render(<WithdrawalCountdownBanner />);
  fireEvent.press(screen.getByTestId('withdrawal-countdown-reverse-c1'));
  expect(mockMutate).toHaveBeenCalledWith({ childProfileId: 'c1' });
});

it('uses singular "day" when 1 day left', () => {
  jest.setSystemTime(new Date('2026-05-12T10:00:00Z')); // 1 day left
  mockUseDashboard.mockReturnValue({
    data: { children: [{ id: 'c1', name: 'Liam', consentStatus: 'WITHDRAWN', respondedAt }] },
  });
  render(<WithdrawalCountdownBanner />);
  expect(screen.getByText(/in 1 day(?!s)/)).toBeTruthy();
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/family/WithdrawalCountdownBanner.test.tsx --no-coverage
```

- [ ] **Step 3: Add i18n keys**

Open `apps/mobile/src/i18n/locales/en.json`. Locate the existing `family` object and add the `withdrawal` sub-object shown above. Then copy the same English copy verbatim into `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json`. Real translations are deferred to the LLM i18n pipeline (per project memory `market_language_pivot.md`).

- [ ] **Step 4: Implement the component**

```tsx
// WithdrawalCountdownBanner.tsx
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/hooks/use-dashboard';
import { useRestoreConsent } from '@/hooks/use-restore-consent';
import { getGracePeriodDaysRemaining, isInGracePeriod } from '@/lib/consent-grace';

type Child = { id: string; name: string; consentStatus: string | null; respondedAt: string | null };

export function WithdrawalCountdownBanner() {
  const { t } = useTranslation();
  const { data } = useDashboard();
  const { mutate, isPending } = useRestoreConsent();

  const inGrace: Child[] = (data?.children ?? []).filter(
    (c: Child) => c.consentStatus === 'WITHDRAWN' && isInGracePeriod(c.respondedAt),
  );

  if (inGrace.length === 0) return null;

  const isMulti = inGrace.length > 1;

  return (
    <View
      testID="withdrawal-countdown-banner"
      className="mx-4 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <Text className="text-sm font-semibold text-amber-700 dark:text-amber-300">
        {isMulti
          ? t('family.withdrawal.bannerTitleMulti', { count: inGrace.length })
          : null}
      </Text>

      {inGrace.map((child) => {
        const daysLeft = getGracePeriodDaysRemaining(child.respondedAt);
        const daysWord = t(daysLeft === 1 ? 'family.withdrawal.daysOne' : 'family.withdrawal.daysOther');
        return (
          <View
            key={child.id}
            testID={`withdrawal-countdown-row-${child.id}`}
            className="mt-1 flex-row items-center justify-between"
          >
            <Text className="flex-1 text-sm text-foreground">
              {t('family.withdrawal.bannerTitleSingle', {
                name: child.name,
                days: daysLeft,
                daysWord,
              })}
            </Text>
            <Pressable
              testID={`withdrawal-countdown-reverse-${child.id}`}
              accessibilityRole="button"
              disabled={isPending}
              onPress={() => mutate({ childProfileId: child.id })}
              className="ml-3 rounded-md bg-amber-600 px-3 py-1.5"
            >
              {isPending ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text className="text-sm font-medium text-white">
                  {isMulti ? t('family.withdrawal.bannerCtaShort') : t('family.withdrawal.bannerCta')}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
```

(Match NativeWind class conventions used in nearby components — particularly `text-foreground`, `bg-amber-*`. If the codebase uses semantic tokens like `bg-warning`, prefer those. Per CLAUDE.md: shared mobile components stay persona-unaware, no hardcoded hex.)

- [ ] **Step 5: Run, confirm all banner tests pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/family/WithdrawalCountdownBanner.tsx --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx apps/mobile/src/components/family/WithdrawalCountdownBanner.test.tsx apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add WithdrawalCountdownBanner component"
```

---

## Task 5: Mount banner on Home

**Files:**
- Modify: `apps/mobile/src/app/(app)/home.tsx`
- Modify: `apps/mobile/src/app/(app)/home.test.tsx`

- [ ] **Step 1: Add a failing test in home.test.tsx**

```tsx
it('renders WithdrawalCountdownBanner', () => {
  // assumes existing test setup mocks useDashboard with one in-grace child
  render(<Home />);
  expect(screen.getByTestId('withdrawal-countdown-banner')).toBeTruthy();
});
```

(Reuse whatever `render(<Home />)` harness the existing home.test.tsx already has. If that test mocks `useDashboard` with no children, extend the mock for this case only.)

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/home.tsx --no-coverage
```

- [ ] **Step 3: Mount the banner**

In `home.tsx`, add the import and render the component immediately inside the top-level `ScrollView` (or whatever wrapper exists), above any existing content:

```tsx
import { WithdrawalCountdownBanner } from '@/components/family/WithdrawalCountdownBanner';

// inside the JSX, at the top of the scroll content:
<WithdrawalCountdownBanner />
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/home.tsx --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add 'apps/mobile/src/app/(app)/home.tsx' 'apps/mobile/src/app/(app)/home.test.tsx'
git commit -m "feat(mobile): mount WithdrawalCountdownBanner on Home"
```

---

## Task 6: Mount banner on Family

**Files:**
- Modify: `apps/mobile/src/app/(app)/family.tsx`
- Modify: `apps/mobile/src/app/(app)/family.test.tsx` (created during PR 6a; if missing, add)

- [ ] **Step 1: Failing test**

```tsx
it('renders WithdrawalCountdownBanner', () => {
  render(<Family />);
  expect(screen.getByTestId('withdrawal-countdown-banner')).toBeTruthy();
});
```

- [ ] **Step 2: Confirm fail, then mount**

```tsx
import { WithdrawalCountdownBanner } from '@/components/family/WithdrawalCountdownBanner';
// at top of scroll content:
<WithdrawalCountdownBanner />
```

- [ ] **Step 3: Run, confirm pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/family.tsx --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add 'apps/mobile/src/app/(app)/family.tsx' 'apps/mobile/src/app/(app)/family.test.tsx'
git commit -m "feat(mobile): mount WithdrawalCountdownBanner on Family tab"
```

---

## Task 7: Add 24h pre-expiry warning push to `consent-revocation` Inngest function

**Files:**
- Modify: `apps/api/src/inngest/functions/consent-revocation.ts:17-104`
- Modify: `apps/api/src/inngest/functions/consent-revocation.test.ts`

**Current flow (lines 17–104, paraphrased from the survey):**
1. `step.sleep('revocation-grace-period', '7d')`
2. `step.run('check-restoration', ...)` — re-reads consent state
3. If still `WITHDRAWN`: delete profile, send `consent_expired` push to parent + child

**New flow:**
1. `step.sleep('warning-mark', '6d')`
2. `step.run('send-warning-push', ...)` — re-reads consent state. If still `WITHDRAWN`, send a `consent_warning` push to **parent only** with body "{Child}'s account closes tomorrow. You can still reverse." Idempotency-guard against duplicate sends via the existing `getRecentNotificationCount(db, parentProfileId, 'consent_warning', 24)` pattern from line 55–72.
3. `step.sleep('grace-end', '1d')`
4. `step.run('check-restoration', ...)` — unchanged.
5. If still `WITHDRAWN`: deletion + `consent_expired`, unchanged.

**Why split as two sleeps:** Inngest restart-safety. If the worker restarts between days 6 and 7, it resumes from the second sleep with the warning step already marked complete. A single 7d sleep with conditional logic inside doesn't get this property.

- [ ] **Step 1: Add failing test**

```ts
// in consent-revocation.test.ts
it('sends a consent_warning push to the parent at the 6-day mark', async () => {
  const event = { data: { childProfileId: 'c1', parentProfileId: 'p1' } };
  const sleep = jest.fn().mockResolvedValue(undefined);
  const run = jest.fn().mockImplementation(async (_name, fn) => fn());
  const step = { sleep, run, sendEvent: jest.fn() };

  // mocks: getConsentStatus returns WITHDRAWN, getRecentNotificationCount returns 0
  (getConsentStatus as jest.Mock).mockResolvedValue('WITHDRAWN');
  (getRecentNotificationCount as jest.Mock).mockResolvedValue(0);

  await consentRevocation.fn({ event, step } as never);

  expect(sleep).toHaveBeenCalledWith('warning-mark', '6d');
  expect(sleep).toHaveBeenCalledWith('grace-end', '1d');
  expect(sendPushNotification).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      profileId: 'p1',
      type: 'consent_warning',
    }),
    expect.anything(),
  );
});

it('does NOT send a warning if consent was restored before the 6-day mark', async () => {
  const event = { data: { childProfileId: 'c1', parentProfileId: 'p1' } };
  const sleep = jest.fn().mockResolvedValue(undefined);
  const run = jest.fn().mockImplementation(async (_name, fn) => fn());
  const step = { sleep, run, sendEvent: jest.fn() };
  (getConsentStatus as jest.Mock).mockResolvedValue('CONSENTED');

  await consentRevocation.fn({ event, step } as never);

  expect(sendPushNotification).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ type: 'consent_warning' }),
    expect.anything(),
  );
});

it('does NOT send a duplicate warning if one was sent in the last 24h', async () => {
  const event = { data: { childProfileId: 'c1', parentProfileId: 'p1' } };
  const step = {
    sleep: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation(async (_n, fn) => fn()),
    sendEvent: jest.fn(),
  };
  (getConsentStatus as jest.Mock).mockResolvedValue('WITHDRAWN');
  (getRecentNotificationCount as jest.Mock).mockResolvedValueOnce(1); // already sent

  await consentRevocation.fn({ event, step } as never);

  const warningCalls = (sendPushNotification as jest.Mock).mock.calls.filter(
    ([, payload]) => payload.type === 'consent_warning',
  );
  expect(warningCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/inngest/functions/consent-revocation.test.ts --no-coverage
```

- [ ] **Step 3: Modify the function**

Replace the existing single `step.sleep('revocation-grace-period', '7d')` with the two-sleep + warning pattern. Sketch:

```ts
// inside consentRevocation handler
await step.sleep('warning-mark', '6d');

await step.run('send-warning-push', async () => {
  const status = await getConsentStatus(db, event.data.childProfileId);
  if (status !== 'WITHDRAWN') return;

  const recent = await getRecentNotificationCount(
    db,
    event.data.parentProfileId,
    'consent_warning',
    24,
  );
  if (recent > 0) return;

  const childName = await getChildDisplayName(db, event.data.childProfileId); // reuse existing helper if present, else inline a SELECT
  await sendPushNotification(
    db,
    {
      profileId: event.data.parentProfileId,
      title: 'Account closing tomorrow',
      body: `${childName}'s account closes tomorrow. You can still reverse.`,
      type: 'consent_warning',
    },
  );
});

await step.sleep('grace-end', '1d');

// existing check-restoration + deletion + consent_expired logic, unchanged
```

If `event.data` only carries `childProfileId` today, extend the event payload to also carry `parentProfileId` — and update the `revokeConsent` service (`apps/api/src/services/consent.ts:581-627`) to include it when emitting `app/consent.revoked`. Add to that test too.

- [ ] **Step 4: Run, confirm all consent-revocation tests pass**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/inngest/functions/consent-revocation.test.ts --no-coverage
```

- [ ] **Step 5: Run the full API test suite to catch regressions**

```bash
cd apps/api && pnpm exec jest --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/inngest/functions/consent-revocation.ts apps/api/src/inngest/functions/consent-revocation.test.ts apps/api/src/services/consent.ts apps/api/src/services/consent.test.ts
git commit -m "feat(api): send 24h pre-expiry warning push during withdrawal grace"
```

---

## Task 8: Integration test — banner shows after revoke, hides after restore

This is the end-to-end check that wires Tasks 2, 4, and 7 together.

**File:**
- Modify: existing dashboard or family integration test, OR create `apps/api/src/routes/withdrawal-countdown.integration.test.ts`

- [ ] **Step 1: Write the test**

```ts
it('dashboard reflects the WITHDRAWN→CONSENTED→WITHDRAWN cycle', async () => {
  const { parentProfileId, childProfileId } = await seedConsentedFamily(db);

  // revoke
  await app.request('/v1/consent/revoke', {
    method: 'POST',
    headers: authHeaders(parentProfileId),
    body: JSON.stringify({ childProfileId }),
  });
  let body = await (await app.request('/v1/dashboard', { headers: authHeaders(parentProfileId) })).json();
  expect(body.children.find((c) => c.id === childProfileId).consentStatus).toBe('WITHDRAWN');

  // restore
  await app.request('/v1/consent/restore', {
    method: 'POST',
    headers: authHeaders(parentProfileId),
    body: JSON.stringify({ childProfileId }),
  });
  body = await (await app.request('/v1/dashboard', { headers: authHeaders(parentProfileId) })).json();
  expect(body.children.find((c) => c.id === childProfileId).consentStatus).toBe('CONSENTED');
});
```

- [ ] **Step 2: Run, confirm pass**

```bash
cd apps/api && pnpm exec jest --runTestsByPath src/routes/withdrawal-countdown.integration.test.ts --no-coverage
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/
git commit -m "test(api): cover dashboard reflects withdrawal/restore cycle"
```

---

## Task 9: Manual verification

Pre-commit hooks already cover lint/typecheck/unit; this task is the manual smoke per CLAUDE.md ("verify before declaring done").

- [ ] **Step 1: Run cross-package validation**

```bash
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t test
```

Expected: green.

- [ ] **Step 2: Run integration tests explicitly (pre-commit skips them)**

```bash
cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage
```

- [ ] **Step 3: Manual smoke on emulator**

Per project memory `e2e-emulator-issues.md` — read it first.

```bash
cd apps/mobile && pnpm exec expo start --android
```

In the running app, as a parent:
1. Navigate to a child profile, withdraw consent. Confirm: Home banner shows "{Child}'s account closes in 7 days · Reverse". Family tab shows the same.
2. Tap Reverse. Confirm: banner disappears within ~1s (post-mutation invalidation) and child detail returns to active state.
3. Withdraw again. Confirm banner reappears.
4. Add a second child, withdraw both. Confirm multi-child summary "2 accounts closing soon" with two rows + per-row Reverse buttons.
5. Confirm the `WithdrawalCountdownBanner` does NOT render when signed in as a child profile (banner should never appear because dashboard.children for a child is empty / role gate prevents).

Capture each step as a checkbox in the PR description.

- [ ] **Step 4: Push**

```bash
git push -u origin profilelens
```

(Or whichever branch name was chosen.)

---

## Failure modes (per CLAUDE.md "Spec failure modes before coding")

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Dashboard query loading | Cold start | Banner not yet rendered (no flash) | Auto-renders when query resolves |
| Dashboard query errors | Network down | Banner does not render; existing dashboard error UI handles it | User retries by pulling to refresh |
| Restore mutation fails | API 5xx | Toast: "Couldn't reverse withdrawal. Try again in a moment." Banner stays visible. | Tap Reverse again |
| Multiple parents withdraw simultaneously | Two devices, same family | Last-writer-wins on `consentStates`; banner reflects current DB state on next dashboard refetch | Pull to refresh |
| Inngest worker restart between day 6 and day 7 | Cloud restart | Warning step already marked complete; resume from day-7 sleep | None needed (Inngest durability) |
| `consent_warning` already sent within 24h | Duplicate event | Second send suppressed via `getRecentNotificationCount` guard | None needed |
| Parent has push disabled at OS level | OS setting | In-app banner remains visible, push silently dropped | In-app surface is the source of truth (per spec line 162: "In-app surface always present") |
| Grace already past when worker resumes | Long worker outage | `check-restoration` sees `WITHDRAWN`, deletion runs as scheduled, warning step's 24h-recent guard suppresses any late warning | None needed |

## Spec coverage

Spec lines this plan satisfies:
- L160–161: "Banner on Home and Family — '{Child}'s account closes in {N} days · Reverse'." → Tasks 4, 5, 6.
- L161: "Push notification 24h before grace expires." → Task 7.
- L162 and failure-mode L319: "In-app banner remains on Home + Family" when push fails. → Task 4 makes the in-app surface the source of truth, push is additive.
- L243 (Phase 2 acceptance #8): "Withdraw Consent grace surfaces a countdown banner on both Home and Family. Push fires 24h before expiry." → Tasks 5, 6, 7.

Out of scope per the spec but worth noting for reviewers: spec line 222 "Archived" soft state (read-only inside Closed accounts) is **not** delivered here. PR 9 territory.

## Self-review checklist (run before opening PR)

- [ ] All 9 tasks done.
- [ ] No new `eslint-disable` directives introduced (per project memory `feedback_no_suppression.md`).
- [ ] No new `jest.mock()` for internal modules (per `feedback_testing_no_mocks.md`). Mocks added in Task 4 are for hooks (boundaries from the component's POV), which is acceptable; mocks added in Task 7 mirror the existing `consent-revocation.test.ts` pattern for Inngest steps.
- [ ] `getGracePeriodDaysRemaining` is imported from `@/lib/consent-grace` everywhere; no remaining inline copies (`grep -rn 'function getGracePeriodDaysRemaining' apps/mobile/src` returns only the util file).
- [ ] `consent_warning` push has a recent-24h dedup guard (Task 7 step 3).
- [ ] Banner returns `null` when no children in grace (Task 4 first test case).
- [ ] Multi-child rendering works for 2+ children (Task 4 multi-child test).
- [ ] Banner is mounted on BOTH Home and Family, identical component (no fork).
- [ ] PR description includes the manual smoke checklist from Task 9 step 3.
