import { renderHook, act } from '@testing-library/react-native';
import { useSubjectClassification } from './use-subject-classification';

// Mock animateResponse from the session components barrel
jest.mock('../../../../components/session', () => ({
  animateResponse: jest.fn(() => jest.fn()),
}));

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
    animateResponse: require('../../../../components/session').animateResponse,
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
  });

  it('intercepts a pure greeting in freeform mode — calls animateResponse, not classifySubject or continueWithMessage', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).toHaveBeenCalledTimes(1);
    expect(animateResponse).toHaveBeenCalledWith(
      expect.stringContaining('What would you like to learn about'),
      opts.setMessages,
      opts.setIsStreaming
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

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).toHaveBeenCalledWith(
      "Hey! What's on your mind today?",
      opts.setMessages,
      opts.setIsStreaming
    );
  });

  it('stores cleanup function in animationCleanupRef', async () => {
    const cleanup = jest.fn();
    const { animateResponse } = require('../../../../components/session');
    animateResponse.mockReturnValueOnce(cleanup);

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

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).not.toHaveBeenCalled();
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

    const { animateResponse } = require('../../../../components/session');
    // classifySubject is not called (subjectId provided), but continueWithMessage IS
    expect(animateResponse).not.toHaveBeenCalled();
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

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).not.toHaveBeenCalled();
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

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).not.toHaveBeenCalled();
    // Classification or continueWithMessage must have been called
    expect(
      opts.classifySubject.mutateAsync.mock.calls.length +
        opts.continueWithMessage.mock.calls.length
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
      })
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
      })
    );
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });
});
