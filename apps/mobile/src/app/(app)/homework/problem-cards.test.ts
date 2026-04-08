import {
  buildHomeworkSessionMetadata,
  parseHomeworkProblems,
  serializeHomeworkProblems,
  splitHomeworkProblems,
  withProblemMode,
  withProblemStatus,
} from './problem-cards';

describe('splitHomeworkProblems', () => {
  it('splits numbered worksheet problems into separate cards', () => {
    const problems = splitHomeworkProblems(
      '1. Solve 2x + 5 = 17\n2. Factor x^2 + 3x + 2\n3. Find the slope of y = 2x + 1'
    );

    expect(problems).toHaveLength(3);
    expect(problems[0]?.text).toContain('2x + 5 = 17');
    expect(problems[1]?.text).toContain('x^2 + 3x + 2');
    expect(problems[2]?.source).toBe('ocr');
  });

  it('splits problems on blank lines', () => {
    const problems = splitHomeworkProblems(
      'Solve 2x + 5 = 17\n\nFactor x^2 + 3x + 2'
    );

    expect(problems).toHaveLength(2);
  });

  it('falls back to a single editable problem when no boundaries are found', () => {
    const problems = splitHomeworkProblems(
      'Explain why the derivative of x^2 is 2x.'
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.text).toBe('Explain why the derivative of x^2 is 2x.');
    expect(problems[0]?.originalText).toBe(
      'Explain why the derivative of x^2 is 2x.'
    );
  });
});

describe('problem card helpers', () => {
  it('serializes and parses problem cards', () => {
    const problems = splitHomeworkProblems('1. Add 2 + 2\n2. Add 3 + 3');
    const serialized = serializeHomeworkProblems(problems);
    const parsed = parseHomeworkProblems(serialized);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.text).toBe(problems[0]?.text);
  });

  it('applies per-problem status from the current index', () => {
    const problems = splitHomeworkProblems('1. Add 2 + 2\n2. Add 3 + 3');
    const updated = withProblemStatus(problems, 1);

    expect(updated[0]?.status).toBe('completed');
    expect(updated[1]?.status).toBe('active');
  });

  it('stores the selected homework mode on the active problem', () => {
    const problems = splitHomeworkProblems('1. Add 2 + 2\n2. Add 3 + 3');
    const updated = withProblemMode(problems, problems[0]!.id, 'help_me');

    expect(updated[0]?.selectedMode).toBe('help_me');
    expect(updated[1]?.selectedMode).toBeNull();
  });

  it('builds homework metadata for the API', () => {
    const problems = splitHomeworkProblems('1. Add 2 + 2\n2. Add 3 + 3');
    const metadata = buildHomeworkSessionMetadata(problems, 0, 'raw OCR text');

    expect(metadata.problemCount).toBe(2);
    expect(metadata.currentProblemIndex).toBe(0);
    expect(metadata.problems[0]?.status).toBe('active');
    expect(metadata.problems[1]?.status).toBe('pending');
    expect(metadata.ocrText).toBe('raw OCR text');
  });
});
