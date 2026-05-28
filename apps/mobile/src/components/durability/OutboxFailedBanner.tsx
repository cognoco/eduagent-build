import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import {
  deletePermanentlyFailed,
  listPermanentlyFailed,
  type OutboxEntry,
  type OutboxFlow,
} from '../../lib/message-outbox';

interface OutboxFailedBannerProps {
  profileId: string;
  flow: OutboxFlow;
  onEscalate?: () => Promise<void>;
}

export function OutboxFailedBanner({
  profileId,
  flow,
  onEscalate,
}: OutboxFailedBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [entries, setEntries] = React.useState<OutboxEntry[]>([]);
  // [#10] Per-entry copy error. When the clipboard write fails we must NOT
  // delete the only copy of the message — instead surface an actionable error
  // and keep the entry so the user can retry.
  const [copyErrorId, setCopyErrorId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const failed = await listPermanentlyFailed(profileId, flow);
    setEntries(failed);
  }, [flow, profileId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <View
      testID="outbox-failed-banner"
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
      className="mx-4 mb-3 rounded-card bg-warning/15 px-4 py-3"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('session.outboxFailed.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('session.outboxFailed.description')}
      </Text>
      {entries.map((entry) => (
        <View key={entry.id} className="mt-3 rounded-card bg-surface px-3 py-2">
          <Text className="text-body-sm text-text-primary">
            {entry.content}
          </Text>
          <Pressable
            testID={`outbox-copy-${entry.id}`}
            className="mt-2 self-start rounded-button bg-surface-elevated px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel={t('session.outboxFailed.copyMessage')}
            onPress={async () => {
              setCopyErrorId(null);
              try {
                // Only delete AFTER a confirmed successful copy — otherwise a
                // rejected clipboard write would destroy the only copy.
                await Clipboard.setStringAsync(entry.content);
              } catch {
                setCopyErrorId(entry.id);
                return;
              }
              await deletePermanentlyFailed(profileId, flow, entry.id);
              await refresh();
            }}
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('session.outboxFailed.copyMessage')}
            </Text>
          </Pressable>
          {copyErrorId === entry.id ? (
            <Text
              testID={`outbox-copy-error-${entry.id}`}
              accessibilityLiveRegion={
                Platform.OS === 'android' ? 'assertive' : undefined
              }
              accessibilityRole="alert"
              className="mt-2 text-body-sm text-danger"
            >
              {t('session.outboxFailed.copyError')}
            </Text>
          ) : null}
        </View>
      ))}
      {onEscalate ? (
        <Pressable
          className="mt-3 self-start rounded-button bg-primary px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel={t('session.outboxFailed.sendToSupport')}
          onPress={() => {
            void onEscalate().then(refresh);
          }}
          testID="outbox-escalate-button"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            {t('session.outboxFailed.sendToSupport')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
