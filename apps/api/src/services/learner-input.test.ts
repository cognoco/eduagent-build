jest.mock('./llm', () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

jest.mock('./learner-profile', () => {
  const actual = jest.requireActual(
    './learner-profile',
  ) as typeof import('./learner-profile');
  return {
    ...actual,
    applyAnalysis: jest.fn(),
  };
});

import * as sentry from './sentry';
import { routeAndCall } from './llm';
import { applyAnalysis } from './learner-profile';
import { parseLearnerInput } from './learner-input';
import type { Database } from '@eduagent/database';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;
const mockApplyAnalysis = applyAnalysis as jest.MockedFunction<
  typeof applyAnalysis
>;

const db = {} as Database;
const profileId = 'profile-123';

beforeEach(() => {
  jest.clearAllMocks();
  mockApplyAnalysis.mockResolvedValue({
    fieldsUpdated: [],
    notifications: [],
  });
});

// ---------------------------------------------------------------------------
// LLM-parsed path
// ---------------------------------------------------------------------------

describe('parseLearnerInput — LLM success path', () => {
  it('extracts interest from "I love dinosaurs"', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        explanationEffectiveness: null,
        interests: ['dinosaurs'],
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      }),
    } as any);
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['interests'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I love dinosaurs',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain('interests');
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({ interests: ['dinosaurs'], confidence: 'high' }),
      null,
      'learner',
      undefined,
    );
  });

  it('extracts communication note from "I prefer short explanations"', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        explanationEffectiveness: null,
        interests: null,
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: ['prefers short explanations'],
        engagementLevel: null,
        confidence: 'high',
      }),
    } as any);
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['communicationNotes'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I prefer short explanations',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain('communicationNotes');
  });

  it('tags source as parent when source is "parent"', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        explanationEffectiveness: null,
        interests: null,
        strengths: [{ topic: 'reading', subject: null }],
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      }),
    } as any);
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['strengths'],
      notifications: [],
    });

    await parseLearnerInput(db, profileId, 'She is great at reading', 'parent');
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({
        strengths: [{ topic: 'reading', subject: null, source: 'parent' }],
      }),
      null,
      'parent',
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// [BUG-480] BREAK TEST: extractor finds JSON embedded mid-prose
// ---------------------------------------------------------------------------

describe('parseLearnerInput — [BUG-480] extractFirstJsonObject', () => {
  it('succeeds when LLM wraps JSON mid-paragraph', async () => {
    // Prose before and after the JSON object — greedy regex would have grabbed
    // from first "{" (in the prose) to last "}" producing broken JSON.
    const jsonPayload = {
      explanationEffectiveness: null,
      interests: ['astronomy'],
      strengths: null,
      struggles: null,
      resolvedTopics: null,
      communicationNotes: null,
      engagementLevel: null,
      confidence: 'high',
    };
    mockRouteAndCall.mockResolvedValueOnce({
      response: `Sure, here is the analysis: ${JSON.stringify(jsonPayload)} Hope that helps!`,
    } as any);
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['interests'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I love astronomy',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({ interests: ['astronomy'] }),
      null,
      'learner',
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// Fallback path (LLM failure or invalid response)
// ---------------------------------------------------------------------------

describe('parseLearnerInput — fallback path', () => {
  it('falls back to regex when LLM returns invalid JSON', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'Sorry, I cannot help with that.',
    } as any);
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['interests'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I love space exploration',
      'learner',
    );
    expect(result.success).toBe(true);
    // fallbackAnalysis should pick up "I love space exploration" via regex
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({
        interests: ['space exploration'],
        confidence: 'high',
      }),
      null,
      'learner',
      undefined,
    );
  });

  it('falls back to regex when LLM throws', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM timeout'));
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['interests'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I enjoy math puzzles',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({ interests: ['math puzzles'] }),
      null,
      'learner',
      undefined,
    );
  });

  it('detects struggle pattern in fallback', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM down'));
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['struggles'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I struggle with fractions',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({
        struggles: [{ topic: 'fractions', subject: null, source: 'learner' }],
      }),
      null,
      'learner',
      undefined,
    );
  });

  it('puts unrecognized text into communicationNotes in fallback', async () => {
    mockRouteAndCall.mockRejectedValueOnce(new Error('LLM down'));
    mockApplyAnalysis.mockResolvedValueOnce({
      fieldsUpdated: ['communicationNotes'],
      notifications: [],
    });

    const result = await parseLearnerInput(
      db,
      profileId,
      'I learn best when it is quiet',
      'learner',
    );
    expect(result.success).toBe(true);
    expect(mockApplyAnalysis).toHaveBeenCalledWith(
      db,
      profileId,
      expect.objectContaining({
        communicationNotes: ['I learn best when it is quiet'],
      }),
      null,
      'learner',
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe('parseLearnerInput — error path', () => {
  it('returns failure when applyAnalysis throws', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        explanationEffectiveness: null,
        interests: ['robots'],
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      }),
    } as any);
    mockApplyAnalysis.mockRejectedValueOnce(new Error('DB write failed'));

    const result = await parseLearnerInput(
      db,
      profileId,
      'I love robots',
      'learner',
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe('Something went wrong. Please try again.');
    expect(result.fieldsUpdated).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [logging sweep] BREAK TEST: learner-input errors must emit structured JSON
// via logger (not raw console.error). profileId must be in JSON context, not
// as a loose string argument.
// ---------------------------------------------------------------------------

describe('parseLearnerInput structured logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyAnalysis.mockResolvedValue({
      fieldsUpdated: [],
      notifications: [],
    });
  });

  // [LOGGING-SWEEP-3] BREAK TEST: on DB write failure, parseLearnerInput must
  // emit structured JSON via the logger. profileId must land in context, not
  // as a loose console.error argument. Asserts:
  //   1. console.error is called by the logger (JSON wrapper present)
  //   2. Output is parseable JSON with level + context.profileId
  //   3. Raw console.error with loose args is NOT produced (the logger wraps)
  it('emits structured JSON log on applyAnalysis failure — profileId in context', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        explanationEffectiveness: null,
        interests: null,
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
        urgencyDeadline: null,
      }),
    } as any);
    mockApplyAnalysis.mockRejectedValueOnce(new Error('DB write failed'));

    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const result = await parseLearnerInput(
        db,
        profileId,
        'I love robots',
        'learner',
      );
      expect(result.success).toBe(false);

      // Must have logged via structured logger
      expect(errorSpy).toHaveBeenCalled();
      const logArg = errorSpy.mock.calls
        .map((call) => call[0])
        .find(
          (arg): arg is string =>
            typeof arg === 'string' && arg.includes('parseLearnerInput failed'),
        );
      expect(typeof logArg).toBe('string');
      const parsed = JSON.parse(logArg!) as {
        level: string;
        message: string;
        context?: { profileId?: unknown };
      };
      expect(parsed.level).toBe('error');
      // profileId must be in JSON context, not a loose extra arg
      expect(parsed.context?.profileId).toBe(profileId);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// [F-074 / WI-579] LLM-output parse failures must not leak content to Sentry
// ---------------------------------------------------------------------------

describe('[F-074 / WI-579] parseLearnerInput LLM parse failures leak no content', () => {
  const SENTINEL = 'Tommy-note-quote-private';

  it('[BREAK] jsonParse failure captures responseLength, never a response slice', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
    try {
      // Balanced braces (the JSON extractor returns a slice) but invalid
      // JSON — JSON.parse throws and the jsonParse capture fires.
      const response = `{"interests": undefined, "quote": "${SENTINEL}"}`;
      mockRouteAndCall.mockResolvedValueOnce({ response } as never);

      const result = await parseLearnerInput(db, profileId, 'note', 'learner');
      expect(result.success).toBe(true); // fallback analysis still applied

      expect(captureSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          extra: expect.objectContaining({
            site: 'parseLearnerInputToAnalysis.jsonParse',
            responseLength: response.length,
          }),
        }),
      );
      expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(SENTINEL);
    } finally {
      captureSpy.mockRestore();
    }
  });

  it('[BREAK] safeParse failure captures responseLength, never a response slice', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
    try {
      // Valid JSON, wrong shape — schema validation fails and the safeParse
      // capture fires.
      const response = JSON.stringify({
        struggles: `not-an-array ${SENTINEL}`,
      });
      mockRouteAndCall.mockResolvedValueOnce({ response } as never);

      const result = await parseLearnerInput(db, profileId, 'note', 'learner');
      expect(result.success).toBe(true); // fallback analysis still applied

      expect(captureSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            site: 'parseLearnerInputToAnalysis.safeParse',
            responseLength: response.length,
          }),
        }),
      );
      expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(SENTINEL);
    } finally {
      captureSpy.mockRestore();
    }
  });
});
