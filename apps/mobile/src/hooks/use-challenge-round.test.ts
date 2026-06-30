import { renderHook } from '@testing-library/react-native';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useChallengeRound } from './use-challenge-round';

// Clerk auth is globally mocked in src/test-setup.ts (getToken → 'mock-token').
// No mutations are invoked here, so useCreateNote runs for real (no internal
// mock) — the test only asserts callback identity across re-renders.

describe('useChallengeRound', () => {
  beforeEach(() => {
    setActiveProfileId('test-profile-id');
  });

  afterEach(() => {
    setActiveProfileId(undefined);
  });

  it('returns a referentially stable action object + callbacks across re-renders with identical inputs [WI-964]', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: 'test-profile-id' }),
    });

    const opts = {
      sessionId: 'sess-1',
      topicId: 'topic-1',
      subjectId: 'subj-1',
      bookId: 'book-1',
    };

    const { result, rerender } = renderHook(
      (props: typeof opts) => useChallengeRound(props),
      { wrapper, initialProps: opts },
    );

    const first = result.current;

    // Re-render with a FRESH opts object carrying identical primitive values —
    // the realistic caller pattern (callers build a new literal each render).
    // The memoized return + useCallback'd actions must keep their identity
    // because they depend on the destructured primitives, not the literal.
    rerender({ ...opts });

    expect(result.current).toBe(first);
    expect(result.current.accept).toBe(first.accept);
    expect(result.current.decline).toBe(first.decline);
    expect(result.current.abort).toBe(first.abort);
    expect(result.current.saveNote).toBe(first.saveNote);
    expect(result.current.skipNote).toBe(first.skipNote);
  });
});
