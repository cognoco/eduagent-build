import { z } from 'zod';

export const topicNoteSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

export const createNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  sessionId: z.string().uuid().optional(),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
});
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

// Accepts ISO string or Date (from Drizzle DB rows) and normalises to string.
const _dateField = z.union([
  z.string().datetime(),
  z.date().transform((d) => d.toISOString()),
]);

export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type NoteResponse = z.infer<typeof noteResponseSchema>;

// ---------------------------------------------------------------------------
// Route-level response schemas (accept Date objects from Drizzle rows)
// ---------------------------------------------------------------------------

/** Internal note shape that accepts Date objects from the DB layer. */
const _noteDbRowSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: _dateField,
  updatedAt: _dateField,
});

export const bookNotesResponseSchema = z.object({
  notes: z.array(_noteDbRowSchema),
});
export type BookNotesResponse = z.infer<typeof bookNotesResponseSchema>;

export const topicNotesResponseSchema = z.object({
  notes: z.array(_noteDbRowSchema),
});
export type TopicNotesResponse = z.infer<typeof topicNotesResponseSchema>;

/** GET /topics/:topicId/note — single note, nullable (note is optional for a topic). */
const _noteGetRowSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  content: z.string(),
  updatedAt: _dateField,
});
export const noteGetResponseSchema = z.object({
  note: _noteGetRowSchema.nullable(),
});
export type NoteGetResponse = z.infer<typeof noteGetResponseSchema>;

/** POST /topics/:topicId/notes and PATCH /notes/:noteId — single note with all fields. */
export const noteMutationResponseSchema = z.object({
  note: _noteDbRowSchema,
});
export type NoteMutationResponse = z.infer<typeof noteMutationResponseSchema>;

/** GET /notes/topic-ids — list of topic UUIDs that have notes. */
export const topicIdsResponseSchema = z.object({
  topicIds: z.array(z.string().uuid()),
});
export type TopicIdsResponse = z.infer<typeof topicIdsResponseSchema>;

/** GET /topics/:topicId/sessions — sessions associated with a topic. */
const _topicSessionSchema = z.object({
  id: z.string().uuid(),
  sessionType: z.enum(['learning', 'homework', 'interleaved']),
  durationSeconds: z.number().nullable(),
  createdAt: z.string().datetime(),
});
export const topicSessionsResponseSchema = z.object({
  sessions: z.array(_topicSessionSchema),
});
export type TopicSessionsResponse = z.infer<typeof topicSessionsResponseSchema>;

/** @deprecated Use createNoteInputSchema instead */
export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
/** @deprecated */
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;
