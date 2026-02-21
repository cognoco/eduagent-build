import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChildSessionTranscript } from '../../../../../hooks/use-dashboard';

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
  const { profileId, sessionId } = useLocalSearchParams<{
    profileId: string;
    sessionId: string;
  }>();
  const { data: transcript, isLoading } = useChildSessionTranscript(
    profileId,
    sessionId
  );

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
          onPress={() => router.back()}
          className="mr-3 py-2 pr-2"
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
            Session Transcript
          </Text>
          {transcript && (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {sessionDate} &middot; {transcript.session.exchangeCount}{' '}
              exchanges &middot; {transcript.session.sessionType}
            </Text>
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
                      <Text className="text-caption text-text-secondary ml-2">
                        Guided
                      </Text>
                    )}
                </View>
              </View>
            );
          })
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">
              {transcript === null
                ? 'Session not found'
                : 'No messages in this session'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
