import React, { useCallback } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../lib/theme';
import type { PermState } from '../hooks/use-permission-setup';

export function PermissionSetupGate({
  permState,
  onRequestMic,
  onRequestNotif,
  onContinue,
}: {
  permState: PermState;
  onRequestMic: () => Promise<void>;
  onRequestNotif: () => Promise<void>;
  onContinue: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const handleMicPress = useCallback(async () => {
    if (permState.mic === 'granted') return;
    if (!permState.micCanAskAgain) {
      void Linking.openSettings();
      return;
    }
    await onRequestMic();
  }, [onRequestMic, permState.mic, permState.micCanAskAgain]);

  const handleNotifPress = useCallback(async () => {
    if (permState.notif === 'granted') return;
    if (!permState.notifCanAskAgain) {
      void Linking.openSettings();
      return;
    }
    await onRequestNotif();
  }, [onRequestNotif, permState.notif, permState.notifCanAskAgain]);

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="permission-setup-gate"
    >
      <View className="flex-1 justify-center">
        <Text
          className="text-h1 font-bold text-text-primary mb-2 text-center"
          accessibilityRole="header"
        >
          Let&apos;s get you set up
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          These help your tutor work best.
        </Text>

        {permState.micAvailable && (
          <Pressable
            testID="permission-row-mic"
            onPress={() => void handleMicPress()}
            className="flex-row items-center bg-surface rounded-xl px-4 py-4 mb-3"
            accessibilityRole="button"
            accessibilityLabel={
              permState.mic === 'granted'
                ? 'Microphone enabled'
                : 'Enable microphone'
            }
          >
            <Ionicons
              name={permState.mic === 'granted' ? 'mic' : 'mic-outline'}
              size={24}
              color={
                permState.mic === 'granted' ? colors.accent : colors.textPrimary
              }
            />
            <View className="flex-1 ml-3">
              <Text className="text-body font-semibold text-text-primary">
                Microphone
              </Text>
              <Text className="text-caption text-text-secondary">
                {permState.mic !== 'granted' && !permState.micCanAskAgain
                  ? 'Tap to open Settings'
                  : "Voice is how you'll chat with your tutor"}
              </Text>
            </View>
            {permState.mic === 'granted' && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.accent}
                testID="mic-granted-check"
              />
            )}
          </Pressable>
        )}

        <Pressable
          testID="permission-row-notif"
          onPress={() => void handleNotifPress()}
          className="flex-row items-center bg-surface rounded-xl px-4 py-4 mb-8"
          accessibilityRole="button"
          accessibilityLabel={
            permState.notif === 'granted'
              ? 'Notifications enabled'
              : 'Enable notifications'
          }
        >
          <Ionicons
            name={
              permState.notif === 'granted'
                ? 'notifications'
                : 'notifications-outline'
            }
            size={24}
            color={
              permState.notif === 'granted' ? colors.accent : colors.textPrimary
            }
          />
          <View className="flex-1 ml-3">
            <Text className="text-body font-semibold text-text-primary">
              Notifications
            </Text>
            <Text className="text-caption text-text-secondary">
              {permState.notif !== 'granted' && !permState.notifCanAskAgain
                ? 'Tap to open Settings'
                : 'Get reminders and progress updates'}
            </Text>
          </View>
          {permState.notif === 'granted' && (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={colors.accent}
              testID="notif-granted-check"
            />
          )}
        </Pressable>
      </View>

      <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <Pressable
          testID="permission-continue"
          onPress={onContinue}
          className="bg-primary rounded-button py-3.5 items-center w-full mb-3"
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Continue
          </Text>
        </Pressable>

        <Pressable
          testID="permission-skip"
          onPress={onContinue}
          className="py-3 items-center w-full"
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text className="text-body text-text-secondary">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}
