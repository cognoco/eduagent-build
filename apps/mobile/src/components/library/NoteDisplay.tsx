import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface NoteDisplayProps {
  content: string;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SESSION_SEPARATOR_REGEX = /^---\s*(.+?)\s*---$/;

export function NoteDisplay({
  content,
  readOnly = false,
  onEdit,
  onDelete,
}: NoteDisplayProps): React.ReactElement {
  const themeColors = useThemeColors();
  const lines = content.split('\n');

  return (
    <View className="bg-surface rounded-lg p-3">
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
              accessibilityLabel="Edit note"
            >
              <Ionicons name="pencil" size={18} color={themeColors.primary} />
            </Pressable>
          )}
          {onDelete != null && (
            <Pressable
              testID="note-delete-button"
              onPress={onDelete}
              className="p-1"
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={themeColors.danger}
              />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
