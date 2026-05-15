import { View, Text, Pressable } from 'react-native';
import type { ChatMessage } from '../../../../components/session';
import { SessionMessageActions } from '../../../../components/session/SessionMessageActions';
import { getConfidenceCopy } from '../_lib/confidence-copy';

type SessionMessageActionsProps = React.ComponentProps<
  typeof SessionMessageActions
>;

/**
 * Builds the per-message accessory row shown under each chat bubble.
 *
 *  - For a `session_expired` system message, render an escape pair so the
 *    learner can start a new session or go home instead of being stuck.
 *  - Otherwise stack the standard SessionMessageActions chips with the
 *    F6 low-confidence pip when applicable.
 *
 * Returning a single ReactNode (or null) lets the caller pass this straight
 * to ChatShell.renderMessageActions without wrapping logic.
 */
export function renderSessionMessageActions(
  message: ChatMessage,
  {
    birthYear,
    lowConfidenceMessageId,
    setLowConfidenceMessageId,
    continueWithMessage,
    handleStartNewSession,
    handleHomeBack,
    isStreaming,
    actionProps,
  }: {
    birthYear: number | null;
    lowConfidenceMessageId: string | null;
    setLowConfidenceMessageId: (id: string | null) => void;
    continueWithMessage: (text: string) => Promise<unknown> | unknown;
    handleStartNewSession: () => void;
    handleHomeBack: () => void;
    isStreaming: boolean;
    actionProps: Omit<SessionMessageActionsProps, 'message'>;
  },
): React.ReactNode {
  // [M5] Session-expired message: offer escape actions instead of normal chips.
  if (message.kind === 'session_expired') {
    return (
      <View className="flex-row gap-2 mt-2">
        <Pressable
          onPress={handleStartNewSession}
          className="bg-primary rounded-button px-4 py-2.5 items-center justify-center min-h-[40px]"
          accessibilityRole="button"
          accessibilityLabel="Start new session"
          testID="session-expired-new-session"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            Start new session
          </Text>
        </Pressable>
        <Pressable
          onPress={handleHomeBack}
          className="bg-surface-elevated rounded-button px-4 py-2.5 items-center justify-center min-h-[40px]"
          accessibilityRole="button"
          accessibilityLabel="Go Home"
          testID="session-expired-go-home"
        >
          <Text className="text-body-sm font-semibold text-text-secondary">
            Go Home
          </Text>
        </Pressable>
      </View>
    );
  }

  const messageActions = (
    <SessionMessageActions message={message} {...actionProps} />
  );

  // F6: Confidence indicator — only when the LLM reported low confidence on
  // this specific AI message. Dismissed when the learner taps it (sends a
  // follow-up) or when a new exchange completes (lowConfidenceMessageId resets).
  // Copy varies by age bracket so the metacognitive prompt fits the learner's
  // voice — younger ages get softer phrasing, adults get more direct.
  const showConfidenceIndicator =
    message.id === lowConfidenceMessageId && !message.streaming && !isStreaming;
  const confidenceCopy = getConfidenceCopy(birthYear);
  const confidenceIndicator = showConfidenceIndicator ? (
    <Pressable
      onPress={() => {
        setLowConfidenceMessageId(null);
        void continueWithMessage(confidenceCopy.retryMessage);
      }}
      className="rounded-full bg-surface-elevated px-3 py-1.5 self-start mt-1"
      testID="confidence-low-indicator"
      accessibilityRole="button"
      accessibilityLabel={confidenceCopy.accessibilityLabel}
    >
      <Text className="text-caption font-semibold text-text-secondary">
        {confidenceCopy.label}
      </Text>
    </Pressable>
  ) : null;

  if (!messageActions && !confidenceIndicator) return null;
  if (!messageActions) return confidenceIndicator;
  if (!confidenceIndicator) return messageActions;
  return (
    <View className="gap-1">
      {messageActions}
      {confidenceIndicator}
    </View>
  );
}
