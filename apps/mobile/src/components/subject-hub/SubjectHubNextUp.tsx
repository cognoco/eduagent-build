import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { TranslateKey } from '../../i18n';
import type { HubNextUp } from './_view-models/subject-hub-state';

interface SubjectHubNextUpProps {
  nextUp: HubNextUp;
  canStudy: boolean;
  onPressNextUp?: (nextUp: HubNextUp) => void;
}

const NEXT_UP_ACTION_KEY: Record<
  Exclude<HubNextUp['kind'], 'none'>,
  TranslateKey
> = {
  resume: 'subjectHub.nextUp.resume',
  'up-next': 'subjectHub.nextUp.upNext',
  'review-due': 'subjectHub.nextUp.review',
};

export function SubjectHubNextUp({
  nextUp,
  canStudy,
  onPressNextUp,
}: SubjectHubNextUpProps): React.ReactElement {
  const { t } = useTranslation();
  const actionKey =
    nextUp.kind === 'none' ? null : NEXT_UP_ACTION_KEY[nextUp.kind];

  return (
    <View
      className="mt-5 rounded-card bg-surface p-4"
      testID="subject-hub-next-up"
    >
      <Text className="text-caption font-semibold uppercase text-text-secondary">
        {t('subjectHub.nextUp.heading')}
      </Text>
      <Text className="mt-2 text-body font-semibold text-text-primary">
        {nextUp.topicTitle ?? t('subjectHub.nextUp.allCaughtUp')}
      </Text>

      {!canStudy && nextUp.kind !== 'none' ? (
        <Text className="mt-2 text-body-sm text-text-secondary">
          {t('subjectHub.nextUp.structuralOnly')}
        </Text>
      ) : null}

      {canStudy && actionKey ? (
        <Pressable
          testID="subject-hub-next-up-action"
          accessibilityRole="button"
          accessibilityLabel={t(actionKey)}
          className="mt-4 self-start rounded-full bg-primary px-4 py-2"
          onPress={() => onPressNextUp?.(nextUp)}
        >
          <Text
            className="text-body-sm font-semibold text-text-inverse"
            testID="subject-hub-next-up-primary"
          >
            {t(actionKey)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
