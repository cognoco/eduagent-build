# Language Learning Feature Completion Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement items in the order listed — item 4 (CEFR level on vocabulary extraction) must land before items 1 and 2 produce meaningful data.

**Goal:** Complete the six language-learning loose ends so the feature is fully user-facing: wire the CEFR milestone progress card, build the vocabulary list screen, add the missing DELETE route, enrich vocabulary extraction with CEFR context, add a language-detection confirmation intercept, and expand the native language selector from 6 to 13 options.

**Architecture:** API changes in `apps/api/`, mobile changes in `apps/mobile/`. All new types go through `@eduagent/schemas`. No schema migrations required — all database columns already exist.

---

## Dependency Order

Implement in this sequence to avoid wiring dead UI:

```
Item 4 (CEFR level on extraction) → Item 1 (CEFR progress card) → Item 2 (Vocabulary list)
Item 3 (DELETE endpoint) → companion to Item 2
Items 5 and 6 are fully independent — implement in any order
```

---

## Item 4 — CEFR Level on Extracted Vocabulary

**Rationale:** Every extracted vocabulary item currently has `cefrLevel: null`. The extraction prompt knows the target language but not the current CEFR milestone. Without a level tag, the vocabulary-by-level breakdown on the progress screen is always empty and the milestone-completion detection in `session-completed.ts` never fires because `mastered` vocabulary counts are never attributed to a level. This blocks items 1 and 2 from surfacing real data.

### Files to modify

- `apps/api/src/services/vocabulary-extract.ts` — add `cefrLevel` to the function signature and prompt
- `apps/api/src/inngest/functions/session-completed.ts` — pass current milestone CEFR level into the extraction call

### Step-by-step

- [ ] **Step 1: Update `ExtractedVocabularyItem` type**

In `apps/api/src/services/vocabulary-extract.ts`, add `cefrLevel` to the interface:

```typescript
export interface ExtractedVocabularyItem {
  term: string;
  translation: string;
  type: 'word' | 'chunk';
  cefrLevel?: string | null;
}
```

- [ ] **Step 2: Update `extractVocabularyFromTranscript` signature**

Add a `cefrLevel` parameter and inject it into the prompt and user message:

```typescript
export async function extractVocabularyFromTranscript(
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>,
  languageCode: string,
  cefrLevel?: string | null
): Promise<ExtractedVocabularyItem[]>
```

Update `VOCAB_EXTRACTION_PROMPT` to include level guidance:

```typescript
const VOCAB_EXTRACTION_PROMPT = `Extract useful target-language vocabulary from this tutoring transcript.
Return ONLY JSON:
{"items":[{"term":"...","translation":"...","type":"word"|"chunk","cefrLevel":"A1"|"A2"|"B1"|"B2"|"C1"|"C2"|null}]}

Rules:
- Extract only vocabulary in the target language
- Prefer practical words and collocations the learner likely practiced
- Keep 0-8 items
- Use "chunk" for multi-word phrases and collocations
- No duplicates
- If a cefrTarget is provided, assign that level to most items; only deviate if vocabulary clearly belongs to a different level`;
```

Update the user content block to include the target level:

```typescript
content: [
  `Target language: ${language.names[0]} (${language.code})`,
  cefrLevel ? `CEFR target level: ${cefrLevel}` : '',
  transcript
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join('\n'),
]
  .filter(Boolean)
  .join('\n\n'),
```

Update the parse/filter block to carry through `cefrLevel`:

```typescript
return (parsed.items ?? [])
  .filter(/* existing type guards */)
  .slice(0, 8)
  .map((item) => ({
    term: item.term.trim(),
    translation: item.translation.trim(),
    type: item.type,
    cefrLevel:
      typeof item.cefrLevel === 'string' ? item.cefrLevel : null,
  }));
```

- [ ] **Step 3: Pass milestone CEFR level from `session-completed.ts`**

In `apps/api/src/inngest/functions/session-completed.ts`, inside the `update-vocabulary-retention` step, update the `extractVocabularyFromTranscript` call:

```typescript
const cefrLevel =
  previousLanguageProgress?.currentMilestone?.currentLevel ?? null;

const extractedVocabulary = await extractVocabularyFromTranscript(
  transcript,
  subject.languageCode,
  cefrLevel   // <-- new argument
);
```

Then pass `cefrLevel` into `upsertExtractedVocabulary`:

```typescript
await upsertExtractedVocabulary(
  db,
  profileId,
  subjectId,
  extractedVocabulary.map((item) => ({
    ...item,
    cefrLevel: item.cefrLevel ?? cefrLevel ?? undefined,  // prefer LLM-assigned, fall back to milestone
    milestoneId:
      previousLanguageProgress?.currentMilestone?.milestoneId ?? undefined,
    quality,
  }))
);
```

- [ ] **Step 4: Run related tests**

```bash
pnpm exec nx run api:typecheck
cd apps/api && pnpm exec jest --findRelatedTests src/services/vocabulary-extract.ts --no-coverage
cd apps/api && pnpm exec jest --findRelatedTests src/inngest/functions/session-completed.ts --no-coverage
```

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| LLM returns invalid cefrLevel string | Unexpected LLM output | `cefrLevel: null` stored — graceful degradation | None needed; null is safe |
| Milestone has no CEFR level set | Orphaned topic row | Falls back to `null` | Vocabulary still extracted without level tag |

### Verified by

`test: apps/api/src/services/vocabulary-extract.test.ts` — add test case: when `cefrLevel: 'A2'` passed, returned items include `cefrLevel` matching expected value.

---

## Item 1 — CEFR Milestone Progress Card on the Subject Progress Screen

**Rationale:** The API route (`GET /v1/subjects/:subjectId/cefr-progress`), the service (`getCurrentLanguageProgress`), and the mobile hook (`useLanguageProgress`) are all implemented and tested. The progress screen at `apps/mobile/src/app/(app)/progress/[subjectId].tsx` never calls this hook. Language learners have no motivational display of where they are in their CEFR journey.

### Files to modify

- `apps/mobile/src/app/(app)/progress/[subjectId].tsx` — import `useLanguageProgress`, render milestone card after the vocabulary section

### Step-by-step

- [ ] **Step 1: Import and call `useLanguageProgress`**

Add to imports in `apps/mobile/src/app/(app)/progress/[subjectId].tsx`:

```typescript
import { useLanguageProgress } from '../../../hooks/use-language-progress';
```

Inside `ProgressSubjectScreen`, after the existing hooks:

```typescript
const languageProgressQuery = useLanguageProgress(subjectId ?? '');
const languageProgress = languageProgressQuery.data;
const isLanguageSubject =
  subject?.pedagogyMode === 'four_strands' ||
  !!languageProgress;
```

Note: `subject` from `inventoryQuery.data?.subjects.find(...)` uses `@eduagent/schemas` `ProgressInventory` type. If `pedagogyMode` is not on the inventory entry, gate solely on `!!languageProgress` being non-null.

- [ ] **Step 2: Render the CEFR milestone card**

Insert after the vocabulary section (`{subject.vocabulary.total > 0 ? (...) : null}`) and before the retention section:

```tsx
{isLanguageSubject && (
  <View
    className="bg-coaching-card rounded-card p-5 mt-4"
    testID="cefr-milestone-card"
  >
    <Text className="text-h3 font-semibold text-text-primary">
      Language milestone
    </Text>

    {languageProgressQuery.isLoading ? (
      <View className="mt-3">
        <View className="bg-border rounded h-4 w-2/3 mb-2" />
        <View className="bg-border rounded h-3 w-full" />
      </View>
    ) : languageProgressQuery.isError ? (
      <View className="mt-3">
        <Text className="text-body-sm text-text-secondary mb-2">
          Could not load milestone data.
        </Text>
        <Pressable
          onPress={() => void languageProgressQuery.refetch()}
          className="bg-surface-elevated rounded-button px-4 py-2.5 self-start min-h-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Retry loading milestone"
          testID="cefr-milestone-retry"
        >
          <Text className="text-body-sm font-semibold text-text-primary">
            Retry
          </Text>
        </Pressable>
      </View>
    ) : languageProgress?.currentMilestone ? (
      <>
        <Text className="text-body-sm text-text-secondary mt-1">
          {languageProgress.currentLevel} · {languageProgress.currentMilestone.milestoneTitle}
        </Text>
        <View className="mt-3">
          <View className="flex-row justify-between mb-1">
            <Text className="text-caption text-text-muted">
              {languageProgress.currentMilestone.wordsMastered}/{languageProgress.currentMilestone.wordsTarget} words
            </Text>
            <Text className="text-caption text-text-muted">
              {languageProgress.currentMilestone.chunksMastered}/{languageProgress.currentMilestone.chunksTarget} phrases
            </Text>
          </View>
          <View className="bg-border rounded-full h-2 overflow-hidden">
            <View
              className="bg-primary h-full rounded-full"
              style={{
                width: `${Math.round(
                  languageProgress.currentMilestone.milestoneProgress * 100
                )}%`,
              }}
            />
          </View>
        </View>
        {languageProgress.nextMilestone && (
          <Text className="text-caption text-text-muted mt-2">
            Up next: {languageProgress.nextMilestone.level} — {languageProgress.nextMilestone.milestoneTitle}
          </Text>
        )}
      </>
    ) : (
      <Text className="text-body-sm text-text-secondary mt-2">
        Complete a session to start tracking your milestone progress.
      </Text>
    )}
  </View>
)}
```

- [ ] **Step 3: Run typecheck and related tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/progress/\[subjectId\].tsx --no-coverage
```

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| API returns 404 for non-language subject | Subject has `pedagogyMode: 'socratic'` | Card hidden (gated on `isLanguageSubject`) | None needed |
| API error | Network outage | Error message + Retry button | Tap Retry |
| No sessions yet | New language subject | "Complete a session to start tracking" | None — informative |
| `currentMilestone` null after curriculum | Curriculum generated but no vocabulary | Same empty state | None — informative |

### Verified by

`manual: navigate to progress screen for a language subject with at least one completed session and confirm the milestone card renders with progress bar.`

---

## Item 2 — VocabularyList Screen

**Rationale:** The full vocabulary data layer exists — table, CRUD service, REST routes (`GET /v1/subjects/:subjectId/vocabulary`), and the mobile hook `useVocabulary`. There is no screen to show this data. The progress screen shows summary counts but learners have no way to browse, review, or delete individual words.

### Files to create / modify

- **Create:** `apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx` — the vocabulary list screen
- **Create:** `apps/mobile/src/app/(app)/vocabulary/_layout.tsx` — required Expo Router layout
- **Modify:** `apps/mobile/src/app/(app)/progress/[subjectId].tsx` — add "View all vocabulary" entry point
- **Modify:** `apps/mobile/src/hooks/use-vocabulary.ts` — add `useDeleteVocabulary` hook (after item 3 is implemented)

### Step-by-step

- [ ] **Step 1: Create the `_layout.tsx` for the vocabulary segment**

`apps/mobile/src/app/(app)/vocabulary/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

export default function VocabularyLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create the vocabulary list screen**

`apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx`:

The screen must:
- Call `useVocabulary(subjectId)` and `useSubjects()` (for subject name)
- Handle loading, error, empty, and populated states — each with an action
- Group items by mastered/learning status using sections or visual badge
- Show term, translation, type badge (`word` / `phrase`), CEFR level badge if set, mastered checkmark
- Offer a delete button per item (calls `useDeleteVocabulary` from item 3; graceful no-op until that hook exists)
- Back button → `goBackOrReplace(router, '/(app)/progress' as never)` or to whatever the calling screen was

Key structure:

```tsx
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVocabulary, useDeleteVocabulary } from '../../../hooks/use-vocabulary';
import { useSubjects } from '../../../hooks/use-subjects';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import type { Vocabulary } from '@eduagent/schemas';

// Type badge component — word vs chunk
function TypeBadge({ type }: { type: 'word' | 'chunk' }) { ... }

// CEFR badge
function CefrBadge({ level }: { level: string | null | undefined }) { ... }

export default function VocabularyListScreen() {
  // Loading state — spinner + back button
  // Error state — error message + retry + go back
  // Empty state — "No vocabulary yet. Complete a language session..." + go back
  // Populated state — FlatList of VocabularyRow items
}
```

Each vocabulary row must include:
- `testID={`vocab-item-${item.id}`}`
- Term and translation text
- Type badge and CEFR badge
- Mastered indicator (checkmark or greyed visual)
- Delete Pressable with `testID={`vocab-delete-${item.id}`}` (implement guard when hook exists)

- [ ] **Step 3: Add the "View vocabulary" entry point in the progress screen**

In `apps/mobile/src/app/(app)/progress/[subjectId].tsx`, inside the vocabulary summary card (the block guarded by `subject.vocabulary.total > 0`), add a "View all" pressable after the byCefrLevel breakdown:

```tsx
<Pressable
  onPress={() =>
    router.push({
      pathname: '/(app)/vocabulary/[subjectId]',
      params: { subjectId: subject.subjectId },
    } as never)
  }
  className="mt-3 py-2 self-start"
  accessibilityRole="button"
  accessibilityLabel="View all vocabulary"
  testID="vocab-view-all"
>
  <Text className="text-body-sm font-semibold text-primary">
    View all vocabulary →
  </Text>
</Pressable>
```

- [ ] **Step 4: Add `useDeleteVocabulary` hook to `use-vocabulary.ts`**

Do this after item 3 (DELETE endpoint) is implemented:

```typescript
export function useDeleteVocabulary(subjectId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vocabularyId: string) => {
      const res = await client.subjects[':subjectId'].vocabulary[':vocabularyId'].$delete({
        param: { subjectId, vocabularyId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      void queryClient.invalidateQueries({ queryKey: ['language-progress'] });
    },
  });
}
```

- [ ] **Step 5: Run typecheck and tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Network error on load | Connectivity lost | Error message + Retry + Go back | Tap Retry |
| Empty vocabulary list | No sessions completed | "No vocabulary yet" + guidance + Go back | Go back |
| Delete fails | API error | Alert with error message + retry | Dismiss |
| Subject not found (deleted) | Race condition | Fallback to subject name unknown | Navigate back |

### Verified by

`manual: create a language subject, complete a session, navigate to subject progress, tap "View all vocabulary", confirm words from the session appear.`

---

## Item 3 — Vocabulary DELETE Endpoint

**Rationale:** CRUD completeness. Learners need to be able to remove incorrectly extracted or unwanted words. The `vocabulary.ts` service has no `deleteVocabulary` function and the route file has no DELETE handler. The delete must verify ownership by `profileId` to prevent IDOR.

### Files to modify

- `apps/api/src/services/vocabulary.ts` — add `deleteVocabulary` function
- `apps/api/src/routes/vocabulary.ts` — add `.delete(...)` handler

### Step-by-step

- [ ] **Step 1: Add `deleteVocabulary` to the service**

In `apps/api/src/services/vocabulary.ts`, add after `updateVocabulary`:

```typescript
export async function deleteVocabulary(
  db: Database,
  profileId: string,
  vocabularyId: string
): Promise<boolean> {
  const rows = await db
    .delete(vocabulary)
    .where(
      and(eq(vocabulary.id, vocabularyId), eq(vocabulary.profileId, profileId))
    )
    .returning({ id: vocabulary.id });

  return rows.length > 0;
}
```

The `profileId` clause is the ownership guard — it prevents deleting another profile's vocabulary. If the item exists but belongs to a different profile, `rows.length` is `0` and `false` is returned, which the route maps to 404.

- [ ] **Step 2: Add DELETE route handler**

In `apps/api/src/routes/vocabulary.ts`, append to the chained `vocabularyRoutes`:

```typescript
.delete('/subjects/:subjectId/vocabulary/:vocabularyId', async (c) => {
  const db = c.get('db');
  const profileId = requireProfileId(c.get('profileId'));
  const { vocabularyId } = c.req.param();

  const deleted = await deleteVocabulary(db, profileId, vocabularyId);
  if (!deleted) {
    return notFound(c, 'Vocabulary item not found');
  }
  return c.json({ success: true });
})
```

Import `deleteVocabulary` at the top of the routes file:

```typescript
import {
  createVocabulary,
  deleteVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';
```

Note: No `vocabularyDeleteSchema` is needed in `@eduagent/schemas` — the only input is the path parameter, which is already validated by Hono's param handling.

- [ ] **Step 3: Add tests**

In `apps/api/src/routes/vocabulary.test.ts`, add:
- `DELETE /subjects/:subjectId/vocabulary/:vocabularyId` returns 200 `{ success: true }` when item belongs to profile
- Returns 404 when vocabularyId does not exist
- Returns 404 when vocabularyId belongs to a different profile (IDOR guard)

In `apps/api/src/services/vocabulary.test.ts`, add:
- `deleteVocabulary` returns `true` when item exists and belongs to profile
- `deleteVocabulary` returns `false` when item does not exist
- `deleteVocabulary` returns `false` when item belongs to a different profile

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm exec nx run api:typecheck
cd apps/api && pnpm exec jest --findRelatedTests src/routes/vocabulary.ts src/services/vocabulary.ts --no-coverage
```

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Vocabulary ID belongs to another profile | IDOR attempt | 404 Not Found | None — intended |
| Vocabulary already deleted | Duplicate tap | 404 Not Found → mobile shows "already removed" | Dismiss toast |
| DB error | Transient Neon outage | 500 → mobile shows retry | Tap retry |

### Verified by

`test: apps/api/src/routes/vocabulary.test.ts:"DELETE /subjects/:subjectId/vocabulary/:vocabularyId returns 404 for cross-profile access"` — break test proves ownership guard works.

---

## Item 5 — Learner Confirmation Card for Language Detection

**Rationale:** The current flow routes directly to `language-setup` when `result.subject.pedagogyMode === 'four_strands'` is returned from `createSubject`. There is no user confirmation step. A subject like "French Revolution" or "Spanish Civil War" could trigger false-positive language mode (the LLM prompt has a guard but is not infallible). The design spec (`2026-04-04-epic-6-language-learning-design.md` §2.1) explicitly calls for a "learner confirmation card."

The intercept must happen in the mobile client — not on the API — because the server has already committed the subject with `pedagogyMode = 'four_strands'`. If the user rejects, the app must call `PATCH /v1/subjects/:subjectId` to set `pedagogyMode` back to `'socratic'` before proceeding.

### Files to modify

- `apps/mobile/src/app/create-subject.tsx` — replace direct navigation with confirmation card phase

### Step-by-step

- [ ] **Step 1: Add confirmation phase to `ResolveState`**

In `apps/mobile/src/app/create-subject.tsx`, extend the union type:

```typescript
type ResolveState =
  | { phase: 'idle' }
  | { phase: 'resolving' }
  | { phase: 'suggestion'; result: SubjectResolveResult }
  | { phase: 'creating' }
  | {
      phase: 'language-confirm';
      subjectId: string;
      languageCode: string;
      languageName: string;
    };
```

- [ ] **Step 2: Route to confirmation phase instead of direct navigation**

Replace the `if (result.subject.pedagogyMode === 'four_strands')` block in `doCreate`:

```typescript
if (result.subject.pedagogyMode === 'four_strands') {
  setResolveState({
    phase: 'language-confirm',
    subjectId: result.subject.id,
    languageCode: result.subject.languageCode ?? '',
    languageName: result.subject.name,
  });
  return;
}
```

- [ ] **Step 3: Add "Not language learning" handler**

Add `useUpdateSubject` import and mutation instance at the top of `CreateSubjectScreen`. When the user declines, patch the subject back to socratic mode and proceed to the standard interview flow:

```typescript
const updateSubject = useUpdateSubject();

const handleLanguageConfirm = useCallback(
  async (subjectId: string, languageCode: string, languageName: string) => {
    router.replace({
      pathname: '/(app)/onboarding/language-setup',
      params: { subjectId, languageCode, languageName },
    } as never);
  },
  [router]
);

const handleLanguageDecline = useCallback(
  async (subjectId: string, subjectName: string) => {
    setResolveState({ phase: 'creating' });
    try {
      await updateSubject.mutateAsync({
        subjectId,
        updates: { pedagogyMode: 'socratic', languageCode: null },
      });
    } catch {
      // Non-fatal: if patch fails, proceed anyway — subject will fall back
      // to socratic on next session because the patch will be retried on
      // the server side via the normal curriculum pathway.
    }
    router.replace({
      pathname: '/(app)/onboarding/interview',
      params: { subjectId, subjectName },
    } as never);
  },
  [router, updateSubject]
);
```

- [ ] **Step 4: Render the confirmation card**

In the JSX, render when `resolveState.phase === 'language-confirm'`:

```tsx
{resolveState.phase === 'language-confirm' && (
  <View
    className="bg-primary/10 rounded-card px-4 py-5 mb-4"
    testID="language-confirm-card"
  >
    <Text className="text-body font-semibold text-text-primary mb-2">
      Looks like you're learning {resolveState.languageName}
    </Text>
    <Text className="text-body-sm text-text-secondary mb-4">
      We'll switch to a language-focused path with vocabulary tracking,
      direct teaching, and speaking practice.
    </Text>
    <Pressable
      onPress={() =>
        void handleLanguageConfirm(
          resolveState.subjectId,
          resolveState.languageCode,
          resolveState.languageName
        )
      }
      className="bg-primary rounded-button py-3 items-center mb-3 min-h-[48px] justify-center"
      testID="language-confirm-yes"
      accessibilityRole="button"
      accessibilityLabel="Yes, I'm learning this language"
    >
      <Text className="text-text-inverse text-body font-semibold">
        Yes, set up language learning
      </Text>
    </Pressable>
    <Pressable
      onPress={() =>
        void handleLanguageDecline(
          resolveState.subjectId,
          resolveState.languageName
        )
      }
      className="bg-surface rounded-button py-3 items-center min-h-[48px] justify-center border border-border"
      testID="language-confirm-no"
      accessibilityRole="button"
      accessibilityLabel="No, this isn't language learning"
    >
      <Text className="text-text-primary text-body font-semibold">
        No, this isn't language learning
      </Text>
    </Pressable>
  </View>
)}
```

- [ ] **Step 5: Verify `useUpdateSubject` accepts `pedagogyMode` + `languageCode` null**

Check `apps/mobile/src/hooks/use-subjects.ts` — confirm the mutation calls `PATCH /v1/subjects/:subjectId` with `SubjectUpdateInput`. Per `packages/schemas/src/subjects.ts`, `SubjectUpdateInput` already includes `pedagogyMode?: PedagogyMode` and `languageCode?: string | null`. No schema change needed.

- [ ] **Step 6: Run typecheck and related tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-subject.tsx --no-coverage
```

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| PATCH fails on decline | Network error | Navigation proceeds anyway (non-fatal catch) | Subject stays four_strands; user can still use standard interview |
| User sits on confirm card without tapping | Session timeout | Card stays visible — no timeout | User taps one of the two buttons |
| `subjectId` missing from state | Impossible by construction | Type error at compile time | N/A |

### Verified by

`manual: type "French Revolution" → confirm subject creation → confirm language-confirm card appears → tap "No, this isn't language learning" → confirm navigation goes to interview screen, not language-setup.`

---

## Item 6 — Native Language Selector Expansion

**Rationale:** `language-setup.tsx` has a hardcoded `NATIVE_LANGUAGE_OPTIONS` array with 6 languages (en, es, fr, de, it, pt). The system supports 13 languages. Learners whose native language is Dutch, Norwegian, Swedish, Danish, Romanian, Indonesian, Malay, or Swahili cannot accurately describe their starting point.

### Files to modify

- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — expand `NATIVE_LANGUAGE_OPTIONS`

### Step-by-step

- [ ] **Step 1: Replace `NATIVE_LANGUAGE_OPTIONS`**

The 13 supported language codes come from `SUPPORTED_LANGUAGES` in `apps/api/src/data/languages.ts`. The mobile file does not import from the API package directly. Define the expanded array inline using the display names that make sense for a "What is your native language?" selector:

```typescript
const NATIVE_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'nb', label: 'Norwegian' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'ro', label: 'Romanian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'sw', label: 'Swahili' },
];
```

No logic change needed — the selector maps `code` to `nativeLanguage` state, which is sent as-is to the API's `languageSetupSchema` (`nativeLanguage: languageCodeSchema`). Any 2-10 char code is valid.

- [ ] **Step 2: Verify scroll UX**

With 14 options the list extends beyond most viewport heights. The selector is inside a `ScrollView` with `showsVerticalScrollIndicator={false}`, so this is handled. Confirm visually on a small screen (Galaxy S10e, 5.8") that all options are reachable.

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/onboarding/language-setup.tsx --no-coverage
```

If the test hardcodes a count of 6 native language options, update it to 14.

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| API rejects new language code | Code not in schema validation | Error toast in language-setup | Pick a different language |

Note: `languageCodeSchema` is `z.string().min(2).max(10)` — all new codes pass. The `nativeLanguage` field is stored in `teachingPreferences` as a plain string and used only in the four-strands prompt — no enum constraint on the server side.

### Verified by

`manual: open language-setup screen, confirm 14 options are displayed and all are selectable.`

`test: apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx — update any test asserting 6 options to assert 14.`

---

## Cross-cutting Verification

After all 6 items are implemented, run the full validation suite:

```bash
# API
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx run api:test

# Mobile
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run-many -t test --projects=mobile
```

All checks must pass before declaring this complete.

---

## Fix Table Summary

| # | Item | Primary files | Verified by | Finding ID |
|---|------|--------------|-------------|------------|
| 4 | CEFR level on extraction | `vocabulary-extract.ts`, `session-completed.ts` | test: `vocabulary-extract.test.ts` | LANG-01 |
| 1 | CEFR milestone progress card | `progress/[subjectId].tsx` | manual: language subject progress screen | LANG-02 |
| 2 | VocabularyList screen | `vocabulary/[subjectId].tsx`, `use-vocabulary.ts` | manual: complete session → view vocabulary | LANG-03 |
| 3 | Vocabulary DELETE endpoint | `services/vocabulary.ts`, `routes/vocabulary.ts` | test: route test IDOR break test | LANG-04 |
| 5 | Language detection confirmation | `create-subject.tsx` | manual: "French Revolution" flow | LANG-05 |
| 6 | Native language selector expansion | `language-setup.tsx` | manual: 14 options visible | LANG-06 |
