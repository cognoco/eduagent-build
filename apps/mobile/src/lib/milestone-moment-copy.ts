import type { TFunction } from 'i18next';

function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function renderMilestoneMomentText(
  params: Record<string, unknown>,
  t: TFunction,
): string {
  const milestoneType = stringParam(params, 'milestoneType');
  const threshold = numberParam(params, 'threshold');
  if (!milestoneType || threshold == null) {
    return t('journal.moments.generic', params);
  }

  switch (milestoneType) {
    case 'vocabulary_count':
      return t('milestoneCard.wordCount', { count: threshold });
    case 'topic_mastered_count':
      return t('milestoneCard.topicCount', { count: threshold });
    case 'session_count':
      return t('milestoneCard.sessionCount', { count: threshold });
    case 'learning_time':
      return t('milestoneCard.hourCount', { count: threshold });
    default:
      return t('journal.moments.generic', params);
  }
}
