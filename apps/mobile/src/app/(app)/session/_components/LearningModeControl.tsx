import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { LearningMode } from '@eduagent/schemas';
import {
  useLearningMode,
  useUpdateLearningMode,
} from '../../../../hooks/use-settings';
import { useThemeColors } from '../../../../lib/theme';
import { platformAlert } from '../../../../lib/platform-alert';

/**
 * Header button + bottom-sheet modal for switching the user's global
 * learning mode (casual vs serious) without leaving the session screen.
 * The two pieces are returned separately because they render in different
 * parts of the tree (header vs root), but they share state internally.
 */
export function useLearningModeControl(): {
  button: React.ReactNode;
  sheet: React.ReactNode;
} {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { data: learningMode, isLoading: learningModeLoading } =
    useLearningMode();
  const updateLearningMode = useUpdateLearningMode();
  const [showSheet, setShowSheet] = useState(false);

  const options: Array<{
    mode: LearningMode;
    title: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      mode: 'casual',
      title: t('more.learningMode.casual.title'),
      description: t('more.learningMode.casual.description'),
      icon: 'compass-outline',
    },
    {
      mode: 'serious',
      title: t('more.learningMode.serious.title'),
      description: t('more.learningMode.serious.description'),
      icon: 'trophy-outline',
    },
  ];
  const selected = options.find((o) => o.mode === learningMode);
  const buttonDisabled =
    !learningMode || learningModeLoading || updateLearningMode.isPending;

  const handleSelect = (nextMode: LearningMode) => {
    if (updateLearningMode.isPending) return;
    if (nextMode === learningMode) {
      setShowSheet(false);
      return;
    }
    updateLearningMode.mutate(nextMode, {
      onSuccess: () => setShowSheet(false),
      onError: () =>
        platformAlert(
          t('more.errors.couldNotSaveSetting'),
          t('more.errors.tryAgain'),
        ),
    });
  };

  const button = (
    <Pressable
      onPress={() => setShowSheet(true)}
      disabled={buttonDisabled}
      className={`ms-1 px-2 py-2 rounded-button bg-surface-elevated min-h-[44px] min-w-[44px] items-center justify-center flex-row ${
        buttonDisabled ? 'opacity-50' : ''
      }`}
      accessibilityRole="button"
      accessibilityLabel={
        selected ? `Learning mode: ${selected.title}` : 'Learning mode loading'
      }
      accessibilityState={{ disabled: buttonDisabled }}
      testID="learning-mode-header-button"
    >
      <Ionicons
        name={selected?.icon ?? 'options-outline'}
        size={20}
        color={colors.textSecondary}
      />
      {selected ? (
        <Text className="ms-1 text-caption font-semibold text-text-secondary">
          {selected.title}
        </Text>
      ) : null}
    </Pressable>
  );

  const sheet = (
    <Modal
      visible={showSheet}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSheet(false)}
      testID="learning-mode-modal"
    >
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={() => setShowSheet(false)}
        testID="learning-mode-sheet-backdrop"
      >
        <Pressable
          className="bg-background rounded-t-card px-5 pt-4 pb-6"
          onPress={() => undefined}
          testID="learning-mode-sheet"
        >
          <Text className="text-title-sm font-semibold text-text-primary mb-1">
            {t('more.learningMode.sheetTitle')}
          </Text>
          <Text
            className="text-caption text-text-secondary mb-3"
            testID="learning-mode-next-message-copy"
          >
            {t('more.learningMode.sheetEffectMessage')}
          </Text>
          {options.map((option) => {
            const isSelected = learningMode === option.mode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => handleSelect(option.mode)}
                disabled={updateLearningMode.isPending}
                className={`bg-surface rounded-card px-4 py-3.5 mb-2 border-2 ${
                  isSelected ? 'border-primary' : 'border-transparent'
                } ${updateLearningMode.isPending ? 'opacity-50' : ''}`}
                accessibilityLabel={`${option.title}: ${option.description}`}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: isSelected,
                  disabled: updateLearningMode.isPending,
                }}
                testID={`session-learning-mode-${option.mode}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={colors.textSecondary}
                    />
                    <Text className="ms-2 text-body font-semibold text-text-primary">
                      {option.title}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Text className="text-primary text-body font-semibold">
                      {t('more.active')}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { button, sheet };
}
