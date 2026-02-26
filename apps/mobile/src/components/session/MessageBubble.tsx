import { View, Text } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { formatMathContent } from '../../lib/math-format';

export type VerificationBadge = 'evaluate' | 'teach_back';

interface MessageBubbleProps {
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
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
}: MessageBubbleProps) {
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
        <Text
          className={`text-body leading-relaxed ${
            isAI ? 'text-text-primary' : 'text-text-inverse'
          }`}
        >
          {displayContent}
          {streaming && <Text className="text-accent"> {'\u258C'}</Text>}
        </Text>
      </View>
    </Animated.View>
  );
}
