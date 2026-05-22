import { z } from 'zod';

// ---------------------------------------------------------------------------
// [BUG-215] Branded ID types.
//
// Without brands, every entity ID is just `string`, which means a call like
// `getTopic(subjectId)` typechecks even when `subjectId` is the wrong kind
// of ID. Brands attach a phantom tag so the compiler distinguishes them.
//
// Adoption strategy: this file is the canonical home for branded ID types
// and their zod schemas. Adoption across the codebase is deliberately
// gradual — call sites can opt in by typing parameters as `ProfileId`
// rather than `string`. Mass migration is a future PR; the schema layer
// surfaces the brand without forcing a flag day.
// ---------------------------------------------------------------------------

/**
 * Create a branded zod schema for a UUID-typed entity ID. The brand is a
 * phantom symbol-keyed tag — at runtime the value is still a plain string,
 * but the compiler refuses to mix `ProfileId` with `SubjectId`.
 */
function brandedUuid<Brand extends string>(brand: Brand) {
  return z.string().uuid().brand<Brand>();
}

export const profileIdSchema = brandedUuid('ProfileId');
export type ProfileId = z.infer<typeof profileIdSchema>;

export const subjectIdSchema = brandedUuid('SubjectId');
export type SubjectId = z.infer<typeof subjectIdSchema>;

export const sessionIdSchema = brandedUuid('SessionId');
export type SessionId = z.infer<typeof sessionIdSchema>;

export const bookIdSchema = brandedUuid('BookId');
export type BookId = z.infer<typeof bookIdSchema>;

export const topicIdSchema = brandedUuid('TopicId');
export type TopicId = z.infer<typeof topicIdSchema>;

/**
 * [BUG-579] Validated escape hatches — use at trust boundaries where `id`
 * comes from user input, an external payload, or any untrusted string.
 * Throws a ZodError if the value is not a valid UUID, preventing empty
 * strings, account-IDs, or topic-IDs from being branded as ProfileIds.
 */
export const asProfileId = (id: string): ProfileId => profileIdSchema.parse(id);
export const asSubjectId = (id: string): SubjectId => subjectIdSchema.parse(id);
export const asSessionId = (id: string): SessionId => sessionIdSchema.parse(id);
export const asBookId = (id: string): BookId => bookIdSchema.parse(id);
export const asTopicId = (id: string): TopicId => topicIdSchema.parse(id);

/**
 * Unchecked escape hatches — use ONLY when the caller can guarantee the
 * string is already a valid UUID (e.g. a Drizzle row SELECT'd from a
 * UUID-typed column, or a value already validated by `asXxxId` upstream).
 * These are NO-OP at runtime; no UUID validation is performed.
 */
export const asProfileIdUnchecked = (id: string): ProfileId => id as ProfileId;
export const asSubjectIdUnchecked = (id: string): SubjectId => id as SubjectId;
export const asSessionIdUnchecked = (id: string): SessionId => id as SessionId;
export const asBookIdUnchecked = (id: string): BookId => id as BookId;
export const asTopicIdUnchecked = (id: string): TopicId => id as TopicId;
