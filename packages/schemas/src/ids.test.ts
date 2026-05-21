/**
 * [BUG-215] Branded ID schemas — type-safe wrappers around bare UUID strings.
 *
 * The point of brands is COMPILE-TIME safety: `ProfileId` and `SubjectId` are
 * the same `string` at runtime but distinct nominal types so a call like
 * `getTopic(profileId)` no longer typechecks. These tests cover the runtime
 * surface — the brand check is verified by tsc, not by jest.
 */

import {
  bookIdSchema,
  profileIdSchema,
  sessionIdSchema,
  subjectIdSchema,
  topicIdSchema,
  asProfileId,
  asSubjectId,
  asSessionId,
  asBookId,
  asTopicId,
  asProfileIdUnchecked,
  asSubjectIdUnchecked,
  asSessionIdUnchecked,
  asBookIdUnchecked,
  asTopicIdUnchecked,
  type ProfileId,
  type SubjectId,
  type SessionId,
  type BookId,
  type TopicId,
} from './ids.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('branded id schemas [BUG-215]', () => {
  describe('profileIdSchema', () => {
    it('accepts a valid UUID and returns a branded ProfileId at the type level', () => {
      const parsed = profileIdSchema.parse(UUID);
      const asBrand: ProfileId = parsed;
      expect(asBrand).toBe(UUID);
    });

    it('rejects a non-UUID string', () => {
      expect(profileIdSchema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(profileIdSchema.safeParse('').success).toBe(false);
    });

    it('rejects non-string types', () => {
      expect(profileIdSchema.safeParse(123).success).toBe(false);
      expect(profileIdSchema.safeParse(null).success).toBe(false);
      expect(profileIdSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe('subjectIdSchema / sessionIdSchema / bookIdSchema / topicIdSchema', () => {
    it.each([
      ['subjectIdSchema', subjectIdSchema],
      ['sessionIdSchema', sessionIdSchema],
      ['bookIdSchema', bookIdSchema],
      ['topicIdSchema', topicIdSchema],
    ] as const)('%s accepts a valid UUID', (_name, schema) => {
      expect(schema.parse(UUID)).toBe(UUID);
    });

    it.each([
      ['subjectIdSchema', subjectIdSchema],
      ['sessionIdSchema', sessionIdSchema],
      ['bookIdSchema', bookIdSchema],
      ['topicIdSchema', topicIdSchema],
    ] as const)('%s rejects a non-UUID string', (_name, schema) => {
      expect(schema.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('validated escape hatches (asXxxId) [BUG-579]', () => {
    it('asProfileId accepts a valid UUID and returns it', () => {
      const id: ProfileId = asProfileId(UUID);
      expect(id).toBe(UUID);
    });

    it('asProfileId throws on a non-UUID string', () => {
      expect(() => asProfileId('not-a-uuid')).toThrow();
    });

    it('asProfileId throws on empty string', () => {
      expect(() => asProfileId('')).toThrow();
    });

    it('asSubjectId accepts a valid UUID', () => {
      const id: SubjectId = asSubjectId(UUID);
      expect(id).toBe(UUID);
    });

    it('asSubjectId throws on a non-UUID string', () => {
      expect(() => asSubjectId('not-a-uuid')).toThrow();
    });

    it('asSessionId accepts a valid UUID', () => {
      const id: SessionId = asSessionId(UUID);
      expect(id).toBe(UUID);
    });

    it('asSessionId throws on a non-UUID string', () => {
      expect(() => asSessionId('not-a-uuid')).toThrow();
    });

    it('asBookId accepts a valid UUID', () => {
      const id: BookId = asBookId(UUID);
      expect(id).toBe(UUID);
    });

    it('asBookId throws on a non-UUID string', () => {
      expect(() => asBookId('not-a-uuid')).toThrow();
    });

    it('asTopicId accepts a valid UUID', () => {
      const id: TopicId = asTopicId(UUID);
      expect(id).toBe(UUID);
    });

    it('asTopicId throws on a non-UUID string', () => {
      expect(() => asTopicId('not-a-uuid')).toThrow();
    });
  });

  describe('unchecked escape hatches (asXxxIdUnchecked) - no validation, identity at runtime', () => {
    it('asProfileIdUnchecked is identity at runtime for valid UUID', () => {
      const id: ProfileId = asProfileIdUnchecked(UUID);
      expect(id).toBe(UUID);
    });

    it('asProfileIdUnchecked does NOT throw on non-UUID (no validation)', () => {
      expect(() => asProfileIdUnchecked('not-a-uuid')).not.toThrow();
    });

    it('asSubjectIdUnchecked is identity at runtime', () => {
      const id: SubjectId = asSubjectIdUnchecked(UUID);
      expect(id).toBe(UUID);
    });

    it('asSessionIdUnchecked is identity at runtime', () => {
      const id: SessionId = asSessionIdUnchecked(UUID);
      expect(id).toBe(UUID);
    });

    it('asBookIdUnchecked is identity at runtime', () => {
      const id: BookId = asBookIdUnchecked(UUID);
      expect(id).toBe(UUID);
    });

    it('asTopicIdUnchecked is identity at runtime', () => {
      const id: TopicId = asTopicIdUnchecked(UUID);
      expect(id).toBe(UUID);
    });
  });

  /**
   * Brand distinctness is a compile-time check. We mirror it here at runtime
   * by confirming the SCHEMAS are distinct objects (each `.brand<T>()` call
   * returns a new schema instance) — this catches the regression of someone
   * collapsing them back to a single shared schema.
   */
  describe('brand distinctness', () => {
    it('each branded schema is its own distinct instance', () => {
      const all = [
        profileIdSchema,
        subjectIdSchema,
        sessionIdSchema,
        bookIdSchema,
        topicIdSchema,
      ];
      const unique = new Set(all);
      expect(unique.size).toBe(all.length);
    });
  });
});
