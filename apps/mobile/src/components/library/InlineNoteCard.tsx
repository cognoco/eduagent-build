import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ConceptMasterySignal } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';

interface InlineNoteCardProps {
  noteId: string;
  topicTitle: string;
  content: string;
  sourceLine: string;
  updatedAt: string;
  conceptSignal?: ConceptMasterySignal;
  defaultExpanded?: boolean;
  /**
   * Open the note's edit/delete menu. Fires both on native long-press AND on
   * the always-visible kebab affordance — the latter is required because
   * long-press does not fire on a web click and touch-only users cannot
   * long-press reliably (#5).
   */
  onLongPress?: (noteId: string) => void;
  onSourcePress?: () => void;
  testID?: string;
}

export function InlineNoteCard({
  noteId,
  topicTitle,
  content,
  sourceLine,
  updatedAt: _updatedAt,
  conceptSignal,
  defaultExpanded = false,
  onLongPress,
  onSourcePress,
  testID,
}: InlineNoteCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [additionsExpanded, setAdditionsExpanded] = useState(false);
  const themeColors = useThemeColors();
  const { t } = useTranslation();

  const cardTestID = testID ?? `note-card-${noteId}`;
  const accentBg = withOpacity(themeColors.accent, 0.08);
  const accentBorder = withOpacity(themeColors.accent, 0.35);
  const mentorAdditions = conceptSignal?.mentorAdditions ?? [];
  const hasMentorAdditions =
    conceptSignal?.hasMentorAddition === true && mentorAdditions.length > 0;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      onLongPress={() => onLongPress?.(noteId)}
      testID={cardTestID}
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t('library.inlineNote.a11yCollapse', {
              topic: topicTitle,
              source: sourceLine,
            })
          : t('library.inlineNote.a11yExpand', {
              topic: topicTitle,
              source: sourceLine,
            })
      }
      style={{
        marginHorizontal: 20,
        marginBottom: 8,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: accentBg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: accentBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        {onSourcePress ? (
          <Pressable
            onPress={onSourcePress}
            accessibilityRole="link"
            accessibilityLabel={t('library.inlineNote.a11yOpenSource', {
              topic: topicTitle,
            })}
            testID={`${cardTestID}-source`}
            style={{ flex: 1, marginEnd: 8 }}
          >
            <Text
              style={{
                fontSize: 12,
                color: themeColors.accent,
              }}
              numberOfLines={1}
            >
              {sourceLine}
            </Text>
          </Pressable>
        ) : (
          <Text
            style={{
              fontSize: 12,
              color: themeColors.textSecondary,
              flex: 1,
              marginEnd: 8,
            }}
            numberOfLines={1}
          >
            {sourceLine}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {conceptSignal?.verified === true ? (
            <View
              testID={`${cardTestID}-verified`}
              accessibilityLabel={t(
                'library.noteSignal.verifiedAccessibilityLabel',
              )}
            >
              <Ionicons
                name="star"
                size={15}
                color={themeColors.reward}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </View>
          ) : null}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={themeColors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
        {onLongPress ? (
          <Pressable
            onPress={(e) => {
              // Stop the tap from also toggling the card's expand/collapse
              // (the kebab sits inside the card Pressable). Opening the menu
              // is the only intended effect.
              e?.stopPropagation?.();
              onLongPress(noteId);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('library.inlineNote.a11yNoteOptions', {
              topic: topicTitle,
            })}
            testID={`${cardTestID}-menu`}
            hitSlop={8}
            style={{
              minWidth: 44,
              minHeight: 44,
              marginStart: 4,
              marginEnd: -8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={themeColors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      <Text
        style={{ fontSize: 14, color: themeColors.textPrimary }}
        numberOfLines={expanded ? undefined : 2}
      >
        {content}
      </Text>
      {hasMentorAdditions ? (
        <Pressable
          testID={`${cardTestID}-addition-toggle`}
          accessibilityRole="button"
          accessibilityLabel={t(
            additionsExpanded
              ? 'library.noteSignal.hideMentorAdditionAccessibilityLabel'
              : 'library.noteSignal.showMentorAdditionAccessibilityLabel',
          )}
          onPress={(e) => {
            e?.stopPropagation?.();
            setAdditionsExpanded((value) => !value);
          }}
          style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Ionicons
            name={additionsExpanded ? 'chevron-up' : 'add-circle-outline'}
            size={15}
            color={themeColors.accent}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
            {t('library.noteSignal.mentorAddition')}
          </Text>
        </Pressable>
      ) : null}
      {hasMentorAdditions && additionsExpanded ? (
        <View testID={`${cardTestID}-additions`} style={{ marginTop: 6 }}>
          {mentorAdditions.map((addition) => (
            <Text
              key={addition}
              style={{ fontSize: 13, color: themeColors.textSecondary }}
            >
              {addition}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
