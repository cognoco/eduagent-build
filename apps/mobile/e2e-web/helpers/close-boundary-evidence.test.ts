import { buildCloseBoundaryEvidence } from './close-boundary-evidence';

describe('buildCloseBoundaryEvidence', () => {
  it('[WI-2811] retains the close branch without retaining credentials or learner data', () => {
    const evidence = buildCloseBoundaryEvidence({
      closeResponse: {
        status: 200,
        body: {
          sessionId: 'secret-session-id',
          wallClockSeconds: 123,
          summaryStatus: 'pending',
        },
      },
      pageUrl:
        'https://app.example/session?mode=homework&subjectId=secret-subject&problemText=Solve+3x&entrySource=mentor&returnTo=mentor',
      recoveryDialogAppeared: true,
    });

    expect(evidence).toEqual({
      close: {
        completed: true,
        status: 200,
        schema: ['sessionId', 'summaryStatus', 'wallClockSeconds'],
      },
      postFinishRoute: '/session',
      recoveryDialogAppeared: true,
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('secret-session-id');
    expect(serialized).not.toContain('secret-subject');
    expect(serialized).not.toContain('Solve');
  });

  it('[WI-2811] identifies a missing close response without inventing a schema', () => {
    expect(
      buildCloseBoundaryEvidence({
        closeResponse: null,
        pageUrl: 'https://app.example/session?mode=homework',
        recoveryDialogAppeared: false,
      }),
    ).toEqual({
      close: {
        completed: false,
        status: null,
        schema: [],
      },
      postFinishRoute: '/session',
      recoveryDialogAppeared: false,
    });
  });

  it('[WI-2811] redacts a session identifier embedded in the summary route', () => {
    const evidence = buildCloseBoundaryEvidence({
      closeResponse: {
        status: 200,
        body: { sessionId: 'secret-session-id' },
      },
      pageUrl:
        'https://app.example/session-summary/secret-session-id?returnTo=mentor',
      recoveryDialogAppeared: false,
    });

    expect(evidence.postFinishRoute).toBe('/session-summary/:sessionId');
    expect(JSON.stringify(evidence)).not.toContain('secret-session-id');
  });
});
