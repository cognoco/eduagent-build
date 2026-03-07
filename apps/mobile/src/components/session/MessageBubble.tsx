import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatMathContent } from '../../lib/math-format';
import { useThemeColors } from '../../lib/theme';

export type VerificationBadge = 'evaluate' | 'teach_back';

interface MessageBubbleProps {
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
}

function ThinkingDot({ delay }: { delay: number }): React.ReactElement {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(300)}
      style={animatedStyle}
      className="w-2 h-2 rounded-full bg-text-secondary"
    />
  );
}

function PencilTapIcon(): React.ReactElement {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const colors = useThemeColors();

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name="pencil" size={14} color={colors.accent} />
    </Animated.View>
  );
}

function ThinkingIndicator(): React.ReactElement {
  return (
    <View
      className="flex-row gap-1.5 py-2 px-1 items-center"
      testID="thinking-indicator"
      accessibilityLabel="Your coach is thinking"
    >
      <PencilTapIcon />
      {[0, 1, 2].map((i) => (
        <ThinkingDot key={i} delay={i * 200} />
      ))}
    </View>
  );
}

function BlinkingCursor(): React.ReactElement {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={animatedStyle} className="text-accent">
      {' \u258C'}
    </Animated.Text>
  );
}

const ESCALATION_STYLES: Partial<
  Record<
    number,
    {
      label: string;
      bg: string;
      border: string;
      icon: keyof typeof Ionicons.glyphMap;
      colorKey: 'primary' | 'info' | 'success';
      textClass: string;
    }
  >
> = {
  3: {
    label: 'Step-by-step',
    bg: 'bg-primary-soft',
    border: 'border-l-2 border-primary',
    icon: 'bulb-outline',
    colorKey: 'primary',
    textClass: 'text-primary',
  },
  4: {
    label: 'Let me show you',
    bg: 'bg-info/10',
    border: 'border-l-[3px] border-info',
    icon: 'search-outline',
    colorKey: 'info',
    textClass: 'text-info',
  },
  5: {
    label: 'Teaching mode',
    bg: 'bg-success/10',
    border: 'border-l-4 border-success',
    icon: 'book-outline',
    colorKey: 'success',
    textClass: 'text-success',
  },
};

const VERIFICATION_BADGE_CONFIG: Record<
  VerificationBadge,
  { label: string; bgClass: string; textClass: string }
> = {
  evaluate: {
    label: 'THINK DEEPER',
    bgClass: 'bg-info/20',
    textClass: 'text-info',
  },
  teach_back: {
    label: 'TEACH ME',
    bgClass: 'bg-accent/20',
    textClass: 'text-accent',
  },
};

export function MessageBubble({
  role,
  content,
  streaming,
  escalationRung,
  verificationBadge,
}: MessageBubbleProps): React.ReactElement {
  const isAI = role === 'ai';
  const colors = useThemeColors();
  const displayContent = isAI ? formatMathContent(content) : content;
  const escalation =
    isAI && escalationRung ? ESCALATION_STYLES[escalationRung] : undefined;
  const badge =
    isAI && verificationBadge
      ? VERIFICATION_BADGE_CONFIG[verificationBadge]
      : undefined;
  const isThinking = streaming && !content;

  const bubbleBg = escalation
    ? `${escalation.bg} ${escalation.border}`
    : isAI
    ? 'bg-coach-bubble'
    : 'bg-primary';

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      className={`mb-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}
    >
      <View className={`rounded-2xl px-4 py-3 ${bubbleBg}`}>
        {badge && (
          <View
            className={`self-start rounded-full px-2 py-0.5 mb-1 ${badge.bgClass}`}
          >
            <Text
              className={`text-xs font-bold ${badge.textClass}`}
              accessibilityLabel={`${badge.label} message`}
            >
              {badge.label}
            </Text>
          </View>
        )}
        {escalation && (
          <View
            className="flex-row items-center mb-1"
            accessibilityLabel="Guided response"
          >
            <Ionicons
              name={escalation.icon}
              size={14}
              color={colors[escalation.colorKey]}
              style={{ marginRight: 4 }}
            />
            <Text
              className={`text-caption font-semibold ${escalation.textClass}`}
            >
              {escalation.label}
            </Text>
          </View>
        )}
        {isThinking ? (
          <ThinkingIndicator />
        ) : (
          <Text
            className={`text-body leading-relaxed ${
              isAI ? 'text-text-primary' : 'text-text-inverse'
            }`}
          >
            {displayContent}
            {streaming && <BlinkingCursor />}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
