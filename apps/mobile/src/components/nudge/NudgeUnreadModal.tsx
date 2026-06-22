import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Nudge } from '@eduagent/schemas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NudgeUnreadModalProps {
  nudges: ReadonlyArray<Nudge>;
  onDismiss: () => void;
  errorMessage?: string | null;
  isDismissing?: boolean;
}

export function NudgeUnreadModal({
  nudges,
  onDismiss,
  errorMessage,
  isDismissing = false,
}: NudgeUnreadModalProps): React.ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="bg-surface rounded-t-3xl px-5 pt-5"
          style={{ paddingBottom: insets.bottom + 8 }}
          testID="nudge-unread-sheet"
        >
          <Text className="text-h3 font-bold text-text-primary mb-3">
            {t('nudge.banner.modalTitle')}
          </Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {nudges.map((nudge) => (
              <View
                key={nudge.id}
                className="bg-surface-elevated rounded-card px-4 py-3 mb-2"
              >
                <Text className="text-caption text-text-secondary">
                  {nudge.fromDisplayName}
                </Text>
                <Text className="text-body font-semibold text-text-primary mt-1">
                  {t(`nudge.templates.${nudge.template}`)}
                </Text>
              </View>
            ))}
          </ScrollView>
          {errorMessage ? (
            <View
              className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3 mt-3"
              accessibilityRole="alert"
              testID="nudge-unread-dismiss-error"
            >
              <Text className="text-body-sm text-danger">{errorMessage}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={onDismiss}
            disabled={isDismissing}
            className="bg-primary rounded-button min-h-[48px] items-center justify-center mt-3"
            accessibilityRole="button"
            accessibilityLabel={
              errorMessage ? t('common.tryAgain') : t('common.done')
            }
            accessibilityState={{ disabled: isDismissing }}
            testID="nudge-unread-dismiss"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {isDismissing
                ? t('common.loading')
                : errorMessage
                  ? t('common.tryAgain')
                  : t('common.done')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
