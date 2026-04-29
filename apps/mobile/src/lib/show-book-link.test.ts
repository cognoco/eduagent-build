import { shouldShowBookLink } from './show-book-link';

describe('shouldShowBookLink', () => {
  const baseParams = {
    effectiveMode: 'freeform',
    totalTopicsCompleted: 3,
    messagesLength: 1,
  };

  it('shows on the empty state when conditions are met', () => {
    expect(shouldShowBookLink(baseParams)).toBe(true);
  });

  it('[BUG-919] hides once the learner has sent a message', () => {
    // Opening greeting is seeded as messages[0]; a user message bumps the
    // length to 2.
    expect(shouldShowBookLink({ ...baseParams, messagesLength: 2 })).toBe(
      false
    );
  });

  it('[BUG-919] hides once the conversation has multiple turns', () => {
    expect(shouldShowBookLink({ ...baseParams, messagesLength: 5 })).toBe(
      false
    );
  });

  it('hides for homework sessions regardless of state', () => {
    expect(
      shouldShowBookLink({ ...baseParams, effectiveMode: 'homework' })
    ).toBe(false);
  });

  it('hides when learner has no completed topics', () => {
    expect(shouldShowBookLink({ ...baseParams, totalTopicsCompleted: 0 })).toBe(
      false
    );
  });

  it('shows when only the opening greeting is in the message list', () => {
    expect(shouldShowBookLink({ ...baseParams, messagesLength: 1 })).toBe(true);
  });

  it('shows when the message list is empty (defensive)', () => {
    // Edge case: hydration race may briefly render with an empty list.
    expect(shouldShowBookLink({ ...baseParams, messagesLength: 0 })).toBe(true);
  });
});
