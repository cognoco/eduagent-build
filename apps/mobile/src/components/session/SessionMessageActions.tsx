import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '../../lib/haptics';
import { useThemeColors } from '../../lib/theme';
import type { ChatMessage } from './ChatShell';
import { QuotaExceededCard } from './QuotaExceededCard';
import type { QuotaExceededDetails } from '../../lib/api-client';
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
  bookmarkState?: Record<string, string | null>;
  quotaError: QuotaExceededDetails | null;
  isOwner: boolean;
  stage: ConversationStage;
  handleQuickChip: (
    chip: QuickChipId,
    sourceMessageId?: string,
  ) => Promise<void>;
  handleMessageFeedback: (
    message: ChatMessage,
    action: MessageFeedbackState,
  ) => Promise<void>;
  onToggleBookmark?: (message: ChatMessage) => Promise<void> | void;
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
  bookmarkState,
  quotaError,
  isOwner,
  stage,
  handleQuickChip,
  handleMessageFeedback,
  onToggleBookmark,
  handleReconnect,
}: SessionMessageActionsProps) {
  const colors = useThemeColors();

  if (message.kind === 'reconnect_prompt') {
    return (
      <Pressable
        onPress={() => void handleReconnect(message.id)}
        disabled={isStreaming}
        className="rounded-full bg-primary/15 px-3 py-1.5 self-start"
        testID={`session-reconnect-${message.id}`}
        accessibilityRole="button"
        accessibilityLabel="Reconnect to the conversation"
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

  if (
    message.role !== 'assistant' ||
    message.streaming ||
    message.isSystemPrompt
  ) {
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
    <View className="flex-row flex-wrap gap-2 items-center">
      {messageControlChips.map((chip) => {
        return (
          <Pressable
            key={`${message.id}-${chip.id}`}
            onPress={() => void handleQuickChip(chip.id, message.id)}
            disabled={isStreaming}
            className="rounded-full bg-surface-elevated px-3 py-1.5"
            testID={`quick-chip-${chip.id}`}
            // [BUG-874] Without an explicit role + label, screen readers
            // and keyboard users hear plain text for these chips. RN's
            // accessibilityRole="button" maps to role="button" on web.
            accessibilityRole="button"
            accessibilityLabel={chip.label}
          >
            <Text className="text-caption font-semibold text-text-secondary">
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
      {showFeedbackButtons && (
        <View
          className="ms-auto flex-row gap-2 items-center"
          testID={`message-feedback-controls-${feedbackTestIdSuffix}`}
        >
          {/* [BUG-874] Each feedback chip needs explicit role + label so
              screen readers announce them as interactive buttons rather than
              plain text. accessibilityState.selected reflects the toggle
              state for assistive tech. */}
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'helpful')}
            disabled={feedbackState === 'incorrect' || isStreaming}
            className={
              feedbackState === 'helpful'
                ? 'h-9 w-9 rounded-full bg-primary/15 items-center justify-center'
                : 'h-9 w-9 rounded-full bg-surface-elevated items-center justify-center'
            }
            testID={`message-feedback-helpful-${feedbackTestIdSuffix}`}
            accessibilityRole="button"
            accessibilityLabel="Helpful — mark this reply helpful"
            accessibilityState={{
              selected: feedbackState === 'helpful',
              disabled: feedbackState === 'incorrect' || isStreaming,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={
                  feedbackState === 'helpful'
                    ? 'thumbs-up'
                    : 'thumbs-up-outline'
                }
                size={18}
                color={
                  feedbackState === 'helpful'
                    ? colors.primary
                    : colors.textSecondary
                }
              />
            </View>
          </Pressable>
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'not_helpful')}
            disabled={feedbackState === 'incorrect' || isStreaming}
            className={
              feedbackState === 'not_helpful'
                ? 'h-9 w-9 rounded-full bg-warning/15 items-center justify-center'
                : 'h-9 w-9 rounded-full bg-surface-elevated items-center justify-center'
            }
            testID={`message-feedback-not-helpful-${feedbackTestIdSuffix}`}
            accessibilityRole="button"
            accessibilityLabel="Not helpful — mark this reply not helpful"
            accessibilityState={{
              selected: feedbackState === 'not_helpful',
              disabled: feedbackState === 'incorrect' || isStreaming,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={
                  feedbackState === 'not_helpful'
                    ? 'thumbs-down'
                    : 'thumbs-down-outline'
                }
                size={18}
                color={
                  feedbackState === 'not_helpful'
                    ? colors.warning
                    : colors.textSecondary
                }
              />
            </View>
          </Pressable>
          <Pressable
            onPress={() => void handleMessageFeedback(message, 'incorrect')}
            disabled={isStreaming}
            className={
              feedbackState === 'incorrect'
                ? 'h-9 w-9 rounded-full bg-danger/15 items-center justify-center'
                : 'h-9 w-9 rounded-full bg-surface-elevated items-center justify-center'
            }
            testID={`message-feedback-incorrect-${feedbackTestIdSuffix}`}
            accessibilityRole="button"
            accessibilityLabel="Mark this reply as incorrect"
            accessibilityState={{
              selected: feedbackState === 'incorrect',
              disabled: isStreaming,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={
                  feedbackState === 'incorrect'
                    ? 'alert-circle'
                    : 'alert-circle-outline'
                }
                size={18}
                color={
                  feedbackState === 'incorrect'
                    ? colors.danger
                    : colors.textSecondary
                }
              />
            </View>
          </Pressable>
          {message.eventId && onToggleBookmark ? (
            <Pressable
              onPress={() => {
                hapticLight();
                void onToggleBookmark(message);
              }}
              className="ms-auto p-2 min-h-[36px] min-w-[36px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={
                bookmarkState?.[message.eventId]
                  ? 'Remove bookmark'
                  : 'Bookmark this response'
              }
              testID={`bookmark-toggle-${message.eventId}`}
            >
              <Ionicons
                name={
                  bookmarkState?.[message.eventId]
                    ? 'bookmark'
                    : 'bookmark-outline'
                }
                size={22}
                color={
                  bookmarkState?.[message.eventId]
                    ? colors.primary
                    : colors.textSecondary
                }
              />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
