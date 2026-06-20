import { matchBarIntent } from './bar-intent-match';

describe('matchBarIntent', () => {
  it('returns a deterministic jump only for currently supported catalog routes', () => {
    const result = matchBarIntent('continue my session session-123');

    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'session.resume',
        params: { sessionId: 'session-123' },
        chain: [],
      },
    });
  });

  it('does not jump to unsupported shell routes', () => {
    expect(matchBarIntent('show my progress')).toEqual({
      kind: 'uncertain',
      text: 'show my progress',
    });
  });

  it('returns mentor for a clear conversational message', () => {
    expect(matchBarIntent('why does the moon look bigger tonight?')).toEqual({
      kind: 'mentor',
      text: 'why does the moon look bigger tonight?',
    });
  });

  it('returns uncertain for short or ambiguous text', () => {
    expect(matchBarIntent('review')).toEqual({
      kind: 'uncertain',
      text: 'review',
    });
  });

  it('is synchronous and does not call network APIs', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const result = matchBarIntent('open topic topic-1 in subject subject-1');

    expect(result).not.toBeInstanceOf(Promise);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
