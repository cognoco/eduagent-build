import {
  evidenceLinkResolutionSchema,
  evidenceLinkSchema,
} from './evidence-links.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

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
