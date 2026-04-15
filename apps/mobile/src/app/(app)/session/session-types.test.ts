import { getConversationStage, isGreeting } from './session-types';

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
