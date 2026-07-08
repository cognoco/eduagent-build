import type { ActiveProfileRole } from '../../../../hooks/use-active-profile-role';
import type { Translate } from '../../../../i18n';

type CopyRegister = Extract<ActiveProfileRole, 'owner' | 'child'>;

export function heroCopy(
  input: {
    topicsMastered: number;
    vocabularyTotal: number;
    totalSessions: number;
  },
  register: CopyRegister,
  t: Translate,
): {
  title: string;
  subtitle: string;
} {
  const { topicsMastered, vocabularyTotal, totalSessions } = input;

  if (register === 'child' && topicsMastered > 0) {
    return {
      title: t('progress.register.child.masteredTopicsHero', {
        count: topicsMastered,
      }),
      subtitle:
        vocabularyTotal > 0
          ? t('progress.hero.masteredTopicsAndWords', {
              words: vocabularyTotal,
            })
          : t('progress.register.child.growthSubtitle'),
    };
  }

  // [F-043] Lead with session effort when mastery numbers are still low.
  // Prevents "1 words and counting" for a user with 28 sessions.
  const zeroMastery = topicsMastered === 0 && vocabularyTotal === 0;
  const lowMastery = topicsMastered < 5 && vocabularyTotal < 5;
  if (
    totalSessions > 0 &&
    (zeroMastery || (totalSessions >= 5 && lowMastery))
  ) {
    return {
      title: t('progress.hero.sessionsCompleted', { count: totalSessions }),
      subtitle: t('progress.hero.sessionsCompletedSubtitle'),
    };
  }

  if (vocabularyTotal > 0 && topicsMastered === 0) {
    return vocabularyTotal < 20
      ? {
          title: t('progress.hero.buildingLanguage'),
          subtitle: t('progress.hero.buildingLanguageSubtitle', {
            count: vocabularyTotal,
          }),
        }
      : {
          title: t('progress.hero.knowWords', { count: vocabularyTotal }),
          subtitle: t('progress.hero.knowWordsSubtitle'),
        };
  }

  if (topicsMastered > 0 && vocabularyTotal === 0) {
    return topicsMastered < 20
      ? {
          title: t('progress.hero.buildingKnowledge'),
          subtitle: t('progress.hero.buildingKnowledgeSubtitle', {
            count: topicsMastered,
          }),
        }
      : {
          title: t('progress.hero.masteredTopics', { count: topicsMastered }),
          subtitle: t('progress.hero.masteredTopicsSubtitle'),
        };
  }

  return {
    title: t('progress.hero.masteredTopics', { count: topicsMastered }),
    subtitle: t('progress.hero.masteredTopicsAndWords', {
      words: vocabularyTotal,
    }),
  };
}
