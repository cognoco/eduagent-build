---
title: Delete Book — Implementation Plan
date: 2026-05-26
profile: code
status: complete
---

# Delete Book — Implementation Plan

**Goal:** Let learners remove a book from a shelf so it can be added again later, while warning before deleting any started topics.
**Approach:** Add a server-owned delete path that counts book topics and started topics, requires confirmation when started topics exist, and then cascades the book deletion through existing foreign keys. Add the mobile affordance on the book screen with a warning dialog and cache invalidation.

## Scope
In scope:
- `packages/schemas/src/subjects.ts`
- `apps/api/src/services/curriculum.ts`
- `apps/api/src/routes/books.ts`
- `apps/mobile/src/hooks/use-books.ts`
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
- Focused tests beside the touched code

Out of scope:
- Subject deletion or archiving
- Soft-delete/history restore
- Database migrations
- Changing book generation, filing, or topic movement behavior

## Tasks
- [x] T1: Add shared delete-book request/response schemas — done when schema tests accept confirmed and unconfirmed delete payloads.
- [x] T2: Add API service + route for `DELETE /subjects/:subjectId/books/:bookId` — done when route/service tests prove unstarted books delete, started books return a conflict unless confirmed, and foreign books are not deleted.
- [x] T3: Add mobile delete mutation and book-screen action — done when screen tests prove the no-started path confirms normally, the started path warns with counts, and successful deletion returns to the shelf with book caches invalidated.
- [x] T4: Verify focused test suites — done when touched API/schema/mobile tests pass locally.
