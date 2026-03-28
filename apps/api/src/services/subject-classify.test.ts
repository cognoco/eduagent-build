// ---------------------------------------------------------------------------
// Subject Classification — Tests (Story 10.20)
// ---------------------------------------------------------------------------

jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

jest.mock('./subject', () => ({
  listSubjects: jest.fn(),
}));

import { classifySubject } from './subject-classify';
import { routeAndCall } from './llm';
import { listSubjects } from './subject';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;
const mockListSubjects = listSubjects as jest.MockedFunction<
  typeof listSubjects
>;

function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    latencyMs: 50,
  });
}

function makeSubject(id: string, name: string) {
  return {
    id,
    profileId: 'profile-001',
    name,
    rawInput: null,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const FAKE_DB = {} as any;
const PROFILE_ID = 'profile-001';

beforeEach(() => jest.clearAllMocks());

describe('classifySubject', () => {
  it('returns empty candidates when learner has no subjects', async () => {
    mockListSubjects.mockResolvedValueOnce([]);

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'solve 2x + 5 = 15'
    );

    expect(result.candidates).toEqual([]);
    expect(result.needsConfirmation).toBe(true);
    expect(result.suggestedSubjectName).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('auto-matches with 0.9 confidence when learner has a single subject', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
    ]);

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'solve 2x + 5 = 15'
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      subjectId: 'sub-001',
      subjectName: 'Mathematics',
      confidence: 0.9,
    });
    expect(result.needsConfirmation).toBe(false);
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns high-confidence match from LLM with needsConfirmation=false', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [{ subjectName: 'Mathematics', confidence: 0.95 }],
      suggestedSubjectName: null,
    });

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'solve 2x + 5 = 15'
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      subjectId: 'sub-001',
      subjectName: 'Mathematics',
      confidence: 0.95,
    });
    expect(result.needsConfirmation).toBe(false);
    expect(result.suggestedSubjectName).toBeNull();
  });

  it('returns sorted multiple candidates with needsConfirmation=true', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [
        { subjectName: 'Physics', confidence: 0.6 },
        { subjectName: 'Mathematics', confidence: 0.7 },
      ],
      suggestedSubjectName: null,
    });

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'calculate the velocity of a ball rolling down a slope'
    );

    expect(result.candidates).toHaveLength(2);
    // Sorted by confidence descending
    expect(result.candidates[0].subjectName).toBe('Mathematics');
    expect(result.candidates[0].confidence).toBe(0.7);
    expect(result.candidates[1].subjectName).toBe('Physics');
    expect(result.candidates[1].confidence).toBe(0.6);
    expect(result.needsConfirmation).toBe(true);
  });

  it('returns graceful fallback when LLM call throws', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await classifySubject(FAKE_DB, PROFILE_ID, 'some text');

    expect(result.candidates).toEqual([]);
    expect(result.needsConfirmation).toBe(true);
    expect(result.suggestedSubjectName).toBeNull();
  });

  it('populates suggestedSubjectName when no match found', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [],
      suggestedSubjectName: 'History',
    });

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'when was the Battle of Hastings'
    );

    expect(result.candidates).toEqual([]);
    expect(result.needsConfirmation).toBe(true);
    expect(result.suggestedSubjectName).toBe('History');
  });

  it('calls routeAndCall with rung 1 and correct messages', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [{ subjectName: 'Mathematics', confidence: 0.9 }],
      suggestedSubjectName: null,
    });

    await classifySubject(FAKE_DB, PROFILE_ID, 'solve 2x + 5 = 15');

    expect(mockRouteAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('solve 2x + 5 = 15'),
        }),
      ]),
      1
    );
  });

  it('handles LLM returning unparseable response', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    mockRouteAndCall.mockResolvedValueOnce({
      response: 'I cannot classify this text.',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      latencyMs: 50,
    });

    const result = await classifySubject(FAKE_DB, PROFILE_ID, 'random text');

    expect(result.candidates).toEqual([]);
    expect(result.needsConfirmation).toBe(true);
  });

  it('ignores LLM matches that do not correspond to enrolled subjects', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [
        { subjectName: 'Chemistry', confidence: 0.9 },
        { subjectName: 'Mathematics', confidence: 0.85 },
      ],
      suggestedSubjectName: null,
    });

    const result = await classifySubject(
      FAKE_DB,
      PROFILE_ID,
      'balance this equation'
    );

    // Chemistry is not enrolled, so only Mathematics should appear
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].subjectName).toBe('Mathematics');
    expect(result.needsConfirmation).toBe(false);
  });

  it('clamps confidence values to 0-1 range', async () => {
    mockListSubjects.mockResolvedValueOnce([
      makeSubject('sub-001', 'Mathematics'),
      makeSubject('sub-002', 'Physics'),
    ]);

    llmResponse({
      matches: [
        { subjectName: 'Mathematics', confidence: 1.5 },
        { subjectName: 'Physics', confidence: -0.3 },
      ],
      suggestedSubjectName: null,
    });

    const result = await classifySubject(FAKE_DB, PROFILE_ID, 'some text');

    expect(result.candidates[0].confidence).toBe(1);
    expect(result.candidates[1].confidence).toBe(0);
  });
});
