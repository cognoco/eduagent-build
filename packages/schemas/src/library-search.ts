import { z } from 'zod';

export const librarySearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
export type LibrarySearchQuery = z.infer<typeof librarySearchQuerySchema>;

export const librarySearchResultSchema = z.object({
  subjects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    })
  ),
  books: z.array(
    z.object({
      id: z.string().uuid(),
      subjectId: z.string().uuid(),
      title: z.string(),
    })
  ),
  topics: z.array(
    z.object({
      id: z.string().uuid(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      name: z.string(),
    })
  ),
  notes: z.array(
    z.object({
      id: z.string().uuid(),
      topicId: z.string().uuid(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      contentSnippet: z.string(),
    })
  ),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;
