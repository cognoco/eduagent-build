# Book Suggestion Regeneration on Pick-Book

**Date:** 2026-05-10
**Status:** Ready for implementation
**Source bug:** User report 2026-05-10 — "Add another book → 'No suggestions yet'" dead end on subjects whose `bookSuggestions` table is empty.

## Thesis

The pick-book screen (`apps/mobile/src/app/(app)/pick-book/[subjectId].tsx`) is a dead end whenever `bookSuggestions` is empty for the subject. The pool can be empty for four legitimate reasons, only one of which is "user picked everything":

1. **Focused-book path** (`apps/api/src/services/subject.ts:283-365`) — subject created with a specific focus seeds zero `bookSuggestions`.
2. **Narrow path** (`subject.ts:413-422`) — LLM classifier returns `narrow`, topics persist directly under one auto-named book; zero `bookSuggestions`.
3. **Classification fallback** (`subject.ts:423-436`) — LLM call fails, falls through to narrow with zero suggestions.
4. **Pool exhausted** — broad-path subject, every seeded suggestion has a non-null `pickedAt`.

The fix is one shape regardless of path: when the user opens pick-book and the unpicked pool drops below 4, generate a fresh batch of 2 `related` + 2 `explore` suggestions, persist them, and render them grouped.

One PR. One thesis: *the picker is no longer empty under normal conditions — only on degraded LLM/network/quota paths, where the custom-input escape always remains.* (MEDIUM-1)

## Trigger Rules

Generation is **synchronous, on the pick-book route only, on demand**. No background pre-warm, no Inngest job, no fan-out from the shelf screen.

| Unpicked count on screen open | Action |
|---|---|
| ≥4 | Render existing rows. No LLM call. |
| 0–3 | Generate 4 new suggestions inline before rendering, subject to the concurrency lock and cool-down below. |

Generation is bounded by three guards:

1. **Count guard** — only fires when unpicked < 4. Picking drops the count by 1.
2. **Concurrency guard (CRITICAL-1)** — Postgres transaction-scoped advisory lock keyed on `hashtextextended(profile_id || ':' || subject_id, 0)`. Acquired via `pg_try_advisory_xact_lock(...)` inside the generation service's transaction. The lock loser does not wait — it skips the LLM call, re-reads the pool, and returns whatever is there. This closes the race where two concurrent React-Query refetches both pass the count check, both call the LLM, and both insert.
3. **Cool-down guard (CRITICAL-2)** — a per-subject cool-down stored as `book_suggestions_last_generation_attempted_at` on the `subjects` row. Generation skips if attempted within the last 5 minutes regardless of outcome. On every catch path (quota exhausted, network, parse failure, timeout) the service emits a structured metric `book_suggestion_generation_failed { profileId, subjectId, reason }` so failure rate is queryable. Without this, a sticky LLM-quota failure turns every screen mount into another billable LLM attempt.

## Schema Change

`packages/database/src/schema/subjects.ts:245-263` — add a `category` column to `bookSuggestions`:

```ts
export const bookSuggestionCategoryEnum = pgEnum('book_suggestion_category', [
  'related',
  'explore',
]);

// Inside bookSuggestions:
category: bookSuggestionCategoryEnum('category'),  // nullable
```

- `null` — legacy/initial seed (existing rows + the broad-path seed in `subject.ts:396-403` continue to insert without category). Renders ungrouped or folded into "Try something new" at the UI layer.
- `'related'` — "Based on what you've studied so far".
- `'explore'` — "Try something new".

Plus a partial unique index for race-safe deduplication (HIGH-3):

```sql
CREATE UNIQUE INDEX book_suggestions_subject_title_unique_unpicked
  ON book_suggestions (subject_id, lower(title))
  WHERE picked_at IS NULL;
```

The service catches the unique-violation error from concurrent inserts and re-reads the pool instead of throwing.

Plus the cool-down column on `subjects` (CRITICAL-2):

```ts
// Inside subjects:
bookSuggestionsLastGenerationAttemptedAt: timestamp(
  'book_suggestions_last_generation_attempted_at',
  { withTimezone: true },
),  // nullable
```

Forward-only migration. No backfill. Drizzle generate + commit the SQL; staging/prod use `drizzle-kit migrate` per project rule.

### Rollback note (MEDIUM-3)

Pure additive migration — no data loss on rollback. Reverse procedure if the column needs dropping later: (1) `ALTER TABLE book_suggestions DROP COLUMN category;` and `ALTER TABLE subjects DROP COLUMN book_suggestions_last_generation_attempted_at;` and `DROP INDEX book_suggestions_subject_title_unique_unpicked;` (2) `DROP TYPE book_suggestion_category;`. Order matters because the enum type cannot be dropped while a column references it. All read paths tolerate `null` on `category`, so the application layer needs no changes during the window.

`packages/schemas/src/subjects.ts:398-407` — `bookSuggestionSchema` gains:

```ts
category: z.enum(['related', 'explore']).nullable(),
```

`BookSuggestion` flows through unchanged. `bookSuggestionsResponseSchema` is replaced — see §Server Changes (HIGH-2).

## Server Changes

### Response shape change (HIGH-2)

`bookSuggestionsResponseSchema` becomes an object, not a bare array:

```ts
export const bookSuggestionsResponseSchema = z.object({
  suggestions: z.array(bookSuggestionSchema),
  curriculumBookCount: z.number().int().nonnegative(),
});
```

`curriculumBookCount` is the count of rows in `curriculum_books` for this subject, derived in the same query call to avoid a second round-trip from the picker. The mobile layer uses it for `hasAnyBook` (see §Mobile Changes). The `/all` endpoint stays on the legacy bare-array shape — only `/book-suggestions` (the picker endpoint) changes.

### Top-up on the existing GET endpoint

`apps/api/src/routes/book-suggestions.ts:21-32` — `GET /subjects/:subjectId/book-suggestions` becomes a one-line delegation to a new service function (CRITICAL-3 — route handlers stay free of business logic per CLAUDE.md G1/G5):

```ts
.get('/subjects/:subjectId/book-suggestions', async (c) => {
  const profileId = requireProfileId(c.get('profileId'));
  const result = await getUnpickedBookSuggestionsWithTopup(
    c.get('db'),
    profileId,
    c.req.param('subjectId'),
  );
  return c.json(bookSuggestionsResponseSchema.parse(result), 200);
})
```

`getUnpickedBookSuggestionsWithTopup` lives in `services/suggestions.ts` (or the new `book-suggestion-generation.ts`) and contains the count-branch + top-up + re-read flow. `/all` endpoint stays untouched (it's used by the shelf, not the picker).

### Why GET-with-side-effect

The side effect is a read-through cache fill scoped to one user's subject, never visible until they're already on the picker. It is bounded by the concurrency lock (CRITICAL-1) and cool-down (CRITICAL-2) so retries — including TanStack Query's automatic refetch on focus/reconnect/mount — cannot multiply LLM calls. Splitting into a separate POST + refetch from the mobile side adds round-trips with no UX gain.

### Latency budget (HIGH-1)

`routeAndCall` for 4 structured suggestions is typically 6–12s p95 on warm path; the cold-worker + Neon cold-start cap is ~18s. The picker's existing loader (`pick-book/[subjectId].tsx:97-105`) shows "This is taking a bit longer than usual..." after 8s — that hint pre-dates this feature and was sized for plain query latency, not generation latency. Two changes make the wait honest:

1. Extend `LOADING_MESSAGES` in the picker with a generation-aware variant: `"Finding fresh books for you..."` / `"Picking books to suggest..."` / `"Almost there..."`. Surface them only when the picker knows generation is likely (we can pass a `generationLikely` hint via the response or simply rely on cold-load timing).
2. Push the slow-loading hint earlier (5s) when generation is in flight, so the user understands the wait isn't a hang.

The 202 + poll alternative (instant GET, async generate) was considered and rejected: it doubles round-trips for the common case and the picker has no useful state to render before suggestions land.

### Generation function

New file `apps/api/src/services/book-suggestion-generation.ts`:

```ts
export async function generateCategorizedBookSuggestions(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<void>
```

Wrapped in a transaction. Steps:

1. **Cool-down check (CRITICAL-2)** — read `subjects.bookSuggestionsLastGenerationAttemptedAt`. If within the last 5 minutes, return early without acquiring the lock or calling the LLM.
2. **Concurrency lock (CRITICAL-1)** — `pg_try_advisory_xact_lock(hashtextextended(profile_id || ':' || subject_id, 0))`. If `false`, another request is generating; return early without re-trying.
3. **Re-check count under lock** — re-read unpicked count. If now ≥4 (the lock loser already inserted), return.
4. **Stamp the cool-down** — update `bookSuggestionsLastGenerationAttemptedAt = now()` *before* the LLM call so failures still cool down.
5. Read subject name + `pedagogyMode` (skip generation entirely if `four_strands` — language subjects don't use this picker pattern).
6. Read existing `curriculumBooks.title` for the subject.
7. Read topic titles the user has actually studied — joined through `learning_sessions` → `curriculum_topics` → `curriculum_books` filtered by `subjectId`. Use the parent-chain pattern (direct `db.select()` with `subjects.profileId` enforced in WHERE), per the project rule. Limit to ~20 most recent topic titles to bound prompt size.
8. Build prompt (next section).
9. Call `routeAndCall` (existing LLM client).
10. Parse with a Zod schema (`bookSuggestionGenerationResultSchema`).
11. **Dedup (HIGH-3)** — filter out any title equivalent to an existing book or unpicked suggestion using `areEquivalentBookTitles` from `services/subject.ts` (parity with the focused-path duplicate check, lemma-aware). Insert remaining rows into `bookSuggestions` with `category` set.
12. **Race-safe insert (HIGH-3)** — wrap the insert in a try/catch on the partial unique index `book_suggestions_subject_title_unique_unpicked`. On constraint violation, swallow the error and let the caller re-read; another request raced and won.

**Failure mode (CRITICAL-2):** every catch path emits a structured metric `book_suggestion_generation_failed { profileId, subjectId, reason: 'quota' | 'network' | 'parse' | 'timeout' | 'lock_loser' | 'cooldown' | 'unknown' }` then returns without throwing. The route then re-reads the (still possibly empty) pool and returns it to the client. The existing "No suggestions yet" empty state remains as the degraded fallback — the "Type a book or topic" input is the user's escape. The cool-down stamp ensures a sticky quota failure does not turn every screen mount into another billable LLM call.

### LLM prompt shape

Constraints enforced in the prompt:
- Exactly 4 results: 2 `related` + 2 `explore`.
- No overlap (case-insensitive) with the supplied existing-book and existing-suggestion lists.
- Reuse `AGE_STYLE_GUIDANCE` from `book-generation.ts` for register consistency.
- Each item carries `title`, `description`, `emoji`, `category`.

If the user has zero studied topics (focused/narrow path, never opened a session), the prompt instructs the model to return **4 `explore`** instead of 2/2. The route inserts them all as `category='explore'`. The mobile layer renders them ungrouped (rule: no headers until ≥1 picked book exists).

Response is a single JSON object:

```json
{ "suggestions": [
  { "title": "...", "description": "...", "emoji": "...", "category": "related" },
  ...
] }
```

Validate with a new `bookSuggestionGenerationResultSchema` in `@eduagent/schemas` (parallel to `bookGenerationResultSchema`).

## Mobile Changes

`useBookSuggestions` (`apps/mobile/src/hooks/use-book-suggestions.ts`) returns the new envelope shape (HIGH-2): `{ suggestions: BookSuggestion[]; curriculumBookCount: number }`. The picker derives `hasAnyBook` from `curriculumBookCount > 0` — no extra hook, no second request.

`apps/mobile/src/app/(app)/pick-book/[subjectId].tsx:107` — replace `const suggestions = suggestionsQuery.data ?? [];` with:

```ts
const data = suggestionsQuery.data;
const suggestions = data?.suggestions ?? [];
const hasAnyBook = (data?.curriculumBookCount ?? 0) > 0;
const relatedSuggestions = suggestions.filter(s => s.category === 'related');
const exploreSuggestions = suggestions.filter(
  s => s.category === 'explore' || (hasAnyBook ? false : s.category === null),
);
const legacySuggestions = hasAnyBook
  ? suggestions.filter(s => s.category === null)
  : [];
```

Render rules (replaces `pick-book/[subjectId].tsx:362-373`):

- **`hasAnyBook === false`** → flat ungrouped grid of *all* suggestions (legacy null + any explore). No headers. Current layout, current copy.
- **`hasAnyBook === true`** → up to three sections in this order, each suppressed when empty:
  - Header **"Based on what you've studied"** above `relatedSuggestions`.
  - Header **"Try something new"** above `exploreSuggestions`.
  - **`legacySuggestions`** rendered ungrouped at the bottom with no header (LOW-1 — avoid silently re-labeling pre-fix broad-path seeds as "Try something new" overnight; once generation fires for the subject they will gradually rotate out via picking).

### Cache invalidation (MEDIUM-2)

`useFiling` already invalidates `['book-suggestions', subjectId, activeProfile?.id]` on success — confirm during implementation; if not, add it. The count guard relies on the cache reflecting the post-pick state on the next picker visit.

### Loader changes (HIGH-1)

Update `LOADING_MESSAGES` and the slow-loading hint in the picker so the user understands a longer first-visit wait is generation, not a hang. Two-message swap is enough — no need for a server-driven flag.

The empty state at `pick-book/[subjectId].tsx:376-385` remains untouched — it now only renders when generation truly failed and the pool is still empty (degraded fallback, not a normal first visit).

The `BUG-318` auto-open-custom-input effect (`:112-124`) keeps its current trigger — only fires when `suggestions.length === 0`, which now means generation failed.

## Out of Scope

- No background pre-warming, no Inngest job, no shelf-side prefetch — explicit user constraint.
- No per-suggestion rationale text ("Suggested because you studied X"). Just title/description/emoji + category header.
- No "regenerate now" button — generation only runs as a side effect of pool depletion.
- No change to topic suggestions (`topicSuggestions` table, narrow-path picker).
- No change to `/all` endpoint (used by shelf, not picker).
- No language-subject handling — generation function returns early on `pedagogyMode='four_strands'`.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Pool ≥4 | Normal | Suggestions, grouped if picked-any | Pick or "Something else…" |
| Pool 0–3, generation succeeds | Top-up fires | 4 fresh suggestions | Pick or "Something else…" |
| Pool 0, generation fails (LLM error / quota) | Network or upstream | "No suggestions yet" empty state, custom input auto-open | Type and submit; or back. Cool-down (CRITICAL-2) prevents retry-storm; user can re-attempt after 5 min |
| Pool 0–3, generation fails | Network or upstream | Whatever was in the pool, ungrouped | Pick existing or "Something else…" |
| Pool 0–3, concurrent request in flight | Two GETs land within ms | Lock loser returns whatever exists; lock winner finishes and the next visit sees the full pool | Pick or "Something else…"; refresh after a second |
| Pool 0–3, in cool-down window | Recent failure within last 5 min | Whatever was in the pool, ungrouped | Pick existing, "Something else…", or wait/come back after 5 min |
| Subject is `four_strands` | Language subject | Whatever was in the pool (likely 0) | Custom input — same as today |
| Generation produces 0 net inserts (all titles dedup-collide with existing) | LLM returned only near-duplicates | Whatever was in the pool, ungrouped | Pick existing or "Something else…"; cool-down prevents immediate retry |

## Tests

- Server unit: `book-suggestion-generation.ts` — happy path returns 2+2, dedup against existing titles via `areEquivalentBookTitles`, language-subject early return, LLM-failure no-throw, cool-down stamp written before LLM call (CRITICAL-2).
- Server unit: cool-down skip path (CRITICAL-2) — when `bookSuggestionsLastGenerationAttemptedAt` is within 5 min, function returns without calling the LLM.
- Server unit: lock-loser path (CRITICAL-1) — simulate `pg_try_advisory_xact_lock` returning false; function returns without calling LLM and emits `book_suggestion_generation_failed { reason: 'lock_loser' }`.
- Server integration: `book-suggestions.test.ts` — GET with empty pool triggers generation and returns ≥4 (mocked LLM); GET with 5 unpicked returns 5 without generating; GET with `four_strands` subject does not generate; response shape is `{ suggestions, curriculumBookCount }`.
- Server integration: concurrency break test (CRITICAL-1) — fire two GETs in parallel against an empty-pool subject with mocked LLM; assert exactly one LLM call and exactly 4 net inserts (not 8).
- Server integration: cool-down break test (CRITICAL-2) — fire GET → fail → fire GET again immediately → assert second call did NOT invoke LLM and metric was emitted.
- Server integration: race-safe insert (HIGH-3) — concurrent inserts of the same title raise the unique-violation, service swallows it, final pool contains one row not two.
- Server integration: profile-scoping break test — calling GET with another user's `subjectId` returns `{ suggestions: [], curriculumBookCount: 0 }` and inserts nothing (no IDOR through the new write path).
- Mobile unit: `pick-book/[subjectId].test.tsx` — renders grouped sections when `hasAnyBook`, flat grid otherwise, headers only show when corresponding category is non-empty, legacy null suggestions render in their own ungrouped section under headers (LOW-1).
- Mobile unit: `useBookSuggestions` returns the envelope shape; `useFiling` invalidation refreshes the picker on next mount (MEDIUM-2).
- LLM eval (`pnpm eval:llm`) — snapshot the new prompt; **two Tier-2 fixtures (MEDIUM-5)**: (a) subject with ≥1 studied topic → expect 2 `related` + 2 `explore`; (b) subject with zero studied topics → expect 4 `explore`. Schema validation alone won't catch a prompt that fails the categorization split.
