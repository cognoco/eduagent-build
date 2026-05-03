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

export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type NoteResponse = z.infer<typeof noteResponseSchema>;

export const bookNotesResponseSchema = z.object({
  notes: z.array(noteResponseSchema),
});
export type BookNotesResponse = z.infer<typeof bookNotesResponseSchema>;

export const topicNotesResponseSchema = z.object({
  notes: z.array(noteResponseSchema),
});
export type TopicNotesResponse = z.infer<typeof topicNotesResponseSchema>;

/** @deprecated Use createNoteInputSchema instead */
export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
/** @deprecated */
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;
