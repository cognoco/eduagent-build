# Parent Proxy Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a parent (owner profile) to switch into a child's account to browse their library, progress, recaps, and bookmarks — without starting sessions or deleting saved content.

**Architecture:** `isParentProxy` is derived purely from `ProfileContext` (no new API calls). A `useParentProxy` hook provides this boolean and reactively syncs the API client module-level flag and SecureStore. The API adds a shared `assertNotProxyMode(c)` guard returning 403 when `X-Proxy-Mode: true` is present. UI gating (redirects and card filtering) is the primary protection; the server guard is defense-in-depth.

**Server guard scope (per goal: "without starting sessions or deleting saved content"):**
- **Guarded:** all session-creation POST endpoints (interview, sessions, homework, quiz, dictation, retention, assessments) **and** `DELETE /bookmarks/:id` (symmetry with the UI suppression in Task 10).
- **Intentionally NOT guarded:** profile rename (`profiles PATCH`), consent management (`consent PUT`) — these are legitimate parent-initiated actions and remain available in proxy mode.
- **Out of scope for this phase (UI-gated only, not server-guarded):** notes PUT/DELETE, vocabulary DELETE, retention mastery PUT/DELETE, library edits (subjects, books), settings PUT, learner-profile PATCH/DELETE, onboarding PATCH. These are not reachable from the proxy UI surfaces (home/library/progress/recaps/saved bookmarks only), so the UI redirect/filter guards are sufficient for the Phase-1 threat model. A stricter "all-writes-locked" server mode is deferred to a follow-up plan.

**Tech Stack:** React Native / Expo Router, Hono, `react-native-safe-area-context`, Expo SecureStore, Jest / `@testing-library/react-native`

---

## File Map

**New files:**

| File | Purpose |
|---|---|
| `apps/api/src/middleware/proxy-guard.ts` | `assertNotProxyMode` helper — throws 403 when proxy header present |
| `apps/api/src/middleware/proxy-guard.test.ts` | Unit tests for the guard |
| `apps/mobile/src/hooks/use-parent-proxy.ts` | Derives proxy state + reactively syncs `_proxyMode` flag and SecureStore |
| `apps/mobile/src/hooks/use-parent-proxy.test.ts` | Unit tests for the hook |

**Modified files:**

| File | Change |
|---|---|
| `apps/mobile/src/lib/api-client.ts` | Add `_proxyMode`, `setProxyMode()`, inject `X-Proxy-Mode` header in `customFetch` |
| `apps/mobile/src/lib/profile.ts` | Read `parent-proxy-active` from SecureStore on mount to seed API client for app-restart |
| `apps/mobile/src/app/profiles.tsx` | Add confirmation sheet before switching to a child profile |
| `apps/mobile/src/app/(app)/_layout.tsx` | Add persistent proxy banner above `<Tabs>` |
| `apps/mobile/src/app/(app)/session/_layout.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/homework/_layout.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/practice.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/topic/relearn.tsx` | Add proxy redirect guard |
| `apps/mobile/src/app/(app)/progress/saved.tsx` | Suppress delete affordance in proxy mode |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Filter blocked intent cards + show proxy placeholder |
| `apps/api/src/routes/interview.ts` | Guard 3 POST handlers |
| `apps/api/src/routes/sessions.ts` | Guard 2 POST handlers |
| `apps/api/src/routes/homework.ts` | Guard 1 POST handler |
| `apps/api/src/routes/quiz.ts` | Guard 2 POST handlers |
| `apps/api/src/routes/dictation.ts` | Guard 2 POST handlers |
| `apps/api/src/routes/retention.ts` | Guard 2 POST handlers |
| `apps/api/src/routes/assessments.ts` | Guard 1 POST handler |
| `apps/api/src/routes/bookmarks.ts` | Guard 1 DELETE handler (symmetry with UI suppression) |
| `apps/api/src/routes/bookmarks.integration.test.ts` | New integration break-test (proves a real route returns 403) |

---

### Task 1: API proxy guard middleware

**Files:**
- Create: `apps/api/src/middleware/proxy-guard.ts`
- Create: `apps/api/src/middleware/proxy-guard.test.ts`

- [ ] **Step 1.1: Write the failing test**

```typescript
// apps/api/src/middleware/proxy-guard.test.ts
import { Hono } from 'hono';
import { assertNotProxyMode } from './proxy-guard';

function createApp(): InstanceType<typeof Hono> {
  const app = new Hono();
  app.post('/test', (c) => {
    assertNotProxyMode(c);
    return c.json({ ok: true });
  });
  return app;
}

describe('assertNotProxyMode', () => {
  it('throws 403 when X-Proxy-Mode: true', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'true' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Not available in proxy mode');
  });

  it('allows requests without X-Proxy-Mode', async () => {
    const app = createApp();
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows requests with X-Proxy-Mode set to anything other than "true"', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'X-Proxy-Mode': 'false' },
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd apps/api && pnpm exec jest --testPathPattern=proxy-guard --no-coverage
```

Expected: FAIL — `Cannot find module './proxy-guard'`

- [ ] **Step 1.3: Implement the guard**

```typescript
// apps/api/src/middleware/proxy-guard.ts
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

export function assertNotProxyMode(c: Context): void {
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, { message: 'Not available in proxy mode' });
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd apps/api && pnpm exec jest --testPathPattern=proxy-guard --no-coverage
```

Expected: 3 tests PASS

- [ ] **Step 1.5: Typecheck**

```bash
pnpm exec nx run api:typecheck
```

Expected: no errors

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/middleware/proxy-guard.ts apps/api/src/middleware/proxy-guard.test.ts
git commit -m "feat(api): add assertNotProxyMode guard middleware"
```

---

### Task 2: Insert proxy guards into API route handlers

**Files:**
- Modify: `apps/api/src/routes/interview.ts`
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/routes/homework.ts`
- Modify: `apps/api/src/routes/quiz.ts`
- Modify: `apps/api/src/routes/dictation.ts`
- Modify: `apps/api/src/routes/retention.ts`
- Modify: `apps/api/src/routes/assessments.ts`

The pattern is the same for every file: add the import, then call `assertNotProxyMode(c);` as the **first line** inside each listed handler's `async (c) => {` body.

- [ ] **Step 2.1: Guard `interview.ts` (3 handlers)**

Add to imports at the top of `apps/api/src/routes/interview.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside:
- `.post('/subjects/:subjectId/interview', ...)` handler (~line 41)
- `.post('/subjects/:subjectId/interview/stream', ...)` handler (~line 119)
- `.post('/subjects/:subjectId/interview/complete', ...)` handler (~line 245)

- [ ] **Step 2.2: Guard `sessions.ts` (2 handlers)**

Add to imports at the top of `apps/api/src/routes/sessions.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside:
- `.post('/subjects/:subjectId/sessions', ...)` handler (~line 80)
- `.post('/sessions/interleaved', ...)` handler (~line 529)

- [ ] **Step 2.3: Guard `homework.ts` (1 handler)**

Add to imports at the top of `apps/api/src/routes/homework.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside `.post('/subjects/:subjectId/homework', ...)` handler (~line 27).

- [ ] **Step 2.4: Guard `quiz.ts` (2 handlers)**

Add to imports at the top of `apps/api/src/routes/quiz.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside:
- `.post('/quiz/rounds', ...)` handler (~line 231)
- `.post('/quiz/rounds/prefetch', ...)` handler (~line 249)

- [ ] **Step 2.5: Guard `dictation.ts` (2 handlers)**

Add to imports at the top of `apps/api/src/routes/dictation.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside:
- `.post('/dictation/generate', ...)` handler (~line 109)
- `.post('/dictation/result', ...)` handler (~line 128)

- [ ] **Step 2.6: Guard `retention.ts` (2 handlers)**

Add to imports at the top of `apps/api/src/routes/retention.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside:
- `.post('/retention/recall-test', ...)` handler (~line 73)
- `.post('/retention/relearn', ...)` handler (~line 87)

- [ ] **Step 2.7: Guard `assessments.ts` (1 handler)**

Add to imports at the top of `apps/api/src/routes/assessments.ts`:
```typescript
import { assertNotProxyMode } from '../middleware/proxy-guard';
```

Add `assertNotProxyMode(c);` as first line inside `.post('/subjects/:subjectId/topics/:topicId/assessments', ...)` handler (~line 32).

- [ ] **Step 2.8: Typecheck and run API tests**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
```

Expected: no type errors, all existing tests pass

- [ ] **Step 2.9: Commit**

```bash
git add apps/api/src/routes/interview.ts apps/api/src/routes/sessions.ts apps/api/src/routes/homework.ts apps/api/src/routes/quiz.ts apps/api/src/routes/dictation.ts apps/api/src/routes/retention.ts apps/api/src/routes/assessments.ts
git commit -m "feat(api): guard all session-creation endpoints against proxy mode"
```

---

### Task 3: Mobile API client — `_proxyMode` flag and header injection

**Files:**
- Modify: `apps/mobile/src/lib/api-client.ts`

- [ ] **Step 3.1: Add the module-level flag and export**

In `apps/mobile/src/lib/api-client.ts`, after the block that defines `_activeProfileId` and `setActiveProfileId` (~lines 67-72), add:

```typescript
// ---------------------------------------------------------------------------
// Proxy mode flag — set by useParentProxy hook, read by customFetch.
// ---------------------------------------------------------------------------

let _proxyMode = false;

/** Called by useParentProxy hook whenever proxy state changes. */
export function setProxyMode(enabled: boolean): void {
  _proxyMode = enabled;
}
```

- [ ] **Step 3.2: Inject header in customFetch**

In the `customFetch` function inside `useApiClient()`, find the existing X-Profile-Id header line:

```typescript
if (_activeProfileId && !headers.has('X-Profile-Id'))
  headers.set('X-Profile-Id', _activeProfileId);
```

Immediately after it, add:

```typescript
if (_proxyMode) headers.set('X-Proxy-Mode', 'true');
```

- [ ] **Step 3.3: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.4: Commit**

```bash
git add apps/mobile/src/lib/api-client.ts
git commit -m "feat(mobile): add _proxyMode flag and X-Proxy-Mode header injection to API client"
```

---

### Task 4: `useParentProxy` hook

**Files:**
- Create: `apps/mobile/src/hooks/use-parent-proxy.ts`
- Create: `apps/mobile/src/hooks/use-parent-proxy.test.ts`

- [ ] **Step 4.1: Write the failing tests**

```typescript
// apps/mobile/src/hooks/use-parent-proxy.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useParentProxy } from './use-parent-proxy';

jest.mock('../lib/profile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../lib/api-client', () => ({
  setProxyMode: jest.fn(),
}));

jest.mock('../lib/secure-storage', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useProfile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';

const ownerProfile = {
  id: 'owner-1',
  displayName: 'Parent',
  isOwner: true,
  birthYear: 1990,
};

const childProfile = {
  id: 'child-1',
  displayName: 'Kid',
  isOwner: false,
  birthYear: 2015,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useParentProxy', () => {
  it('returns isParentProxy=false when active profile is the owner', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
    });
    const { result } = renderHook(() => useParentProxy());
    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('returns isParentProxy=true when active profile is a non-owner and owner exists', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
    });
    const { result } = renderHook(() => useParentProxy());
    expect(result.current.isParentProxy).toBe(true);
    expect(result.current.childProfile).toEqual(childProfile);
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('calls setProxyMode(true) and writes SecureStore when proxy is active', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
    });
    await act(async () => {
      renderHook(() => useParentProxy());
    });
    expect(setProxyMode).toHaveBeenCalledWith(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'parent-proxy-active',
      'true'
    );
  });

  it('calls setProxyMode(false) and deletes SecureStore when proxy is not active', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
    });
    await act(async () => {
      renderHook(() => useParentProxy());
    });
    expect(setProxyMode).toHaveBeenCalledWith(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'parent-proxy-active'
    );
  });

  it('returns isParentProxy=false for a solo owner account with no children', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile],
      activeProfile: ownerProfile,
    });
    const { result } = renderHook(() => useParentProxy());
    expect(result.current.isParentProxy).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-parent-proxy.ts --no-coverage
```

Expected: FAIL — `Cannot find module './use-parent-proxy'`

- [ ] **Step 4.3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-parent-proxy.ts
import { useEffect, useMemo } from 'react';
import { useProfile } from '../lib/profile';
import type { Profile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';

export interface ParentProxyState {
  isParentProxy: boolean;
  childProfile: Profile | null;
  parentProfile: Profile | null;
}

export function useParentProxy(): ParentProxyState {
  const { profiles, activeProfile } = useProfile();

  const isParentProxy =
    !activeProfile?.isOwner && profiles.some((p) => p.isOwner);

  const parentProfile = useMemo(
    () => profiles.find((p) => p.isOwner) ?? null,
    [profiles]
  );

  const childProfile = isParentProxy ? activeProfile : null;

  useEffect(() => {
    setProxyMode(isParentProxy);
    if (isParentProxy) {
      void SecureStore.setItemAsync('parent-proxy-active', 'true');
    } else {
      void SecureStore.deleteItemAsync('parent-proxy-active');
    }
  }, [isParentProxy]);

  return { isParentProxy, childProfile, parentProfile };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-parent-proxy.ts --no-coverage
```

Expected: 5 tests PASS

- [ ] **Step 4.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 4.6: Commit**

```bash
git add apps/mobile/src/hooks/use-parent-proxy.ts apps/mobile/src/hooks/use-parent-proxy.test.ts
git commit -m "feat(mobile): add useParentProxy hook with reactive SecureStore and API client sync"
```

---

### Task 5: ProfileProvider — SecureStore seed on app restart

**Files:**
- Modify: `apps/mobile/src/lib/profile.ts`

- [ ] **Step 5.1: Update the import to include `setProxyMode`**

In `apps/mobile/src/lib/profile.ts`, find the existing import from `./api-client`:

```typescript
import {
  useApiClient,
  setActiveProfileId as pushProfileIdToApiClient,
} from './api-client';
```

Replace it with:

```typescript
import {
  useApiClient,
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
```

- [ ] **Step 5.2: Add the startup SecureStore read**

Inside `ProfileProvider`, after the existing `useEffect` that restores `ACTIVE_PROFILE_KEY` from SecureStore (~lines 108-122), add a new effect:

```typescript
// Seed the API client proxy flag from SecureStore on app restart.
// The reactive sync in useParentProxy corrects stale state once profiles load,
// but this ensures the first API request (the profile list fetch) already
// carries the correct header if proxy mode was active in the previous session.
useEffect(() => {
  void SecureStore.getItemAsync('parent-proxy-active').then((val) => {
    setProxyMode(val === 'true');
  });
}, []);
```

- [ ] **Step 5.3: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 5.4: Commit**

```bash
git add apps/mobile/src/lib/profile.ts
git commit -m "feat(mobile): seed proxy mode flag from SecureStore on ProfileProvider mount"
```

---

### Task 6: `profiles.tsx` — Confirmation sheet before child switch

**Files:**
- Modify: `apps/mobile/src/app/profiles.tsx`

- [ ] **Step 6.1: Add pending state**

In `apps/mobile/src/app/profiles.tsx`, after the existing `useState` declarations (~line 33), add:

```typescript
const [pendingChildId, setPendingChildId] = useState<string | null>(null);
const [pendingChildName, setPendingChildName] = useState('');
```

- [ ] **Step 6.2: Add tap handler and confirm/cancel handlers**

After the existing `handleSwitch` function (~line 157), add:

```typescript
const handleProfileTap = (profile: (typeof profiles)[0]) => {
  // Parent → child: show confirmation sheet first
  if (activeProfile?.isOwner && !profile.isOwner) {
    setPendingChildName(profile.displayName);
    setPendingChildId(profile.id);
    return;
  }
  // Child → parent, child → child: switch immediately
  void handleSwitch(profile.id);
};

const handleConfirmProxySwitch = () => {
  if (!pendingChildId) return;
  const id = pendingChildId;
  setPendingChildId(null);
  void handleSwitch(id);
};

const handleCancelProxySwitch = () => {
  setPendingChildId(null);
};
```

- [ ] **Step 6.3: Wire the tap handler to profile rows**

In the `profiles.map` render block, find the `<Pressable>` for each profile row that currently calls `handleSwitch`. It will look like:

```tsx
onPress={() => handleSwitch(profile.id)}
```

Change it to:

```tsx
onPress={() => handleProfileTap(profile)}
```

- [ ] **Step 6.4: Add the confirmation Modal**

At the bottom of the main `return (...)` block, before the closing `</View>`, add (note: `Modal` and `insets` are already available in this file):

```tsx
<Modal
  visible={pendingChildId !== null}
  transparent
  animationType="fade"
  onRequestClose={handleCancelProxySwitch}
  testID="proxy-confirm-modal"
>
  <View className="flex-1 justify-end bg-black/50">
    <View
      className="bg-surface rounded-t-2xl px-6 pt-6"
      style={{ paddingBottom: Math.max(insets.bottom + 16, 32) }}
    >
      <Text className="text-h2 font-bold text-text-primary mb-3">
        Viewing {pendingChildName}'s account
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        You'll see their library, progress, recaps and saved bookmarks. Chats
        are private to {pendingChildName}.
      </Text>
      <Pressable
        onPress={handleConfirmProxySwitch}
        className="bg-primary rounded-button py-3.5 items-center mb-3"
        accessibilityRole="button"
        accessibilityLabel={`View ${pendingChildName}'s account`}
        testID="proxy-confirm-view"
      >
        <Text className="text-body font-semibold text-text-inverse">
          View account
        </Text>
      </Pressable>
      <Pressable
        onPress={handleCancelProxySwitch}
        className="py-3.5 items-center"
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        testID="proxy-confirm-cancel"
      >
        <Text className="text-body text-text-secondary">Cancel</Text>
      </Pressable>
    </View>
  </View>
</Modal>
```

- [ ] **Step 6.5: Typecheck and run related tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/profiles.tsx --no-coverage
```

Expected: no type errors, all existing tests pass

- [ ] **Step 6.6: Commit**

```bash
git add apps/mobile/src/app/profiles.tsx
git commit -m "feat(mobile): show confirmation sheet before parent switches into child profile"
```

---

### Task 7: Persistent proxy banner in `_layout.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`

- [ ] **Step 7.1: Add the import**

In `apps/mobile/src/app/(app)/_layout.tsx`, add with the existing hook imports near the top:

```typescript
import { useParentProxy } from '../../hooks/use-parent-proxy';
```

- [ ] **Step 7.2: Add the `ProxyBanner` component**

After the `TabIcon` component definition (~line 84), add:

```typescript
function ProxyBanner({
  childName,
  onSwitchBack,
}: {
  childName: string;
  onSwitchBack: () => void;
}): React.ReactElement {
  return (
    <View
      className="flex-row items-center justify-between px-4 bg-surface-elevated border-b border-border"
      style={{ height: 44 }}
      testID="proxy-banner"
    >
      <Text
        className="text-body-sm text-text-secondary flex-1"
        numberOfLines={1}
      >
        {'👁'} Viewing {childName}'s account
      </Text>
      <Pressable
        onPress={onSwitchBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Switch back to your account"
        testID="proxy-banner-switch-back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          Switch back
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 7.3: Call the hook in `AppLayout`**

In the main layout component's function body, add the hook call alongside the other hook calls near the top:

```typescript
const { isParentProxy, childProfile, parentProfile } = useParentProxy();
```

Verify that `switchProfile` is already destructured from `useProfile()` in this file (it is, via the consent gate switch button).

- [ ] **Step 7.4: Render the banner**

In the final `return (...)` block, find:

```tsx
return (
  <FeedbackProvider>
    <View style={[{ flex: 1 }, tokenVars]}>
      <Tabs
```

Insert the banner between `<View style={[{ flex: 1 }, tokenVars]}>` and `<Tabs`:

```tsx
return (
  <FeedbackProvider>
    <View style={[{ flex: 1 }, tokenVars]}>
      {isParentProxy && parentProfile && (
        <ProxyBanner
          childName={childProfile?.displayName ?? ''}
          onSwitchBack={() => void switchProfile(parentProfile.id)}
        />
      )}
      <Tabs
```

- [ ] **Step 7.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 7.6: Commit**

```bash
git add "apps/mobile/src/app/(app)/_layout.tsx"
git commit -m "feat(mobile): add persistent proxy banner above tab bar when viewing child account"
```

---

### Task 8: Screen redirect guards (7 files)

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/homework/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/dictation/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- Modify: `apps/mobile/src/app/(app)/practice.tsx`
- Modify: `apps/mobile/src/app/(app)/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(app)/topic/relearn.tsx`

- [ ] **Step 8.1: Guard `session/_layout.tsx`**

Replace the entire file content with:

```typescript
import { Stack, Redirect } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useParentProxy } from '../../../hooks/use-parent-proxy';

export default function SessionLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const { isParentProxy } = useParentProxy();
  if (isParentProxy) return <Redirect href="/(app)/home" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
```

- [ ] **Step 8.2: Guard `homework/_layout.tsx`**

Replace the entire file content with:

```typescript
import { Stack, Redirect } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useParentProxy } from '../../../hooks/use-parent-proxy';

export default function HomeworkLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const { isParentProxy } = useParentProxy();
  if (isParentProxy) return <Redirect href="/(app)/home" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
```

- [ ] **Step 8.3: Guard `dictation/_layout.tsx`**

In `apps/mobile/src/app/(app)/dictation/_layout.tsx`, add to the existing imports:

```typescript
import { Redirect } from 'expo-router';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
```

In the `DictationLayout` default export function body, add as the very first lines:

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

- [ ] **Step 8.4: Guard `quiz/_layout.tsx`**

In `apps/mobile/src/app/(app)/quiz/_layout.tsx`, add to the existing imports:

```typescript
import { Redirect } from 'expo-router';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
```

In the `QuizLayout` default export function body, add before the `return <QuizFlowProvider>`:

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

- [ ] **Step 8.5: Guard `practice.tsx`**

In `apps/mobile/src/app/(app)/practice.tsx`, add to the existing imports:

```typescript
import { Redirect } from 'expo-router';
import { useParentProxy } from '../../hooks/use-parent-proxy';
```

In the default export function body, add as the first hook call:

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

- [ ] **Step 8.6: Guard `mentor-memory.tsx`**

In `apps/mobile/src/app/(app)/mentor-memory.tsx`, add to the existing imports:

```typescript
import { Redirect } from 'expo-router';
import { useParentProxy } from '../../hooks/use-parent-proxy';
```

In the default export function body, add early (after existing hook calls):

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

- [ ] **Step 8.7: Guard `topic/relearn.tsx`**

In `apps/mobile/src/app/(app)/topic/relearn.tsx`, add to the existing imports:

```typescript
import { Redirect } from 'expo-router';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
```

In the default export function body, add early (after existing hook calls):

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

- [ ] **Step 8.8: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 8.9: Commit**

```bash
git add \
  "apps/mobile/src/app/(app)/session/_layout.tsx" \
  "apps/mobile/src/app/(app)/homework/_layout.tsx" \
  "apps/mobile/src/app/(app)/dictation/_layout.tsx" \
  "apps/mobile/src/app/(app)/quiz/_layout.tsx" \
  "apps/mobile/src/app/(app)/practice.tsx" \
  "apps/mobile/src/app/(app)/mentor-memory.tsx" \
  ":(literal)apps/mobile/src/app/(app)/topic/relearn.tsx"
git commit -m "feat(mobile): add proxy mode redirect guards to all session-creating routes"
```

---

### Task 9: LearnerScreen — filter blocked intent cards

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`

- [ ] **Step 9.1: Derive `isParentProxy` from existing props**

In `apps/mobile/src/components/home/LearnerScreen.tsx`, `LearnerScreen` already receives `profiles` and `activeProfile` as props. At the top of the function body (after the existing hook calls), add:

```typescript
const isParentProxy =
  !activeProfile?.isOwner && profiles.some((p) => p.isOwner);
```

No new hook call needed — `useParentProxy` has SecureStore side effects that belong in the layout, not a child component. Deriving inline from existing props is sufficient.

- [ ] **Step 9.2: Wrap dynamic intent-continue block**

In the `intentCards` useMemo, find the `if (recoveryMarker) { ... } else if (continueSuggestion) { ... } else if (reviewSummary ...) { ... }` block.

Wrap the entire block in `if (!isParentProxy) { ... }`:

```typescript
if (!isParentProxy) {
  if (recoveryMarker) {
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `${recoveryMarker.subjectName ?? 'Session'} · resume`,
      icon: 'play-circle-outline',
      variant: 'highlight',
      onPress: () => {
        void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
          console.error(
            '[LearnerScreen] clearSessionRecoveryMarker failed:',
            err
          )
        );
        router.push({
          pathname: '/(app)/session',
          params: {
            sessionId: recoveryMarker.sessionId,
            ...(recoveryMarker.subjectId && {
              subjectId: recoveryMarker.subjectId,
            }),
            ...(recoveryMarker.subjectName && {
              subjectName: recoveryMarker.subjectName,
            }),
            ...(recoveryMarker.mode && { mode: recoveryMarker.mode }),
            ...(recoveryMarker.topicId && {
              topicId: recoveryMarker.topicId,
            }),
            ...(recoveryMarker.topicName && {
              topicName: recoveryMarker.topicName,
            }),
          },
        } as never);
      },
    });
  } else if (continueSuggestion) {
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `Pick up ${continueSuggestion.topicTitle}`,
      icon: 'play-circle-outline',
      onPress: () =>
        router.push({
          pathname: '/(app)/session',
          params: {
            ...(continueSuggestion.lastSessionId && {
              sessionId: continueSuggestion.lastSessionId,
            }),
            subjectId: continueSuggestion.subjectId,
            subjectName: continueSuggestion.subjectName,
            topicId: continueSuggestion.topicId,
            topicName: continueSuggestion.topicTitle,
            mode: 'learning',
          },
        } as never),
    });
  } else if (
    reviewSummary &&
    reviewSummary.totalOverdue > 0 &&
    reviewSummary.nextReviewTopic
  ) {
    cards.push({
      testID: 'intent-continue',
      title: 'Continue',
      subtitle: `${reviewSummary.nextReviewTopic.subjectName} · ${
        reviewSummary.totalOverdue
      } topic${reviewSummary.totalOverdue === 1 ? '' : 's'} to review`,
      icon: 'play-circle-outline',
      onPress: () =>
        router.push({
          pathname: '/(app)/topic/relearn',
          params: {
            topicId: reviewSummary.nextReviewTopic?.topicId,
            subjectId: reviewSummary.nextReviewTopic?.subjectId,
            topicName: reviewSummary.nextReviewTopic?.topicTitle,
          },
        } as never),
    });
  }
}
```

- [ ] **Step 9.3: Wrap quiz discovery card**

Find the existing `if (quizDiscovery && dismissedQuizDiscoveryId !== quizDiscovery.id)` block and add `!isParentProxy &&` to the condition:

```typescript
if (
  !isParentProxy &&
  quizDiscovery &&
  dismissedQuizDiscoveryId !== quizDiscovery.id
) {
  cards.push({ /* unchanged quiz discovery card */ });
}
```

- [ ] **Step 9.4: Filter static session cards and add placeholder**

Replace the existing static cards push (the one pushing `intent-learn`, `intent-ask`, `intent-practice`, `intent-homework`) with:

```typescript
cards.push({
  testID: 'intent-learn',
  title: 'Learn',
  subtitle: 'Start a new subject or pick one',
  icon: 'book-outline',
  onPress: () => router.push('/create-subject' as never),
});

if (!isParentProxy) {
  cards.push(
    {
      testID: 'intent-ask',
      title: 'Ask',
      subtitle: 'Get answers to any question',
      icon: 'chatbubble-ellipses-outline',
      onPress: () => router.push('/(app)/session?mode=freeform' as never),
    },
    {
      testID: 'intent-practice',
      title: 'Practice',
      subtitle: 'Games and reviews to sharpen what you know',
      icon: 'game-controller-outline',
      onPress: () => router.push('/(app)/practice' as never),
    },
    {
      testID: 'intent-homework',
      title: 'Homework',
      subtitle: 'Snap a photo, get help',
      icon: 'camera-outline',
      onPress: () => router.push('/(app)/homework/camera' as never),
    }
  );
}

if (isParentProxy) {
  cards.push({
    testID: 'intent-proxy-placeholder',
    title: `Sessions are private to ${
      activeProfile?.displayName ?? 'this learner'
    }`,
    subtitle: undefined,
    icon: 'lock-closed-outline' as const,
    variant: undefined,
    onPress: () => {},
  });
}

return cards;
```

- [ ] **Step 9.5: Add `isParentProxy` to useMemo deps**

In the `useMemo` dependency array, add `isParentProxy`:

```typescript
  }, [
    activeProfile?.id,
    continueSuggestion,
    dismissedQuizDiscoveryId,
    isParentProxy,
    markQuizDiscoveryHandled,
    quizDiscovery,
    recoveryMarker,
    reviewSummary,
    router,
  ]);
```

- [ ] **Step 9.6: Typecheck and run related tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage
```

Expected: no type errors, existing tests pass

- [ ] **Step 9.7: Commit**

```bash
git add apps/mobile/src/components/home/LearnerScreen.tsx
git commit -m "feat(mobile): filter session intent cards and show placeholder in parent proxy mode"
```

---

### Task 10: Bookmark delete suppression

**Files:**
- Modify: `apps/mobile/src/app/(app)/progress/saved.tsx`

- [ ] **Step 10.1: Add import**

In `apps/mobile/src/app/(app)/progress/saved.tsx`, add with the existing imports:

```typescript
import { useParentProxy } from '../../../hooks/use-parent-proxy';
```

- [ ] **Step 10.2: Add `isParentProxy` prop to `BookmarkRow`**

Update the `BookmarkRow` props interface:

```typescript
function BookmarkRow({
  bookmark,
  onDelete,
  isParentProxy,
}: {
  bookmark: Bookmark;
  onDelete: (bookmark: Bookmark) => void;
  isParentProxy: boolean;
}) {
```

- [ ] **Step 10.3: Conditionally render the trash icon**

Inside `BookmarkRow`, find the trash icon `<Pressable>` block (~lines 57-69) and wrap it in a conditional:

```tsx
{!isParentProxy && (
  <Pressable
    onPress={() => onDelete(bookmark)}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel="Remove bookmark"
    testID={`bookmark-delete-${bookmark.id}`}
  >
    <Ionicons
      name="trash-outline"
      size={18}
      className="text-text-tertiary"
    />
  </Pressable>
)}
```

- [ ] **Step 10.4: Call the hook and pass down the prop**

In `SavedBookmarksScreen`, add the hook call:

```typescript
const { isParentProxy } = useParentProxy();
```

Find where `<BookmarkRow>` is rendered (in the FlatList `renderItem`) and pass the new prop:

```tsx
<BookmarkRow
  bookmark={item}
  onDelete={handleDelete}
  isParentProxy={isParentProxy}
/>
```

- [ ] **Step 10.5: Typecheck and run related tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/progress/saved.tsx" --no-coverage
```

Expected: no type errors, existing tests pass

- [ ] **Step 10.6: Final full checks**

```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
```

Expected: all pass

- [ ] **Step 10.7: Commit**

```bash
git add "apps/mobile/src/app/(app)/progress/saved.tsx"
git commit -m "feat(mobile): suppress bookmark delete affordance in parent proxy mode"
```

---

## Self-Review

### Spec Coverage

| Spec section | Task(s) |
|---|---|
| §1 `useParentProxy` hook + reactive sync | Task 4 |
| §1 API client `_proxyMode` flag + header | Task 3 |
| §1 App-restart SecureStore seed | Task 5 |
| §2 Confirmation sheet before child switch | Task 6 |
| §2 Switch-back (no confirmation, immediate) | Task 6 — `handleProfileTap` routes child→parent directly to `handleSwitch` |
| §2 Child-to-child switching (no confirmation) | Task 6 — same `handleProfileTap` routing table |
| §3 Persistent proxy banner | Task 7 |
| §4 Redirect guards (7 routes) | Task 8 |
| §4 Home screen card filtering + placeholder | Task 9 |
| §5 `assertNotProxyMode` middleware | Task 1 |
| §5 All 13 creation endpoints guarded | Task 2 |
| §6 Bookmarks visible, delete suppressed | Task 10 |
| §7 All failure modes | Covered across Tasks 4, 5, 6, 7, 8 |

No gaps found.

### Type Consistency

- `useParentProxy()` returns `{ isParentProxy: boolean, childProfile: Profile | null, parentProfile: Profile | null }` — defined in Task 4, used in Tasks 6, 7, 8, 10.
- `setProxyMode(enabled: boolean)` exported from `api-client.ts` in Task 3, imported in Tasks 4 and 5.
- `assertNotProxyMode(c: Context)` exported from `proxy-guard.ts` in Task 1, imported in Task 2.
- `isParentProxy` added to `intentCards` useMemo deps in Task 9.5.
- `isParentProxy: boolean` prop added to `BookmarkRow` in Task 10.2 and passed in Task 10.4.

All function names and signatures are consistent throughout.
