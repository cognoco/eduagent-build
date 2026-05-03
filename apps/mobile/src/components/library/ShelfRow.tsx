import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { RetentionPill } from './RetentionPill';
import { BookRow, type BookRowData } from './BookRow';

interface ShelfRowProps {
  subjectId: string;
  name: string;
  emoji: string;
  bookCount: number;
  topicProgress: string; // "18/32"
  retentionStatus: RetentionStatus | null;
  isPaused: boolean;
  expanded: boolean;
  books: BookRowData[];
  onToggle: (subjectId: string) => void;
  onBookPress: (subjectId: string, bookId: string) => void;
}

export function ShelfRow({
  subjectId,
  name,
  emoji,
  bookCount,
  topicProgress,
  retentionStatus,
  isPaused,
  expanded,
  books,
  onToggle,
  onBookPress,
}: ShelfRowProps): React.ReactElement {
  const colors = useThemeColors();

  const subtitle = `${bookCount} ${
    bookCount === 1 ? 'book' : 'books'
  } · ${topicProgress} topics`;

  return (
    <View style={{ opacity: isPaused ? 0.65 : 1 }}>
      {/* Header row */}
      <Pressable
        testID={`shelf-row-header-${subjectId}`}
        onPress={() => onToggle(subjectId)}
        accessibilityRole="button"
        accessibilityLabel={`${name} shelf, ${subtitle}${
          isPaused ? ', paused' : ''
        }. Tap to ${expanded ? 'collapse' : 'expand'}.`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        {/* Emoji square */}
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 22 }}>{emoji}</Text>
        </View>

        {/* Name + subtitle */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>

        {/* Right side: paused chip + retention + chevron */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isPaused ? (
            <View
              testID={`shelf-row-paused-${subjectId}`}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: colors.warning + '22',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: colors.warning,
                }}
              >
                Paused
              </Text>
            </View>
          ) : null}

          {retentionStatus !== null ? (
            <RetentionPill status={retentionStatus} size="small" />
          ) : null}

          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      </Pressable>

      {/* Expanded book list */}
      {expanded ? (
        <View style={{ paddingLeft: 16 }}>
          {books.length === 0 ? (
            <View
              style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              testID={`shelf-empty-${subjectId}`}
            >
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                No books in this subject yet. Study a topic and it&apos;ll be
                filed here.
              </Text>
            </View>
          ) : (
            books.map((book) => (
              <BookRow
                key={book.bookId}
                {...book}
                onPress={(bookId) => onBookPress(subjectId, bookId)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
