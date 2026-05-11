import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NudgeTemplate } from '@eduagent/schemas';

import { useSendNudge } from '../../hooks/use-nudges';
import {
  ConsentRequiredError,
  NetworkError,
  RateLimitedError,
} from '../../lib/api-errors';
import { platformAlert } from '../../lib/platform-alert';
import { Sentry } from '../../lib/sentry';
import { useThemeColors } from '../../lib/theme';

const TEMPLATES: readonly NudgeTemplate[] = [
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you',
];

type InlineError = 'rate' | 'consent' | 'network' | 'unknown';

interface NudgeActionSheetProps {
  childName: string;
  childProfileId: string;
  onClose: () => void;
}

export function NudgeActionSheet({
  childName,
  childProfileId,
  onClose,
}: NudgeActionSheetProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const sendNudge = useSendNudge();
  const [pendingTemplate, setPendingTemplate] = useState<NudgeTemplate | null>(
    null,
  );
  const [inlineError, setInlineError] = useState<InlineError | null>(null);

  const handleTemplatePress = async (
    template: NudgeTemplate,
  ): Promise<void> => {
    setPendingTemplate(template);
    setInlineError(null);

    try {
      await sendNudge.mutateAsync({ toProfileId: childProfileId, template });
      platformAlert(t('nudge.toast.sent'));
      onClose();
    } catch (err) {
      if (err instanceof RateLimitedError) {
        setInlineError('rate');
      } else if (err instanceof ConsentRequiredError) {
        setInlineError('consent');
      } else if (err instanceof NetworkError) {
        setInlineError('network');
      } else {
        Sentry.captureException(err, {
          tags: { component: 'NudgeActionSheet' },
        });
        setInlineError('unknown');
      }
    } finally {
      setPendingTemplate(null);
    }
  };

  const errorCopy =
    inlineError === 'rate'
      ? t('nudge.error.rateLimit', { childName })
      : inlineError === 'consent'
        ? t('nudge.error.consentPending', { childName })
        : inlineError === 'network'
          ? t('errors.networkError')
          : inlineError === 'unknown'
            ? t('errors.generic')
            : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-surface rounded-t-3xl px-5 pt-5 pb-8">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1 pr-3">
              <Text className="text-h3 font-bold text-text-primary">
                {t('nudge.sheet.title', { childName })}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {t('nudge.sheet.subtitle')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="h-10 w-10 rounded-full bg-surface-elevated items-center justify-center"
              testID="nudge-action-sheet-close"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            {TEMPLATES.map((template) => {
              const isPending = pendingTemplate === template;
              return (
                <Pressable
                  key={template}
                  onPress={() => {
                    void handleTemplatePress(template);
                  }}
                  disabled={pendingTemplate !== null}
                  accessibilityRole="button"
                  className="min-h-[52px] rounded-card bg-surface-elevated px-4 py-3 flex-row items-center justify-between"
                  testID={`nudge-template-${template}`}
                >
                  <Text className="text-body font-semibold text-text-primary flex-1 pr-3">
                    {t(`nudge.templates.${template}`)}
                  </Text>
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

          <Pressable
            onPress={onClose}
            disabled={pendingTemplate !== null}
            accessibilityRole="button"
            className="min-h-[48px] items-center justify-center mt-3"
            testID="nudge-action-sheet-cancel"
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
