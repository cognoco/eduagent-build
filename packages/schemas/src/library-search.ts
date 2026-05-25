import { z } from 'zod';
import { isoDateField } from './common.ts';

export const librarySearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
export type LibrarySearchQuery = z.infer<typeof librarySearchQuerySchema>;

export const librarySearchResultSchema = z.object({
  subjects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    }),
  ),
  books: z.array(
    z.object({
      id: z.string().uuid(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      title: z.string(),
    }),
  ),
  topics: z.array(
    z.object({
      id: z.string().uuid(),
      bookId: z.string().uuid(),
      bookTitle: z.string(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      name: z.string(),
    }),
  ),
  notes: z.array(
    z.object({
      id: z.string().uuid(),
      sessionId: z.string().uuid().nullable(),
      topicId: z.string().uuid(),
      topicName: z.string(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      contentSnippet: z.string(),
      createdAt: isoDateField,
    }),
  ),
  sessions: z.array(
    z.object({
      sessionId: z.string().uuid(),
      topicId: z.string().uuid().nullable(),
      topicTitle: z.string().nullable(),
      bookId: z.string().uuid().nullable(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      snippet: z.string(),
      occurredAt: isoDateField,
    }),
  ),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;
