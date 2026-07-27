import {
  evidenceLinkFromKindSchema,
  evidenceLinkResolutionSchema,
  evidenceLinkSchema,
  evidenceLinkToKindSchema,
  learnerSourceSchema,
} from './evidence-links.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_UUID = '650e8400-e29b-41d4-a716-446655440000';

describe('evidence link contracts', () => {
  it('represents a verified artifact link without transcript content', () => {
    const link = evidenceLinkSchema.parse({
      id: UUID,
      profileId: UUID,
      fromKind: 'artifact',
      fromId: UUID,
      toKind: 'transcript_excerpt',
      toId: UUID,
      createdAt: '2026-07-22T00:00:00.000Z',
    });

    expect(link).not.toHaveProperty('content');
  });

  it.each([
    ['note', { topicId: SECOND_UUID, sessionId: undefined }],
    ['bookmark', { topicId: undefined, sessionId: SECOND_UUID }],
    ['transcript_excerpt', { topicId: SECOND_UUID, sessionId: SECOND_UUID }],
    ['homework_ocr', { topicId: undefined, sessionId: SECOND_UUID }],
  ] as const)(
    'represents %s as a discriminated learner source',
    (kind, optionalIds) => {
      const source = learnerSourceSchema.parse({
        kind,
        id: UUID,
        profileId: UUID,
        subjectId: SECOND_UUID,
        ...optionalIds,
        excerpt: 'Grounded learner material',
        createdAt: '2026-07-22T00:00:00.000Z',
      });

      expect(source.kind).toBe(kind);
      expect(source.excerpt).toBe('Grounded learner material');
    },
  );

  it('types citing and cited endpoints directionally', () => {
    expect(evidenceLinkFromKindSchema.options).toEqual([
      'artifact',
      'exchange',
    ]);
    expect(evidenceLinkToKindSchema.options).toEqual([
      'note',
      'bookmark',
      'transcript_excerpt',
      'homework_ocr',
    ]);
    expect(evidenceLinkSchema.safeParse({ fromKind: 'note' })).toHaveProperty(
      'success',
      false,
    );
  });

  it('models a missing source as unavailable without supplying replacement text', () => {
    const resolution = evidenceLinkResolutionSchema.parse({
      evidenceLinkId: UUID,
      toKind: 'transcript_excerpt',
      availability: 'source_unavailable',
    });

    expect(resolution).not.toHaveProperty('content');
    expect(resolution.availability).toBe('source_unavailable');
  });
});
