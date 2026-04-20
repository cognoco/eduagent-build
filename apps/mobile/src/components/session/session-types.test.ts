import {
  getConversationStage,
  isGreeting,
  errorHasCode,
  isReconnectableSessionError,
} from './session-types';

describe('getConversationStage', () => {
  it('returns teaching for practice mode regardless of other inputs', () => {
    expect(getConversationStage(0, false, 'practice')).toBe('teaching');
  });

  it('returns teaching for review mode', () => {
    expect(getConversationStage(0, false, 'review')).toBe('teaching');
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

// [BUG-100] errorHasCode must detect server error codes preserved in ForbiddenError.apiCode
describe('errorHasCode', () => {
  it('matches direct .code property', () => {
    const err = { code: 'SUBJECT_INACTIVE' };
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(true);
  });

  it('matches .apiCode property from ForbiddenError', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      { code: 'FORBIDDEN', apiCode: 'SUBJECT_INACTIVE' }
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

  it('falls back to message string matching', () => {
    const err = new Error('API error 403: {"code":"SUBJECT_INACTIVE"}');
    expect(errorHasCode(err, 'SUBJECT_INACTIVE')).toBe(true);
  });
});

describe('isReconnectableSessionError', () => {
  it('returns false for ForbiddenError with SUBJECT_INACTIVE apiCode', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      { name: 'ForbiddenError', code: 'FORBIDDEN', apiCode: 'SUBJECT_INACTIVE' }
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
