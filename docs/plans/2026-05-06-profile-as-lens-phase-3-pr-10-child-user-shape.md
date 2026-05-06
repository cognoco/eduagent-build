# Profile-as-Lens — Phase 3 (PR 10) Implementation Plan: Child User-Shape Design Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-06
**Spec:** [`docs/specs/2026-04-28-profile-as-lens.md`](../specs/2026-04-28-profile-as-lens.md) — Phase 3 PR 10 (lines 268-283)
**Phase:** 3

**Goal:** Make children a first-class user shape with appropriate copy register and a UI-layer privacy boundary. Reword growth/mastery/retention language for child-active sessions, restrict child access to parent-oriented surfaces (subscription detail, per-profile breakdown), surface a child-appropriate quota line on Home, and ensure no Family-tab path leaks for child profiles via any back-door.

**Architecture:** Three independent workstreams.

1. **Copy register (i18n).** Replace progress/growth/retention strings with neutral language. Where copy needs to differ between adult and child viewers, branch via `useActiveProfileRole()` rather than building separate components. Keep components role-unaware where possible by keying i18n on a `register` parameter.
2. **Restriction enforcement.** Audit every parent-only surface for child-side access, both at the UI gating layer and at the deep-link/route layer. Add a centralized `<ParentOnly>` guard component for surfaces that should be invisible to children regardless of how they navigated.
3. **Child quota line on Home.** Add a tiny "{N} questions left today · {M} left this month" component on the child's Home, sourced from existing usage data — never per-profile breakdown.

**Tech Stack:** react-i18next, NativeWind, existing `useActiveProfileRole`, existing `useDashboard`/billing endpoints.

---

## Scope statement — what this plan does NOT cover

- **No deletion or restructuring of `parentView.*` i18n keys.** They remain for parent contexts. New child-register copy lives under separate keys.
- **No new analytics events.** PR 10 is UX register + boundary enforcement, not telemetry. (Telemetry was Phase 1 territory and was skipped.)
- **No streak rework.** Streak copy was already verified neutral on 2026-05-06 (`{count}-day streak` in both `home.learner.streak` and `parentView.index.dayStreak`). The spec's "neutral framing" rule is already met.
- **No Family-tab gating change.** Already gated on `role === 'owner'` at `_layout.tsx:1279`. We *audit* it, we don't rebuild it.

## Pre-conditions

- Branch: `pr-10-child-user-shape` off main.
- Verified ground truth (2026-05-06):
  - `useActiveProfileRole()` at `apps/mobile/src/hooks/use-active-profile-role.ts:20-33`, returns `'owner' | 'impersonated-child' | 'child' | null`.
  - Family tab gated by `useFamilyPresence()` requiring `role === 'owner'`.
  - Subscription button in More gated by `!isImpersonating` at `more.tsx:797-812` — but **no deep-link guard** on the route itself.
  - `subscription.tsx:1363-1398` renders `usage.byProfile` with role-aware labels but **no top-level child-access gate**. Server-side gate at `services/billing/family.ts:303-306` always returns one row for non-owners; child sees their own row but the spec wants children to see *no breakdown at all* unless owner has enabled sharing.
  - Progress copy keys: `progress.growth.*`, `progress.hero.*` (mastered, growth), `progress.stats.retention*`, `shelf.book*Retention*` use `mastered`, `growth`, `retention` terminology.
  - No quota line currently rendered on Home for children. `LearnerScreen.tsx` focuses on subjects/intent.
  - Children identified via `family_links` (`parent_profile_id` + `child_profile_id`) at `schema/profiles.ts:99-126`.

## Restriction matrix

The spec line 273-278 enumerates what children must not see. This plan enforces each:

| Surface                           | Current state                          | After PR 10                                       |
|-----------------------------------|----------------------------------------|---------------------------------------------------|
| Family tab in bottom nav          | Already gated on `role === 'owner'`    | Unchanged. **Add an audit assertion test.**       |
| Subscription detail screen        | Hidden in More for impersonated-child but route is reachable by direct nav | Route-level redirect for `role !== 'owner'`       |
| Per-profile usage breakdown       | Server returns 1-row breakdown to non-owners | Server returns **0-row breakdown** to children unless owner has enabled `family_pool_breakdown_shared` |
| Other children's data             | Already prevented (server-scoped)      | Unchanged                                         |
| Pricing / plan cards              | Live on subscription detail            | Hidden by route-level redirect                    |
| Withdrawal flow as actor          | Server requires owner profile          | Unchanged                                         |

---

## File structure

**New components:**
- Create: `apps/mobile/src/components/_internal/ParentOnly.tsx` — small wrapper that redirects to Home if `role !== 'owner'`. Used at the top of any parent-only screen.
- Create: `apps/mobile/src/components/_internal/ParentOnly.test.tsx`
- Create: `apps/mobile/src/components/home/ChildQuotaLine.tsx` — child-specific quota row
- Create: `apps/mobile/src/components/home/ChildQuotaLine.test.tsx`

**Hooks (new or modified):**
- Modify: `apps/mobile/src/hooks/use-copy-register.ts` (or add inline helper) — small util `copyRegisterFor(role)` returning `'adult' | 'child'`.

**Screen modifications:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx` — wrap with `<ParentOnly>`, redirect children
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx` — render `ChildQuotaLine` for child profiles
- Modify: `apps/mobile/src/app/(app)/progress/index.tsx` — branch hero copy by register
- Modify: `apps/mobile/src/components/progress/GrowthChart.tsx` — register-aware a11y label

**Backend (server-side child gate on breakdown):**
- Modify: `apps/api/src/services/billing/family.ts:303-306` — children see empty breakdown unless owner has enabled sharing
- Modify: `apps/api/src/services/billing/family.test.ts`

**i18n:**
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 other locales)

---

## Task 1: Build `<ParentOnly>` route guard

**Files:**
- Create: `apps/mobile/src/components/_internal/ParentOnly.tsx`
- Create: `apps/mobile/src/components/_internal/ParentOnly.test.tsx`

The folder name `_internal` (note the leading underscore) is per Expo Router convention — directories prefixed with `_` are not treated as routes (per repo memory `project_expo_router_pollution.md`).

- [ ] **Step 1: Failing test**

```tsx
// ParentOnly.test.tsx
import { render } from '@testing-library/react-native';
import { ParentOnly } from './ParentOnly';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseRole = jest.fn();
jest.mock('@/hooks/use-active-profile-role', () => ({
  useActiveProfileRole: () => mockUseRole(),
}));

beforeEach(() => mockReplace.mockClear());

it('renders children for owner', () => {
  mockUseRole.mockReturnValue('owner');
  const { getByText } = render(<ParentOnly><Text>Inner</Text></ParentOnly>);
  expect(getByText('Inner')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('redirects child role to home', () => {
  mockUseRole.mockReturnValue('child');
  render(<ParentOnly><Text>Inner</Text></ParentOnly>);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('redirects impersonated-child role to home', () => {
  mockUseRole.mockReturnValue('impersonated-child');
  render(<ParentOnly><Text>Inner</Text></ParentOnly>);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('renders nothing while role is loading (null)', () => {
  mockUseRole.mockReturnValue(null);
  const { queryByText } = render(<ParentOnly><Text>Inner</Text></ParentOnly>);
  expect(queryByText('Inner')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/_internal/ParentOnly.tsx --no-coverage
```

- [ ] **Step 3: Implement**

```tsx
// ParentOnly.tsx
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useActiveProfileRole } from '@/hooks/use-active-profile-role';

export function ParentOnly({ children }: { children: React.ReactNode }) {
  const role = useActiveProfileRole();
  const router = useRouter();

  useEffect(() => {
    if (role === 'child' || role === 'impersonated-child') {
      router.replace('/');
    }
  }, [role, router]);

  if (role === null) return null; // loading
  if (role !== 'owner') return null; // redirect in flight
  return <>{children}</>;
}
```

- [ ] **Step 4: Run, confirm pass; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/_internal/ParentOnly.tsx --no-coverage
git add apps/mobile/src/components/_internal/ParentOnly.tsx apps/mobile/src/components/_internal/ParentOnly.test.tsx
git commit -m "feat(mobile): add ParentOnly route guard"
```

---

## Task 2: Wrap parent-only routes with `<ParentOnly>`

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx`
- Modify: `apps/mobile/src/app/(app)/subscription.test.tsx`

Audit other parent-only screens by grepping for assumptions about ownership. Initial candidates: subscription, family, dashboard. Family tab is already role-gated at the tab-mounting layer; **subscription is the gap**.

- [ ] **Step 1: Failing test for subscription**

```tsx
// subscription.test.tsx — extend
it('redirects child role away from subscription detail', () => {
  mockUseRole.mockReturnValue('child');
  render(<Subscription />);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('renders subscription content for owner role', () => {
  mockUseRole.mockReturnValue('owner');
  render(<Subscription />);
  expect(screen.getByTestId('subscription-content')).toBeTruthy();
});
```

- [ ] **Step 2: Wrap the screen**

```tsx
// subscription.tsx — at the top of the default-export component:
export default function Subscription() {
  return (
    <ParentOnly>
      <SubscriptionContent />
    </ParentOnly>
  );
}

// Move existing implementation into SubscriptionContent (rename existing default export)
function SubscriptionContent() {
  // ... existing content ...
  return <View testID="subscription-content">{/* ... */}</View>;
}
```

- [ ] **Step 3: Audit family.tsx and dashboard.tsx for the same gap**

```bash
grep -n 'export default' apps/mobile/src/app/\(app\)/family.tsx apps/mobile/src/app/\(app\)/dashboard.tsx 2>/dev/null
```

If either screen renders without role checking and is reachable by deep link from a child profile, wrap it the same way. Family tab is hidden from the bottom nav for children, but the route itself may be reachable.

- [ ] **Step 4: Run tests; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests 'src/app/(app)/subscription.tsx' --no-coverage
git add 'apps/mobile/src/app/(app)/subscription.tsx' 'apps/mobile/src/app/(app)/subscription.test.tsx' apps/mobile/src/app/
git commit -m "feat(mobile): block child profiles from parent-only screens"
```

---

## Task 3: Server-side breakdown gate for children

The current gate at `services/billing/family.ts:303-306` says non-owners see only their own row. The spec says **children should see no breakdown at all** unless owner has enabled `family_pool_breakdown_shared` (PR 5-slice).

**Files:**
- Modify: `apps/api/src/services/billing/family.ts:303-306`
- Modify: `apps/api/src/services/billing/family.test.ts`

This task assumes PR 5-slice is merged so `getFamilyPoolBreakdownSharing` already exists. If it isn't, this task can ship the children-restriction half independently — the OR-with-sharing-flag half just degrades gracefully (children always restricted, which is the safer default).

- [ ] **Step 1: Failing test**

```ts
it('child sees empty breakdown when owner sharing is disabled', async () => {
  const { ownerProfileId, childProfileId } = await seedFamily(db);
  await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, false); // explicit
  const result = await getUsageBreakdownForProfile(db, { activeProfileId: childProfileId });
  expect(result.byProfile).toHaveLength(0);
});

it('child sees full breakdown when owner sharing is enabled', async () => {
  const { ownerProfileId, childProfileId } = await seedFamily(db);
  await upsertFamilyPoolBreakdownSharing(db, ownerProfileId, true);
  const result = await getUsageBreakdownForProfile(db, { activeProfileId: childProfileId });
  expect(result.byProfile.length).toBeGreaterThan(0);
});

it('co-parent (non-owner adult) still sees their own row when sharing is disabled', async () => {
  // existing PR-5 behavior — non-owner adults see their own row
  // confirms PR 10 changes children-only, doesn't tighten co-parent
});
```

- [ ] **Step 2: Modify the service**

```ts
const sharingEnabled = await getFamilyPoolBreakdownSharing(db, viewer.familyOwnerProfileId);
const isOwnerBreakdownViewer =
  (viewer.isOwner && viewer.hasChildLink) || (sharingEnabled && viewer.hasChildLink);

const visibleRows = isOwnerBreakdownViewer
  ? profileRows
  : viewer.isChild
    ? [] // children: no breakdown unless owner enabled sharing
    : profileRows.filter((row) => row.profileId === input.activeProfileId); // co-parent: own row only
```

`viewer.isChild` is derived from `family_links` lookup in the viewer object. If that field doesn't exist yet, add it: a profile is a child viewer iff a `family_links` row exists with `child_profile_id = activeProfileId`.

- [ ] **Step 3: Run; commit**

```bash
cd apps/api && pnpm exec jest --testPathPattern billing --no-coverage
git add apps/api/src/services/billing
git commit -m "feat(api): hide breakdown from children unless owner enables sharing"
```

---

## Task 4: Child quota line on Home

**Files:**
- Create: `apps/mobile/src/components/home/ChildQuotaLine.tsx`
- Create: `apps/mobile/src/components/home/ChildQuotaLine.test.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx` — render the line for child profiles
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 locales)

**i18n keys (under `home.learner.quota`):**

```json
{
  "home": {
    "learner": {
      "quota": {
        "line": "{{questionsLeftToday}} questions left today · {{questionsLeftMonth}} left this month",
        "lineDailyOnly": "{{questionsLeftToday}} questions left today",
        "lineUnlimited": "Plenty of questions today"
      }
    }
  }
}
```

The **quota source.** Existing usage data already returns the family aggregate. The child-side line shows aggregate-only — never per-profile breakdown. Source: extend `useDashboard()` payload to include `usage: { dailyRemaining, monthlyRemaining, dailyLimit, monthlyLimit }` if not already present, OR call the existing usage endpoint directly from the child Home component. Verify which is leaner:

```bash
grep -rn 'dailyRemaining\|daily_remaining' apps/api/src apps/mobile/src | head -20
```

Use whichever surface already exists.

- [ ] **Step 1: Failing test**

```tsx
it('shows daily and monthly remaining when both are bounded', () => {
  mockUseChildQuota({ dailyRemaining: 7, monthlyRemaining: 84, dailyLimit: 10, monthlyLimit: 100 });
  render(<ChildQuotaLine />);
  expect(screen.getByText(/7 questions left today.*84 left this month/)).toBeTruthy();
});

it('shows only daily when monthly is unlimited (Plus tier)', () => {
  mockUseChildQuota({ dailyRemaining: 7, monthlyRemaining: null, dailyLimit: 10, monthlyLimit: null });
  render(<ChildQuotaLine />);
  expect(screen.getByText(/7 questions left today/)).toBeTruthy();
  expect(screen.queryByText(/this month/)).toBeNull();
});

it('shows neutral line when no caps apply', () => {
  mockUseChildQuota({ dailyRemaining: null, monthlyRemaining: null });
  render(<ChildQuotaLine />);
  expect(screen.getByText(/Plenty of questions/)).toBeTruthy();
});

it('renders nothing while quota query is loading', () => {
  mockUseChildQuota(undefined); // no data yet
  const { queryByTestId } = render(<ChildQuotaLine />);
  expect(queryByTestId('child-quota-line')).toBeNull();
});
```

- [ ] **Step 2: Implement**

```tsx
// ChildQuotaLine.tsx
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useChildQuota } from '@/hooks/use-child-quota'; // wrapping existing usage endpoint

export function ChildQuotaLine() {
  const { t } = useTranslation();
  const { data } = useChildQuota();
  if (!data) return null;

  const { dailyRemaining, monthlyRemaining } = data;

  if (dailyRemaining == null && monthlyRemaining == null) {
    return (
      <Text testID="child-quota-line" className="text-sm text-muted-foreground">
        {t('home.learner.quota.lineUnlimited')}
      </Text>
    );
  }

  if (monthlyRemaining == null) {
    return (
      <Text testID="child-quota-line" className="text-sm text-muted-foreground">
        {t('home.learner.quota.lineDailyOnly', { questionsLeftToday: dailyRemaining })}
      </Text>
    );
  }

  return (
    <Text testID="child-quota-line" className="text-sm text-muted-foreground">
      {t('home.learner.quota.line', {
        questionsLeftToday: dailyRemaining,
        questionsLeftMonth: monthlyRemaining,
      })}
    </Text>
  );
}
```

- [ ] **Step 3: Mount in `LearnerScreen.tsx`**

Render the line near the top of `LearnerScreen.tsx`. It already renders for any "learner" — for owners-as-learner, the same line appears (acceptable; aggregate quota is also useful for an owner who's currently learning).

```tsx
import { ChildQuotaLine } from './ChildQuotaLine';

// inside the component, near the top of the scroll content:
<ChildQuotaLine />
```

- [ ] **Step 4: Add i18n keys; run; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/ChildQuotaLine.tsx --no-coverage
git add apps/mobile/src/components/home apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add ChildQuotaLine on learner Home"
```

---

## Task 5: Copy register pass — progress hero + growth chart + retention

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.json` (+ 6 locales)
- Modify: `apps/mobile/src/app/(app)/progress/index.tsx` — branch hero copy by register
- Modify: `apps/mobile/src/components/progress/GrowthChart.tsx` — register-aware a11y label

**Strategy.** Add new keys with `child` and `adult` variants for the strings the spec calls out as register-sensitive. Use the existing `useActiveProfileRole()` to choose. Keep the *number* and *card layout* identical — only words change.

**i18n keys to add (under `progress.register`):**

```json
{
  "progress": {
    "register": {
      "child": {
        "weekTitle": "Your week",
        "monthTitle": "Your month",
        "growthTitle": "What you learned",
        "growthSubtitle": "Your weekly wins",
        "masteredTopicsHero": "You learned {{count}} topics. Steady wins.",
        "retentionStrong": "What came back to you this week.",
        "retentionFading": "Worth a quick refresh.",
        "retentionWeak": "Worth coming back to."
      },
      "adult": {
        "weekTitle": "Weekly report",
        "monthTitle": "Monthly report",
        "growthTitle": "Your growth",
        "growthSubtitle": "Weekly changes in topics mastered and vocabulary",
        "masteredTopicsHero": "You've mastered {{count}} topics. Your progress keeps stacking up.",
        "retentionStrong": "Still remembered.",
        "retentionFading": "Getting fuzzy — a quick review will help.",
        "retentionWeak": "Needs a quick refresh."
      }
    }
  }
}
```

(The "adult" copy preserves the current English wording — this is a refactor, not a regression.)

- [ ] **Step 1: Failing test on progress/index.tsx**

```tsx
it('child role sees "Your week" copy on progress', () => {
  mockUseRole.mockReturnValue('child');
  render(<Progress />);
  expect(screen.getByText('Your week')).toBeTruthy();
  expect(screen.queryByText('Weekly report')).toBeNull();
});

it('owner role sees "Weekly report" copy on progress', () => {
  mockUseRole.mockReturnValue('owner');
  render(<Progress />);
  expect(screen.getByText('Weekly report')).toBeTruthy();
  expect(screen.queryByText('Your week')).toBeNull();
});

it('child role does NOT see "growth" or "mastery" wording in growth chart a11y label', () => {
  mockUseRole.mockReturnValue('child');
  render(<GrowthChart data={mockGrowthData} />);
  const label = screen.getByLabelText(/what you learned/i);
  expect(label).toBeTruthy();
});
```

- [ ] **Step 2: Implement register helper**

```ts
// apps/mobile/src/lib/copy-register.ts
export type CopyRegister = 'adult' | 'child';

export function copyRegisterFor(role: 'owner' | 'impersonated-child' | 'child' | null): CopyRegister {
  return role === 'child' ? 'child' : 'adult';
}
```

(`impersonated-child` keeps adult register because the underlying viewer is the parent. The spec's register switch is keyed on "is the actual user a child" — only the `'child'` role.)

- [ ] **Step 3: Branch copy in progress/index.tsx**

```tsx
import { copyRegisterFor } from '@/lib/copy-register';
import { useActiveProfileRole } from '@/hooks/use-active-profile-role';

const role = useActiveProfileRole();
const reg = copyRegisterFor(role); // 'adult' | 'child'

const weekTitle = t(`progress.register.${reg}.weekTitle`);
const growthTitle = t(`progress.register.${reg}.growthTitle`);
// etc.
```

Replace existing references to `progress.growth.title` and similar with the register-keyed lookups.

- [ ] **Step 4: Same for GrowthChart**

```tsx
// inside GrowthChart.tsx, replace static a11y label
const role = useActiveProfileRole();
const reg = copyRegisterFor(role);
const a11y = `${t(`progress.register.${reg}.growthTitle`)}. ${data.deltas.join(', ')}`;
```

(Adjust the actual a11y string to match the existing one; the point is it's now register-sourced.)

- [ ] **Step 5: Same for retention strings in `ReportsListCard.tsx` and `shelf` keys**

Replace each `progress.stats.retention*` and `shelf.bookRetention*` reference with `progress.register.${reg}.retention*`.

- [ ] **Step 6: Run; commit**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress src/components/progress --no-coverage
git add apps/mobile/src/i18n/locales/ apps/mobile/src/app/\(app\)/progress/ apps/mobile/src/components/progress/ apps/mobile/src/lib/copy-register.ts
git commit -m "feat(mobile): register-aware copy on progress, growth chart, retention"
```

---

## Task 6: Audit assertion — Family tab never appears for child role

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx` (existing test for tab visibility)

The current gating is correct, but a regression test ensures a future change doesn't break it.

- [ ] **Step 1: Add the assertion**

```tsx
it('child role never sees Family tab in bottom nav even with family_links present', () => {
  mockUseFamilyPresence.mockReturnValue(true); // simulate misconfiguration
  mockUseActiveProfileRole.mockReturnValue('child');
  render(<TabsLayout />);
  expect(screen.queryByTestId('tab-family')).toBeNull();
});

it('owner with family sees Family tab', () => {
  mockUseFamilyPresence.mockReturnValue(true);
  mockUseActiveProfileRole.mockReturnValue('owner');
  render(<TabsLayout />);
  expect(screen.getByTestId('tab-family')).toBeTruthy();
});
```

- [ ] **Step 2: If the assertion fails, the gate is wrong**

Per the ground truth survey, `useFamilyPresence()` already requires `role === 'owner'`. The assertion is a forward-looking guard.

If it does fail, fix `_layout.tsx`'s `computeVisibleTabs` to additionally check role. Don't accept the failure as "expected behavior."

- [ ] **Step 3: Commit**

```bash
git add 'apps/mobile/src/app/(app)/_layout.test.tsx'
git commit -m "test(mobile): regression guard — child role never sees Family tab"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Cross-package validation**

```bash
pnpm exec nx run-many -t typecheck && pnpm exec nx run-many -t lint && pnpm exec nx run-many -t test
cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage
```

- [ ] **Step 2: Manual smoke**

```bash
cd apps/mobile && pnpm exec expo start --android
```

As a **child profile signed in directly**:

1. Bottom nav: Family tab absent (verify both before and after parent links them — should never appear).
2. More: Subscription action absent. Try opening `/subscription` deep link via the in-app debug deep-link tool — should redirect to Home.
3. Progress: hero copy reads "Your week" / "Your month" / "What you learned." No words "growth," "mastery," "retention" anywhere.
4. Home: see "{N} questions left today · {M} left this month" line.

As an **owner profile**:

5. Bottom nav: Family tab present.
6. Subscription opens normally; per-profile breakdown shows.
7. Progress: hero copy reads "Weekly report" / "Monthly report" / "Your growth" (existing wording preserved).

As an **impersonated-child** (parent acting as child via proxy banner):

8. Same UI as child profile signed in directly *except* progress hero stays adult register (per Task 5 step 2 helper logic — only `role === 'child'` switches register).

- [ ] **Step 3: Push**

```bash
git push -u origin pr-10-child-user-shape
```

---

## Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| `<ParentOnly>` redirect loop | Misconfigured Home redirect | Brief flicker, then Home renders | None — `useEffect` only fires once per role change |
| Quota query loading on Home | Cold start | Quota line absent (returns null) | Renders when query resolves |
| Quota query errors | API down | Quota line absent silently | Existing dashboard error UI handles connectivity |
| Server breakdown gate fails open | Bug in service | Child sees other children's rows | Integration test (Task 3) prevents merge |
| i18n key missing in non-en locale | Translation not yet shipped | Falls back to en value (per react-i18next default) | Acceptable for now per market_language_pivot memory |
| Mixed render — child profile sees parent copy briefly | Role hook still resolving | Default Loader shown by parent screen, no copy leaks | `<ParentOnly>` returns null while role null |

## Spec coverage

- Spec lines 269-272 (what children see — self lens already exists per Phase 1; quota line) → Task 4.
- Spec lines 273-278 (what they don't see — other children's data, breakdown unless shared, no Family tab, no subscription) → Tasks 2, 3, 6.
- Spec lines 279-283 (microcopy register) → Task 5.

## Self-review checklist

- [ ] No `eslint-disable`.
- [ ] No internal mocks in integration tests; mocks in component tests are for hooks (acceptable boundary).
- [ ] `<ParentOnly>` renders null (not children) while role is loading — prevents content flash.
- [ ] Server-side breakdown gate is the source of truth; UI gating is defense-in-depth.
- [ ] `impersonated-child` keeps adult register (parent is the actual viewer).
- [ ] No `parentView.*` keys deleted — they remain for parent contexts.
- [ ] Family tab regression test runs in CI.
- [ ] Subscription deep-link from a child profile redirects to Home, not to a 403 page.
