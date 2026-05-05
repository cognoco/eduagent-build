// [BUG-889] Read-only chat transcript view. The session-summary screen at
// /session-summary/<sessionId> shows mentor stats and the user's own
// end-of-session summary, but never the actual conversation. Returning
// learners had no way to recall what was discussed and were forced to ask
// the mentor to re-explain. This screen renders the exchange history that
// the API already exposes via `GET /sessions/:sessionId/transcript`. The
// session-summary screen now links here via "View full transcript".
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionTranscriptExchange } from '@eduagent/schemas';
import { useSessionTranscript } from '../../hooks/use-sessions';
import { goBackOrReplace } from '../../lib/navigation';
import { stripEnvelopeJson } from '../../lib/strip-envelope';
import { useThemeColors } from '../../lib/theme';
import { ErrorFallback } from '../../components/common';
import { formatApiError } from '../../lib/format-api-error';
import { ArchivedTranscriptCard } from './_components/archived-transcript-card';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isVisibleExchange(e: SessionTranscriptExchange): boolean {
  // Hide system-prompt rows — they leak prompt-template plumbing into a UX
  // that is meant to read as a chat log.
  return e.isSystemPrompt !== true;
}

export default function SessionTranscriptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const transcript = useSessionTranscript(sessionId ?? '');

  const visibleExchanges = useMemo<SessionTranscriptExchange[]>(
    () =>
      transcript.data?.archived === false
        ? transcript.data.exchanges.filter(isVisibleExchange)
        : [],
    [transcript.data]
  );

  if (!sessionId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="session-transcript-no-id"
      >
        <Text className="text-h3 font-semibold text-text-primary mb-2 text-center">
          Missing session
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          We couldn&apos;t tell which conversation to load.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library')}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to library"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Back to library
          </Text>
        </Pressable>
      </View>
    );
  }

  if (transcript.isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="session-transcript-loading"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-3 text-body-sm text-text-secondary">
          Loading transcript...
        </Text>
      </View>
    );
  }

  if (transcript.isError) {
    return (
      <View className="flex-1 bg-background" testID="session-transcript-error">
        <ErrorFallback
          title="Couldn't load conversation"
          message={formatApiError(transcript.error)}
          variant="centered"
          primaryAction={{
            label: 'Retry',
            onPress: () => void transcript.refetch(),
            testID: 'session-transcript-retry',
          }}
          secondaryAction={{
            label: 'Back to library',
            onPress: () => goBackOrReplace(router, '/(app)/library'),
            testID: 'session-transcript-error-back',
          }}
        />
      </View>
    );
  }

  if (transcript.data?.archived === true) {
    return (
      <ArchivedTranscriptCard
        archivedAt={transcript.data.archivedAt}
        summary={transcript.data.summary}
        onBack={() => goBackOrReplace(router, '/(app)/library')}
        onContinueTopic={() => {
          if (transcript.data?.archived !== true) return;
          if (transcript.data.summary.topicId) {
            router.push(
              `/(app)/session/start?topicId=${transcript.data.summary.topicId}`
            );
            return;
          }
          goBackOrReplace(router, '/(app)/library');
        }}
      />
    );
  }

  if (!transcript.data || visibleExchanges.length === 0) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="session-transcript-empty"
      >
        <Text className="text-h3 font-semibold text-text-primary mb-2 text-center">
          No messages yet
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This session doesn&apos;t have any saved exchanges to show.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library')}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to library"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Back to library
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
      testID="session-transcript-screen"
    >
      <View className="flex-row items-center px-4 pb-3 border-b border-border">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library')}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="session-transcript-back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            Conversation
          </Text>
          <Text className="text-caption text-text-secondary">
            {visibleExchanges.length}{' '}
            {visibleExchanges.length === 1 ? 'message' : 'messages'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        testID="session-transcript-scroll"
      >
        {visibleExchanges.map((exchange, index) => {
          const isUser = exchange.role === 'user';
          const key = exchange.eventId ?? `${exchange.role}-${index}`;
          return (
            <View
              key={key}
              className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}
              testID={`transcript-exchange-${index}`}
            >
              <View
                className={`max-w-[85%] rounded-card px-4 py-3 ${
                  isUser ? 'bg-primary' : 'bg-surface-elevated'
                }`}
              >
                <Text
                  className={`text-caption font-semibold mb-1 ${
                    isUser
                      ? 'text-text-inverse opacity-80'
                      : 'text-text-secondary'
                  }`}
                >
                  {isUser ? 'You' : 'MentoMate'}
                  {' · '}
                  {formatTimestamp(exchange.timestamp)}
                </Text>
                <Text
                  className={`text-body ${
                    isUser ? 'text-text-inverse' : 'text-text-primary'
                  }`}
                  selectable
                >
                  {/* [BUG-941] Defense-in-depth: strip any leaked LLM envelope
                      JSON from assistant messages before rendering. The API
                      already runs projectAiResponseContent server-side, but
                      this mirrors the MessageBubble guard so no path can reach
                      the user with a raw envelope. User content is never
                      envelope-shaped, so we only strip for assistant rows. */}
                  {isUser
                    ? exchange.content
                    : stripEnvelopeJson(exchange.content)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
