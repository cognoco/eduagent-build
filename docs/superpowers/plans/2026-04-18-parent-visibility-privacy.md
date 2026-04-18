# Parent Visibility & Privacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove raw transcript access from the parent dashboard, surface streak/XP stats, and replace the raw mentor-memory view with a curated, categorized presentation — all to establish a privacy boundary before production.

**Architecture:** Three parallel API changes (transcript removal, streak/XP enrichment, curated memory endpoint) feed into corresponding mobile screen updates. RLS policy design is documented but not yet migrated (deferred to RLS Phase 2-4 execution). The existing `assertParentAccess` guard remains the enforcement mechanism.

**Tech Stack:** Hono API routes, Drizzle ORM, React Native / Expo Router, React Query, `@eduagent/schemas` (Zod), `@eduagent/database`

---

## Spec correction notes

1. **`displaySummary` source:** The spec states `displaySummary` comes from `session_summaries`. In reality, `getChildSessions` (dashboard.ts:728-747) derives it from `homeworkSummary?.summary ?? null` in session metadata JSONB. `getChildSessions` does NOT join `session_summaries`. Non-homework sessions always have `displaySummary: null`. This plan preserves the existing behavior — parents see homework summaries where available, and a fallback message otherwise.

2. **Parent "tell" contributions:** The spec defines `parentContributions: ParentTellItem[]` in the curated memory view. However, the tell endpoint (`POST /learner-profile/:profileId/tell`) calls `parseLearnerInput()` which processes text through an LLM and merges results into the same profile columns as system inferences. The raw parent text is not persisted separately. This plan returns `parentContributions: []` and documents the gap. Persisting raw tell texts requires a schema migration and is tracked as a follow-up.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/schemas/src/progress.ts` | Add `currentStreak`, `longestStreak`, `totalXp` to `dashboardChildSchema` |
| Modify | `apps/api/src/services/dashboard.ts` | Remove transcript function/types, add streak/XP queries, add `session_summaries.content` fallback for `displaySummary` |
| Modify | `apps/api/src/routes/dashboard.ts` | Remove transcript route, add curated memory route, add single-session detail route |
| Modify | `apps/api/src/services/dashboard.ts` | Add `getChildSessionDetail(parentProfileId, childProfileId, sessionId)` — single-session lookup by ID (replaces deep-link transcript access) |
| Create | `apps/api/src/services/curated-memory.ts` | Curated memory view service — column-to-category mapping |
| Create | `apps/api/src/services/curated-memory.test.ts` | Unit tests for categorization logic |
| Modify | `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` | Summary-only session detail (no transcript) |
| Modify | `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx` | Updated tests for summary view |
| Modify | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Add streak/XP stats row |
| Modify | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` | Curated category view with [x] delete |
| Modify | `apps/mobile/src/hooks/use-dashboard.ts` | Remove `useChildSessionTranscript`, add `useChildMemory` |
| Modify | `docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md` | Add parent-access subquery policies, revise family_links policies |
| Modify | `apps/api/src/services/dashboard.test.ts` | Tests for streak/XP, transcript removal |
| Modify | `tests/integration/parent-dashboard.integration.test.ts` | Break tests + functional tests (file exists) |

---

### Task 1: Add streak/XP fields to DashboardChild schema

**Files:**
- Modify: `packages/schemas/src/progress.ts:139-163`

- [ ] **Step 1: Add fields to the Zod schema**

In `packages/schemas/src/progress.ts`, add three optional fields to `dashboardChildSchema`:

```typescript
// After line 161 (progress field), before the closing });
currentStreak: z.number().int().default(0),
longestStreak: z.number().int().default(0),
totalXp: z.number().int().default(0),
```

These use `.default(0)` so existing consumers that don't send the fields still parse correctly.

- [ ] **Step 2: Verify schema package builds**

Run: `cd apps/api && pnpm exec tsc --noEmit`
Expected: PASS — the schema change is additive with defaults.

- [ ] **Step 3: Update demo fixture in dashboard routes**

In `apps/api/src/routes/dashboard.ts`, add the three fields to both demo children (lines 167-207):

```typescript
// Add to demo-child-1 (after totalSessions: 12)
currentStreak: 3,
longestStreak: 7,
totalXp: 450,

// Add to demo-child-2 (after totalSessions: 8)
currentStreak: 1,
longestStreak: 5,
totalXp: 280,
```

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/progress.ts apps/api/src/routes/dashboard.ts
git commit -m "$(cat <<'EOF'
feat(schemas): add streak/XP fields to DashboardChild

Adds currentStreak, longestStreak, totalXp to the dashboard child
schema with defaults of 0 for backwards compatibility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Remove transcript endpoint and types

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts:111-128`
- Modify: `apps/api/src/services/dashboard.ts:668-823`
- Modify: `apps/mobile/src/hooks/use-dashboard.ts:135-173`

- [ ] **Step 1: Confirm break-test coverage plan**

The real break test for this task lives in Task 12 (integration test: GET transcript URL returns 404 against the running app). There is no unit-level break test here — a `require()`-based "function is undefined" assertion would be a runtime re-check of a compile-time guarantee, adding no real coverage. TypeScript will flag any stale consumer at `pnpm exec nx run api:typecheck` in Step 7.

No test file changes in this step; proceed to removal.

- [ ] **Step 2: Remove transcript service function and types**

In `apps/api/src/services/dashboard.ts`:

Remove the `TranscriptExchange` interface (lines 684-689):
```typescript
// DELETE this entire interface
export interface TranscriptExchange { ... }
```

Remove the `ChildSessionTranscript` interface (lines 691-704):
```typescript
// DELETE this entire interface
export interface ChildSessionTranscript { ... }
```

Remove the `getChildSessionTranscript` function (lines 754-823):
```typescript
// DELETE entire function from the JSDoc comment through the closing brace
```

Remove `sessionEvents` from the imports at the top (line 11) — it's only used by the transcript function. Check if any other function in the file references `sessionEvents` first; if so, keep it.

- [ ] **Step 3: Remove transcript route**

In `apps/api/src/routes/dashboard.ts`:

Remove lines 111-128 (the `.get('/dashboard/children/:profileId/sessions/:sessionId/transcript', ...)` chain).

Remove `getChildSessionTranscript` from the import on line 17.

- [ ] **Step 4: Remove transcript hook from mobile**

In `apps/mobile/src/hooks/use-dashboard.ts`:

Remove the entire `useChildSessionTranscript` function (lines 135-173).

- [ ] **Step 5: Typecheck both packages**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`
Expected: Compilation errors in session detail screen (expected — fixed in Task 6).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/routes/dashboard.ts apps/mobile/src/hooks/use-dashboard.ts
git commit -m "$(cat <<'EOF'
feat(api): remove parent transcript endpoint [PV-S1]

Removes GET /dashboard/children/:id/sessions/:sid/transcript and all
supporting types (TranscriptExchange, ChildSessionTranscript). Raw
session transcripts are no longer accessible to parents — the session
detail view shows summaries only.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add streak/XP batch queries to dashboard service

**Files:**
- Modify: `apps/api/src/services/dashboard.ts:376-614`

- [ ] **Step 1: Write failing test for streak/XP in dashboard child**

In `apps/api/src/services/dashboard.test.ts`, add a test that verifies `getChildrenForParent` returns streak/XP fields. First add the mock setup for the new tables at the top of the file, near the existing mock declarations:

```typescript
const mockStreaksFindMany = jest.fn();
const mockXpLedgerFindMany = jest.fn(); // Not used directly — we use select+groupBy

// In the createDatabaseModuleMock exports, add:
// streaks: { profileId: 'profile_id' },
// xpLedger: { profileId: 'profile_id', amount: 'amount' },
```

Then add the test:

```typescript
describe('getChildrenForParent streak/XP', () => {
  it('includes currentStreak, longestStreak, and totalXp', async () => {
    // This test verifies the DashboardChild shape includes the new fields.
    // The exact values depend on DB state — we just verify they're numbers.
    const result = await getChildrenForParent(mockDb, 'parent-1');
    for (const child of result) {
      expect(typeof child.currentStreak).toBe('number');
      expect(typeof child.longestStreak).toBe('number');
      expect(typeof child.totalXp).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern='services/dashboard.test' --no-coverage -t 'streak/XP'`
Expected: FAIL — `currentStreak` is undefined on the returned objects.

- [ ] **Step 3: Add streak/XP queries to getChildrenForParent**

In `apps/api/src/services/dashboard.ts`:

Add imports at the top:

```typescript
import { sum } from 'drizzle-orm';
import { streaks, xpLedger } from '@eduagent/database';
```

Inside `getChildrenForParent`, after the `guidedMetricsResults` Promise.all block (around line 454), add a parallel batch query for streaks and XP:

```typescript
// Batch streaks + XP for all children
const [streakResults, xpResults] = await Promise.all([
  db.query.streaks.findMany({
    where: inArray(streaks.profileId, childProfileIds),
  }),
  db
    .select({
      profileId: xpLedger.profileId,
      totalXp: sum(xpLedger.amount).mapWith(Number),
    })
    .from(xpLedger)
    .where(inArray(xpLedger.profileId, childProfileIds))
    .groupBy(xpLedger.profileId),
]);

const streaksByProfile = new Map(
  streakResults.map((s) => [s.profileId, s])
);
const xpByProfile = new Map(
  xpResults.map((x) => [x.profileId, x.totalXp ?? 0])
);
```

Then in the `prepared.map` callback (around line 586), add the three fields to the returned object:

```typescript
// After totalSessions (line 608), before the closing };
currentStreak: streaksByProfile.get(p.childProfileId)?.currentStreak ?? 0,
longestStreak: streaksByProfile.get(p.childProfileId)?.longestStreak ?? 0,
totalXp: xpByProfile.get(p.childProfileId) ?? 0,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern='services/dashboard.test' --no-coverage -t 'streak/XP'`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/services/dashboard.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add streak/XP to parent dashboard [PV-S2]

Batch-queries streaks and xp_ledger for all linked children in
getChildrenForParent. Returns currentStreak, longestStreak, totalXp
per child with zero-value defaults.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create curated memory service

**Files:**
- Create: `apps/api/src/services/curated-memory.ts`
- Create: `apps/api/src/services/curated-memory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/curated-memory.test.ts`:

```typescript
import {
  buildCuratedMemoryView,
  type CuratedMemoryView,
  type MemoryCategoryKey,
} from './curated-memory';

function makeLearningProfile(overrides: Record<string, unknown> = {}) {
  return {
    interests: [],
    strengths: [],
    struggles: [],
    communicationNotes: [],
    learningStyle: null,
    suppressedInferences: [],
    memoryEnabled: true,
    memoryCollectionEnabled: true,
    memoryInjectionEnabled: true,
    accommodationMode: 'none',
    ...overrides,
  };
}

describe('buildCuratedMemoryView', () => {
  it('returns empty categories when profile has no data', () => {
    const profile = makeLearningProfile();
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toEqual([]);
    expect(result.parentContributions).toEqual([]);
    expect(result.settings.memoryEnabled).toBe(true);
  });

  it('groups interests into a category with readable statements', () => {
    const profile = makeLearningProfile({
      interests: ['dinosaurs', 'space'],
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]!.label).toBe('Interests');
    expect(result.categories[0]!.items).toHaveLength(2);
    expect(result.categories[0]!.items[0]).toEqual({
      category: 'interests',
      value: 'dinosaurs',
      statement: 'Interested in dinosaurs',
    });
  });

  it('groups struggles with subject context', () => {
    const profile = makeLearningProfile({
      struggles: [
        { topic: 'fractions', subject: 'Math', severity: 'moderate' },
      ],
    });
    const result = buildCuratedMemoryView(profile);

    const struggleCategory = result.categories.find(
      (c) => c.label === 'Struggles with'
    );
    expect(struggleCategory).toBeDefined();
    expect(struggleCategory!.items[0]).toEqual({
      category: 'struggles',
      value: 'fractions',
      statement: 'Struggles with fractions (Math)',
    });
  });

  it('groups strengths by subject', () => {
    const profile = makeLearningProfile({
      strengths: [{ subject: 'Science', topics: ['photosynthesis', 'cells'] }],
    });
    const result = buildCuratedMemoryView(profile);

    const strengthCategory = result.categories.find(
      (c) => c.label === 'Strengths'
    );
    expect(strengthCategory).toBeDefined();
    expect(strengthCategory!.items[0]).toEqual({
      category: 'strengths',
      value: 'Science',
      statement: 'Strong in Science: photosynthesis, cells',
    });
  });

  it('serializes learningStyle object into descriptive strings', () => {
    const profile = makeLearningProfile({
      learningStyle: { modality: 'visual', pacing: 'slow' },
    });
    const result = buildCuratedMemoryView(profile);

    const styleCategory = result.categories.find(
      (c) => c.label === 'Learning style'
    );
    expect(styleCategory).toBeDefined();
    expect(styleCategory!.items).toHaveLength(2);
    expect(styleCategory!.items[0]!.category).toBe('learningStyle');
    expect(styleCategory!.items[0]!.value).toBe('modality');
    expect(styleCategory!.items[0]!.statement).toBe(
      'Prefers visual learning'
    );
  });

  it('omits empty categories from the result', () => {
    const profile = makeLearningProfile({
      interests: ['robotics'],
      // struggles, strengths, etc. all empty
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]!.label).toBe('Interests');
  });

  it('maps communicationNotes to Learning pace & notes', () => {
    const profile = makeLearningProfile({
      communicationNotes: ['needs extra think time', 'prefers short sessions'],
    });
    const result = buildCuratedMemoryView(profile);

    const notesCategory = result.categories.find(
      (c) => c.label === 'Learning pace & notes'
    );
    expect(notesCategory).toBeDefined();
    expect(notesCategory!.items).toHaveLength(2);
    expect(notesCategory!.items[0]!.statement).toBe('Needs extra think time');
  });

  it('includes settings from the profile', () => {
    const profile = makeLearningProfile({
      memoryEnabled: false,
      memoryCollectionEnabled: false,
      memoryInjectionEnabled: true,
      accommodationMode: 'short-burst',
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.settings).toEqual({
      memoryEnabled: false,
      collectionEnabled: false,
      injectionEnabled: true,
      accommodationMode: 'short-burst',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern='services/curated-memory.test' --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement curated memory service**

Create `apps/api/src/services/curated-memory.ts`:

```typescript
// ---------------------------------------------------------------------------
// Curated Memory View — Parent-facing categorized presentation of learning profile
// ---------------------------------------------------------------------------

export type MemoryCategoryKey =
  | 'struggles'
  | 'interests'
  | 'strengths'
  | 'communicationNotes'
  | 'learningStyle';

export interface CuratedMemoryItem {
  category: MemoryCategoryKey;
  value: string;
  statement: string;
}

export interface MemoryCategory {
  label: string;
  items: CuratedMemoryItem[];
}

export interface ParentTellItem {
  id: string;
  content: string;
  createdAt: string;
}

export interface CuratedMemoryView {
  categories: MemoryCategory[];
  parentContributions: ParentTellItem[];
  settings: {
    memoryEnabled: boolean;
    collectionEnabled: boolean;
    injectionEnabled: boolean;
    accommodationMode: string | null;
  };
}

// ---------------------------------------------------------------------------
// Column → Label mapping
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Array<{
  key: MemoryCategoryKey;
  label: string;
}> = [
  { key: 'interests', label: 'Interests' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'struggles', label: 'Struggles with' },
  { key: 'communicationNotes', label: 'Learning pace & notes' },
  { key: 'learningStyle', label: 'Learning style' },
];

// ---------------------------------------------------------------------------
// Learning style serialization
// ---------------------------------------------------------------------------

const STYLE_FIELD_LABELS: Record<string, (v: string) => string> = {
  modality: (v) => `Prefers ${v} learning`,
  pacing: (v) => `Prefers ${v} pacing`,
  scaffolding: (v) => `Responds to ${v} scaffolding`,
  feedback: (v) => `Prefers ${v} feedback`,
  engagement: (v) => `${capitalize(v)} engagement style`,
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function serializeLearningStyle(
  style: Record<string, unknown> | null
): CuratedMemoryItem[] {
  if (!style || typeof style !== 'object') return [];

  const items: CuratedMemoryItem[] = [];
  for (const [field, rawValue] of Object.entries(style)) {
    if (rawValue == null || typeof rawValue !== 'string') continue;
    const labelFn = STYLE_FIELD_LABELS[field];
    const statement = labelFn ? labelFn(rawValue) : `${capitalize(field)}: ${rawValue}`;
    items.push({ category: 'learningStyle', value: field, statement });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Strength / Struggle item builders
// ---------------------------------------------------------------------------

interface StrengthEntry {
  subject: string;
  topics: string[];
}

interface StruggleEntry {
  topic: string;
  subject?: string;
  severity?: string;
}

function buildStrengthItems(strengths: unknown[]): CuratedMemoryItem[] {
  return (strengths as StrengthEntry[]).map((entry) => ({
    category: 'strengths' as const,
    value: entry.subject,
    statement: `Strong in ${entry.subject}: ${entry.topics.join(', ')}`,
  }));
}

function buildStruggleItems(struggles: unknown[]): CuratedMemoryItem[] {
  return (struggles as StruggleEntry[]).map((entry) => ({
    category: 'struggles' as const,
    value: entry.topic,
    statement: entry.subject
      ? `Struggles with ${entry.topic} (${entry.subject})`
      : `Struggles with ${entry.topic}`,
  }));
}

function buildStringArrayItems(
  items: unknown[],
  category: MemoryCategoryKey,
  formatter: (s: string) => string
): CuratedMemoryItem[] {
  return (items as string[]).map((value) => ({
    category,
    value,
    statement: formatter(value),
  }));
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCuratedMemoryView(profile: {
  interests?: unknown[];
  strengths?: unknown[];
  struggles?: unknown[];
  communicationNotes?: unknown[];
  learningStyle?: Record<string, unknown> | null;
  memoryEnabled?: boolean;
  memoryCollectionEnabled?: boolean;
  memoryInjectionEnabled?: boolean;
  accommodationMode?: string | null;
}): CuratedMemoryView {
  const categories: MemoryCategory[] = [];

  for (const config of CATEGORY_CONFIG) {
    let items: CuratedMemoryItem[];

    switch (config.key) {
      case 'interests':
        items = buildStringArrayItems(
          profile.interests ?? [],
          'interests',
          (v) => `Interested in ${v}`
        );
        break;
      case 'strengths':
        items = buildStrengthItems(profile.strengths ?? []);
        break;
      case 'struggles':
        items = buildStruggleItems(profile.struggles ?? []);
        break;
      case 'communicationNotes':
        items = buildStringArrayItems(
          profile.communicationNotes ?? [],
          'communicationNotes',
          (v) => capitalize(v)
        );
        break;
      case 'learningStyle':
        items = serializeLearningStyle(
          profile.learningStyle ?? null
        );
        break;
    }

    if (items.length > 0) {
      categories.push({ label: config.label, items });
    }
  }

  return {
    categories,
    // Raw parent tell texts are not persisted separately — see spec correction note.
    // When tell-text persistence is added, query them here.
    parentContributions: [],
    settings: {
      memoryEnabled: profile.memoryEnabled ?? true,
      collectionEnabled: profile.memoryCollectionEnabled ?? false,
      injectionEnabled: profile.memoryInjectionEnabled ?? true,
      accommodationMode: profile.accommodationMode ?? null,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest --testPathPattern='services/curated-memory.test' --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/curated-memory.ts apps/api/src/services/curated-memory.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add curated memory view service [PV-S3]

Maps learning_profiles JSONB columns to parent-friendly categorized
view with readable statements. Each item carries (category, value)
for delete-by-tuple via the existing deleteMemoryItem service.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add curated memory route

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts`

- [ ] **Step 1: Add the route**

In `apps/api/src/routes/dashboard.ts`, add imports:

```typescript
import { getLearningProfile } from '../services/learner-profile';
import { buildCuratedMemoryView } from '../services/curated-memory';
import { assertParentAccess } from '../services/family-access';
```

Note on import source: `assertParentAccess` is exported from `apps/api/src/services/family-access.ts`, not `dashboard.ts` (where there is a similarly-named private function). Always import the exported one.

Add the route after the sessions route (after line 109):

```typescript
  // Curated memory view for parent
  .get('/dashboard/children/:profileId/memory', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    await assertParentAccess(db, parentProfileId, childProfileId);
    const profile = await getLearningProfile(db, childProfileId);

    if (!profile) {
      return c.json({
        memory: {
          categories: [],
          parentContributions: [],
          settings: {
            memoryEnabled: true,
            collectionEnabled: false,
            injectionEnabled: true,
            accommodationMode: null,
          },
        },
      });
    }

    const memory = buildCuratedMemoryView(profile);
    return c.json({ memory });
  })
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/dashboard.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET /dashboard/children/:id/memory [PV-S3]

New endpoint returns categorized, parent-friendly view of the child's
learning profile. Replaces raw profile access for the parent UI.
Access-checked via assertParentAccess.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5b: Add single-session detail endpoint

**Rationale:** Without this, Task 6's redesigned session detail screen would break deep links to older sessions. `useChildSessions` is capped at 50 most-recent sessions, so any session older than that would show "session not found" — a regression against today's transcript endpoint which fetched by ID. This endpoint gives the UI a single-session lookup that works regardless of recency.

**Files:**
- Modify: `apps/api/src/services/dashboard.ts`
- Modify: `apps/api/src/routes/dashboard.ts`

- [ ] **Step 1: Add `getChildSessionDetail` service function**

In `apps/api/src/services/dashboard.ts`, add a new function after `getChildSessions`:

```typescript
export async function getChildSessionDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  sessionId: string
): Promise<ChildSession | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);

  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, childProfileId)
    ),
  });
  if (!session) return null;

  const metadata = getSessionMetadata(session.metadata);
  const homeworkSummary = metadata.homeworkSummary ?? null;

  return {
    sessionId: session.id,
    subjectId: session.subjectId,
    topicId: session.topicId,
    sessionType: session.sessionType,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    exchangeCount: session.exchangeCount,
    escalationRung: session.escalationRung,
    durationSeconds: session.durationSeconds,
    wallClockSeconds: session.wallClockSeconds,
    displayTitle: formatSessionDisplayTitle(session.sessionType, homeworkSummary),
    displaySummary: homeworkSummary?.summary ?? null,
    homeworkSummary,
  };
}
```

Note: the companion plan (`progress-empty-states-highlights`) adds a `highlight` field to `ChildSession` via the session_summaries join. Once that plan lands, extend this function to include the highlight lookup too. For now it returns a `ChildSession` without `highlight` — which matches today's schema.

- [ ] **Step 2: Add the route**

In `apps/api/src/routes/dashboard.ts`, replace the REMOVED transcript route (which Task 2 deleted) with the new detail route. Place it in the same position for URL affinity:

```typescript
  .get('/dashboard/children/:profileId/sessions/:sessionId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const sessionId = c.req.param('sessionId');

    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId
    );
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json({ session });
  })
```

Add `getChildSessionDetail` to the dashboard service import at the top of the routes file.

- [ ] **Step 3: Add `useChildSessionDetail` mobile hook**

In `apps/mobile/src/hooks/use-dashboard.ts`, add:

```typescript
export function useChildSessionDetail(
  childProfileId: string | undefined,
  sessionId: string | undefined
) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'session', sessionId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].sessions[
          ':sessionId'
        ].$get(
          {
            param: {
              profileId: childProfileId!,
              sessionId: sessionId!,
            },
          },
          { init: { signal } }
        );
        if (res.status === 404) return null;
        await assertOk(res);
        const data = await res.json();
        return data.session;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId &&
      !!sessionId,
  });
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/routes/dashboard.ts apps/mobile/src/hooks/use-dashboard.ts
git commit -m "$(cat <<'EOF'
feat(api,mobile): add single-session detail endpoint [PV-S1]

New GET /dashboard/children/:id/sessions/:sid returns one session by
ID (summary-only, no transcript). Replaces deep-link access that the
removed transcript endpoint previously provided. Prevents regression
where sessions older than 50-most-recent were unreachable.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Redesign parent session detail screen (summary-only)

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx`

- [ ] **Step 1: Write the updated tests**

Replace the test file `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx`:

```typescript
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: jest.fn(() => true) }),
  useLocalSearchParams: () => ({
    profileId: 'child-profile-001',
    sessionId: 'session-001',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => (
      <View testID={`icon-${props.name}`} />
    ),
  };
});

const mockUseChildSessionDetail = jest.fn();

jest.mock('../../../../../hooks/use-dashboard', () => ({
  useChildSessionDetail: (...args: unknown[]) =>
    mockUseChildSessionDetail(...args),
}));

const SessionDetailScreen = require('./[sessionId]').default;

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-001',
    subjectId: 'subject-1',
    topicId: 'topic-1',
    sessionType: 'learning',
    startedAt: '2026-03-20T10:00:00Z',
    endedAt: '2026-03-20T10:08:00Z',
    exchangeCount: 5,
    escalationRung: 1,
    durationSeconds: 480,
    wallClockSeconds: 500,
    displayTitle: 'Learning',
    displaySummary: null,
    homeworkSummary: null,
    ...overrides,
  };
}

describe('SessionDetailScreen (summary-only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows session metadata when displaySummary is present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: 'Practiced light reactions' }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByText('Practiced light reactions')).toBeTruthy();
    expect(screen.getByTestId('session-metadata')).toBeTruthy();
  });

  it('shows fallback text when displaySummary is null', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: null }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(
      screen.getByText('Session summary not available for older sessions')
    ).toBeTruthy();
  });

  it('shows homework summary when present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        displayTitle: 'Math Homework',
        homeworkSummary: {
          displayTitle: 'Math Homework',
          summary: 'Helped with fractions',
        },
        displaySummary: 'Helped with fractions',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByText('Helped with fractions')).toBeTruthy();
  });

  it('shows session-not-found when session is missing', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByTestId('session-not-found')).toBeTruthy();
  });

  it('does NOT render transcript exchanges', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession(),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.queryByTestId('transcript-exchange')).toBeNull();
  });
});
```

- [ ] **Step 2: Rewrite the session detail screen**

Replace `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`:

The screen uses `useChildSessionDetail` (added in Task 5b) to fetch the specific session by ID. This avoids the regression where sessions older than the 50-most-recent list would be unreachable. It shows metadata + summary only — no transcript exchanges.

```typescript
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChildSessionDetail } from '../../../../../hooks/use-dashboard';
import { goBackOrReplace } from '../../../../../lib/navigation';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const mins = Math.round(seconds / 60);
  return mins === 1 ? '1 min' : `${mins} min`;
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    profileId: string;
    sessionId: string;
  }>();
  const profileId = Array.isArray(params.profileId)
    ? params.profileId[0]
    : params.profileId;
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const { data: session, isLoading, isError, refetch } = useChildSessionDetail(
    profileId,
    sessionId
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator testID="loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-text-secondary mb-4 text-center">
          Something went wrong loading this session.
        </Text>
        <Pressable
          testID="retry-session"
          onPress={() => refetch()}
          className="rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View
        testID="session-not-found"
        className="flex-1 items-center justify-center bg-background px-6"
      >
        <Ionicons name="document-text-outline" size={48} color="#888" />
        <Text className="text-text-secondary mt-4 text-center text-base">
          This session is no longer available.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="mt-4 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const duration = formatDuration(
    session.wallClockSeconds ?? session.durationSeconds
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      {/* Header */}
      <View className="px-4 pt-4">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="mb-4 flex-row items-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} />
        </Pressable>

        <Text className="text-text-primary text-xl font-bold">
          {session.displayTitle}
        </Text>
        <Text className="text-text-secondary mt-1 text-sm">
          {formatDate(session.startedAt)}
        </Text>
      </View>

      {/* Metadata */}
      <View testID="session-metadata" className="mx-4 mt-4 rounded-xl bg-surface p-4">
        <View className="flex-row justify-between">
          <View>
            <Text className="text-text-secondary text-xs">Duration</Text>
            <Text className="text-text-primary text-base font-medium">
              {duration || '—'}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Exchanges</Text>
            <Text className="text-text-primary text-base font-medium">
              {session.exchangeCount}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Type</Text>
            <Text className="text-text-primary text-base font-medium capitalize">
              {session.sessionType}
            </Text>
          </View>
        </View>
      </View>

      {/* Summary */}
      <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
        <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
          Session Summary
        </Text>
        {session.displaySummary ? (
          <Text className="text-text-primary text-base leading-relaxed">
            {session.displaySummary}
          </Text>
        ) : (
          <Text className="text-text-tertiary text-base italic">
            Session summary not available for older sessions
          </Text>
        )}
      </View>

      {/* Homework details */}
      {session.homeworkSummary && (
        <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
          <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
            Homework Help
          </Text>
          <Text className="text-text-primary text-base leading-relaxed">
            {session.homeworkSummary.summary}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/child/\\[profileId\\]/session/\\[sessionId\\].tsx --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx" "apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx"
git commit -m "$(cat <<'EOF'
feat(mobile): parent session detail shows summary only [PV-S1]

Replaces transcript exchange view with summary-only presentation.
Uses useChildSessions to find the session (no transcript endpoint).
Shows displaySummary, homework details, or fallback text.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add streak/XP stats to child detail screen

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`

- [ ] **Step 1: Add streak/XP stats row**

In `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, find the header section (around lines 319-342). After the summary text, add a stats row:

```typescript
{/* Streak & XP stats — after the summary Text, before Monthly reports */}
{(child.currentStreak > 0 || child.totalXp > 0) && (
  <View
    testID="streak-xp-stats"
    className="mx-4 mt-3 flex-row items-center gap-4"
  >
    {child.currentStreak > 0 && (
      <View className="flex-row items-center gap-1">
        <Ionicons name="flame-outline" size={16} color="#f97316" />
        <Text className="text-text-secondary text-sm">
          {child.currentStreak}-day streak
        </Text>
      </View>
    )}
    {child.totalXp > 0 && (
      <View className="flex-row items-center gap-1">
        <Ionicons name="star-outline" size={16} color="#eab308" />
        <Text className="text-text-secondary text-sm">
          {child.totalXp} XP
        </Text>
      </View>
    )}
  </View>
)}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS — `currentStreak` and `totalXp` are on `DashboardChild` from Task 1.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/(app)/child/[profileId]/index.tsx"
git commit -m "$(cat <<'EOF'
feat(mobile): show streak/XP stats on parent child detail [PV-S2]

Adds a stats row showing current streak and total XP below the child
summary on the parent dashboard child detail screen.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add useChildMemory hook

**Files:**
- Modify: `apps/mobile/src/hooks/use-dashboard.ts`

- [ ] **Step 1: Add the hook**

In `apps/mobile/src/hooks/use-dashboard.ts`, after the `useChildSessions` function, add:

```typescript
export function useChildMemory(childProfileId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'memory'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].memory.$get(
          { param: { profileId: childProfileId! } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.memory;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/use-dashboard.ts
git commit -m "$(cat <<'EOF'
feat(mobile): add useChildMemory hook [PV-S3]

Queries GET /dashboard/children/:id/memory for the curated memory
view. Used by the redesigned mentor memory screen.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Redesign mentor memory screen (curated view)

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`

- [ ] **Step 1: Update imports and data source**

In `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`:

Add the new hook import:

```typescript
import { useChildMemory } from '../../../../hooks/use-dashboard';
```

Replace the `useChildLearnerProfile` data source in the component body with `useChildMemory`:

```typescript
const { data: memory, isLoading: memoryLoading } = useChildMemory(childProfileId);
```

Keep all existing mutation hooks (`useDeleteMemoryItem`, `useTellMentor`, etc.) — the write endpoints stay unchanged.

- [ ] **Step 2: Replace the body sections with categorized view**

Replace the existing "Learning Style", "Interests", "Strengths", "Things You're Improving At" sections with a single loop over `memory.categories`:

```typescript
{/* Curated categories */}
{memory?.categories.map((cat) => (
  <MemorySection key={cat.label} title={cat.label}>
    {cat.items.map((item) => (
      <MemoryRow
        key={`${item.category}-${item.value}`}
        label={item.statement}
        onRemove={() =>
          safeDelete({
            childProfileId: childProfileId!,
            category: item.category,
            value: item.value,
            suppress: true,
          })
        }
      />
    ))}
  </MemorySection>
))}

{/* Empty state when no categories */}
{memory && memory.categories.length === 0 && (
  <View className="mx-4 mt-4 rounded-xl bg-surface p-6">
    <Text className="text-text-secondary text-center text-base">
      No learning observations yet. As {child?.displayName ?? 'your child'}{' '}
      uses the app, the mentor will learn about their preferences and pace.
    </Text>
  </View>
)}
```

Keep the existing sections for:
- Consent prompt (top)
- Controls (memory toggles) — read from `memory.settings` instead of `profile`
- Tell the Mentor input
- Hidden Items (suppressedInferences)
- Privacy (export + clear all)
- "Something else is wrong" button at the bottom

- [ ] **Step 3: Add "Something else is wrong" toggle + inline form**

The escape hatch must work on both iOS and Android — `Alert.prompt` is iOS-only and silently no-ops on Android, so we don't use it. Instead we toggle an inline form that reuses the existing `TellMentorInput` pattern.

Add local state at the top of the component:

```typescript
const [correctionOpen, setCorrectionOpen] = useState(false);
const [correctionText, setCorrectionText] = useState('');
```

After the Tell the Mentor section, add:

```typescript
{/* Something else is wrong — escape hatch (cross-platform) */}
{!correctionOpen ? (
  <Pressable
    testID="something-wrong-button"
    onPress={() => setCorrectionOpen(true)}
    className="mx-4 mt-4 rounded-xl border border-border p-4"
  >
    <Text className="text-text-secondary text-center text-sm">
      Something else is wrong?
    </Text>
  </Pressable>
) : (
  <View className="mx-4 mt-4 rounded-xl border border-border p-4">
    <Text className="text-text-primary mb-2 text-sm font-medium">
      What seems wrong?
    </Text>
    <Text className="text-text-secondary mb-3 text-xs">
      Describe what the mentor got wrong. We'll review your note.
    </Text>
    <TextInput
      testID="correction-input"
      value={correctionText}
      onChangeText={setCorrectionText}
      multiline
      numberOfLines={3}
      placeholder="e.g. She doesn't actually struggle with fractions anymore"
      className="border-border mb-3 rounded-lg border p-3 text-text-primary"
    />
    <View className="flex-row gap-2">
      <Pressable
        onPress={() => {
          setCorrectionOpen(false);
          setCorrectionText('');
        }}
        className="flex-1 rounded-lg border border-border p-3"
      >
        <Text className="text-text-secondary text-center text-sm">Cancel</Text>
      </Pressable>
      <Pressable
        testID="correction-submit"
        disabled={!correctionText.trim() || tellMentor.isPending}
        onPress={async () => {
          const text = correctionText.trim();
          if (!text) return;
          try {
            await tellMentor.mutateAsync({
              childProfileId: childProfileId!,
              text: `[parent_correction] ${text}`,
            });
            setCorrectionOpen(false);
            setCorrectionText('');
          } catch {
            // tellMentor mutation handles its own error toast; keep form open
          }
        }}
        className="flex-1 rounded-lg bg-primary p-3 disabled:opacity-50"
      >
        <Text className="text-text-inverse text-center text-sm font-medium">
          Submit
        </Text>
      </Pressable>
    </View>
  </View>
)}
```

Add `TextInput` and `useState` to the imports if not already present. The submission posts to the existing `tell` endpoint with a `[parent_correction]` prefix that the server can route/tag on receipt.

- [ ] **Step 4: Typecheck and test**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/child/\\[profileId\\]/mentor-memory.tsx --no-coverage`

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx"
git commit -m "$(cat <<'EOF'
feat(mobile): curated mentor memory view for parents [PV-S3]

Replaces raw profile display with categorized view from
GET /dashboard/children/:id/memory. Each item has a delete [x] button
using suppress=true. Adds "Something else is wrong" escape hatch.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Orphan code cleanup sweep

**Files:**
- Multiple — determined by grep results

- [ ] **Step 1: Grep for all transcript-related identifiers**

Search for every occurrence of the removed identifiers across the entire repo:

```bash
grep -rn "ChildSessionTranscript\|TranscriptExchange\|getChildSessionTranscript\|useChildSessionTranscript\|/transcript" --include="*.ts" --include="*.tsx" apps/ packages/ tests/
```

- [ ] **Step 2: Remove every match**

For each file found:
- Remove dead imports
- Remove unused query key references
- Remove test fixtures that reference transcript types
- Remove any commented-out transcript JSX

Do NOT remove references in:
- The self-learner transcript (child-facing `useSessionTranscript` in `use-sessions.ts`) — that's a different endpoint
- Migration files
- This plan document or the spec

- [ ] **Step 3: Typecheck both packages**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run related tests**

Run: `pnpm exec nx run api:test && cd apps/mobile && pnpm exec jest --no-coverage`
Expected: PASS

- [ ] **Step 5: Review and commit with explicit paths**

Do NOT use `git add -A` — a blanket stage could pull in unrelated untracked files. Instead:

```bash
git status
```

Review the output. Every modified file should be an orphan-cleanup fix from Step 2. For each file the grep sweep touched, stage it explicitly:

```bash
git add <file1> <file2> <file3>  # Explicit paths only
git diff --cached                 # Final review before commit
git commit -m "$(cat <<'EOF'
chore: clean up orphaned transcript references [PV-S1]

Removes all dead imports, query keys, test fixtures, and type
references to the removed parent transcript endpoint.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

If `git status` reveals untracked files you didn't intend to create, investigate before committing — they may be stale artifacts from a previous run or unrelated in-progress work.

---

### Task 11: Update RLS Phase 2-4 plan document

**Files:**
- Modify: `docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md`

- [ ] **Step 1: Verified parent-read table list (audit completed)**

The parent dashboard read surface was audited during plan authoring by tracing every `@eduagent/database` import in `apps/api/src/services/dashboard.ts` and its transitive service calls (`snapshot-aggregation.ts`, `progress.ts`, the monthly-report service, `curated-memory.ts`, `family-access.ts`). The result differs from the spec's Section 5 starting list — three tables were missing and one was incorrectly excluded.

**Verified parent-read tables (need `parent_read_via_family` policy):**

| Table | Read via |
|---|---|
| `learning_sessions` | `getChildSessions`, `getChildSessionDetail` (Task 5b) |
| `session_summaries` | `getChildSessions` (joined after companion plan lands) |
| `progress_snapshots` | `getChildProgressHistory` → `snapshot-aggregation.ts` |
| `milestones` | `snapshot-aggregation.ts`, progress routes |
| `streaks` | `getChildrenForParent` (Task 3) |
| `xp_ledger` | `getChildrenForParent` (Task 3), `progress.ts` |
| `vocabulary` | `getChildInventory` → `snapshot-aggregation.ts` |
| `vocabulary_retention_cards` | `getChildInventory` → `snapshot-aggregation.ts` |
| `retention_cards` | `getChildInventory` → `snapshot-aggregation.ts` |
| `assessments` | `getChildInventory` → `snapshot-aggregation.ts`, `progress.ts` |
| `subjects` | `getChildSubjectTopics` + most inventory paths |
| `curricula` | `getChildSubjectTopics` (**spec missed this**) |
| `curriculum_topics` | `getChildSubjectTopics` (**spec missed this**) |
| `profiles` | `getChildrenForParent` joins `profiles` for `displayName` (**spec missed this**) |
| `needs_deepening_topics` | `progress.ts` (**spec incorrectly excluded this**) |

**Still excluded (no parent-read policy):**

| Table | Reason |
|---|---|
| `session_events` | **Privacy boundary** — raw transcripts |
| `session_embeddings` | Internal vector data |
| `parking_lot_items` | Child's private queue |
| `onboarding_drafts` | Transient setup |
| `coaching_card_cache` | Child-facing |
| `notification_preferences` | Child's settings |
| `notification_log` | Child's history |
| `learning_modes` | Internal state |
| `teaching_preferences` | Internal pedagogy |
| `curriculum_adaptations` | Internal curriculum |
| `family_links` | Covered by Section 4 separate policies |

If the companion plan or future dashboard changes add a new read path to a currently-excluded table, re-run this audit before merging.

- [ ] **Step 2: Replace family_links policies**

In `docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md`, find the existing `family_access` policy section and replace with:

```sql
-- Parent reads their own family links
CREATE POLICY family_parent_access ON family_links
  FOR SELECT TO app_user
  USING (
    parent_profile_id = current_setting('app.current_profile_id', true)::uuid
  );

-- Child reads links where they are the child (consent UI)
CREATE POLICY family_child_access ON family_links
  FOR SELECT TO app_user
  USING (
    child_profile_id = current_setting('app.current_profile_id', true)::uuid
  );

-- No INSERT/UPDATE/DELETE via app_user — consent service uses ownerDb
```

- [ ] **Step 3: Add parent-read subquery policies**

Add the parent-read policies section with the verified table list:

```sql
-- Parent read access via family_links (additive — OR'd with profile_isolation)
-- Template applied to each verified parent-read table:
CREATE POLICY parent_read_via_family ON <table_name>
  FOR SELECT TO app_user
  USING (
    profile_id IN (
      SELECT child_profile_id FROM family_links
      WHERE parent_profile_id = current_setting('app.current_profile_id', true)::uuid
    )
  );
```

List each table with its verification source, and explicitly note `session_events` exclusion with privacy rationale.

- [ ] **Step 4: Add parent_profile_id index**

```sql
CREATE INDEX IF NOT EXISTS family_links_parent_profile_id_idx
  ON family_links (parent_profile_id);
```

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md
git commit -m "$(cat <<'EOF'
docs: add parent-access RLS policies to Phase 2-4 plan [PV-S4/S5]

Adds separate family_links SELECT policies for parent and child.
Adds parent_read_via_family subquery policies on all dashboard-read
tables. Excludes session_events (privacy boundary). Adds
parent_profile_id index.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Integration break tests

**Files:**
- Modify: `tests/integration/parent-dashboard.integration.test.ts`

- [ ] **Step 1: Add break test — transcript endpoint 404**

```typescript
describe('Parent Visibility break tests', () => {
  it('[PV-BT1] GET transcript returns 404', async () => {
    const res = await app.request(
      `/dashboard/children/${childProfileId}/sessions/${sessionId}/transcript`,
      { headers: parentAuthHeaders }
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Add break test — curated memory isolation**

```typescript
it('[PV-BT2] parent A cannot see parent B child memory', async () => {
  const res = await app.request(
    `/dashboard/children/${otherParentChildId}/memory`,
    { headers: parentAAuthHeaders }
  );
  expect(res.status).toBe(403);
});
```

- [ ] **Step 3: Add functional test — curated memory returns categories**

```typescript
it('[PV-FT1] curated memory groups inferences by category', async () => {
  const res = await app.request(
    `/dashboard/children/${childProfileId}/memory`,
    { headers: parentAuthHeaders }
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.memory.categories).toBeInstanceOf(Array);
  expect(body.memory.settings).toHaveProperty('memoryEnabled');
});
```

- [ ] **Step 4: Add functional test — streak/XP in dashboard**

```typescript
it('[PV-FT2] dashboard child includes streak and XP', async () => {
  const res = await app.request('/dashboard', {
    headers: parentAuthHeaders,
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  for (const child of body.children) {
    expect(typeof child.currentStreak).toBe('number');
    expect(typeof child.totalXp).toBe('number');
  }
});
```

- [ ] **Step 5: Run integration tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern='integration/parent-dashboard' --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/integration/parent-dashboard.integration.test.ts
git commit -m "$(cat <<'EOF'
test(integration): parent visibility break + functional tests [PV-BT1/2/FT1/2]

Verifies transcript endpoint removal (404), curated memory access
isolation (403), category grouping, and streak/XP presence.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Final validation

- [ ] **Step 1: Run full API test suite**

Run: `pnpm exec nx run api:test`
Expected: PASS

- [ ] **Step 2: Run full mobile test suite**

Run: `cd apps/mobile && pnpm exec jest --no-coverage`
Expected: PASS

- [ ] **Step 3: Run typecheck for both packages**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `pnpm exec nx run api:lint && pnpm exec nx lint mobile`
Expected: PASS

- [ ] **Step 5: Deploy ordering check (OTA first, API second)**

The transcript endpoint removal is a breaking change for any client that still calls `/transcript`. Older mobile builds (not yet updated via OTA) will 404. To minimize user-visible breakage:

1. **First:** ship the mobile changes via OTA (`eas update` — only when the user explicitly asks; per `feedback_no_ota_unless_asked.md` the agent does not run this unprompted). New mobile builds no longer call the transcript endpoint; they call the new `/sessions/:sid` detail endpoint instead.
2. **Then:** deploy the API changes (removed transcript route, added detail route, added memory route).

If the API ships first, currently-open mobile clients on the transcript screen hit a 404 until they refresh. The summary-only redesign handles 404 gracefully (Task 6 error branch), so it is survivable but not ideal.

Do NOT run `eas update` as part of plan execution. Surface the OTA requirement in the final handoff summary and let the user trigger the release.
