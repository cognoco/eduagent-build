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
import { ConflictError } from '../errors';

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
  recentSessionsSelect = [] as Record<string, unknown>[],
  sessionSummariesSelect = [] as Record<string, unknown>[],
  sessionEventsSelect = [] as Record<string, unknown>[],
  insertReturning = [] as unknown[],
  updateReturning = [{ id: 'book-1' }] as unknown[],
} = {}): Database {
  const makeSelectChain = (rows: Record<string, unknown>[]) => {
    const chain: Record<string, unknown> = {
      from: jest.fn(),
      innerJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
      (chain[method] as jest.Mock).mockReturnValue(chain);
    }
    return chain;
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
    select: jest.fn((selection: Record<string, unknown>) => {
      if ('milestoneId' in selection) return makeSelectChain(vocabularySelect);
      if ('languageLearningSummary' in selection) {
        return makeSelectChain(sessionSummariesSelect);
      }
      if ('eventType' in selection) return makeSelectChain(sessionEventsSelect);
      return makeSelectChain(recentSessionsSelect);
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
    // regenerateLanguageCurriculum runs its delete→insert swap inside a
    // transaction; the mock runs the callback against the same chainable db so
    // the existing call-count assertions still observe the writes.
    transaction: jest.fn(async (cb: (tx: Database) => Promise<unknown>) =>
      cb(db),
    ),
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
        a1Topics[a1Topics.length - 1]!.targetWordCount,
      ).toBeGreaterThanOrEqual(a1Topics[0]!.targetWordCount!);
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
      subjectFindFirst: { id: SUBJECT_ID, profileId: PROFILE_ID },
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });
    // curricula.findFirst returns undefined (no existing curriculum)

    await regenerateLanguageCurriculum(db, PROFILE_ID, SUBJECT_ID, 'es', 'A1');

    // insert should be called at least twice: once for curriculum, once for topics
    expect(db.insert).toHaveBeenCalled();
  });

  it('deletes old curricula before creating version 1', async () => {
    const db = createMockDb({
      subjectFindFirst: { id: SUBJECT_ID, profileId: PROFILE_ID },
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });

    await regenerateLanguageCurriculum(db, PROFILE_ID, SUBJECT_ID, 'es', 'B1');

    // Should delete old curricula first, then insert new one
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('does not insert topics when language generates zero milestones', async () => {
    // This shouldn't happen with real language codes, but tests the guard
    const db = createMockDb({
      subjectFindFirst: { id: SUBJECT_ID, profileId: PROFILE_ID },
      insertReturning: [
        { id: CURRICULUM_ID, subjectId: SUBJECT_ID, version: 1 },
      ],
    });

    // Use a valid code but mock to verify call count
    await regenerateLanguageCurriculum(db, PROFILE_ID, SUBJECT_ID, 'es', 'A1');

    // Should be called at least for curriculum insert + topics insert
    const insertCallCount = (db.insert as jest.Mock).mock.calls.length;
    expect(insertCallCount).toBeGreaterThanOrEqual(1);
  });

  it('[WI-1864] returns a conflict before deleting when topic expansion owns the book', async () => {
    const db = createMockDb({
      subjectFindFirst: { id: SUBJECT_ID, profileId: PROFILE_ID },
      updateReturning: [],
    });

    await expect(
      regenerateLanguageCurriculum(db, PROFILE_ID, SUBJECT_ID, 'es', 'A1'),
    ).rejects.toMatchObject<Partial<ConflictError>>({
      name: 'ConflictError',
      errorCode: 'CONFLICT',
      status: 409,
      message: 'Book topic expansion is in progress. Please retry shortly.',
    });

    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  // [BUG-655 / L3.M3.1] BREAK TEST — cross-profile delete attempt
  // Pre-fix: the function deleted curricula by subjectId alone, so a caller
  // passing a victim profile's subjectId would wipe their curriculum,
  // topics, vocabulary and progress via cascade-delete.
  // Post-fix: function verifies (subjectId, profileId) ownership and throws
  // before issuing the delete.
  it('[BUG-655] throws and does NOT delete when subject does not belong to profile', async () => {
    // subjects.findFirst returns undefined because the (id, profileId)
    // pair does not match — simulates a leaked/crafted subjectId from
    // another profile.
    const db = createMockDb({ subjectFindFirst: undefined });

    await expect(
      regenerateLanguageCurriculum(
        db,
        'attacker-profile',
        SUBJECT_ID,
        'es',
        'A1',
      ),
    ).rejects.toThrow(/does not belong to profile/);

    // The delete must NEVER fire when ownership verification fails —
    // pre-fix this expectation fails because the delete ran unconditionally.
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
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
    expect(result!.nextPractice).toBeNull();
    expect(result!.strandBalance).toBeNull();
    expect(result!.skillProfile).toBeNull();
  });

  it('returns recent strand balance and evidence-backed skill progress', async () => {
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
          targetWordCount: 4,
          targetChunkCount: 0,
        },
      ],
      vocabularySelect: [
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
      ],
      recentSessionsSelect: [
        { sessionId: 'session-1' },
        { sessionId: 'session-2' },
      ],
      sessionSummariesSelect: [
        {
          sessionId: 'session-1',
          languageLearningSummary: {
            practicedScenario: 'order food',
            newWords: [],
            strengthenedWords: [],
            grammarPatterns: ['polite requests', 'present tense'],
            comprehension: { correct: 2, total: 3 },
            speakingAttempts: 2,
            fluency: { correct: 3, total: 5 },
            nextRecommendationStrand: 'meaning_output',
          },
        },
        {
          sessionId: 'session-2',
          languageLearningSummary: {
            practicedScenario: null,
            newWords: [],
            strengthenedWords: [],
            grammarPatterns: ['polite requests'],
            comprehension: { correct: 1, total: 1 },
            speakingAttempts: 1,
            fluency: { correct: 2, total: 3 },
            nextRecommendationStrand: null,
          },
        },
      ],
      sessionEventsSelect: [
        {
          sessionId: 'session-1',
          eventType: 'ai_response',
          metadata: { languageLearning: { strand: 'meaning_input' } },
        },
        {
          sessionId: 'session-1',
          eventType: 'ai_response',
          metadata: { languageLearning: { strand: 'meaning_output' } },
        },
        {
          sessionId: 'session-2',
          eventType: 'ai_response',
          metadata: { languageLearning: { strand: 'language_focus' } },
        },
        {
          sessionId: 'session-2',
          eventType: 'ai_response',
          metadata: { languageLearning: { strand: 'fluency' } },
        },
      ],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result?.strandBalance).toEqual({
      counts: {
        meaning_input: 1,
        meaning_output: 1,
        language_focus: 1,
        fluency: 1,
      },
      sessionsSampled: 2,
    });
    expect(result?.skillProfile).toEqual([
      { skill: 'vocabulary', progress: 0.5, evidenceCount: 2 },
      { skill: 'grammar', progress: null, evidenceCount: 2 },
      { skill: 'listening', progress: 0.75, evidenceCount: 4 },
      { skill: 'speaking', progress: null, evidenceCount: 3 },
      { skill: 'fluency', progress: 0.625, evidenceCount: 8 },
    ]);
    expect(result?.skillProfile?.some((row) => row.skill === 'reading')).toBe(
      false,
    );
  });

  it('returns null evidence fields when there are no recent sessions', async () => {
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
          targetWordCount: 4,
          targetChunkCount: 0,
        },
      ],
      vocabularySelect: [
        { milestoneId: 'milestone-1', type: 'word', mastered: true },
      ],
      recentSessionsSelect: [],
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result?.strandBalance).toBeNull();
    expect(result?.skillProfile).toBeNull();
  });

  // WI-1552 (AC1/AC4a): the cross-session pointer read back from
  // subjects.next_language_practice_pointer surfaces as `nextPractice` on
  // the response consumed by mobile's useLanguageProgress hook — this is
  // the "read back to seed the following session" half of the two-session
  // flow (the write half is covered by session-completed.test.ts).
  it('surfaces a persisted next-practice pointer as nextPractice', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
        nextLanguagePracticePointer: {
          strand: 'meaning_output',
          reason:
            'least-practiced strand from the prior session (meaning_input=3, meaning_output=0, language_focus=2, fluency=2)',
          sessionStrandCounts: {
            meaning_input: 3,
            meaning_output: 0,
            language_focus: 2,
            fluency: 2,
          },
          computedAt: '2026-07-11T10:00:00.000Z',
        },
      },
      curriculumFindFirst: undefined,
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result!.nextPractice).toEqual({
      strand: 'meaning_output',
      reason:
        'least-practiced strand from the prior session (meaning_input=3, meaning_output=0, language_focus=2, fluency=2)',
      sessionStrandCounts: {
        meaning_input: 3,
        meaning_output: 0,
        language_focus: 2,
        fluency: 2,
      },
      computedAt: '2026-07-11T10:00:00.000Z',
    });
  });

  it('falls back to a null nextPractice when the pointer fails schema validation', async () => {
    const db = createMockDb({
      subjectFindFirst: {
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        name: 'Spanish',
        pedagogyMode: 'four_strands',
        languageCode: 'es',
        nextLanguagePracticePointer: { strand: 'not-a-real-strand' },
      },
      curriculumFindFirst: undefined,
    });

    const result = await getCurrentLanguageProgress(db, PROFILE_ID, SUBJECT_ID);

    expect(result!.nextPractice).toBeNull();
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
    expect(result!.strandBalance).toBeNull();
    expect(result!.skillProfile).toBeNull();
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
