import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  type LayoutChangeEvent,
  type TextStyle,
} from 'react-native';
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
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import { formatMathContent } from '../../lib/math-format';
import { useThemeColors } from '../../lib/theme';

export type VerificationBadge = 'evaluate' | 'teach_back';

interface MessageBubbleProps {
  role: 'assistant' | 'user';
  content: string;
  streaming?: boolean;
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
  actions?: React.ReactNode;
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

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
      accessibilityLabel="Thinking"
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

/** Collapse AI messages taller than ~7 lines (at 22px line-height). */
const COLLAPSE_THRESHOLD = 150;

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
    // Bug #5 fix: border-l-4 rendered as a full-width green line artifact
    // on some devices. Using border-l-[3px] matches level 4 pattern and
    // avoids the NativeWind rendering quirk.
    border: 'border-l-[3px] border-success',
    icon: 'book-outline',
    colorKey: 'success',
    textClass: 'text-success',
  },
};

// ---------------------------------------------------------------------------
// Markdown styles — themed to match chat bubble text
// ---------------------------------------------------------------------------

function buildMarkdownStyles(
  fallbackTextColor: string
): Record<string, TextStyle | { backgroundColor?: string }> {
  // Primary text color comes from NativeWind className="text-text-primary"
  // on the custom inline/textgroup render rules (see `rules` prop below).
  // NativeWind resolves via CSS variables which are always in sync with
  // background colors. However, during theme transitions the React context
  // (useThemeColors) and NativeWind CSS variables can briefly desync.
  // To prevent invisible text (dark-on-dark or light-on-light) during that
  // window, we set an explicit `color` on the base style as a safety net.
  // Whichever system updates first wins — text is never invisible.
  const base: TextStyle = {
    fontSize: 15,
    lineHeight: 22,
    color: fallbackTextColor,
  };
  return {
    body: base,
    text: base,
    textgroup: base,
    inline: base,
    // Paragraph renders as a View (via _VIEW_SAFE_paragraph, which strips text
    // props). Keep the library's default layout props so text wraps correctly.
    paragraph: {
      ...base,
      marginTop: 0,
      marginBottom: 4,
      flexWrap: 'wrap' as const,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'flex-start' as const,
      width: '100%',
    },
    strong: { ...base, fontWeight: '700' },
    em: { ...base, fontStyle: 'italic' },
    s: { ...base, textDecorationLine: 'line-through' as const },
    bullet_list: { ...base, marginBottom: 4 },
    ordered_list: { ...base, marginBottom: 4 },
    list_item: { ...base, marginBottom: 2 },
    bullet_list_icon: { ...base, marginLeft: 10, marginRight: 10 },
    ordered_list_icon: { ...base, marginLeft: 10, marginRight: 10 },
    bullet_list_content: { flex: 1 },
    ordered_list_content: { flex: 1 },
    code_inline: {
      ...base,
      fontFamily: 'monospace',
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    fence: {
      ...base,
      fontFamily: 'monospace',
      padding: 8,
      borderRadius: 8,
      marginBottom: 4,
    },
    code_block: {
      ...base,
      fontFamily: 'monospace',
      padding: 8,
      borderRadius: 8,
      marginBottom: 4,
    },
    heading1: { ...base, fontSize: 18, fontWeight: '700', marginBottom: 4 },
    heading2: { ...base, fontSize: 17, fontWeight: '700', marginBottom: 4 },
    heading3: { ...base, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    link: { ...base, textDecorationLine: 'underline' as const },
    blockquote: {
      ...base,
      paddingLeft: 8,
      marginBottom: 4,
    },
    softbreak: base,
    hardbreak: { ...base, width: '100%', height: 1 },
    hr: { height: 1, marginVertical: 8 },
  };
}

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
  actions,
}: MessageBubbleProps): React.ReactElement {
  const isAI = role === 'assistant';
  const colors = useThemeColors();
  const displayContent = isAI ? formatMathContent(content) : content;
  const escalation =
    isAI && escalationRung ? ESCALATION_STYLES[escalationRung] : undefined;
  const badge =
    isAI && verificationBadge
      ? VERIFICATION_BADGE_CONFIG[verificationBadge]
      : undefined;
  const isThinking = streaming && !content;

  // Collapse / expand for long AI messages
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCollapsible, setIsCollapsible] = useState(false);

  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!isExpanded) return; // don't re-measure constrained height
      if (event.nativeEvent.layout.height > COLLAPSE_THRESHOLD) {
        setIsCollapsible(true);
      }
    },
    [isExpanded]
  );

  const showCollapseToggle = isAI && isCollapsible && !streaming;

  const mdStyles = useMemo(
    () => buildMarkdownStyles(colors.textPrimary),
    [colors.textPrimary]
  );

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
        ) : isAI ? (
          <View
            onLayout={handleContentLayout}
            style={
              isCollapsible && !isExpanded
                ? { maxHeight: COLLAPSE_THRESHOLD, overflow: 'hidden' }
                : undefined
            }
          >
            <Markdown
              mergeStyle={false}
              style={mdStyles}
              rules={{
                // Force NativeWind-resolved text color on wrapper nodes.
                // The Markdown lib's StyleSheet.create() styles can be
                // overridden by Android force-dark; NativeWind classes
                // bypass that because they resolve via CSS variables.
                inline: (node: { key: string }, children: React.ReactNode) => (
                  <Text
                    key={node.key}
                    className="text-text-primary text-body leading-relaxed"
                  >
                    {children}
                  </Text>
                ),
                textgroup: (
                  node: { key: string },
                  children: React.ReactNode
                ) => (
                  <Text
                    key={node.key}
                    className="text-text-primary text-body leading-relaxed"
                  >
                    {children}
                  </Text>
                ),
              }}
            >
              {displayContent}
            </Markdown>
            {streaming && <BlinkingCursor />}
          </View>
        ) : (
          <Text className="text-body leading-relaxed text-text-inverse">
            {displayContent}
          </Text>
        )}
        {showCollapseToggle && (
          <Pressable
            onPress={() => setIsExpanded((prev) => !prev)}
            className="mt-2 flex-row items-center justify-center py-1"
            accessibilityLabel={
              isExpanded ? 'Collapse message' : 'Expand message'
            }
            accessibilityRole="button"
            testID="message-collapse-toggle"
          >
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.accent}
            />
            <Text className="text-caption text-accent ml-1">
              {isExpanded ? 'Show less' : 'Show more'}
            </Text>
          </Pressable>
        )}
        {actions ? <View className="mt-3">{actions}</View> : null}
      </View>
    </Animated.View>
  );
}
