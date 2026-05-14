# Chat Notes And Bookmarks Implementation Plan

> **For agentic workers:** Implement task-by-task. Keep the first PR focused on chat `Add note`, bookmark discoverability, and topic-page bookmark surfacing. Library-search bookmark results may be a second PR if the API contract change grows.

**Goal:** Make note-taking central in the active chat session while keeping `I'm Done` separate, preserve message-level bookmarks, and make both notes and bookmarks discoverable under topics in Library.

**Source spec:** `docs/specs/2026-05-12-chat-notes-bookmarks.md`

**Tech stack:** Expo / React Native, NativeWind semantic tokens, TanStack Query, Hono, Drizzle, Zod schemas, Jest.

---

## Scope Split

### PR 1 — Chat And Topic Saved Items

Ship the 80% product slice:

- Add prominent `Add note` to the session tool strip.
- Reuse the existing session note composer with summary-oriented placeholder copy.
- Keep `I'm Done` in the header and verify it remains separate.
- Increase message bookmark icon discoverability.
- Show topic-scoped bookmarks on the topic detail page.

### PR 2 — Library Search Bookmarks

Add bookmark results to Library search if it does not fit cleanly in PR 1:

- Extend shared library-search schema.
- Add API search query over bookmark content.
- Render `Bookmarks` result section in mobile search.
- Route bookmark result taps to the source session summary/transcript.

---

## Files

### PR 1 Created

- `apps/mobile/src/components/library/BookmarkCard.tsx` — compact topic-page bookmark row/card.
- `apps/mobile/src/components/library/BookmarkCard.test.tsx` — render and press behavior.

### PR 1 Modified

- `apps/mobile/src/components/session/SessionAccessories.tsx` — add primary `Add note` tool-strip action.
- `apps/mobile/src/components/session/SessionAccessories.test.tsx` — cover stage gating, disabled state, and callback.
- `apps/mobile/src/app/(app)/session/index.tsx` — pass `onAddNote={() => setShowNoteInput(true)}` into `SessionToolAccessory`; keep `endSessionButton` unchanged.
- `apps/mobile/src/components/session/SessionFooter.tsx` — pass chat-specific placeholder into `NoteInput`; preserve existing save/cancel semantics.
- `apps/mobile/src/components/session/SessionFooter.test.tsx` — cover placeholder and existing create-note payload.
- `apps/mobile/src/components/library/NoteInput.tsx` — accept optional `placeholder` prop.
- `apps/mobile/src/components/library/NoteInput.test.tsx` — cover default and custom placeholder behavior.
- `apps/mobile/src/components/session/SessionMessageActions.tsx` — increase bookmark icon/touch target discoverability.
- `apps/mobile/src/components/session/SessionMessageActions.test.tsx` — preserve bookmark rendering/toggle tests.
- `apps/mobile/src/hooks/use-bookmarks.ts` — add optional `topicId` query support if API filtering is chosen.
- `apps/mobile/src/app/(app)/topic/[topicId].tsx` — render `Saved from chat` bookmarks section near notes.
- `apps/mobile/src/app/(app)/topic/[topicId].test.tsx` — cover bookmark section present/absent.
- `apps/mobile/src/i18n/locales/en.json` and generated locale files — add i18n keys (mandatory, not optional — all user-visible strings in this area use `t()`): `session.accessories.addNote`, `session.notePrompt.chatPlaceholder` (`Summarize this in your own words...`), `library.topic.savedFromChat`.

### PR 1 API Files (Required — client-side filtering is not viable)

> `useBookmarks` is a `useInfiniteQuery`. A client-side `topicId` filter only sees page 1 of results; users with many bookmarks silently miss topic-scoped items. Server-side filtering is mandatory, not optional.

- `packages/schemas/src/bookmarks.ts` — add optional `topicId` to bookmark list query schema.
- `apps/api/src/routes/bookmarks.ts` — accept optional `topicId` on `GET /bookmarks`.
- `apps/api/src/services/bookmarks.ts` — filter bookmarks by `topicId` with profile scoping.
- `apps/api/src/routes/bookmarks.test.ts` / `apps/api/src/services/bookmarks.test.ts` — cover topic filter and profile isolation.

### PR 2 Modified

- `packages/schemas/src/library-search.ts`
- `apps/api/src/services/library-search.ts`
- `apps/api/src/services/library-search.test.ts`
- `apps/mobile/src/hooks/use-library-search.ts`
- `apps/mobile/src/components/library/LibrarySearchResults.tsx`
- `apps/mobile/src/components/library/LibrarySearchResults.test.tsx`
- `apps/mobile/src/app/(app)/library.tsx`
- `apps/mobile/src/app/(app)/library.test.tsx`

---

## Decisions

- **Use existing notes storage.** Chat notes remain topic notes with optional `sessionId`. Do not add `eventId` or highlight anchoring in this work.
- **Keep completion separate.** `I'm Done` stays in the session header and is not combined with `Add note`.
- **Make notes primary, bookmarks contextual.** `Add note` is a prominent composer-adjacent action; bookmark stays per-message.
- **Topic page is the first Library surface.** Search bookmarks are useful, but topic surfacing is the more direct requirement and can ship first.
- **Server-side `topicId` filtering is required.** `useBookmarks` is a paginated infinite query — client-side filtering only sees page 1 and silently misses bookmarks on subsequent pages. Add `topicId` to the API route and service; schedule full bookmark search for PR 2.

---

## PR 1 Tasks

### Task 1: Add primary `Add note` action to session tool strip

**Files:**

- `apps/mobile/src/components/session/SessionAccessories.tsx`
- `apps/mobile/src/components/session/SessionAccessories.test.tsx`
- `apps/mobile/src/app/(app)/session/index.tsx`

- [ ] Extend `SessionToolAccessoryProps` with `onAddNote?: () => void`.
- [ ] Render `Add note` (label via `t('session.accessories.addNote')`, add key to `en.json`) before secondary chips only when `stage === 'teaching'` and `onAddNote` is provided.
- [ ] Style `Add note` as primary within the strip: icon `document-text-outline`, semantic primary/accent classes, and `min-h-[44px]`.
- [ ] Keep `Switch topic` and `Park it` as existing utility chips.
- [ ] Disable `Add note` while `isStreaming`.
- [ ] Wire `onAddNote={() => setShowNoteInput(true)}` from `session/index.tsx`.
- [ ] Test: teaching stage renders all three actions.
- [ ] Test: non-teaching stages render no tool strip.
- [ ] Test: tapping `Add note` calls `onAddNote`.
- [ ] Test: streaming disables the action.

### Task 2: Tune chat note composer copy

**Files:**

- `apps/mobile/src/components/library/NoteInput.tsx`
- `apps/mobile/src/components/library/NoteInput.test.tsx`
- `apps/mobile/src/components/session/SessionFooter.tsx`
- `apps/mobile/src/components/session/SessionFooter.test.tsx`
- locale files if copy is localized in this area

- [ ] Add optional `placeholder?: string` prop to `NoteInput`.
- [ ] Keep default placeholder as `Write your note...`.
- [ ] Pass `t('session.notePrompt.chatPlaceholder')` when `NoteInput` is rendered from `SessionFooter` (add key to `en.json`: `"chatPlaceholder": "Summarize this in your own words..."`).
- [ ] Preserve mic, save, cancel, max length, saving state, and empty validation.
- [ ] Test: default placeholder still renders for normal note input.
- [ ] Test: custom placeholder renders from session footer.
- [ ] Test: existing save payload remains `{ topicId, content, sessionId }`.

### Task 3: Preserve `I'm Done` separation

**Files:**

- `apps/mobile/src/app/(app)/session/index.tsx`
- existing session tests if needed

- [ ] Do not move `endSessionButton`.
- [ ] Verify note composer open/closed state does not hide `I'm Done`.
- [ ] Verify session close behavior is unchanged.
- [ ] If an existing test can cover this cheaply, add assertion that `end-session-button` remains rendered after opening note input.
- [ ] Note: `HomeworkModeChips` in `SessionAccessories.tsx` has its own `I'm Done` chips (`testID="finish-homework-early-chip"`, `testID="finish-homework-chip"`) — these are separate from `endSessionButton` and must remain untouched.

### Task 4: Improve bookmark action discoverability

**Files:**

- `apps/mobile/src/components/session/SessionMessageActions.tsx`
- `apps/mobile/src/components/session/SessionMessageActions.test.tsx`

- [ ] Increase bookmark icon size from 20px to 22px.
- [ ] Ensure pressable has at least `min-h-[36px] min-w-[36px]`.
- [ ] Preserve accessibility labels: `Bookmark this response` and `Remove bookmark`.
- [ ] Preserve optimistic toggle behavior in `session/index.tsx`.
- [ ] Test: bookmark toggle still renders for assistant messages with `eventId`.
- [ ] Test: bookmark toggle remains absent without `eventId`.

### Task 5: Add topic-page bookmark card

**Files:**

- `apps/mobile/src/components/library/BookmarkCard.tsx`
- `apps/mobile/src/components/library/BookmarkCard.test.tsx`

- [ ] Create a compact semantic-token card/row for saved chat bookmarks. Structure it to visually parallel `InlineNoteCard` (same `sourceLine`/`content`/icon/press shape) so notes and bookmarks look like related saved-item types on the topic page — not two unrelated components. Do not reuse `InlineNoteCard` directly; bookmarks have no expand/collapse and use a bookmark icon rather than a note icon.
- [ ] Props should include `bookmarkId`, `content`, `createdAt`, optional `sourceLine` (pre-formatted display string, e.g. subject/topic/date), optional `onPress`, and `testID`.
- [ ] Render bookmark icon, truncated content excerpt, and source/date line.
- [ ] Use semantic classes/tokens; no hardcoded hex.
- [ ] Test: renders content excerpt and source line.
- [ ] Test: calls `onPress` when pressed.

### Task 6: Surface bookmarks under topics

**Files:**

- `apps/mobile/src/hooks/use-bookmarks.ts`
- `apps/mobile/src/app/(app)/topic/[topicId].tsx`
- `apps/mobile/src/app/(app)/topic/[topicId].test.tsx`

- [ ] Use server-side `topicId` filter: extend `useBookmarks` to accept `topicId` and pass it to the API route (see required API files above). Client-side filtering is not acceptable — `useBookmarks` is paginated and only page 1 would be visible, silently missing bookmarks on subsequent pages.
- [ ] Query bookmarks once `subjectId` and `topicId` are known.
- [ ] Render `Saved from chat` section near existing notes using `t('library.topic.savedFromChat')` (add key to `en.json`).
- [ ] Hide section entirely when no topic-scoped bookmarks exist.
- [ ] Route bookmark press to `/session-summary/[sessionId]` or existing transcript/summary behavior.
- [ ] Test: topic page shows saved bookmark content when bookmark belongs to topic.
- [ ] Test: topic page hides bookmark section when no bookmarks match.
- [ ] Test: bookmark with `topicId = null` does not render under topic.
- [ ] Test: mock data containing a bookmark with a mismatched `topicId` does not appear in the section (verifies `useBookmarks` scoping and the `topicId` filter are both exercised).

### Task 7: PR 1 validation

- [ ] Run focused mobile tests:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/session/SessionAccessories.tsx \
  src/components/session/SessionFooter.tsx \
  src/components/library/NoteInput.tsx \
  src/components/session/SessionMessageActions.tsx \
  src/components/library/BookmarkCard.tsx \
  "src/app/(app)/topic/[topicId].tsx" \
  --no-coverage
```

- [ ] If API bookmark filtering was added, run focused API tests for bookmarks.
- [ ] Run mobile typecheck directly from `apps/mobile` if the touched area is broad:

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

---

## PR 2 Tasks

### Task 8: Extend library-search contract with bookmarks

**Files:**

- `packages/schemas/src/library-search.ts`
- related schema tests if present

- [ ] Add `bookmarks` array to `LibrarySearchResult`.
- [ ] Include `bookmarkId`, `sessionId`, `eventId`, `subjectId`, `subjectName`, nullable `topicId`, nullable `topicName`, `contentSnippet`, and `createdAt`.
- [ ] Keep existing result arrays backward-compatible at call sites by updating all mocks/fixtures.

### Task 9: Search bookmarks server-side

**Files:**

- `apps/api/src/services/library-search.ts`
- `apps/api/src/services/library-search.test.ts`

- [ ] Add profile-scoped bookmark content search.
- [ ] Join subject/topic names for display.
- [ ] Server-truncate snippets consistently with notes/session search.
- [ ] Test: bookmark content match appears.
- [ ] Test: another profile's bookmark does not appear.
- [ ] Test: `topicId = null` bookmark still appears in search with sensible secondary line.

### Task 10: Render bookmark search results on mobile

**Files:**

- `apps/mobile/src/components/library/LibrarySearchResults.tsx`
- `apps/mobile/src/components/library/LibrarySearchResults.test.tsx`
- `apps/mobile/src/app/(app)/library.tsx`
- `apps/mobile/src/app/(app)/library.test.tsx`

- [ ] Add `Bookmarks` section after Notes or before Sessions; keep section order stable.
- [ ] Render bookmark rows with bookmark icon, excerpt, subject/topic/date context.
- [ ] Route tap to `/session-summary/[sessionId]`.
- [ ] Include bookmarks in empty-result detection.
- [ ] Test: section renders when bookmarks array has results.
- [ ] Test: empty state accounts for bookmarks.
- [ ] Test: pressing a bookmark routes correctly.

### Task 11: PR 2 validation

- [ ] Run schemas typecheck if schema changed:

```bash
pnpm exec nx run schemas:typecheck
```

- [ ] Run focused API/mobile tests:

```bash
pnpm exec jest apps/api/src/services/library-search.test.ts --runInBand
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/library/LibrarySearchResults.tsx \
  "src/app/(app)/library.tsx" \
  --no-coverage
```

---

## Failure Modes To Preserve

| State | Required behavior |
| --- | --- |
| No current topic | `Add note` can open composer, but save shows existing cannot-save alert if `topicId` is unavailable. |
| Note save fails | Existing save-failed alert with formatted API error. |
| Note composer open during streaming | Composer remains open; only the `Add note` trigger is disabled while streaming. |
| User closes session with unsaved note | Existing session close flow wins; unsaved note is discarded in Phase 1. |
| Bookmark save/delete fails | Optimistic bookmark state rolls back and alert appears. |
| Bookmark has no topic | Not shown under topic page; still eligible for profile-wide search once PR 2 ships. |
| Library search fails | Existing search error and retry behavior remain. |

---

## Manual QA

- [ ] Start a normal learning session.
- [ ] Confirm `Add note`, `Switch topic`, and `Park it` appear near the composer during teaching.
- [ ] Confirm `Add note` is visually primary and `I'm Done` stays in the header.
- [ ] Open `Add note`, type a short summary, save, and confirm chat remains open.
- [ ] Confirm saved note appears under the relevant topic in Library.
- [ ] Bookmark an assistant message and confirm the icon toggles visibly.
- [ ] Confirm the bookmarked message appears under the topic's `Saved from chat` section.
- [ ] Tap the bookmark from topic page and confirm it opens the source session summary/transcript path.
- [ ] Search Library for note text and bookmark text after PR 2.

---

## Out Of Scope For This Plan

- Sentence-level highlights.
- Message/event anchored notes.
- Highlight Library browsing.
- Save-before-ending confirmation for unsaved note text.
- A unified saved-item database table.
