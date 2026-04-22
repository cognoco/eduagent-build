import { z } from 'zod';

export const bookmarkSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  subjectName: z.string(),
  topicTitle: z.string().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export const createBookmarkSchema = z.object({
  eventId: z.string().uuid(),
});
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

export const bookmarkListResponseSchema = z.object({
  bookmarks: z.array(bookmarkSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type BookmarkListResponse = z.infer<typeof bookmarkListResponseSchema>;

export const sessionBookmarkSchema = z.object({
  eventId: z.string().uuid(),
  bookmarkId: z.string().uuid(),
});
export type SessionBookmark = z.infer<typeof sessionBookmarkSchema>;

export const sessionBookmarkListResponseSchema = z.object({
  bookmarks: z.array(sessionBookmarkSchema),
});
export type SessionBookmarkListResponse = z.infer<
  typeof sessionBookmarkListResponseSchema
>;
