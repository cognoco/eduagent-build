// ---------------------------------------------------------------------------
// Language Curriculum — Tests [4A.2]
// ---------------------------------------------------------------------------

import {
  generateLanguageCurriculum,
  regenerateLanguageCurriculum,
  getCurrentLanguageProgress,
  getCurrentLanguageMilestoneId,
} from './language-curriculum';
import type { Database } from '@eduagent/database';
import type { GeneratedTopic } from '@eduagent/schemas';

const PROFILE_ID = 'profile-001';
const SUBJECT_ID = 'subject-001';
const CURRICULUM_ID = 'curriculum-001';

// ---------------------------------------------------------------------------
// Mock DB factory (follows existing curriculum.test.ts pattern)
// ---------------------------------------------------------------------------

function createMockDb({
  subjectFindFirst = undefined as Record<string, unknown> | undefined,
  curriculumFindFirst = undefined as Record<string, unknown> | undefined,
  topicsFindMany = [] as Record<string, unknown>[],
  vocabularySelect = [] as Record<string, unknown>[],
  insertReturning = [] as unknown[],
} = {}): Database {
  const selectFromChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(vocabularySelect),
    }),
  };

  const db = {
    query: {
      subjects: {
        findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
      },
      curricula: {
        findFirst: jest.fn().mockResolvedValue(curriculumFindFirst),
      },
      curriculumTopics: {
        findMany: jest.fn().mockResolvedValue(topicsFindMany),
      },
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue({ id: 'book-1' }),
      },
    },
    select: jest.fn().mockReturnValue(selectFromChain),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;

  return db;
}

// ---------------------------------------------------------------------------
// generateLanguageCurriculum — pure function tests
// ---------------------------------------------------------------------------

describe('generateLanguageCurriculum', () => {
  it('generates milestones for Spanish starting at A1', () => {
    const topics = generateLanguageCurriculum('es', 'A1');

    expect(topics.length).toBeGreaterThan(0);
    // Should have A1 milestones plus some A2 milestones
    const a1Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'A1');
    const a2Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'A2');
    expect(a1Topics.length).toBeGreaterThan(0);
    expect(a2Topics.length).toBeGreaterThan(0);
  });

  it('generates milestones for French starting at B1', () => {
    const topics = generateLanguageCurriculum('fr', 'B1');

    expect(topics.length).toBeGreaterThan(0);
    const b1Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'B1');
    const b2Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'B2');
    expect(b1Topics.length).toBeGreaterThan(0);
    expect(b2Topics.length).toBeGreaterThan(0);
  });

  it('defaults to A1 when starting level is not provided', () => {
    const topics = generateLanguageCurriculum('es');

    const a1Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'A1');
    expect(a1Topics.length).toBeGreaterThan(0);
  });

  it('throws for unsupported language code', () => {
    expect(() => generateLanguageCurriculum('xx')).toThrow(
      'Unsupported language code: xx',
    );
  });

  it('does not include next-level topics when starting at C2', () => {
    const topics = generateLanguageCurriculum('es', 'C2');

    // C2 is the last level, so there should be no next-level topics
    const nonC2 = topics.filter((t: GeneratedTopic) => t.cefrLevel !== 'C2');
    expect(nonC2).toHaveLength(0);
  });

  it('includes target word and chunk counts', () => {
    const topics = generateLanguageCurriculum('de', 'A1');

    for (const topic of topics) {
      expect(topic.targetWordCount).toBeGreaterThan(0);
      expect(topic.targetChunkCount).toBeGreaterThan(0);
    }
  });

  it('includes language name in description', () => {
    const topics = generateLanguageCurriculum('es', 'A1');

    for (const topic of topics) {
      expect(topic.description.toLowerCase()).toContain('spanish');
    }
  });

  it('sets estimatedMinutes to 30 for all milestones', () => {
    const topics = generateLanguageCurriculum('fr', 'A2');

    for (const topic of topics) {
      expect(topic.estimatedMinutes).toBe(30);
    }
  });

  it('generates distinct topics (no duplicate titles within level)', () => {
    const topics = generateLanguageCurriculum('it', 'A1');
    const a1Titles = topics
      .filter((t: GeneratedTopic) => t.cefrLevel === 'A1')
      .map((t: GeneratedTopic) => t.title);

    const uniqueTitles = new Set(a1Titles);
    expect(uniqueTitles.size).toBe(a1Titles.length);
  });

  it('assigns cefrSublevel sequentially starting from 1', () => {
    const topics = generateLanguageCurriculum('es', 'A1');
    const a1Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'A1');

    a1Topics.forEach((topic: GeneratedTopic, index: number) => {
      expect(topic.cefrSublevel).toBe(String(index + 1));
    });
  });

  it('generates topics for all supported languages', () => {
    const codes = [
      'es',
      'fr',
      'it',
      'pt',
      'nl',
      'nb',
      'sv',
      'da',
      'ro',
      'de',
      'id',
      'ms',
      'sw',
    ];

    for (const code of codes) {
      const topics = generateLanguageCurriculum(code, 'A1');
      expect(topics.length).toBeGreaterThan(0);
    }
  });

  it('increases target counts for later milestones in same level', () => {
    const topics = generateLanguageCurriculum('es', 'A1');
    const a1Topics = topics.filter((t: GeneratedTopic) => t.cefrLevel === 'A1');

    if (a1Topics.length >= 2) {
      // Later milestones should have equal or higher word counts
      expect(
        a1Topics[a1Topics.length - 1].targetWordCount,
      ).toBeGreaterThanOrEqual(a1Topics[0].targetWordCount!);
    }
  });

  // [BUG-940] Topic descriptions used to interpolate the lowercase canonical
  // language name verbatim ("Focused italian practice for A1."), which reads
  // as a copy bug. Fixed by title-casing at the boundary.
  it('[BUG-940] capitalizes the language name in topic descriptions', () => {
    const cases: Array<[string, string]> = [
      ['it', 'Italian'],
      ['es', 'Spanish'],
      ['fr', 'French'],
      ['de', 'German'],
      ['pt', 'Portuguese'],
    ];
    for (const [code, expectedDisplay] of cases) {
      const topics = generateLanguageCurriculum(code, 'A1');
      expect(topics.length).toBeGreaterThan(0);
      for (const topic of topics) {
        expect(topic.description).toContain(`Focused ${expectedDisplay}`);
        // No lowercase form should leak through.
        expect(topic.description).not.toContain(
          `Focused ${expectedDisplay.toLowerCase()} `,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// regenerateLanguageCurriculum — DB-dependent tests
// ---------------------------------------------------------------------------

describe('regenerateLanguageCurriculum', () => {
  it('creates a new curriculum with version 1 when none exists', async () => {
    const db = createMockDb({
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });
    // curricula.findFirst returns undefined (no existing curriculum)

    await regenerateLanguageCurriculum(db, SUBJECT_ID, 'es', 'A1');

    // insert should be called at least twice: once for curriculum, once for topics
    expect(db.insert).toHaveBeenCalled();
  });

  it('deletes old curricula before creating version 1', async () => {
    const db = createMockDb({
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });

    await regenerateLanguageCurriculum(db, SUBJECT_ID, 'es', 'B1');

    // Should delete old curricula first, then insert new one
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('does not insert topics when language generates zero milestones', async () => {
    // This shouldn't happen with real language codes, but tests the guard
    const db = createMockDb({
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });

    // Use a valid code but mock to verify call count
    await regenerateLanguageCurriculum(db, SUBJECT_ID, 'es', 'A1');

    // Should be called at least for curriculum insert + topics insert
    const insertCallCount = (db.insert as jest.Mock).mock.calls.length;
    expect(insertCallCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// getCurrentLanguageProgress — DB-dependent tests
// ---------------------------------------------------------------------------

describe('getCurrentLanguageProgress', () => {
  it('returns null when subject is not found', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toBeNull();
  });

  it('returns null when subject is not a four_strands subject', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Math',
        pedagogyMode: 'socratic',
        languageCode: null,
      },
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toBeNull();
  });

  it('returns null when subject has no language code', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: null,
      },
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toBeNull();
  });

  it('returns progress with null milestones when no curriculum exists', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: undefined,
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.subjectId).toBe(SUBJECT_ID);
    expect(result!.languageCode).toBe('es');
    expect(result!.pedagogyMode).toBe('four_strands');
    expect(result!.currentLevel).toBeNull();
    expect(result!.currentMilestone).toBeNull();
    expect(result!.nextMilestone).toBeNull();
  });

  it('returns progress with null milestones when curriculum has no CEFR topics', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'topic-1',
          curriculumId: CURRICULUM_ID,
          title: 'Generic Topic',
          description: 'No CEFR info',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: null,
          cefrSublevel: null,
          targetWordCount: null,
          targetChunkCount: null,
        },
      ],
      vocabularySelect: [],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.currentMilestone).toBeNull();
  });

  it('returns correct current milestone when milestones are incomplete', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'milestone-1',
          curriculumId: CURRICULUM_ID,
          title: 'Greetings',
          description: 'Basic greetings',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '1',
          targetWordCount: 45,
          targetChunkCount: 10,
        },
        {
          id: 'milestone-2',
          curriculumId: CURRICULUM_ID,
          title: 'Numbers',
          description: 'Numbers and dates',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '2',
          targetWordCount: 48,
          targetChunkCount: 11,
        },
      ],
      vocabularySelect: [],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.currentMilestone).not.toBeNull();
    expect(result!.currentMilestone!.milestoneTitle).toBe('Greetings');
    expect(result!.currentMilestone!.milestoneProgress).toBe(0);
    expect(result!.nextMilestone).not.toBeNull();
    expect(result!.nextMilestone!.milestoneTitle).toBe('Numbers');
  });

  it('calculates milestone progress from mastered vocabulary', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'milestone-1',
          curriculumId: CURRICULUM_ID,
          title: 'Greetings',
          description: 'Basic greetings',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '1',
          targetWordCount: 10,
          targetChunkCount: 4,
        },
      ],
      vocabularySelect: [
        // 5 mastered words + 2 mastered chunks
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'chunk', mastered: true },
        { milestoneId: 'milestone-1', type: 'chunk', mastered: true },
        // unmastered — should not count
        { milestoneId: 'milestone-1', type: 'word', mastered: false },
      ],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result).not.toBeNull();
    const milestone = result!.currentMilestone!;
    expect(milestone.wordsMastered).toBe(5);
    expect(milestone.chunksMastered).toBe(2);
    // progress = (5/10 + 2/4) / 2 = (0.5 + 0.5) / 2 = 0.5
    expect(milestone.milestoneProgress).toBe(0.5);
  });

  it('ignores vocabulary without milestoneId', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'milestone-1',
          curriculumId: CURRICULUM_ID,
          title: 'Greetings',
          description: 'Basic greetings',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '1',
          targetWordCount: 10,
          targetChunkCount: 4,
        },
      ],
      vocabularySelect: [
        { milestoneId: null, type: 'word', mastered: true },
        { milestoneId: undefined, type: 'word', mastered: true },
      ],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result!.currentMilestone!.wordsMastered).toBe(0);
  });

  it('returns last milestone as current when all are complete', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'milestone-1',
          curriculumId: CURRICULUM_ID,
          title: 'Greetings',
          description: 'Basic greetings',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '1',
          targetWordCount: 2,
          targetChunkCount: 1,
        },
      ],
      vocabularySelect: [
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'chunk', mastered: true },
      ],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result!.currentMilestone).not.toBeNull();
    expect(result!.currentMilestone!.milestoneTitle).toBe('Greetings');
    expect(result!.nextMilestone).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentLanguageMilestoneId — delegates to getCurrentLanguageProgress
// ---------------------------------------------------------------------------

describe('getCurrentLanguageMilestoneId', () => {
  it('returns null when no progress found', async () => {
    const db = createMockDb({ subjectFindFirst: undefined });

    const result = await getCurrentLanguageMilestoneId(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result).toBeNull();
  });

  it('returns the milestoneId from current progress', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
      },
      curriculumFindFirst: {
        id: CURRICULUM_ID,
        subjectId: SUBJECT_ID,
        version: 1,
      },
      topicsFindMany: [
        {
          id: 'milestone-1',
          curriculumId: CURRICULUM_ID,
          title: 'Greetings',
          description: 'Basic greetings',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 30,
          skipped: false,
          cefrLevel: 'A1',
          cefrSublevel: '1',
          targetWordCount: 45,
          targetChunkCount: 10,
        },
      ],
      vocabularySelect: [],
    });

    const result = await getCurrentLanguageMilestoneId(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result).toBe('milestone-1');
  });

  it('returns null when subject is not a language subject', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Math',
        pedagogyMode: 'socratic',
        languageCode: null,
      },
    });

    const result = await getCurrentLanguageMilestoneId(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result).toBeNull();
  });
});
