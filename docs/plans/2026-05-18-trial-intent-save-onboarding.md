# Trial Intent Save Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commit policy reminder (CLAUDE.md):** Subagents NEVER commit, with one explicit exception — the `/commit` skill is the authorized commit path. Every `Commit via /commit` step below is OK to invoke inside a subagent because `/commit` runs as an authorized `context: fork` subagent. Do not use bare `git add/commit/push`.

**Spec:** `docs/specs/2026-05-18-trial-intent-save-onboarding.md`

**Goal:** Add an "intent first, identity later" pre-signup preview flow plus a post-signup save wizard that creates the correct profile shape (self / child / both) and lands the user on the right home surface.

**Architecture:** A handful of signed-out `preview/*` routes capture intent + topic into a local state module (`preview-onboarding-state.ts`). The low-risk first slice uses a deterministic/scripted preview lesson and imports only the topic after signup. A later server-backed preview lesson API (public start/messages, authenticated claim) can run the demo through `routeAndCall`, but only behind an explicit disabled-by-default feature flag after Cloudflare rate limits, hard turn caps, and preview observability are verified. After Clerk signup, `(app)/_layout.tsx` detects preview state and routes the no-profile user to a save wizard (instead of `CreateProfileGate`) that picks a save target, creates owner-then-child profiles via the existing `POST /v1/profiles`, optionally calls `POST /v1/preview-onboarding/:id/claim` when a server preview exists, attaches the topic as a subject via `createSubjectWithStructure`, and lands on the existing learner or parent home.

**Tech Stack:** Expo Router, React Native, Clerk, Hono, Drizzle, Zod, TanStack Query, Jest + React Testing Library, Maestro (E2E).

**Scope:** This plan covers Phase 1 (Routing & Wizard Shell) + Phase 1.5 (scripted preview fallback) as the first shippable slice, then Phase 2 (server-backed Preview Lesson Engine) as a gated follow-up. Phase 3 (separate-device child link) is deferred per spec — "Out of Scope" already gates V1 to on-device child creation. Phase 4 (Parent Home clarity pass) is conditional and tracked separately if testing reveals overwhelm.

**Spec deltas the plan locks in:**
- **[MEDIUM-4]** Spec section "Wizard – Profile basics" says "Display name + birth date"; `profileCreateSchema` (`packages/schemas/src/profiles.ts:46`) accepts only `birthYear`. The plan collects `birthYear` and the spec should be updated to match — no API change.
- **[MEDIUM-7]** Spec defers voice for preview ("text-first for v1", spec line 238). CLAUDE.md `feedback_voice_is_critical.md` says voice is critical because kids don't type. This plan inherits the text-only deferral — the preview is therefore aimed at the self-serve typing adult persona, NOT the mom-in-kitchen / younger-kid personas the rest of the app accommodates. Document this trade-off in the spec before shipping; if voice is required for v1, this plan grows materially.

---

## Risk-Reduction Strategy

The plan deliberately separates "does the new front door work?" from "can we safely expose a public LLM endpoint?"

### Required PR slices

| Slice | Ships | Does not ship | Why this reduces risk |
| --- | --- | --- | --- |
| A. Front door + save wizard | Intent fork, parent preview, scripted learner preview, signup handoff, save target, profile creation, correct landing | Public LLM route, preview DB table, claim transcript import | Proves routing/auth/profile logic without opening a cost or abuse surface. |
| B. Topic import after signup | Authenticated topic-to-subject import from saved preview state | Public messages endpoint | Lets the "save what I tried" promise work even if LLM preview stays off. |
| C. Server-backed preview | Public preview start/messages, DB-backed transcript, authenticated claim | Default-on production rollout | Adds the riskiest part only after rate limits, caps, and observability are green. |

### Stop gates before Slice C

Do not enable server-backed preview lessons in production until all are true:

- Cloudflare `ratelimit` bindings exist for start and message endpoints in staging and production.
- Public route prefix is separate from authenticated claim prefix.
- Turn caps are enforced by atomic DB update, not read-then-write.
- Preview LLM calls use `routeAndCall()` through the LLM router and have eval snapshots.
- Public preview metrics exist for `started`, `message_sent`, `rate_limited`, `cap_reached`, `signup_clicked`, `claim_succeeded`, and `claim_failed`.
- Hosted/staging smoke proves the public endpoints fail closed when the rate-limit binding is missing.
- Feature flag/config keeps server-backed preview disabled by default in production.

### Feature flag rule

Add a typed API config flag, for example `PREVIEW_ONBOARDING_LLM_ENABLED`, defaulting to `false` in production. When false, mobile must still provide the scripted preview and post-signup save wizard; the plan must not depend on a public preview session id existing.

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `apps/mobile/src/lib/preview-onboarding-state.ts` | TTL-bounded local store for intent / path / topic / previewId / bothPriority / preferredSaveTarget. SecureStore-safe key. |
| `apps/mobile/src/lib/preview-onboarding-state.test.ts` | Saves, restores, expires, clears state. |
| `apps/mobile/src/app/preview/_layout.tsx` | Stack layout for pre-auth preview routes. No tab bar. |
| `apps/mobile/src/app/preview/index.tsx` | Landing CTA: "Try a quick lesson" → `/preview/intent`. |
| `apps/mobile/src/app/preview/intent.tsx` | Pre-signup intent question (Me / My child / Both / Not sure). |
| `apps/mobile/src/app/preview/intent.test.tsx` | Each intent routes to correct path. |
| `apps/mobile/src/app/preview/topic.tsx` | Topic input ("What should we help with?"). |
| `apps/mobile/src/app/preview/lesson.tsx` | Full-screen constrained preview lesson chat. |
| `apps/mobile/src/app/preview/lesson.test.tsx` | No tab bar, counter visible, save CTA at cap, no upload/profile/library controls. |
| `apps/mobile/src/app/preview/parent.tsx` | Parent-oriented setup preview with sample insight. |
| `apps/mobile/src/app/preview/parent.test.tsx` | Parent intent shows parent preview, learner chat not default CTA. |
| `apps/mobile/src/app/preview/both.tsx` | "What do you want to set up first?" branching screen. |
| `apps/mobile/src/app/preview/not-sure.tsx` | Low-commitment choice screen. |
| `apps/mobile/src/app/(app)/_lib/preview-save-gate.tsx` | Wrapper component + TanStack hook for the no-profile-with-preview-state gate; one-shot `router.replace('/(app)/preview/save')`. |
| `apps/mobile/src/app/(app)/preview/_layout.tsx` | Stack layout for post-auth save wizard (no tab bar). |
| `apps/mobile/src/app/(app)/preview/save.tsx` | Save target step (My learning / My child's / Both). |
| `apps/mobile/src/app/(app)/preview/save.test.tsx` | Save target overrides pre-signup intent; child target creates parent then child; both offers add-child-now/later. |
| `apps/mobile/src/app/(app)/preview/profile-basics.tsx` | Display name + birth date (self) or parent-then-child (child target). |
| `apps/mobile/src/app/(app)/preview/preferences.tsx` | Session style + length. |
| `apps/mobile/src/app/(app)/preview/confirmation.tsx` | Plan summary + landing CTA. Calls preview claim. |
| `packages/schemas/src/preview-onboarding.ts` | Zod schemas: intent, message, claim, response envelopes. |
| `packages/schemas/src/preview-onboarding.test.ts` | Schema round-trip tests. |
| `apps/api/src/utils/rate-limit.ts` | Thin Cloudflare `ratelimit` binding wrapper. No module-level or in-memory limiter. |
| `apps/api/src/utils/rate-limit.test.ts` | Allows when binding accepts; throws typed `RateLimitedError` when binding rejects or is unavailable. |
| `apps/api/src/routes/preview-onboarding-public.ts` | Public start + messages routes. |
| `apps/api/src/routes/preview-onboarding-public.integration.test.ts` | Start accepts valid intent/topic; messages enforce 5/5 cap; messages reject uploads; rate limit rejects abuse. |
| `apps/api/src/routes/preview-onboarding-authenticated.ts` | Authenticated claim route. |
| `apps/api/src/routes/preview-onboarding-authenticated.integration.test.ts` | Claim requires auth; rejects expired; idempotent; verifies profile ownership / parent-child link; restricted consent defers transcript. |
| `apps/api/src/services/preview-onboarding.ts` | Service: start, addMessage, claim. Uses `routeAndCall`, `createSubjectWithStructure`. |
| `apps/api/src/services/preview-onboarding.test.ts` | Service-level unit tests for cap, claim idempotency, consent gating. |
| `apps/api/src/services/preview-onboarding-events.ts` | `safeSend()` wrappers for preview funnel and claim-failure events. |
| `apps/api/src/services/preview-onboarding-events.test.ts` | Verifies event emission failures are non-blocking and structured. |
| `apps/api/src/db/schema/preview-onboarding.ts` | Drizzle table for preview sessions (id, intent, path, topic, transcript jsonb, counts, createdAt, expiresAt, claimedAt, claimedByAccountId). |
| `apps/api/drizzle/<timestamp>_preview_onboarding.sql` | Migration for the new table. |

### Modified files

| Path | Reason |
| --- | --- |
| `apps/mobile/src/lib/sign-out-cleanup.ts` | Add preview state key to cleanup registry. |
| `apps/mobile/src/lib/feature-flags.ts` | Add mobile helper for whether server-backed preview is enabled; default false. |
| `apps/mobile/src/lib/pending-auth-redirect.ts` | No code change required — existing API used. (Verify TTL covers preview signup flow; bump from 5 min to 30 min if needed.) |
| `apps/mobile/src/app/(auth)/_layout.tsx` | No code change required — existing redirect works. Verify in Task 6. |
| `apps/mobile/src/app/(auth)/sign-up.tsx` | No change unless preview entrypoint links here directly; mostly invoked through router push. |
| `apps/mobile/src/app/(app)/_layout.tsx` | `CreateProfileGate`: if `peekPreviewOnboardingState()` returns fresh state and `!activeProfile`, render save wizard route instead of generic create-profile gate. |
| `apps/mobile/src/app/create-profile.tsx` | No change. Save wizard composes existing profile creation patterns; the generic gate remains for non-preview flows. |
| `apps/api/src/middleware/auth.ts` | Add `'/v1/preview-onboarding-public/'` to `PUBLIC_PATHS`. Keep authenticated claim under separate `'/v1/preview-onboarding/'` prefix (not in PUBLIC_PATHS). |
| `apps/api/src/config.ts` | Add typed `PREVIEW_ONBOARDING_LLM_ENABLED` config; no raw `process.env` reads in services/routes. |
| `apps/api/src/index.ts` | Register both new route groups. |
| `apps/api/src/db/schema/index.ts` | Re-export new preview-onboarding table. |
| `packages/schemas/src/index.ts` | Re-export `preview-onboarding` schemas. |
| `apps/mobile/src/components/session/ChatShell.tsx` | No code change. Preview lesson uses a slimmed adapter; do not modify shared shell. |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | No change in Phase 1+2. Phase 4 only. |
| `apps/mobile/src/app/(app)/session/index.tsx` | No change. Real session creation happens via claim → existing session creation paths post-claim. |

### Deferred (NOT in this plan)

- `apps/api/src/routes/profiles.ts`, `apps/api/src/services/profile.ts` — no API change needed; spec lists them as reuse targets, not modify targets.
- `apps/api/src/routes/subjects.ts`, `apps/api/src/services/subject.ts` — reuse only; claim calls `createSubjectWithStructure` directly.
- `packages/schemas/src/profiles.ts`, `packages/schemas/src/subjects.ts` — reuse only.

---

## Conventions Referenced

- Auth-public path matching: `apps/api/src/middleware/auth.ts:33-58` — trailing `/` = prefix, no trailing `/` = exact or `+separator`.
- Route registration: `apps/api/src/index.ts:209-252` — `.route('/', <group>)` chained.
- Route response pattern: `{ <singularType>: <schema> }`, 201 on create.
- Error envelope: throw typed errors (`ForbiddenError`, `NotFoundError`, `RateLimitedError`, `BadRequestError`); global handler in `index.ts:264-428` maps to HTTP.
- Profile creation: `createProfileWithLimitCheck(db, accountId, input)` in `apps/api/src/services/profile.ts:253-317`; second arg `parentProfileId` when creating a child (consent flow handled inside).
- Subject creation: `createSubjectWithStructure(db, profileId, input)` where `input` matches `subjectCreateSchema`.
- LLM calls: `routeAndCall(messages, rung, options?)` from `apps/api/src/services/llm/router.ts:581`. Never call provider SDK directly.
- Sign-out cleanup: add a factory to `PER_PROFILE_KEYS` (per-profile) or to the global keys list (account-wide) in `apps/mobile/src/lib/sign-out-cleanup.ts:31`.
- Preview state secure-store key uses Expo-safe chars only: letters, numbers, `.`, `-`, `_`.
- Co-located tests (`*.test.ts`/`*.test.tsx`/`*.integration.test.ts`). No `__tests__/` folders. No internal `jest.mock()` per GC1 (use `jest.requireActual()` with overrides).
- After fixing data, mobile cache updates: `queryClient.setQueriesData()` then invalidate `'profiles'` (see `create-profile.tsx:175`).
- Commit through `/commit` skill — never `git add` directly inside this plan.

---

## Phase 1: Routing And Wizard Shell

### Task 1: Preview onboarding state module

**Files:**
- Create: `apps/mobile/src/lib/preview-onboarding-state.ts`
- Test: `apps/mobile/src/lib/preview-onboarding-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/preview-onboarding-state.test.ts
import {
  savePreviewOnboardingState,
  peekPreviewOnboardingState,
  clearPreviewOnboardingState,
  PREVIEW_ONBOARDING_STORAGE_KEY,
} from './preview-onboarding-state';

const mockStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStorage.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockStorage.delete(k); }),
}));

describe('preview-onboarding-state', () => {
  beforeEach(() => { mockStorage.clear(); });

  it('uses an Expo-safe key', () => {
    expect(PREVIEW_ONBOARDING_STORAGE_KEY).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('saves and restores state', async () => {
    await savePreviewOnboardingState({
      intent: 'self',
      path: 'learner_lesson',
      topicText: 'fractions',
    });
    const got = await peekPreviewOnboardingState();
    expect(got?.intent).toBe('self');
    expect(got?.topicText).toBe('fractions');
    expect(got?.createdAt).toBeDefined();
  });

  it('expires after 24 hours', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockStorage.set(
      PREVIEW_ONBOARDING_STORAGE_KEY,
      JSON.stringify({ intent: 'self', path: 'learner_lesson', createdAt: old }),
    );
    const got = await peekPreviewOnboardingState();
    expect(got).toBeNull();
  });

  it('clears state', async () => {
    await savePreviewOnboardingState({ intent: 'child', path: 'parent_setup' });
    await clearPreviewOnboardingState();
    expect(await peekPreviewOnboardingState()).toBeNull();
  });

  it('merges partial updates', async () => {
    await savePreviewOnboardingState({ intent: 'self', path: 'learner_lesson' });
    await savePreviewOnboardingState({ topicText: 'fractions', previewSessionId: 'pv_123' });
    const got = await peekPreviewOnboardingState();
    expect(got?.intent).toBe('self');
    expect(got?.topicText).toBe('fractions');
    expect(got?.previewSessionId).toBe('pv_123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// apps/mobile/src/lib/preview-onboarding-state.ts
import * as SecureStore from 'expo-secure-store';
import {
  previewOnboardingStateSchema,
  type PreviewIntent,
  type PreviewPath,
  type SaveTarget,
  type PreviewOnboardingState,
} from '@eduagent/schemas';

export { type PreviewIntent, type PreviewPath, type SaveTarget, type PreviewOnboardingState };

export const PREVIEW_ONBOARDING_STORAGE_KEY = 'mentomate_preview_onboarding_state';
const TTL_MS = 24 * 60 * 60 * 1000;

// [CRITICAL-4] `parentProfileId` is persisted after the parent profile is
// created in profile-basics so a child-step failure that triggers re-entry
// to the wizard does not re-create the parent.

export async function savePreviewOnboardingState(
  patch: Partial<PreviewOnboardingState> & Pick<PreviewOnboardingState, 'intent' | 'path'> | Partial<PreviewOnboardingState>,
): Promise<void> {
  const existing = await peekPreviewOnboardingState();
  const next: PreviewOnboardingState = {
    intent: (patch as PreviewOnboardingState).intent ?? existing?.intent ?? 'not_sure',
    path: (patch as PreviewOnboardingState).path ?? existing?.path ?? 'learner_lesson',
    ...existing,
    ...patch,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  } as PreviewOnboardingState;
  await SecureStore.setItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY, JSON.stringify(next));
}

export async function peekPreviewOnboardingState(): Promise<PreviewOnboardingState | null> {
  const raw = await SecureStore.getItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY);
  if (!raw) return null;
  try {
    const json: unknown = JSON.parse(raw);
    // [MEDIUM-6] Validate via Zod schema instead of unchecked cast — a corrupted
    // payload from an older shape would otherwise propagate as a typed lie.
    const parsed = previewOnboardingStateSchema.safeParse(json);
    if (!parsed.success) {
      await SecureStore.deleteItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY);
      return null;
    }
    if (Date.now() - new Date(parsed.data.createdAt).getTime() > TTL_MS) {
      await SecureStore.deleteItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    await SecureStore.deleteItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY);
    return null;
  }
}

export async function clearPreviewOnboardingState(): Promise<void> {
  await SecureStore.deleteItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/preview-onboarding-state.test.ts --no-coverage
```
Expected: PASS, 5/5.

- [ ] **Step 5: Commit via `/commit`**

---

### Task 2: Extend sign-out cleanup to clear preview state

**Files:**
- Modify: `apps/mobile/src/lib/sign-out-cleanup.ts`
- Test: `apps/mobile/src/lib/sign-out-cleanup.test.ts` (existing)

- [ ] **Step 1: Add a failing test entry**

Add to the existing `sign-out-cleanup.test.ts`:

```ts
import { PREVIEW_ONBOARDING_STORAGE_KEY } from './preview-onboarding-state';

it('clears preview onboarding state on sign-out', async () => {
  mockSecureStorage.set(PREVIEW_ONBOARDING_STORAGE_KEY, 'something');
  await clearProfileSecureStorageOnSignOut([]);
  expect(mockSecureStorage.has(PREVIEW_ONBOARDING_STORAGE_KEY)).toBe(false);
});
```

- [ ] **Step 2: Run it; expect FAIL**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/sign-out-cleanup.test.ts --no-coverage
```

- [ ] **Step 3: Add the key to the cleanup registry**

In `sign-out-cleanup.ts`, locate the global (non-per-profile) keys block and add:

```ts
import { PREVIEW_ONBOARDING_STORAGE_KEY } from './preview-onboarding-state';

// In the existing global keys deletion loop:
await safeDelete(PREVIEW_ONBOARDING_STORAGE_KEY);
```

(Use the existing pattern in the file — `safeDelete` may have a different name; align with the actual file. The goal is one new `SecureStore.deleteItemAsync(PREVIEW_ONBOARDING_STORAGE_KEY)` call inside the global key sweep, wrapped in the same try/catch the file already uses.)

- [ ] **Step 4: Run test; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 3: Pre-signup intent screen + landing

**Files:**
- Create: `apps/mobile/src/app/preview/_layout.tsx`
- Create: `apps/mobile/src/app/preview/index.tsx`
- Create: `apps/mobile/src/app/preview/intent.tsx`
- Test: `apps/mobile/src/app/preview/intent.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/app/preview/intent.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import IntentScreen from './intent';

const pushMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p) },
  Stack: { Screen: () => null },
}));

const saveMock = jest.fn();
jest.mock('../../lib/preview-onboarding-state', () => ({
  savePreviewOnboardingState: (...args: unknown[]) => saveMock(...args),
}));

describe('preview/intent', () => {
  beforeEach(() => { pushMock.mockClear(); saveMock.mockClear(); });

  it('renders the four options', () => {
    const { getByTestId } = render(<IntentScreen />);
    expect(getByTestId('preview-intent-me')).toBeTruthy();
    expect(getByTestId('preview-intent-child')).toBeTruthy();
    expect(getByTestId('preview-intent-both')).toBeTruthy();
    expect(getByTestId('preview-intent-not-sure')).toBeTruthy();
  });

  it('routes "Me" to /preview/topic with self/learner_lesson', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('preview-intent-me'));
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledWith({ intent: 'self', path: 'learner_lesson' });
    expect(pushMock).toHaveBeenCalledWith('/preview/topic');
  });

  it('routes "My child" to /preview/parent with child/parent_setup', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('preview-intent-child'));
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledWith({ intent: 'child', path: 'parent_setup' });
    expect(pushMock).toHaveBeenCalledWith('/preview/parent');
  });

  it('routes "Both" to /preview/both', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('preview-intent-both'));
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledWith({ intent: 'both', path: 'learner_lesson' });
    expect(pushMock).toHaveBeenCalledWith('/preview/both');
  });

  it('routes "Not sure" to /preview/not-sure', async () => {
    const { getByTestId } = render(<IntentScreen />);
    fireEvent.press(getByTestId('preview-intent-not-sure'));
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledWith({ intent: 'not_sure', path: 'learner_lesson' });
    expect(pushMock).toHaveBeenCalledWith('/preview/not-sure');
  });
});
```

- [ ] **Step 2: Run test; expect FAIL (module not found)**

- [ ] **Step 3: Implement the layout, landing, and intent screen**

```tsx
// apps/mobile/src/app/preview/_layout.tsx
import { Stack } from 'expo-router';
export default function PreviewLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// apps/mobile/src/app/preview/index.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function PreviewLanding() {
  return (
    <View testID="preview-landing" className="flex-1 items-center justify-center p-6">
      <Text className="text-3xl font-semibold mb-4">MentoMate</Text>
      <Text className="text-base text-center mb-8">A quick guided lesson, no signup needed.</Text>
      <Pressable
        testID="preview-landing-cta"
        onPress={() => router.push('/preview/intent')}
        className="bg-primary px-6 py-3 rounded-xl"
      >
        <Text className="text-primary-foreground font-semibold">Try a quick lesson</Text>
      </Pressable>
    </View>
  );
}
```

```tsx
// apps/mobile/src/app/preview/intent.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState, type PreviewIntent, type PreviewPath } from '../../lib/preview-onboarding-state';

type Option = { intent: PreviewIntent; path: PreviewPath; label: string; route: string; testID: string };

const OPTIONS: Option[] = [
  { intent: 'self', path: 'learner_lesson', label: 'Me', route: '/preview/topic', testID: 'preview-intent-me' },
  { intent: 'child', path: 'parent_setup', label: 'My child', route: '/preview/parent', testID: 'preview-intent-child' },
  { intent: 'both', path: 'learner_lesson', label: 'Both', route: '/preview/both', testID: 'preview-intent-both' },
  { intent: 'not_sure', path: 'learner_lesson', label: 'Not sure yet', route: '/preview/not-sure', testID: 'preview-intent-not-sure' },
];

export default function IntentScreen() {
  const select = async (o: Option) => {
    await savePreviewOnboardingState({ intent: o.intent, path: o.path });
    router.push(o.route);
  };
  return (
    <View testID="preview-intent" className="flex-1 p-6 justify-center">
      <Text className="text-2xl font-semibold mb-6">Who are you setting this up for?</Text>
      {OPTIONS.map((o) => (
        <Pressable
          key={o.testID}
          testID={o.testID}
          onPress={() => select(o)}
          className="border border-border rounded-xl px-4 py-4 mb-3"
        >
          <Text className="text-base">{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run test; expect PASS (5/5)**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 4: Topic input + Parent preview + Both + Not-sure screens

**Files:**
- Create: `apps/mobile/src/app/preview/topic.tsx`
- Create: `apps/mobile/src/app/preview/parent.tsx`
- Create: `apps/mobile/src/app/preview/parent.test.tsx`
- Create: `apps/mobile/src/app/preview/both.tsx`
- Create: `apps/mobile/src/app/preview/not-sure.tsx`

- [ ] **Step 1: Write the failing test for parent.tsx**

```tsx
// apps/mobile/src/app/preview/parent.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import ParentPreviewScreen from './parent';

const pushMock = jest.fn();
const replaceMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p), replace: (p: string) => replaceMock(p) },
  Stack: { Screen: () => null },
}));
jest.mock('../../lib/preview-onboarding-state', () => ({
  savePreviewOnboardingState: jest.fn(),
}));

describe('preview/parent', () => {
  beforeEach(() => { pushMock.mockClear(); replaceMock.mockClear(); });

  it('shows parent setup value (create/link/insights), not learner chat', () => {
    const { getByTestId, queryByTestId } = render(<ParentPreviewScreen />);
    expect(getByTestId('preview-parent-value-create')).toBeTruthy();
    expect(getByTestId('preview-parent-value-link')).toBeTruthy();
    expect(getByTestId('preview-parent-value-insights')).toBeTruthy();
    expect(getByTestId('preview-parent-sample-insight')).toBeTruthy();
    expect(queryByTestId('preview-lesson-chat')).toBeNull();
  });

  it('primary CTA is "Create or link child", secondary is "Try a sample lesson"', () => {
    const { getByTestId } = render(<ParentPreviewScreen />);
    expect(getByTestId('preview-parent-primary-cta')).toBeTruthy();
    expect(getByTestId('preview-parent-secondary-cta')).toBeTruthy();
  });

  it('primary CTA routes to signup with pending save target', () => {
    const { getByTestId } = render(<ParentPreviewScreen />);
    fireEvent.press(getByTestId('preview-parent-primary-cta'));
    expect(pushMock).toHaveBeenCalledWith('/(auth)/sign-up');
  });

  it('secondary CTA routes to topic for a sample lesson', () => {
    const { getByTestId } = render(<ParentPreviewScreen />);
    fireEvent.press(getByTestId('preview-parent-secondary-cta'));
    expect(pushMock).toHaveBeenCalledWith('/preview/topic');
  });
});
```

- [ ] **Step 2: Run test; expect FAIL**

- [ ] **Step 3: Implement topic.tsx**

```tsx
// apps/mobile/src/app/preview/topic.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState } from '../../lib/preview-onboarding-state';

export default function TopicScreen() {
  const [topic, setTopic] = useState('');
  const next = async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    await savePreviewOnboardingState({ topicText: trimmed });
    router.push('/preview/lesson');
  };
  return (
    <View testID="preview-topic" className="flex-1 p-6 justify-center">
      <Text className="text-2xl font-semibold mb-2">What should we help with?</Text>
      <Text className="text-sm text-muted-foreground mb-6">A topic, e.g. "fractions" or "photosynthesis".</Text>
      <TextInput
        testID="preview-topic-input"
        value={topic}
        onChangeText={setTopic}
        placeholder="Type a topic"
        className="border border-border rounded-xl px-4 py-3 mb-4"
      />
      <Pressable
        testID="preview-topic-submit"
        disabled={!topic.trim()}
        onPress={next}
        className="bg-primary px-6 py-3 rounded-xl items-center"
      >
        <Text className="text-primary-foreground font-semibold">Start lesson</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Implement parent.tsx**

```tsx
// apps/mobile/src/app/preview/parent.tsx
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState } from '../../lib/preview-onboarding-state';

export default function ParentPreviewScreen() {
  const goSignup = async () => {
    await savePreviewOnboardingState({ preferredSaveTarget: 'child' });
    router.push('/(auth)/sign-up');
  };
  const goSampleLesson = () => router.push('/preview/topic');
  return (
    <ScrollView testID="preview-parent" contentContainerClassName="p-6">
      <Text className="text-2xl font-semibold mb-4">Set up MentoMate for your child</Text>

      <View className="mb-6">
        <Text testID="preview-parent-value-create" className="mb-2">• Create your parent account</Text>
        <Text testID="preview-parent-value-link" className="mb-2">• Add or link a child profile</Text>
        <Text testID="preview-parent-value-insights" className="mb-2">• See progress and weekly insights</Text>
      </View>

      <View
        testID="preview-parent-sample-insight"
        className="border border-dashed border-border rounded-xl p-4 mb-6"
      >
        <Text className="text-xs text-muted-foreground mb-2">SAMPLE</Text>
        <Text className="font-semibold mb-1">Weekly insight</Text>
        <Text className="text-sm">"Worked through fractions for 22 minutes this week. Strong on equivalents, needs another pass on subtraction."</Text>
      </View>

      <Pressable
        testID="preview-parent-primary-cta"
        onPress={goSignup}
        className="bg-primary px-6 py-3 rounded-xl items-center mb-3"
      >
        <Text className="text-primary-foreground font-semibold">Create or link child</Text>
      </Pressable>
      <Pressable
        testID="preview-parent-secondary-cta"
        onPress={goSampleLesson}
        className="px-6 py-3 rounded-xl items-center"
      >
        <Text className="text-primary">Try a sample lesson first</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Implement both.tsx**

```tsx
// apps/mobile/src/app/preview/both.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState } from '../../lib/preview-onboarding-state';

export default function BothScreen() {
  const childFirst = async () => {
    await savePreviewOnboardingState({ bothPriority: 'child_first', path: 'parent_setup' });
    router.push('/preview/parent');
  };
  const selfFirst = async () => {
    await savePreviewOnboardingState({ bothPriority: 'self_first', path: 'learner_lesson' });
    router.push('/preview/topic');
  };
  return (
    <View testID="preview-both" className="flex-1 p-6 justify-center">
      <Text className="text-2xl font-semibold mb-6">What do you want to set up first?</Text>
      <Pressable
        testID="preview-both-child-first"
        onPress={childFirst}
        className="border border-border rounded-xl px-4 py-4 mb-3 bg-primary/5"
      >
        <Text className="text-base font-semibold">My child first</Text>
        <Text className="text-xs text-muted-foreground mt-1">Recommended</Text>
      </Pressable>
      <Pressable
        testID="preview-both-self-first"
        onPress={selfFirst}
        className="border border-border rounded-xl px-4 py-4"
      >
        <Text className="text-base">My learning first</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 6: Implement not-sure.tsx**

```tsx
// apps/mobile/src/app/preview/not-sure.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState } from '../../lib/preview-onboarding-state';

export default function NotSureScreen() {
  const tryLesson = async () => {
    await savePreviewOnboardingState({ path: 'learner_lesson' });
    router.push('/preview/topic');
  };
  const seeParent = async () => {
    await savePreviewOnboardingState({ path: 'parent_setup' });
    router.push('/preview/parent');
  };
  return (
    <View testID="preview-not-sure" className="flex-1 p-6 justify-center">
      <Text className="text-2xl font-semibold mb-6">No pressure. Pick one.</Text>
      <Pressable
        testID="preview-not-sure-try-lesson"
        onPress={tryLesson}
        className="border border-border rounded-xl px-4 py-4 mb-3"
      >
        <Text className="text-base">Try a quick lesson</Text>
      </Pressable>
      <Pressable
        testID="preview-not-sure-see-parent"
        onPress={seeParent}
        className="border border-border rounded-xl px-4 py-4"
      >
        <Text className="text-base">See how parent setup works</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 7: Run parent.test.tsx; expect PASS**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/preview/parent.test.tsx --no-coverage
```

- [ ] **Step 8: Commit via `/commit`**

---

### Task 5: (app)/_layout.tsx — route preview state to save wizard

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`
- Test: `apps/mobile/src/app/(app)/_layout.test.tsx` (extend existing)

- [ ] **Step 1: Write failing test cases**

Append to existing `_layout.test.tsx`:

```tsx
import { savePreviewOnboardingState, clearPreviewOnboardingState } from '../../lib/preview-onboarding-state';

// ensure expo-secure-store mock from existing setup covers preview state

describe('AppLayout — preview onboarding gate', () => {
  beforeEach(async () => { await clearPreviewOnboardingState(); });

  it('routes no-profile user with fresh preview state to the save wizard', async () => {
    await savePreviewOnboardingState({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    const { findByTestId, queryByTestId } = renderWithMocks({ activeProfile: null, profiles: [] });
    expect(await findByTestId('preview-save-gate')).toBeTruthy();
    expect(queryByTestId('create-profile-gate')).toBeNull();
  });

  it('keeps existing create-profile gate when no preview state', async () => {
    const { findByTestId, queryByTestId } = renderWithMocks({ activeProfile: null, profiles: [] });
    expect(await findByTestId('create-profile-gate')).toBeTruthy();
    expect(queryByTestId('preview-save-gate')).toBeNull();
  });

  // [HIGH-2] Existing user signs in mid-preview — preview state belongs to
  // whoever started the flow. Clear it and follow the normal landing.
  it('clears preview state and skips wizard when an existing-profile user signs in', async () => {
    await savePreviewOnboardingState({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    const { findByTestId, queryByTestId } = renderWithMocks({
      activeProfile: { id: 'p1', isOwner: true },
      profiles: [{ id: 'p1', isOwner: true }],
    });
    expect(await findByTestId('app-tab-bar')).toBeTruthy();
    expect(queryByTestId('preview-save-gate')).toBeNull();
    // Preview state was cleared so a future no-profile sign-in does not pick it up
    const { peekPreviewOnboardingState } = await import('../../lib/preview-onboarding-state');
    expect(await peekPreviewOnboardingState()).toBeNull();
  });
});
```

(Adapt `renderWithMocks` to match the existing test harness in `_layout.test.tsx`; if no test file exists, create one mirroring the pattern from `apps/mobile/src/app/create-profile.test.tsx`.)

- [ ] **Step 2: Run test; expect FAIL**

- [ ] **Step 3: Add the `PreviewSaveGate` wrapper component**

Create a separate file so hook order is unambiguous and the wrapper is unit-testable in isolation.

```tsx
// apps/mobile/src/app/(app)/_lib/preview-save-gate.tsx
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { peekPreviewOnboardingState } from '../../../lib/preview-onboarding-state';

// [LOW-1] TanStack-backed so `clearPreviewOnboardingState()` callers can
// `queryClient.invalidateQueries(['preview-onboarding-state'])` and this
// gate falls through on next render.
export function usePreviewOnboardingState() {
  return useQuery({
    queryKey: ['preview-onboarding-state'],
    queryFn: () => peekPreviewOnboardingState(),
    staleTime: 0,
  });
}

export function PreviewSaveGate() {
  // Idempotent replace — guarded by useRef so React StrictMode double-invoke
  // and any parent re-render do not fight the navigation stack.
  const replaced = useRef(false);
  useEffect(() => {
    if (replaced.current) return;
    replaced.current = true;
    router.replace('/(app)/preview/save');
  }, []);
  return <View testID="preview-save-gate" style={{ flex: 1 }} />;
}
```

- [ ] **Step 4: Wire `(app)/_layout.tsx` to choose gate**

Pin the change to the existing `!activeProfile` render branch. Hooks must run unconditionally — call `usePreviewOnboardingState()` and `useEffect`s above any early return.

```tsx
// Near the existing imports in (app)/_layout.tsx
import {
  PreviewSaveGate,
  usePreviewOnboardingState,
} from './_lib/preview-save-gate';
import { clearPreviewOnboardingState } from '../../lib/preview-onboarding-state';

// Inside the component body, BEFORE any early return:
const previewState = usePreviewOnboardingState();
const hasPreview = !!previewState.data;
const previewReady = previewState.isFetched;

// [HIGH-2] Existing user signed in (has a profile) — preview state on the
// device belonged to the pre-signup flow. Clear it so a future sign-out then
// different-user sign-in does not pick it up (mirrors the cross-account leak
// memory `project_cross_account_leak_2026_05_10.md`).
useEffect(() => {
  if (activeProfile && hasPreview) {
    void clearPreviewOnboardingState();
  }
}, [activeProfile, hasPreview]);

// Existing branch becomes:
if (!activeProfile) {
  if (!previewReady) return null; // brief wait for SecureStore read
  if (hasPreview) return <PreviewSaveGate />;
  return <CreateProfileGate />;
}
```

Find the current `!activeProfile` render site with `Grep` (`output_mode: content`, `pattern: "!activeProfile"`, `path: apps/mobile/src/app/(app)/_layout.tsx`) before editing — line numbers drift.

- [ ] **Step 4: Run tests; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 6: Verify auth-redirect handoff covers preview signup

**Files:**
- Read-only review: `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/lib/pending-auth-redirect.ts`

- [ ] **Step 1: Trace the flow on paper**

The preview screens push `/(auth)/sign-up`. Existing `(auth)/_layout.tsx` calls `rememberPendingAuthRedirect()`. After Clerk sign-up completes, the auth layout reads `peekPendingAuthRedirect()` and pushes. We need:
- Preview screens that push signup with `rememberPendingAuthRedirect('/(app)/preview/save')` first, OR
- `(app)/_layout.tsx` already routes any no-profile + preview-state account to save wizard (Task 5 — preferred, more robust).

Task 5's gate handles it. Confirm `pending-auth-redirect` TTL (5 min in `pending-auth-redirect.ts`) — if Clerk OAuth round-trip exceeds 5 min the redirect is lost. Preview state TTL (24 h) is the actual safety net.

- [ ] **Step 2: If preview screens that push signup need a redirect hint**

In `preview/parent.tsx` and `preview/lesson.tsx` (Task 8) just before `router.push('/(auth)/sign-up')`, also call:

```ts
import { rememberPendingAuthRedirect } from '../../lib/pending-auth-redirect';
rememberPendingAuthRedirect('/(app)/preview/save');
```

This is defense-in-depth — Task 5's gate is the primary route.

- [ ] **Step 3: No commit until callers are wired in Task 8.**

---

### Task 7: Save wizard skeleton — layout + save target step

**Files:**
- Create: `apps/mobile/src/app/(app)/preview/_layout.tsx`
- Create: `apps/mobile/src/app/(app)/preview/save.tsx`
- Create: `apps/mobile/src/app/(app)/preview/save.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/app/(app)/preview/save.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import SaveTargetScreen from './save';

const pushMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p) },
  Stack: { Screen: () => null },
}));

const peekMock = jest.fn();
const saveMock = jest.fn();
jest.mock('../../../lib/preview-onboarding-state', () => ({
  peekPreviewOnboardingState: () => peekMock(),
  savePreviewOnboardingState: (...a: unknown[]) => saveMock(...a),
}));

describe('preview/save', () => {
  beforeEach(() => { pushMock.mockClear(); saveMock.mockClear(); peekMock.mockReset(); });

  it('preselects "self" when intent was self', async () => {
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    const { findByTestId } = render(<SaveTargetScreen />);
    const selfOpt = await findByTestId('save-target-self');
    expect(selfOpt.props.accessibilityState?.selected).toBe(true);
  });

  it('preselects "child" when intent was child', async () => {
    peekMock.mockResolvedValue({ intent: 'child', path: 'parent_setup' });
    const { findByTestId } = render(<SaveTargetScreen />);
    const childOpt = await findByTestId('save-target-child');
    expect(childOpt.props.accessibilityState?.selected).toBe(true);
  });

  it('save target overrides pre-signup intent on continue', async () => {
    peekMock.mockResolvedValue({ intent: 'child', path: 'parent_setup' });
    const { findByTestId, getByTestId } = render(<SaveTargetScreen />);
    await findByTestId('save-target-child');
    fireEvent.press(getByTestId('save-target-self'));
    fireEvent.press(getByTestId('save-target-continue'));
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ preferredSaveTarget: 'self' }));
    expect(pushMock).toHaveBeenCalledWith('/(app)/preview/profile-basics');
  });

  it('shows topic summary if topicText present', async () => {
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'Fractions' });
    const { findByText } = render(<SaveTargetScreen />);
    expect(await findByText(/Fractions/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement layout + save target**

```tsx
// apps/mobile/src/app/(app)/preview/_layout.tsx
import { Stack } from 'expo-router';
export default function PreviewSaveLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// apps/mobile/src/app/(app)/preview/save.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import {
  peekPreviewOnboardingState,
  savePreviewOnboardingState,
  type SaveTarget,
} from '../../../lib/preview-onboarding-state';

const OPTIONS: { value: SaveTarget; label: string; testID: string }[] = [
  { value: 'self', label: 'My learning', testID: 'save-target-self' },
  { value: 'child', label: "My child's learning", testID: 'save-target-child' },
  { value: 'both', label: 'Both', testID: 'save-target-both' },
];

function intentToTarget(intent: string | undefined): SaveTarget {
  if (intent === 'child') return 'child';
  if (intent === 'both') return 'both';
  return 'self';
}

export default function SaveTargetScreen() {
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [topicText, setTopicText] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      const s = await peekPreviewOnboardingState();
      setTarget(s?.preferredSaveTarget ?? intentToTarget(s?.intent));
      setTopicText(s?.topicText);
    })();
  }, []);

  const cont = async () => {
    if (!target) return;
    await savePreviewOnboardingState({ preferredSaveTarget: target });
    router.push('/(app)/preview/profile-basics');
  };

  return (
    <View testID="preview-save" className="flex-1 p-6">
      <Text className="text-2xl font-semibold mb-2">Great, let's save this and make the next session fit.</Text>
      <Text className="text-base mb-6">Where should we save this?</Text>
      {topicText ? (
        <View className="border border-border rounded-xl px-4 py-3 mb-6">
          <Text className="text-xs text-muted-foreground">TOPIC</Text>
          <Text className="text-base">{topicText}</Text>
        </View>
      ) : null}
      {OPTIONS.map((o) => (
        <Pressable
          key={o.value}
          testID={o.testID}
          accessibilityState={{ selected: target === o.value }}
          onPress={() => setTarget(o.value)}
          className={`border rounded-xl px-4 py-4 mb-3 ${target === o.value ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <Text className="text-base">{o.label}</Text>
        </Pressable>
      ))}
      <Pressable
        testID="save-target-continue"
        disabled={!target}
        onPress={cont}
        className="bg-primary px-6 py-3 rounded-xl items-center mt-4"
      >
        <Text className="text-primary-foreground font-semibold">Continue</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 8: Profile basics step (self + child + both)

**Files:**
- Create: `apps/mobile/src/app/(app)/preview/profile-basics.tsx`
- Create: `apps/mobile/src/app/(app)/preview/profile-basics.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/app/(app)/preview/profile-basics.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileBasicsScreen from './profile-basics';

const pushMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p) },
  Stack: { Screen: () => null },
}));

const peekMock = jest.fn();
jest.mock('../../../lib/preview-onboarding-state', () => ({
  peekPreviewOnboardingState: () => peekMock(),
  savePreviewOnboardingState: jest.fn(),
}));

const createProfileMock = jest.fn();
jest.mock('../../../lib/api', () => ({
  client: {
    profiles: { $post: (...a: unknown[]) => createProfileMock(...a) },
  },
}));

const setActiveMock = jest.fn();
jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({ profiles: [], activeProfile: null, switchProfile: setActiveMock }),
}));

describe('preview/profile-basics', () => {
  beforeEach(() => { pushMock.mockClear(); createProfileMock.mockReset(); setActiveMock.mockClear(); });

  it('self target: creates one profile and proceeds to preferences', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'self' });
    createProfileMock.mockResolvedValue({ json: async () => ({ profile: { id: 'p1', isOwner: true } }) });
    const { findByTestId, getByTestId } = render(<ProfileBasicsScreen />);
    fireEvent.changeText(await findByTestId('basics-name'), 'Alex');
    fireEvent.changeText(getByTestId('basics-birth-year'), '2005');
    fireEvent.press(getByTestId('basics-submit'));
    await waitFor(() => expect(createProfileMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith('/(app)/preview/preferences');
  });

  it('child target: creates parent then child, keeps parent active', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'child' });
    createProfileMock
      .mockResolvedValueOnce({ json: async () => ({ profile: { id: 'parent1', isOwner: true } }) })
      .mockResolvedValueOnce({ json: async () => ({ profile: { id: 'child1', isOwner: false } }) });
    const { findByTestId, getByTestId } = render(<ProfileBasicsScreen />);

    // Parent step
    fireEvent.changeText(await findByTestId('basics-name'), 'Parent');
    fireEvent.changeText(getByTestId('basics-birth-year'), '1985');
    fireEvent.press(getByTestId('basics-submit'));
    await waitFor(() => expect(createProfileMock).toHaveBeenCalledTimes(1));

    // Child step
    fireEvent.changeText(await findByTestId('basics-child-name'), 'Sam');
    fireEvent.changeText(getByTestId('basics-child-birth-year'), '2014');
    fireEvent.press(getByTestId('basics-child-submit'));
    await waitFor(() => expect(createProfileMock).toHaveBeenCalledTimes(2));

    expect(setActiveMock).toHaveBeenCalledWith('parent1');
    expect(pushMock).toHaveBeenCalledWith('/(app)/preview/preferences');
  });

  it('both target: creates self profile then asks add-child now/later', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'both' });
    createProfileMock.mockResolvedValueOnce({ json: async () => ({ profile: { id: 'p1', isOwner: true } }) });
    const { findByTestId, getByTestId } = render(<ProfileBasicsScreen />);
    fireEvent.changeText(await findByTestId('basics-name'), 'Adult');
    fireEvent.changeText(getByTestId('basics-birth-year'), '1990');
    fireEvent.press(getByTestId('basics-submit'));
    await waitFor(() => expect(getByTestId('basics-add-child-now')).toBeTruthy());
    expect(getByTestId('basics-add-child-later')).toBeTruthy();
  });

  // [CRITICAL-4] Resume must NOT re-create the parent.
  it('child target with persisted parentProfileId resumes at child step', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'child', parentProfileId: 'parent1' });
    const { findByTestId } = render(<ProfileBasicsScreen />);
    // Skips the parent step entirely
    await findByTestId('preview-basics-child');
    expect(createProfileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement profile-basics.tsx**

```tsx
// apps/mobile/src/app/(app)/preview/profile-basics.tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  peekPreviewOnboardingState,
  savePreviewOnboardingState,
  type SaveTarget,
} from '../../../lib/preview-onboarding-state';
import { client } from '../../../lib/api';
import { useProfile } from '../../../lib/profile';

type Step = 'self' | 'parent' | 'child' | 'both-followup';

export default function ProfileBasicsScreen() {
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [step, setStep] = useState<Step>('self');
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthYear, setChildBirthYear] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { switchProfile } = useProfile();

  useEffect(() => {
    (async () => {
      const s = await peekPreviewOnboardingState();
      const t = s?.preferredSaveTarget ?? 'self';
      setTarget(t);
      // [CRITICAL-4] Resume from persisted parentProfileId so a re-entry to
      // the wizard after a child-step failure skips parent creation. Without
      // this guard, re-tapping `basics-submit` creates a duplicate parent or
      // hits ProfileLimitError on free tier.
      if (s?.parentProfileId) {
        setParentId(s.parentProfileId);
        setStep(t === 'both' ? 'both-followup' : 'child');
      } else {
        setStep(t === 'child' ? 'parent' : 'self');
      }
    })();
  }, []);

  const createProfile = async (input: { displayName: string; birthYear: number }) => {
    const res = await client.profiles.$post({ json: input });
    const body = await res.json();
    return body.profile as { id: string; isOwner: boolean };
  };

  const submitOwner = async () => {
    if (!name.trim() || !birthYear) return;
    setSubmitting(true); setError(null);
    try {
      const profile = await createProfile({ displayName: name.trim(), birthYear: Number(birthYear) });
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      if (target === 'self') {
        router.push('/(app)/preview/preferences');
      } else if (target === 'child') {
        // [CRITICAL-4] Persist BEFORE advancing — if the user backgrounds the
        // app between parent creation and child submission, resume picks up
        // the existing parent instead of re-creating one.
        await savePreviewOnboardingState({ parentProfileId: profile.id });
        setParentId(profile.id);
        setStep('child');
      } else {
        await savePreviewOnboardingState({ parentProfileId: profile.id });
        setParentId(profile.id);
        setStep('both-followup');
      }
    } catch (e) {
      setError((e as Error).message ?? 'Could not create profile');
    } finally {
      setSubmitting(false);
    }
  };

  const submitChild = async () => {
    if (!childName.trim() || !childBirthYear) return;
    setSubmitting(true); setError(null);
    try {
      await createProfile({ displayName: childName.trim(), birthYear: Number(childBirthYear) });
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      if (parentId) await switchProfile(parentId);
      router.push('/(app)/preview/preferences');
    } catch (e) {
      setError((e as Error).message ?? 'Could not create child profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) return <View testID="basics-loading" />;

  if (step === 'self' || step === 'parent') {
    return (
      <View testID="preview-basics" className="flex-1 p-6">
        <Text className="text-2xl font-semibold mb-4">
          {step === 'parent' ? 'Tell us about you (the parent)' : 'Tell us about you'}
        </Text>
        <TextInput testID="basics-name" placeholder="Display name" value={name} onChangeText={setName} className="border border-border rounded-xl px-4 py-3 mb-3" />
        <TextInput testID="basics-birth-year" placeholder="Birth year (YYYY)" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" className="border border-border rounded-xl px-4 py-3 mb-3" />
        {error ? <Text testID="basics-error" className="text-destructive mb-2">{error}</Text> : null}
        <Pressable testID="basics-submit" disabled={submitting} onPress={submitOwner} className="bg-primary px-6 py-3 rounded-xl items-center">
          <Text className="text-primary-foreground font-semibold">Continue</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'child') {
    return (
      <View testID="preview-basics-child" className="flex-1 p-6">
        <Text className="text-2xl font-semibold mb-4">Add your child</Text>
        <TextInput testID="basics-child-name" placeholder="Child nickname" value={childName} onChangeText={setChildName} className="border border-border rounded-xl px-4 py-3 mb-3" />
        <TextInput testID="basics-child-birth-year" placeholder="Birth year (YYYY)" value={childBirthYear} onChangeText={setChildBirthYear} keyboardType="number-pad" className="border border-border rounded-xl px-4 py-3 mb-3" />
        {error ? <Text testID="basics-error" className="text-destructive mb-2">{error}</Text> : null}
        <Pressable testID="basics-child-submit" disabled={submitting} onPress={submitChild} className="bg-primary px-6 py-3 rounded-xl items-center">
          <Text className="text-primary-foreground font-semibold">Create child</Text>
        </Pressable>
      </View>
    );
  }

  // both-followup
  return (
    <View testID="preview-basics-both" className="flex-1 p-6">
      <Text className="text-2xl font-semibold mb-4">Add a child now?</Text>
      <Pressable
        testID="basics-add-child-now"
        onPress={() => setStep('child')}
        className="border border-border rounded-xl px-4 py-4 mb-3 bg-primary/5"
      >
        <Text className="text-base">Yes, add child now</Text>
      </Pressable>
      <Pressable
        testID="basics-add-child-later"
        onPress={() => router.push('/(app)/preview/preferences')}
        className="border border-border rounded-xl px-4 py-4"
      >
        <Text className="text-base">Later — keep just my learning for now</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 9: Session preferences step

**Files:**
- Create: `apps/mobile/src/app/(app)/preview/preferences.tsx`
- Create: `apps/mobile/src/app/(app)/preview/preferences.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/app/(app)/preview/preferences.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import PreferencesScreen from './preferences';

const pushMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p) },
  Stack: { Screen: () => null },
}));

describe('preview/preferences', () => {
  beforeEach(() => pushMock.mockClear());

  it('renders style options and length options', () => {
    const { getByTestId } = render(<PreferencesScreen />);
    ['audio-first', 'text-first', 'step-by-step', 'no-preference'].forEach((k) =>
      expect(getByTestId(`pref-style-${k}`)).toBeTruthy(),
    );
    [10, 20, 30, 40].forEach((n) => expect(getByTestId(`pref-length-${n}`)).toBeTruthy());
  });

  it('continue requires both selections', () => {
    const { getByTestId } = render(<PreferencesScreen />);
    fireEvent.press(getByTestId('pref-continue'));
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('pref-style-step-by-step'));
    fireEvent.press(getByTestId('pref-length-20'));
    fireEvent.press(getByTestId('pref-continue'));
    expect(pushMock).toHaveBeenCalledWith('/(app)/preview/confirmation');
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement preferences.tsx**

```tsx
// apps/mobile/src/app/(app)/preview/preferences.tsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { savePreviewOnboardingState } from '../../../lib/preview-onboarding-state';

type Style = 'audio-first' | 'text-first' | 'step-by-step' | 'no-preference';
const STYLES: Style[] = ['audio-first', 'text-first', 'step-by-step', 'no-preference'];
const LENGTHS = [10, 20, 30, 40] as const;

export default function PreferencesScreen() {
  const [style, setStyle] = useState<Style | null>(null);
  const [length, setLength] = useState<number | null>(null);

  const cont = async () => {
    if (!style || !length) return;
    await savePreviewOnboardingState({
      // session preferences live alongside preview state for the claim payload
      // (typed extension; non-breaking)
    } as never);
    // Persist locally via a separate key/store if needed; for now, pass via router.
    router.push({
      pathname: '/(app)/preview/confirmation',
      params: { style, length: String(length) },
    } as never);
  };

  return (
    <View testID="preview-preferences" className="flex-1 p-6">
      <Text className="text-2xl font-semibold mb-4">How should sessions work?</Text>
      {STYLES.map((s) => (
        <Pressable
          key={s}
          testID={`pref-style-${s}`}
          onPress={() => setStyle(s)}
          accessibilityState={{ selected: style === s }}
          className={`border rounded-xl px-4 py-3 mb-2 ${style === s ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <Text>{s.replace(/-/g, ' ')}</Text>
        </Pressable>
      ))}

      <Text className="text-xl font-semibold mt-6 mb-4">What should a normal session feel like?</Text>
      <View className="flex-row flex-wrap gap-2">
        {LENGTHS.map((n) => (
          <Pressable
            key={n}
            testID={`pref-length-${n}`}
            onPress={() => setLength(n)}
            accessibilityState={{ selected: length === n }}
            className={`border rounded-xl px-4 py-3 ${length === n ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <Text>{n}{n === 40 ? '+' : ''} min</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID="pref-continue"
        disabled={!style || !length}
        onPress={cont}
        className="bg-primary px-6 py-3 rounded-xl items-center mt-8"
      >
        <Text className="text-primary-foreground font-semibold">Continue</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 10: Confirmation + landing (no claim call yet — wired in Task 19)

**Files:**
- Create: `apps/mobile/src/app/(app)/preview/confirmation.tsx`
- Create: `apps/mobile/src/app/(app)/preview/confirmation.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/app/(app)/preview/confirmation.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConfirmationScreen from './confirmation';

const replaceMock = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ style: 'step-by-step', length: '20' }),
  router: { replace: (p: string) => replaceMock(p) },
  Stack: { Screen: () => null },
}));

const peekMock = jest.fn();
const clearMock = jest.fn();
jest.mock('../../../lib/preview-onboarding-state', () => ({
  peekPreviewOnboardingState: () => peekMock(),
  clearPreviewOnboardingState: () => clearMock(),
}));

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({ profiles: [{ id: 'p1', isOwner: true }], activeProfile: { id: 'p1', isOwner: true } }),
}));

describe('preview/confirmation', () => {
  beforeEach(() => { replaceMock.mockClear(); clearMock.mockClear(); peekMock.mockReset(); });

  it('self only → lands on continuation', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'self', topicText: 'Fractions' });
    const { findByTestId, getByText } = render(<ConfirmationScreen />);
    expect(await findByTestId('preview-confirmation')).toBeTruthy();
    expect(getByText(/20-minute step-by-step sessions for Fractions/)).toBeTruthy();
    fireEvent.press(await findByTestId('confirm-continue'));
    await waitFor(() => expect(clearMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalled();
  });

  it('child target → lands on parent home', async () => {
    peekMock.mockResolvedValue({ preferredSaveTarget: 'child', topicText: 'Fractions' });
    const { findByTestId } = render(<ConfirmationScreen />);
    fireEvent.press(await findByTestId('confirm-continue'));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/(app)/home'));
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement confirmation.tsx**

```tsx
// apps/mobile/src/app/(app)/preview/confirmation.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  peekPreviewOnboardingState,
  clearPreviewOnboardingState,
  type SaveTarget,
} from '../../../lib/preview-onboarding-state';
import { useProfile } from '../../../lib/profile';

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{ style?: string; length?: string }>();
  const { profiles } = useProfile();
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const [topic, setTopic] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      const s = await peekPreviewOnboardingState();
      setTarget(s?.preferredSaveTarget ?? 'self');
      setTopic(s?.topicText);
    })();
  }, []);

  const styleLabel = (params.style ?? 'step-by-step').replace(/-/g, ' ');
  const lenLabel = params.length ?? '20';
  const topicLabel = topic ?? 'your first topic';

  const finish = async () => {
    // Task 19 wires the real preview claim here.
    await clearPreviewOnboardingState();

    const hasChild = profiles.some((p) => !p.isOwner);
    if (target === 'self') {
      router.replace('/(app)/session');
      return;
    }
    if (target === 'child' || hasChild) {
      router.replace('/(app)/home');
      return;
    }
    // both, self-first, no child yet
    router.replace('/(app)/session');
  };

  return (
    <View testID="preview-confirmation" className="flex-1 p-6 justify-center">
      <Text className="text-2xl font-semibold mb-3">Your first plan</Text>
      <Text className="text-base mb-8">
        {`${lenLabel}-minute ${styleLabel} sessions for ${topicLabel}.`}
      </Text>
      <Pressable
        testID="confirm-continue"
        onPress={finish}
        className="bg-primary px-6 py-3 rounded-xl items-center"
      >
        <Text className="text-primary-foreground font-semibold">
          {target === 'child' ? 'Go to parent home' : 'Continue lesson'}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

## Phase 1.5: Scripted Preview Lesson Fallback

This phase is the first shippable preview lesson. It intentionally avoids public LLM calls, public API routes, preview DB tables, and transcript claim/import.

The scripted lesson is not meant to be the final teaching experience. It is a risk-reduction lane that proves:

- signed-out routing works
- topic capture works
- signup handoff works
- save target works
- profile creation and landing work
- the preview can be useful enough to test conversion

### Task 10.5: Scripted preview lesson screen, no public API

**Files:**
- Create/modify: `apps/mobile/src/app/preview/lesson.tsx`
- Test: `apps/mobile/src/app/preview/lesson.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that prove:

- `preview/lesson` renders with no tab bar.
- It restores `topicText` from `preview-onboarding-state`.
- It shows an immediate teaching opener, not a goals interview.
- It allows at most 3 scripted user turns before the signup/save CTA.
- It calls `rememberPendingAuthRedirect('/(app)/preview/save')` before routing to signup.
- It does not require `previewSessionId`.
- It never renders upload, library, profile, progress, or saved-memory controls.

- [ ] **Step 2: Implement scripted lesson**

Implementation rules:

- Use only local state plus `preview-onboarding-state`.
- Store `topicText`; do not store a full transcript in SecureStore.
- Generate a short deterministic teaching sequence from the topic:
  - opener: "Great, let's start with {topic}. I'll explain one idea, then ask you a quick question."
  - one explanation
  - one simple question
  - one encouraging response
  - save CTA
- Keep copy honest: "Create a profile to save this topic and continue", not "save this full chat".
- No public API call.
- No LLM call.
- No DB table.

- [ ] **Step 3: Run mobile tests**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/preview/lesson.tsx --no-coverage
```

- [ ] **Step 4: Manual small-screen pass**

On a Galaxy S10e-sized viewport, verify the scripted lesson header, input, and save CTA are usable without clipping.

- [ ] **Step 5: Commit via `/commit`**

---

## Phase 2: Preview Lesson Engine

Phase 2 replaces or augments the scripted fallback with a server-backed preview lesson. It must preserve the scripted fallback and remain disabled by default until the stop gates in "Risk-Reduction Strategy" pass.

Do not remove the scripted preview path. When `PREVIEW_ONBOARDING_LLM_ENABLED=false`, or if the public start endpoint fails due to config/rate limiting/network, the user should still be able to continue via scripted preview and save the topic.

### Task 11: Preview-onboarding schemas

**Files:**
- Create: `packages/schemas/src/preview-onboarding.ts`
- Create: `packages/schemas/src/preview-onboarding.test.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write failing schema test**

```ts
// packages/schemas/src/preview-onboarding.test.ts
import {
  previewStartSchema,
  previewMessageSchema,
  previewClaimSchema,
  previewSessionResponseSchema,
  previewMessageResponseSchema,
} from './preview-onboarding';

describe('preview-onboarding schemas', () => {
  it('previewStartSchema accepts valid intent + topic', () => {
    const r = previewStartSchema.safeParse({ intent: 'self', topicText: 'fractions' });
    expect(r.success).toBe(true);
  });

  it('previewStartSchema rejects unknown intent', () => {
    expect(previewStartSchema.safeParse({ intent: 'teacher' }).success).toBe(false);
  });

  it('previewMessageSchema enforces text-only', () => {
    expect(previewMessageSchema.safeParse({ text: 'hi' }).success).toBe(true);
    expect(previewMessageSchema.safeParse({ text: 'hi', imageUrl: 'x' }).success).toBe(false);
  });

  it('previewClaimSchema requires target + style + length', () => {
    const r = previewClaimSchema.safeParse({
      targetProfileId: 'p1',
      saveTarget: 'self',
      sessionStyle: 'step-by-step',
      sessionLengthMinutes: 20,
    });
    expect(r.success).toBe(true);
  });

  it('previewSessionResponseSchema has required fields', () => {
    const r = previewSessionResponseSchema.safeParse({
      previewSession: {
        id: 'pv_1',
        intent: 'self',
        path: 'learner_lesson',
        topicText: 'fractions',
        userMessageCount: 0,
        assistantMessageCount: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement schemas**

```ts
// packages/schemas/src/preview-onboarding.ts
import { z } from 'zod';

export const previewIntentSchema = z.enum(['self', 'child', 'both', 'not_sure']);
export const previewPathSchema = z.enum(['learner_lesson', 'parent_setup']);
export const saveTargetSchema = z.enum(['self', 'child', 'both']);
export const sessionStyleSchema = z.enum(['audio-first', 'text-first', 'step-by-step', 'no-preference']);

export const previewStartSchema = z.object({
  intent: previewIntentSchema,
  path: previewPathSchema.optional(),
  topicText: z.string().min(1).max(200).optional(),
});
export type PreviewStartInput = z.infer<typeof previewStartSchema>;

export const previewMessageSchema = z
  .object({ text: z.string().min(1).max(1000) })
  .strict();
export type PreviewMessageInput = z.infer<typeof previewMessageSchema>;

export const previewClaimSchema = z.object({
  targetProfileId: z.string().min(1),
  saveTarget: saveTargetSchema,
  sessionStyle: sessionStyleSchema,
  sessionLengthMinutes: z.number().int().min(5).max(120),
});
export type PreviewClaimInput = z.infer<typeof previewClaimSchema>;

export const previewSessionSchema = z.object({
  id: z.string(),
  intent: previewIntentSchema,
  path: previewPathSchema,
  topicText: z.string().optional(),
  userMessageCount: z.number().int().min(0),
  assistantMessageCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  claimedAt: z.string().datetime().nullable().optional(),
});
export type PreviewSession = z.infer<typeof previewSessionSchema>;

export const previewSessionResponseSchema = z.object({ previewSession: previewSessionSchema });

export const previewMessageResponseSchema = z.object({
  previewSession: previewSessionSchema,
  assistantMessage: z.object({ text: z.string() }),
  isAtCap: z.boolean(),
});

export const previewClaimResponseSchema = z.object({
  claimed: z.literal(true),
  subjectId: z.string().nullable(),
  importedTranscript: z.boolean(),
  nextRoute: z.enum(['session', 'parent_home', 'child_setup']),
});

// [MEDIUM-6 + CRITICAL-4] Mobile preview-onboarding-state contract. Shared
// here so Zod validation in `peekPreviewOnboardingState` cannot drift from
// the field set the wizard reads.
export const previewOnboardingStateSchema = z.object({
  intent: previewIntentSchema,
  path: previewPathSchema,
  topicText: z.string().min(1).max(200).optional(),
  previewSessionId: z.string().optional(),
  bothPriority: z.enum(['child_first', 'self_first']).optional(),
  preferredSaveTarget: saveTargetSchema.optional(),
  parentProfileId: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type PreviewOnboardingState = z.infer<typeof previewOnboardingStateSchema>;
export type PreviewIntent = z.infer<typeof previewIntentSchema>;
export type PreviewPath = z.infer<typeof previewPathSchema>;
export type SaveTarget = z.infer<typeof saveTargetSchema>;
```

In `packages/schemas/src/index.ts` add: `export * from './preview-onboarding';`

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 12: Rate limiter — Cloudflare native binding

> **[CRITICAL-1]** The API runs on Cloudflare Workers (`wrangler deploy`, `apps/api/wrangler.toml`). Workers isolates do NOT share memory across invocations and recycle frequently — a module-level `new Map()` rate limiter offers near-zero abuse protection in production. Use the native `rate_limiter` binding instead.

**Files:**
- Modify: `apps/api/wrangler.toml` (add bindings)
- Modify: `apps/api/src/types.ts` (extend `AppEnv` bindings)
- Create: `apps/api/src/utils/rate-limit.ts` (thin wrapper + typed error)
- Create: `apps/api/src/utils/rate-limit.test.ts`

- [ ] **Step 1: Declare bindings in `wrangler.toml`**

Add to root `[env.staging]` and `[env.production]` blocks (and the default block if used in `wrangler dev`):

```toml
[[unsafe.bindings]]
name = "PREVIEW_START_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 10, period = 3600 }   # 10 starts / hour / key

[[unsafe.bindings]]
name = "PREVIEW_MESSAGE_LIMITER"
type = "ratelimit"
namespace_id = "1002"
simple = { limit = 12, period = 60 }     # 12 messages / minute / key
```

(Pick unused `namespace_id` values; coordinate with anyone else editing `wrangler.toml`.)

- [ ] **Step 2: Extend `AppEnv` bindings type**

```ts
// apps/api/src/types.ts (or wherever AppEnv is declared)
export interface AppEnv {
  Bindings: {
    // ...existing
    PREVIEW_START_LIMITER: RateLimitBinding;
    PREVIEW_MESSAGE_LIMITER: RateLimitBinding;
  };
  // ...
}

interface RateLimitBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}
```

- [ ] **Step 3: Write failing test for the wrapper**

```ts
// apps/api/src/utils/rate-limit.test.ts
import { checkLimitOrThrow, RateLimitedError } from './rate-limit';

describe('checkLimitOrThrow', () => {
  it('does not throw when binding allows', async () => {
    const binding = { limit: jest.fn(async () => ({ success: true })) };
    await expect(checkLimitOrThrow(binding, 'k1')).resolves.toBeUndefined();
    expect(binding.limit).toHaveBeenCalledWith({ key: 'k1' });
  });

  it('throws RateLimitedError when binding rejects', async () => {
    const binding = { limit: jest.fn(async () => ({ success: false })) };
    await expect(checkLimitOrThrow(binding, 'k1')).rejects.toThrow(RateLimitedError);
  });
});
```

- [ ] **Step 4: Implement the wrapper**

```ts
// apps/api/src/utils/rate-limit.ts
export class RateLimitedError extends Error {
  retryAfter?: number;
  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfter = retryAfter;
  }
}

interface RateLimitBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

export async function checkLimitOrThrow(
  binding: RateLimitBinding,
  key: string,
): Promise<void> {
  const { success } = await binding.limit({ key });
  if (!success) throw new RateLimitedError('Preview rate limit exceeded');
}
```

- [ ] **Step 5: Run; expect PASS**

- [ ] **Step 6: Commit via `/commit`**

---

### Task 12.5: Preview config and observability gates

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/mobile/src/lib/feature-flags.ts`
- Create: `apps/api/src/services/preview-onboarding-events.ts`
- Test: `apps/api/src/services/preview-onboarding-events.test.ts`

- [ ] **Step 1: Add typed server config**

Add `PREVIEW_ONBOARDING_LLM_ENABLED` through the existing typed config path. Default it to `false` in production. Do not read `process.env` directly inside preview routes or services.

Acceptance:

- Unit test or config test proves missing env -> `false`.
- Staging can opt in explicitly.
- Production cannot accidentally enable public LLM preview by omission.

- [ ] **Step 2: Add mobile feature helper**

Add a helper such as `isPreviewLlmEnabled()` to `apps/mobile/src/lib/feature-flags.ts`. It should default to false unless explicitly enabled by the existing public env/feature flag pattern.

Acceptance:

- Scripted preview is the default.
- Server-backed preview code path is opt-in.

- [ ] **Step 3: Add preview funnel events**

Create `preview-onboarding-events.ts` with safe, non-blocking event helpers:

- `preview.started`
- `preview.message_sent`
- `preview.rate_limited`
- `preview.cap_reached`
- `preview.signup_clicked`
- `preview.claim_succeeded`
- `preview.claim_failed`

Use existing non-core event patterns (`safeSend()` / Inngest-safe wrapper already used elsewhere). Event failure must never block preview or signup flow.

- [ ] **Step 4: Add tests**

Tests should prove:

- Event helpers include `previewSessionId` only when one exists.
- Event helpers include anonymous `deviceHash` for public preview events, never raw IP.
- Event helper failures are swallowed after structured logging/escalation per existing safe-send pattern.
- `claim_failed` is emitted from the authenticated side with account/profile context.

- [ ] **Step 5: Commit via `/commit`**

---

### Task 13: DB schema for preview sessions + migration

**Files:**
- Create: `apps/api/src/db/schema/preview-onboarding.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Generate: migration via `pnpm run db:generate:dev`

- [ ] **Step 1: Define the table**

```ts
// apps/api/src/db/schema/preview-onboarding.ts
import { pgTable, text, integer, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const previewOnboardingSessions = pgTable('preview_onboarding_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  intent: text('intent').notNull(),                    // 'self' | 'child' | 'both' | 'not_sure'
  path: text('path').notNull(),                        // 'learner_lesson' | 'parent_setup'
  topicText: text('topic_text'),
  transcript: jsonb('transcript').notNull().default([]),// [{ role, text, ts }]
  userMessageCount: integer('user_message_count').notNull().default(0),
  assistantMessageCount: integer('assistant_message_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedByAccountId: text('claimed_by_account_id'),
  // [HIGH-3] First-class column from day one — claim idempotency depends on
  // returning the original subjectId on a repeat call. A late-add column
  // would force a second migration and an `as any` cast in the service.
  claimedSubjectId: uuid('claimed_subject_id'),
  deviceHash: text('device_hash'),
});
```

**Rollback:** `DROP TABLE preview_onboarding_sessions;` — table holds only signed-out transient preview sessions (TTL 24h, no foreign-keyed user data), so no data loss is meaningful. Per CLAUDE.md "Schema And Deploy Safety", rollback is fully possible.

In `apps/api/src/db/schema/index.ts`: `export * from './preview-onboarding';`

- [ ] **Step 2: Generate the migration**

```
pnpm run db:generate:dev
```

Inspect the generated SQL file. Commit both the schema and the SQL migration.

- [ ] **Step 3: Apply to dev DB**

```
pnpm run db:push:dev
```

(Dev only; staging/prod use `db:migrate`.)

- [ ] **Step 4: Commit via `/commit`**

---

### Task 14: Preview service (start, addMessage, claim)

**Files:**
- Create: `apps/api/src/services/preview-onboarding.ts`
- Create: `apps/api/src/services/preview-onboarding.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/services/preview-onboarding.test.ts
import { startPreview, addPreviewMessage, claimPreview } from './preview-onboarding';
import { getTestDb, resetTestDb, createTestAccount, createTestProfile } from '../test-utils/db';

jest.mock('./llm/router', () => ({
  routeAndCall: jest.fn(async () => ({
    response: 'Mock assistant reply about fractions.',
    provider: 'mock', model: 'mock', latencyMs: 10, stopReason: 'end_turn',
  })),
}));

describe('preview-onboarding service', () => {
  let db: ReturnType<typeof getTestDb>;
  beforeEach(async () => { db = getTestDb(); await resetTestDb(); });

  it('startPreview creates a session with TTL', async () => {
    const s = await startPreview(db, { intent: 'self', topicText: 'fractions' }, 'device-abc');
    expect(s.id).toBeTruthy();
    expect(new Date(s.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('addPreviewMessage enforces 5 user / 5 assistant cap', async () => {
    const s = await startPreview(db, { intent: 'self', topicText: 'x' }, 'd');
    for (let i = 0; i < 5; i++) await addPreviewMessage(db, s.id, { text: `q${i}` });
    await expect(addPreviewMessage(db, s.id, { text: 'q6' })).rejects.toThrow(/cap/i);
  });

  it('addPreviewMessage routes through routeAndCall, not direct provider', async () => {
    const router = require('./llm/router');
    const s = await startPreview(db, { intent: 'self', topicText: 'fr' }, 'd');
    await addPreviewMessage(db, s.id, { text: 'what is 1/2 + 1/4' });
    expect(router.routeAndCall).toHaveBeenCalled();
  });

  it('claimPreview rejects expired session', async () => {
    const s = await startPreview(db, { intent: 'self', topicText: 'x' }, 'd');
    // simulate expiry
    await db.update(/* preview table */).set({ expiresAt: new Date(Date.now() - 1000) }).where(/* id */);
    const account = await createTestAccount(db);
    const profile = await createTestProfile(db, account.id);
    await expect(
      claimPreview(db, s.id, account.id, { targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 }),
    ).rejects.toThrow(/expired/i);
  });

  it('claimPreview is idempotent', async () => {
    const s = await startPreview(db, { intent: 'self', topicText: 'x' }, 'd');
    const account = await createTestAccount(db);
    const profile = await createTestProfile(db, account.id);
    const r1 = await claimPreview(db, s.id, account.id, { targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 });
    const r2 = await claimPreview(db, s.id, account.id, { targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 });
    expect(r1.claimed).toBe(true);
    expect(r2.claimed).toBe(true);
    expect(r1.subjectId).toBe(r2.subjectId);
  });

  it('claimPreview rejects target profile not owned by account', async () => {
    const s = await startPreview(db, { intent: 'self', topicText: 'x' }, 'd');
    const account = await createTestAccount(db);
    const other = await createTestAccount(db);
    const profile = await createTestProfile(db, other.id);
    await expect(
      claimPreview(db, s.id, account.id, { targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 }),
    ).rejects.toThrow(/forbidden/i);
  });

  // [CRITICAL-3] Parent-created child via this wizard cannot end up in
  // PENDING consent (see profile.ts:287-293). Test the unit-level gate by
  // setting up a child profile whose consent row is PENDING via a direct
  // insert into `consentStates`, independent of the wizard's creation path.
  it('claimPreview with PENDING consentStates row defers transcript import', async () => {
    const s = await startPreview(db, { intent: 'child', topicText: 'fr' }, 'd');
    const account = await createTestAccount(db);
    const parent = await createTestProfile(db, account.id, { isOwner: true });
    const child = await createTestProfile(db, account.id, { isOwner: false, parentProfileId: parent.id });
    // Force a PENDING consent row — bypasses the parent-created-grants path.
    await db.insert(consentStates).values({ profileId: child.id, status: 'PENDING' });
    const r = await claimPreview(db, s.id, account.id, {
      targetProfileId: child.id,
      saveTarget: 'child',
      sessionStyle: 'step-by-step',
      sessionLengthMinutes: 20,
    });
    expect(r.importedTranscript).toBe(false);
    expect(r.subjectId).toBeTruthy(); // subject still created
  });
});
```

(Adapt `getTestDb` etc. to the project's existing test DB helpers; see any existing `*.integration.test.ts` in `apps/api/src/services/` for the pattern.)

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/services/preview-onboarding.ts
import { and, eq, sql } from 'drizzle-orm';
import { previewOnboardingSessions } from '../db/schema/preview-onboarding';
import { profiles, accounts } from '../db/schema';
import { routeAndCall, type RouteResult } from './llm/router';
import {
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../errors';
import { createSubjectWithStructure } from './subject';
import type { Database } from '../db';
import type {
  PreviewStartInput,
  PreviewMessageInput,
  PreviewClaimInput,
} from '@eduagent/schemas';

const MAX_USER_TURNS = 5;
const MAX_ASSISTANT_TURNS = 5;
const TTL_HOURS = 24;
const MAX_RESPONSE_CHARS = 1200;

const PREVIEW_SYSTEM_PROMPT = `You are MentoMate's preview lesson tutor.
- This is a constrained 3–5 turn demo with no memory between sessions.
- Teach immediately. Explain one idea, ask one quick question, respond, show a small win.
- Do NOT say you will remember the user, save notes, or set up an account.
- Plain text only; no markdown, no tools.
- Keep responses under 200 words.`;

export interface PreviewSessionRow {
  id: string;
  intent: string;
  path: string;
  topicText: string | null;
  userMessageCount: number;
  assistantMessageCount: number;
  createdAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
  transcript: { role: 'user' | 'assistant'; text: string; ts: string }[];
}

function rowToDto(r: PreviewSessionRow) {
  return {
    id: r.id,
    intent: r.intent as 'self' | 'child' | 'both' | 'not_sure',
    path: r.path as 'learner_lesson' | 'parent_setup',
    topicText: r.topicText ?? undefined,
    userMessageCount: r.userMessageCount,
    assistantMessageCount: r.assistantMessageCount,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    claimedAt: r.claimedAt?.toISOString() ?? null,
  };
}

export async function startPreview(
  db: Database,
  input: PreviewStartInput,
  deviceHash: string,
) {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  const [row] = await db
    .insert(previewOnboardingSessions)
    .values({
      intent: input.intent,
      path: input.path ?? (input.intent === 'child' ? 'parent_setup' : 'learner_lesson'),
      topicText: input.topicText ?? null,
      expiresAt,
      deviceHash,
      transcript: [],
    })
    .returning();
  return rowToDto(row as PreviewSessionRow);
}

export async function addPreviewMessage(
  db: Database,
  previewId: string,
  input: PreviewMessageInput,
) {
  // [MEDIUM-1] Atomic claim of one turn-slot. The conditional UPDATE
  // increments only if all gates pass, then RETURNS the row. Two concurrent
  // requests on the same previewId cannot both pass the cap check.
  const [reserved] = await db
    .update(previewOnboardingSessions)
    .set({ userMessageCount: sql`${previewOnboardingSessions.userMessageCount} + 1` })
    .where(
      and(
        eq(previewOnboardingSessions.id, previewId),
        sql`${previewOnboardingSessions.claimedAt} IS NULL`,
        sql`${previewOnboardingSessions.expiresAt} > NOW()`,
        sql`${previewOnboardingSessions.userMessageCount} < ${MAX_USER_TURNS}`,
      ),
    )
    .returning();

  if (!reserved) {
    // Disambiguate why the reservation failed — read the row to give the
    // user a typed error rather than a generic "could not reserve".
    const [row] = await db
      .select()
      .from(previewOnboardingSessions)
      .where(eq(previewOnboardingSessions.id, previewId));
    if (!row) throw new NotFoundError('Preview session not found');
    if (row.claimedAt) throw new BadRequestError('Preview already claimed');
    if (new Date(row.expiresAt).getTime() <= Date.now())
      throw new BadRequestError('Preview expired');
    throw new BadRequestError('Preview turn cap reached');
  }

  const row = reserved;
  const transcript = [
    ...(row.transcript as PreviewSessionRow['transcript']),
    { role: 'user' as const, text: input.text, ts: new Date().toISOString() },
  ];

  const result: RouteResult = await routeAndCall(
    [
      { role: 'system', content: PREVIEW_SYSTEM_PROMPT + (row.topicText ? `\nTopic: ${row.topicText}` : '') },
      ...transcript.map((m) => ({ role: m.role, content: m.text })),
    ],
    1,
    { flow: 'preview-onboarding' },
  );

  const reply = result.response.slice(0, MAX_RESPONSE_CHARS);
  const transcriptWithReply = [
    ...transcript,
    { role: 'assistant' as const, text: reply, ts: new Date().toISOString() },
  ];

  // userMessageCount was already incremented by the reservation UPDATE above;
  // here we only write the transcript and the assistant counter.
  const [updated] = await db
    .update(previewOnboardingSessions)
    .set({
      transcript: transcriptWithReply,
      assistantMessageCount: row.assistantMessageCount + 1,
    })
    .where(eq(previewOnboardingSessions.id, previewId))
    .returning();

  const session = rowToDto(updated as PreviewSessionRow);
  return {
    previewSession: session,
    assistantMessage: { text: reply },
    isAtCap:
      session.userMessageCount >= MAX_USER_TURNS ||
      session.assistantMessageCount >= MAX_ASSISTANT_TURNS,
  };
}

export async function claimPreview(
  db: Database,
  previewId: string,
  accountId: string,
  input: PreviewClaimInput,
) {
  const [row] = await db
    .select()
    .from(previewOnboardingSessions)
    .where(eq(previewOnboardingSessions.id, previewId));
  if (!row) throw new NotFoundError('Preview session not found');
  if (new Date(row.expiresAt).getTime() <= Date.now() && !row.claimedAt)
    throw new BadRequestError('Preview expired');

  // verify target profile belongs to this account
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, input.targetProfileId), eq(profiles.accountId, accountId)));
  if (!profile) throw new ForbiddenError('Target profile not in account');

  // [HIGH-3] Idempotent claim: column is non-conditional (Task 13 includes
  // `claimedSubjectId` from the start), so no `as any` cast needed.
  if (row.claimedAt && row.claimedByAccountId === accountId) {
    return {
      claimed: true as const,
      subjectId: row.claimedSubjectId,
      importedTranscript: false,
      nextRoute: nextRouteFor(input.saveTarget, profile.isOwner),
    };
  }

  // [CRITICAL-2] Consent lives in the separate `consentStates` table with
  // values like 'CONSENTED', not on profile rows. Use the real lookup.
  // [CRITICAL-3] Parent-created child profiles get consent GRANTED at
  // creation time (`profile.ts:287-293`), so this gate only ever blocks the
  // out-of-scope "self-registering underage user" path. We keep the lookup
  // for correctness; the spec's "PENDING blocks transcript import" failure
  // mode is documented as unreachable on the wizard's child-target path.
  const importTranscript =
    input.saveTarget !== 'child' ||
    (await getConsentStatus(db, profile.id)) === 'CONSENTED';

  // create or reuse subject
  let subjectId: string | null = null;
  if (row.topicText) {
    const subject = await createSubjectWithStructure(db, input.targetProfileId, {
      name: row.topicText,
      rawInput: row.topicText,
    });
    subjectId = subject.id;
  }

  await db
    .update(previewOnboardingSessions)
    .set({
      claimedAt: new Date(),
      claimedByAccountId: accountId,
      claimedSubjectId: subjectId,
    })
    .where(eq(previewOnboardingSessions.id, previewId));

  return {
    claimed: true as const,
    subjectId,
    importedTranscript: importTranscript,
    nextRoute: nextRouteFor(input.saveTarget, profile.isOwner),
  };
}

// [MEDIUM-3] Non-owner cannot select 'both' from the wizard (the screen is
// only reachable from an owner-creation flow). Throw a typed error rather
// than silently returning the learner-self route.
function nextRouteFor(saveTarget: 'self' | 'child' | 'both', isOwner: boolean) {
  if (saveTarget === 'child') return 'parent_home' as const;
  if (saveTarget === 'both') {
    if (!isOwner) throw new BadRequestError('Non-owner cannot select "both"');
    return 'session' as const;
  }
  return 'session' as const;
}
```

Imports: `getConsentStatus` from `../services/consent` (or wherever the canonical reader lives — grep for `getConsentStatus` exports in `apps/api/src` before importing). `ForbiddenError`/`NotFoundError`/`BadRequestError` live under `apps/api/src/errors`.

- [ ] **Step 3: Run; expect PASS**

```
cd apps/api && pnpm exec jest src/services/preview-onboarding.test.ts --no-coverage
```

- [ ] **Step 4: Commit via `/commit`**

---

### Task 15: Public preview routes (start + messages)

**Files:**
- Create: `apps/api/src/routes/preview-onboarding-public.ts`
- Create: `apps/api/src/routes/preview-onboarding-public.integration.test.ts`
- Modify: `apps/api/src/middleware/auth.ts` (PUBLIC_PATHS)
- Modify: `apps/api/src/index.ts` (route registration)

- [ ] **Step 1: Write failing integration test**

```ts
// apps/api/src/routes/preview-onboarding-public.integration.test.ts
import { app } from '../index';

describe('POST /v1/preview-onboarding-public/start', () => {
  it('fails closed when server-backed preview is disabled', async () => {
    const env = {
      PREVIEW_ONBOARDING_LLM_ENABLED: 'false',
      PREVIEW_START_LIMITER: { limit: async () => ({ success: true }) },
      PREVIEW_MESSAGE_LIMITER: { limit: async () => ({ success: true }) },
    } as never;
    const res = await app.request('/v1/preview-onboarding-public/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-disabled' },
      body: JSON.stringify({ intent: 'self', topicText: 'fractions' }),
    }, env);
    expect(res.status).toBe(404);
  });

  it('accepts valid intent+topic without auth', async () => {
    const res = await app.request('/v1/preview-onboarding-public/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-1' },
      body: JSON.stringify({ intent: 'self', topicText: 'fractions' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.previewSession.id).toBeTruthy();
  });

  it('rejects without device id header', async () => {
    const res = await app.request('/v1/preview-onboarding-public/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'self' }),
    });
    expect(res.status).toBe(400);
  });

  it('enforces 5-message cap on /messages', async () => {
    const startRes = await app.request('/v1/preview-onboarding-public/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-2' },
      body: JSON.stringify({ intent: 'self', topicText: 'x' }),
    });
    const { previewSession } = await startRes.json();
    for (let i = 0; i < 5; i++) {
      const r = await app.request(`/v1/preview-onboarding-public/${previewSession.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-id': 'd-2' },
        body: JSON.stringify({ text: `q${i}` }),
      });
      expect(r.status).toBe(200);
    }
    const over = await app.request(`/v1/preview-onboarding-public/${previewSession.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-2' },
      body: JSON.stringify({ text: 'q6' }),
    });
    expect(over.status).toBe(400);
  });

  it('rejects messages with image/file fields (strict schema)', async () => {
    const startRes = await app.request('/v1/preview-onboarding-public/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-3' },
      body: JSON.stringify({ intent: 'self', topicText: 'x' }),
    });
    const { previewSession } = await startRes.json();
    const r = await app.request(`/v1/preview-onboarding-public/${previewSession.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': 'd-3' },
      body: JSON.stringify({ text: 'hi', imageUrl: 'http://x' }),
    });
    expect(r.status).toBe(400);
  });

  // [CRITICAL-1] The Cloudflare ratelimit binding has no first-party Jest
  // fake. Stub `env.PREVIEW_START_LIMITER` with a counting `limit()` so the
  // test exercises the route's call to the binding, not the binding itself.
  it('returns 429 when PREVIEW_START_LIMITER reports !success', async () => {
    let calls = 0;
    const env = {
      PREVIEW_START_LIMITER: { limit: async () => ({ success: ++calls <= 10 }) },
      PREVIEW_MESSAGE_LIMITER: { limit: async () => ({ success: true }) },
    } as never;
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = await app.request('/v1/preview-onboarding-public/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-id': 'd-rl' },
        body: JSON.stringify({ intent: 'self', topicText: 'x' }),
      }, env);
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement the route**

```ts
// apps/api/src/routes/preview-onboarding-public.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  previewStartSchema,
  previewMessageSchema,
  previewSessionResponseSchema,
  previewMessageResponseSchema,
} from '@eduagent/schemas';
import { startPreview, addPreviewMessage } from '../services/preview-onboarding';
import {
  emitPreviewStarted,
  emitPreviewMessageSent,
  emitPreviewRateLimited,
} from '../services/preview-onboarding-events';
import { checkLimitOrThrow } from '../utils/rate-limit';
import { BadRequestError, NotFoundError } from '../errors';
import { getConfig } from '../config';
import type { AppEnv } from '../types';

// [MEDIUM-2] `x-device-id` is client-supplied and trivially rotatable. Mix
// in `cf-connecting-ip` and `user-agent` so the cheapest abuse pattern
// (constant IP + UA, random device id) still collapses to one bucket. Best-
// effort only; pair with a Cloudflare WAF rule on this path prefix for
// strong enforcement.
async function deviceKey(c: { req: { header: (n: string) => string | undefined } }) {
  const dev = c.req.header('x-device-id');
  if (!dev) throw new BadRequestError('Missing x-device-id header');
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const ua = c.req.header('user-agent') ?? 'unknown';
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${dev}|${ip}|${ua}`),
  );
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const previewOnboardingPublicRoute = new Hono<AppEnv>()
  .post('/start', zValidator('json', previewStartSchema), async (c) => {
    if (!getConfig(c.env).previewOnboardingLlmEnabled) {
      throw new NotFoundError('Preview lesson is unavailable');
    }
    const key = await deviceKey(c);
    try {
      await checkLimitOrThrow(c.env.PREVIEW_START_LIMITER, key);
    } catch (err) {
      await emitPreviewRateLimited(c, { phase: 'start', deviceHash: key });
      throw err;
    }
    const db = c.get('db');
    const session = await startPreview(db, c.req.valid('json'), key);
    await emitPreviewStarted(c, { previewSessionId: session.id, deviceHash: key });
    return c.json(previewSessionResponseSchema.parse({ previewSession: session }), 201);
  })
  .post('/:id/messages', zValidator('json', previewMessageSchema), async (c) => {
    if (!getConfig(c.env).previewOnboardingLlmEnabled) {
      throw new NotFoundError('Preview lesson is unavailable');
    }
    const key = await deviceKey(c);
    try {
      await checkLimitOrThrow(c.env.PREVIEW_MESSAGE_LIMITER, key);
    } catch (err) {
      await emitPreviewRateLimited(c, { phase: 'message', deviceHash: key, previewSessionId: c.req.param('id') });
      throw err;
    }
    const db = c.get('db');
    const result = await addPreviewMessage(db, c.req.param('id'), c.req.valid('json'));
    await emitPreviewMessageSent(c, { previewSessionId: c.req.param('id'), deviceHash: key, isAtCap: result.isAtCap });
    return c.json(previewMessageResponseSchema.parse(result), 200);
  });
```

- [ ] **Step 4: Wire route in `apps/api/src/index.ts`**

Add to the route registration chain:

```ts
import { previewOnboardingPublicRoute } from './routes/preview-onboarding-public';
// ...
  .route('/v1/preview-onboarding-public', previewOnboardingPublicRoute)
```

- [ ] **Step 5: Update PUBLIC_PATHS in `apps/api/src/middleware/auth.ts`**

In the `PUBLIC_PATHS` array (lines 33-47), add:

```ts
'/v1/preview-onboarding-public/',
```

(Trailing slash = prefix match per existing behavior.)

- [ ] **Step 6: Run integration test; expect PASS**

```
cd apps/api && pnpm exec jest src/routes/preview-onboarding-public.integration.test.ts --no-coverage
```

- [ ] **Step 7: Commit via `/commit`**

---

### Task 16: Authenticated claim route

**Files:**
- Create: `apps/api/src/routes/preview-onboarding-authenticated.ts`
- Create: `apps/api/src/routes/preview-onboarding-authenticated.integration.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing integration test**

```ts
// apps/api/src/routes/preview-onboarding-authenticated.integration.test.ts
import { app } from '../index';
import { createTestAccount, createTestProfile, startTestPreview, makeAuthHeader } from '../test-utils';

describe('POST /v1/preview-onboarding/:id/claim', () => {
  it('requires auth', async () => {
    const preview = await startTestPreview({ intent: 'self', topicText: 'x' });
    const res = await app.request(`/v1/preview-onboarding/${preview.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetProfileId: 'p1', saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects expired preview with 400', async () => {
    const preview = await startTestPreview({ intent: 'self', topicText: 'x' });
    await expireTestPreview(preview.id);
    const account = await createTestAccount();
    const profile = await createTestProfile(account.id);
    const res = await app.request(`/v1/preview-onboarding/${preview.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...makeAuthHeader(account.id) },
      body: JSON.stringify({ targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 }),
    });
    expect(res.status).toBe(400);
  });

  it('is idempotent (same response on second call)', async () => {
    const preview = await startTestPreview({ intent: 'self', topicText: 'x' });
    const account = await createTestAccount();
    const profile = await createTestProfile(account.id);
    const body = JSON.stringify({ targetProfileId: profile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 });
    const headers = { 'content-type': 'application/json', ...makeAuthHeader(account.id) };
    const r1 = await app.request(`/v1/preview-onboarding/${preview.id}/claim`, { method: 'POST', headers, body });
    const r2 = await app.request(`/v1/preview-onboarding/${preview.id}/claim`, { method: 'POST', headers, body });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b2.subjectId).toBe(b1.subjectId);
  });

  it('rejects target profile not owned by account with 403', async () => {
    const preview = await startTestPreview({ intent: 'self', topicText: 'x' });
    const account = await createTestAccount();
    const otherAccount = await createTestAccount();
    const otherProfile = await createTestProfile(otherAccount.id);
    const res = await app.request(`/v1/preview-onboarding/${preview.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...makeAuthHeader(account.id) },
      body: JSON.stringify({ targetProfileId: otherProfile.id, saveTarget: 'self', sessionStyle: 'step-by-step', sessionLengthMinutes: 20 }),
    });
    expect(res.status).toBe(403);
  });

  // [CRITICAL-3] PENDING-consent route-level test removed — the wizard's
  // parent→child path GRANTS consent at creation time, so the route can
  // never observe PENDING via this endpoint. Service-level test in Task 14
  // covers the gate via direct consentStates manipulation.
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement the route**

```ts
// apps/api/src/routes/preview-onboarding-authenticated.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { previewClaimSchema, previewClaimResponseSchema } from '@eduagent/schemas';
import { claimPreview } from '../services/preview-onboarding';
import type { AppEnv } from '../types';

export const previewOnboardingAuthenticatedRoute = new Hono<AppEnv>()
  .post('/:id/claim', zValidator('json', previewClaimSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const accountId = user.userId;
    const result = await claimPreview(db, c.req.param('id'), accountId, c.req.valid('json'));
    return c.json(previewClaimResponseSchema.parse(result), 200);
  });
```

- [ ] **Step 4: Register in `apps/api/src/index.ts`**

```ts
import { previewOnboardingAuthenticatedRoute } from './routes/preview-onboarding-authenticated';
// ...
  .route('/v1/preview-onboarding', previewOnboardingAuthenticatedRoute)
```

**Important:** Do NOT add `/v1/preview-onboarding/` to PUBLIC_PATHS. The matching in `auth.ts` is prefix-based with trailing `/`. By using two distinct prefixes (`/v1/preview-onboarding-public/` public, `/v1/preview-onboarding/` authenticated), there is no ambiguity.

- [ ] **Step 5: Run; expect PASS**

- [ ] **Step 6: Commit via `/commit`**

---

### Task 17: Mobile API client for preview

**Files:**
- Modify: `apps/mobile/src/lib/api.ts` (or wherever the Hono RPC client is exported)

- [ ] **Step 1: Verify the Hono RPC client picks up the new routes**

The Hono RPC client is generated from `AppType` import. Path segments are accessed via bracket notation when they contain hyphens. For our routes, the access pattern is:

```ts
client['preview-onboarding-public'].start.$post(...)
client['preview-onboarding-public'][':id'].messages.$post({ param: { id }, ... })
client['preview-onboarding'][':id'].claim.$post({ param: { id }, ... })
```

Confirm `apps/api/src/index.ts` exports the chained app with the new routes included so `AppType` carries them.

- [ ] **Step 2: Add small typed helpers if direct RPC ergonomics are awkward**

> **[HIGH-4]** Use the existing device-id source rather than introducing
> `expo-device` as a new native dependency. Grep the mobile app for an
> existing installation/device-id helper (commonly tied to push token or
> Sentry user) before falling back to anything new. If none exists, persist
> a UUID in SecureStore under a stable key.

> **[HIGH-5]** Errors must flow through the existing API client middleware
> that produces typed errors (`QuotaExhaustedError`, `RateLimitedError`,
> `ForbiddenError`, etc.) — see CLAUDE.md "Classify errors at the API
> client boundary, not per-screen." Do not throw raw `Error(...)` here.

> **[MEDIUM-9]** Verify the Hono RPC arg shape against an existing call
> site (e.g. `apps/mobile/src/lib/api.ts` usages of `.$post(...)`) before
> committing. The typical shape passes `header` *inside* the first arg
> object: `$post({ json, header })`. The example below assumes that shape;
> match the real client.

```ts
// apps/mobile/src/lib/preview-api.ts
import { client } from './api';
import { getOrCreateDeviceId } from './device-id'; // existing helper, or add a SecureStore-backed UUID
import { assertOkOrThrow } from './api-errors';    // existing typed-error mapper
import type { PreviewClaimInput, PreviewStartInput, PreviewMessageInput } from '@eduagent/schemas';

export async function startPreviewApi(input: PreviewStartInput) {
  const deviceId = await getOrCreateDeviceId();
  const res = await client['preview-onboarding-public'].start.$post({
    json: input,
    header: { 'x-device-id': deviceId },
  });
  await assertOkOrThrow(res); // throws RateLimitedError / BadRequestError / etc.
  return (await res.json()).previewSession;
}

export async function sendPreviewMessageApi(id: string, input: PreviewMessageInput) {
  const deviceId = await getOrCreateDeviceId();
  const res = await client['preview-onboarding-public'][':id'].messages.$post({
    param: { id },
    json: input,
    header: { 'x-device-id': deviceId },
  });
  await assertOkOrThrow(res);
  return await res.json();
}

export async function claimPreviewApi(id: string, input: PreviewClaimInput) {
  const res = await client['preview-onboarding'][':id'].claim.$post({
    param: { id },
    json: input,
  });
  await assertOkOrThrow(res);
  return await res.json();
}
```

If `assertOkOrThrow` does not exist yet, add one to the existing API client wrapper rather than duplicating per-route — the wrapper should already classify 401/403/404/429/5xx into the typed error hierarchy.

- [ ] **Step 3: Commit via `/commit`**

---

### Task 18: Preview lesson server adapter (consume API behind flag)

**Files:**
- Modify: `apps/mobile/src/app/preview/lesson.tsx`
- Modify: `apps/mobile/src/app/preview/lesson.test.tsx`

> This task modifies the scripted lesson from Task 10.5. It must keep the scripted fallback working. Server-backed preview is an enhancement, not a dependency of the front door.

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/app/preview/lesson.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LessonScreen from './lesson';

const startMock = jest.fn();
const sendMock = jest.fn();
jest.mock('../../lib/preview-api', () => ({
  startPreviewApi: (...a: unknown[]) => startMock(...a),
  sendPreviewMessageApi: (...a: unknown[]) => sendMock(...a),
}));

const peekMock = jest.fn();
const saveMock = jest.fn();
jest.mock('../../lib/preview-onboarding-state', () => ({
  peekPreviewOnboardingState: () => peekMock(),
  savePreviewOnboardingState: (...a: unknown[]) => saveMock(...a),
}));

const pushMock = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (p: string) => pushMock(p) },
  Stack: { Screen: () => null },
}));

describe('preview/lesson', () => {
  beforeEach(() => { startMock.mockReset(); sendMock.mockReset(); peekMock.mockReset(); pushMock.mockClear(); });

  it('hides tab bar and shows counter', async () => {
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    startMock.mockResolvedValue({ id: 'pv1', userMessageCount: 0, assistantMessageCount: 0 });
    const { findByTestId, queryByTestId } = render(<LessonScreen />);
    expect(await findByTestId('preview-lesson')).toBeTruthy();
    expect(await findByTestId('preview-lesson-counter')).toBeTruthy();
    expect(queryByTestId('app-tab-bar')).toBeNull();
  });

  it('does not render upload/library/profile controls', async () => {
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    startMock.mockResolvedValue({ id: 'pv1', userMessageCount: 0, assistantMessageCount: 0 });
    const { findByTestId, queryByTestId } = render(<LessonScreen />);
    await findByTestId('preview-lesson');
    expect(queryByTestId('chat-photo-upload')).toBeNull();
    expect(queryByTestId('chat-library-button')).toBeNull();
    expect(queryByTestId('profile-switcher')).toBeNull();
  });

  it('shows save CTA when isAtCap returned', async () => {
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    startMock.mockResolvedValue({ id: 'pv1', userMessageCount: 4, assistantMessageCount: 4 });
    sendMock.mockResolvedValue({
      previewSession: { id: 'pv1', userMessageCount: 5, assistantMessageCount: 5 },
      assistantMessage: { text: 'Nice work.' },
      isAtCap: true,
    });
    const { findByTestId, getByTestId } = render(<LessonScreen />);
    fireEvent.changeText(await findByTestId('preview-lesson-input'), 'ok');
    fireEvent.press(getByTestId('preview-lesson-send'));
    await waitFor(() => expect(getByTestId('preview-lesson-save-cta')).toBeTruthy());
    fireEvent.press(getByTestId('preview-lesson-save-cta'));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ previewSessionId: 'pv1' }));
    expect(pushMock).toHaveBeenCalledWith('/(auth)/sign-up');
  });

  it('falls back to scripted lesson when server preview is disabled', async () => {
    setPreviewLlmEnabled(false);
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    const { findByTestId, queryByTestId } = render(<LessonScreen />);
    expect(await findByTestId('preview-lesson-scripted')).toBeTruthy();
    expect(startMock).not.toHaveBeenCalled();
    expect(queryByTestId('preview-lesson-error')).toBeNull();
  });

  it('falls back to scripted lesson when public start is rate-limited', async () => {
    setPreviewLlmEnabled(true);
    peekMock.mockResolvedValue({ intent: 'self', path: 'learner_lesson', topicText: 'fractions' });
    startMock.mockRejectedValue(new RateLimitedError('Try again later'));
    const { findByTestId } = render(<LessonScreen />);
    expect(await findByTestId('preview-lesson-scripted')).toBeTruthy();
    expect(await findByTestId('preview-lesson-rate-limited-note')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement lesson.tsx**

```tsx
// apps/mobile/src/app/preview/lesson.tsx
// [MEDIUM-10] `Stack` is not exported from `react-native` — only the
// expo-router Stack is used here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Stack as ExpoStack, router } from 'expo-router';
import { peekPreviewOnboardingState, savePreviewOnboardingState } from '../../lib/preview-onboarding-state';
import { startPreviewApi, sendPreviewMessageApi } from '../../lib/preview-api';
import { rememberPendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { isPreviewLlmEnabled } from '../../lib/feature-flags';
import { RateLimitedError } from '../../lib/api-errors';

const MAX_TURNS = 5;

interface Msg { role: 'user' | 'assistant'; text: string; }

export default function LessonScreen() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [userCount, setUserCount] = useState(0);
  const [atCap, setAtCap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // [MEDIUM-5] Only flip on SUCCESS so a failed start can be retried by the
  // user. Without this, the start error is permanent until the screen
  // unmounts.
  const started = useRef(false);

  const startSession = useCallback(async () => {
    if (started.current) return;
    setError(null);
    const s = await peekPreviewOnboardingState();
    if (!isPreviewLlmEnabled()) {
      started.current = true;
      setMessages(scriptedPreviewMessages(s?.topicText));
      return;
    }
    try {
      const session = await startPreviewApi({
        intent: s?.intent ?? 'self',
        topicText: s?.topicText,
      });
      started.current = true;
      await savePreviewOnboardingState({ previewSessionId: session.id });
      setPreviewId(session.id);
      setUserCount(session.userMessageCount);
      if (s?.topicText) {
        setMessages([{ role: 'assistant', text: `Great, let's start with ${s.topicText}. I'll explain one idea, then ask you a quick question.` }]);
      }
    } catch (e) {
      if (e instanceof RateLimitedError) {
        started.current = true;
        setMessages(scriptedPreviewMessages(s?.topicText));
        setError('The live preview is busy, so here is a quick sample lesson instead.');
        return;
      }
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void startSession();
  }, [startSession]);

  const send = async () => {
    if (!previewId || !draft.trim() || busy) return;
    const text = draft.trim();
    setBusy(true); setDraft(''); setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    try {
      const r = await sendPreviewMessageApi(previewId, { text });
      setMessages((m) => [...m, { role: 'assistant', text: r.assistantMessage.text }]);
      setUserCount(r.previewSession.userMessageCount);
      setAtCap(r.isAtCap);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remaining = Math.max(0, MAX_TURNS - userCount);

  const goSignup = async () => {
    await savePreviewOnboardingState({ previewSessionId: previewId ?? undefined });
    rememberPendingAuthRedirect('/(app)/preview/save');
    router.push('/(auth)/sign-up');
  };

  return (
    <View testID="preview-lesson" className="flex-1">
      <ExpoStack.Screen options={{ headerShown: true, title: 'Trial lesson' }} />
      <View className="px-4 py-2 border-b border-border flex-row justify-between">
        <Text testID="preview-lesson-counter" className="text-sm text-muted-foreground">
          Trial lesson: {remaining} questions left
        </Text>
      </View>

      <ScrollView
        testID={previewId ? 'preview-lesson-server-backed' : 'preview-lesson-scripted'}
        className="flex-1 p-4"
      >
        {messages.map((m, i) => (
          <View
            key={i}
            testID={`preview-lesson-msg-${m.role}`}
            className={`mb-3 p-3 rounded-xl ${m.role === 'user' ? 'self-end bg-primary/10' : 'self-start bg-muted'}`}
          >
            <Text>{m.text}</Text>
          </View>
        ))}
        {error ? (
          <View className="mt-2">
            <Text
              testID={error.includes('sample lesson') ? 'preview-lesson-rate-limited-note' : 'preview-lesson-error'}
              className={error.includes('sample lesson') ? 'text-muted-foreground mb-2' : 'text-destructive mb-2'}
            >
              {error}
            </Text>
            {!previewId ? (
              // [MEDIUM-5] Retry CTA when the initial start failed and we
              // have no preview session yet.
              <Pressable
                testID="preview-lesson-retry"
                onPress={startSession}
                className="border border-border px-4 py-2 rounded-xl items-center"
              >
                <Text>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {atCap ? (
        <View className="p-4 border-t border-border">
          <Text className="mb-3">Want me to save this and build your next lesson?</Text>
          <Pressable
            testID="preview-lesson-save-cta"
            onPress={goSignup}
            className="bg-primary px-6 py-3 rounded-xl items-center"
          >
            <Text className="text-primary-foreground font-semibold">Create a profile</Text>
          </Pressable>
        </View>
      ) : (
        <View className="p-3 border-t border-border flex-row gap-2">
          <TextInput
            testID="preview-lesson-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your answer"
            className="flex-1 border border-border rounded-xl px-3 py-2"
          />
          <Pressable
            testID="preview-lesson-send"
            disabled={!draft.trim() || busy}
            onPress={send}
            className="bg-primary px-4 py-2 rounded-xl items-center justify-center"
          >
            <Text className="text-primary-foreground">Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

Add a small helper in the same file or a local `_lib` file:

```ts
function scriptedPreviewMessages(topic?: string): Msg[] {
  const safeTopic = topic?.trim() || 'this topic';
  return [
    {
      role: 'assistant',
      text: `Great, let's start with ${safeTopic}. I'll explain one idea, then ask you a quick question.`,
    },
  ];
}
```

The exact scripted turn implementation can be refined, but the fallback contract is mandatory: no public API call required, no preview session id required, and signup still routes to `/(app)/preview/save`.

- [ ] **Step 4: Run; expect PASS**

- [ ] **Step 5: Commit via `/commit`**

---

### Task 19: Wire confirmation screen to call claim

**Files:**
- Modify: `apps/mobile/src/app/(app)/preview/confirmation.tsx`
- Modify: `apps/mobile/src/app/(app)/preview/confirmation.test.tsx`

- [ ] **Step 1: Extend the test**

```tsx
const claimMock = jest.fn();
jest.mock('../../../lib/preview-api', () => ({
  claimPreviewApi: (...a: unknown[]) => claimMock(...a),
}));

it('calls claim with preview id, target profile, style, length', async () => {
  peekMock.mockResolvedValue({ preferredSaveTarget: 'self', topicText: 'Fractions', previewSessionId: 'pv1' });
  claimMock.mockResolvedValue({ claimed: true, subjectId: 's1', importedTranscript: true, nextRoute: 'session' });
  const { findByTestId } = render(<ConfirmationScreen />);
  fireEvent.press(await findByTestId('confirm-continue'));
  await waitFor(() => expect(claimMock).toHaveBeenCalledWith('pv1', {
    targetProfileId: 'p1',
    saveTarget: 'self',
    sessionStyle: 'step-by-step',
    sessionLengthMinutes: 20,
  }));
});

it('skips claim if no previewSessionId (deterministic fallback or no preview)', async () => {
  peekMock.mockResolvedValue({ preferredSaveTarget: 'self', topicText: 'Fractions' });
  const { findByTestId } = render(<ConfirmationScreen />);
  fireEvent.press(await findByTestId('confirm-continue'));
  await waitFor(() => expect(replaceMock).toHaveBeenCalled());
  expect(claimMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Modify `confirmation.tsx` `finish` function**

```ts
import { claimPreviewApi, reportPreviewClaimFailure } from '../../../lib/preview-api';

const finish = async () => {
  try {
    const s = await peekPreviewOnboardingState();
    if (s?.previewSessionId && activeProfile) {
      await claimPreviewApi(s.previewSessionId, {
        targetProfileId: activeProfile.id,
        saveTarget: target ?? 'self',
        sessionStyle: (params.style as never) ?? 'step-by-step',
        sessionLengthMinutes: Number(params.length ?? 20),
      });
    }
  } catch (e) {
    // [HIGH-6] CLAUDE.md "no silent recovery without escalation": emit a
    // queryable signal (server-side safeSend) so failed claims are visible
    // in the 24h dashboard. Do not block landing on claim failure — the
    // user already has a profile and subject; the missing piece is only
    // transcript import + the analytics signal.
    await reportPreviewClaimFailure({ reason: (e as Error).message ?? 'unknown' });
  }
  await clearPreviewOnboardingState();
  // existing routing branches
};
```

`reportPreviewClaimFailure` is a new mobile→API call that posts to a small endpoint which dispatches via `safeSend()` (see `apps/api/src/services/safe-non-core.ts`) to an Inngest function emitting a `preview.claim_failed` event with `{ accountId, previewSessionId, reason }`. Without this signal, the failure rate of preview claims is invisible.

(Pull `activeProfile` from `useProfile()`.)

- [ ] **Step 3: Run; expect PASS**

- [ ] **Step 4: Commit via `/commit`**

---

### Task 20: E2E smoke flows (Maestro)

**Files:**
- Create: `apps/mobile/e2e/preview-self-learner.yaml`
- Create: `apps/mobile/e2e/preview-parent-child.yaml`
- Create: `apps/mobile/e2e/preview-both-child-first.yaml`
- Create: `apps/mobile/e2e/preview-not-sure.yaml`
- Create: `apps/mobile/e2e/preview-expired-fallback.yaml`

- [ ] **Step 1: Author the self-learner flow**

```yaml
# apps/mobile/e2e/preview-self-learner.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp
- tapOn: { id: 'preview-landing-cta' }
- tapOn: { id: 'preview-intent-me' }
- inputText: 'fractions'
- tapOn: { id: 'preview-topic-submit' }
- assertVisible: { id: 'preview-lesson-counter' }
- assertNotVisible: { id: 'app-tab-bar' }
- inputText: 'I think 1/2 is half'
- tapOn: { id: 'preview-lesson-send' }
# ... continue until cap, then:
- tapOn: { id: 'preview-lesson-save-cta' }
# Sign up via existing seeded test account flow
- runFlow: 'flows/sign-up-seeded.yaml'
- assertVisible: { id: 'preview-save' }
- tapOn: { id: 'save-target-self' }
- tapOn: { id: 'save-target-continue' }
- inputText: 'TestLearner'
- tapOn: { id: 'basics-birth-year' }
- inputText: '2005'
- tapOn: { id: 'basics-submit' }
- tapOn: { id: 'pref-style-step-by-step' }
- tapOn: { id: 'pref-length-20' }
- tapOn: { id: 'pref-continue' }
- tapOn: { id: 'confirm-continue' }
- assertVisible: { id: 'session-screen' }  # or whichever existing testID anchors the session
```

- [ ] **Step 2: Author the other four flows (parent, both-child-first, not-sure, expired)**

Follow the same pattern. For the expired-fallback flow, seed `SecureStore` with an expired `mentomate_preview_onboarding_state` payload before launching.

- [ ] **Step 3: Run locally**

```
pnpm run e2e:preview-self
```

(Follow the project's existing E2E runner — see `feedback_emulator_issues_doc.md` and `project_e2e_emulator_infra.md` for setup.)

- [ ] **Step 4: Commit via `/commit`**

---

### Task 21: Eval harness snapshot for new preview prompts

**Files:**
- Modify: `apps/api/eval-llm/scenarios/<existing scenario directory or new preview scenario file>`

- [ ] **Step 1: Add a preview-onboarding scenario**

Add a scenario file (mirror the shape of the existing 8 wired flows in `apps/api/eval-llm/`):

- intent self, topic "fractions", 3 mock user turns
- assert assistant teaches in first turn (no "tell me your goals")
- assert no "I will remember" / "saved" phrases

- [ ] **Step 2: Run Tier 1 snapshot**

```
pnpm eval:llm
```

Stage updated snapshot files.

- [ ] **Step 3: Run Tier 2 (live LLM) for the preview flow**

```
pnpm eval:llm --live -- --flow preview-onboarding
```

Confirm response validates against `expectedResponseSchema` for the scenario.

- [ ] **Step 4: Commit (snapshots + scenario) via `/commit`**

---

### Task 22: Full validation pass

- [ ] **Step 1: Lint + typecheck**

```
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 2: Surgical tests**

```
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/preview src/app/\(app\)/preview src/lib/preview-onboarding-state.ts --no-coverage
cd apps/api && pnpm exec jest src/services/preview-onboarding src/routes/preview-onboarding --no-coverage
```

- [ ] **Step 3: Cross-package integration tests**

```
pnpm exec nx run-many -t test --projects=api,mobile,schemas
```

- [ ] **Step 4: Change-class checker**

```
bash scripts/check-change-class.sh --branch
```

Address any flagged validation. The change class touches: API routes, mobile auth gate, DB schema, public LLM surface, schemas package — all require integration tests + LLM eval (already covered).

- [ ] **Step 5: Small-screen pass (Galaxy S10e)**

Run the app, walk all preview routes and save wizard on a S10e-sized viewport. Confirm:
- no tab bar visible during preview routes
- counter readable in lesson header
- text inputs not clipped
- buttons reachable without scrolling on each step

- [ ] **Step 6: Confirm spec invariants**

- `services/trial.ts` (billing trial) untouched — preview-onboarding is a different concept (avoid name collision in PR description)
- No direct LLM provider SDK import added
- No `[MARKER]` tokens in preview prompt
- Scripted preview works with server-backed preview disabled
- `PREVIEW_ONBOARDING_LLM_ENABLED` is typed config and defaults false in production
- Hard cap (`MAX_USER_TURNS = 5`) present on server AND enforced via atomic UPDATE (no read-then-write race)
- Public endpoints rate-limited via Cloudflare `ratelimit` binding (NOT in-memory Map)
- Public preview routes fail closed when the feature flag/config is disabled or the rate-limit binding is missing
- `PUBLIC_PATHS` only includes `/v1/preview-onboarding-public/`, not authenticated `/v1/preview-onboarding/`
- Preview funnel events exist for start/message/rate-limit/cap/signup/claim success/claim failure
- Preview state cleared on sign-out, on successful claim, AND on existing-user sign-in (see HIGH-2)
- ParentHomeScreen and LearnerScreen unchanged
- Profile creation in the wizard uses persisted `parentProfileId` so retries cannot duplicate the parent
- Claim service uses real consent lookup (`getConsentStatus` → `'CONSENTED'`), not a non-existent `profile.consentStatus` field
- `claimedSubjectId` column exists from the first migration; no second migration required
- No raw `Error(...)` thrown from `preview-api.ts` helpers — all errors flow through the typed-error mapper
- Claim failure escalates via `safeSend()` → `preview.claim_failed`, never `console.warn` alone

- [ ] **Step 7: Commit any cleanups via `/commit`**

---

## Acceptance Criteria Coverage

| Spec AC | Covered by |
| --- | --- |
| 1. Signed-out user sees intent screen | Task 3 |
| 2. "Me" → fractions → full-screen lesson with counter | Tasks 4, 10.5, 18 |
| 3. "My child" → parent setup default | Task 4 (`parent.tsx`) |
| 4. "Both" → "My child first" recommended | Task 4 (`both.tsx`) |
| 5. Lesson cap stops chat with save CTA | Task 10.5 scripted cap; Tasks 14, 18 server-backed cap |
| 6. Signup returns to save wizard | Task 5 + Task 10.5/18 (`rememberPendingAuthRedirect`) |
| 7. Self save → owner profile + topic attached | Tasks 8, 19 |
| 8. Child save → parent then child, parent active | Task 8 |
| 9. Parent flow lands on parent home | Task 10 |
| 10. Save target overrides pre-signup intent | Task 7 |
| 11. Expired preview state → friendly fallback | Task 1 (24h TTL) + Task 5 (gate falls back to CreateProfileGate) + Task 20 (E2E) |
| 12. No preview state → existing CreateProfileGate | Task 5 |
| 13. Bottom navigation stable after creation | No change to tabs; verified in Task 22 step 6 |
| 14. Parent home reuses existing actions | No change (Phase 4 deferred) |
| 15. Empty states point to existing next action | Reuses existing home empty states |

---

## Failure Mode Coverage

| Spec failure mode | Covered by |
| --- | --- |
| Preview state expires during signup | Task 1 (TTL), Task 5 (gate fallback), Task 20 (E2E) |
| User changes target on save | Task 7 |
| Parent first-child free-tier allowance | Reuses `createProfileWithLimitCheck()` (Task 8) |
| Child consent PENDING blocks transcript import (out-of-scope path only) | Task 14 service-level test; **[CRITICAL-3]** wizard's parent→child creation cannot produce PENDING — gate exists for correctness in other entry paths only |
| Public preview abuse | **[CRITICAL-1]** Cloudflare `ratelimit` binding via Task 12; in-memory was non-functional on Workers and has been removed |
| Public LLM quota bypass | Cloudflare ratelimit binding + Task 14 hard cap (atomic UPDATE per [MEDIUM-1]) |
| Server-backed preview accidentally enabled too early | Risk-reduction stop gates + Task 12.5 typed config default false + Task 15 fail-closed public route |
| Rate-limit binding missing/misconfigured | Task 12 wrapper throws typed error; Task 15 fail-closed test; scripted preview fallback remains available |
| Server-backed preview disabled in production | Task 10.5 scripted preview + Task 18 fallback mean the acquisition flow still works without public LLM |
| Web refresh during preview | SecureStore-backed state (Task 1); restoring previewSessionId allows continuation |
| OAuth signup returns before profiles load | Task 5 gate waits for `previewReady` + existing profile loading; no preview-specific change |
| **[HIGH-2]** Existing-account user signs in mid-preview (not new-account sign-up) | Task 5 clears preview state on `activeProfile && hasPreview` and falls through to normal home; test added in Task 5 |
| Duplicate claim | Task 14 idempotent claim by `claimedAt + claimedByAccountId`; **[HIGH-3]** returns original `claimedSubjectId` (column added in Task 13 from the start) |
| Both target fails second profile | **[CRITICAL-4]** Task 8 persists `parentProfileId` to preview state so re-entry skips parent creation; child step is retryable without duplicating parent |
| Parent stale-cache lands on learner home | Task 8 invalidates `['profiles']` after creation; Task 10 reads `profiles` fresh |
| Claim API call fails after signup | **[HIGH-6]** Task 19 emits `preview.claim_failed` via `safeSend()` so failure rate is visible in 24h dashboard |
| Preview start API fails (network, 429) | **[MEDIUM-5]** Task 18 retry CTA; `started.current` flips only on success |
| Concurrent preview turn race | **[MEDIUM-1]** Atomic UPDATE…WHERE in Task 14 — two requests cannot both pass the cap check |
| Non-owner selects "both" | **[MEDIUM-3]** Task 14 `nextRouteFor` throws `BadRequestError` instead of silently routing to learner-self |
| Corrupted preview state in SecureStore | **[MEDIUM-6]** Zod `safeParse` in Task 1 deletes the entry and returns null |
| "Trial" confused with billing trial | Internal naming is `preview-onboarding`; only `Trial lesson` header in `lesson.tsx` |
| No separate-device child link | Phase 3 deferred; on-device child creation only |

---

## Deferred Follow-Ups (not in this plan)

- **Phase 3:** Separate-device child link/invite. Add only when a family-invite backend exists.
- **Phase 4:** ParentHomeScreen reordering (Today → Children → Family). Run only if implementation review shows overwhelm.
- **Server-side preview state mirror:** Currently SecureStore-only; if web preview becomes important, mirror minimal state server-side.
- **Voice in preview:** Spec says text-first for v1; add voice after consent and account state are clear.
