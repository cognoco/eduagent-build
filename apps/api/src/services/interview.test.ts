// ---------------------------------------------------------------------------
// Mock LLM module — used by processInterviewExchange
// ---------------------------------------------------------------------------

jest.mock('./llm', () => {
  const providers = new Map();
  const actual = jest.requireActual('./llm');
  return {
    routeAndCall: jest.fn().mockResolvedValue({
      response:
        '{"reply": "Mock interview response echoing user input", "signals": {"ready_to_finish": false}}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    }),
    routeAndStream: jest.fn(),
    // Keep the real envelope helpers — the service exercises parseEnvelope
    // and teeEnvelopeStream against actual code.
    parseEnvelope: actual.parseEnvelope,
    teeEnvelopeStream: actual.teeEnvelopeStream,
    registerProvider: jest.fn((p: { name: string }) =>
      providers.set(p.name, p)
    ),
    createMockProvider: jest.fn((name: string) => ({
      name,
      chat: jest.fn().mockResolvedValue({ response: 'mock' }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock curriculum generation — used by persistCurriculum
// ---------------------------------------------------------------------------

jest.mock('./curriculum', () => ({
  generateCurriculum: jest.fn().mockResolvedValue([
    {
      title: 'Introduction',
      description: 'Getting started',
      relevance: 'core',
      estimatedMinutes: 30,
    },
    {
      title: 'Advanced Topics',
      description: 'Deep dive',
      relevance: 'recommended',
      estimatedMinutes: 45,
    },
  ]),
  ensureCurriculum: jest.fn().mockResolvedValue({
    id: 'curriculum-1',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    version: 1,
  }),
  ensureDefaultBook: jest.fn().mockResolvedValue('book-1'),
}));

import type { Database } from '@eduagent/database';
import {
  processInterviewExchange,
  streamInterviewExchange,
  extractSignals,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
  buildDraftResumeSummary,
} from './interview';
import type { InterviewContext, OnboardingDraft } from '@eduagent/schemas';
import { routeAndCall, routeAndStream } from './llm';
import { generateCurriculum } from './curriculum';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';
const subjectId = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockDraftRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    subjectId: string;
    exchangeHistory: unknown;
    extractedSignals: unknown;
    status: 'in_progress' | 'completed' | 'expired';
    expiresAt: Date | null;
  }>
) {
  return {
    id: overrides?.id ?? 'draft-1',
    profileId: overrides?.profileId ?? profileId,
    subjectId: overrides?.subjectId ?? subjectId,
    exchangeHistory: overrides?.exchangeHistory ?? [],
    extractedSignals: overrides?.extractedSignals ?? {},
    status: overrides?.status ?? 'in_progress',
    expiresAt: overrides?.expiresAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  findFirstResult = undefined as ReturnType<typeof mockDraftRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockDraftRow>[],
  curriculumInsertReturning = [
    { id: 'curriculum-1', subjectId, version: 1 },
  ] as Array<{ id: string; subjectId: string; version: number }>,
} = {}): Database {
  // Track insert calls to distinguish between different table inserts
  const insertMock = jest.fn().mockImplementation(() => ({
    values: jest.fn().mockImplementation(() => ({
      returning: jest
        .fn()
        .mockResolvedValueOnce(
          insertReturning.length > 0
            ? insertReturning
            : curriculumInsertReturning
        ),
    })),
  }));

  return {
    query: {
      onboardingDrafts: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
      subjects: {
        findFirst: jest.fn().mockResolvedValue({ id: subjectId }),
      },
    },
    insert: insertMock,
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// processInterviewExchange (existing tests)
// ---------------------------------------------------------------------------

describe('processInterviewExchange', () => {
  const baseContext: InterviewContext = {
    subjectName: 'TypeScript',
    exchangeHistory: [],
  };

  it('returns a response from the LLM', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('marks exchange as incomplete when marker is absent', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(false);
  });

  it('marks exchange as complete when envelope signals ready_to_finish', async () => {
    (routeAndCall as jest.Mock)
      .mockResolvedValueOnce({
        response:
          '{"reply": "Great session!", "signals": {"ready_to_finish": true}}',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        latencyMs: 50,
      })
      // Second call is extractSignals
      .mockResolvedValueOnce({
        response:
          '{"goals": ["learn TypeScript"], "experienceLevel": "beginner", "currentKnowledge": "none"}',
      });

    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(true);
    expect(result.response).toBe('Great session!');
    expect(result.response).not.toContain('[INTERVIEW_COMPLETE]');
    expect(result.extractedSignals).toBeDefined();
    expect(result.extractedSignals?.goals).toEqual(['learn TypeScript']);
  });

  it('[F1.1 break] when envelope parse fails, flow stays open and surfaces raw reply (no legacy-marker fallback)', async () => {
    // Post-cutover contract: the legacy [INTERVIEW_COMPLETE] fallback is
    // removed. Non-JSON prose degrades gracefully — the raw text is shown
    // to the learner and the flow is NOT marked complete. The
    // MAX_INTERVIEW_EXCHANGES cap still guarantees eventual termination.
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: 'Great session! [INTERVIEW_COMPLETE]',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(false);
    expect(result.extractedSignals).toBeUndefined();
  });

  // --- F-042 break test -----------------------------------------------------
  // If the LLM returns ready_to_finish: false forever, the learner would be
  // trapped in the interview. The server-side cap must force close anyway.
  it('[F-042] force-closes at MAX_INTERVIEW_EXCHANGES regardless of signal', async () => {
    // Return a valid envelope with ready_to_finish: false on turn 5 (past cap of 4).
    (routeAndCall as jest.Mock)
      .mockResolvedValueOnce({
        response:
          '{"reply": "Tell me more about that.", "signals": {"ready_to_finish": false}}',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        latencyMs: 50,
      })
      // extractSignals call — triggered only because the cap fired.
      .mockResolvedValueOnce({
        response:
          '{"goals": ["capped"], "experienceLevel": "beginner", "currentKnowledge": ""}',
      });

    const result = await processInterviewExchange(baseContext, 'Hello', {
      exchangeCount: 5, // past the cap of 4
    });

    expect(result.isComplete).toBe(true);
    expect(result.extractedSignals).toBeDefined();
    expect(result.extractedSignals?.goals).toEqual(['capped']);
    // Visible reply is the envelope's reply, not the marker form.
    expect(result.response).toBe('Tell me more about that.');
  });

  it('[F-042] stays open below the cap when ready_to_finish is false', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"reply": "What else interests you?", "signals": {"ready_to_finish": false}}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    const result = await processInterviewExchange(baseContext, 'Hello', {
      exchangeCount: 2, // well below cap
    });

    expect(result.isComplete).toBe(false);
    expect(result.extractedSignals).toBeUndefined();
  });

  it('passes exchange history to the LLM', async () => {
    const context: InterviewContext = {
      subjectName: 'Python',
      exchangeHistory: [
        { role: 'assistant', content: 'What brings you to Python?' },
        { role: 'user', content: 'I want to learn data science.' },
      ],
    };

    await processInterviewExchange(
      context,
      'I have some experience with JavaScript.'
    );

    expect(routeAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'I want to learn data science.',
        }),
        expect.objectContaining({
          role: 'user',
          content: 'I have some experience with JavaScript.',
        }),
      ]),
      1
    );
  });
});

// ---------------------------------------------------------------------------
// streamInterviewExchange (FR14 — SSE streaming variant)
// ---------------------------------------------------------------------------

describe('streamInterviewExchange', () => {
  const baseContext: InterviewContext = {
    subjectName: 'TypeScript',
    exchangeHistory: [],
  };

  it('returns a stream and onComplete callback', async () => {
    (routeAndStream as jest.Mock).mockResolvedValueOnce({
      stream: (async function* () {
        yield 'Hello ';
        yield 'there!';
      })(),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    const result = await streamInterviewExchange(baseContext, 'Hi');

    expect(result.stream).toBeDefined();
    expect(result.onComplete).toBeDefined();
    expect(typeof result.onComplete).toBe('function');
  });

  it('onComplete returns non-complete result when envelope signals ready_to_finish false', async () => {
    (routeAndStream as jest.Mock).mockResolvedValueOnce({
      stream: (async function* () {
        yield '{"reply": "Tell me more.", "signals": {"ready_to_finish": false}}';
      })(),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    const { stream, onComplete } = await streamInterviewExchange(
      baseContext,
      'I want to learn TypeScript'
    );

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk;
    }

    const result = await onComplete(fullText);

    expect(result.isComplete).toBe(false);
    expect(result.response).toBe('Tell me more.');
    expect(result.extractedSignals).toBeUndefined();
  });

  it('onComplete extracts signals when envelope signals ready_to_finish true', async () => {
    (routeAndStream as jest.Mock).mockResolvedValueOnce({
      stream: (async function* () {
        yield '{"reply": "Great session!", "signals": {"ready_to_finish": true}}';
      })(),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    // extractSignals calls routeAndCall
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["learn TS"], "experienceLevel": "beginner", "currentKnowledge": "knows JS"}',
    });

    const { stream, onComplete } = await streamInterviewExchange(
      baseContext,
      'I know JS already'
    );

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk;
    }

    const result = await onComplete(fullText);

    expect(result.isComplete).toBe(true);
    expect(result.response).toBe('Great session!');
    expect(result.extractedSignals).toBeDefined();
    expect(result.extractedSignals?.goals).toEqual(['learn TS']);
  });

  it('[F-042] streaming path force-closes at cap even when signal says false', async () => {
    (routeAndStream as jest.Mock).mockResolvedValueOnce({
      stream: (async function* () {
        yield '{"reply": "And another question?", "signals": {"ready_to_finish": false}}';
      })(),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["capped"], "experienceLevel": "beginner", "currentKnowledge": ""}',
    });

    const { stream, onComplete } = await streamInterviewExchange(
      baseContext,
      'Hi',
      { exchangeCount: 5 } // past the cap of 4
    );
    let fullText = '';
    for await (const chunk of stream) fullText += chunk;

    const result = await onComplete(fullText);

    expect(result.isComplete).toBe(true);
    expect(result.response).toBe('And another question?');
    expect(result.extractedSignals).toBeDefined();
  });

  it('calls routeAndStream at rung 1', async () => {
    (routeAndStream as jest.Mock).mockResolvedValueOnce({
      stream: (async function* () {
        yield 'ok';
      })(),
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    await streamInterviewExchange(baseContext, 'Hi');

    expect(routeAndStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: 'Hi' }),
      ]),
      1
    );
  });
});

// ---------------------------------------------------------------------------
// extractSignals
// ---------------------------------------------------------------------------

describe('extractSignals', () => {
  it('extracts goals and experience level from conversation', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["learn calculus", "pass exam"], "experienceLevel": "beginner", "currentKnowledge": "basic algebra"}',
    });

    const result = await extractSignals([
      { role: 'assistant', content: 'What are your goals?' },
      { role: 'user', content: 'I want to learn calculus to pass my exam' },
    ]);

    expect(result.goals).toEqual(['learn calculus', 'pass exam']);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('basic algebra');
  });

  it('returns defaults on malformed response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: 'This is not JSON',
    });

    const result = await extractSignals([{ role: 'user', content: 'Hello' }]);

    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
  });

  it('handles JSON embedded in surrounding text', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        'Here are the signals: {"goals": ["learn React"], "experienceLevel": "intermediate", "currentKnowledge": "knows JavaScript"} end.',
    });

    const result = await extractSignals([
      {
        role: 'user',
        content: 'I already know JavaScript and want to learn React',
      },
    ]);

    expect(result.goals).toEqual(['learn React']);
    expect(result.experienceLevel).toBe('intermediate');
    expect(result.currentKnowledge).toBe('knows JavaScript');
  });

  it('coerces non-array goals to empty array', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": "not an array", "experienceLevel": "advanced", "currentKnowledge": "lots"}',
    });

    const result = await extractSignals([{ role: 'user', content: 'test' }]);

    expect(result.goals).toEqual([]);
    expect(result.experienceLevel).toBe('advanced');
  });

  it('defaults experienceLevel when missing from response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '{"goals": ["learn basics"]}',
    });

    const result = await extractSignals([{ role: 'user', content: 'test' }]);

    expect(result.experienceLevel).toBe('beginner');
    expect(result.currentKnowledge).toBe('');
  });

  it('calls routeAndCall at rung 2', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": [], "experienceLevel": "beginner", "currentKnowledge": ""}',
    });

    await extractSignals([{ role: 'user', content: 'hello' }]);

    expect(routeAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      2
    );
  });

  // -------------------------------------------------------------------------
  // BKT-C.2 — interests extraction from interview transcripts
  // -------------------------------------------------------------------------

  it('[BKT-C.2] extracts interests from LLM response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["learn"], "experienceLevel": "beginner", "currentKnowledge": "", "interests": ["chess club", "anime", "football"]}',
    });

    const result = await extractSignals([
      {
        role: 'user',
        content: "I'm in chess club and I love anime and football",
      },
    ]);

    expect(result.interests).toEqual(['chess club', 'anime', 'football']);
  });

  it('[BKT-C.2] returns empty interests array when field missing', async () => {
    // Backward compat: prompt asks for interests but a legacy cached response
    // or off-schema reply omits them. Consumers must tolerate [].
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": ["learn"], "experienceLevel": "beginner", "currentKnowledge": ""}',
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toEqual([]);
  });

  it('[BKT-C.2] returns empty interests when no JSON object found in response', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: 'not json at all',
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toEqual([]);
  });

  it('[BKT-C.2] returns empty interests when JSON.parse throws on partial JSON', async () => {
    // The regex matches `{...}` but the content is not valid JSON —
    // exercises the catch block rather than the regex-miss path above.
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: '{invalid json content}',
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toEqual([]);
  });

  it('[BKT-C.2] dedupes interests case-insensitively', async () => {
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": [], "experienceLevel": "beginner", "currentKnowledge": "", "interests": ["Chess", "chess", "CHESS", "football"]}',
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    // First-seen-wins for the canonical casing — matches the Set-based dedupe.
    expect(result.interests).toEqual(['Chess', 'football']);
  });

  it('[BKT-C.2] caps interests at MAX_EXTRACTED_INTERESTS (8)', async () => {
    // A chatty LLM could return more than the prompt's max. The service must
    // hard-cap to protect the mobile picker's rendering budget.
    // Asserts both the length cap AND first-N-in-order preservation.
    const tenInterests = Array.from({ length: 10 }, (_, i) => `hobby-${i}`);
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: JSON.stringify({
        goals: [],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        interests: tenInterests,
      }),
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toHaveLength(8);
    expect(result.interests).toEqual(tenInterests.slice(0, 8));
  });

  it('[BKT-C.2] strips empty and over-long interests defensively', async () => {
    const atBoundary = 'x'.repeat(60); // exactly at the 60-char limit — kept
    const tooLong = 'x'.repeat(61); // one over — stripped
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response: JSON.stringify({
        goals: [],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        interests: ['chess', '', '   ', atBoundary, tooLong, 'football'],
      }),
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toEqual(['chess', atBoundary, 'football']);
  });

  it('[BKT-C.2] coerces non-array interests to empty array', async () => {
    // A broken LLM could return a string where an array is expected. The
    // service must not crash or leak the raw value into a typed array.
    (routeAndCall as jest.Mock).mockResolvedValueOnce({
      response:
        '{"goals": [], "experienceLevel": "beginner", "currentKnowledge": "", "interests": "chess, football"}',
    });

    const result = await extractSignals([{ role: 'user', content: 'hi' }]);

    expect(result.interests).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateDraft
// ---------------------------------------------------------------------------

describe('getOrCreateDraft', () => {
  it('returns existing in-progress draft when found', async () => {
    const row = mockDraftRow({ id: 'existing-draft' });
    const db = createMockDb({ findFirstResult: row });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.id).toBe('existing-draft');
    expect(result.status).toBe('in_progress');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates new draft when none exists', async () => {
    const newRow = mockDraftRow({ id: 'new-draft' });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.id).toBe('new-draft');
    expect(result.status).toBe('in_progress');
    expect(db.insert).toHaveBeenCalled();
  });

  it('creates a fresh draft when the latest in-progress draft is expired', async () => {
    const expiredRow = mockDraftRow({
      id: 'expired-draft',
      expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const newRow = mockDraftRow({ id: 'new-draft' });
    const db = createMockDb({
      findFirstResult: expiredRow,
      insertReturning: [newRow],
    });

    jest.useFakeTimers().setSystemTime(new Date('2025-01-15T10:00:00.000Z'));
    try {
      const result = await getOrCreateDraft(db, profileId, subjectId);

      expect(result.id).toBe('new-draft');
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('maps dates to ISO strings', async () => {
    const row = mockDraftRow({ expiresAt: NOW });
    const db = createMockDb({ findFirstResult: row, insertReturning: [row] });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.expiresAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('maps null expiresAt correctly', async () => {
    const row = mockDraftRow({ expiresAt: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getOrCreateDraft(db, profileId, subjectId);

    expect(result.expiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDraftState
// ---------------------------------------------------------------------------

describe('getDraftState', () => {
  it('returns null when no draft exists', async () => {
    const db = createMockDb({ findFirstResult: undefined });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result).toBeNull();
  });

  it('returns mapped draft when found', async () => {
    const row = mockDraftRow({
      status: 'completed',
      exchangeHistory: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
    expect(result!.exchangeHistory).toHaveLength(2);
  });

  it('marks stale in-progress drafts as expired after 7 days', async () => {
    const staleRow = mockDraftRow({
      status: 'in_progress',
      expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const db = createMockDb({ findFirstResult: staleRow });

    jest.useFakeTimers().setSystemTime(new Date('2025-01-15T10:00:00.000Z'));
    try {
      const result = await getDraftState(db, profileId, subjectId);

      expect(result?.status).toBe('expired');
      expect(db.update).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('handles null exchangeHistory gracefully', async () => {
    const row = mockDraftRow({ exchangeHistory: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result!.exchangeHistory).toEqual([]);
  });

  it('handles null extractedSignals gracefully', async () => {
    const row = mockDraftRow({ extractedSignals: null });
    const db = createMockDb({ findFirstResult: row });

    const result = await getDraftState(db, profileId, subjectId);

    expect(result!.extractedSignals).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// updateDraft
// ---------------------------------------------------------------------------

describe('updateDraft', () => {
  it('calls db.update with correct draft id', async () => {
    const db = createMockDb();
    await updateDraft(db, profileId, 'draft-1', {
      exchangeHistory: [{ role: 'user', content: 'Hello' }],
    });

    expect(db.update).toHaveBeenCalled();
  });

  it('can update status to completed', async () => {
    const db = createMockDb();
    await updateDraft(db, profileId, 'draft-1', {
      status: 'completed',
    });

    expect(db.update).toHaveBeenCalled();
  });
});

describe('buildDraftResumeSummary', () => {
  it('summarizes structured interview signals when available', () => {
    const summary = buildDraftResumeSummary({
      exchangeHistory: [],
      extractedSignals: {
        goals: ['learn calculus'],
        experienceLevel: 'beginner',
        currentKnowledge: 'basic algebra',
      },
    });

    expect(summary).toContain('learn calculus');
    expect(summary).toContain('beginner');
    expect(summary).toContain('basic algebra');
  });

  it('falls back to learner messages when extracted signals are empty', () => {
    const summary = buildDraftResumeSummary({
      exchangeHistory: [
        { role: 'user', content: 'I want to get better at essays' },
        { role: 'assistant', content: 'What is hardest right now?' },
      ],
      extractedSignals: {},
    });

    expect(summary).toContain('essays');
  });
});

// ---------------------------------------------------------------------------
// persistCurriculum
// ---------------------------------------------------------------------------

describe('persistCurriculum', () => {
  it('calls generateCurriculum with draft data', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [
        { role: 'user', content: 'I want to learn basics' },
        { role: 'assistant', content: 'Great, what is your experience?' },
      ],
      extractedSignals: {
        goals: ['learn basics'],
        experienceLevel: 'beginner',
      },
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, profileId, subjectId, 'Mathematics', draft);

    expect(generateCurriculum).toHaveBeenCalledWith({
      subjectName: 'Mathematics',
      interviewSummary: expect.stringContaining('I want to learn basics'),
      goals: ['learn basics'],
      experienceLevel: 'beginner',
    });
  });

  it('inserts curriculum and topics into database', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [{ role: 'user', content: 'Hello' }],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, profileId, subjectId, 'Mathematics', draft);

    // ensureCurriculum handles curriculum row; db.insert is called once for topics
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('uses default values when signals are empty', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, profileId, subjectId, 'Science', draft);

    expect(generateCurriculum).toHaveBeenCalledWith(
      expect.objectContaining({
        goals: [],
        experienceLevel: 'beginner',
      })
    );
  });

  it('skips topic insert when generateCurriculum returns empty array', async () => {
    (generateCurriculum as jest.Mock).mockResolvedValueOnce([]);

    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    await persistCurriculum(db, profileId, subjectId, 'Art', draft);

    // ensureCurriculum handles curriculum row; no topics to insert
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws when subject does not belong to profile (IDOR guard) [CR-1B.1]', async () => {
    const draft: OnboardingDraft = {
      id: 'draft-1',
      profileId,
      subjectId,
      exchangeHistory: [{ role: 'user', content: 'Hello' }],
      extractedSignals: {},
      status: 'completed',
      expiresAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const db = createMockDb();
    // Override the subjects.findFirst mock to return null (ownership check fails)
    (db.query.subjects.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const attackerProfileId = 'attacker-profile-id';

    await expect(
      persistCurriculum(db, attackerProfileId, subjectId, 'Mathematics', draft)
    ).rejects.toThrow(
      `Subject ${subjectId} does not belong to profile ${attackerProfileId}`
    );

    // Verify no curriculum was inserted
    expect(db.insert).not.toHaveBeenCalled();
    expect(generateCurriculum).not.toHaveBeenCalled();
  });
});
