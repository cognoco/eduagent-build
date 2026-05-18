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
 * Escape hatches — call when handing a brand-checked id to a layer that
 * doesn't know about brands yet (e.g. Drizzle query builders) or when
 * accepting a string from a layer that hasn't been migrated. These are
 * NO-OP at runtime; the cost is only at the type level.
 */
export const asProfileId = (id: string): ProfileId => id as ProfileId;
export const asSubjectId = (id: string): SubjectId => id as SubjectId;
export const asSessionId = (id: string): SessionId => id as SessionId;
export const asBookId = (id: string): BookId => id as BookId;
export const asTopicId = (id: string): TopicId => id as TopicId;
