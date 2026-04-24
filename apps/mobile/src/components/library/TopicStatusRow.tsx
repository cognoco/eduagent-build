import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '../../lib/theme';

interface TopicStatusRowProps {
  state: 'continue-now' | 'started' | 'up-next' | 'done';
  variant?: 'hero';
  title: string;
  chapterName?: string;
  sessionCount?: number;
  onPress: () => void;
  testID?: string;
}

const STATE_GLYPH: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': '●',
  started: '●',
  'up-next': '→',
  done: '✓',
};

const STATE_LABEL: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': 'Continue now',
  started: 'Started',
  'up-next': 'Up next',
  done: 'Done',
};

export function TopicStatusRow({
  state,
  variant,
  title,
  chapterName,
  sessionCount,
  onPress,
  testID,
}: TopicStatusRowProps) {
  const colors = useThemeColors();
  const isHero = state === 'up-next' && variant === 'hero';
  const accentColor = colors.accent ?? colors.warning ?? colors.primary;
  const doneBackgroundColor =
    colors.surface ??
    colors.surfaceElevated ??
    colors.primarySoft ??
    'transparent';

  const containerStyle = (() => {
    switch (state) {
      case 'continue-now':
        return {
          backgroundColor: `${colors.primary}10`,
          borderColor: `${colors.primary}40`,
          borderWidth: 1,
        };
      case 'started':
        return {
          backgroundColor: `${colors.textSecondary}10`,
          borderColor: `${colors.textSecondary}30`,
          borderWidth: 1,
        };
      case 'up-next':
        return {
          backgroundColor: `${accentColor}10`,
          borderColor: accentColor,
          borderWidth: isHero ? 2 : 1,
          borderStyle: 'dashed' as const,
        };
      case 'done':
        return {
          backgroundColor: doneBackgroundColor,
          borderWidth: 0,
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
    }
  })();

  const subtitleParts = [
    chapterName,
    state === 'started' && sessionCount !== undefined
      ? `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`
      : null,
  ].filter(Boolean) as string[];

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
      accessibilityLabel={`${STATE_LABEL[state]}: ${title}${
        subtitleParts.length > 0 ? `, ${subtitleParts.join(', ')}` : ''
      }`}
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
          <View
            className={
              state === 'done'
                ? 'flex-row items-center justify-between'
                : undefined
            }
          >
            <Text
              className="flex-1 text-body font-medium text-text-primary"
              numberOfLines={2}
            >
              {title}
            </Text>
            {state === 'done' && chapterName ? (
              <Text className="ms-3 shrink-0 text-caption text-text-secondary">
                {chapterName}
              </Text>
            ) : null}
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

          {state === 'started' && sessionCount !== undefined ? (
            <Text className="mt-0.5 text-caption text-text-secondary">
              {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
