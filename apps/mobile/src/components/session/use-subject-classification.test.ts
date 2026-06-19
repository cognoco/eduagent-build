import { renderHook, act } from '@testing-library/react-native';
import { useSubjectClassification } from './use-subject-classification';

let mockIsParentProxy = false;
jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: pins isParentProxy + gates for proxy write-guard tests (WI-307) */,
  () => ({
    useNavigationContract: () => ({
      isParentProxy: mockIsParentProxy,
      gates: {},
    }),
  }),
);

const mockAnimateResponse = jest.fn(() => jest.fn());

function createMockOpts(overrides: Record<string, unknown> = {}) {
  return {
    isStreaming: false,
    pendingClassification: false,
    setPendingClassification: jest.fn(),
    quotaError: null,
    pendingSubjectResolution: null,
    setPendingSubjectResolution: jest.fn(),
    classifiedSubject: null,
    setClassifiedSubject: jest.fn(),
    setShowWrongSubjectChip: jest.fn(),
    setClassifyError: jest.fn(),
    setTopicSwitcherSubjectId: jest.fn(),
    messages: [{ id: 'opening', role: 'assistant', content: 'Hello!' }],
    setMessages: jest.fn(),
    setResumedBanner: jest.fn(),
    subjectId: undefined,
    effectiveMode: 'freeform',
    availableSubjects: [{ id: 's1', name: 'Math' }],
    classifySubject: { mutateAsync: jest.fn() },
    resolveSubject: { mutateAsync: jest.fn() },
    createSubject: { mutateAsync: jest.fn(), isPending: false },
    continueWithMessage: jest.fn().mockResolvedValue(undefined),
    createLocalMessageId: jest.fn((prefix: string) => `${prefix}-1`),
    showConfirmation: jest.fn(),
    animateResponse: mockAnimateResponse,
    userMessageCount: 0,
    sessionExperience: 0,
    animationCleanupRef: { current: null },
    setIsStreaming: jest.fn(),
    ...overrides,
  };
}

describe('useSubjectClassification — greeting guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('intercepts a pure greeting in freeform mode — calls animateResponse, not classifySubject or continueWithMessage', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    expect(mockAnimateResponse).toHaveBeenCalledTimes(1);
    expect(mockAnimateResponse).toHaveBeenCalledWith(
      'Hi! Ask me anything.',
      opts.setMessages,
      opts.setIsStreaming,
    );
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('uses the returning-user greeting when sessionExperience > 0', async () => {
    const opts = createMockOpts({ sessionExperience: 3 });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hey');
    });

    expect(mockAnimateResponse).toHaveBeenCalledWith(
      'Hey again — what are you curious about?',
      opts.setMessages,
      opts.setIsStreaming,
    );
  });

  it('stores cleanup function in animationCleanupRef', async () => {
    const cleanup = jest.fn();
    mockAnimateResponse.mockReturnValueOnce(cleanup);

    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(opts.animationCleanupRef.current).toBe(cleanup);
  });

  it('sends a substantive message normally — calls classifySubject, not animateResponse', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('help me with quadratic equations');
    });

    expect(mockAnimateResponse).not.toHaveBeenCalled();
    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'help me with quadratic equations',
    });
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does NOT intercept greeting when subject is already set via route param', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      subjectId: 's1',
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    // classifySubject is not called (subjectId provided), but continueWithMessage IS
    expect(mockAnimateResponse).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does NOT intercept greeting when classifiedSubject is already set', async () => {
    const opts = createMockOpts({
      classifiedSubject: { subjectId: 's1', subjectName: 'Math' },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(mockAnimateResponse).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does NOT intercept greeting in non-freeform mode', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      effectiveMode: 'learning',
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    expect(mockAnimateResponse).not.toHaveBeenCalled();
    // Classification or continueWithMessage must have been called
    expect(
      opts.classifySubject.mutateAsync.mock.calls.length +
        opts.continueWithMessage.mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it('re-triggers classification on the 2nd user message (userMessageCount=1) after a greeting', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      suggestedSubjectName: null,
    };
    // Simulate the state after a greeting was sent: userMessageCount is now 1
    const opts = createMockOpts({
      userMessageCount: 1,
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('help me with trigonometry');
    });

    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'help me with trigonometry',
    });
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does NOT re-trigger classification when userMessageCount > 2', async () => {
    const opts = createMockOpts({
      userMessageCount: 3,
      classifiedSubject: null,
      subjectId: undefined,
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('what about calculus?');
    });

    // classifySubject should NOT be called; continueWithMessage still runs
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });
});

describe('useSubjectClassification — freeform fallback removal [F-1]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('Site A: does NOT auto-pick availableSubjects[0] when classifier returns 0 candidates — proceeds without subject', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
      availableSubjects: [{ id: 's1', name: 'Math' }],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('what is 2 + 2?');
    });

    // Must NOT silently assign the first subject
    expect(opts.setClassifiedSubject).not.toHaveBeenCalled();
    // Must still continue — no subject is fine, continueWithMessage handles it
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('Site B: shows disambiguation when classification throws and only 1 subject is enrolled', async () => {
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockRejectedValue(new Error('network error')),
      },
      availableSubjects: [{ id: 's1', name: 'Math' }],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('what is the quadratic formula?');
    });

    // Must NOT silently assign the single subject
    expect(opts.setClassifiedSubject).not.toHaveBeenCalled();
    // Must show disambiguation prompt
    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'what is the quadratic formula?',
        prompt: "I couldn't figure out the subject. Which one fits?",
        candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      }),
    );
    // Must NOT call continueWithMessage — we returned early
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('Site B: still shows disambiguation when classification throws and multiple subjects are enrolled', async () => {
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockRejectedValue(new Error('network error')),
      },
      availableSubjects: [
        { id: 's1', name: 'Math' },
        { id: 's2', name: 'History' },
      ],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('tell me something');
    });

    expect(opts.setClassifiedSubject).not.toHaveBeenCalled();
    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'tell me something',
        prompt: "I couldn't figure out the subject. Which one fits?",
        candidates: expect.arrayContaining([
          { subjectId: 's1', subjectName: 'Math' },
          { subjectId: 's2', subjectName: 'History' },
        ]),
      }),
    );
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('offers the classifier suggested subject in freeform when no enrolled subject matches', async () => {
    const classifyResult = {
      needsConfirmation: true,
      candidates: [],
      suggestedSubjectName: 'Physics',
    };
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
      availableSubjects: [
        { id: 's1', name: 'English' },
        { id: 's2', name: 'Chemistry' },
      ],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Tell me about the war of currents');
    });

    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'Tell me about the war of currents',
        prompt:
          'This sounds like Physics. Pick a subject below, or tap "+ Physics" to add it.',
        candidates: [
          { subjectId: 's1', subjectName: 'English' },
          { subjectId: 's2', subjectName: 'Chemistry' },
        ],
        suggestedSubjectName: 'Physics',
      }),
    );
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });
});

describe('useSubjectClassification — typed subject override', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('resolves a misspelled typed subject to an existing enrolled subject', async () => {
    const pendingSubjectResolution = {
      originalText: 'tell me about the war of currents',
      prompt: "I couldn't figure out the subject. Which one fits?",
      candidates: [{ subjectId: 's1', subjectName: 'English' }],
    };
    const opts = createMockOpts({
      pendingSubjectResolution,
      availableSubjects: [
        { id: 's1', name: 'English' },
        { id: 's2', name: 'Physics' },
      ],
      resolveSubject: {
        mutateAsync: jest.fn().mockResolvedValue({
          status: 'corrected',
          resolvedName: 'Physics',
          focus: null,
          focusDescription: null,
          suggestions: [{ name: 'Physics', description: 'Forces and energy' }],
          displayMessage: 'Did you mean **Physics**?',
        }),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleTypeSubject('fysic');
    });

    expect(opts.resolveSubject.mutateAsync).toHaveBeenCalledWith({
      rawInput: 'fysic',
    });
    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(null);
    expect(opts.setClassifiedSubject).toHaveBeenCalledWith({
      subjectId: 's2',
      subjectName: 'Physics',
    });
    expect(opts.continueWithMessage).toHaveBeenCalledWith(
      'tell me about the war of currents',
      { sessionSubjectId: 's2', sessionSubjectName: 'Physics' },
    );
  });

  it('creates the resolved typed subject when it is not enrolled yet', async () => {
    const pendingSubjectResolution = {
      originalText: 'tell me about the war of currents',
      prompt: "I couldn't figure out the subject. Which one fits?",
      candidates: [{ subjectId: 's1', subjectName: 'English' }],
    };
    const opts = createMockOpts({
      pendingSubjectResolution,
      availableSubjects: [{ id: 's1', name: 'English' }],
      resolveSubject: {
        mutateAsync: jest.fn().mockResolvedValue({
          status: 'corrected',
          resolvedName: 'Physics',
          focus: null,
          focusDescription: null,
          suggestions: [{ name: 'Physics', description: 'Forces and energy' }],
          displayMessage: 'Did you mean **Physics**?',
        }),
      },
      createSubject: {
        mutateAsync: jest.fn().mockResolvedValue({
          subject: { id: 's2', name: 'Physics' },
        }),
        isPending: false,
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleTypeSubject('fysic');
    });

    expect(opts.createSubject.mutateAsync).toHaveBeenCalledWith({
      name: 'Physics',
      rawInput: 'fysic',
    });
    expect(opts.setClassifiedSubject).toHaveBeenCalledWith({
      subjectId: 's2',
      subjectName: 'Physics',
    });
    expect(opts.continueWithMessage).toHaveBeenCalledWith(
      'tell me about the war of currents',
      { sessionSubjectId: 's2', sessionSubjectName: 'Physics' },
    );
  });

  it('shows rich suggestions when the typed subject is ambiguous', async () => {
    const pendingSubjectResolution = {
      originalText: 'tell me about water',
      prompt: "I couldn't figure out the subject. Which one fits?",
      candidates: [{ subjectId: 's1', subjectName: 'English' }],
    };
    const suggestions = [
      {
        name: 'Chemistry',
        description: 'Water molecules and reactions',
        focus: 'Water',
      },
    ];
    const opts = createMockOpts({
      pendingSubjectResolution,
      resolveSubject: {
        mutateAsync: jest.fn().mockResolvedValue({
          status: 'ambiguous',
          resolvedName: null,
          suggestions,
          displayMessage: '**Water** can fit a few subjects.',
        }),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleTypeSubject('water');
    });

    const updater = opts.setPendingSubjectResolution.mock.calls[0][0] as (
      current: typeof pendingSubjectResolution,
    ) => unknown;
    expect(updater(pendingSubjectResolution)).toEqual({
      ...pendingSubjectResolution,
      prompt: '**Water** can fit a few subjects.',
      resolveSuggestions: suggestions,
    });
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });
});

describe('useSubjectClassification — homework image subject resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('preserves the image send request while waiting for a subject pick', async () => {
    const opts = createMockOpts({
      effectiveMode: 'homework',
      classifySubject: {
        mutateAsync: jest.fn().mockRejectedValue(new Error('network error')),
      },
      availableSubjects: [{ id: 's1', name: 'Math' }],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Solve this homework problem', {
        attachImage: true,
      });
    });

    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'Solve this homework problem',
        attachImage: true,
      }),
    );
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('sends the preserved image after the learner chooses a subject', async () => {
    const imageAttachment = {
      base64: 'base64-image',
      mimeType: 'image/jpeg' as const,
    };
    const pendingSubjectResolution = {
      originalText: 'Solve this homework problem',
      prompt: 'Pick the subject that fits best:',
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
      imageAttachment,
    };
    const opts = createMockOpts({
      pendingSubjectResolution,
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleResolveSubject({
        subjectId: 's1',
        subjectName: 'Math',
      });
    });

    expect(opts.continueWithMessage).toHaveBeenCalledWith(
      'Solve this homework problem',
      {
        sessionSubjectId: 's1',
        sessionSubjectName: 'Math',
        imageAttachment,
      },
    );
  });
});

describe('C7 subject classification ack is tentative (copy sweep 2026-04-19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('renders "Looks like {subject}." without the confident "Got it" prefix', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'Geography' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Where is the Nile?');
    });

    // Find the setMessages call whose updater appends an assistant message
    // containing the classified subject name.
    const ackCall = opts.setMessages.mock.calls.find((call: unknown[]) => {
      const updater = call[0];
      if (typeof updater !== 'function') return false;
      const next = updater([]) as Array<{ content?: string }>;
      return next.some(
        (m) => typeof m.content === 'string' && m.content.includes('Geography'),
      );
    });
    expect(ackCall).not.toBeUndefined();

    const updater = ackCall![0] as (
      prev: Array<{ content?: string }>,
    ) => Array<{ content?: string }>;
    const appended = updater([]);
    const ackMessage = appended.find(
      (m) => typeof m.content === 'string' && m.content.includes('Geography'),
    );
    expect(ackMessage?.content).toBe('Looks like Geography.');
    // Tentative phrasing — no confident "Got it" prefix, no declarative "is about"
    expect(ackMessage?.content).not.toMatch(/^Got it/);
    expect(ackMessage?.content).not.toMatch(/this is about/i);
  });
});

describe('useSubjectClassification — V2 mentor entry [T25]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = false;
  });

  it('confident single candidate auto-picks silently AND keeps the override chip visible', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's1', subjectName: 'English' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      isV2MentorEntry: true,
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('analyse this passage');
    });

    expect(opts.setClassifiedSubject).toHaveBeenCalledWith({
      subjectId: 's1',
      subjectName: 'English',
    });
    // T25: the override chip is always visible under V2 so a confident
    // mis-commit ("analysis" -> English) can be corrected in one tap.
    expect(opts.setShowWrongSubjectChip).toHaveBeenCalledWith(true);
    expect(opts.setPendingSubjectResolution).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('multiple candidates open narrow inline disambiguation — classifier candidates, NOT the full library grid', async () => {
    const classifyResult = {
      needsConfirmation: true,
      candidates: [
        { subjectId: 's-math', subjectName: 'Mathematics' },
        { subjectId: 's-eng', subjectName: 'English' },
      ],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      isV2MentorEntry: true,
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
      availableSubjects: [
        { id: 's-math', name: 'Mathematics' },
        { id: 's-eng', name: 'English' },
        { id: 's-sci', name: 'Science' },
        { id: 's-hist', name: 'History' },
      ],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('help me with analysis');
    });

    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'help me with analysis',
        candidates: [
          { subjectId: 's-math', subjectName: 'Mathematics' },
          { subjectId: 's-eng', subjectName: 'English' },
        ],
      }),
    );
    // Narrow disambiguation, not the 4-subject library grid.
    const pending = opts.setPendingSubjectResolution.mock.calls[0][0];
    expect(pending.candidates).toHaveLength(2);
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('zero candidates with a suggested name silently creates the subject (no picker, no grid)', async () => {
    const classifyResult = {
      needsConfirmation: true,
      candidates: [],
      suggestedSubjectName: 'Physics',
    };
    const opts = createMockOpts({
      isV2MentorEntry: true,
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
      availableSubjects: [
        { id: 's1', name: 'English' },
        { id: 's2', name: 'Chemistry' },
      ],
      createSubject: {
        mutateAsync: jest.fn().mockResolvedValue({
          subject: { id: 's-phys', name: 'Physics' },
        }),
        isPending: false,
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Tell me about the war of currents');
    });

    expect(opts.createSubject.mutateAsync).toHaveBeenCalledWith({
      name: 'Physics',
      rawInput: 'Tell me about the war of currents',
    });
    expect(opts.setClassifiedSubject).toHaveBeenCalledWith({
      subjectId: 's-phys',
      subjectName: 'Physics',
    });
    expect(opts.setShowWrongSubjectChip).toHaveBeenCalledWith(true);
    expect(opts.setPendingSubjectResolution).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalledWith(
      'Tell me about the war of currents',
      expect.objectContaining({
        sessionSubjectId: 's-phys',
        sessionSubjectName: 'Physics',
      }),
    );
  });

  it('does NOT block a follow-up message with the legacy "pick the subject first" wall — supersedes the stale disambiguation and re-resolves', async () => {
    const pendingSubjectResolution = {
      originalText: 'help me with analysis',
      prompt:
        'This sounds like it could be Mathematics or English. Which one are we working on?',
      candidates: [
        { subjectId: 's-math', subjectName: 'Mathematics' },
        { subjectId: 's-eng', subjectName: 'English' },
      ],
    };
    const classifyResult = {
      needsConfirmation: false,
      candidates: [{ subjectId: 's-math', subjectName: 'Mathematics' }],
      suggestedSubjectName: null,
    };
    const opts = createMockOpts({
      isV2MentorEntry: true,
      pendingSubjectResolution,
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend(
        'I mean mathematical analysis, derivatives',
      );
    });

    expect(opts.showConfirmation).not.toHaveBeenCalledWith(
      "Pick the subject first, then I'll keep going.",
    );
    // Stale disambiguation cleared, fresh message re-classified.
    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(null);
    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'I mean mathematical analysis, derivatives',
    });
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('flag OFF (V0/V1): a follow-up message while a subject pick is pending still shows the "pick the subject first" wall', async () => {
    const pendingSubjectResolution = {
      originalText: 'help me with analysis',
      prompt: 'Which one are we working on?',
      candidates: [{ subjectId: 's-math', subjectName: 'Mathematics' }],
    };
    const opts = createMockOpts({
      // isV2MentorEntry omitted -> falsy
      pendingSubjectResolution,
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('something else');
    });

    expect(opts.showConfirmation).toHaveBeenCalledWith(
      "Pick the subject first, then I'll keep going.",
    );
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('flag OFF (V0/V1): zero candidates with a suggested name still opens the subject picker grid — no silent create', async () => {
    const classifyResult = {
      needsConfirmation: true,
      candidates: [],
      suggestedSubjectName: 'Physics',
    };
    const opts = createMockOpts({
      // isV2MentorEntry omitted -> falsy: legacy behavior must be unchanged
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
      availableSubjects: [
        { id: 's1', name: 'English' },
        { id: 's2', name: 'Chemistry' },
      ],
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Tell me about the war of currents');
    });

    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt:
          'This sounds like Physics. Pick a subject below, or tap "+ Physics" to add it.',
        candidates: [
          { subjectId: 's1', subjectName: 'English' },
          { subjectId: 's2', subjectName: 'Chemistry' },
        ],
        suggestedSubjectName: 'Physics',
      }),
    );
    expect(opts.createSubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });
});

describe('useSubjectClassification — proxy mode write guard [WI-307]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsParentProxy = true;
  });

  it('handleSend dispatches no mutations in proxy mode [WI-307]', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.handleSend(
        'help me with quadratic equations',
      );
    });

    expect(returnValue).toBeUndefined();
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.resolveSubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.createSubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });

  it('handleTypeSubject dispatches no mutations in proxy mode [WI-307]', async () => {
    const pendingSubjectResolution = {
      originalText: 'tell me about math',
      prompt: 'Pick a subject:',
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
    };
    const opts = createMockOpts({ pendingSubjectResolution });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.handleTypeSubject('math');
    });

    expect(returnValue).toBeUndefined();
    expect(opts.resolveSubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.createSubject.mutateAsync).not.toHaveBeenCalled();
  });

  it('handleCreateSuggestedSubject dispatches no mutations in proxy mode [WI-307]', async () => {
    const pendingSubjectResolution = {
      originalText: 'tell me about math',
      prompt: 'Did you mean Math?',
      candidates: [],
      suggestedSubjectName: 'Math',
    };
    const opts = createMockOpts({ pendingSubjectResolution });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.handleCreateSuggestedSubject();
    });

    expect(returnValue).toBeUndefined();
    expect(opts.createSubject.mutateAsync).not.toHaveBeenCalled();
  });

  it('handleResolveSubject dispatches nothing in proxy mode [WI-307]', async () => {
    // Regression guard for the WI-371 fix: handleResolveSubject now early-
    // returns when isParentProxy is true, the same as the other handlers.
    // Without the guard, calling handleResolveSubject with a resolved subject
    // would invoke continueWithMessage — a write on behalf of the child.
    const pendingSubjectResolution = {
      originalText: 'tell me about math',
      prompt: 'Pick a subject:',
      candidates: [{ subjectId: 's1', subjectName: 'Math' }],
    };
    const opts = createMockOpts({ pendingSubjectResolution });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.handleResolveSubject({
        subjectId: 's1',
        subjectName: 'Math',
      });
    });

    expect(returnValue).toBeUndefined();
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
    expect(opts.resolveSubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.createSubject.mutateAsync).not.toHaveBeenCalled();
  });
});
