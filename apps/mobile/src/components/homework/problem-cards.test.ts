import {
  averageLetterRunLength,
  buildHomeworkSessionMetadata,
  countMeaningfulTokens,
  createHomeworkProblem,
  hasAcceptableShape,
  isLikelyHomework,
  parseHomeworkProblems,
  serializeHomeworkProblems,
  splitHomeworkProblems,
  withProblemMode,
  withProblemStatus,
} from './problem-cards';

const S2_NON_HOMEWORK_FIXTURE = `
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
todo fix build lint test deploy
fn ui db io tx rx id ts js ux qa
const api route hook state prop
`.trim();

function buildWordProblem(wordCount: number): string {
  return Array.from({ length: wordCount }, (_, index) => `word${index + 1}`)
    .join(' ')
    .concat('?');
}

function legacySingleCardSplit(rawText: string) {
  const normalizedText = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) {
    return [];
  }

  return [
    createHomeworkProblem(normalizedText, {
      source: 'ocr',
      originalText: normalizedText,
    }),
  ];
}

describe('homework OCR guard helpers', () => {
  it('countMeaningfulTokens does not double-count x or X', () => {
    expect(countMeaningfulTokens('x + X = 10')).toBe(5);
  });

  it('accepts pure-symbol math like 2x+3=7', () => {
    expect(hasAcceptableShape('2x+3=7')).toBe(true);
    expect(isLikelyHomework('2x+3=7')).toBe(true);
  });

  it('accepts word problems up to 120 words', () => {
    expect(hasAcceptableShape(buildWordProblem(120))).toBe(true);
  });

  it('drops cards over 120 words', () => {
    expect(hasAcceptableShape(buildWordProblem(121))).toBe(false);
  });

  it('drops fragments under the token floor', () => {
    expect(isLikelyHomework('ok')).toBe(false);
    expect(isLikelyHomework('??')).toBe(false);
  });

  it('drops dev-notes style text with low avg letter-run length', () => {
    const junkText =
      'fn ui db io tx rx id ts js ux qa fn ui db io tx rx id ts js ux qa';

    expect(averageLetterRunLength(junkText)).toBeLessThan(2.5);
    expect(isLikelyHomework(junkText)).toBe(false);
  });

  it('isLikelyHomework rejects text with blockConfidence < 0.55', () => {
    expect(isLikelyHomework('Solve 2x + 5 = 17', 0.54)).toBe(false);
    expect(isLikelyHomework('Solve 2x + 5 = 17', 0.55)).toBe(true);
  });

  it('S2 fixture is rejected by isLikelyHomework', () => {
    expect(isLikelyHomework(S2_NON_HOMEWORK_FIXTURE)).toBe(false);
  });
});

describe('splitHomeworkProblems', () => {
  it('splits numbered worksheet problems into separate cards', () => {
    const result = splitHomeworkProblems(
      '1. Solve 2x + 5 = 17\n2. Factor x^2 + 3x + 2\n3. Find the slope of y = 2x + 1',
    );

    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]?.text).toContain('2x + 5 = 17');
    expect(result.problems[1]?.text).toContain('x^2 + 3x + 2');
    expect(result.problems[2]?.source).toBe('ocr');
    expect(result.dropped).toBe(0);
  });

  it('preserves all valid problems from typical homework OCR', () => {
    const result = splitHomeworkProblems(
      '1. Solve 2x + 5 = 17\nShow your work.\n\n2. Explain why the slope is negative.\nUse one sentence.',
    );

    expect(result.problems).toHaveLength(2);
    expect(result.dropped).toBe(0);
    expect(result.problems[0]?.text).toContain('Show your work.');
    expect(result.problems[1]?.text).toContain('Use one sentence.');
  });

  it('drops the single giant card path for non-homework OCR dumps', () => {
    const result = splitHomeworkProblems(S2_NON_HOMEWORK_FIXTURE);

    expect(result.problems).toHaveLength(0);
    expect(result.dropped).toBe(1);
    expect(result.droppedProblems[0]?.text).toBe(S2_NON_HOMEWORK_FIXTURE);
  });

  it('splitHomeworkProblems returns dropped count', () => {
    const result = splitHomeworkProblems(
      '1. Solve 2x + 5 = 17\n\n??\n\n2. Factor x^2 + 3x + 2',
    );

    expect(result.problems).toHaveLength(2);
    expect(result.dropped).toBe(1);
    expect(result.droppedProblems[0]?.text).toBe('??');
  });

  it('guardrails: S2 fixture without gate would produce visible cards', () => {
    const legacyResult = legacySingleCardSplit(S2_NON_HOMEWORK_FIXTURE);

    expect(legacyResult).toHaveLength(1);
    expect(legacyResult[0]?.text).toContain('todo fix build lint test deploy');
  });
});

describe('problem card helpers', () => {
  it('serializes and parses problem cards', () => {
    const problems = splitHomeworkProblems(
      '1. Add 2 + 2\n2. Add 3 + 3',
    ).problems;
    const serialized = serializeHomeworkProblems(problems);
    const parsed = parseHomeworkProblems(serialized);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.text).toBe(problems[0]?.text);
  });

  it('applies per-problem status from the current index', () => {
    const problems = splitHomeworkProblems(
      '1. Add 2 + 2\n2. Add 3 + 3',
    ).problems;
    const updated = withProblemStatus(problems, 1);

    expect(updated[0]?.status).toBe('completed');
    expect(updated[1]?.status).toBe('active');
  });

  it('stores the selected homework mode on the active problem', () => {
    const problems = splitHomeworkProblems(
      '1. Add 2 + 2\n2. Add 3 + 3',
    ).problems;
    const updated = withProblemMode(problems, problems[0]!.id, 'help_me');

    expect(updated[0]?.selectedMode).toBe('help_me');
    expect(updated[1]?.selectedMode).toBeNull();
  });

  it('builds homework metadata for the API', () => {
    const problems = splitHomeworkProblems(
      '1. Add 2 + 2\n2. Add 3 + 3',
    ).problems;
    const metadata = buildHomeworkSessionMetadata(
      problems,
      0,
      'raw OCR text',
      'gallery',
    );

    expect(metadata.problemCount).toBe(2);
    expect(metadata.currentProblemIndex).toBe(0);
    expect(metadata.problems[0]?.status).toBe('active');
    expect(metadata.problems[1]?.status).toBe('pending');
    expect(metadata.ocrText).toBe('raw OCR text');
    expect(metadata.source).toBe('gallery');
  });
});
