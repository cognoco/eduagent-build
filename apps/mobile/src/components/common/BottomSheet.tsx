import type React from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

interface BottomSheetBaseProps {
  /** Controls Modal visibility. */
  visible: boolean;
  /** Called when the user presses the hardware back button (Android) or the
   *  backdrop (when `backdropDismissible` is true). Callers own their own
   *  close trigger — the sheet never self-dismisses. */
  onClose: () => void;
  /** Sheet content. Rendered inside the surface container. Callers own inner
   *  padding (`px-5 pt-5 pb-8`, safe-area insets, etc.). */
  children: React.ReactNode;
  /** testID forwarded to the surface container (the white rounded card). */
  testID?: string;
  /** Accessible name for the dialog surface. */
  accessibilityLabel: string;
  /**
   * Modal animation type. Defaults to 'slide'.
   * Use 'fade' to match legacy NudgeActionSheet / LearnTogetherSheet behaviour.
   */
  animationType?: 'slide' | 'fade' | 'none';
}

type BottomSheetProps = BottomSheetBaseProps &
  (
    | {
        /** Enables dismissal by the semi-transparent backdrop. */
        backdropDismissible: true;
        /** Localized accessible name for the backdrop close action. */
        backdropAccessibilityLabel: string;
      }
    | {
        /** Defaults to false for sheets that require an explicit close action. */
        backdropDismissible?: false;
        backdropAccessibilityLabel?: never;
      }
  );

/**
 * Shared bottom-sheet primitive — WI-1080.
 *
 * Wraps the common Modal + semi-transparent-overlay + rounded-top-surface
 * pattern used by NudgeActionSheet, LearnTogetherSheet, TopicPickerSheet,
 * and TopicDetailSheet. Eliminates the duplicated chrome so each sheet only
 * owns its content.
 *
 * Background color is intentionally NOT applied here — callers own their
 * surface background (`bg-surface`, `bg-background`, etc.) on their content
 * wrapper. The frame provides `rounded-t-3xl overflow-hidden` so the caller's
 * background respects the rounded corners.
 *
 * Audience-agnostic: uses semantic tokens (`bg-black/40`) only.
 * No hardcoded hex values.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  testID,
  accessibilityLabel,
  backdropDismissible = false,
  backdropAccessibilityLabel,
  animationType = 'slide',
}: BottomSheetProps): React.ReactElement {
  const backdrop = backdropDismissible ? (
    <Pressable
      className="absolute inset-0 bg-black/40"
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={backdropAccessibilityLabel}
    />
  ) : (
    <View className="absolute inset-0 bg-black/40" />
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
      accessibilityViewIsModal={Platform.OS !== 'web' ? true : undefined}
      accessibilityLabel={
        Platform.OS === 'web' ? accessibilityLabel : undefined
      }
    >
      <View
        className="flex-1 justify-end"
        accessibilityViewIsModal={Platform.OS === 'ios' ? true : undefined}
        importantForAccessibility={
          Platform.OS === 'android' ? 'yes' : undefined
        }
      >
        {backdrop}
        <View testID={testID} className="rounded-t-3xl overflow-hidden">
          {Platform.OS !== 'web' && accessibilityLabel ? (
            <View
              accessible
              role="dialog"
              accessibilityLabel={accessibilityLabel}
              pointerEvents="none"
              className="absolute inset-0"
            />
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
