import {
  getConversationStage,
  getContextualQuickChips,
  isGreeting,
  errorHasCode,
  isTimeoutError,
  isReconnectableSessionError,
  reconnectPromptForError,
  reconnectPrompt,
  serverErrorPrompt,
} from './session-types';

describe('getConversationStage', () => {
  it('returns teaching for review mode', () => {
    expect(getConversationStage(0, false, 'review')).toBe('teaching');
  });

  it('treats the legacy practice mode literal as teaching (back-compat with sessionModeConfig)', () => {
    // practice was renamed to review (spec 2026-05-06). Persisted/deep-linked
    // sessions with the old literal must still hit the teaching path so they
    // don't render warmup UI. Mirrors `normalizeModeForConfig` in
    // sessionModeConfig.ts — both files normalize in the same direction.
    expect(getConversationStage(0, false, 'practice' as never)).toBe(
      'teaching',
    );
  });

  it('returns teaching for relearn mode', () => {
    expect(getConversationStage(0, false, 'relearn')).toBe('teaching');
  });

  it('returns teaching for homework mode', () => {
    expect(getConversationStage(0, false, 'homework')).toBe('teaching');
  });

  it('returns teaching when userMessageCount >= 2', () => {
    expect(getConversationStage(2, false, 'freeform')).toBe('teaching');
    expect(getConversationStage(3, true, 'learning')).toBe('teaching');
  });

  it('returns orienting when subject is known but userMessageCount < 2', () => {
    // Learning mode with subject pre-set via route params
    expect(getConversationStage(0, true, 'learning')).toBe('orienting');
    // Freeform with substantive first message (classification set subject, count still 1)
    expect(getConversationStage(1, true, 'freeform')).toBe('orienting');
  });

  it('returns teaching after the first learner message in scoped learning mode', () => {
    expect(getConversationStage(1, true, 'learning')).toBe('teaching');
  });

  it('returns greeting when no subject and userMessageCount < 2', () => {
    expect(getConversationStage(0, false, 'freeform')).toBe('greeting');
    expect(getConversationStage(1, false, 'freeform')).toBe('greeting');
  });

  it('returns greeting for learning mode with no subject and 0 messages', () => {
    expect(getConversationStage(0, false, 'learning')).toBe('greeting');
  });

  it('prioritises userMessageCount >= 2 over hasSubject === false', () => {
    // In freeform: greeting → teaching, skipping orienting
    expect(getConversationStage(2, false, 'freeform')).toBe('teaching');
  });
});

describe('isGreeting', () => {
  it.each([
    'hi',
    'Hi!',
    'hey',
    'heyyy',
    'hello',
    'yo',
    'sup',
    "what's up",
    'hola',
    'hei',
    'hej',
    'ciao',
    'salut',
    'bonjour',
    'hallo',
    'hei hei',
    'Hi!  ',
    '  hello  ',
  ])('matches pure greeting: "%s"', (text) => {
    expect(isGreeting(text)).toBe(true);
  });

  it.each([
    'hi can you help me with fractions',
    'hello I need to study for my test',
    'hey what are volcanoes',
    'help me with math',
    'tell me about history',
    'yo explain photosynthesis',
    '',
    '   ',
    '👋',
    'hii there',
  ])('rejects non-greeting: "%s"', (text) => {
    expect(isGreeting(text)).toBe(false);
  });
});

describe('getContextualQuickChips', () => {
  const nonQuestionMessage = {
    id: 'ai-1',
    role: 'assistant' as const,
    content: 'You explained that clearly.',
  };

  it('includes too_easy after a non-question assistant reply by default', () => {
    expect(getContextualQuickChips(nonQuestionMessage)).toContain('too_easy');
  });

  it('hides too_easy while a challenge round is in flight', () => {
    expect(
      getContextualQuickChips(nonQuestionMessage, {
        challengeRoundInFlight: true,
      }),
    ).toEqual(['know_this', 'explain_differently', 'example']);
  });
});

// [BUG-100] errorHasCode must detect server error codes preserved in ForbiddenError.apiCode
describe('errorHasCode', () => {
  it('matches direct .code property', () => {
    const err = { code: 'SUBJECT_INACTIVE' };
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(true);
  });

  it('matches .apiCode property from ForbiddenError', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      { code: 'FORBIDDEN', apiCode: 'SUBJECT_INACTIVE' },
    );
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(true);
  });

  it('does not match when apiCode is different', () => {
    const err = Object.assign(new Error('Forbidden'), {
      code: 'FORBIDDEN',
      apiCode: 'SOME_OTHER_CODE',
    });
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(false);
  });

  // [BUG-389] errorHasCode must NOT fall back to string-matching on the error
  // message. The api-client boundary always sets typed .code / .apiCode
  // properties — classify-before-format rule requires reading those, never
  // parsing JSON text from a message that may have already been formatted.
  it('does NOT string-match on the error message JSON body (BUG-389)', () => {
    // A plain Error with the code embedded in the message (old api-client
    // fallback shape) must NOT match — .code is missing, so the result is false.
    const err = new Error('API error 403: {"code":"SUBJECT_INACTIVE"}');
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(false);
  });

  it('matches when .code is set on the error object (correct typed-error path)', () => {
    const err = Object.assign(new Error('Subject paused'), {
      code: 'SUBJECT_INACTIVE',
    });
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(true);
  });
});

// [BUG-389] isTimeoutError — must classify by `isTimeout` property, not message text.
describe('isTimeoutError [BUG-389]', () => {
  it('returns true when isTimeout property is true', () => {
    const err = Object.assign(
      new Error('The connection timed out while waiting for a reply'),
      {
        isTimeout: true,
      },
    );
    expect(isTimeoutError(err)).toBe(true);
  });

  it('[BUG-389 break-test] returns true even when message text differs (property is authoritative)', () => {
    // Pre-fix: removing the message check meant only isTimeout property worked.
    // This test fails before fix if isTimeoutError relied on message matching.
    const err = Object.assign(new Error('Connection took too long'), {
      isTimeout: true,
    });
    expect(isTimeoutError(err)).toBe(true);
  });

  it('returns false when isTimeout is absent even if message matches old text', () => {
    // [BUG-389] After fix: message-string matching is removed.
    // A plain Error with timeout-like text but no isTimeout property must return false.
    const err = new Error('The connection timed out while waiting for a reply');
    // No isTimeout property — must not classify as timeout.
    expect(isTimeoutError(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTimeoutError(null)).toBe(false);
  });

  it('returns false for a plain network error', () => {
    const err = new Error('Network request failed');
    expect(isTimeoutError(err)).toBe(false);
  });
});

describe('isReconnectableSessionError', () => {
  it('returns false for ForbiddenError with SUBJECT_INACTIVE apiCode', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      {
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
        apiCode: 'SUBJECT_INACTIVE',
      },
    );
    expect(isReconnectableSessionError(err)).toBe(false);
  });

  it('returns false for ForbiddenError with EXCHANGE_LIMIT_EXCEEDED apiCode', () => {
    const err = Object.assign(new Error('Session limit reached'), {
      name: 'ForbiddenError',
      code: 'FORBIDDEN',
      apiCode: 'EXCHANGE_LIMIT_EXCEEDED',
    });
    expect(isReconnectableSessionError(err)).toBe(false);
  });
});

// BUG-151: Reconnect-prompt copy must not promise a UI button that doesn't
// render. The previous wording said "use the Reconnect button below" — fine
// for the reconnectable path where SessionMessageActions renders a Reconnect
// chip, but misleading anywhere else.
describe('reconnect-prompt copy (BUG-151)', () => {
  it('does not reference a non-existent "button below"', () => {
    expect(reconnectPrompt().toLowerCase()).not.toContain('button below');
    expect(serverErrorPrompt().toLowerCase()).not.toContain('button below');
  });

  it('reconnectPromptForError returns the same wording for network errors', () => {
    const networkErr = new TypeError('Network request failed');
    expect(reconnectPromptForError(networkErr)).toBe(reconnectPrompt());
    expect(reconnectPromptForError(networkErr).toLowerCase()).not.toContain(
      'button below',
    );
  });
});
