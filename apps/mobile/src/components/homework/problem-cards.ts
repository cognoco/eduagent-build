import type {
  HomeworkCaptureSource,
  HomeworkMode,
  HomeworkProblem,
  HomeworkSessionMetadata,
} from '@eduagent/schemas';

let homeworkProblemCounter = 0;

const NUMBERED_PROBLEM_PATTERN = /^\s*(?:\d+|[A-Z])[.)]\s+/;

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

export function splitHomeworkProblems(rawText: string): HomeworkProblem[] {
  const normalizedText = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) {
    return [];
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

  if (groups.length <= 1) {
    return [
      createHomeworkProblem(normalizedText, {
        source: 'ocr',
        originalText: normalizedText,
      }),
    ];
  }

  return groups.map((group) =>
    createHomeworkProblem(group, {
      source: 'ocr',
      originalText: group,
    })
  );
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
