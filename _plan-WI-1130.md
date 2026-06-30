# Plan: WI-1130 — S1: Improve bar-intent-match fidelity beyond literal IDs

## Problem

`matchBarIntent()` uses `wordAfter()` regex extraction requiring a literal ID token
immediately after a keyword (e.g. `session abc123`). Natural language like
`resume my maths session` returns `uncertain` because no literal sessionId follows
`session`. The fix adds a **name-index-aware path** so the V2 bar produces confident
route-catalog jumps from NL input when a target is uniquely identified by name.

## Design

### New types (exported from bar-intent-match.ts)

```typescript
export interface BarIntentNameEntry {
  id: string;
  name: string;
}

export interface BarIntentTopicEntry {
  id: string;
  name: string;
  subjectId: string; // for routes needing subjectId + topicId
}

export interface BarIntentNameIndex {
  subjects?: readonly BarIntentNameEntry[];
  topics?: readonly BarIntentTopicEntry[];
}
```

### Signature change (backward-compatible)

```typescript
export function matchBarIntent(text: string, nameIndex?: BarIntentNameIndex): BarIntentResult
```

Existing callers passing no `nameIndex` keep working unchanged.

### Name resolution helper (internal)

```typescript
function resolveNameInText<T extends { id: string; name: string }>(
  items: readonly T[],
  text: string
): T | 'ambiguous' | 'not-found'
```

- Whole-word regex match (`\bname\b`) against normalized query text
- 0 matches → `not-found`
- 1 match → the entry
- 2+ matches → `ambiguous`

### NL resolution logic (runs AFTER existing literal paths)

```
if nameIndex provided:
  resolve subject from nameIndex.subjects (whole-word name match in query)
  resolve topic from nameIndex.topics (whole-word name match in query)
  if subject OR topic is 'ambiguous' → return null (fall through to uncertain)
  if subject resolved AND topic resolved:
    review/practice verb → retention.review { subjectId, topicId, chain: ['subject.hub'] }
    challenge/test verb → challenge.start { subjectId, topicId, chain: ['subject.hub'] }
    otherwise → subject.hub { subjectId }
  if subject resolved only AND navigate/action verb present:
    → subject.hub { subjectId }
  else → return null (uncertain)
```

### Existing code

All literal-ID paths remain unchanged and run first. The NL path only engages
when a nameIndex is provided AND the literal paths produce no jump.

### Caller update (mentor.tsx)

Pass subject name index from the already-loaded `subjectsIndex`:

```typescript
const result = matchBarIntent(text, {
  subjects: subjectsIndex.subjects.map(s => ({ id: s.subjectId, name: s.subjectName })),
});
```

### Tests (AC4: ≥3 NL phrasings in bar-intent-match.test.ts)

1. Unique subject hit: `'resume my maths session'` + subjects=[Maths] → jump to `subject.hub`
2. No match: `'resume my physics session'` + subjects=[Maths] → `uncertain`
3. Ambiguous subject: `'review history and science'` + subjects=[History, Science] → `uncertain`
4. Unique subject + topic → `retention.review`
5. Existing tests stay green (no nameIndex passed)

### Adversarial invariants (AC3)

- Existing adversarial test suite passes unchanged (no nameIndex → NL path disabled)
- New NL-jump tests also verify `pushNowDeepLink` expands without throwing

## Files touched

- `apps/mobile/src/lib/bar-intent-match.ts` (main logic + types)
- `apps/mobile/src/lib/bar-intent-match.test.ts` (add NL test cases)
- `apps/mobile/src/app/(app)/mentor.tsx` (pass nameIndex)

## Off-limits

- `now-deep-link.ts` (concurrent WI-1131 owns that file)
- No `jest.mock` of internal modules (GC1)
- No new user copy / no i18n changes (pure logic)
