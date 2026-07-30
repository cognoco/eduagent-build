import type { ReportableFact, SharedRecordView } from '@eduagent/schemas';

import type { Translate } from '../../i18n';
import { formatShortDate } from '../../lib/format-datetime';

type FactCopy = Pick<ReportableFact, 'title' | 'detail'>;

function metadataRecord(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function legacyCopy(fact: ReportableFact): FactCopy {
  return { title: fact.title, detail: fact.detail };
}

function weeklyDetail(
  metricKey: string,
  value: number,
  t: Translate,
): string | undefined {
  switch (metricKey) {
    case 'topicsMastered':
      return t('sharedRecord.fact.weeklyReport.topicsMastered', {
        count: value,
      });
    case 'wordsLearned':
      return t('sharedRecord.fact.weeklyReport.wordsLearned', { count: value });
    case 'topicsExplored':
      return t('sharedRecord.fact.weeklyReport.topicsExplored', {
        count: value,
      });
    default:
      return undefined;
  }
}

function milestoneDetail(
  milestoneType: string,
  threshold: number,
  subjectName: string | undefined,
  t: Translate,
): string | undefined {
  switch (milestoneType) {
    case 'vocabulary_count':
      return t('sharedRecord.fact.milestone.vocabularyCount', {
        count: threshold,
      });
    case 'topic_mastered_count':
      return t('sharedRecord.fact.milestone.topicMasteredCount', {
        count: threshold,
      });
    case 'session_count':
      return t('sharedRecord.fact.milestone.sessionCount', {
        count: threshold,
      });
    case 'streak_length':
      return t('sharedRecord.fact.milestone.streakLength', {
        count: threshold,
      });
    case 'subject_mastered':
      return subjectName
        ? t('sharedRecord.fact.milestone.subjectMastered', {
            subject: subjectName,
          })
        : undefined;
    case 'book_completed':
      return t('sharedRecord.fact.milestone.bookCompleted');
    case 'learning_time':
      return t('sharedRecord.fact.milestone.learningTime', {
        count: threshold,
      });
    case 'cefr_level_up':
      return t('sharedRecord.fact.milestone.cefrLevelUp');
    case 'topics_explored':
      return subjectName
        ? t('sharedRecord.fact.milestone.topicsExplored', {
            count: threshold,
            subject: subjectName,
          })
        : undefined;
    default:
      return undefined;
  }
}

export function renderSharedRecordFact(
  fact: ReportableFact,
  t: Translate,
  locale?: string,
): FactCopy {
  const metadata = metadataRecord(fact.metadata);
  const templateKey = metadata?.templateKey;

  if (templateKey === 'weeklyReport') {
    const stats = metadata?.stats;
    const stat = Array.isArray(stats) ? metadataRecord(stats[0]) : undefined;
    const metricKey = nonEmptyString(stat?.metricKey);
    const value = finiteNumber(stat?.value);
    const detail =
      metricKey && value !== undefined
        ? weeklyDetail(metricKey, value, t)
        : undefined;
    if (detail) {
      return {
        title: t('sharedRecord.fact.weeklyReport.title'),
        detail,
      };
    }
  }

  if (templateKey === 'sessionRecap') {
    const sessionDate = nonEmptyString(metadata?.sessionDate);
    if (sessionDate) {
      return {
        title: t('sharedRecord.fact.sessionRecap.title'),
        detail: t('sharedRecord.fact.sessionRecap.detail', {
          date: formatShortDate(sessionDate, locale, {
            month: 'long',
            day: 'numeric',
          }),
        }),
      };
    }
  }

  if (templateKey === 'milestone') {
    const milestoneType = nonEmptyString(metadata?.milestoneType);
    const threshold = finiteNumber(metadata?.threshold);
    const detail =
      milestoneType && threshold !== undefined
        ? milestoneDetail(
            milestoneType,
            threshold,
            nonEmptyString(metadata?.subjectName),
            t,
          )
        : undefined;
    if (detail) {
      return {
        title: t('sharedRecord.fact.milestone.title'),
        detail,
      };
    }
  }

  return legacyCopy(fact);
}

export function renderSharedRecordHeadline(
  view: SharedRecordView,
  t: Translate,
  supporteeName?: string,
): string {
  if (!supporteeName?.trim()) {
    return view.headline;
  }

  if (view.facts.some((fact) => metadataRecord(fact.metadata)?.templateKey)) {
    return t('sharedRecord.fact.headline', {
      name: supporteeName,
      count: view.facts.length,
    });
  }
  return view.headline;
}
