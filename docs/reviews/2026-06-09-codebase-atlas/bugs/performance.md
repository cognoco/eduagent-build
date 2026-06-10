# Performance & Hot Paths — Bug Review

> **Pruned 2026-06-10** — findings verified FIXED/MOOT against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

**Date:** 2026-06-09
**Lens:** Performance & hot paths
**Scope:** `apps/api/src/services/**` (queries), `apps/mobile/src/app/**`, `apps/mobile/src/components/**`, `apps/mobile/src/hooks/**`

---

## Critical

### [CRITICAL] `getSnapshotsInRange` fetches ALL snapshots for a profile then filters in JavaScript

**File:** `apps/api/src/services/snapshot-aggregation.ts:934–952`

**What:**
```ts
const rows = await db.query.progressSnapshots.findMany({
  where: eq(progressSnapshots.profileId, profileId),
  orderBy: asc(progressSnapshots.snapshotDate),
});
return rows.filter((row) => row.snapshotDate >= from && row.snapshotDate <= to)...
```
The query has no date-range predicate. For a user who has been active for a year, this fetches 365+ rows over the network from Neon to the Cloudflare Worker, then discards the majority in JavaScript. The date-range filter belongs in the SQL WHERE clause.

**Impact:**
History chart loading time is proportional to the profile's total snapshot history, not to the requested range. A 1-year-old account fetching a 7-day chart still transfers 365 rows. Neon→Worker serialization + network overhead scale linearly with total snapshot count.

**Fix direction:**
Add `and(gte(progressSnapshots.snapshotDate, from), lte(progressSnapshots.snapshotDate, to))` to the WHERE clause:
```ts
where: and(
  eq(progressSnapshots.profileId, profileId),
  gte(progressSnapshots.snapshotDate, from),
  lte(progressSnapshots.snapshotDate, to),
),
```
The `(profileId, snapshotDate)` index should already exist (or be added) to serve this query efficiently.

---

## High

### [HIGH] `buildKnowledgeInventory` calls `loadProgressState` twice for diverging subject sets

**File:** `apps/api/src/services/snapshot-aggregation.ts:713–828`

**What:**
`buildKnowledgeInventory` (line 720) calls `loadProgressState` which fires 6+ parallel DB queries. Inside, at lines 737–739, if the subject list from the first load differs from `computeProgressMetrics`'s internal state computation, `computeProgressMetrics` calls `loadProgressState` a second time internally. The result is two full state loads (12+ DB queries) when subject sets diverge. This path is hit on every daily snapshot build.

**Impact:**
Snapshot aggregation is a hot Inngest job path. Double state loads double the DB query count on the snapshot build step, adding 50–200ms latency in a Neon serverless context (cold connection per call) and consuming double the DB connection quota per invocation.

**Fix direction:**
Pass the already-loaded state object from the outer `loadProgressState` call into `computeProgressMetrics` rather than letting it re-load. Refactor `computeProgressMetrics` to accept an optional pre-loaded state parameter.

---

### [HIGH] `animateResponse`: O(n×m) work on every 40ms timer tick

**File:** `apps/mobile/src/components/session/ChatShell.tsx:120–156`

**What:**
On every 40ms interval tick, two O(n) operations execute:
1. `prev.map((m) => ...)` — iterates all messages in the `ChatMessage[]` array to find and update the single streaming message (lines 149–151).
2. `tokens.slice(0, tokenIndex + 1).join(' ')` — allocates a new array and string from index 0 on every tick (line 148).

For a 200-word response (400 tokens), this runs 400 times. Each tick: O(messages) array scan + O(tokenIndex) slice+join = O(n×m) total work. On a message thread with 40 messages at tick 200, each tick does ~240 operations.

**Impact:**
On lower-end Android devices, 40ms ticks with array allocations inside `setMessages` can trigger frame drops (jank) during the streaming animation, which is the most visually prominent part of every AI reply.

**Fix direction:**
- Track only the streaming message's accumulated content in a local `useRef` string; call `setMessages` with a targeted state patch only when needed, not on every tick.
- Replace `tokens.slice(0, tokenIndex + 1).join(' ')` with an accumulator string that appends one token per tick.
- For the full-array map, use a `useRef` to store the message index directly so the map can be replaced with an index-based splice.

---

### [HIGH] `renderMessageItem` captures `failedImages` Set in its closure — defeats FlatList item memoization

**File:** `apps/mobile/src/components/session/ChatShell.tsx:233–284`

**What:**
`renderMessageItem` is a `useCallback` with deps `[failedImages, colors.muted, renderMessageActions, t]` (line 283). `failedImages` is a `useState<Set<string>>` that is replaced on every image load error (line 253: `new Set(prev).add(msg.id)`). Every time any image in any message fails to load, `failedImages` is a new Set reference, so `renderMessageItem` is a new function reference. FlatList sees a new `renderItem` prop and re-renders every visible cell on screen — not just the one with the broken image.

**Impact:**
During a session with homework images, each image error (which can happen silently on poor connectivity) causes a full re-render of all visible message bubbles. At 15+ visible messages this is observable jank. The effect compounds: each re-render triggers `MessageBubble` re-renders which contain animation state.

**Fix direction:**
Move the `failedImages` check inside `MessageBubble` or a dedicated `ImageWithFallback` sub-component wrapped in `React.memo`. The `renderMessageItem` callback then only needs stable deps (`renderMessageActions`, `t`) and does not change when an image fails.

---

## Medium

### [MEDIUM] `listRecentMilestones` issues 3–4 sequential DB round-trips

**File:** `apps/api/src/services/snapshot-aggregation.ts:1077–1124`

**What:**
`listRecentMilestones` executes these DB operations in sequence:
1. `getLatestSnapshot(db, profileId)` — one SELECT.
2. `milestones.findMany(...)` — one SELECT (count check).
3. Conditional `backfillSessionMilestones(db, profileId)` if count < threshold — one write + additional reads.
4. Final `milestones.findMany(...)` — another SELECT to return the final list.

Steps 1, 2, and 4 are always sequential. Step 3 is a synchronous backfill that adds at minimum one more round-trip when triggered. The Progress tab loads milestones on every mount.

**Impact:**
Each DB round-trip to Neon from a Cloudflare Worker costs 10–30ms (cold) or 2–5ms (warm connection). Four sequential round-trips add 40–120ms in the cold path to the Progress tab load time.

**Fix direction:**
Parallelise steps 1 and 2 with `Promise.all`. Cache the milestone count check in the snapshot metadata so the backfill trigger check does not require a live DB read. If backfill is triggered, run it in the background via Inngest rather than blocking the request.

---

### [MEDIUM] `previousSnapshotForToday` fallback path: unbounded `findMany` then JS `.find()`

**File:** `apps/api/src/services/snapshot-aggregation.ts:1126–1148`

**What:**
When `getLatestSnapshot` returns a snapshot for today (`row.snapshotDate >= snapshotDate`), the code falls into a path that loads ALL snapshots for the profile (no LIMIT, no date filter), then uses `.find()` in JavaScript to locate the most recent snapshot before today. This is the same unbounded fetch pattern as `getSnapshotsInRange`.

**Impact:**
For long-active profiles, this loads hundreds of rows to find one. This path is hit every time the snapshot-aggregation job runs on a day when a snapshot already exists for today (the common case for active users). The backfill and Progress tab endpoints share this code path.

**Fix direction:**
Replace the unbounded load + `.find()` with a targeted query:
```ts
db.query.progressSnapshots.findFirst({
  where: and(
    eq(progressSnapshots.profileId, profileId),
    lt(progressSnapshots.snapshotDate, snapshotDate),
  ),
  orderBy: desc(progressSnapshots.snapshotDate),
})
```
This returns exactly one row from the index.

---

### [MEDIUM] `findBookSuggestionCard` does O(subjects × books) JS filter inside a loop

**File:** `apps/api/src/services/coaching-cards.ts:644–703`

**What:**
`findBookSuggestionCard` iterates over `subjects` with a `for-of` loop. Inside the loop body (around line 669), it filters the full `books` array for each subject:
```ts
const subjectBooks = books.filter((b) => b.subjectId === subject.id);
```
With S subjects and B books, this is O(S × B) work. Coaching cards are computed on every chat turn.

**Impact:**
For a user with 10 subjects and 50 books (realistic after months of use), this does 500 comparisons per coaching-card computation. While not catastrophic in absolute terms, this runs on every message exchange in the hot LLM pipeline path. The coaching card priority cascade is already doing several DB reads; JS-level O(S×B) work adds unnecessary overhead.

**Fix direction:**
Pre-group books by `subjectId` into a `Map<string, Book[]>` before the loop:
```ts
const booksBySubjectId = new Map<string, Book[]>();
for (const book of books) {
  const list = booksBySubjectId.get(book.subjectId) ?? [];
  list.push(book);
  booksBySubjectId.set(book.subjectId, list);
}
```
Then replace `books.filter(...)` with `booksBySubjectId.get(subject.id) ?? []`. This reduces the loop body to O(1) lookups.

---

## Low

### [LOW] `buildKnowledgeInventory` issues N parallel DB queries for language subjects

**File:** `apps/api/src/services/snapshot-aggregation.ts:742–746`

**What:**
```ts
await Promise.all(metrics.subjects.map(subject => buildSubjectInventory(...)))
```
For subjects with `pedagogyMode === 'four_strands'`, each `buildSubjectInventory` calls `getCurrentLanguageProgress` which issues an additional DB query. With N language subjects, this is N parallel DB queries issued at once.

**Impact:**
Each parallel query consumes a Neon connection slot. For users with 5+ language subjects, the snapshot build issues 5+ simultaneous reads on top of the 6+ already in `loadProgressState`. Neon's serverless cold-connection cost (10–30ms per connection) means the parallel fan-out can still extend wall-clock time when the connection pool is saturated.

**Fix direction:**
Batch `getCurrentLanguageProgress` for all language subjects in a single SQL `WHERE subjectId IN (...)` query before the map, then pass the results in as a lookup map. This reduces N queries to 1.

---

### [LOW] Three separate `.filter()` passes over `state.vocabulary` in `computeProgressMetrics`

**File:** `apps/api/src/services/snapshot-aggregation.ts:506–517`

**What:**
Three consecutive `.filter()` calls on the same array to count `vocabularyMastered`, `vocabularyLearning`, and `vocabularyNew` states. This iterates the vocabulary array 3 times where a single `.reduce()` would do it once.

**Impact:**
Minor — for a typical vocabulary of 200–500 words, the cost is negligible in isolation. But `computeProgressMetrics` is called on every snapshot build and every progress API request. The 3× pass overhead is unnecessary.

**Fix direction:**
Replace with a single `reduce` or a `for...of` loop that increments all three counters in one pass.

---

### [LOW] `ShelfScreen` fetches all subjects to find one by ID

**File:** `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx:43`

**What:**
```ts
const subject = subjectsQuery.data?.find((s) => s.id === subjectId)
```
The screen loads the full subjects array via `useSubjects()` and uses `.find()` to extract the one it needs. There is no per-subject fetch by ID.

**Impact:**
Minimal overhead if the subjects query is already cached (which it usually is). However, if the cache is cold (deep link, cross-tab navigation), the screen must wait for the full subjects list before rendering. For users with many subjects, this means more data transferred than necessary for a single-subject view. Cross-lens note: this is also an opportunity for a dedicated `GET /subjects/:id` endpoint that would support direct deep-link loading.

**Fix direction:**
Accept as-is if subjects are reliably cached. If deep-link performance is a concern, add a `queryKey: ['subjects', subjectId]` query that fetches a single subject, with the full list as a fallback initialData provider.

---

## Cross-Lens Findings

- **Auth / Data Scoping lens:** `getSnapshotsInRange` (Critical above) loads all snapshots for a profile with no date filter. If the scoped repository enforces profileId, the risk is performance only — but the absence of a date predicate on a potentially large table is also a schema-index concern (the `(profileId, snapshotDate)` composite index must exist for both the current query and the fix to be efficient).

- **Error Handling / UX lens:** `animateResponse` (High above) runs `setMessages` with `prev.map()` inside a `setInterval` callback. If the component unmounts while the interval is running (user navigates away mid-stream), the state update fires after unmount. The returned cleanup function handles `clearInterval`, but only if the caller stores and calls it. Assessment, session, and drill screens all call `animateResponse` — each must properly clean up on unmount to avoid the "Can't perform a React state update on an unmounted component" warning. This is a latent bug vector, not just a performance issue.

- **Data Integrity lens:** The `previousSnapshotForToday` unbounded fetch (Medium above) is used in the snapshot backfill path. If the backfill is triggered while a snapshot write is in flight (race condition), the unbounded fetch might return stale data and the backfill might overwrite a valid snapshot. Addressing the unbounded fetch with a targeted query and a proper `updatedAt` guard would also close this race window.
