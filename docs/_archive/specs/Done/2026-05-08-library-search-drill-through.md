# Library Search Drill-Through

**Date:** 2026-05-08
**Revised:** 2026-05-08 (pressure-test pass — see "Changes from initial draft" below)
**Status:** Ready for implementation
**Source backlog:** `docs/plans/app evolution plan/2026-05-06-hidden-wins-backlog.md` → "P1 — Search results drilled down to subject only" + "P3 — `library-filters.ts` final delete"
**Companion cleanup:** `library-filters.ts` deletion bundled in this PR as the v2→v3 search migration completion.

## Thesis

The library search API already returns four typed result arrays (`subjects`, `books`, `topics`, `notes` with `contentSnippet`) — and an LLM-generated session summary exists for every completed session (`session_summaries` table, rich text fields) — but **none of this is searchable as far as the user is concerned**. `apps/mobile/src/app/(app)/library.tsx:250-258` flattens the four arrays to `Set<subjectId>` and discards type, title, snippet, and direct-tap potential. Session summaries are not indexed at all.

This spec wires the unused payload to typed result rows with correct drill-through targets, adds session-summary search as a fifth result type (data already exists — only indexing is new), tightens the API contract where the existing schema couldn't support note-aware navigation, handles multi-subject collision (same topic name across subjects), and deletes the dead v2 client-filter helpers that v3 supersedes.

One PR. One thesis: *finish the v3 search wire-up — make the library search actually search the library.*

## Changes from initial draft

The initial draft had four holes that pressure-testing surfaced:

1. **Note → session was specified, but the API didn't return `sessionId` on note rows.** Listed schema changes as out-of-scope, contradicting itself. Now in scope.
2. **Path typo:** `/(app)/session-summary/[sessionId]` — actual route is `/session-summary/[sessionId]` (root, not under `(app)`).
3. **Subject result rows were specified as a stripped one-liner**, which would have been an informational regression vs. the current "narrow the grid in place with full density" behavior. Now reuse `ShelfRow`.
4. **Sessions weren't searchable at all** — meaning a 20-minute conversation about a topic with no captured note was invisible to search. Session-summary search added as a fifth result type.

Plus: **note rows now drill to the parent topic** (where the matched note appears inline with surrounding context), not directly to the session-summary screen. **Multi-subject disambiguation** (subject in secondary line, sort by subject, subject color pill) added to handle the case where the same word matches across multiple subjects.

## API Contract Changes (in scope)

### 1. `notes` array gains `sessionId`

`packages/schemas/src/library-search.ts` — note item schema:

```ts
notes: z.array(z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),     // NEW
  topicId: z.string().uuid(),
  bookId: z.string().uuid(),
  subjectId: z.string().uuid(),
  contentSnippet: z.string(),
})),
```

`apps/api/src/services/library-search.ts:90-95` — note SELECT projects `topicNotes.sessionId`. Column already exists on `topic_notes` (`packages/database/src/schema/notes.ts:20`); only the projection was missing.

### 2. New `sessions` array

```ts
sessions: z.array(z.object({
  sessionId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  bookId: z.string().uuid().nullable(),
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  snippet: z.string(),                 // server-truncated to ~100 chars
  occurredAt: z.string().datetime(),   // learning_sessions.startedAt
})),
```

`searchLibrary` adds a fifth parallel ILIKE query:

- Source: `session_summaries`, joined to `learning_sessions` for `subjectId/topicId/startedAt` and (left-joined) to `curriculum_topics` + `curriculum_books` + `subjects` for parent display.
- Match: `OR ILIKE` across `content | narrative | learnerRecap | aiFeedback | highlight | closingLine`. The longest-matching field's value is used as the snippet source (truncated server-side).
- Filters:
  - `session_summaries.purgedAt IS NULL` (tiered retention compliance — `docs/specs/2026-05-05-tiered-conversation-retention.md`)
  - `session_summaries.status IN ('submitted', 'accepted', 'auto_closed')` — skip `pending` and `skipped` (no real content)
  - `learning_sessions.profileId = $profileId` (parent-chain scoping per `CLAUDE.md`)
- Order: `ORDER BY subjects.name ASC, learning_sessions.startedAt DESC` (subject grouping, recency within subject).
- `LIMIT 20`.

`topicId` and `topicTitle` are nullable because freeform sessions may have no `topicId`.

## Drill-Through Targets

| Result type | Tap target | Routing rule |
|---|---|---|
| `subject` | `/(app)/shelf/[subjectId]` | Direct push. Reuse `handleShelfPress` (`library.tsx:262`). |
| `book` | `/(app)/shelf/[subjectId]/book/[bookId]` | Push ancestor chain: shelf first, then book. Required by `CLAUDE.md` cross-stack rule — a leaf-only push synthesizes a 1-deep stack and `router.back()` falls through to Tabs first-route. |
| `topic` | `/(app)/topic/[topicId]` | Direct push. `apps/mobile/src/app/(app)/topic/_layout.tsx` already exports `unstable_settings.initialRouteName: 'index'` — back-navigation from a deep-pushed topic is safe. |
| `note` | `/(app)/topic/[topicId]` | **Notes drill to their parent topic, not the source session.** The topic screen renders the matched note inline via `InlineNoteCard` with surrounding context (book header, sibling sessions, study CTA). The note's own source line on `InlineNoteCard` is itself tappable for users who want the source conversation — best-of-both: context first, conversation one tap away. |
| `session` | `/session-summary/[sessionId]` | **Route lives at root** (`apps/mobile/src/app/session-summary/[sessionId].tsx`), not under `(app)`. Reuse `handleNoteSourcePress` semantics from `book/[bookId].tsx:661-673`. Direct landing on the conversation recap — reading it is the action; an intermediate topic screen would add a tap for nothing. |

Note and session rows have **different destinations**, so the cross-type de-dup question dissolves: a session that has both a matching note and a matching summary produces two legitimately different rows ("the note I wrote, with topic context" vs. "the AI's recap of the whole conversation").

## Result Row UI

Render typed result rows under the search bar when `debouncedQuery` is non-empty and `searchResult.data` is loaded. Group by type with section headers, in this order: **Subjects, Books, Topics, Notes, Sessions**. Hide a section entirely when its array is empty.

### Per-row content

| Type | Primary line | Secondary line |
|---|---|---|
| Subject | (Reuse `ShelfRow`) | Full shelf density: book count, retention pill, topic progress — same as the grid |
| Book | Book title | `Subject` |
| Topic | Topic name | `Book · Subject` |
| Note | `contentSnippet` (server-truncated to ~100 chars) | `Topic · Subject · {relativeDate}` |
| Session | `snippet` (server-truncated to ~100 chars) | `Topic · Subject · {relativeDate}` (Topic falls back to "Freeform" if `topicId` is null) |

**Subject rows reuse `ShelfRow`** rather than introducing a stripped one-liner. Today, typing a subject name narrows the shelf grid in place with full density; replacing that with a stripped row would be an informational regression.

**Subject is shown on every non-subject row.** Without it, two notes both reading "microbes are tiny" — one in Biology, one in Chemistry — are visually indistinguishable. The cross-subject collision case is the load-bearing test for this rule.

### Subject color indicator

Each non-subject row carries a small colored subject pill or dot derived from the subject's existing color theme (the same color used in `ShelfRow`). Provides peripheral-vision disambiguation when results span multiple subjects ("blue = Biology, green = Chemistry") without forcing the user to read every secondary line.

### Sort within each section

Server queries `ORDER BY subjects.name ASC, <intrinsic field>` (book title, topic title, note id, session `startedAt DESC`). Same-subject rows cluster together within each section.

### Match highlighting

Substring bolding on the primary line is **out of scope** for this PR.

### Search-active behavior

When `debouncedQuery` is non-empty:
- The shelf grid below is hidden (current behavior — preserve via `visibleSubjects` filter).
- The result-rows region renders the up-to-five sections.
- Subject results in the search region replace the "narrow the grid" effect that exists today.

When all five arrays are empty: render an empty state ("No matches for '{query}'.") in place of the result rows.

When `debouncedQuery` is empty: result-row block not rendered; shelf grid renders normally — current behavior, no change.

## Failure Modes

The "stale FK" worries from the original backlog largely dissolve once the data model is checked: sessions have no delete path in `apps/api/src` (no `deleteSession`, no `db.delete(learningSessions)`), and subjects/books/topics are status-flagged rather than removed. Notes have `deleteNoteById`, but a deleted note cannot appear in a search result.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Empty result, valid query | Server returns `{subjects:[],books:[],topics:[],notes:[],sessions:[]}` | "No matches for '{query}'." inline empty state above the (hidden) shelf grid. | Clear the query — shelf grid reappears unchanged. |
| Search request errors / offline | `useLibrarySearch` returns error state | Inline error row: "Couldn't search right now." with retry. | Tap retry, or clear the query to fall back to the offline-cached shelf grid. |
| Tap a result whose target was archived between fetch and tap | Race window (subject/book status flipped to archived) | Target screen renders with whatever archived treatment it already has. | Per-screen recovery (out of scope here). |
| Session summary purged after user saw the result row | Tiered retention purge ran after fetch, before tap (rare; minutes-wide window) | Session-summary screen renders its existing not-found state. | Per-screen recovery; user re-runs search if they want fresh results. |
| Freeform session with `topicId = null` | Session has no parent topic | Session row's secondary line shows "Freeform" instead of a topic name; tap still lands on `/session-summary/[sessionId]`. | N/A — drill-through works regardless. |
| Same topic name across multiple subjects | "Microbes" exists in both Biology and Chemistry | Two distinct rows; subject in secondary line + subject color pill disambiguates. | N/A — by design. |

The race-condition rows deliberately avoid per-result-row error handling. Building "this result is stale, here's a custom fallback" UI for races that occur in seconds-to-minutes-wide windows is over-engineering — target screens already have not-found states.

## library-filters.ts Cleanup

`apps/mobile/src/lib/library-filters.ts` retains only the `EnrichedBook` interface; the v2 filter helpers (`filterShelves`, `sortShelves`, `filterBooks`, `filterTopics`) are already gone. Single live consumer: `apps/mobile/src/hooks/use-all-books.ts`.

Action:
1. Inline `EnrichedBook` into `apps/mobile/src/hooks/use-all-books.ts`.
2. Delete `apps/mobile/src/lib/library-filters.ts`.
3. Verify no other files import from it.

This is migration-completion, not redesign-bundling.

## Out of Scope

Explicitly **not** in this PR:

- Match highlighting (substring bolding).
- Client-side ranking / re-ordering beyond the server's subject-then-recency ORDER BY.
- Recent-search history.
- Type filter chips ("Notes only", "Sessions only").
- **Subject filter chips** ("Limit to: Biology · Chemistry"). Useful but a real UI addition; defer to a follow-up if subject-pill + subject-context-line turns out to be insufficient in practice.
- Smart cross-subject ranking (boost subjects the user studies most).
- Per-subject result limits — global `.limit(20)` per type can skew toward a single dominant subject in extreme cases. Edge case; not v1 work.
- Match into session **transcripts**. Only the LLM summary is indexed. Full transcript search is a different scale of work (likely embeddings, not ILIKE).
- Subject-status badge treatment on result rows.

## Test Coverage

- **Unit (component-level):** Render with each combination of empty/non-empty arrays, including the new `sessions` array. Verify section headers appear/hide correctly. Verify the cross-subject collision case ("Microbes" in two subjects produces two distinguishable rows with subject color pills). Verify empty-state copy. Verify error-state retry button calls `refetch`. Verify freeform-session row renders "Freeform" fallback for null topic.
- **Integration (mobile):** Tap each of the five result types and assert the correct route push:
  - Subject row → `/(app)/shelf/[subjectId]`.
  - Book row → **two-step push** (shelf, then book). Single-leaf push for a book result is the regression this spec is preventing.
  - Topic row → `/(app)/topic/[topicId]`.
  - Note row → `/(app)/topic/[topicId]` (parent topic; matched note then visible inline on landing).
  - Session row → `/session-summary/[sessionId]` (root path, not under `(app)`).
- **API integration (`searchLibrary`):** cross-subject hits, purged session summaries excluded, `pending`/`skipped` summaries excluded, freeform session (`topicId = null`) included, scoped repository correctness (no cross-profile leakage), `sessionId` present on note rows.
- **No new internal `jest.mock()` (GC1 ratchet).** Use `jest.requireActual()` for any partial stubbing. The search hook is a fetch-layer boundary; mock at the boundary, not internal to it.
- **library-filters.ts deletion:** `pnpm exec tsc --build` and lint pass. No test work needed; the helpers had no live callers.

## Sizing

- Drill-through implementation (subjects, books, topics, notes): **S**.
- Session-summary search query + new result type: **+XS** (data already exists; only the query and rendering are new).
- Multi-subject disambiguation (subject context line, color pill, sort by subject): **+XS** (cosmetic).
- API contract changes (`sessionId` on notes, new `sessions` array): **+XS** (schema + projection).
- `library-filters.ts` cleanup: **XS**.
- **Combined PR: S+**, single PR. No new infrastructure; reuses existing routes, components, and the scoped repository pattern.

## Acceptance

- [ ] `librarySearchResultSchema` extended with `sessionId` on notes and a new `sessions` array; `searchLibrary` projects accordingly.
- [ ] Session-summary query filters `purgedAt IS NULL`, excludes `pending`/`skipped` statuses, scopes via `learning_sessions.profileId`.
- [ ] All five result-type sections render under the search bar with correct grouping and section headers.
- [ ] Subject rows reuse `ShelfRow` and preserve full density (book count, retention pill, topic progress).
- [ ] Note and session rows show `Topic · Subject · {date}` in their secondary line; freeform session falls back to "Freeform".
- [ ] Each non-subject row carries a subject color pill matching the subject's color theme.
- [ ] Server queries `ORDER BY subjects.name ASC, <intrinsic field>` so same-subject results cluster within each section.
- [ ] Tapping each result type lands on the correct screen, with books pushing the full shelf→book ancestor chain, notes landing on parent topic, sessions landing on root `/session-summary/[sessionId]`.
- [ ] Cross-subject collision case (same topic name in two subjects) renders distinguishable rows.
- [ ] Empty-state and error-state UI render correctly.
- [ ] Component, mobile-integration, and API-integration tests added per the section above.
- [ ] `library-filters.ts` deleted; `EnrichedBook` inlined into `use-all-books.ts`; no broken imports.
- [ ] `pnpm exec nx run mobile:lint`, `tsc --noEmit`, related Jest suites, and integration tests pass locally.
