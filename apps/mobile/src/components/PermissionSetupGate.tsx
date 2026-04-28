import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../lib/theme';
import type { PermState } from '../hooks/use-permission-setup';

type RowKind = 'mic' | 'notif';
type RowState =
  | { kind: 'granted' }
  | { kind: 'blocked' } // previously denied; OS forbids re-asking — only Settings works
  | { kind: 'askable'; checked: boolean };

function rowState(
  status: 'unknown' | 'granted' | 'denied',
  canAskAgain: boolean,
  intentChecked: boolean
): RowState {
  if (status === 'granted') return { kind: 'granted' };
  if (!canAskAgain) return { kind: 'blocked' };
  return { kind: 'askable', checked: intentChecked };
}

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

  // Default-on intent: rows start checked so the user can opt *out* rather
  // than opt in. We only translate intent into an OS prompt when Continue
  // is pressed.
  const [intentMic, setIntentMic] = useState(true);
  const [intentNotif, setIntentNotif] = useState(true);

  const micRow = rowState(permState.mic, permState.micCanAskAgain, intentMic);
  const notifRow = rowState(
    permState.notif,
    permState.notifCanAskAgain,
    intentNotif
  );

  const handleRowPress = useCallback((kind: RowKind, state: RowState) => {
    if (state.kind === 'granted') return;
    if (state.kind === 'blocked') {
      void Linking.openSettings();
      return;
    }
    if (kind === 'mic') setIntentMic((v) => !v);
    else setIntentNotif((v) => !v);
  }, []);

  const handleContinue = useCallback(async () => {
    // Sequentially fire the OS prompts for rows the user has left checked.
    // Sequential (not parallel) so dialogs don't stack and confuse the user.
    const askMic =
      intentMic &&
      permState.mic !== 'granted' &&
      permState.micAvailable &&
      permState.micCanAskAgain;
    const askNotif =
      intentNotif &&
      permState.notif !== 'granted' &&
      permState.notifCanAskAgain;

    if (askMic) await onRequestMic();
    if (askNotif) await onRequestNotif();
    onContinue();
  }, [
    intentMic,
    intentNotif,
    permState.mic,
    permState.notif,
    permState.micAvailable,
    permState.micCanAskAgain,
    permState.notifCanAskAgain,
    onContinue,
    onRequestMic,
    onRequestNotif,
  ]);

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
          These help your tutor work best. Uncheck anything you&apos;d rather
          not allow.
        </Text>

        {permState.micAvailable && (
          <PermissionRow
            testID="permission-row-mic"
            title="Microphone"
            why="Voice is how you talk with your tutor."
            iconOn="mic"
            iconOff="mic-outline"
            state={micRow}
            colors={colors}
            onPress={() => handleRowPress('mic', micRow)}
          />
        )}

        <PermissionRow
          testID="permission-row-notif"
          title="Notifications"
          why="Daily reminders and progress updates."
          iconOn="notifications"
          iconOff="notifications-outline"
          state={notifRow}
          colors={colors}
          onPress={() => handleRowPress('notif', notifRow)}
        />
      </View>

      <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <Pressable
          testID="permission-continue"
          onPress={() => void handleContinue()}
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

function PermissionRow({
  testID,
  title,
  why,
  iconOn,
  iconOff,
  state,
  colors,
  onPress,
}: {
  testID: string;
  title: string;
  why: string;
  iconOn: keyof typeof Ionicons.glyphMap;
  iconOff: keyof typeof Ionicons.glyphMap;
  state: RowState;
  colors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}): React.ReactElement {
  const isGranted = state.kind === 'granted';
  const isBlocked = state.kind === 'blocked';
  const isChecked = state.kind === 'askable' && state.checked;

  // Active = will result in the permission being on after Continue.
  // Granted ✓ and askable+checked both qualify; blocked and askable+unchecked don't.
  const isActive = isGranted || isChecked;

  const accessibilityLabel = isGranted
    ? `${title} enabled`
    : isBlocked
    ? `${title} blocked — tap to open phone Settings`
    : isChecked
    ? `${title} on — tap to turn off`
    : `${title} off — tap to turn on`;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isGranted}
      className="flex-row items-center bg-surface rounded-xl px-4 py-4 mb-3"
      accessibilityRole={isGranted ? 'text' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        checked: isActive,
        disabled: isGranted,
      }}
    >
      <Ionicons
        name={isActive ? iconOn : iconOff}
        size={24}
        color={isActive ? colors.accent : colors.textPrimary}
      />
      <View className="flex-1 ml-3">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        <Text className="text-caption text-text-secondary">
          {isBlocked ? `Blocked — tap to open Settings. ${why}` : why}
        </Text>
      </View>
      <RowAffordance state={state} colors={colors} testID={`${testID}-state`} />
    </Pressable>
  );
}

function RowAffordance({
  state,
  colors,
  testID,
}: {
  state: RowState;
  colors: ReturnType<typeof useThemeColors>;
  testID: string;
}): React.ReactElement {
  if (state.kind === 'granted') {
    return (
      <Ionicons
        name="checkmark-circle"
        size={24}
        color={colors.accent}
        testID={`${testID}-granted`}
      />
    );
  }
  if (state.kind === 'blocked') {
    return (
      <Ionicons
        name="open-outline"
        size={22}
        color={colors.textSecondary}
        testID={`${testID}-blocked`}
      />
    );
  }
  // askable: render a checkbox-style affordance
  return (
    <Ionicons
      name={state.checked ? 'checkbox' : 'square-outline'}
      size={24}
      color={state.checked ? colors.accent : colors.textSecondary}
      testID={`${testID}-${state.checked ? 'checked' : 'unchecked'}`}
    />
  );
}
