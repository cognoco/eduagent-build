import type { ComponentProps, ReactElement } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { learnerToGuardianNudgeTemplates } from '@eduagent/schemas';

import { useSendNudge } from '../../hooks/use-nudges';
import {
  ConsentRequiredError,
  ForbiddenError,
  NetworkError,
  RateLimitedError,
} from '../../lib/api-errors';
import { platformAlert } from '../../lib/platform-alert';
import { Sentry } from '../../lib/sentry';
import { useThemeColors } from '../../lib/theme';

type LearnerGuardianTemplate = (typeof learnerToGuardianNudgeTemplates)[number];
type InlineError = 'rate' | 'consent' | 'forbidden' | 'network' | 'unknown';

const TEMPLATE_ICONS: Record<
  LearnerGuardianTemplate,
  ComponentProps<typeof Ionicons>['name']
> = {
  thanks: 'happy-outline',
  need_help: 'help-circle-outline',
  proud_moment: 'sparkles-outline',
};

interface LearnerGuardianNudgeCardProps {
  guardianName: string;
  guardianProfileId: string;
}

export function LearnerGuardianNudgeCard({
  guardianName,
  guardianProfileId,
}: LearnerGuardianNudgeCardProps): ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const sendNudge = useSendNudge();
  const [pendingTemplate, setPendingTemplate] =
    useState<LearnerGuardianTemplate | null>(null);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

  const handleTemplatePress = async (
    template: LearnerGuardianTemplate,
  ): Promise<void> => {
    setPendingTemplate(template);
    setInlineError(null);

    try {
      await sendNudge.mutateAsync({
        toProfileId: guardianProfileId,
        direction: 'learner_to_guardian',
        template,
      });
      platformAlert(t('nudge.learnerSignal.toast'));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        setInlineError('rate');
      } else if (err instanceof ConsentRequiredError) {
        setInlineError('consent');
      } else if (err instanceof ForbiddenError) {
        setInlineError('forbidden');
      } else if (err instanceof NetworkError) {
        setInlineError('network');
      } else {
        Sentry.captureException(err, {
          tags: { component: 'LearnerGuardianNudgeCard' },
        });
        setInlineError('unknown');
      }
    } finally {
      setPendingTemplate(null);
    }
  };

  const errorCopy =
    inlineError === 'rate'
      ? t('nudge.learnerSignal.error.rateLimit')
      : inlineError === 'consent'
        ? t('nudge.learnerSignal.error.consentPending')
        : inlineError === 'forbidden'
          ? t('nudge.learnerSignal.error.forbidden')
          : inlineError === 'network'
            ? t('errors.networkError')
            : inlineError === 'unknown'
              ? t('errors.generic')
              : null;

  return (
    <View
      className="mx-5 mt-4 rounded-card border border-primary/20 bg-surface px-4 py-4"
      testID="learner-guardian-nudge-card"
    >
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-full bg-primary-soft items-center justify-center me-3"
          accessibilityElementsHidden
        >
          <Ionicons name="heart-outline" size={21} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-bold text-text-primary">
            {t('nudge.learnerSignal.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('nudge.learnerSignal.subtitle', { guardianName })}
          </Text>
        </View>
      </View>

      <View className="mt-3" style={{ gap: 8 }}>
        {learnerToGuardianNudgeTemplates.map((template) => {
          const isPending = pendingTemplate === template;
          return (
            <Pressable
              key={template}
              onPress={() => {
                void handleTemplatePress(template);
              }}
              disabled={pendingTemplate !== null}
              className="min-h-[48px] rounded-button bg-surface-elevated px-4 py-3 flex-row items-center justify-between"
              accessibilityRole="button"
              accessibilityLabel={t(`nudge.templates.${template}`)}
              testID={`learner-guardian-nudge-template-${template}`}
            >
              <View className="flex-row items-center flex-1 pe-3">
                <Ionicons
                  name={TEMPLATE_ICONS[template]}
                  size={18}
                  color={colors.textSecondary}
                />
                <Text className="text-body-sm font-semibold text-text-primary ms-2 flex-1">
                  {t(`nudge.templates.${template}`)}
                </Text>
              </View>
              {isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="send-outline"
                  size={18}
                  color={colors.textSecondary}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {errorCopy ? (
        <View className="rounded-card bg-danger-soft px-4 py-3 mt-3">
          <Text className="text-body-sm font-semibold text-danger">
            {errorCopy}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
