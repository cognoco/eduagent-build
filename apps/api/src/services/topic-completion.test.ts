import {
  isAcceptedSummaryStatus,
  isMeaningfulCompletedSession,
  MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
} from './topic-completion';

describe('topic-completion', () => {
  it('requires a terminal session with at least the meaningful exchange threshold', () => {
    expect(
      isMeaningfulCompletedSession({
        status: 'completed',
        exchangeCount: MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
      }),
    ).toBe(true);
    expect(
      isMeaningfulCompletedSession({
        status: 'completed',
        exchangeCount: MIN_EXCHANGES_FOR_TOPIC_COMPLETION - 1,
      }),
    ).toBe(false);
    expect(
      isMeaningfulCompletedSession({
        status: 'active',
        exchangeCount: MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
      }),
    ).toBe(false);
  });

  it('treats only accepted summaries as a completion signal', () => {
    expect(isAcceptedSummaryStatus('accepted')).toBe(true);
    expect(isAcceptedSummaryStatus('submitted')).toBe(false);
    expect(isAcceptedSummaryStatus('skipped')).toBe(false);
  });
});
