# Learn-this-too Bridge — Missing Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Adversarial Review (added 2026-05-23, before execution)

A grounded review against the code on branch `nav-dependency` (NOT `finalize-contract` as originally written) surfaced findings the executor must read before starting. Severity rules from CLAUDE.md "Fix Development Rules" apply.

### Pass 1 — Must address (CRITICAL/HIGH)

- **[C1] Task 1 is already done.** `child/[profileId]/topic/[topicId].tsx:260-267` already renders `<AddToMyLearningButton>` with the correct props (`childProfileId`, `topicId`, `topicTitle`, `subjectName`, `childDisplayName`, `triggerPath`). `[topicId].test.tsx:65-97` already asserts the prop bag via a mock. Landed in commit `1d952851a` ("parent-bridge Add-to-My-Learning UI — button, provenance, clone hook, recap detail screen"). **Action:** SKIP Task 1 entirely. Do not "extend" the existing test with the proposed mock — the proposed `useProfileSessions: () => ({ data: { child, topic, sessions } })` does not match the real hook (which returns an array at `[topicId].tsx:125` via `sessions?.filter(...)`). Replacing the existing test would break a working assertion.
- **[C2] Integration-test schema inserts are wrong; they will fail typecheck and at runtime.** `packages/database/src/schema/sessions.ts:124-178` shows:
  - No `mode` column — the column is `sessionType` (enum `'learning' | 'homework' | 'interleaved'`). Plan repeatedly writes `mode: 'relearn'`.
  - `sessionStatusEnum` (`sessions.ts:59-64`) values are `'active' | 'paused' | 'completed' | 'auto_closed'`. Plan writes `status: 'in_progress'`.
  - `learning_sessions.subject_id` is `notNull()` — plan omits it.
  - `needs_deepening_topics.subject_id` is `notNull()` (`assessments.ts:157-159`) — plan omits it.
  **Action:** Tasks 5 & 6 have been updated inline to omit invalid `mode`, use `status: 'active'` (or the actual completed/started value the service writes), include `subjectId`, and to **start sessions via `startRelearn` rather than hand-writing rows** when possible (the spec already cites `startRelearn` at `apps/api/src/services/retention-data.ts:931-990`).
- **[C3] `cleanupAccounts([PARENT_EMAIL])` does not match the helper signature.** `tests/integration/helpers.ts:45-48` takes an object `{ emails?: string[]; clerkUserIds?: string[] }`. The plan calls it positionally with an array four times. **Action:** Updated inline to `cleanupAccounts({ emails: [PARENT_EMAIL] })`.
- **[H1] Maestro flow uses wrong button testID.** `AddToMyLearningButton.tsx:190` exposes `add-to-my-learning-button` (the inner Pressable). `add-to-my-learning` at line 157 is the container View — not tappable in Maestro's hit-testing. Plan's `tapOn: { id: "add-to-my-learning" }` will fail. **Action:** Updated Task 7 inline. Step 2's "if testID is missing, add one" is mostly moot: the toast container testID (`add-to-my-learning-toast`) already exists at `AddToMyLearningButton.tsx:32`. The only testID that may need adding is `session-screen` — verify before patching.
- **[H2] Task 3 file extension is wrong.** Proposed file `use-clone-from-child.test.ts` contains JSX (`<QueryClientProvider>`). TS rejects JSX in `.ts`. **Action:** Renamed to `use-clone-from-child.test.tsx` inline.
- **[H3] Branch reference was stale (`finalize-contract` → `nav-dependency`).** Corrected in the Goal line.

### Pass 2 — Safer follow-up tightening (MEDIUM)

- **[M1] Task 2 assertion shape.** `tree.getByTestId('relearn-parent-bridge-header').props.children` returns a `<Text>` element, not the rendered string (see `relearn.tsx:570-578` — Text is wrapped in a View). `.toMatch` against an element silently never matches. **Action:** Use `screen.getByText(/Added from Ada's learning\./)` instead. Updated inline.
- **[M2] Task 1's recommended `triggerPath = usePathname()` would break `triggerSurface()` regex.** `usePathname()` returns the Expo Router template (`/child/[profileId]/topic/[topicId]`), not the runtime path. The hook's `triggerSurface(triggerPath)` (`use-clone-from-child.ts:61-72`) uses `/^\/recaps\//` / `/^\/child\//` literal-segment matching — bracket-segment input would fall to the `family_child` default and lose analytics granularity. Existing screens (`session/[sessionId].tsx:365`, `topic/[topicId].tsx:266`) build the literal string by hand. Since Task 1 is being deleted, this is moot, but the convention is documented here so future trigger surfaces follow it.
- **[M3] Task 6 should cite the FK option directly.** `packages/database/src/schema/subjects.ts:182` declares `sourceChildProfileId` with the reference + `onDelete` option. Inline the citation so a reviewer can verify `set null` semantics without grepping. Updated inline.
- **[M4] Task 4 force-copy route test relies on a 3-arg call shape that matches existing test at `curriculum.test.ts:231`** — fine, but the new test should mirror that destructuring exactly. No code change; just flagged for the executor.

### Out of scope / acknowledged

- Schema column `source_child_profile_id` exists with the documented FK option.
- Hook branches in `use-clone-from-child.ts:258-365` do cover all toast variants the Task 3 tests assert.
- `helpers.ts` exposes `createIntegrationDb()` and `cleanupAccounts(...)` as the plan claims.
- The relearn `isParentBridgeSource` branch and `source` URL param are already wired (`relearn.tsx:139-140, 570-579`).

---

**Goal:** Close the remaining concrete gaps between `docs/specs/2026-05-23-learn-this-too-bridge.md` and the code currently on branch `nav-dependency`: resolve the actual source-child name in the relearn header, add the missing service/hook/integration/E2E tests, and broaden API state-matrix coverage. (Task 1 — wiring `<AddToMyLearningButton>` into child topic detail — was already shipped in commit `1d952851a` and is therefore removed from the executable plan; see [C1] above.)

**Architecture:** The remaining gaps are additive — no behavior changes to the existing bridge transaction in `apps/api/src/services/family-bridge.ts` and no new routes. The remaining UI work threads `childProfileId` through the `Open` URL so the relearn header can resolve the name with the same `useLinkedChildren()` helper that powers `<TopicProvenance>`. Test work is split into four files: a service-level matrix in `family-bridge.test.ts` (covers the divergent/in-progress/completed/forceCopy/idempotency branches under a real Drizzle-mock), a hook test in `use-clone-from-child.test.ts`, and two new integration tests that exercise the real Postgres path (one happy + GDPR-cascade follow-up).

**Tech Stack:** TypeScript, Hono (API), React Native + Expo Router (mobile), Drizzle ORM, React Query, Jest + React Native Testing Library, Maestro (E2E), Postgres (Neon).

**Spec section ↔ Task map:**

| Gap (from user) | Spec reference | Task |
|---|---|---|
| No child curriculum trigger surface wired | §UI Flow → Trigger placement (row 2 of table) | Task 1 (already done; historical only) |
| Relearn header generic, not resolved to child name | §Relearn Screen Adjustments §3 | Task 2 |
| No `use-clone-from-child.test.ts` | §Mobile Implementation → Test coverage | Task 3 |
| No `tests/integration/family-bridge.integration.test.ts` | §Mobile Implementation → Test coverage; §Implementation Sequence Step 2 | Task 5 |
| No `tests/integration/family-bridge-gdpr.integration.test.ts` | §Authorization §5 + §Implementation Sequence Step 2 (H1 verification) | Task 6 |
| API route tests only cover happy/404/undo | §Adult-side write resolve-or-create matrix + §UI Flow already-cloned sub-cases | Task 4 |
| No Maestro bridge E2E | §Implementation Sequence Step 8 | Task 7 |

---

## File Structure

### Files created

- `apps/api/src/services/family-bridge.test.ts` — service-level matrix test (mocked DB via existing factories) covering force-copy, idempotency cache, divergent + started, divergent + unstarted refresh, in_progress, completed.
- `apps/mobile/src/hooks/use-clone-from-child.test.ts` — hook lifecycle + every toast variant + force-copy retry + navigation params.
- `tests/integration/family-bridge.integration.test.ts` — real DB; two profiles linked; full clone → assert adult curriculum rows + `source = 'parent_bridge'` + `source_child_profile_id` set + `returnTo` round-trip is preserved through the URL.
- `tests/integration/family-bridge-gdpr.integration.test.ts` — real DB; clone, then delete child profile; assert `source_child_profile_id` set null and adult's `curriculum_topics` row survives.
- `apps/mobile/e2e/flows/parent/family-bridge-clone.yaml` — Maestro flow from Recaps detail through `Add to my learning` → toast `Open` → relearn fresh-topic → method pick → device-back returns to recap.

### Files modified

- `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx` — render `<AddToMyLearningButton>` below the topic header (mirrors the wiring in `child/[profileId]/session/[sessionId].tsx:359`).
- `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].test.tsx` — assert button renders behind the gate.
- `apps/mobile/src/hooks/use-clone-from-child.ts` — add `sourceChildProfileId` to the `OpenTarget` URL params so the relearn screen can resolve the child name.
- `apps/mobile/src/app/(app)/topic/relearn.tsx` — replace the hardcoded "Added from your child's learning." (line 576) with a resolver that reads the new `childProfileId` URL param and the topic row, then formats with `useLinkedChildren()`.
- `apps/mobile/src/app/(app)/topic/relearn.test.tsx` — new test cases for the resolved/unresolved/null-source branches of the header.
- `apps/api/src/routes/curriculum.test.ts` — extend the existing route-level coverage with the explicit error cases the route layer owns (validation of `requestId`, FK undo failure, force-copy round-trip).
- `apps/api/src/services/test-seed.ts` — add a `parent-bridge-recap` seed scenario for the Maestro flow.

---

## Task 1 — Wire AddToMyLearningButton into child topic detail — **ALREADY DONE, DO NOT EXECUTE**

> ⚠️ **Resolved before this plan was written.** See `[C1]` in the Adversarial Review at the top of this file. The wiring landed in commit `1d952851a`:
> - `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:260-267` renders `<AddToMyLearningButton>` with the expected prop bag.
> - `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].test.tsx:65-97` asserts the prop bag via the mock `mockAddToMyLearningButton`.
>
> The remainder of this section is kept for historical reference only. **Skip to Task 2.** Do NOT extend the existing test with the proposed `useProfileSessions` mock — the proposed shape does not match the real hook and would break a currently-green assertion.

<details>
<summary>Original (now obsolete) Task 1 content</summary>

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx`
- Test: `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].test.tsx`

**Context:** The spec lists three trigger surfaces (`recaps/[recapId]`, child curriculum topic detail, child session detail). Today `<AddToMyLearningButton>` is rendered on `recaps/[recapId].tsx:160` and `child/[profileId]/session/[sessionId].tsx:359` but NOT on `child/[profileId]/topic/[topicId].tsx`. The spec notes the eventual nav-contract PR 5 will introduce a `child/[profileId]/curriculum/...` path, but the existing topic-detail route is the available surface today and the spec says "exact route TBD with PR 5" — wire it here now; PR 5 can rename or move the trigger without losing coverage.

The button mounts unconditionally inside the component — `<AddToMyLearningButton>` itself reads `useNavigationContract().gates.showLearnThisToo` and returns `null` when the gate is false, so no extra guard is needed in the host screen.

- [ ] **Step 1: Write the failing test**

Replace or extend `child/[profileId]/topic/[topicId].test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('../../../../../hooks/use-progress', () => ({
  useProfileSessions: () => ({
    data: {
      child: { profileId: 'child-1', displayName: 'Ada' },
      topic: { topicId: 'topic-1', title: 'Photosynthesis', subjectName: 'Science', completionStatus: 'in_progress' },
      sessions: [],
    },
    isLoading: false,
    isError: false,
  }),
}));

jest.mock(
  '../../../../../components/family/AddToMyLearningButton',
  /* gc1-allow: screen-level test — component has external boundaries (AsyncStorage, API client) tested separately in AddToMyLearningButton.test.tsx */
  () => ({ AddToMyLearningButton: () => null }),
);

// remaining jest.mocks copied from the existing test file (router, contract, etc.)

import ChildTopicDetailScreen from './[topicId]';

describe('child/[profileId]/topic/[topicId] — bridge wiring', () => {
  it('renders <AddToMyLearningButton> with the topic + child context', () => {
    const tree = render(<ChildTopicDetailScreen />);
    expect(
      tree.getByTestId('child-topic-add-to-my-learning'),
    ).toBeTruthy();
  });
});
```

(Adjust the surrounding mock block to match the file's existing test fixture if it already exists. If it doesn't, copy the same pattern used in `[topicId].test.tsx`-equivalent peers — e.g. `[subjectId].test.tsx` in the sibling directory.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/child/\[profileId\]/topic/\[topicId\].test.tsx --no-coverage`
Expected: FAIL with "Unable to find element with testID: child-topic-add-to-my-learning"

- [ ] **Step 3: Add the button to the topic detail screen**

In `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx`, after the existing topic header block (around the spot where `subjectName` / topic title is rendered, before the sessions list), insert:

```tsx
import { AddToMyLearningButton } from '../../../../../components/family/AddToMyLearningButton';
import { usePathname } from 'expo-router';

// inside the component:
const pathname = usePathname();
// ... existing rendering ...

{topic && childProfile ? (
  <View className="px-4 pb-3" testID="child-topic-add-to-my-learning">
    <AddToMyLearningButton
      childProfileId={childProfile.profileId}
      topicId={topic.topicId}
      topicTitle={topic.title}
      subjectName={topic.subjectName}
      childDisplayName={childProfile.displayName}
      triggerPath={pathname}
    />
  </View>
) : null}
```

(Use whatever destructured shape `useProfileSessions().data` exposes for child + topic — match the existing variable names in the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/child/\[profileId\]/topic/\[topicId\].test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

Use `/commit`.

</details>

---

## Task 2 — Resolve actual child name in relearn header

**Files:**
- Modify: `apps/mobile/src/hooks/use-clone-from-child.ts:155-173` (add `sourceChildProfileId` to URL params)
- Modify: `apps/mobile/src/app/(app)/topic/relearn.tsx:570-578` (resolve via `useLinkedChildren`)
- Test: `apps/mobile/src/app/(app)/topic/relearn.test.tsx`

**Context:** Spec §Relearn Screen Adjustments §3 requires the header to read "Added from {{childName}}'s learning." with `childName` resolved from `source_child_profile_id` on the topic. Today the header is hardcoded "Added from your child's learning." (`relearn.tsx:576`). The simplest non-invasive resolution is to thread the source child's profile ID through the toast `Open` URL — `useCloneFromChild` already has it on every clone — then `relearn.tsx` looks it up via `useLinkedChildren()` (the same helper used in `<TopicProvenance>` at `TopicProvenance.tsx:27-34`).

Spec falls back to "Added from a child's learning" (or omit) when the column is null. Mirror that here for the URL-param-missing branch.

- [ ] **Step 1: Write the failing test**

In `apps/mobile/src/app/(app)/topic/relearn.test.tsx`, add inside the existing `describe`:

```tsx
import { useLinkedChildren } from '../../../lib/profile';

jest.mock('../../../lib/profile', () => {
  const actual = jest.requireActual('../../../lib/profile');
  return {
    ...actual,
    useLinkedChildren: jest.fn(),
  };
});

describe('parent-bridge header', () => {
  beforeEach(() => {
    (useLinkedChildren as jest.Mock).mockReturnValue([
      { id: 'child-7', displayName: 'Ada' },
    ]);
  });

  it("renders the resolved child's name when childProfileId is in URL", () => {
    // mock useLocalSearchParams to return source=parent_bridge + childProfileId=child-7
    const tree = renderWithDirectEntry({ source: 'parent_bridge', childProfileId: 'child-7' });
    // [M1] getByTestId(...).props.children returns the <Text> element, not the
    // rendered string. Use getByText against the substring instead.
    expect(tree.getByText(/Added from Ada's learning\./)).toBeTruthy();
  });

  it('falls back to generic copy when childProfileId is missing from URL', () => {
    const tree = renderWithDirectEntry({ source: 'parent_bridge' });
    expect(tree.getByText(/Added from a child's learning\./)).toBeTruthy();
  });

  it("falls back to generic copy when child is no longer linked (deleted)", () => {
    (useLinkedChildren as jest.Mock).mockReturnValue([]);
    const tree = renderWithDirectEntry({ source: 'parent_bridge', childProfileId: 'child-deleted' });
    expect(tree.getByText(/Added from a child's learning\./)).toBeTruthy();
  });
});
```

(Use whatever `renderWithDirectEntry`/`useLocalSearchParams`-mock pattern the existing test file already uses; if there is no helper, inline the mock for `useLocalSearchParams` like the sibling tests do.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/topic/relearn.test.tsx --no-coverage`
Expected: FAIL — the matcher hits the hardcoded "your child's" string for the resolved case.

- [ ] **Step 3: Thread childProfileId through the toast `Open` URL**

In `apps/mobile/src/hooks/use-clone-from-child.ts`, extend `OpenTarget` and the `openTarget` writer:

```ts
type OpenTarget = {
  topicId: string;
  subjectId: string;
  topicTitle?: string | null;
  subjectName?: string | null;
  childProfileId: string;          // NEW
  returnTarget: BridgeReturnTarget;
};

// inside openTarget(...)
router.push({
  pathname: '/(app)/topic/relearn',
  params: {
    topicId: target.topicId,
    subjectId: target.subjectId,
    ...(target.topicTitle ? { topicName: target.topicTitle } : {}),
    ...(target.subjectName ? { subjectName: target.subjectName } : {}),
    childProfileId: target.childProfileId,     // NEW
    returnTo: target.returnTarget.returnTo,
    ...(target.returnTarget.returnId
      ? { returnId: target.returnTarget.returnId }
      : {}),
    source: 'parent_bridge',
  },
} as Href);
```

And populate `childProfileId` in the two places where an `OpenTarget` is built (`cloneMutation.onSuccess` constructs the canonical target). It's already in `args.childProfileId` — pass it through.

- [ ] **Step 4: Read the new param + resolve in relearn**

In `apps/mobile/src/app/(app)/topic/relearn.tsx`:

```tsx
import { useLinkedChildren } from '../../../lib/profile';

const params = useLocalSearchParams<{
  // ... existing fields ...
  childProfileId?: string | string[];
}>();
const sourceChildProfileId = firstParam(params.childProfileId);
const linkedChildren = useLinkedChildren();
const sourceChildName = useMemo(
  () =>
    sourceChildProfileId
      ? linkedChildren.find((child) => child.id === sourceChildProfileId)?.displayName
      : undefined,
  [linkedChildren, sourceChildProfileId],
);

// replace the hardcoded Text at line 575-577:
<Text className="text-body-sm font-semibold text-text-primary">
  {sourceChildName
    ? `Added from ${sourceChildName}'s learning.`
    : "Added from a child's learning."}
</Text>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/topic/relearn.test.tsx src/hooks/use-clone-from-child.ts --no-coverage`
Expected: PASS for the three new cases + existing relearn tests still green.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

Use `/commit`.

---

## Task 3 — `use-clone-from-child.test.tsx`

**Files:**
- Create: `apps/mobile/src/hooks/use-clone-from-child.test.tsx`  <!-- [H2] .tsx — file contains JSX (QueryClientProvider). -->

**Context:** The hook currently has no test file (verified via `ls apps/mobile/src/hooks/use-clone-from-child*` returning only the source). Spec §Mobile Implementation → Test coverage lists: "mutation lifecycle, all toast variants, navigation on success, error toasts, undo session-started variant, force-copy path." `<AddToMyLearningButton>` already has a separate test — this is hook-specific coverage.

The hook calls `useApiClient()` which is an external boundary (Hono RPC) and `Crypto.randomUUID()` which is `expo-crypto` (external). Both should be mocked here — they cannot be exercised in a node jest environment. `useLinkedChildren`/`useProfile` are internal and should be exercised via `jest.requireActual()` if possible.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/hooks/use-clone-from-child.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useCloneFromChild } from './use-clone-from-child';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockProfileId = 'adult-1';
jest.mock('../lib/profile', () => {
  const actual = jest.requireActual('../lib/profile');
  return {
    ...actual,
    useProfile: () => ({ activeProfile: { id: mockProfileId } }),
  };
});

const mockTrack = jest.fn();
jest.mock('../lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  hashProfileId: (id: string) => `hash-${id}`,
}));

const cloneEndpoint = jest.fn();
const undoEndpoint = jest.fn();
jest.mock('../lib/api-client', () => {
  const actual = jest.requireActual('../lib/api-client');
  return {
    ...actual,
    useApiClient: () => ({
      curriculum: {
        'clone-from-child': {
          $post: (...args: unknown[]) => cloneEndpoint(...args),
          undo: { $delete: (...args: unknown[]) => undoEndpoint(...args) },
        },
      },
    }),
  };
});

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseArgs = {
  childProfileId: 'child-1',
  topicId: 'topic-1',
  topicTitle: 'Photosynthesis',
  subjectName: 'Science',
  childDisplayName: 'Ada',
  triggerPath: '/recaps/recap-99',
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  (Crypto.randomUUID as jest.Mock).mockReturnValue('req-uuid-1');
  cloneEndpoint.mockReset();
  undoEndpoint.mockReset();
  mockPush.mockReset();
  mockTrack.mockReset();
});

describe('useCloneFromChild', () => {
  it('renders the "newly cloned" toast with Undo when createdIds.topicId is set', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99',
      subjectId: 'subj-7',
      alreadyExisted: false,
      descriptionDivergent: false,
      descriptionRefreshed: false,
      topicState: 'unstarted',
      createdIds: { topicId: 'topic-99', subjectId: 'subj-7' },
    }));

    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast).not.toBeNull());

    expect(result.current.toast?.message).toMatch(/Added "Photosynthesis" to your Science/);
    expect(result.current.toast?.secondaryAction?.testID).toBe('clone-toast-undo');
  });

  it('renders the "already existed, unstarted" variant', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: true, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'unstarted', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast).not.toBeNull());
    expect(result.current.toast?.message).toMatch(/already in your Science/);
    expect(result.current.toast?.secondaryAction).toBeUndefined();
  });

  it('renders the "description divergent + started" variant with [Add separate copy]', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: true, descriptionDivergent: true, descriptionRefreshed: false,
      topicState: 'in_progress', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast).not.toBeNull());
    expect(result.current.toast?.message).toMatch(/their version reads differently/);
    expect(result.current.toast?.primaryAction?.label).toBe('Open my copy');
    expect(result.current.toast?.secondaryAction?.testID).toBe('clone-toast-force-copy');
  });

  it('renders the "completed" variant with [Review]', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: true, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'completed', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.primaryAction?.label).toBe('Review'));
  });

  it('renders the "in_progress" variant with [Resume]', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: true, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'in_progress', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.primaryAction?.label).toBe('Resume'));
  });

  it('renders the "description refreshed" variant', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: true, descriptionDivergent: false, descriptionRefreshed: true,
      topicState: 'unstarted', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.message).toMatch(/Updated "Photosynthesis"/));
  });

  it('navigates Open → /(app)/topic/relearn with parent_bridge + childProfileId param', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 'topic-99', subjectId: 'subj-7',
      alreadyExisted: false, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'unstarted', createdIds: { topicId: 'topic-99' },
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.primaryAction).toBeDefined());
    act(() => { result.current.toast!.primaryAction!.onPress(); });

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(app)/topic/relearn',
      params: expect.objectContaining({
        topicId: 'topic-99',
        subjectId: 'subj-7',
        source: 'parent_bridge',
        childProfileId: 'child-1',          // Task 2's threaded param
        returnTo: expect.any(String),
        returnId: 'recap-99',
      }),
    }));
  });

  it('re-issues a clone with forceCopy:true when the secondary action is tapped', async () => {
    cloneEndpoint
      .mockReturnValueOnce(jsonResponse({
        topicId: 't', subjectId: 's',
        alreadyExisted: true, descriptionDivergent: true, descriptionRefreshed: false,
        topicState: 'in_progress', createdIds: {},
      }))
      .mockReturnValueOnce(jsonResponse({
        topicId: 't2', subjectId: 's',
        alreadyExisted: false, descriptionDivergent: false, descriptionRefreshed: false,
        topicState: 'unstarted', createdIds: { topicId: 't2' },
      }));

    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.secondaryAction?.testID).toBe('clone-toast-force-copy'));
    act(() => { result.current.toast!.secondaryAction!.onPress(); });

    await waitFor(() => expect(cloneEndpoint).toHaveBeenCalledTimes(2));
    expect(cloneEndpoint.mock.calls[1][0]).toMatchObject({ json: expect.objectContaining({ forceCopy: true }) });
  });

  it('shows the session-started error toast when undo returns reason=session_started', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 't', subjectId: 's',
      alreadyExisted: false, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'unstarted', createdIds: { topicId: 't' },
    }));
    undoEndpoint.mockReturnValue(jsonResponse({ deleted: { topic: false }, reason: 'session_started' }));

    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.secondaryAction?.testID).toBe('clone-toast-undo'));
    act(() => { result.current.toast!.secondaryAction!.onPress(); });

    await waitFor(() => expect(result.current.toast?.kind).toBe('error'));
    expect(result.current.toast?.message).toMatch(/already opened this topic/);
  });

  it('passes the client-generated requestId in the clone body', async () => {
    (Crypto.randomUUID as jest.Mock).mockReturnValueOnce('req-uuid-42');
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 't', subjectId: 's',
      alreadyExisted: false, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'unstarted', createdIds: { topicId: 't' },
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(cloneEndpoint).toHaveBeenCalled());
    expect(cloneEndpoint.mock.calls[0][0]).toMatchObject({
      json: expect.objectContaining({ requestId: 'req-uuid-42' }),
    });
  });

  it('emits the add_to_my_learning.bridge analytics event on every tap', async () => {
    cloneEndpoint.mockReturnValue(jsonResponse({
      topicId: 't', subjectId: 's',
      alreadyExisted: true, descriptionDivergent: false, descriptionRefreshed: false,
      topicState: 'unstarted', createdIds: {},
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('add_to_my_learning.bridge', expect.objectContaining({
      adultProfileHash: 'hash-adult-1',
      childProfileHash: 'hash-child-1',
      alreadyExisted: true,
      triggerSurface: 'recaps_detail',
    })));
  });

  it('renders the 404 error toast', async () => {
    cloneEndpoint.mockReturnValue(Promise.resolve({
      ok: false, status: 404,
      json: async () => ({ error: 'Topic not found' }),
      text: async () => 'Topic not found',
    }));
    const { result } = renderHook(() => useCloneFromChild(), { wrapper: wrap });
    act(() => { result.current.cloneFromChild(baseArgs); });
    await waitFor(() => expect(result.current.toast?.kind).toBe('error'));
    expect(result.current.toast?.message).toMatch(/no longer available/);
  });
});
```

- [ ] **Step 2: Run test to verify everything passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-clone-from-child.test.tsx --no-coverage`
Expected: PASS (12 cases).

If a case fails, the failure is information about the hook — investigate before changing the test (CLAUDE.md "Tests Must Reflect Reality"). The hook implementation may already cover the case correctly; the test fixture may need to match (e.g. the exact `assertOk` error class).

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

Use `/commit`.

---

## Task 4 — Broaden API/service state-matrix coverage

**Files:**
- Create: `apps/api/src/services/family-bridge.test.ts`
- Modify: `apps/api/src/routes/curriculum.test.ts` (add three route-level cases the service test cannot reach)

**Context:** The spec resolve-or-create matrix has eight observable outcomes:

| Branch | Description |
|---|---|
| Newly cloned | No existing topic. Insert. `alreadyExisted=false`. |
| Already existed, same hash | Match + same description. No write. |
| Already existed, diverged + unstarted | Match + different description, no session, no queue → refresh description, `descriptionRefreshed=true`. |
| Already existed, diverged + in_progress | Match + different description + session exists → keep existing, `descriptionDivergent=true`. |
| Already existed, diverged + completed | Match + different description + session completed → keep existing, `descriptionDivergent=true`. |
| Force copy | `forceCopy=true` skips name dedup, title becomes `"X (from ChildName)"`. |
| Idempotency cache hit | Same `requestId` within 60s → returns cached response without re-running the transaction. |
| ON CONFLICT race | INSERT returns empty (concurrent winner) → re-select returns same row, treated as `alreadyExisted=true`. |

Route-layer tests today (`curriculum.test.ts:200-294`) cover the first happy path + 404 + undo by mocking `cloneTopicFromChild`/`undoCloneFromChild`. Those mocks are correct at the **route** layer (they prove parameter passing + auth + status codes) but they do not exercise the matrix above — that work belongs at the **service** layer where the Drizzle queries run.

Per CLAUDE.md "GC1 — No new internal `jest.mock()`", the service test must NOT mock its own DB. Two acceptable approaches:

- **Approach A (recommended):** use the in-memory Postgres harness if one already exists in this repo (search `tests/integration/helpers.ts`). If yes, lift its `createIntegrationDb()` into a unit test by treating this as a service-level integration test and naming it `family-bridge.integration.test.ts` instead. The service has no LLM call so it runs in milliseconds.
- **Approach B:** if no in-memory harness, the service test is genuinely an integration test. Combine it with Task 5 — same file, more cases.

Decide between Approach A and B during Step 1 by inspecting `tests/integration/helpers.ts`. **If you find `createIntegrationDb` returns a real Neon-pointed Database, use Approach B — fold all matrix cases into `tests/integration/family-bridge.integration.test.ts` (Task 5) and delete this file's plan to avoid mocking internal DB.**

Assuming Approach B is the path (most likely, based on `tests/integration/family-pool-breakdown.integration.test.ts:69` calling `createIntegrationDb()`), the route-test additions below are still needed.

### Sub-task 4a — Route-layer additions

- [ ] **Step 1: Add a force-copy round-trip case to `curriculum.test.ts`**

In `apps/api/src/routes/curriculum.test.ts`, after the existing `'returns 404 for missing or inaccessible source topics'` test:

```ts
it('passes forceCopy=true through to the service', async () => {
  mockCloneTopicFromChild.mockResolvedValueOnce({
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    alreadyExisted: false,
    descriptionDivergent: false,
    descriptionRefreshed: false,
    topicState: 'unstarted',
    createdIds: { topicId: TOPIC_ID },
  });

  const res = await app.request(
    '/v1/curriculum/clone-from-child',
    {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        requestId: REQUEST_ID,
        forceCopy: true,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(200);
  const [, , inputArg] = mockCloneTopicFromChild.mock.calls[0];
  expect(inputArg).toMatchObject({ forceCopy: true });
});

it('rejects requests missing requestId with 400', async () => {
  const res = await app.request(
    '/v1/curriculum/clone-from-child',
    {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ childProfileId: CHILD_PROFILE_ID, topicId: TOPIC_ID }),
    },
    TEST_ENV,
  );
  expect(res.status).toBe(400);
  expect(mockCloneTopicFromChild).not.toHaveBeenCalled();
});

it('propagates undo session_started reason to the response body', async () => {
  mockUndoCloneFromChild.mockResolvedValueOnce({
    deleted: { topic: false },
    reason: 'session_started',
  });
  const res = await app.request(
    '/v1/curriculum/clone-from-child/undo',
    {
      method: 'DELETE',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ createdIds: { topicId: TOPIC_ID } }),
    },
    TEST_ENV,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: { topic: false }, reason: 'session_started' });
});
```

- [ ] **Step 2: Run route tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/curriculum.test.ts --no-coverage`
Expected: PASS (all existing + 3 new).

- [ ] **Step 3: Commit**

Use `/commit`.

(The service-layer matrix cases live in Task 5 — `tests/integration/family-bridge.integration.test.ts`.)

---

## Task 5 — `tests/integration/family-bridge.integration.test.ts`

**Files:**
- Create: `tests/integration/family-bridge.integration.test.ts`

**Context:** Spec §Mobile Implementation → Test coverage:

> Integration: `tests/integration/family-bridge.integration.test.ts` — full path with real DB, two profiles linked, end-to-end clone + verify adult's curriculum + verify back-navigation `returnTo` survives.

This is the right home for the service-level matrix (Task 4 Approach B). The pattern is in `tests/integration/family-pool-breakdown.integration.test.ts` — call `createIntegrationDb()`, seed two profiles with a `familyLinks` row, then exercise `cloneTopicFromChild()` directly. JWT and LLM transport are the only mocked boundaries.

`returnTo` round-trip is a mobile concern, not API — verify it as part of the Maestro flow (Task 7) and the hook test (Task 3). At the API integration level, focus on database state.

- [ ] **Step 1: Write the file skeleton + first failing test**

```ts
/**
 * Integration: family-bridge clone-from-child state matrix.
 *
 * Mocked boundaries: none (DB is real; LLM is not called).
 */
import { and, eq } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  learningSessions,
  needsDeepeningTopics,
  profiles,
  subjects,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import {
  cloneTopicFromChild,
  undoCloneFromChild,
} from '../../apps/api/src/services/family-bridge';

const PARENT_CLERK = 'integration-bridge-parent';
const PARENT_EMAIL = 'integration-bridge-parent@integration.test';

async function seedFamily() {
  const db = createIntegrationDb();
  const [acct] = await db.insert(accounts).values({
    clerkUserId: PARENT_CLERK, email: PARENT_EMAIL,
  }).returning();

  const [parent] = await db.insert(profiles).values({
    accountId: acct!.id,
    displayName: 'Parent',
    isOwner: true,
    role: 'adult',
    birthYear: 1985,
    conversationLanguage: 'en',
  }).returning();

  const [child] = await db.insert(profiles).values({
    accountId: acct!.id,
    displayName: 'Ada',
    isOwner: false,
    role: 'child',
    birthYear: 2014,
    conversationLanguage: 'en',
  }).returning();

  await db.insert(familyLinks).values({
    parentProfileId: parent!.id,
    childProfileId: child!.id,
  });

  // Child has Science > Plants > Photosynthesis
  const [childSubject] = await db.insert(subjects).values({
    profileId: child!.id, name: 'Science', languageCode: 'en', status: 'active',
  }).returning();
  const [childCurriculum] = await db.insert(curricula).values({
    subjectId: childSubject!.id, version: 1,
  }).returning();
  const [childBook] = await db.insert(curriculumBooks).values({
    subjectId: childSubject!.id, title: 'Plants', sortOrder: 1,
  }).returning();
  const [childTopic] = await db.insert(curriculumTopics).values({
    curriculumId: childCurriculum!.id,
    bookId: childBook!.id,
    title: 'Photosynthesis',
    description: 'How plants make food from sunlight (child-level).',
    estimatedMinutes: 20,
    sortOrder: 1,
    source: 'generated',
  }).returning();

  return { db, accountId: acct!.id, parent: parent!, child: child!, childTopic: childTopic! };
}

// [C3] cleanupAccounts takes an object, not a positional array.
// Signature: cleanupAccounts({ emails?: string[]; clerkUserIds?: string[] }).
beforeEach(async () => {
  await cleanupAccounts({ emails: [PARENT_EMAIL] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [PARENT_EMAIL] });
});

describe('family-bridge clone-from-child', () => {
  it('clones a child topic into the parent curriculum with source=parent_bridge', async () => {
    const { db, parent, child, childTopic } = await seedFamily();

    const res = await cloneTopicFromChild(db, parent.id, {
      childProfileId: child.id,
      topicId: childTopic.id,
      requestId: 'req-1',
    });

    expect(res.alreadyExisted).toBe(false);
    expect(res.topicState).toBe('unstarted');
    expect(res.createdIds.topicId).toBeDefined();

    const [adultSubject] = await db.select().from(subjects)
      .where(and(eq(subjects.profileId, parent.id), eq(subjects.name, 'Science')));
    expect(adultSubject).toBeDefined();
    expect(adultSubject.languageCode).toBe('en');

    const [adultTopic] = await db.select().from(curriculumTopics)
      .where(eq(curriculumTopics.id, res.topicId));
    expect(adultTopic.source).toBe('parent_bridge');
    expect(adultTopic.sourceChildProfileId).toBe(child.id);
    expect(adultTopic.description).toBe('How plants make food from sunlight (child-level).');
  });
});
```

- [ ] **Step 2: Run the first case**

Run: `pnpm exec jest --config=tests/integration/jest.config.cjs --findRelatedTests tests/integration/family-bridge.integration.test.ts --no-coverage`
Expected: PASS (it should — the service already supports this case).

- [ ] **Step 3: Add the "already existed, same hash" case**

```ts
it('returns alreadyExisted=true, descriptionRefreshed=false when the description hash matches', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-1',
  });
  // Second clone, different requestId so it bypasses the 60s cache:
  const second = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-2',
  });
  expect(second.alreadyExisted).toBe(true);
  expect(second.descriptionRefreshed).toBe(false);
  expect(second.descriptionDivergent).toBe(false);
});
```

Run + verify PASS.

- [ ] **Step 4: Add the "diverged + unstarted → refresh" case**

```ts
it('refreshes the description when the child topic changes and the adult copy is unstarted', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const first = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-1',
  });

  // Child's topic description evolves
  await db.update(curriculumTopics)
    .set({ description: 'Updated child-level framing.' })
    .where(eq(curriculumTopics.id, childTopic.id));

  const second = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-2',
  });
  expect(second.alreadyExisted).toBe(true);
  expect(second.descriptionRefreshed).toBe(true);
  expect(second.descriptionDivergent).toBe(false);

  const [adultTopic] = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.id, first.topicId));
  expect(adultTopic.description).toBe('Updated child-level framing.');
});
```

- [ ] **Step 5: Add the "diverged + in_progress → keep, divergent flag" case**

```ts
it('does NOT refresh when the adult has started the cloned topic', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const first = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-1',
  });

  // Adult starts a learning session on the cloned topic.
  // [C2] learning_sessions and needs_deepening_topics both require subjectId
  //      (NOT NULL — sessions.ts:133, assessments.ts:157). The column is
  //      `sessionType` (enum 'learning' | 'homework' | 'interleaved'), not
  //      `mode`. `status` enum is 'active' | 'paused' | 'completed' |
  //      'auto_closed' — there is no `'in_progress'`. The clone response
  //      returns `subjectId` so use that.
  await db.insert(needsDeepeningTopics).values({
    profileId: parent.id,
    subjectId: first.subjectId,
    topicId: first.topicId,
    source: 'manual',
    status: 'active',
  });
  await db.insert(learningSessions).values({
    profileId: parent.id,
    subjectId: first.subjectId,
    topicId: first.topicId,
    sessionType: 'learning',
    status: 'active',
  });

  // Child's framing changes
  await db.update(curriculumTopics)
    .set({ description: 'Yet another child-level framing.' })
    .where(eq(curriculumTopics.id, childTopic.id));

  const second = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-2',
  });
  expect(second.alreadyExisted).toBe(true);
  expect(second.descriptionDivergent).toBe(true);
  expect(second.descriptionRefreshed).toBe(false);
  expect(second.topicState).toBe('in_progress');

  const [adultTopic] = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.id, first.topicId));
  expect(adultTopic.description).toBe('How plants make food from sunlight (child-level).');  // unchanged
});
```

- [ ] **Step 6: Add the "completed" case**

```ts
it('reports topicState=completed when the adult finished the topic', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const first = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-1',
  });
  // [C2] See note in the previous case — `mode` does not exist; status enum
  //      values are 'active' | 'paused' | 'completed' | 'auto_closed'.
  await db.insert(learningSessions).values({
    profileId: parent.id,
    subjectId: first.subjectId,
    topicId: first.topicId,
    sessionType: 'learning',
    status: 'completed',
  });

  const second = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-2',
  });
  expect(second.topicState).toBe('completed');
});
```

- [ ] **Step 7: Add the "force copy" case**

```ts
it('creates a disambiguated separate copy when forceCopy=true', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const first = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-1',
  });
  const second = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-2', forceCopy: true,
  });

  expect(second.topicId).not.toBe(first.topicId);
  const [adultTopic] = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.id, second.topicId));
  expect(adultTopic.title).toMatch(/\(from Ada\)/);
  expect(adultTopic.source).toBe('parent_bridge');
});
```

- [ ] **Step 8: Add the idempotency case**

```ts
it('returns the cached response when the same requestId is replayed within 60s', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const first = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-replay',
  });
  const replay = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-replay',
  });
  expect(replay.topicId).toBe(first.topicId);

  // The DB should still contain exactly one bridge topic for this name
  const rows = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.title, 'Photosynthesis'));
  // 1 child + 1 adult = 2; replays did NOT insert a second adult row
  expect(rows.filter((r) => r.source === 'parent_bridge')).toHaveLength(1);
});
```

- [ ] **Step 9: Add the undo case (FK + session-started)**

```ts
it('undoes the cloned topic when no session has started', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const res = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-undo-1',
  });
  const undoRes = await undoCloneFromChild(db, parent.id, res.createdIds);
  expect(undoRes.deleted.topic).toBe(true);

  const rows = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.id, res.topicId));
  expect(rows).toHaveLength(0);
});

it('reports session_started and keeps the topic when a session row references it', async () => {
  const { db, parent, child, childTopic } = await seedFamily();
  const res = await cloneTopicFromChild(db, parent.id, {
    childProfileId: child.id, topicId: childTopic.id, requestId: 'req-undo-2',
  });
  // [C2] correct columns + valid enum values.
  await db.insert(learningSessions).values({
    profileId: parent.id,
    subjectId: res.subjectId,
    topicId: res.topicId,
    sessionType: 'learning',
    status: 'active',
  });
  const undoRes = await undoCloneFromChild(db, parent.id, res.createdIds);
  expect(undoRes.deleted.topic).toBe(false);
  expect(undoRes.reason).toBe('session_started');

  const rows = await db.select().from(curriculumTopics)
    .where(eq(curriculumTopics.id, res.topicId));
  expect(rows).toHaveLength(1);
});
```

- [ ] **Step 10: Run the full file**

Run: `pnpm exec jest --config=tests/integration/jest.config.cjs --findRelatedTests tests/integration/family-bridge.integration.test.ts --no-coverage`
Expected: PASS (8 cases).

If a case fails, the failure is information about the service. Investigate before changing the test. Likely sources: (a) the `learning_sessions` schema requires a column the test doesn't set — read `packages/database/src/schema/sessions.ts` and add it; (b) the `needs_deepening_topics` constraints — same fix.

- [ ] **Step 11: Commit**

Use `/commit`.

---

## Task 6 — `tests/integration/family-bridge-gdpr.integration.test.ts`

**Files:**
- Create: `tests/integration/family-bridge-gdpr.integration.test.ts`

**Context:** Spec §Authorization §5:

> `source_child_profile_id` is `ON DELETE SET NULL`. When a child profile is deleted, the adult's cloned topic row remains but its origin reference becomes null.

Schema citation (`packages/database/src/schema/subjects.ts:182`): the `sourceChildProfileId` column references `profiles.id` with the documented FK option; the partial index at line 206 ensures the lookup stays cheap. This is the H1 verification test promised in §Implementation Sequence Step 2.

- [ ] **Step 1: Write the test**

```ts
/**
 * Integration: GDPR delete of source child sets sourceChildProfileId to null
 * on the parent's cloned topic without losing the topic row.
 */
import { eq } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  profiles,
  subjects,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { cloneTopicFromChild } from '../../apps/api/src/services/family-bridge';

const PARENT_CLERK = 'integration-bridge-gdpr-parent';
const PARENT_EMAIL = 'integration-bridge-gdpr@integration.test';

async function seedFamilyAndClone() {
  const db = createIntegrationDb();
  const [acct] = await db.insert(accounts).values({
    clerkUserId: PARENT_CLERK, email: PARENT_EMAIL,
  }).returning();
  const [parent] = await db.insert(profiles).values({
    accountId: acct!.id, displayName: 'Parent', isOwner: true, role: 'adult',
    birthYear: 1985, conversationLanguage: 'en',
  }).returning();
  const [child] = await db.insert(profiles).values({
    accountId: acct!.id, displayName: 'Ada', isOwner: false, role: 'child',
    birthYear: 2014, conversationLanguage: 'en',
  }).returning();
  await db.insert(familyLinks).values({
    parentProfileId: parent!.id, childProfileId: child!.id,
  });
  const [childSubject] = await db.insert(subjects).values({
    profileId: child!.id, name: 'Science', languageCode: 'en', status: 'active',
  }).returning();
  const [childCurriculum] = await db.insert(curricula).values({
    subjectId: childSubject!.id, version: 1,
  }).returning();
  const [childBook] = await db.insert(curriculumBooks).values({
    subjectId: childSubject!.id, title: 'Plants', sortOrder: 1,
  }).returning();
  const [childTopic] = await db.insert(curriculumTopics).values({
    curriculumId: childCurriculum!.id, bookId: childBook!.id,
    title: 'Photosynthesis', description: 'How plants make food.',
    estimatedMinutes: 20, sortOrder: 1, source: 'generated',
  }).returning();

  const cloneRes = await cloneTopicFromChild(db, parent!.id, {
    childProfileId: child!.id, topicId: childTopic.id, requestId: 'req-1',
  });
  return { db, parent: parent!, child: child!, cloneRes };
}

// [C3] cleanupAccounts takes an object — see helpers.ts:45.
beforeEach(async () => { await cleanupAccounts({ emails: [PARENT_EMAIL] }); });
afterAll(async () => { await cleanupAccounts({ emails: [PARENT_EMAIL] }); });

describe('family-bridge GDPR cascade', () => {
  it('nulls sourceChildProfileId and keeps the cloned topic when the child is deleted', async () => {
    const { db, parent, child, cloneRes } = await seedFamilyAndClone();

    const [beforeDelete] = await db.select().from(curriculumTopics)
      .where(eq(curriculumTopics.id, cloneRes.topicId));
    expect(beforeDelete.sourceChildProfileId).toBe(child.id);

    // Delete the child profile — this exercises the ON DELETE SET NULL FK.
    // The familyLinks row also needs to go first if it has a cascade FK to profiles.
    await db.delete(familyLinks).where(eq(familyLinks.childProfileId, child.id));
    await db.delete(profiles).where(eq(profiles.id, child.id));

    const [afterDelete] = await db.select().from(curriculumTopics)
      .where(eq(curriculumTopics.id, cloneRes.topicId));
    expect(afterDelete).toBeDefined();
    expect(afterDelete.sourceChildProfileId).toBeNull();
    expect(afterDelete.description).toBe('How plants make food.');  // intact
    expect(afterDelete.source).toBe('parent_bridge');

    // Parent's subject and book also survive.
    const adultSubjects = await db.select().from(subjects)
      .where(eq(subjects.profileId, parent.id));
    expect(adultSubjects).toHaveLength(1);
  });
});
```

(If the child-profile delete fails because other tables reference it without cascade — e.g. `learning_sessions`, `usage_events` — the test will surface a real FK gap. That is **also** spec-relevant evidence. Investigate the failure: either the spec's GDPR claim doesn't match the real schema, or those other tables also cascade. Read `packages/database/src/schema/*.ts` to confirm, and adjust the seed (don't add fake session rows) before adjusting the test.)

- [ ] **Step 2: Run it**

Run: `pnpm exec jest --config=tests/integration/jest.config.cjs --findRelatedTests tests/integration/family-bridge-gdpr.integration.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 3: Commit**

Use `/commit`.

---

## Task 7 — Maestro E2E flow

**Files:**
- Create: `apps/mobile/e2e/flows/parent/family-bridge-clone.yaml`
- Modify: `apps/api/src/services/test-seed.ts` — add a `parent-bridge-recap` scenario (a parent + linked child + one recap detail containing at least one topic)

**Context:** Spec §Implementation Sequence Step 8:

> Maestro flow: parent opens Recaps → taps "Add to my learning" → confirms via toast → taps Open → lands on relearn fresh-topic mode → picks method → starts session → device back returns to Recaps detail (not Home).

The collapsing-counter flow in the spec (second bullet) is deferred per §Out Of Spec — Defer. Only the first flow is in scope for V1.

The existing `child-session-recap.yaml` is the closest pattern. The Maestro flow needs new testIDs in the toast component — check `useCloneFromChild.ts:265` etc. for the existing testID names (`clone-toast-open`, `clone-toast-undo`). The toast container itself may need a `testID` on the rendered `<View>` — verify by reading the toast component or adding the testID if missing (see Step 3).

- [ ] **Step 1: Confirm or add a parent-bridge seed scenario**

In `apps/api/src/services/test-seed.ts`, search for an existing scenario that produces a parent + linked child + a recap with at least one curriculum topic on the child side. `parent-session-with-recap` is the closest. If it already includes a child topic (curriculum row with title + description on the child's side, reachable from the recap detail), reuse it. Otherwise add a new scenario `parent-bridge-recap` after the existing `parent-session-with-recap` block (~line 2485):

```ts
| 'parent-bridge-recap'
// ... (in the union type at line 96-108)
```

And the scenario implementation seeding: one parent profile, one linked child, one child subject (`Science`), one book (`Plants`), one topic (`Photosynthesis` with description "How plants make food from sunlight."), and one recap row pointing to a child session that references that topic. The test scenario should NOT pre-seed the parent's curriculum — that's what the bridge is meant to create.

The seed scenario should return `parentEmail`, `parentClerkId`, `recapId`, `childProfileId`, `childTopicId` so the Maestro flow has all the IDs it needs.

- [ ] **Step 2: Add testIDs needed by the flow (if missing)**

Required testIDs (all verified present on `nav-dependency` — no patching needed unless `session-screen` is missing):

- Button tap target — `add-to-my-learning-button` (`AddToMyLearningButton.tsx:190`). **Do NOT use `add-to-my-learning` (that is the container View at line 157).**
- Toast container — `add-to-my-learning-toast` (`AddToMyLearningButton.tsx:32`) — already exists.
- Toast `Open` action — `clone-toast-open` (already exists per `use-clone-from-child.ts:270`).
- Relearn parent-bridge header — `relearn-parent-bridge-header` (`relearn.tsx:573`) — already exists.
- Method picker buttons — `relearn-method-step_by_step` etc. (`relearn.tsx:594`) — already exist.
- Session screen root — `session-screen` — **verify by grepping the session route file. If absent, add one line.**

- [ ] **Step 3: Write the Maestro flow**

```yaml
# Flow PARENT-BRIDGE-01: Add to my learning from Recaps detail
# Validates: parent on Recaps detail taps "Add to my learning" → toast → Open
#            → relearn fresh-topic header resolves child's name → pick method
#            → start session → device back returns to Recaps detail (not Home).
# Tags: nightly, parent
# Seed: parent-bridge-recap
appId: com.mentomate.app
tags:
  - nightly
  - parent
---
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "parent-bridge-recap"

- runFlow:
    file: ../_setup/open-family-dashboard.yaml

# Open the recap detail via the seeded recapId
- tapOn:
    id: "recap-card-${RECAP_ID}"

- extendedWaitUntil:
    visible:
      id: "recap-detail-scroll"
    timeout: 10000

- takeScreenshot: 01-recap-detail-loaded

# Find and tap the bridge button.
# [H1] The tappable Pressable has testID="add-to-my-learning-button"
#      (AddToMyLearningButton.tsx:190). "add-to-my-learning" at line 157 is the
#      wrapping View — not a hit target.
- scrollUntilVisible:
    element:
      id: "add-to-my-learning-button"
    direction: DOWN
    timeout: 10000
- tapOn:
    id: "add-to-my-learning-button"

# Confirm the toast appears
- extendedWaitUntil:
    visible:
      id: "add-to-my-learning-toast"
    timeout: 5000
- takeScreenshot: 02-toast-shown

# Tap Open before the 5s auto-dismiss
- tapOn:
    id: "clone-toast-open"

# Land on relearn screen — header should resolve to the child's display name
- extendedWaitUntil:
    visible:
      id: "relearn-parent-bridge-header"
    timeout: 10000
- assertVisible: "Added from Ada's learning."
- takeScreenshot: 03-relearn-header-resolved

# Pick a method
- tapOn:
    id: "relearn-method-step_by_step"

# Wait for session start
- extendedWaitUntil:
    visible:
      id: "session-screen"
    timeout: 15000
- takeScreenshot: 04-session-started

# Device back from session should return us toward the recap (via returnTo)
- back
- back  # session → relearn → recap detail
- extendedWaitUntil:
    visible:
      id: "recap-detail-scroll"
    timeout: 10000
- takeScreenshot: 05-back-to-recap
```

(Adjust `Ada` to whatever the seed scenario's child displayName is. Replace `recap-detail-scroll` / `recap-card-${RECAP_ID}` / `session-screen` with the actual testIDs in those files if they differ — verify by reading the files at implementation time.)

- [ ] **Step 4: Bring up the emulator + run the flow once**

Per `feedback_agent_owns_e2e_infra.md` — start emulator, Metro, adb reverse, then:

```bash
cd apps/mobile && ./e2e/scripts/seed-and-run.sh parent-bridge-recap e2e/flows/parent/family-bridge-clone.yaml
```

Expected: PASS. If it fails on a missing testID, return to Step 2 and add it (not Step 3 — do not loosen the assertion).

- [ ] **Step 5: Commit**

Use `/commit`. The commit will include the seed scenario, the maestro yaml, and any testID additions touched in Step 2.

---

## Self-Review Check

Spec coverage for the seven gaps the user named:

| User-named gap | Task | Spec line backing it |
|---|---|---|
| No child curriculum trigger surface | Task 1 | §UI Flow trigger placement table row 2 |
| Relearn header generic | Task 2 | §Relearn Screen Adjustments §3 |
| No `use-clone-from-child.test.ts` | Task 3 | §Mobile Implementation → Test coverage bullet 1 |
| No full clone state matrix at API/service | Tasks 4 + 5 | §Adult-side write resolve-or-create + §UI Flow already-cloned variants |
| No `family-bridge.integration.test.ts` | Task 5 | §Mobile Implementation → Test coverage bullet 6 |
| No `family-bridge-gdpr.integration.test.ts` | Task 6 | §Mobile Implementation → Test coverage bullet 7 + §Authorization §5 |
| No Maestro bridge E2E | Task 7 | §Implementation Sequence Step 8 |

Cross-task consistency:

- The `childProfileId` URL param is introduced in Task 2 and consumed by both Task 2 (header) and Task 3 (hook navigation test). The hook test asserts the param is present.
- Task 1's `<AddToMyLearningButton>` wiring reads `usePathname()` to feed `triggerPath`; Task 7's Maestro flow assumes the same testID `add-to-my-learning` rendered by that button (so Task 1 establishes a testID that Task 7 then validates).
- Task 5's service-layer tests cover the same matrix Task 4 deliberately does NOT cover at the route layer — no duplication, route layer keeps mock-based wiring tests, service layer owns the matrix with real DB.
- Tasks 5 and 6 both depend on `createIntegrationDb()` and `cleanupAccounts()` from `tests/integration/helpers.ts` — verified present (`tests/integration/family-pool-breakdown.integration.test.ts:69` uses both).

No placeholders. Every step shows code. Type/method names match across tasks (`cloneTopicFromChild`, `undoCloneFromChild`, `sourceChildProfileId`, `useLinkedChildren`, `useCloneFromChild`, `AddToMyLearningButton`).

---

## Out of Scope

- Adult-side library route for the cloned topic — that path is already wired via `shelf/[subjectId]/book/[bookId].tsx:1754` rendering `<TopicProvenance sourceChildProfileId={...} />`.
- Adding a `family-progress` trigger surface — not in the spec.
- The collapsing-counter toast pattern — spec defers it to V2 (§Out Of Spec — Defer).
- Web shell — spec is mobile-only for V1.
- LLM prompts that re-frame topics for the adult — spec §LLM and Personalization handles this in the existing prompt path with no changes here.
