import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { RetentionStatus } from '@eduagent/schemas';
import { useSubjectTint, useThemeColors } from '../../lib/theme';
import { BookRow, type BookRowData } from './BookRow';

interface ShelfRowProps {
  subjectId: string;
  name: string;
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
  bookCount,
  topicProgress,
  retentionStatus,
  isPaused,
  expanded,
  books,
  onToggle,
  onBookPress,
}: ShelfRowProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const tint = useSubjectTint(subjectId);

  // i18next pluralization picks shelfSubtitle_one vs shelfSubtitle_other based
  // on count, so the singular/plural form moves with the locale's plural rules
  // (e.g. Polish/Russian use multiple plural buckets — a hardcoded pair is wrong).
  const subtitle = t('library.row.shelfSubtitle', {
    count: bookCount,
    progress: topicProgress,
  });

  const needsReview =
    retentionStatus === 'weak' || retentionStatus === 'forgotten';

  return (
    <View style={{ opacity: isPaused ? 0.65 : 1 }}>
      {/* Header row */}
      <Pressable
        testID={`shelf-row-header-${subjectId}`}
        onPress={() => onToggle(subjectId)}
        accessibilityRole="button"
        accessibilityLabel={t('library.row.shelfAccessibilityLabel', {
          name,
          subtitle,
          pausedSuffix: isPaused ? t('library.row.shelfPausedSuffix') : '',
          reviewSuffix: needsReview ? t('library.row.shelfReviewSuffix') : '',
          action: expanded
            ? t('library.row.shelfActionCollapse')
            : t('library.row.shelfActionExpand'),
        })}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        {/* Tinted icon tile — Ionicons "library" in subject's tint color */}
        <View
          testID={`shelf-row-icon-${subjectId}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: tint.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="library" size={22} color={tint.solid} />
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

        {/* Right side: paused chip + review pill + chevron */}
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
                {t('library.row.paused')}
              </Text>
            </View>
          ) : null}

          {needsReview ? (
            <View
              testID={`shelf-row-review-${subjectId}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: colors.retentionWeak + '22',
              }}
            >
              <Ionicons
                name="alert-circle"
                size={12}
                color={colors.retentionWeak}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.retentionWeak,
                }}
              >
                {t('library.row.review')}
              </Text>
            </View>
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
                {t('library.row.shelfEmpty')}
              </Text>
            </View>
          ) : (
            books.map((book) => (
              <BookRow
                key={book.bookId}
                {...book}
                tint={tint}
                onPress={(bookId) => onBookPress(subjectId, bookId)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
