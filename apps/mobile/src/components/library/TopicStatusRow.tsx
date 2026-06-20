import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';
import type { TopicRelevance } from '@eduagent/schemas';
import { TopicProvenance } from './TopicProvenance';

interface TopicStatusRowProps {
  state: 'continue-now' | 'started' | 'up-next' | 'done' | 'later';
  variant?: 'hero';
  title: string;
  chapterName?: string;
  sessionCount?: number;
  /** When present and not 'core', renders a small relevance label */
  relevance?: TopicRelevance;
  sourceChildProfileId?: string | null;
  createdAt?: string | Date | null;
  onPress: () => void;
  testID?: string;
}

const STATE_GLYPH: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': '●',
  started: '●',
  'up-next': '→',
  done: '✓',
  later: '○',
};

const STATE_I18N_KEY = {
  'continue-now': 'library.topicStatusRow.stateContinueNow',
  started: 'library.topicStatusRow.stateStarted',
  'up-next': 'library.topicStatusRow.stateUpNext',
  done: 'library.topicStatusRow.stateDone',
  later: 'library.topicStatusRow.stateLater',
} as const;

export function TopicStatusRow({
  state,
  variant,
  title,
  chapterName,
  sessionCount,
  relevance,
  sourceChildProfileId,
  createdAt,
  onPress,
  testID,
}: TopicStatusRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isHero = state === 'up-next' && variant === 'hero';
  const accentColor = colors.accent ?? colors.warning ?? colors.primary;
  const doneBackgroundColor =
    colors.surface ??
    colors.surfaceElevated ??
    colors.primarySoft ??
    'transparent';

  // Opacity byte suffixes used to resolve to 0x10 (6%) and 0x40 (25%). Kept
  // numeric here so withOpacity works for non-hex theme tokens (oklch, rgb,
  // named) without producing an invalid CSS color.
  const containerStyle = (() => {
    switch (state) {
      case 'continue-now':
        return {
          backgroundColor: withOpacity(colors.primary, 0.0625),
          borderColor: withOpacity(colors.primary, 0.25),
          borderWidth: 1,
        };
      case 'started':
        return {
          backgroundColor: withOpacity(colors.textSecondary, 0.0625),
          borderColor: withOpacity(colors.textSecondary, 0.1875),
          borderWidth: 1,
        };
      case 'up-next':
        return {
          backgroundColor: withOpacity(accentColor, 0.0625),
          borderColor: accentColor,
          borderWidth: isHero ? 2 : 1,
          borderStyle: 'dashed' as const,
        };
      case 'done':
        return {
          backgroundColor: doneBackgroundColor,
          borderWidth: 0,
        };
      case 'later':
        return {
          backgroundColor: 'transparent',
          borderColor: withOpacity(colors.textSecondary, 0.125),
          borderWidth: 1,
        };
    }
  })();

  const glyphColor = (() => {
    switch (state) {
      case 'continue-now':
        return colors.primary;
      case 'started':
        return colors.textSecondary;
      case 'up-next':
        return accentColor;
      case 'done':
        return colors.success;
      case 'later':
        return colors.textSecondary;
    }
  })();

  const shouldShowSessionCount =
    (state === 'continue-now' || state === 'started') &&
    sessionCount !== undefined;

  const subtitleParts = [
    chapterName,
    shouldShowSessionCount
      ? t('library.sessionCount', { count: sessionCount })
      : null,
  ].filter(Boolean) as string[];

  // Relevance label: skip 'core' (default, no noise)
  const relevanceLabel =
    relevance && relevance !== 'core'
      ? t(`topic.relevance.${relevance}`)
      : null;

  // Colour mapping: emerging = accent (stands out), contemporary = muted info, recommended = subtle secondary
  const relevanceLabelColor = (() => {
    switch (relevance) {
      case 'emerging':
        return accentColor;
      case 'contemporary':
        return colors.info ?? colors.textSecondary;
      case 'recommended':
      default:
        return colors.textSecondary;
    }
  })();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className="mb-2 rounded-card"
      style={[
        containerStyle,
        {
          minHeight: isHero ? 72 : 44,
          paddingHorizontal: 16,
          paddingVertical: isHero ? 16 : 12,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        subtitleParts.length > 0
          ? t('library.topicStatusRow.a11yWithSubtitle', {
              state: t(STATE_I18N_KEY[state]),
              title,
              subtitle: subtitleParts.join(', '),
            })
          : t('library.topicStatusRow.a11y', {
              state: t(STATE_I18N_KEY[state]),
              title,
            })
      }
    >
      <View className="flex-row items-start">
        <Text
          accessible={false}
          importantForAccessibility="no"
          style={{
            color: glyphColor,
            fontSize: 16,
            marginRight: 10,
            marginTop: 1,
          }}
        >
          {STATE_GLYPH[state]}
        </Text>

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 text-body font-medium text-text-primary"
              numberOfLines={2}
            >
              {title}
            </Text>
            <View className="ms-3 flex-row items-center gap-2 shrink-0">
              {relevanceLabel ? (
                <Text
                  testID={
                    testID
                      ? `topic-relevance-label-${testID}`
                      : 'topic-relevance-label'
                  }
                  className="text-caption"
                  style={{
                    fontWeight: '500',
                    color: relevanceLabelColor,
                  }}
                >
                  {relevanceLabel}
                </Text>
              ) : null}
              {state === 'done' && chapterName ? (
                <Text className="text-caption text-text-secondary">
                  {chapterName}
                </Text>
              ) : null}
            </View>
          </View>

          {state !== 'done' && chapterName ? (
            <Text
              className={
                isHero
                  ? 'mt-1 text-body-sm text-text-secondary'
                  : 'mt-0.5 text-caption text-text-secondary'
              }
            >
              {chapterName}
            </Text>
          ) : null}

          {shouldShowSessionCount ? (
            <Text className="mt-0.5 text-caption text-text-secondary">
              {t('library.sessionCount', { count: sessionCount })}
            </Text>
          ) : null}
          <TopicProvenance
            sourceChildProfileId={sourceChildProfileId}
            createdAt={createdAt}
          />
        </View>
      </View>
    </Pressable>
  );
}
