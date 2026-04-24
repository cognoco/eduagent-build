import type {
  HomeworkCaptureSource,
  HomeworkMode,
  HomeworkProblem,
  HomeworkSessionMetadata,
} from '@eduagent/schemas';

let homeworkProblemCounter = 0;

const NUMBERED_PROBLEM_PATTERN = /^\s*(?:\d+|[A-Z])[.)]\s+/;
const OPERATOR_RE = /[+\-−×*·÷/=<>≤≥±²³]/g;
const MIN_MEANINGFUL_TOKENS = 3;
const MAX_HOMEWORK_WORDS = 120;
const MIN_AVERAGE_LETTER_RUN_LENGTH = 2.5;
const MIN_BLOCK_CONFIDENCE = 0.55;

export interface SplitHomeworkProblemsResult {
  problems: HomeworkProblem[];
  dropped: number;
  droppedProblems: HomeworkProblem[];
}

function nextHomeworkProblemId(): string {
  homeworkProblemCounter += 1;
  return `homework-problem-${homeworkProblemCounter}`;
}

export function createHomeworkProblem(
  text: string,
  options?: Partial<HomeworkProblem>
): HomeworkProblem {
  return {
    id: options?.id ?? nextHomeworkProblemId(),
    text: text.trim(),
    originalText: options?.originalText ?? null,
    source: options?.source ?? 'manual',
    status: options?.status,
    selectedMode: options?.selectedMode ?? null,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildHomeworkShapeMetrics(text: string): {
  tokens: number;
  words: number;
  averageLetterRunLength: number;
} {
  return {
    tokens: countMeaningfulTokens(text),
    words: countWords(text),
    averageLetterRunLength: averageLetterRunLength(text),
  };
}

export function countMeaningfulTokens(text: string): number {
  const letters = text.match(/\p{L}+/gu) ?? [];
  const digits = text.match(/\d+/g) ?? [];
  const operators = text.match(OPERATOR_RE) ?? [];
  return letters.length + digits.length + operators.length;
}

export function averageLetterRunLength(text: string): number {
  const runs = text.match(/\p{L}+/gu) ?? [];
  if (runs.length === 0) {
    return 0;
  }

  return runs.reduce((sum, run) => sum + run.length, 0) / runs.length;
}

export function hasAcceptableShape(text: string): boolean {
  const { tokens, words } = buildHomeworkShapeMetrics(text);

  if (tokens < MIN_MEANINGFUL_TOKENS) {
    return false;
  }

  if (words > MAX_HOMEWORK_WORDS) {
    return false;
  }

  return true;
}

export function isLikelyHomework(
  text: string,
  blockConfidence?: number
): boolean {
  if (blockConfidence != null && blockConfidence < MIN_BLOCK_CONFIDENCE) {
    return false;
  }

  if (!hasAcceptableShape(text)) {
    return false;
  }

  const letterRuns = text.match(/\p{L}+/gu) ?? [];
  const avgLetterRunLength = averageLetterRunLength(text);
  if (
    letterRuns.length >= 3 &&
    avgLetterRunLength > 0 &&
    avgLetterRunLength < MIN_AVERAGE_LETTER_RUN_LENGTH
  ) {
    return false;
  }

  return true;
}

export function filterHomeworkProblems(
  problems: HomeworkProblem[],
  blockConfidence?: number
): SplitHomeworkProblemsResult {
  const keptProblems: HomeworkProblem[] = [];
  const droppedProblems: HomeworkProblem[] = [];

  for (const problem of problems) {
    if (isLikelyHomework(problem.text, blockConfidence)) {
      keptProblems.push(problem);
    } else {
      droppedProblems.push(problem);
    }
  }

  return {
    problems: keptProblems,
    dropped: droppedProblems.length,
    droppedProblems,
  };
}

export function splitHomeworkProblems(
  rawText: string,
  blockConfidence?: number
): SplitHomeworkProblemsResult {
  const normalizedText = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) {
    return { problems: [], dropped: 0, droppedProblems: [] };
  }

  const lines = normalizedText.split('\n');
  const groups: string[] = [];
  let currentGroup: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup.join('\n').trim());
        currentGroup = [];
      }
      continue;
    }

    if (NUMBERED_PROBLEM_PATTERN.test(line) && currentGroup.length > 0) {
      groups.push(currentGroup.join('\n').trim());
      currentGroup = [line];
      continue;
    }

    currentGroup.push(line);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup.join('\n').trim());
  }

  const problems =
    groups.length <= 1
      ? [
          createHomeworkProblem(normalizedText, {
            source: 'ocr',
            originalText: normalizedText,
          }),
        ]
      : groups.map((group) =>
          createHomeworkProblem(group, {
            source: 'ocr',
            originalText: group,
          })
        );

  return filterHomeworkProblems(problems, blockConfidence);
}

export function getHomeworkProblemText(problems: HomeworkProblem[]): string {
  return problems.map((problem) => problem.text.trim()).join('\n\n');
}

export function serializeHomeworkProblems(problems: HomeworkProblem[]): string {
  return JSON.stringify(problems);
}

export function parseHomeworkProblems(
  serializedProblems?: string | string[] | null,
  fallbackProblemText?: string | null
): HomeworkProblem[] {
  const rawValue = Array.isArray(serializedProblems)
    ? serializedProblems[0]
    : serializedProblems;

  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue) as HomeworkProblem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((problem) => ({
          ...problem,
          selectedMode: problem.selectedMode ?? null,
        }));
      }
    } catch {
      // Fall through to the single-problem fallback.
    }
  }

  if (fallbackProblemText?.trim()) {
    return [createHomeworkProblem(fallbackProblemText, { source: 'manual' })];
  }

  return [];
}

export function withProblemStatus(
  problems: HomeworkProblem[],
  currentProblemIndex: number
): HomeworkProblem[] {
  return problems.map((problem, index) => ({
    ...problem,
    status:
      index < currentProblemIndex
        ? 'completed'
        : index === currentProblemIndex
        ? 'active'
        : 'pending',
  }));
}

export function withProblemMode(
  problems: HomeworkProblem[],
  problemId: string,
  mode: HomeworkMode | undefined
): HomeworkProblem[] {
  return problems.map((problem) =>
    problem.id === problemId
      ? { ...problem, selectedMode: mode ?? null }
      : problem
  );
}

export function buildHomeworkSessionMetadata(
  problems: HomeworkProblem[],
  currentProblemIndex: number,
  ocrText?: string,
  source?: HomeworkCaptureSource
): HomeworkSessionMetadata {
  return {
    problemCount: problems.length,
    currentProblemIndex,
    problems: withProblemStatus(problems, currentProblemIndex),
    ...(ocrText?.trim() ? { ocrText: ocrText.trim() } : {}),
    ...(source ? { source } : {}),
  };
}
