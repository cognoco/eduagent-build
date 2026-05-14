# Chat Notes And Bookmarks In Session

**Date:** 2026-05-12
**Status:** Ready for implementation
**Source:** Product discussion and code audit on the active session chat, notes, bookmarks, and Library surfaces.

## Thesis

Learning notes should be a central action in the chat experience, while session completion remains a separate action. The first implementation should use the existing topic-note and bookmark systems instead of introducing highlight anchoring or a new saved-item model.

The 80% version is:

- Add a visible `Add note` action to the session tool strip near the composer.
- Keep `I'm Done` as a separate session-ending button in the header.
- Reuse the existing `NoteInput` and topic-note storage.
- Keep bookmarks as small message-level actions on assistant responses.
- Surface bookmarks under their topic in Library alongside existing notes.

This keeps the chat screen simple, preserves the current session lifecycle, and avoids making chat feel like a document editor.

## Current Code Reality

### Chat shell and session actions

- `apps/mobile/src/components/session/ChatShell.tsx` renders messages through `MessageBubble` and accepts `renderMessageActions`.
- `apps/mobile/src/components/session/SessionMessageActions.tsx` already renders feedback chips and the message-level bookmark toggle when a message has an `eventId`.
- `apps/mobile/src/app/(app)/session/index.tsx` already wires bookmark state through `useSessionBookmarks`, `useCreateBookmark`, and `useDeleteBookmark`.
- `apps/mobile/src/app/(app)/session/index.tsx` already renders `I'm Done` as `endSessionButton` in the header action area.
- `apps/mobile/src/components/session/SessionAccessories.tsx` renders the bottom teaching-stage tool strip with `Switch topic` and `Park it`.

### Notes

- `apps/mobile/src/components/session/SessionFooter.tsx` already supports an inline note prompt and `NoteInput`.
- `apps/mobile/src/components/library/NoteInput.tsx` already supports typed notes and voice dictation.
- `apps/mobile/src/hooks/use-notes.ts` exposes `useCreateNote(subjectId, bookId)` and writes notes through `POST /subjects/:subjectId/topics/:topicId/notes`.
- `packages/database/src/schema/notes.ts` stores notes in `topic_notes` with `topicId`, `profileId`, optional `sessionId`, `content`, `createdAt`, and `updatedAt`.
- `apps/api/src/services/notes.ts` validates topic ownership and optional session ownership before creating notes.

### Bookmarks

- `packages/database/src/schema/bookmarks.ts` stores bookmarks with `profileId`, `sessionId`, `eventId`, `subjectId`, optional `topicId`, copied `content`, and `createdAt`.
- Bookmarks are already event/message-specific. They are a better fit for per-message save than notes are today.
- `apps/mobile/src/hooks/use-bookmarks.ts` already exposes profile-wide and session-specific bookmark hooks.

### Library

- `apps/mobile/src/components/library/LibrarySearchResults.tsx` already has note rows in search results.
- `apps/mobile/src/app/(app)/topic/[topicId].tsx` already renders topic notes with `InlineNoteCard`.
- The gap is topic/library surfacing for bookmarks as first-class saved items alongside notes.

## Goals

1. Make note-taking visible and easy during chat without crowding message bubbles.
2. Preserve `I'm Done` as the clear session-ending action.
3. Store notes under topics so they continue to appear in Library/topic context.
4. Preserve bookmark behavior as one-tap message save.
5. Show bookmarks under topics in Library so saved chat moments are discoverable later.

## Non-Goals

- Do not implement text selection or true highlights in this slice.
- Do not add note anchoring to a specific `session_events.id` in this slice.
- Do not redesign the full Library screen.
- Do not merge `Add note` and `I'm Done`.
- Do not add a new global saved-item abstraction before notes and bookmarks are better understood in real use.

## Product Behavior

### Main Chat Screen

During teaching-stage sessions, the bottom tool strip should show:

- `Add note`
- `Switch topic`
- `Park it`

`Add note` should be the first chip and slightly more prominent than the other utility chips, using semantic accent styling rather than hardcoded colors.

The header keeps:

- timer, if enabled
- learning mode / milestones, if present
- `I'm Done`

Message-level actions remain quiet:

- bookmark icon on assistant messages with persisted `eventId`
- existing feedback chips
- future overflow/copy action, if added later

### Add Note Flow

When the learner taps `Add note`:

1. The existing inline note composer opens near the bottom of the chat.
2. The composer is associated with the current `topicId` and `sessionId`.
3. Placeholder copy nudges active learning: `Summarize this in your own words...`
4. Saving calls the existing create-note mutation.
5. On success, close the composer and keep the learner in chat.
6. On failure, show the existing alert path with classified API error formatting.

If no topic can be resolved, show the existing cannot-save note message instead of silently dropping input.

### Bookmark Flow

Bookmark remains a message-level action:

1. Tap bookmark icon on an assistant response.
2. The app creates a bookmark using the response `eventId`.
3. The icon updates optimistically.
4. Tapping again removes the bookmark.
5. Errors roll back optimistic UI and show a retryable alert.

### Topic Library Surfacing

On the topic screen, saved learning items should become easy to scan:

- Existing notes remain visible.
- Bookmarks for the topic should appear in a nearby section, for example `Saved from chat`.
- Bookmark rows should show a compact excerpt of the saved assistant message, the source session/date if available, and a bookmark icon.
- Tapping a bookmark should open the source session summary/transcript path already used for session drill-through where possible.

If a bookmark has `topicId = null`, it should not appear on a topic detail page. It can remain discoverable through profile-wide bookmark views/search.

### Library Search Surfacing

Library search should eventually include bookmarks as a typed result section:

- Section label: `Bookmarks`
- Primary line: saved message excerpt
- Secondary line: topic/subject/source date
- Tap target: source session summary/transcript, or topic detail if source session is unavailable

This can be implemented either in the same PR as topic-page surfacing or as a follow-up if the API search contract change would make the first slice too large.

## Implementation Plan

### 1. Add central `Add note` chip to the session tool strip

Files:

- `apps/mobile/src/components/session/SessionAccessories.tsx`
- `apps/mobile/src/app/(app)/session/index.tsx`
- `apps/mobile/src/components/session/SessionAccessories.test.tsx`

Actions:

- Extend `SessionToolAccessoryProps` with an optional `onAddNote`.
- Render `Add note` before `Switch topic` and `Park it` when `stage === 'teaching'` and `onAddNote` is provided.
- Wire `onAddNote={() => setShowNoteInput(true)}` from `session/index.tsx`.
- Disable the chip while streaming.
- Keep existing quick-chip behavior unchanged.

### 2. Reuse and tune the session note composer

Files:

- `apps/mobile/src/components/session/SessionFooter.tsx`
- `apps/mobile/src/components/library/NoteInput.tsx`
- `apps/mobile/src/components/library/NoteInput.test.tsx`
- `apps/mobile/src/i18n/locales/en.json` and generated locale files if required by current i18n workflow

Actions:

- Add an optional `placeholder` prop to `NoteInput`.
- Pass `Summarize this in your own words...` from `SessionFooter` when used in chat.
- Keep topic-page note input placeholder as `Write your note...`.
- Preserve mic, save, cancel, character limit, and validation behavior.

### 3. Keep `I'm Done` separate

Files:

- `apps/mobile/src/app/(app)/session/index.tsx`
- Existing session tests as needed

Actions:

- Do not move or merge `endSessionButton`.
- Verify the header still renders `I'm Done` independently from the note composer.
- Ensure opening the note composer does not disable or hide `I'm Done` unless an existing session-closing state already does.

### 4. Show bookmarks on the topic screen

Likely files:

- `apps/mobile/src/hooks/use-bookmarks.ts`
- `apps/mobile/src/app/(app)/topic/[topicId].tsx`
- New or existing library component, e.g. `apps/mobile/src/components/library/BookmarkCard.tsx`
- Co-located tests for any new component and topic screen behavior

Actions:

- Reuse `useBookmarks({ subjectId })` or add a focused hook if topic filtering is needed.
- If the API cannot filter by `topicId`, either filter client-side after fetching subject bookmarks for the first pass or add a `topicId` query parameter server-side.
- Render a `Saved from chat` section on topic pages when bookmarks exist for that topic.
- Use copied bookmark `content` for the row excerpt.
- Use semantic icon/color styling.
- Preserve notes as the central topic artifact; bookmarks support them rather than replacing them.

### 5. Add bookmark results to Library search

Likely files:

- `packages/schemas/src/library-search.ts`
- `apps/api/src/services/library-search.ts`
- `apps/mobile/src/hooks/use-library-search.ts`
- `apps/mobile/src/components/library/LibrarySearchResults.tsx`
- Co-located API/mobile tests

Actions:

- Add a `bookmarks` array to the library search response schema.
- Search bookmark `content` scoped by `profileId`.
- Include `bookmarkId`, `sessionId`, `eventId`, `subjectId`, `subjectName`, nullable `topicId`, nullable `topicName`, `contentSnippet`, and `createdAt`.
- Render a `Bookmarks` section in `LibrarySearchResults`.
- Route bookmark taps to the source session summary/transcript when possible.

## Acceptance Criteria

### Chat note action

Given a learner is in a teaching-stage session  
When the chat composer is visible and the app is not streaming  
Then the bottom session tool strip shows `Add note`, `Switch topic`, and `Park it`.

Given a learner taps `Add note`  
When the current session has a resolvable topic  
Then the inline note composer opens with the placeholder `Summarize this in your own words...`.

Given the note composer is open  
When the learner saves valid note content  
Then the app creates a topic note with the current `topicId` and `sessionId`, closes the composer, and remains in chat.

Given the note composer is open  
When the learner taps `Cancel`  
Then the composer closes without creating a note.

### Session completion separation

Given the learner is in an active session  
When the note composer is closed or open  
Then `I'm Done` remains a distinct header action.

Given the learner taps `I'm Done`  
When the session can close  
Then the existing session-close/summary behavior runs unchanged.

### Bookmark preservation

Given an assistant message has an `eventId`  
When the learner taps the bookmark icon  
Then bookmark creation/removal behaves as it does today, including optimistic UI and rollback on error.

Given an assistant message has no `eventId`  
When message actions render  
Then no bookmark action is shown for that message.

### Topic Library bookmark surfacing

Given a topic has notes and bookmarks  
When the learner opens the topic detail page  
Then notes and bookmarks are both visible under the topic, with visually distinct sections.

Given a topic has no bookmarks  
When the learner opens the topic detail page  
Then no empty bookmark section is rendered.

Given a bookmark has `topicId = null`  
When a topic detail page renders  
Then that bookmark is not shown under the topic.

### Library search bookmark surfacing

Given a learner searches for text contained in a bookmark  
When the library search response returns bookmark matches  
Then a `Bookmarks` section renders matching saved-message excerpts.

Given a learner taps a bookmark search result  
When the source session is available  
Then the app opens the session summary/transcript route for that saved moment's session.

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Note cannot be attached | No current `topicId` can be resolved | Existing cannot-save note alert | Continue chatting; try again after topic is resolved |
| Note save fails | Network/API error from create-note mutation | Existing save-failed alert with formatted error | Retry save |
| Note cap reached | Topic already has the maximum allowed notes | Save-failed alert with conflict message | Edit/delete older notes from the topic page |
| Bookmark save fails | Network/API error during bookmark create/delete | Bookmark icon rolls back; alert explains failure | Retry bookmark toggle |
| Bookmark has no topic | Session/message was not topic-scoped | It does not appear under any topic | Find via profile-wide bookmarks/search later |
| Search fails | Library search request errors/offline | Existing library search error state | Retry or clear query |
| Source session unavailable | Bookmark points to purged/unavailable session | Existing session-summary not-found/expired state | Return to Library/topic page |

## Testing Strategy

### Mobile unit/component tests

- `SessionAccessories.test.tsx`: renders `Add note` only during teaching stage and calls `onAddNote`.
- `SessionFooter.test.tsx`: note input still calls `createNote.mutate` with `topicId`, `content`, and `sessionId`.
- `NoteInput.test.tsx`: custom placeholder renders while default placeholder remains unchanged elsewhere.
- `SessionMessageActions.test.tsx`: existing bookmark render/toggle tests remain valid.
- `topic/[topicId].test.tsx`: bookmarks render under topic when present and hide when absent.
- `LibrarySearchResults.test.tsx`: bookmark result section renders and routes correctly once search contract is extended.

### API tests, if adding bookmark search/filtering

- `bookmarks` route/service tests for optional `topicId` filtering if added.
- `library-search` service tests for bookmark matches scoped to the active profile.
- Negative-path profile isolation test: a bookmark from another profile must not appear in search or topic bookmark results.

### Manual validation

- Start or resume a learning session.
- Verify `Add note` appears near the composer and `I'm Done` remains in the header.
- Save a note from chat and confirm it appears on the topic page.
- Bookmark an assistant message and confirm it appears on the topic page when topic-scoped.
- Search Library for words from the note and bookmark.

## Rollout Notes

The recommended first PR should include chat `Add note` plus topic-page bookmark surfacing. Library-search bookmark results can be included if the API contract change stays small; otherwise it should be the second PR.

Do not implement text highlights until the product decision is made to add message/event anchoring for notes or a separate highlight table.
