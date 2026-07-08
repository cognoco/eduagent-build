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
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { SessionTranscriptExchange } from '@eduagent/schemas';
import { useSessionTranscript } from '../../hooks/use-sessions';
import { goBackOrReplace } from '../../lib/navigation';
import { stripEnvelopeJson } from '../../lib/strip-envelope';
import { useThemeColors } from '../../lib/theme';
import { ErrorFallback, TimeoutLoader } from '../../components/common';
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
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  // [BUG-134] Auth gate — this route is at the root, not under (app)/, so
  // the (app)/_layout.tsx auth guard does NOT fire on deep-link entry.
  // Without this check, an unauthenticated user opening a transcript deep
  // link sees a spinner and then a useless error (the API call fails with
  // 401 once auth headers are missing).
  const { isLoaded: authIsLoaded, isSignedIn } = useAuth();

  const transcript = useSessionTranscript(sessionId ?? '');

  const visibleExchanges = useMemo<SessionTranscriptExchange[]>(
    () =>
      transcript.data?.archived === false
        ? transcript.data.exchanges.filter(isVisibleExchange)
        : [],
    [transcript.data],
  );

  if (!authIsLoaded) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="session-transcript-auth-loading"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  if (!sessionId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="session-transcript-no-id"
      >
        <Text className="text-h3 font-semibold text-text-primary mb-2 text-center">
          {t('sessionTranscript.missingSessionTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('sessionTranscript.missingSessionMessage')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library')}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('sessionTranscript.backToLibrary')}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('sessionTranscript.backToLibrary')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // [BUG-142] Transcript loading needs an escape hatch. Without a timeout the
  // user can sit forever on a spinner when the network is slow or the server
  // is down. TimeoutLoader spins for 15s then flips to ErrorFallback with
  // Retry + Back to library — matching the session-summary pattern and the
  // standard error fallback rule in AGENTS.md > UX Resilience Rules.
  if (transcript.isLoading) {
    return (
      <TimeoutLoader
        isLoading={transcript.isLoading}
        timeoutMs={15_000}
        testID="session-transcript-loading"
        loadingLabel={t('sessionTranscript.loadingTranscript')}
        title={t('sessionTranscript.stillLoadingTitle')}
        message={t('sessionTranscript.stillLoadingMessage')}
        primaryAction={{
          label: t('common.retry'),
          onPress: () => void transcript.refetch(),
          testID: 'session-transcript-timeout-retry',
        }}
        secondaryAction={{
          label: t('sessionTranscript.backToLibrary'),
          onPress: () => goBackOrReplace(router, '/(app)/library'),
          testID: 'session-transcript-timeout-back',
        }}
      />
    );
  }

  if (transcript.isError && !transcript.data) {
    return (
      <View className="flex-1 bg-background" testID="session-transcript-error">
        <ErrorFallback
          title={t('sessionTranscript.loadErrorTitle')}
          message={formatApiError(transcript.error)}
          variant="centered"
          primaryAction={{
            label: t('common.retry'),
            onPress: () => void transcript.refetch(),
            testID: 'session-transcript-retry',
          }}
          secondaryAction={{
            label: t('sessionTranscript.backToLibrary'),
            onPress: () => goBackOrReplace(router, '/(app)/library'),
            testID: 'session-transcript-error-back',
          }}
        />
      </View>
    );
  }

  if (transcript.data?.archived === true) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
      >
        <ArchivedTranscriptCard
          archivedAt={transcript.data.archivedAt}
          summary={transcript.data.summary}
          onBack={() => goBackOrReplace(router, '/(app)/library')}
          onContinueTopic={() => {
            // [BUG-152] Use the object form for router.push instead of a
            // string template. On web the path goes through a different
            // resolver than native and string-templated routes can fail
            // to encode special characters in the param. The object form
            // is the typed-route shape Expo Router prefers.
            if (transcript.data?.archived !== true) return;
            const topicId = transcript.data.summary.topicId;
            if (!topicId) return;
            router.push({
              // [BUG-522] '/(app)/session/start' does not exist — Expo Router
              // returns a silent 404/no-op. Use the canonical session-entry
              // route matching topic/[topicId].tsx:451 and
              // session-summary/[sessionId].tsx pattern.
              pathname: '/(app)/session',
              params: { mode: 'learning', topicId },
            });
          }}
        />
      </View>
    );
  }

  if (!transcript.data || visibleExchanges.length === 0) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="session-transcript-empty"
      >
        <Text className="text-h3 font-semibold text-text-primary mb-2 text-center">
          {t('sessionTranscript.emptyTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('sessionTranscript.emptyMessage')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/library')}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('sessionTranscript.backToLibrary')}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('sessionTranscript.backToLibrary')}
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
          accessibilityLabel={t('common.back')}
          testID="session-transcript-back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {t('sessionTranscript.conversation')}
          </Text>
          <Text className="text-caption text-text-secondary">
            {t('sessionTranscript.messageCount', {
              count: visibleExchanges.length,
            })}
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
                  {isUser ? t('sessionTranscript.you') : 'MentoMate'}
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
