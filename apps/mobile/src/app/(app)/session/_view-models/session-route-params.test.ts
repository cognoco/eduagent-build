import {
  getSessionRouteParams,
  type RawSessionRouteParams,
} from './session-route-params';

describe('session-route-params', () => {
  it('normalizes first route param values and defaults mode to freeform', () => {
    const params = getSessionRouteParams({
      imageUri: ['file:///cache/first.jpg', 'file:///cache/second.jpg'],
      imageMimeType: ['image/jpeg', 'image/png'],
      returnTo: ['own-learning', 'learner-home'],
      returnId: ['return-1', 'return-2'],
    });

    expect(params).toMatchObject({
      effectiveMode: 'freeform',
      imageUri: 'file:///cache/first.jpg',
      imageMimeType: 'image/jpeg',
      returnTo: 'own-learning',
      returnId: 'return-1',
      chatBackFallback: '/(app)/own-learning',
    });
  });

  it('preserves recitation mode from the route instead of falling back to freeform', () => {
    const params = getSessionRouteParams({
      mode: 'recitation',
      subjectId: 'subject-1',
    });

    expect(params).toMatchObject({
      effectiveMode: 'recitation',
      chatBackFallback: '/(app)/shelf/subject-1',
    });
  });

  it('parses gaps JSON, trims blank values, and caps at eight entries', () => {
    const gaps = [
      'one',
      ' two ',
      '',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ];

    expect(
      getSessionRouteParams({
        gaps: JSON.stringify(gaps),
      }).gaps,
    ).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']);
  });

  it('returns undefined gaps for malformed or non-array JSON', () => {
    expect(getSessionRouteParams({ gaps: 'not json' }).gaps).toBeUndefined();
    expect(
      getSessionRouteParams({ gaps: JSON.stringify({ gap: 'one' }) }).gaps,
    ).toBeUndefined();
  });

  it('normalizes OCR and supported homework capture source values', () => {
    expect(
      getSessionRouteParams({
        ocrText: ['Visible text', 'ignored'],
        captureSource: ['camera', 'gallery'],
      }),
    ).toMatchObject({
      normalizedOcrText: 'Visible text',
      homeworkCaptureSource: 'camera',
    });

    expect(
      getSessionRouteParams({ captureSource: 'unsupported' })
        .homeworkCaptureSource,
    ).toBeUndefined();
  });

  it('parses homework problems only in homework mode and derives initial problem text', () => {
    const serializedProblems = JSON.stringify([
      {
        id: 'problem-1',
        text: 'Solve 2x + 5 = 17',
        source: 'ocr',
        originalText: 'Solve 2x + 5 = 17',
      },
    ]);

    expect(
      getSessionRouteParams({
        mode: 'homework',
        homeworkProblems: serializedProblems,
        problemText: 'Fallback problem',
      }).initialProblemText,
    ).toBe('Solve 2x + 5 = 17');

    expect(
      getSessionRouteParams({
        mode: 'freeform',
        homeworkProblems: serializedProblems,
        problemText: 'Fallback problem',
      }).initialHomeworkProblems,
    ).toEqual([]);
  });

  it('falls chat back navigation to the shelf when no return target is present', () => {
    const params = getSessionRouteParams({
      subjectId: 'subject-1',
    } satisfies RawSessionRouteParams);

    expect(params.chatBackFallback).toBe('/(app)/shelf/subject-1');
  });

  it('keeps V2 mentor homework entry separate from camera source and maps back to Mentor', () => {
    const params = getSessionRouteParams({
      mode: 'homework',
      returnTo: 'mentor',
      entrySource: 'mentor',
      captureSource: 'camera',
      imageUri: 'file:///cache/homework-photo.jpg',
      problemText: 'Solve 2x + 5 = 17',
    });

    expect(params).toMatchObject({
      homeworkEntrySource: 'mentor',
      homeworkCaptureSource: 'camera',
      homeBackHref: '/(app)/mentor',
      chatBackFallback: '/(app)/mentor',
      mentorHomeworkWrapUpFrame: 'mentor-homework',
    });
  });

  it('ignores unsupported homework entry sources', () => {
    const params = getSessionRouteParams({
      mode: 'homework',
      returnTo: 'mentor',
      entrySource: 'camera',
    });

    expect(params.homeworkEntrySource).toBeUndefined();
    expect(params.mentorHomeworkWrapUpFrame).toBeUndefined();
  });

  it('keeps object return targets out of ChatShell backFallback', () => {
    const params = getSessionRouteParams({
      returnTo: 'family-recaps',
      returnId: 'recap-1',
    });

    expect(typeof params.homeBackHref).toBe('object');
    expect(params.chatBackFallback).toBeUndefined();
  });
});
