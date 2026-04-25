import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useChildSessionDetail } from '../../../../../hooks/use-dashboard';
import { goBackOrReplace } from '../../../../../lib/navigation';
import { EngagementChip } from '../../../../../components/parent/EngagementChip';
let Clipboard: typeof import('expo-clipboard') | null = null;
try {
  Clipboard = require('expo-clipboard');
} catch {
  // Native module unavailable (dev-client missing expo-clipboard)
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const mins = Math.round(seconds / 60);
  return mins === 1 ? '1 min' : `${mins} min`;
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  const params = useLocalSearchParams<{
    profileId: string;
    sessionId: string;
  }>();
  const profileId = Array.isArray(params.profileId)
    ? params.profileId[0]
    : params.profileId;
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useChildSessionDetail(profileId, sessionId);

  useEffect(() => {
    if (copyState === 'idle') return undefined;

    const timeout = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timeout);
  }, [copyState]);

  async function handleCopyPrompt() {
    if (!session?.conversationPrompt) return;

    try {
      if (!Clipboard?.setStringAsync) throw new Error('Clipboard unavailable');
      await Clipboard.setStringAsync(session.conversationPrompt);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator testID="loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-text-secondary mb-4 text-center">
          Something went wrong loading this session.
        </Text>
        <Pressable
          testID="retry-session"
          onPress={() => refetch()}
          className="rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Retry</Text>
        </Pressable>
        {/* [F-033] Secondary escape — UX resilience rule requires a Go Back
            action on every error state, not just Retry. */}
        <Pressable
          testID="error-go-back"
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mt-3 px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-text-secondary font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View
        testID="session-not-found"
        className="flex-1 items-center justify-center bg-background px-6"
      >
        <Ionicons name="document-text-outline" size={48} color="#888" />
        <Text className="text-text-secondary mt-4 text-center text-base">
          This session is no longer available.
        </Text>
        <Pressable
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mt-4 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const duration = formatDuration(
    session.wallClockSeconds ?? session.durationSeconds
  );
  const hasRecap = Boolean(
    session.narrative ||
      session.highlight ||
      session.conversationPrompt ||
      session.engagementSignal
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 16,
      }}
    >
      {/* Header */}
      <View className="px-4 pt-4">
        <Pressable
          onPress={() =>
            goBackOrReplace(router, `/(app)/child/${profileId}` as const)
          }
          className="mb-4 flex-row items-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} />
        </Pressable>

        <Text className="text-text-primary text-xl font-bold">
          {session.displayTitle}
        </Text>
        <Text className="text-text-secondary mt-1 text-sm">
          {formatDate(session.startedAt)}
        </Text>
      </View>

      {/* Metadata */}
      <View
        testID="session-metadata"
        className="mx-4 mt-4 rounded-xl bg-surface p-4"
      >
        <View className="flex-row justify-between">
          <View>
            <Text className="text-text-secondary text-xs">Duration</Text>
            <Text className="text-text-primary text-base font-medium">
              {duration || '—'}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Type</Text>
            <Text className="text-text-primary text-base font-medium capitalize">
              {session.sessionType}
            </Text>
          </View>
        </View>
      </View>

      {hasRecap ? (
        <>
          {session.narrative ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
                Session recap
              </Text>
              <Text className="text-text-primary text-base leading-relaxed">
                {session.narrative}
              </Text>
            </View>
          ) : null}

          {session.highlight ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
                Highlight
              </Text>
              <Text className="text-text-primary text-base italic leading-relaxed">
                {session.highlight}
              </Text>
            </View>
          ) : null}

          {session.engagementSignal ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
                Engagement
              </Text>
              <EngagementChip signal={session.engagementSignal} />
            </View>
          ) : null}

          {session.conversationPrompt ? (
            <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
                    Try asking
                  </Text>
                  <Text className="text-text-primary text-base leading-relaxed">
                    {session.conversationPrompt}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void handleCopyPrompt()}
                  className="rounded-full bg-background px-3 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Copy conversation prompt"
                  testID="copy-conversation-prompt"
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    {copyState === 'copied'
                      ? 'Copied ✓'
                      : copyState === 'failed'
                      ? 'Copy failed'
                      : 'Copy'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <View
          className="mx-4 mt-4 rounded-xl bg-surface p-4"
          testID="narrative-unavailable"
        >
          <Text className="text-text-primary text-base font-semibold">
            No recap available
          </Text>
          <Text className="text-text-secondary mt-2 text-sm leading-relaxed">
            {/* [BUG-552] The recap may not exist because the session is still
                being processed, was too short, or predates the recap feature.
                Avoid "older session" — any session can lack a recap. */}
            A recap for this session is not available. It may still be
            generating, or the session may have been too short.
          </Text>
          <Pressable
            onPress={() =>
              goBackOrReplace(router, `/(app)/child/${profileId}` as const)
            }
            className="mt-4 self-start rounded-lg bg-primary px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="narrative-unavailable-back"
          >
            <Text className="text-text-inverse font-medium">Go Back</Text>
          </Pressable>
        </View>
      )}

      {/* Summary */}
      <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
        <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
          Session Summary
        </Text>
        {session.displaySummary ? (
          <Text className="text-text-primary text-base leading-relaxed">
            {session.displaySummary}
          </Text>
        ) : (
          <Text className="text-text-tertiary text-base italic">
            {/* [BUG-552] displaySummary is only set for homework sessions,
                so this fires for every learning session — not just old ones. */}
            No summary available for this session.
          </Text>
        )}
      </View>

      {/* Homework details */}
      {session.homeworkSummary && (
        <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
          <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
            Homework Help
          </Text>
          <Text className="text-text-primary text-base leading-relaxed">
            {session.homeworkSummary.summary}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
