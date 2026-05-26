import type { HomeworkCaptureSource, HomeworkProblem } from '@eduagent/schemas';

import { parseHomeworkProblems } from '../../../../components/homework/problem-cards';
import { homeHrefForReturnTo } from '../../../../lib/navigation';
import { firstParam } from '../../../../lib/route-params';

export interface RawSessionRouteParams {
  mode?: string | string[];
  subjectId?: string | string[];
  problemText?: string | string[];
  homeworkProblems?: string | string[];
  ocrText?: string | string[];
  captureSource?: string | string[];
  gaps?: string | string[];
  returnTo?: string | string[];
  returnId?: string | string[];
  imageUri?: string | string[];
  imageMimeType?: string | string[];
}

export interface SessionRouteParams {
  effectiveMode: string;
  imageUri: string | undefined;
  imageMimeType: string | undefined;
  returnTo: string | undefined;
  returnId: string | undefined;
  gaps: string[] | undefined;
  normalizedOcrText: string | undefined;
  homeworkCaptureSource: HomeworkCaptureSource | undefined;
  initialHomeworkProblems: HomeworkProblem[];
  initialProblemText: string | undefined;
  homeBackHref: ReturnType<typeof homeHrefForReturnTo>;
  chatBackFallback: string | undefined;
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
  const effectiveMode = firstParam(rawParams.mode) ?? 'freeform';
  const problemText = firstParam(rawParams.problemText);
  const homeBackHref = homeHrefForReturnTo(returnTo, returnId);
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
    gaps: parseGaps(rawParams.gaps),
    normalizedOcrText: firstParam(rawParams.ocrText),
    homeworkCaptureSource: normalizeHomeworkCaptureSource(
      rawParams.captureSource,
    ),
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
  };
}
