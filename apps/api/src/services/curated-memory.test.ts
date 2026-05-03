import { buildCuratedMemoryView } from './curated-memory';

function makeLearningProfile(overrides: Record<string, unknown> = {}) {
  return {
    interests: [],
    strengths: [],
    struggles: [],
    communicationNotes: [],
    learningStyle: null,
    suppressedInferences: [],
    memoryEnabled: true,
    memoryCollectionEnabled: true,
    memoryInjectionEnabled: true,
    memoryConsentStatus: 'granted',
    accommodationMode: 'none',
    ...overrides,
  };
}

describe('buildCuratedMemoryView', () => {
  it('returns empty categories when profile has no data', () => {
    const profile = makeLearningProfile();
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toEqual([]);
    expect(result.parentContributions).toEqual([]);
    expect(result.settings.memoryEnabled).toBe(true);
  });

  it('groups interests into a category with readable statements', () => {
    const profile = makeLearningProfile({
      interests: ['dinosaurs', 'space'],
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]!.label).toBe('Interests');
    expect(result.categories[0]!.items).toHaveLength(2);
    expect(result.categories[0]!.items[0]).toEqual({
      category: 'interests',
      value: 'dinosaurs',
      statement: 'Interested in dinosaurs',
    });
  });

  it('groups struggles with subject context', () => {
    const profile = makeLearningProfile({
      struggles: [
        { topic: 'fractions', subject: 'Math', severity: 'moderate' },
      ],
    });
    const result = buildCuratedMemoryView(profile);

    const struggleCategory = result.categories.find(
      (c) => c.label === 'Struggles with'
    );
    expect(struggleCategory).toEqual(expect.objectContaining({}));
    expect(struggleCategory!.items[0]).toEqual({
      category: 'struggles',
      value: 'fractions',
      statement: 'Struggles with fractions (Math)',
    });
  });

  it('groups strengths by subject', () => {
    const profile = makeLearningProfile({
      strengths: [{ subject: 'Science', topics: ['photosynthesis', 'cells'] }],
    });
    const result = buildCuratedMemoryView(profile);

    const strengthCategory = result.categories.find(
      (c) => c.label === 'Strengths'
    );
    expect(strengthCategory).toEqual(expect.objectContaining({}));
    expect(strengthCategory!.items[0]).toEqual({
      category: 'strengths',
      value: 'Science',
      statement: 'Strong in Science: photosynthesis, cells',
    });
  });

  it('serializes learningStyle object into descriptive strings', () => {
    const profile = makeLearningProfile({
      learningStyle: { modality: 'visual', pacing: 'slow' },
    });
    const result = buildCuratedMemoryView(profile);

    const styleCategory = result.categories.find(
      (c) => c.label === 'Learning style'
    );
    expect(styleCategory).toEqual(expect.objectContaining({}));
    expect(styleCategory!.items).toHaveLength(2);
    expect(styleCategory!.items[0]!.category).toBe('learningStyle');
    expect(styleCategory!.items[0]!.value).toBe('modality');
    expect(styleCategory!.items[0]!.statement).toBe('Prefers visual learning');
  });

  it('omits empty categories from the result', () => {
    const profile = makeLearningProfile({
      interests: ['robotics'],
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]!.label).toBe('Interests');
  });

  it('maps communicationNotes to Learning pace & notes', () => {
    const profile = makeLearningProfile({
      communicationNotes: ['needs extra think time', 'prefers short sessions'],
    });
    const result = buildCuratedMemoryView(profile);

    const notesCategory = result.categories.find(
      (c) => c.label === 'Learning pace & notes'
    );
    expect(notesCategory).toEqual(expect.objectContaining({}));
    expect(notesCategory!.items).toHaveLength(2);
    expect(notesCategory!.items[0]!.statement).toBe('Needs extra think time');
  });

  it('includes settings from the profile', () => {
    const profile = makeLearningProfile({
      memoryEnabled: false,
      memoryCollectionEnabled: false,
      memoryInjectionEnabled: true,
      accommodationMode: 'short-burst',
    });
    const result = buildCuratedMemoryView(profile);

    expect(result.settings).toEqual({
      memoryEnabled: false,
      collectionEnabled: false,
      injectionEnabled: true,
      accommodationMode: 'short-burst',
    });
  });
});
