import type { ChatMessage } from '../../../../components/session';
import {
  countLearnerMessages,
  countPersistedAiResponses,
  deriveSessionSubjectState,
  getLatestAiMessageId,
  getLatestBookmarkableEventId,
  getLearnerTurnCount,
  resolveLanguageVoiceLocale,
} from './session-derived-state';

describe('session-derived-state', () => {
  it('returns zero counts and no latest AI message for no messages', () => {
    expect(countLearnerMessages([])).toBe(0);
    expect(countPersistedAiResponses([])).toBe(0);
    expect(
      getLatestAiMessageId({ messages: [], isStreaming: false }),
    ).toBeNull();
  });

  it('excludes auto-sent homework messages from learner count', () => {
    const messages: ChatMessage[] = [
      {
        id: 'auto-homework',
        role: 'user',
        content: 'Solve this from the camera',
        isAutoSent: true,
      },
      { id: 'typed', role: 'user', content: 'Can you explain step 2?' },
    ];

    expect(countLearnerMessages(messages)).toBe(1);
  });

  it('uses the larger of local user message count and server exchange count', () => {
    expect(getLearnerTurnCount({ userMessageCount: 1, exchangeCount: 3 })).toBe(
      3,
    );
    expect(getLearnerTurnCount({ userMessageCount: 4, exchangeCount: 2 })).toBe(
      4,
    );
  });

  it('suppresses latest AI message id while streaming', () => {
    expect(
      getLatestAiMessageId({
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'First' },
          { id: 'ai-2', role: 'assistant', content: 'Second' },
        ],
        isStreaming: true,
      }),
    ).toBeNull();
  });

  it('returns the latest non-streaming assistant message id', () => {
    expect(
      getLatestAiMessageId({
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'First' },
          { id: 'user-1', role: 'user', content: 'Question' },
          {
            id: 'ai-streaming',
            role: 'assistant',
            content: 'Still coming',
            streaming: true,
          },
          { id: 'ai-2', role: 'assistant', content: 'Second' },
        ],
        isStreaming: false,
      }),
    ).toBe('ai-2');
  });

  it('counts persisted assistant responses and excludes system prompts and streaming messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'system',
        role: 'assistant',
        content: 'Opening',
        isSystemPrompt: true,
        eventId: 'event-system',
      },
      {
        id: 'streaming',
        role: 'assistant',
        content: 'Still coming',
        streaming: true,
        eventId: 'event-streaming',
      },
      {
        id: 'local',
        role: 'assistant',
        content: 'Local only',
      },
      {
        id: 'persisted',
        role: 'assistant',
        content: 'Saved response',
        eventId: 'event-ai',
      },
    ];

    expect(countPersistedAiResponses(messages)).toBe(1);
  });

  it('has no bookmarkable event when there are no messages', () => {
    expect(
      getLatestBookmarkableEventId({ messages: [], isStreaming: false }),
    ).toBeNull();
  });

  it('has no bookmarkable event while streaming', () => {
    expect(
      getLatestBookmarkableEventId({
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'First', eventId: 'evt-1' },
        ],
        isStreaming: true,
      }),
    ).toBeNull();
  });

  it('has no bookmarkable event when the latest AI message has not persisted yet', () => {
    expect(
      getLatestBookmarkableEventId({
        messages: [{ id: 'ai-1', role: 'assistant', content: 'First' }],
        isStreaming: false,
      }),
    ).toBeNull();
  });

  it('returns the eventId of the latest non-streaming assistant message', () => {
    expect(
      getLatestBookmarkableEventId({
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'First', eventId: 'evt-1' },
          { id: 'user-1', role: 'user', content: 'Question' },
          {
            id: 'ai-streaming',
            role: 'assistant',
            content: 'Still coming',
            streaming: true,
            eventId: 'evt-streaming',
          },
          {
            id: 'ai-2',
            role: 'assistant',
            content: 'Second',
            eventId: 'evt-2',
          },
        ],
        isStreaming: false,
      }),
    ).toBe('evt-2');
  });

  it('prefers classified subject over route subject', () => {
    expect(
      deriveSessionSubjectState({
        classifiedSubject: {
          subjectId: 'classified-subject',
          subjectName: 'Classified subject',
        },
        routeSubjectId: 'route-subject',
        routeSubjectName: 'Route subject',
        transcriptSubjectId: undefined,
        activeSessionSubjectId: undefined,
        routeTopicId: 'route-topic',
        transcriptTopicId: undefined,
        activeSessionTopicId: undefined,
      }),
    ).toEqual({
      effectiveSubjectId: 'classified-subject',
      effectiveSubjectName: 'Classified subject',
      noteSubjectId: 'classified-subject',
      noteTopicId: 'route-topic',
    });
  });

  it('falls effective and note subject back to transcript then active session', () => {
    expect(
      deriveSessionSubjectState({
        classifiedSubject: null,
        routeSubjectId: undefined,
        routeSubjectName: undefined,
        transcriptSubjectId: 'transcript-subject',
        activeSessionSubjectId: 'active-subject',
        routeTopicId: undefined,
        transcriptTopicId: 'transcript-topic',
        activeSessionTopicId: 'active-topic',
      }),
    ).toMatchObject({
      effectiveSubjectId: 'transcript-subject',
      noteSubjectId: 'transcript-subject',
    });

    expect(
      deriveSessionSubjectState({
        classifiedSubject: null,
        routeSubjectId: undefined,
        routeSubjectName: undefined,
        transcriptSubjectId: undefined,
        activeSessionSubjectId: 'active-subject',
        routeTopicId: undefined,
        transcriptTopicId: undefined,
        activeSessionTopicId: 'active-topic',
      }),
    ).toMatchObject({
      effectiveSubjectId: 'active-subject',
      noteSubjectId: 'active-subject',
      noteTopicId: 'active-topic',
    });
  });

  describe('resolveLanguageVoiceLocale', () => {
    // AC-test (WI-1447): a non-four_strands Norwegian learner gets nb-NO,
    // not en-US/provider default.
    it('routes a non-four_strands subject through the profile conversationLanguage', () => {
      expect(
        resolveLanguageVoiceLocale({
          activeSubject: { pedagogyMode: 'socratic' },
          conversationLanguage: 'nb',
        }),
      ).toBe('nb-NO');
    });

    it('still uses the subject languageCode for four_strands subjects', () => {
      expect(
        resolveLanguageVoiceLocale({
          activeSubject: { pedagogyMode: 'four_strands', languageCode: 'es' },
          conversationLanguage: 'nb',
        }),
      ).toBe('es-ES');
    });

    it.each([
      ['cs', 'cs-CZ'],
      ['ja', 'ja-JP'],
      ['pl', 'pl-PL'],
      ['en', 'en-US'],
    ])(
      'resolves non-four_strands conversationLanguage "%s" to "%s"',
      (conversationLanguage, expectedLocale) => {
        expect(
          resolveLanguageVoiceLocale({
            activeSubject: { pedagogyMode: 'socratic' },
            conversationLanguage,
          }),
        ).toBe(expectedLocale);
      },
    );

    it('falls back to en-US when the profile has no conversationLanguage', () => {
      expect(
        resolveLanguageVoiceLocale({
          activeSubject: { pedagogyMode: 'socratic' },
          conversationLanguage: undefined,
        }),
      ).toBe('en-US');
    });

    it('falls back to en-US when there is no active subject', () => {
      expect(
        resolveLanguageVoiceLocale({
          activeSubject: undefined,
          conversationLanguage: undefined,
        }),
      ).toBe('en-US');
    });
  });
});
