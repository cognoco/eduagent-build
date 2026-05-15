import {
  buildFallbackBookTopics,
  buildFallbackSubjectStructure,
} from './book-generation-fallbacks';

describe('book generation fallbacks', () => {
  it('keeps common broad subjects on the picker path when LLM classification is unavailable', () => {
    const result = buildFallbackSubjectStructure('History');

    expect(result.type).toBe('broad');
    if (result.type === 'broad') {
      expect(result.books.length).toBeGreaterThanOrEqual(4);
      expect(result.books[0]).toEqual(
        expect.objectContaining({
          title: 'Ancient Civilizations',
          sortOrder: 1,
        }),
      );
    }
  });

  it('creates a usable narrow topic list for unfamiliar subjects', () => {
    const result = buildFallbackSubjectStructure('Easter customs');

    expect(result.type).toBe('narrow');
    if (result.type === 'narrow') {
      expect(result.topics.length).toBeGreaterThanOrEqual(6);
      expect(result.topics[0]).toEqual(
        expect.objectContaining({
          title: 'Getting oriented in Easter customs',
          relevance: 'core',
        }),
      );
    }
  });

  it('creates focused-book topics so first lesson startup has material to use', () => {
    const result = buildFallbackBookTopics(
      'Easter',
      'History and traditions around Easter.',
    );

    expect(result.topics).toHaveLength(6);
    expect(result.topics[0]).toEqual(
      expect.objectContaining({
        title: 'Start with Easter',
        chapter: 'Getting started',
      }),
    );
    expect(result.connections.length).toBeGreaterThan(0);
  });
});
