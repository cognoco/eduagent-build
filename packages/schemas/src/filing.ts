import { z } from 'zod';

// --- Filed-from enum (matches DB enum) ---

export const filedFromSchema = z.enum([
  'pre_generated',
  'session_filing',
  'freeform_filing',
]);
export type FiledFrom = z.infer<typeof filedFromSchema>;

// --- Filing request (mobile → API) ---

export const filingRequestSchema = z
  .object({
    // Pre-session (Flow 1 & 2)
    rawInput: z.string().min(1).max(500).optional(),
    selectedSuggestion: z.string().max(200).nullable().optional(),

    // Post-session (Flow 3)
    sessionTranscript: z.string().max(50000).optional(),
    sessionMode: z.enum(['freeform', 'homework']).optional(),

    // Context (set server-side, not from client)
    sessionId: z.string().uuid().optional(),

    // Fallback context — used to file under "Uncategorized" when LLM fails
    subjectId: z.string().uuid().optional(),

    // Suggestion tracking — marks the originating suggestion as picked/used
    pickedSuggestionId: z.string().uuid().optional(),
    usedTopicSuggestionId: z.string().uuid().optional(),
  })
  .refine((data) => data.rawInput || data.sessionTranscript || data.sessionId, {
    message: 'Either rawInput, sessionTranscript, or sessionId is required',
  });
export type FilingRequest = z.infer<typeof filingRequestSchema>;

// --- Filing LLM response (parsed from LLM JSON output) ---

const shelfRefSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ name: z.string().min(1).max(200) }),
]);

const bookRefSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({
    name: z.string().min(3).max(200),
    emoji: z.string().max(10),
    description: z.string().max(500),
  }),
]);

const chapterRefSchema = z.union([
  z.object({ existing: z.string().min(1).max(200) }),
  z.object({ name: z.string().min(1).max(200) }),
]);

const topicRefSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
});

export const filingResponseSchema = z.object({
  extracted: z.string().max(500).optional(),
  shelf: shelfRefSchema,
  book: bookRefSchema,
  chapter: chapterRefSchema,
  topic: topicRefSchema,
});
export type FilingResponse = z.infer<typeof filingResponseSchema>;

// --- Library index (condensed structure for LLM prompt) ---

export const libraryIndexTopicSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
});

export const libraryIndexChapterSchema = z.object({
  name: z.string(),
  topics: z.array(libraryIndexTopicSchema),
});

export const libraryIndexBookSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  chapters: z.array(libraryIndexChapterSchema),
});

export const libraryIndexShelfSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  books: z.array(libraryIndexBookSchema),
});

export const libraryIndexSchema = z.object({
  shelves: z.array(libraryIndexShelfSchema),
});
export type LibraryIndex = z.infer<typeof libraryIndexSchema>;

// --- Filing result (API → mobile, after resolution) ---

export const filingResultSchema = z.object({
  shelfId: z.string().uuid(),
  shelfName: z.string(),
  bookId: z.string().uuid(),
  bookName: z.string(),
  chapter: z.string(),
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  isNew: z.object({
    shelf: z.boolean(),
    book: z.boolean(),
    chapter: z.boolean(),
  }),
  fallback: z.boolean().optional(),
});
export type FilingResult = z.infer<typeof filingResultSchema>;

// --- Filing retry queue response (API → mobile) ---

export const filingQueuedResponseSchema = z.object({
  queued: z.literal(true),
});
export type FilingQueuedResponse = z.infer<typeof filingQueuedResponseSchema>;
