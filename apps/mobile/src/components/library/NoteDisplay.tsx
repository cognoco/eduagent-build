import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ConceptMasterySignal } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';

interface NoteDisplayProps {
  content: string;
  readOnly?: boolean;
  conceptSignal?: ConceptMasterySignal;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SESSION_SEPARATOR_REGEX = /^---\s*(.+?)\s*---$/;

export function NoteDisplay({
  content,
  readOnly = false,
  conceptSignal,
  onEdit,
  onDelete,
}: NoteDisplayProps): React.ReactElement {
  const themeColors = useThemeColors();
  const { t } = useTranslation();
  const [additionsExpanded, setAdditionsExpanded] = useState(false);
  const lines = content.split('\n');
  const tutorAdditions = conceptSignal?.tutorAdditions ?? [];
  const hasTutorAdditions =
    conceptSignal?.hasTutorAddition === true && tutorAdditions.length > 0;

  return (
    <View className="bg-surface rounded-lg p-3">
      {(conceptSignal?.verified === true || hasTutorAdditions) && (
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          {conceptSignal?.verified === true && (
            <View
              testID="note-verified-signal"
              className="flex-row items-center gap-1"
              accessibilityLabel={t(
                'library.noteSignal.verifiedAccessibilityLabel',
              )}
            >
              <Ionicons
                name="star"
                size={16}
                color={themeColors.reward}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text className="text-caption text-text-secondary">
                {t('library.noteSignal.verified')}
              </Text>
            </View>
          )}
          {hasTutorAdditions && (
            <Pressable
              testID="note-tutor-addition-toggle"
              onPress={() => setAdditionsExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={t(
                additionsExpanded
                  ? 'library.noteSignal.hideTutorAdditionAccessibilityLabel'
                  : 'library.noteSignal.showTutorAdditionAccessibilityLabel',
              )}
              className="flex-row items-center gap-1"
            >
              <Ionicons
                name={additionsExpanded ? 'chevron-up' : 'add-circle-outline'}
                size={16}
                color={themeColors.accent}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text className="text-caption text-text-secondary">
                {t('library.noteSignal.tutorAddition')}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {hasTutorAdditions && additionsExpanded && (
        <View testID="note-tutor-additions" className="mb-2 gap-1">
          {tutorAdditions.map((addition) => (
            <Text key={addition} className="text-body-sm text-text-secondary">
              {addition}
            </Text>
          ))}
        </View>
      )}

      <View className="mb-2">
        {lines.map((line, index) => {
          const separatorMatch = SESSION_SEPARATOR_REGEX.exec(line);
          if (separatorMatch) {
            const label = separatorMatch[1];
            return (
              <View key={index} className="flex-row items-center my-2">
                <View className="flex-1 h-px bg-border" />
                <Text className="text-caption text-text-secondary mx-2">
                  {label}
                </Text>
                <View className="flex-1 h-px bg-border" />
              </View>
            );
          }

          if (line.trim() === '') {
            return null;
          }

          return (
            <Text key={index} className="text-body text-text-primary mb-1">
              {line}
            </Text>
          );
        })}
      </View>

      {!readOnly && (onEdit != null || onDelete != null) && (
        <View className="flex-row justify-end gap-2">
          {onEdit != null && (
            <Pressable
              testID="note-edit-button"
              onPress={onEdit}
              className="p-1"
              accessibilityRole="button"
              accessibilityLabel={t('library.a11yEditNote')}
            >
              {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
              <View
                testID="note-edit-icon"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons name="pencil" size={18} color={themeColors.primary} />
              </View>
            </Pressable>
          )}
          {onDelete != null && (
            <Pressable
              testID="note-delete-button"
              onPress={onDelete}
              className="p-1"
              accessibilityRole="button"
              accessibilityLabel={t('library.a11yDeleteNote')}
            >
              {/* [a11y sweep] decorative icon — Pressable parent carries the label */}
              <View
                testID="note-delete-icon"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={themeColors.danger}
                />
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
