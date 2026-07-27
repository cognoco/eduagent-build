import { z } from 'zod';
import { isoDateField } from './common.ts';
// [SC-04] Canonical session-type enum — import instead of redefining inline.
// From the ./session-enums.ts leaf to keep notes.ts off the sessions.ts import graph.
import { sessionTypeSchema } from './session-enums.ts';

export const noteOriginSchema = z.enum(['self', 'mentor']);
export type NoteOrigin = z.infer<typeof noteOriginSchema>;

export const artifactSourceSchema = z.enum([
  'challenge_solid_quote',
  'challenge_drafted_note',
  'learner_authored_note',
  'freeform_keep',
]);
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;

export const noteArtifactSourceSchema = z.enum([
  'challenge_solid_quote',
  'challenge_drafted_note',
  'learner_authored_note',
]);
export type NoteArtifactSource = z.infer<typeof noteArtifactSourceSchema>;

export const artifactVerificationStateSchema = z.enum([
  'unverified',
  'verified',
]);
export type ArtifactVerificationState = z.infer<
  typeof artifactVerificationStateSchema
>;

const noteArtifactSourceResponseSchema = noteArtifactSourceSchema.default(
  'learner_authored_note',
);
const artifactVerificationStateResponseSchema =
  artifactVerificationStateSchema.default('unverified');

/**
 * [BUG-212] Canonical client-facing note shape. The previously-duplicated
 * `topicNoteSchema` (DB row, included `profileId`) and `noteResponseSchema`
 * (API response, no `profileId`) have been consolidated:
 *
 *   - `noteResponseSchema` is the canonical client/API surface and now
 *     accepts Date objects on its timestamps (Drizzle row compat).
 *   - `topicNoteSchema` is preserved as `noteResponseSchema` extended with
 *     `profileId` — the only field that differed — so existing imports keep
 *     working but they share a single base definition.
 */
export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  origin: noteOriginSchema.default('self'),
  artifactSource: noteArtifactSourceResponseSchema,
  verificationState: artifactVerificationStateResponseSchema,
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type NoteResponse = z.infer<typeof noteResponseSchema>;

export const topicNoteSchema = noteResponseSchema.extend({
  profileId: z.string().uuid(),
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

export const createNoteInputSchema = z
  .object({
    content: z.string().min(1).max(5000),
    sessionId: z.string().uuid().optional(),
  })
  .strict();
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z
  .object({
    content: z.string().min(1).max(5000),
  })
  .strict();
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

// Re-exported for backward compat — the local `_dateField` used to live in
// this file. The canonical version is `isoDateField` from `./common.ts`.
const _dateField = isoDateField;

// ---------------------------------------------------------------------------
// Route-level response schemas (accept Date objects from Drizzle rows)
// ---------------------------------------------------------------------------

/** Internal note shape that accepts Date objects from the DB layer. */
const _noteDbRowSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  origin: noteOriginSchema.default('self'),
  artifactSource: noteArtifactSourceResponseSchema,
  verificationState: artifactVerificationStateResponseSchema,
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
  origin: noteOriginSchema.default('self'),
  artifactSource: noteArtifactSourceResponseSchema,
  verificationState: artifactVerificationStateResponseSchema,
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

/** GET /notes - all notes for the active profile. */
export const allNotesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  subjectId: z.string().uuid().optional(),
});
export type AllNotesQuery = z.infer<typeof allNotesQuerySchema>;

export const allNoteSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  topicTitle: z.string(),
  bookId: z.string().uuid(),
  bookTitle: z.string(),
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  origin: noteOriginSchema.default('self'),
  artifactSource: noteArtifactSourceResponseSchema,
  verificationState: artifactVerificationStateResponseSchema,
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type AllNote = z.infer<typeof allNoteSchema>;

export const allNotesResponseSchema = z.object({
  notes: z.array(allNoteSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type AllNotesResponse = z.infer<typeof allNotesResponseSchema>;

/** GET /topics/:topicId/sessions — one session entry associated with a topic. */
export const topicSessionSchema = z.object({
  id: z.string().uuid(),
  // [SC-04] Use canonical sessionTypeSchema from sessions.ts (not inline enum).
  sessionType: sessionTypeSchema,
  durationSeconds: z.number().nullable(),
  createdAt: isoDateField,
});
export type TopicSession = z.infer<typeof topicSessionSchema>;

export const topicSessionsResponseSchema = z.object({
  sessions: z.array(topicSessionSchema),
});
export type TopicSessionsResponse = z.infer<typeof topicSessionsResponseSchema>;

/** @deprecated Use createNoteInputSchema instead */
export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
/** @deprecated */
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;
