import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Nudge } from '@eduagent/schemas';

interface NudgeUnreadModalProps {
  nudges: ReadonlyArray<Nudge>;
  onDismiss: () => void;
}

export function NudgeUnreadModal({
  nudges,
  onDismiss,
}: NudgeUnreadModalProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-surface rounded-t-3xl px-5 pt-5 pb-8">
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
          <Pressable
            onPress={onDismiss}
            className="bg-primary rounded-button min-h-[48px] items-center justify-center mt-3"
            accessibilityRole="button"
            testID="nudge-unread-dismiss"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.done')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
