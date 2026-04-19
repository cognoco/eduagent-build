import { renderHook, act } from '@testing-library/react-native';
import { useSubjectClassification } from './use-subject-classification';

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

describe('useSubjectClassification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('intercepts a pure greeting in freeform mode', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    const { animateResponse } = require('../../../../components/session');
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

  it('stores the animation cleanup function on greeting intercept', async () => {
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

  it('skips visible classification for substantive freeform asks when subjects exist', async () => {
    const opts = createMockOpts();
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('help me with quadratic equations');
    });

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).not.toHaveBeenCalled();
    expect(opts.classifySubject.mutateAsync).not.toHaveBeenCalled();
    expect(opts.setPendingSubjectResolution).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalledWith(
      'help me with quadratic equations'
    );
  });

  it('does not intercept greetings when subject is already set via route param', async () => {
    const opts = createMockOpts({
      subjectId: 's1',
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('hi');
    });

    const { animateResponse } = require('../../../../components/session');
    expect(animateResponse).not.toHaveBeenCalled();
    expect(opts.continueWithMessage).toHaveBeenCalled();
  });

  it('does not intercept greetings when a classified subject is already set', async () => {
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

  it('still uses classification in non-freeform mode', async () => {
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
    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'hi',
    });
  });

  it('falls back to visible subject resolution in freeform when no subjects exist', async () => {
    const classifyResult = {
      needsConfirmation: false,
      candidates: [],
      suggestedSubjectName: 'Dinosaurs',
    };
    const opts = createMockOpts({
      availableSubjects: [],
      classifySubject: {
        mutateAsync: jest.fn().mockResolvedValue(classifyResult),
      },
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('teach me about dinosaurs');
    });

    expect(opts.classifySubject.mutateAsync).toHaveBeenCalledWith({
      text: 'teach me about dinosaurs',
    });
    expect(opts.setPendingSubjectResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        originalText: 'teach me about dinosaurs',
        prompt: expect.stringContaining('This sounds like Dinosaurs'),
        candidates: [],
        suggestedSubjectName: 'Dinosaurs',
      })
    );
    expect(opts.continueWithMessage).not.toHaveBeenCalled();
  });
});
