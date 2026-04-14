# Epic 16: Adaptive Memory — Amendments (2026-04-08)

> Amendments to the existing Epic 16 plan based on memory system audit.
> These changes should be integrated into the main plan before implementation begins.
> **Status:** Cross-referenced from main plan (2026-04-09). Story 16.0 is IMPLEMENTED. Amendments 1-5 are noted in the main plan's Prerequisites section — apply during implementation.

---

## Context

An audit of the existing memory infrastructure revealed:
1. **Embedding memory retrieval is silently broken** — route handlers don't pass `VOYAGE_API_KEY`
2. **Prompt instructions suppress** the "Remember when..." behavior the PRD requires
3. **No cross-subject memory** exists despite the PRD promising full learning continuity
4. **Epic 16's learner profile** is a 5th memory layer that doesn't fix layers 1-4

A new **Story 16.0** (see `2026-04-08-story-16.0-fix-existing-memory-layers.md`) must execute before Epic 16 Phase A begins.

---

## Amendment 1: Add Story 16.0 as Prerequisite

**Change:** Insert Story 16.0 before Task 1 in the plan. All Epic 16 tasks depend on it.

**Rationale:** Epic 16 adds a learner profile layer on top of a broken foundation. If the existing embedding and prior learning layers are silently failing, the new layer won't have the expected complementary effect. The mentor will "know your interests" but still won't say "Remember when we covered photosynthesis."

**Updated dependency graph:**
```
Story 16.0 (fix existing layers)
    ├─ Fix A: Pass VOYAGE_API_KEY to route handlers
    ├─ Fix B: Update prompt instructions ("Remember when...")
    └─ Fix C: Add cross-subject highlights
        ↓
Phase A: Tasks 1-8 (as-is)
        ↓
Phase B: Tasks 9-12 (as-is)
        ↓
Phase C: Tasks 13-16 (as-is)
```

---

## Amendment 2: Connect Epic 15 Mastery Data to Epic 16 Struggles

**Problem:** Epic 16's LLM analysis independently detects "struggles" from transcript patterns. Epic 15's snapshots compute mastery from assessments and retention cards. These can disagree:
- Epic 15 says "fractions: mastered" (passed assessment)
- Epic 16 says "fractions: struggling" (confused in session transcript)

Both can be simultaneously true (student passed the test but still gets confused in practice), but the system prompt shouldn't present contradictory signals.

**Change:** In Task 7 (`buildMemoryBlock`), cross-reference struggle entries against retention card status when available.

Add to `apps/api/src/services/learner-profile.ts` in `buildMemoryBlock()`:

```typescript
// If retention data is available (Epic 3/15), filter out struggles
// where the student has strong retention (intervalDays >= 21).
// This prevents "struggling with X" when the spaced repetition
// system shows X is well-retained.
export function buildMemoryBlock(
  profile: MemoryBlockProfile | null,
  currentSubject: string | null,
  currentTopic: string | null,
  retentionContext?: { strongTopics: string[] }  // NEW optional param
): string {
  // ... existing code ...

  // When filtering relevant struggles, also exclude topics with strong retention
  const strongSet = new Set(
    (retentionContext?.strongTopics ?? []).map((t) => t.toLowerCase())
  );

  const relevantStruggles = profile.struggles.filter(
    (s) =>
      s.confidence !== 'low' &&
      !strongSet.has(s.topic.toLowerCase()) &&  // NEW: exclude well-retained
      (!currentSubject || s.subject.toLowerCase() === currentSubject.toLowerCase())
  );

  // ... rest unchanged ...
}
```

In `session.ts` `prepareExchangeContext()`, pass retention context to `buildMemoryBlock()`:

```typescript
const strongTopics = retentionRows
  .filter((r) => r.intervalDays >= 21)
  .map((r) => r.topicTitle)
  .filter(Boolean);

const learnerMemoryContext = learningProfileRow
  ? buildMemoryBlock(
      { /* ... existing fields ... */ },
      subject?.name ?? null,
      topic?.title ?? null,
      { strongTopics }  // NEW
    )
  : '';
```

**Rationale:** Without this, the mentor could say "You've been working hard on fractions" when the student mastered fractions weeks ago. The retention system is the source of truth for what's actually retained.

---

## Amendment 3: Deduplicate Memory Layers in System Prompt

**Problem:** After Story 16.0 + Epic 16, five memory layers will be injected into the system prompt. Some content overlaps:
- Prior Learning lists "Photosynthesis — Mastery: 85%"
- Learner Memory lists "Strengths: Photosynthesis (Science)"
- Embedding Memory might retrieve a photosynthesis session excerpt

**Change:** Add a deduplication note to `buildSystemPrompt()` after all memory sections:

```typescript
// After all memory sections are pushed, add dedup instruction
const hasMultipleMemorySections = [
  context.priorLearningContext,
  context.crossSubjectContext,
  context.learningHistoryContext,
  context.embeddingMemoryContext,
  context.learnerMemoryContext,
].filter(Boolean).length > 1;

if (hasMultipleMemorySections) {
  sections.push(
    'Note: The memory sections above may overlap. ' +
    'Synthesize them into a unified understanding of the learner. ' +
    'Do not repeat the same prior knowledge reference multiple times.'
  );
}
```

**Where:** Task 7, Step 2, after the learner memory block injection.

---

## Amendment 4: Add Embedding Memory Availability Check to Session Analysis

**Problem:** Epic 16 Task 6 adds `analyze-learner-profile` as a step in `session-completed.ts`. The existing `generate-embeddings` step runs in the same chain. If embedding generation fails (Voyage API down), the analysis step should still run — but it should note that the full transcript context may be incomplete.

**Change:** No code change needed — the steps are independent (both read from `session_events`, not from each other). Just add a comment in Task 6:

```typescript
// Note: This step is independent of 'generate-embeddings'.
// Both read from session_events directly. If embedding generation
// fails, analysis still runs with full transcript access.
```

---

## Amendment 5: Epic 16 Plan — Minor Errata

### 5a: `resolveStruggle` called before it's defined

In Task 5 (`applyAnalysis`), line 1084 calls `resolveStruggle()` which isn't defined until Task 10. The plan says Task 5 depends on Task 10 but the code in Task 5 already uses it.

**Fix:** Move `resolveStruggle` implementation from Task 10 into Task 5, or add a stub in Task 5 and implement in Task 10.

### 5b: Missing import in Task 6

The analysis prompt uses `sessionAnalysisOutputSchema` from `@eduagent/schemas` but the import is listed as a separate step rather than being in the initial file creation.

**Fix:** Include the import in Step 1 of Task 6, not as a separate note.

### 5c: `ne` import missing in Story 16.0 Fix C

`fetchCrossSubjectHighlights` uses `ne()` (not equal) from drizzle-orm, which may not be imported in `prior-learning.ts`.

**Fix:** Add `ne` to the drizzle-orm imports in prior-learning.ts.

---

## Summary of All Memory Layers After Story 16.0 + Epic 16

| Layer | Source | Scope | Token Budget | Status After |
|-------|--------|-------|-------------|-------------|
| Prior Learning | `prior-learning.ts` | Current subject, 20 topics | ~1500 tokens | **Fixed** (prompt updated) |
| Cross-Subject | `prior-learning.ts` | Other subjects, 5 topics | ~200 tokens | **NEW** (Story 16.0 Fix C) |
| Book History | `session.ts` | Current book, 10 topics | ≤4000 chars | Existing (unchanged) |
| Embedding Memory | `memory.ts` | Semantic, 3 results | ~1500 chars | **Fixed** (Story 16.0 Fix A) |
| Learner Profile | `learner-profile.ts` | Global profile | ≤500 tokens | **NEW** (Epic 16) |
| **Total estimate** | | | **~3500 tokens** | |

The combined token cost is well within budget for both Claude and Gemini models.
