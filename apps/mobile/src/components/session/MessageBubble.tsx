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
import { formatMathContent } from '../../lib/math-format';

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

function ThinkingIndicator(): React.ReactElement {
  return (
    <View
      className="flex-row gap-1 py-2 px-1 items-center"
      testID="thinking-indicator"
      accessibilityLabel="AI is thinking"
    >
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

const GUIDED_LABELS: Record<number, string> = {
  3: 'Step-by-step',
  4: 'Let me show you',
  5: 'Teaching mode',
};

const VERIFICATION_BADGE_CONFIG: Record<
  VerificationBadge,
  { label: string; bgClass: string; textClass: string }
> = {
  evaluate: {
    label: 'CHALLENGE',
    bgClass: 'bg-warning/20',
    textClass: 'text-warning',
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
  const displayContent = isAI ? formatMathContent(content) : content;
  const isGuided = isAI && (escalationRung ?? 0) >= 3;
  const guidedLabel = escalationRung
    ? GUIDED_LABELS[escalationRung]
    : undefined;
  const badge =
    isAI && verificationBadge
      ? VERIFICATION_BADGE_CONFIG[verificationBadge]
      : undefined;
  const isThinking = streaming && !content;

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      className={`mb-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}
    >
      <View
        className={`rounded-2xl px-4 py-3 ${
          isGuided
            ? 'bg-primary-soft border-l-2 border-primary'
            : isAI
            ? 'bg-surface-elevated'
            : 'bg-primary'
        }`}
      >
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
        {isGuided && guidedLabel && (
          <Text
            className="text-caption font-semibold text-primary mb-1"
            accessibilityLabel="Guided response"
          >
            {guidedLabel}
          </Text>
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
