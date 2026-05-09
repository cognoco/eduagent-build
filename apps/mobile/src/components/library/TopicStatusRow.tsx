import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '../../lib/theme';
import { withOpacity } from '../../lib/color-opacity';

interface TopicStatusRowProps {
  state: 'continue-now' | 'started' | 'up-next' | 'done' | 'later';
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
  later: '○',
};

const STATE_LABEL: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': 'Continue now',
  started: 'Started',
  'up-next': 'Up next',
  done: 'Done',
  later: 'Later',
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
          <View className="flex-row items-center justify-between">
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
