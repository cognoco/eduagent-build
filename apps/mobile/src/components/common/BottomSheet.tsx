import type React from 'react';
import { Modal, Pressable, View } from 'react-native';

interface BottomSheetProps {
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
  /**
   * Whether tapping the semi-transparent backdrop dismisses the sheet.
   * Defaults to false (matches the NudgeActionSheet / LearnTogetherSheet
   * pattern). Set to true for sheets where backdrop dismiss is expected
   * (TopicPickerSheet, TopicDetailSheet pattern).
   */
  backdropDismissible?: boolean;
  /**
   * Accessibility label for the backdrop Pressable when backdropDismissible is
   * true. Defaults to "Close". Provide a localised string when the sheet uses
   * a translatable label (e.g. `t('library.a11yCloseTopicPicker')`).
   */
  backdropAccessibilityLabel?: string;
  /**
   * Modal animation type. Defaults to 'slide'.
   * Use 'fade' to match legacy NudgeActionSheet / LearnTogetherSheet behaviour.
   */
  animationType?: 'slide' | 'fade' | 'none';
}

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
 * Persona-unaware: uses semantic tokens (`bg-black/40`) only.
 * No hardcoded hex values.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  testID,
  backdropDismissible = false,
  backdropAccessibilityLabel = 'Close',
  animationType = 'slide',
}: BottomSheetProps): React.ReactElement {
  const surface = (
    <View testID={testID} className="rounded-t-3xl overflow-hidden">
      {children}
    </View>
  );

  const backdrop = backdropDismissible ? (
    <Pressable
      className="flex-1 justify-end bg-black/40"
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={backdropAccessibilityLabel}
    >
      <Pressable
        onPress={(e) => e?.stopPropagation?.()}
        accessibilityRole="none"
      >
        {surface}
      </Pressable>
    </Pressable>
  ) : (
    <View className="flex-1 justify-end bg-black/40">{surface}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {backdrop}
    </Modal>
  );
}
