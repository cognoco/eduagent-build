import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { RetentionStatus } from '@eduagent/schemas';
import type { SubjectTint } from '../../lib/design-tokens';
import { useThemeColors } from '../../lib/theme';

export interface BookRowData {
  bookId: string;
  title: string;
  topicProgress: string; // "8/12"
  retentionStatus: RetentionStatus | null;
  hasNotes: boolean;
}

interface BookRowProps extends BookRowData {
  tint?: SubjectTint;
  onPress: (bookId: string) => void;
}

export function BookRow({
  bookId,
  title,
  topicProgress,
  retentionStatus,
  hasNotes,
  tint,
  onPress,
}: BookRowProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const resolvedTint = useMemo<SubjectTint>(
    () =>
      tint ??
      ({
        name: 'primary',
        solid: colors.primary,
        soft: colors.primarySoft,
      } as unknown as SubjectTint),
    [tint, colors.primary, colors.primarySoft]
  );
  const needsReview =
    retentionStatus === 'weak' || retentionStatus === 'forgotten';

  return (
    <Pressable
      testID={`book-row-${bookId}`}
      onPress={() => onPress(bookId)}
      accessibilityRole="button"
      accessibilityLabel={t('library.row.bookAccessibilityLabel', {
        title,
        progress: topicProgress,
        retentionSuffix: retentionStatus
          ? t('library.row.bookRetentionSuffix', { status: retentionStatus })
          : '',
        notesSuffix: hasNotes ? t('library.row.bookNotesSuffix') : '',
      })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 12,
      }}
    >
      {/* Tinted book icon tile */}
      <View
        testID={`book-row-icon-${bookId}`}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: resolvedTint.soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="book" size={18} color={resolvedTint.solid} />
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
          {t('library.row.bookTopics', { progress: topicProgress })}
        </Text>
      </View>

      {/* Right side: review pill (only when weak/forgotten) + notes indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {needsReview ? (
          <View
            testID={`book-row-review-${bookId}`}
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
        ) : retentionStatus === null ? (
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {t('library.row.notStarted')}
          </Text>
        ) : null}
        {hasNotes ? (
          <View accessibilityLabel={t('library.row.hasNotes')}>
            <Ionicons
              name="document-text-outline"
              size={14}
              color={colors.textSecondary}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
