import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChildSessionTranscript } from '../../../../../hooks/use-dashboard';
import { Button } from '../../../../../components/common/Button';
import { goBackOrReplace } from '../../../../../lib/navigation';

function MessageSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-3 mt-3 w-3/4">
      <View className="bg-border rounded h-4 w-full mb-2" />
      <View className="bg-border rounded h-4 w-2/3" />
    </View>
  );
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionTranscriptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId: rawProfileId, sessionId: rawSessionId } =
    useLocalSearchParams<{
      profileId: string;
      sessionId: string;
    }>();
  // Expo Router can deliver string[] for repeated params — extract scalar
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]
    : rawSessionId;
  const {
    data: transcript,
    isLoading,
    isError,
    refetch,
    error: transcriptError,
  } = useChildSessionTranscript(profileId, sessionId);

  const isSessionNotFound =
    transcriptError !== null &&
    typeof transcriptError === 'object' &&
    'status' in transcriptError &&
    (transcriptError as { status?: unknown }).status === 404;

  const sessionDate = transcript?.session.startedAt
    ? new Date(transcript.session.startedAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="me-3 py-2 pe-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {transcript?.session.homeworkSummary?.displayTitle ??
              'Session Transcript'}
          </Text>
          {transcript && (
            <>
              <Text className="text-body-sm text-text-secondary mt-0.5">
                {sessionDate} &middot; {transcript.session.exchangeCount}{' '}
                exchanges &middot; {transcript.session.sessionType}
              </Text>
              {transcript.session.displaySummary ? (
                <Text className="text-caption text-text-secondary mt-1">
                  {transcript.session.displaySummary}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="transcript-scroll"
      >
        {isLoading ? (
          <>
            <MessageSkeleton />
            <View className="self-end">
              <MessageSkeleton />
            </View>
            <MessageSkeleton />
          </>
        ) : isError && !isSessionNotFound ? (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <Text className="text-text-primary text-body mb-4">
              Could not load session
            </Text>
            <Button
              variant="primary"
              label="Try again"
              onPress={() => refetch()}
              testID="retry-session"
            />
          </View>
        ) : isSessionNotFound ? (
          <View className="py-8 items-center" testID="session-not-found">
            <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
              This session has ended
            </Text>
            <Text className="text-body text-text-secondary text-center mb-6">
              This session is no longer available. You can review other sessions
              from the home screen.
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
              className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="session-not-found-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Go Back
              </Text>
            </Pressable>
          </View>
        ) : transcript && transcript.exchanges.length > 0 ? (
          transcript.exchanges.map((exchange, i) => {
            const isUser = exchange.role === 'user';
            return (
              <View
                key={i}
                className={`mt-3 max-w-[85%] ${
                  isUser ? 'self-end' : 'self-start'
                }`}
                testID={`exchange-${i}`}
              >
                <View
                  className={`rounded-2xl p-3 ${
                    isUser ? 'bg-primary' : 'bg-surface'
                  }`}
                >
                  <Text
                    className={`text-body ${
                      isUser ? 'text-white' : 'text-text-primary'
                    }`}
                  >
                    {exchange.content}
                  </Text>
                </View>
                <View
                  className={`flex-row mt-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <Text className="text-caption text-text-secondary">
                    {formatTimestamp(exchange.timestamp)}
                  </Text>
                  {exchange.escalationRung !== undefined &&
                    exchange.escalationRung !== null &&
                    exchange.escalationRung >= 3 && (
                      <Pressable
                        testID={`guided-info-${i}`}
                        className="flex-row items-center ms-2"
                        accessibilityLabel="Guided — tap for more info"
                        accessibilityRole="button"
                        onPress={() =>
                          Alert.alert(
                            'What does Guided mean?',
                            'Your child needed extra help here, so their learning mate provided more direct guidance. This is normal — it means a tricky concept is being worked through together.',
                            [{ text: 'OK' }]
                          )
                        }
                      >
                        <Text className="text-caption text-text-secondary">
                          Guided
                        </Text>
                        <Ionicons
                          name="information-circle-outline"
                          size={14}
                          className="text-text-secondary ms-0.5"
                        />
                      </Pressable>
                    )}
                </View>
              </View>
            );
          })
        ) : (
          <View className="py-8 items-center" testID="empty-transcript">
            <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
              No transcript available
            </Text>
            <Text className="text-body text-text-secondary text-center mb-6">
              No transcript is available for this session.
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
              className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="empty-transcript-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Go back
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
