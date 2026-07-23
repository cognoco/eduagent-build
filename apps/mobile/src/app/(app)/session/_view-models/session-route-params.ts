import type { HomeworkCaptureSource, HomeworkProblem } from '@eduagent/schemas';

import { parseHomeworkProblems } from '../../../../components/homework/problem-cards';
import { firstParam } from '../../../../lib/route-params';
import {
  homeworkReturnHrefForReturnTo,
  normalizeHomeworkEntrySource,
  type HomeworkEntrySource,
} from '../../homework/_view-models/homework-session-params';

export interface RawSessionRouteParams {
  mode?: string | string[];
  subjectId?: string | string[];
  problemText?: string | string[];
  homeworkProblems?: string | string[];
  ocrText?: string | string[];
  captureSource?: string | string[];
  entrySource?: string | string[];
  gaps?: string | string[];
  returnTo?: string | string[];
  returnId?: string | string[];
  returnStrategy?: string | string[];
  imageUri?: string | string[];
  imageMimeType?: string | string[];
}

export interface SessionRouteParams {
  effectiveMode: string;
  imageUri: string | undefined;
  imageMimeType: string | undefined;
  returnTo: string | undefined;
  returnId: string | undefined;
  returnStrategy: 'history' | undefined;
  gaps: string[] | undefined;
  normalizedOcrText: string | undefined;
  homeworkCaptureSource: HomeworkCaptureSource | undefined;
  homeworkEntrySource: HomeworkEntrySource | undefined;
  initialHomeworkProblems: HomeworkProblem[];
  initialProblemText: string | undefined;
  homeBackHref: ReturnType<typeof homeworkReturnHrefForReturnTo>;
  chatBackFallback: string | undefined;
  mentorHomeworkWrapUpFrame: 'mentor-homework' | undefined;
}

function parseGaps(
  rawGaps: string | string[] | undefined,
): string[] | undefined {
  const raw = firstParam(rawGaps);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((gap) => String(gap).trim())
      .filter((gap) => gap.length > 0)
      .slice(0, 8);
  } catch {
    return undefined;
  }
}

function normalizeHomeworkCaptureSource(
  captureSource: string | string[] | undefined,
): HomeworkCaptureSource | undefined {
  const normalizedCaptureSource = firstParam(captureSource);
  return normalizedCaptureSource === 'camera' ||
    normalizedCaptureSource === 'gallery'
    ? normalizedCaptureSource
    : undefined;
}

export function getSessionRouteParams(
  rawParams: RawSessionRouteParams,
): SessionRouteParams {
  const subjectId = firstParam(rawParams.subjectId);
  const returnTo = firstParam(rawParams.returnTo);
  const returnId = firstParam(rawParams.returnId);
  const returnStrategy =
    firstParam(rawParams.returnStrategy) === 'history' ? 'history' : undefined;
  const effectiveMode = firstParam(rawParams.mode) ?? 'freeform';
  const problemText = firstParam(rawParams.problemText);
  const homeBackHref = homeworkReturnHrefForReturnTo(returnTo, returnId);
  const homeworkEntrySource = normalizeHomeworkEntrySource(
    rawParams.entrySource,
  );
  const initialHomeworkProblems =
    effectiveMode === 'homework'
      ? parseHomeworkProblems(rawParams.homeworkProblems, problemText)
      : [];

  return {
    effectiveMode,
    imageUri: firstParam(rawParams.imageUri),
    imageMimeType: firstParam(rawParams.imageMimeType),
    returnTo,
    returnId,
    returnStrategy,
    gaps: parseGaps(rawParams.gaps),
    normalizedOcrText: firstParam(rawParams.ocrText),
    homeworkCaptureSource: normalizeHomeworkCaptureSource(
      rawParams.captureSource,
    ),
    homeworkEntrySource,
    initialHomeworkProblems,
    initialProblemText: initialHomeworkProblems[0]?.text ?? problemText,
    homeBackHref,
    chatBackFallback: returnTo
      ? typeof homeBackHref === 'string'
        ? homeBackHref
        : undefined
      : subjectId
        ? `/(app)/shelf/${subjectId}`
        : undefined,
    mentorHomeworkWrapUpFrame:
      effectiveMode === 'homework' &&
      homeworkEntrySource === 'mentor' &&
      returnTo === 'mentor'
        ? 'mentor-homework'
        : undefined,
  };
}
