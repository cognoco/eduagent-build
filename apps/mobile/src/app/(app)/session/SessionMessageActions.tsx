import { View, Text, Pressable } from 'react-native';
import type { ChatMessage } from '../../../components/session';
import { QuotaExceededCard } from '../../../components/session';
import type { QuotaExceededDetails } from '../../../lib/api-client';
import {
  getContextualQuickChips,
  QUICK_CHIP_CONFIG,
  type QuickChipId,
  type MessageFeedbackState,
  type ConversationStage,
} from './session-types';

export interface SessionMessageActionsProps {
  message: ChatMessage;
  isStreaming: boolean;
  latestAiMessageId: string | null;
  consumedQuickChipMessageId: string | null;
  userMessageCount: number;
  showWrongSubjectChip: boolean;
  messageFeedback: Record<string, MessageFeedbackState>;
  quotaError: QuotaExceededDetails | null;
  isOwner: boolean;
  stage: ConversationStage;
  handleQuickChip: (
    chip: QuickChipId,
    sourceMessageId?: string
  ) => Promise<void>;
  handleMessageFeedback: (
    message: ChatMessage,
    action: MessageFeedbackState
  ) => Promise<void>;
  handleReconnect: (messageId: string) => Promise<void>;
}

export function SessionMessageActions({
  message,
  isStreaming,
  latestAiMessageId,
  consumedQuickChipMessageId,
  userMessageCount,
  showWrongSubjectChip,
  messageFeedback,
  quotaError,
  isOwner,
  stage,
  handleQuickChip,
  handleMessageFeedback,
  handleReconnect,
}: SessionMessageActionsProps) {
  if (
    message.role !== 'assistant' ||
    message.streaming ||
    message.isSystemPrompt
  ) {
    if (message.kind === 'reconnect_prompt') {
      return (
        <Pressable
          onPress={() => void handleReconnect(message.id)}
          disabled={isStreaming}
          className="rounded-full bg-primary/15 px-3 py-1.5 self-start"
          testID={`session-reconnect-${message.id}`}
        >
          <Text className="text-caption font-semibold text-primary">
            Reconnect
          </Text>
        </Pressable>
      );
    }
    if (message.kind === 'quota_exceeded' && quotaError) {
      return <QuotaExceededCard details={quotaError} isOwner={isOwner} />;
    }
    return null;
  }

  if (isStreaming) {
    return null;
  }

  // Conversation-stage gating: only show action buttons during teaching.
  // Message content (reconnect, quota) renders unconditionally above this point.
  if (stage !== 'teaching') {
    return null;
  }

  const feedbackState = messageFeedback[message.id];
  const feedbackTestIdSuffix = message.eventId ?? message.id;
  const contextualQuickChips =
    userMessageCount > 0 &&
    message.id !== 'opening' &&
    message.id === latestAiMessageId &&
    message.id !== consumedQuickChipMessageId
      ? getContextualQuickChips(message)
      : [];
  const messageControlChips: Array<{
    id: QuickChipId;
    label: string;
  }> = [
    ...contextualQuickChips.map((chipId) => ({
      id: chipId as QuickChipId,
      label: QUICK_CHIP_CONFIG[chipId].label,
    })),
    ...(showWrongSubjectChip && message.id === latestAiMessageId
      ? [{ id: 'wrong_subject' as QuickChipId, label: 'Wrong subject' }]
      : []),
  ];
  const showFeedbackButtons = !!message.eventId;

  if (messageControlChips.length === 0 && !showFeedbackButtons) {
    return null;
  }

  return (
    <View className="gap-2">
      {messageControlChips.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {messageControlChips.map((chip) => {
            return (
              <Pressable
                key={`${message.id}-${chip.id}`}
                onPress={() => void handleQuickChip(chip.id, message.id)}
                disabled={isStreaming}
                className="rounded-full bg-surface-elevated px-3 py-1.5"
                testID={`quick-chip-${chip.id}`}
              >
                <Text className="text-caption font-semibold text-text-secondary">
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {showFeedbackButtons && (
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'helpful')}
            disabled={feedbackState === 'incorrect' || isStreaming}
            className={
              feedbackState === 'helpful'
                ? 'rounded-full bg-primary/15 px-3 py-1.5'
                : 'rounded-full bg-surface-elevated px-3 py-1.5'
            }
            testID={`message-feedback-helpful-${feedbackTestIdSuffix}`}
          >
            <Text
              className={
                feedbackState === 'helpful'
                  ? 'text-caption font-semibold text-primary'
                  : 'text-caption font-semibold text-text-secondary'
              }
            >
              Helpful
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'not_helpful')}
            disabled={feedbackState === 'incorrect' || isStreaming}
            className={
              feedbackState === 'not_helpful'
                ? 'rounded-full bg-warning/15 px-3 py-1.5'
                : 'rounded-full bg-surface-elevated px-3 py-1.5'
            }
            testID={`message-feedback-not-helpful-${feedbackTestIdSuffix}`}
          >
            <Text
              className={
                feedbackState === 'not_helpful'
                  ? 'text-caption font-semibold text-warning'
                  : 'text-caption font-semibold text-text-secondary'
              }
            >
              Not helpful
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'incorrect')}
            disabled={isStreaming}
            className={
              feedbackState === 'incorrect'
                ? 'rounded-full bg-danger/15 px-3 py-1.5'
                : 'rounded-full bg-surface-elevated px-3 py-1.5'
            }
            testID={`message-feedback-incorrect-${feedbackTestIdSuffix}`}
          >
            <Text
              className={
                feedbackState === 'incorrect'
                  ? 'text-caption font-semibold text-danger'
                  : 'text-caption font-semibold text-text-secondary'
              }
            >
              That&apos;s incorrect
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
