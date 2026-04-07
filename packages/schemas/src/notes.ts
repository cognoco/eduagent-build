import { z } from 'zod';

export const topicNoteSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  profileId: z.string().uuid(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;

export const bookNotesResponseSchema = z.object({
  notes: z.array(
    z.object({
      topicId: z.string().uuid(),
      content: z.string(),
      updatedAt: z.string().datetime(),
    })
  ),
});
export type BookNotesResponse = z.infer<typeof bookNotesResponseSchema>;
