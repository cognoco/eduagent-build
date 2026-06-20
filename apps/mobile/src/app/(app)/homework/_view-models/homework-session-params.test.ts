import type { HomeworkProblem } from '@eduagent/schemas';
import i18next from 'i18next';

import {
  buildHomeworkSessionParams,
  getHomeworkProblemTruncationAlertMessage,
  homeworkReturnHrefForReturnTo,
} from './homework-session-params';

function problem(id: string, text: string): HomeworkProblem {
  return {
    id,
    text,
    originalText: text,
    source: 'manual',
    selectedMode: null,
  };
}

describe('buildHomeworkSessionParams', () => {
  it('serializes optional homework context without a truncation warning', () => {
    const result = buildHomeworkSessionParams({
      subjectId: 'math',
      subjectName: 'Math',
      problemText: '2 + 2',
      problems: [problem('p1', '2 + 2')],
      sourceOcrText: '2 + 2',
      imageUri: 'file://photo.jpg',
      imageMimeType: 'image/jpeg',
      captureSource: 'camera',
      returnTo: 'home',
      maxParamLength: 400,
    });

    expect(result.params).toMatchObject({
      mode: 'homework',
      subjectId: 'math',
      subjectName: 'Math',
      problemText: '2 + 2',
      ocrText: '2 + 2',
      imageUri: 'file://photo.jpg',
      imageMimeType: 'image/jpeg',
      captureSource: 'camera',
      returnTo: 'home',
    });
    expect(result.params.homeworkProblems).toContain('"id":"p1"');
    expect(result.truncation).toBeNull();
  });

  it('keeps capture source separate from V2 mentor entry and return params', () => {
    const result = buildHomeworkSessionParams({
      subjectId: 'math',
      subjectName: 'Math',
      problemText: '2 + 2',
      captureSource: 'camera',
      entrySource: 'mentor',
      returnTo: 'mentor',
      maxParamLength: 400,
    });

    expect(result.params).toMatchObject({
      mode: 'homework',
      subjectId: 'math',
      subjectName: 'Math',
      problemText: '2 + 2',
      captureSource: 'camera',
      entrySource: 'mentor',
      returnTo: 'mentor',
    });
  });

  it('drops trailing problems until the serialized payload fits', () => {
    const result = buildHomeworkSessionParams({
      subjectId: 'math',
      subjectName: 'Math',
      problemText: 'all problems',
      problems: [
        problem('p1', 'short enough'),
        problem('p2', 'x'.repeat(120)),
        problem('p3', 'y'.repeat(120)),
      ],
      maxParamLength: 220,
    });

    expect(result.params.homeworkProblems).toContain('"id":"p1"');
    expect(result.params.homeworkProblems).not.toContain('"id":"p2"');
    expect(result.params.homeworkProblems).not.toContain('"id":"p3"');
    expect(result.truncation).toMatchObject({
      inputProblemCount: 3,
      savedProblemCount: 1,
      droppedProblemCount: 2,
      singleProblemTruncated: false,
      maxParamLength: 220,
    });
  });

  it('shortens a single oversized problem as the last resort', () => {
    const result = buildHomeworkSessionParams({
      subjectId: 'math',
      subjectName: 'Math',
      problemText: 'oversized',
      problems: [
        problem(
          'p1',
          'This long algebra prompt contains many words that can be safely shortened before navigation',
        ),
      ],
      maxParamLength: 170,
    });

    expect(result.params.homeworkProblems).toContain('[truncated]');
    expect(result.params.homeworkProblems?.length).toBeLessThanOrEqual(170);
    expect(result.truncation).toMatchObject({
      inputProblemCount: 1,
      savedProblemCount: 1,
      droppedProblemCount: 0,
      singleProblemTruncated: true,
    });
  });

  it('omits homeworkProblems when no problem array is provided', () => {
    const result = buildHomeworkSessionParams({
      subjectId: 'math',
      subjectName: 'Math',
      problemText: 'manual text',
      maxParamLength: 120,
    });

    expect(result.params.homeworkProblems).toBeUndefined();
    expect(result.truncation).toBeNull();
  });
});

describe('homeworkReturnHrefForReturnTo', () => {
  it('maps V2 mentor returns back to the Mentor tab', () => {
    expect(homeworkReturnHrefForReturnTo('mentor')).toBe('/(app)/mentor');
    expect(homeworkReturnHrefForReturnTo(['mentor', 'home'])).toBe(
      '/(app)/mentor',
    );
  });
});

describe('getHomeworkProblemTruncationAlertMessage', () => {
  it('reports dropped-problem counts', () => {
    expect(
      getHomeworkProblemTruncationAlertMessage(
        {
          inputProblemCount: 5,
          savedProblemCount: 2,
          droppedProblemCount: 3,
          singleProblemTruncated: false,
          maxParamLength: 8000,
        },
        i18next.t,
      ),
    ).toBe('Some problems were too long; only the first 2 of 5 are saved.');
  });

  it('reports a shortened single problem', () => {
    expect(
      getHomeworkProblemTruncationAlertMessage(
        {
          inputProblemCount: 1,
          savedProblemCount: 1,
          droppedProblemCount: 0,
          singleProblemTruncated: true,
          maxParamLength: 8000,
        },
        i18next.t,
      ),
    ).toBe('This problem was too long to send in full and was shortened.');
  });
});
