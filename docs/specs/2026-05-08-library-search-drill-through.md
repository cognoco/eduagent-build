# Library Search Drill-Through

**Date:** 2026-05-08
**Status:** Ready for implementation
**Source backlog:** `docs/plans/app evolution plan/2026-05-06-hidden-wins-backlog.md` → "P1 — Search results drilled down to subject only"
**Companion cleanup:** `library-filters.ts` final delete (P3, XS) — bundled in this PR as the v2→v3 search migration completion.

## Thesis

The library search API already returns four typed result arrays (`subjects`, `books`, `topics`, `notes` with `contentSnippet`). `apps/mobile/src/app/(app)/library.tsx:249-257` flattens all four to `Set<subjectId>` and discards type, title, snippet, and direct-tap potential. This spec wires the unused payload to typed result rows with correct drill-through targets, and deletes the dead v2 client-filter helpers that v3 supersedes.

One PR. One thesis: *finish the v3 search wire-up.*

## Drill-Through Targets

| Result type | Tap target | Routing rule |
|---|---|---|
| `subject` | `/(app)/shelf/[subjectId]` | Direct push. Already implemented as `handleShelfPress` (`library.tsx:262`). Reuse. |
| `book` | `/(app)/shelf/[subjectId]/book/[bookId]` | Push ancestor chain: shelf first, then book. Required by CLAUDE.md cross-stack rule — a leaf push synthesizes a 1-deep stack and `router.back()` falls through to Tabs first-route. |
| `topic` | `/(app)/topic/[topicId]` | Direct push. Topic is a flat top-level route under `(app)`, not nested under shelf/book. No ancestor chain to push. |
| `note` | `/(app)/session-summary/[sessionId]` | Reuse the `handleNoteSourcePress` semantics already wired in `shelf/[subjectId]/book/[bookId].tsx:651-663`. Note search rows tap straight into the source session, same as the in-book note source line. |

## Result Row UI

Render typed result rows under the search bar when `debouncedQuery` is non-empty and `searchResult.data` is loaded. Group by type with section headers, in this order: **Subjects, Books, Topics, Notes**. Hide an entire group when its array is empty; show no header for a group with zero results.

Per-row content:

| Type | Primary line | Secondary line |
|---|---|---|
| Subject | Subject title | (nothing — title is enough) |
| Book | Book title | Subject title (parent context) |
| Topic | Topic title | `Book · Subject` (parent context) |
| Note | `contentSnippet` (first 120 chars, ellipsised) | `Topic · Book` source context |

Match highlighting on the primary line is **out of scope for this PR**. The grouping + drill-through is the value; bolded substring matches can land later if useful.

When `debouncedQuery` is non-empty and *all four arrays are empty*, render an empty state (single line: "No matches for '{query}'.") in place of the result rows. The shelf grid below remains hidden while the query is active, same as the current v3 behaviour.

When `debouncedQuery` is empty, the result-row block is not rendered at all and the shelf grid shows normally — current behaviour, no change.

## Failure Modes

The "stale FK" worries listed in the backlog largely dissolve once the data model is checked. Sessions have no delete path in `apps/api/src` (`deleteSession`, `db.delete(learningSessions)` — neither exists). Subjects, books, and topics have no `db.delete(...)` calls; they are status-flagged, never removed. Notes do have `deleteNoteById`, but a deleted note cannot appear in a search result because the search query reads current rows.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Empty result, valid query | Server returns `{subjects:[], books:[], topics:[], notes:[]}` | "No matches for '{query}'." inline empty state above the (hidden) shelf grid. | Clear the query — the shelf grid reappears unchanged. |
| Search query runs while offline / API errors | `useLibrarySearch` returns error state | Inline error row: "Couldn't search right now." with a retry button that calls `searchResult.refetch()`. | Tap retry, or clear the query to fall back to the offline-cached shelf grid. |
| Tap navigates to a target that 404s | Race condition: result loaded, target row deleted/archived between fetch and tap | Target screen's existing not-found / fallback state handles this. No special handling in the search result row. | Existing per-screen recovery (shelf empty state, book not-found, topic not-found, session not-found). |
| Tap navigates to an archived subject/book | Subject/book has `status = 'archived'` — these screens still render | Normal target screen with whatever archived treatment the screen already has (out of scope here). | N/A — drill-through itself is not broken. |
| Note's parent session has been archived/cleaned (future state) | Currently impossible (sessions are immutable). If a session-cleanup cron is added later, it must filter the search index OR session-summary must handle missing-session as a typed not-found. | Deferred — flag this in any future session-cleanup spec. | N/A today. |

The third row deliberately avoids per-result-row error handling. Building "this result is stale, here's a custom fallback" UI for race conditions that can only occur in seconds-wide windows is over-engineering — the target screens already have not-found states.

## library-filters.ts Cleanup

`apps/mobile/src/lib/library-filters.ts` retains only the `EnrichedBook` interface; the v2 filter helpers (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`) are already gone. The single live consumer is `apps/mobile/src/hooks/use-all-books.ts`.

Action:
1. Inline `EnrichedBook` into `apps/mobile/src/hooks/use-all-books.ts` (single import site).
2. Delete `apps/mobile/src/lib/library-filters.ts`.
3. Verify no other files import from it (`grep -r "library-filters" apps/mobile/src`).

This is migration-completion, not redesign-bundling. The doc's "don't bundle" rule is about visual/design-QA bundling on a small phone — not about pairing a feature add with the obsolete-helper removal it makes possible.

## Out of Scope

- Match highlighting (substring bolding on the primary line).
- Client-side ranking / re-ordering of server results.
- Recent-search history.
- Type filter chips (e.g., "Notes only").
- Any change to the search API contract or `librarySearchResultSchema`.
- Subject-status badge treatment on result rows.

## Test Coverage

- **Unit (component-level):** Render with each combination of empty/non-empty arrays. Verify section headers appear/hide correctly. Verify empty-state copy. Verify error-state retry button calls `refetch`.
- **Integration:** Tap each of the four result types and assert the correct route push. Specifically assert the **two-step push** for books (shelf, then book) — a single-leaf push for a book result is the regression this spec is preventing.
- **No new internal `jest.mock()` (GC1 ratchet).** Use `jest.requireActual()` if any service needs partial stubbing. The search hook is a fetch-layer boundary; mock at that boundary, not internal to it.
- **library-filters.ts deletion:** verify `pnpm exec tsc --build` and lint pass. No test work needed; the file's helpers had no live callers.

## Sizing

- Drill-through implementation: **S** (down from the backlog's M — the FM table collapsed and note→session navigation infra already exists).
- `library-filters.ts` cleanup: **XS**.
- Combined PR: **S**.

## Acceptance

- [ ] All four result types render under the search bar with correct grouping.
- [ ] Tapping each result type lands on the correct screen, with books pushing the full shelf→book ancestor chain.
- [ ] Empty-state and error-state UI render correctly.
- [ ] Component + integration tests added per the section above.
- [ ] `library-filters.ts` deleted; `EnrichedBook` inlined into `use-all-books.ts`; no broken imports.
- [ ] `pnpm exec nx run mobile:lint`, `tsc --noEmit`, and the related Jest suites pass locally.
