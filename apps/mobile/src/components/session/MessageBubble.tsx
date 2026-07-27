import { memo, useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TranslateKey } from '../../i18n/types';
import type { MentorNoticeAccepted } from '@eduagent/schemas';
import { formatMathContent } from '../../lib/math-format';
import { stripEnvelopeJson } from '../../lib/strip-envelope';
import { useThemeColors } from '../../lib/theme';
import { ThemedMarkdown } from '../common';

export type VerificationBadge = 'evaluate' | 'teach_back';

interface MessageBubbleProps {
  sender: 'assistant' | 'user';
  content: string;
  streaming?: boolean;
  outboxStatus?: 'pending' | 'permanently-failed';
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
  actions?: React.ReactNode;
  testID?: string;
  mentorNotice?: MentorNoticeAccepted;
  showInlineThinkingIndicator?: boolean;
}

function ThinkingDot({ delay }: { delay: number }): React.ReactElement {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 300 }),
        withTiming(0, { duration: 300 }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, translateY]);

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
  const { t } = useTranslation();
  return (
    <View
      className="flex-row gap-1.5 py-2 px-1 items-center"
      testID="thinking-indicator"
      accessibilityLabel={t('session.messageBubble.thinking')}
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
        withTiming(1, { duration: 400 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={animatedStyle}
      className="text-accent"
      testID="streaming-cursor"
    >
      {' \u258C'}
    </Animated.Text>
  );
}

type EscalationStyle = {
  labelKey: TranslateKey;
  bg: string;
  border: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'primary' | 'info' | 'success';
  textClass: string;
};

const ESCALATION_STYLES: Partial<Record<number, EscalationStyle>> = {
  3: {
    labelKey: 'session.messageBubble.escalation.stepByStep',
    bg: 'bg-primary-soft',
    border: 'border-l-2 border-primary',
    icon: 'bulb-outline',
    colorKey: 'primary',
    textClass: 'text-primary',
  },
  4: {
    labelKey: 'session.messageBubble.escalation.letMeShowYou',
    bg: 'bg-info/10',
    border: 'border-l-[3px] border-info',
    icon: 'search-outline',
    colorKey: 'info',
    textClass: 'text-info',
  },
  5: {
    labelKey: 'session.messageBubble.escalation.teachingMode',
    bg: 'bg-success/10',
    // Bug #5 fix: border-l-4 rendered as a full-width green line artifact
    // on some devices. Using border-l-[3px] matches level 4 pattern and
    // avoids the NativeWind rendering quirk.
    border: 'border-l-[3px] border-success',
    icon: 'book-outline',
    colorKey: 'success',
    textClass: 'text-success',
  },
};

const VERIFICATION_BADGE_KEY: Record<VerificationBadge, TranslateKey> = {
  evaluate: 'session.messageBubble.verificationBadge.evaluate',
  teach_back: 'session.messageBubble.verificationBadge.teachBack',
};

// Custom comparator: re-render only when props that affect output change.
// Deliberately excludes `actions` from the stable-reference check because
// callers may pass inline JSX — fall back to reference equality for that prop.
// Animated.View's `entering` prop (FadeInUp) only fires on mount, so memo
// does not interfere with the enter animation; shared-value animations
// (ThinkingDot, BlinkingCursor) live in child components and are unaffected.
function areEqualMessageBubble(
  prev: MessageBubbleProps,
  next: MessageBubbleProps,
): boolean {
  return (
    prev.sender === next.sender &&
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.outboxStatus === next.outboxStatus &&
    prev.escalationRung === next.escalationRung &&
    prev.verificationBadge === next.verificationBadge &&
    prev.actions === next.actions &&
    prev.mentorNotice === next.mentorNotice &&
    prev.showInlineThinkingIndicator === next.showInlineThinkingIndicator &&
    prev.testID === next.testID
  );
}

export const MessageBubble = memo(function MessageBubble({
  sender,
  content,
  streaming,
  outboxStatus,
  escalationRung,
  verificationBadge,
  actions,
  testID,
  mentorNotice,
  showInlineThinkingIndicator = true,
}: MessageBubbleProps): React.ReactElement {
  const { t } = useTranslation();
  const isAI = sender === 'assistant';
  const colors = useThemeColors();
  // [BUG-941] Render-boundary defense: any AI message whose content arrived
  // shaped like a full LLM envelope (`{"reply":"...","signals":...}`) gets
  // projected down to its `.reply` field before display. Plain prose passes
  // through untouched. Mirrors the API-side projectAiResponseContent — this
  // is defense-in-depth in case a non-streaming or future code path bypasses
  // the existing two layers (parseExchangeEnvelope on persistence + transcript
  // hydration projector). User-authored messages are never envelope-shaped,
  // so the projection only runs for assistant content.
  const projectedContent = isAI ? stripEnvelopeJson(content) : content;
  const displayContent = isAI
    ? formatMathContent(projectedContent)
    : projectedContent;
  const escalation =
    isAI && escalationRung ? ESCALATION_STYLES[escalationRung] : undefined;
  const isThinking = streaming && !content && showInlineThinkingIndicator;

  const bubbleBg = escalation
    ? `${escalation.bg} ${escalation.border}`
    : isAI
      ? 'bg-coach-bubble'
      : 'bg-primary';

  return (
    <Animated.View
      testID={testID}
      entering={FadeInUp.duration(250)}
      className={`mb-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}
    >
      <View className={`rounded-2xl px-4 py-3 ${bubbleBg}`}>
        {escalation && (
          <View
            className="flex-row items-center mb-1"
            accessibilityLabel={t('session.messageBubble.guidedResponse')}
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
              {t(escalation.labelKey)}
            </Text>
          </View>
        )}
        {isThinking ? (
          <ThinkingIndicator />
        ) : isAI ? (
          <View testID="message-ai-content">
            <ThemedMarkdown>{displayContent}</ThemedMarkdown>
            {streaming && content ? <BlinkingCursor /> : null}
          </View>
        ) : (
          <Text className="text-body leading-relaxed text-text-inverse">
            {displayContent}
          </Text>
        )}
        {actions ? <View className="mt-3">{actions}</View> : null}
      </View>
      {isAI && !streaming && mentorNotice && (
        <View
          testID="mentor-notice-chip"
          className="mt-1 ml-1 self-start rounded-full bg-surface px-3 py-1"
        >
          <Text className="text-caption text-text-secondary">
            {t('session.messageBubble.mentorNotice', {
              concept: mentorNotice.concept,
            })}
          </Text>
        </View>
      )}
      {isAI &&
        verificationBadge &&
        VERIFICATION_BADGE_KEY[verificationBadge] && (
          <Text className="text-[10px] font-bold uppercase tracking-wide text-success mt-1 ml-1">
            ✓ {t(VERIFICATION_BADGE_KEY[verificationBadge])}
          </Text>
        )}
      {!isAI && outboxStatus === 'pending' ? (
        <View
          className="self-end mt-1"
          testID="outbox-pending-indicator"
          accessibilityLabel={t('session.messageBubble.pendingSync')}
        >
          <Text className="text-caption text-text-secondary">
            {t('session.messageBubble.sending')}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}, areEqualMessageBubble);
