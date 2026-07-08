import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback, TimeoutLoader } from '../../../../components/common';
import { useSubjectSessions } from '../../../../hooks/use-subject-sessions';
import { useProgressInventory } from '../../../../hooks/use-progress';
import { goBackOrReplace } from '../../../../lib/navigation';
import { formatRelativeDate } from '../../../../lib/format-relative-date';
import { classifyApiError } from '../../../../lib/format-api-error';
import { useProfile } from '../../../../lib/profile';
import { useActiveProfileRole } from '../../../../hooks/use-active-profile-role';
import { buildSessionDetailHref } from '../../../../lib/session-detail-navigation';

export default function SubjectSessionsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRole();
  const proxyChildProfileId =
    activeProfileRole === 'impersonated-child' ? activeProfile?.id : undefined;
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();

  const inventoryQuery = useProgressInventory();
  const sessionsQuery = useSubjectSessions(subjectId);

  const subject = inventoryQuery.data?.subjects.find(
    (entry) => entry.subjectId === subjectId,
  );
  const sessions = sessionsQuery.data ?? [];
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() =>
              goBackOrReplace(
                router,
                `/(app)/progress/${subjectId ?? ''}` as never,
              )
            }
            className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="subject-sessions-back"
          >
            <Ionicons name="arrow-back" size={24} className="text-primary" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {t('progress.subjectSessions.title')}
            </Text>
            {subject?.subjectName ? (
              <Text className="text-body-sm text-text-secondary mt-0.5">
                {subject.subjectName}
              </Text>
            ) : null}
          </View>
        </View>

        {sessionsQuery.isLoading ? (
          <View className="mt-6">
            <TimeoutLoader
              isLoading
              variant="card"
              title={t('progress.subjectSessions.loadingTooLong')}
              message={t('progress.subjectSessions.loadingMessage')}
              loadingLabel={t('progress.subjectSessions.loadingTooLong')}
              loadingDescription={t('progress.subjectSessions.loadingMessage')}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void sessionsQuery.refetch(),
                testID: 'subject-sessions-timeout-retry',
              }}
              secondaryAction={{
                label: t('common.goBack'),
                onPress: () =>
                  goBackOrReplace(
                    router,
                    `/(app)/progress/${subjectId ?? ''}` as never,
                  ),
                testID: 'subject-sessions-timeout-back',
              }}
              testID="subject-sessions-loading"
              fallbackTestID="subject-sessions-timeout"
            />
          </View>
        ) : sessionsQuery.isError && !sessionsQuery.data ? (
          <View className="mt-6">
            <ErrorFallback
              variant="card"
              message={classifyApiError(sessionsQuery.error).message}
              primaryAction={{
                label: t('common.tryAgain'),
                onPress: () => void sessionsQuery.refetch(),
                testID: 'subject-sessions-error-retry',
              }}
              secondaryAction={{
                label: t('common.goBack'),
                onPress: () =>
                  goBackOrReplace(
                    router,
                    `/(app)/progress/${subjectId ?? ''}` as never,
                  ),
                testID: 'subject-sessions-error-back',
              }}
              testID="subject-sessions-error"
            />
          </View>
        ) : sessions.length === 0 ? (
          <View
            className="mt-6 items-center px-4"
            testID="subject-sessions-empty"
          >
            <Text className="text-body text-text-secondary text-center mb-4">
              {t('progress.subjectSessions.empty')}
            </Text>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/(app)/session',
                  params: {
                    mode: 'learning',
                    subjectId,
                    ...(subject?.subjectName
                      ? { subjectName: subject.subjectName }
                      : {}),
                  },
                } as Href)
              }
              className="bg-primary rounded-button px-6 py-3 items-center min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('recaps.emptyCtaStartSession')}
              testID="subject-sessions-empty-start"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('recaps.emptyCtaStartSession')}
              </Text>
            </Pressable>
          </View>
        ) : (
          sessions.map((session) => {
            const subline = [
              session.bookTitle,
              session.chapter,
              formatRelativeDate(session.createdAt),
            ]
              .filter((s): s is string => !!s)
              .join(' · ');
            return (
              <Pressable
                key={session.id}
                onPress={() =>
                  router.push(
                    buildSessionDetailHref({
                      sessionId: session.id,
                      subjectId,
                      topicId: session.topicId,
                      childProfileId: proxyChildProfileId,
                    }),
                  )
                }
                className="bg-surface rounded-card p-4 mt-3"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'progress.subjectSessions.openSessionFrom',
                  { date: formatRelativeDate(session.createdAt) },
                )}
                testID={`subject-session-${session.id}`}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {session.topicTitle ||
                    t('progress.subjectSessions.untitledTopic')}
                </Text>
                {subline ? (
                  <Text className="text-caption text-text-secondary mt-1">
                    {subline}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
