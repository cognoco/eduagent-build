import type { HomeworkCaptureSource, HomeworkProblem } from '@eduagent/schemas';

import { serializeHomeworkProblems } from '../../../../components/homework/problem-cards';

export const HOMEWORK_SESSION_PARAM_BUDGET = 8000;

export interface HomeworkSessionParams extends Record<
  string,
  string | undefined
> {
  mode: 'homework';
  subjectId: string;
  subjectName: string;
  problemText: string;
  homeworkProblems?: string;
  ocrText?: string;
  imageUri?: string;
  imageMimeType?: string;
  captureSource?: HomeworkCaptureSource;
  returnTo?: string;
}

export interface HomeworkProblemTruncation {
  inputProblemCount: number;
  savedProblemCount: number;
  droppedProblemCount: number;
  singleProblemTruncated: boolean;
  maxParamLength: number;
}

export function buildHomeworkSessionParams(args: {
  subjectId: string;
  subjectName: string;
  problemText: string;
  problems?: readonly HomeworkProblem[];
  imageUri?: string;
  sourceOcrText?: string;
  captureSource?: HomeworkCaptureSource;
  imageMimeType?: string | null;
  returnTo?: string;
  maxParamLength?: number;
}): {
  params: HomeworkSessionParams;
  truncation: HomeworkProblemTruncation | null;
} {
  const maxParamLength = args.maxParamLength ?? HOMEWORK_SESSION_PARAM_BUDGET;
  const serializedResult = serializeProblemsWithinBudget({
    problems: args.problems,
    maxParamLength,
  });

  return {
    params: {
      mode: 'homework',
      subjectId: args.subjectId,
      subjectName: args.subjectName,
      problemText: args.problemText,
      ...(serializedResult.homeworkProblems !== undefined
        ? { homeworkProblems: serializedResult.homeworkProblems }
        : {}),
      ...(args.sourceOcrText ? { ocrText: args.sourceOcrText } : {}),
      ...(args.imageUri ? { imageUri: args.imageUri } : {}),
      ...(args.imageMimeType ? { imageMimeType: args.imageMimeType } : {}),
      ...(args.captureSource ? { captureSource: args.captureSource } : {}),
      ...(args.returnTo ? { returnTo: args.returnTo } : {}),
    },
    truncation: serializedResult.truncation,
  };
}

export function getHomeworkProblemTruncationAlertMessage(
  truncation: HomeworkProblemTruncation,
  t: TFunction,
): string {
  if (truncation.singleProblemTruncated) {
    if (truncation.droppedProblemCount > 0) {
      return t('homework.truncationSavedAndShortened', {
        saved: truncation.savedProblemCount,
      });
    }

    return t('homework.truncationSingleShortened');
  }

  return t('homework.truncationSavedOnly', {
    saved: truncation.savedProblemCount,
    input: truncation.inputProblemCount,
  });
}

function serializeProblemsWithinBudget(args: {
  problems?: readonly HomeworkProblem[];
  maxParamLength: number;
}): {
  homeworkProblems?: string;
  truncation: HomeworkProblemTruncation | null;
} {
  if (!args.problems || args.problems.length === 0) {
    return { truncation: null };
  }

  let truncatedProblems = [...args.problems];
  let serialized = serializeHomeworkProblems(truncatedProblems);
  while (
    serialized.length > args.maxParamLength &&
    truncatedProblems.length > 1
  ) {
    truncatedProblems = truncatedProblems.slice(0, -1);
    serialized = serializeHomeworkProblems(truncatedProblems);
  }

  const droppedProblemCount = args.problems.length - truncatedProblems.length;
  let singleProblemTruncated = false;

  if (
    serialized.length > args.maxParamLength &&
    truncatedProblems.length === 1
  ) {
    const problem = truncatedProblems[0];
    if (problem) {
      const maxTextLen =
        problem.text.length - (serialized.length - args.maxParamLength) - 30;
      const wordBoundary = problem.text.lastIndexOf(
        ' ',
        Math.max(0, maxTextLen),
      );
      const endIndex = Math.max(
        0,
        wordBoundary > 0 ? wordBoundary : maxTextLen,
      );
      const truncatedText = buildTruncatedProblemText(problem.text, endIndex);
      truncatedProblems = [
        {
          ...problem,
          text: truncatedText,
          originalText: problem.originalText == null ? null : truncatedText,
        },
      ];
      serialized = serializeHomeworkProblems(truncatedProblems);
      while (
        serialized.length > args.maxParamLength &&
        truncatedProblems[0]?.text
      ) {
        const currentText = truncatedProblems[0].text
          .replace(/\s*\[truncated\]$/, '')
          .trimEnd();
        const overflow = serialized.length - args.maxParamLength;
        const nextEndIndex = Math.max(0, currentText.length - overflow - 1);
        const nextText = `${currentText.slice(0, nextEndIndex).trimEnd()} [truncated]`;
        if (nextText === truncatedProblems[0].text) break;
        truncatedProblems = [
          {
            ...truncatedProblems[0],
            text: nextText,
            originalText:
              truncatedProblems[0].originalText == null ? null : nextText,
          },
        ];
        serialized = serializeHomeworkProblems(truncatedProblems);
      }
      singleProblemTruncated = true;
    }
  }

  return {
    homeworkProblems: serialized,
    truncation:
      droppedProblemCount > 0 || singleProblemTruncated
        ? {
            inputProblemCount: args.problems.length,
            savedProblemCount: truncatedProblems.length,
            droppedProblemCount,
            singleProblemTruncated,
            maxParamLength: args.maxParamLength,
          }
        : null,
  };
}

function buildTruncatedProblemText(text: string, maxTextLen: number): string {
  const wordBoundary = text.lastIndexOf(' ', Math.max(0, maxTextLen));
  const endIndex = Math.max(0, wordBoundary > 0 ? wordBoundary : maxTextLen);
  return `${text.slice(0, endIndex)} [truncated]`;
}
