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
- `apps/mobile/src/i18n/locales/en.json` and generated locale files — add ONLY the strings whose host component already uses `t()`:
  - `session.accessories.addNote` (chip label) — `SessionAccessories.tsx` already uses `t('session.accessories.switchTopic')` / `parkIt`, so the new chip MUST localize.
  - `library.topic.savedFromChat` — Topic page strings are localized; add this key.
  - **Do NOT add `session.notePrompt.chatPlaceholder`.** `NoteInput.tsx` is currently un-i18n'd: `placeholder="Write your note..."`, `"Cancel"`, `"Save note"`, `"Note text"`, `"Listening..."`, `"Start recording"` / `"Stop recording"` are all hardcoded English (`NoteInput.tsx:66,84,94,113,120`). The new chat placeholder must therefore also be hardcoded in `SessionFooter.tsx` (pass the literal `"Summarize this in your own words..."` as the `placeholder` prop) so the composer is internally consistent. A NoteInput full-localization pass is out of scope for this plan; if added later, do every string in one pass.

### PR 1 API Files (Required — client-side filtering is not viable)

> `useBookmarks` is a `useInfiniteQuery`. A client-side `topicId` filter only sees page 1 of results; users with many bookmarks silently miss topic-scoped items. Server-side filtering is mandatory, not optional.

- `packages/schemas/src/bookmarks.ts` — add optional `topicId` to bookmark list query schema.
- `apps/api/src/routes/bookmarks.ts` — accept optional `topicId` on `GET /bookmarks` (add to `bookmarkListQuerySchema` at `apps/api/src/routes/bookmarks.ts:36-40`; declare independent of `subjectId` — `topicId` alone is sufficient and matches the existing `bookmarks.topicId` column).
- `apps/api/src/services/bookmarks.ts` — filter bookmarks by `topicId`. The existing query already filters `eq(bookmarks.profileId, profileId)` (`apps/api/src/services/bookmarks.ts:149`), so adding `eq(bookmarks.topicId, options.topicId)` is safe: a request supplying another profile's `topicId` returns zero rows because the profile predicate still applies.
- `apps/api/src/routes/bookmarks.test.ts` / `apps/api/src/services/bookmarks.test.ts` — cover topic filter AND a **profile-isolation break test** (per CLAUDE.md "Security fixes require a break test"): seed profile A's bookmark with topicId X, profile B's bookmark with topicId X, query as B with `?topicId=X`, assert profile A's row is absent. Without this test the new query parameter is an unverified attack surface.

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
- [ ] Style `Add note` as primary within the strip: icon `document-text-outline`, `min-h-[44px]`, and a primary visual distinction relative to the existing chips. Existing chips use `rounded-full bg-surface-elevated px-3 py-1` with `text-text-secondary` (`SessionAccessories.tsx:47-57`). Make `Add note` `rounded-full bg-primary px-3 py-2 min-h-[44px]` with `text-text-inverse font-semibold`. Disabled state: `bg-surface` + `text-text-secondary`, matching how the other chips degrade when `isStreaming`.
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

- [ ] Add optional `placeholder?: string` prop to `NoteInput` (default stays `"Write your note..."`, hardcoded — see i18n note above).
- [ ] In `SessionFooter.tsx`, pass `placeholder="Summarize this in your own words..."` as a literal string when rendering `NoteInput` from chat. Do NOT route this through `t()` until the whole `NoteInput` component is localized in a separate pass.
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

- [ ] Increase bookmark icon size from 20px to 22px (`SessionMessageActions.tsx:253`).
- [ ] Bump pressable from `ms-auto p-2` (≈36px effective hit area) to `ms-auto p-2.5 min-h-[44px] min-w-[44px] items-center justify-center` so the hit target meets the same 44px standard used by the new `Add note` chip and the platform HIG. 36px is below the project's own primary-touch-target standard and looks deliberately small next to a primary chip in the same screen.
- [ ] Preserve accessibility labels: `Bookmark this response` and `Remove bookmark` (already hardcoded English — out of scope to localize here).
- [ ] Optimistic toggle behavior lives in `session/index.tsx` (which is NOT listed in this task's Files). This bullet is a non-modification assertion: don't touch the toggle wiring while editing `SessionMessageActions.tsx`.
- [ ] Test: bookmark toggle still renders for assistant messages with `eventId`.
- [ ] Test: bookmark toggle remains absent without `eventId`.

### Task 5: Add topic-page bookmark card

**Files:**

- `apps/mobile/src/components/library/BookmarkCard.tsx`
- `apps/mobile/src/components/library/BookmarkCard.test.tsx`

- [ ] Create a compact card/row for saved chat bookmarks that visually parallels `InlineNoteCard` so notes and bookmarks look like related saved-item types on the topic page. Do not reuse `InlineNoteCard` directly: bookmarks have no expand/collapse and use a bookmark icon rather than a note icon.
- [ ] Props: `bookmarkId`, `content`, `createdAt`, `subjectName?`, `topicTitle?`, optional `onPress`, `testID`. The bookmark list API already returns `subjectName` and `topicTitle` (`packages/schemas/src/bookmarks.ts:9-10`), so the card should accept those raw fields and format the source line internally — do NOT push pre-formatted strings through the prop boundary. Mirror the pattern in `apps/mobile/src/lib/format-note-source.ts` (`From session · {Month Day}` for session-linked, etc.) and either reuse that helper if its `NoteResponse` input shape can be relaxed, or add a sibling `formatBookmarkSourceLine` that takes `{ createdAt, topicTitle, subjectName }`.
- [ ] Render bookmark icon, truncated content excerpt (2-3 lines max via `numberOfLines`), and the formatted source line.
- [ ] No hardcoded hex. `InlineNoteCard.tsx:34-56` uses inline `style={{ backgroundColor: withOpacity(themeColors.accent, 0.08) }}` rather than NativeWind classes — that pattern is ALSO acceptable here (the rule is "no hardcoded hex", not "NativeWind-only"). Use `withOpacity(themeColors.<token>, n)` if mirroring the InlineNoteCard look; use semantic classes for everything else. Pick a different token from `accent` so notes and bookmarks are visually distinct sibling shapes — e.g. `themeColors.primary` for bookmarks, since the bookmark icon in chat is already `text-primary`.
- [ ] Test: renders content excerpt and source line.
- [ ] Test: calls `onPress` when pressed.

### Task 6: Surface bookmarks under topics

**Files:**

- `apps/mobile/src/hooks/use-bookmarks.ts`
- `apps/mobile/src/app/(app)/topic/[topicId].tsx`
- `apps/mobile/src/app/(app)/topic/[topicId].test.tsx`

- [ ] Use server-side `topicId` filter: extend `useBookmarks` to accept `topicId` and pass it to the API route (see required API files above). Client-side filtering is not acceptable — `useBookmarks` is paginated and only page 1 would be visible, silently missing bookmarks on subsequent pages.
- [ ] Extend the query key from `['bookmarks', activeProfile?.id, options?.subjectId]` (`apps/mobile/src/hooks/use-bookmarks.ts:30`) to `['bookmarks', activeProfile?.id, options?.subjectId, options?.topicId]`. **Order matters:** `useCreateBookmark` / `useDeleteBookmark` invalidate by prefix `['bookmarks', activeProfile?.id]` (lines 100-105, 122-128); keeping `profileId` second and appending `topicId` at the tail preserves prefix-match invalidation. Do NOT reorder.
- [ ] Query is enabled once `topicId` is known. `subjectId` is NOT required for the filter — `bookmarks.topicId` is globally unique to the topic, so passing only `topicId` is sufficient. The hook should call with `{ topicId }` (omit `subjectId`) on the topic page.
- [ ] Render `Saved from chat` section near existing notes using `t('library.topic.savedFromChat')` (add key to `en.json`).
- [ ] Hide section entirely when no topic-scoped bookmarks exist.
- [ ] Route bookmark press to `/session-summary/[sessionId]` using the same `router.push({ pathname: '/session-summary/[sessionId]', params: { sessionId, subjectId } })` shape already used at `apps/mobile/src/app/(app)/topic/[topicId].tsx:319-324`. `session-summary` is a root-level route (not nested under `(app)`), so no ancestor-chain push is required — same precedent as the existing topic→summary path.
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
| Bookmark save/delete fails | Optimistic bookmark state rolls back and alert appears. (Existing behavior in `session/index.tsx` — preserve it; do not edit while changing the icon.) |
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
- **Localizing `NoteInput` end-to-end.** The composer is currently un-i18n'd; a full localization pass should be its own change so every string moves in one go rather than partially via this PR.

---

## Adversarial Review Notes (2026-05-14)

Findings applied above:

- **H1 (i18n claim was wrong):** plan originally said "all user-visible strings in this area use `t()`" but `NoteInput.tsx:66,84,94,113,120` is fully hardcoded English. Reworked the i18n bullet so only strings whose host already uses `t()` (`SessionAccessories`, topic page) get keys; chat placeholder is hardcoded for consistency with the rest of `NoteInput`.
- **H2 (BookmarkCard prop shape):** dropped pre-formatted `sourceLine` prop in favor of raw `subjectName`/`topicTitle`/`createdAt` — the API already returns those parts (`packages/schemas/src/bookmarks.ts:9-10`), so formatting belongs inside the card. Pre-formatting at the call site duplicates `formatSourceLine` logic.
- **H3 (missing break test for new query parameter):** the `topicId` filter is new attack surface. Added explicit profile-isolation break test (seed cross-profile rows with the same topicId, assert one profile can't see the other's bookmark via the new filter).
- **M1 (primary chip visual unspecified):** spelled out the NativeWind classes vs. existing chip baseline.
- **M2 (styling contradiction):** plan said "semantic classes/tokens; no hardcoded hex" but `InlineNoteCard` uses inline `withOpacity(themeColors.accent, n)` styles. Clarified that `withOpacity(themeColors.<token>, n)` is acceptable since it satisfies "no hardcoded hex" while letting BookmarkCard visually parallel its sibling.
- **M3 (over-gated query):** `topicId` is globally unique on `bookmarks`, so the query doesn't need to wait on `subjectId`. Removed the `subjectId` precondition; specified queryKey ordering so existing prefix-match invalidation in `useCreateBookmark` / `useDeleteBookmark` still fires.
- **L1 (Files list mismatch on Task 4):** the optimistic-toggle bullet referenced `session/index.tsx` which is not listed under Task 4. Reframed it as an explicit "do not touch" assertion.

Findings deliberately NOT applied:

- **Note cap (50 per topic):** spec-side failure mode is real — `apps/api/src/services/notes.ts:13,87-89` enforces `MAX_NOTES_PER_TOPIC = 50` and throws a conflict. No plan change needed; the existing save-failed alert path covers it.
- **Cross-stack push:** topic-page → session-summary already works (`apps/mobile/src/app/(app)/topic/[topicId].tsx:319-324`); `session-summary` is a root-level route, so no `unstable_settings` / ancestor-chain hazard applies here.
