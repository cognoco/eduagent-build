import { Pressable, Text, View } from 'react-native';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { RetentionPill } from './RetentionPill';

export interface BookRowData {
  bookId: string;
  emoji: string;
  title: string;
  topicProgress: string; // "8/12"
  retentionStatus: RetentionStatus | null;
  hasNotes: boolean;
}

interface BookRowProps extends BookRowData {
  onPress: (bookId: string) => void;
}

export function BookRow({
  bookId,
  emoji,
  title,
  topicProgress,
  retentionStatus,
  hasNotes,
  onPress,
}: BookRowProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Pressable
      testID={`book-row-${bookId}`}
      onPress={() => onPress(bookId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${topicProgress} topics${
        retentionStatus ? `, retention ${retentionStatus}` : ''
      }${hasNotes ? ', has notes' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 12,
      }}
    >
      {/* Emoji square */}
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          backgroundColor: colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>

      {/* Title + progress */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}
          numberOfLines={1}
        >
          {topicProgress} topics
        </Text>
      </View>

      {/* Right side: retention + notes */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {retentionStatus !== null ? (
          <RetentionPill status={retentionStatus} size="small" />
        ) : (
          <Text style={{ fontSize: 11, color: colors.muted }}>not started</Text>
        )}
        {hasNotes ? (
          <Text style={{ fontSize: 14 }} accessibilityLabel="Has notes">
            📝
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
