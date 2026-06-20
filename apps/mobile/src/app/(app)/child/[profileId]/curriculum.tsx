import { memo, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DashboardChild } from '@eduagent/schemas';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useDashboard } from '../../../../hooks/use-dashboard';
import { useNavigationContract } from '../../../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';
import {
  childProfileHref,
  FAMILY_HOME_PATH,
  goBackOrReplace,
} from '../../../../lib/navigation';
import { firstParam } from '../../../../lib/route-params';
import { useThemeColors } from '../../../../lib/theme';

type DashboardSubject = DashboardChild['subjects'][number];

function subjectId(subject: DashboardSubject): string | null {
  const id = subject.subjectId?.trim();
  return id && id.length > 0 ? id : null;
}

// Hoisted outside component to avoid recreation on every render (BUG-745)
const CURRICULUM_CONTENT_CONTAINER_STYLE = {
  paddingHorizontal: 20,
} as const;

const SubjectRow = memo(function SubjectRow({
  childName,
  profileId,
  subject,
}: {
  childName: string;
  profileId: string;
  subject: DashboardSubject;
}): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const id = subjectId(subject);
  const rawInput =
    subject.rawInput &&
    subject.rawInput.trim().toLowerCase() !== subject.name.trim().toLowerCase()
      ? subject.rawInput.trim()
      : null;

  const content = (
    <View className="flex-row items-center">
      <View className="flex-1">
        <Text className="text-body font-semibold text-text-primary">
          {subject.name}
        </Text>
        {rawInput ? (
          <Text className="mt-1 text-caption text-text-secondary">
            {t('parentView.index.subjectRawInputAudit', {
              rawInput,
              defaultValue: `Started from: ${rawInput}`,
            })}
          </Text>
        ) : null}
        <Text className="mt-2 text-caption font-semibold text-primary">
          {t(`parentView.retention.${subject.retentionStatus}.label`, {
            defaultValue: subject.retentionStatus,
          })}
        </Text>
      </View>
      {id ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
          style={{ marginLeft: 10 }}
        />
      ) : null}
    </View>
  );

  if (!id) {
    return <View className="mt-3 rounded-card bg-surface p-4">{content}</View>;
  }

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
          params: {
            profileId,
            subjectId: id,
            subjectName: subject.name,
            childName,
          },
        } as Href)
      }
      className="mt-3 rounded-card bg-surface p-4"
      accessibilityRole="button"
      accessibilityLabel={t('parentView.index.openSubjectProgress', {
        subject: subject.name,
        defaultValue: `Open ${subject.name} progress`,
      })}
      testID={`child-curriculum-subject-${id}`}
    >
      {content}
    </Pressable>
  );
});

function NotLinkedEmptyState({
  onPress,
}: {
  onPress: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="child-curriculum-not-linked"
    >
      <Text className="mb-2 text-center text-h3 font-semibold text-text-primary">
        {t('parentView.index.curriculumNotAvailableTitle', {
          defaultValue: "This child's curriculum is not available",
        })}
      </Text>
      <Text className="mb-6 text-center text-body text-text-secondary">
        {t('parentView.index.curriculumNotAvailableBody', {
          defaultValue:
            'You can only review curriculum for children linked to your family account.',
        })}
      </Text>
      <Pressable
        onPress={onPress}
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
        accessibilityRole="button"
        accessibilityLabel={t('tabs.children')}
        testID="child-curriculum-not-linked-back"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('tabs.children')}
        </Text>
      </Pressable>
    </View>
  );
}

export default function ChildCurriculumScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ profileId?: string | string[] }>();
  const profileId = firstParam(params.profileId);
  const navigationContract = useNavigationContract();
  const childQuery = useChildDetail(profileId);
  const dashboardQuery = useDashboard();
  const dashboardChild = useMemo(
    () =>
      dashboardQuery.data?.children.find(
        (entry) => entry.profileId === profileId,
      ) ?? null,
    [dashboardQuery.data?.children, profileId],
  );
  const child = childQuery.data ?? dashboardChild;
  const childName = child?.displayName ?? t('common.loading');
  const subjects = child?.subjects ?? [];
  const backHref: Href = profileId
    ? childProfileHref(profileId)
    : (FAMILY_HOME_PATH as Href);

  const contentContainerStyle = useMemo(
    () => ({
      ...CURRICULUM_CONTENT_CONTAINER_STYLE,
      paddingBottom: insets.bottom + 24,
    }),
    [insets.bottom],
  );

  if (
    FEATURE_FLAGS.MODE_NAV_V1_ENABLED &&
    profileId &&
    !navigationContract.canEnter('child/[profileId]/curriculum', { profileId })
  ) {
    return (
      <NotLinkedEmptyState
        onPress={() => goBackOrReplace(router, FAMILY_HOME_PATH as Href)}
      />
    );
  }

  if (!profileId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-curriculum-missing-profile"
      >
        <Text className="mb-2 text-center text-h3 font-semibold text-text-primary">
          {t('parentView.index.profileNotFound')}
        </Text>
        <Text className="mb-6 text-center text-body text-text-secondary">
          {t('parentView.index.unableToLoadChildDetails')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, FAMILY_HOME_PATH as Href)}
          className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="child-curriculum-missing-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (childQuery.isLoading && !child) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-curriculum-loading"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (childQuery.isError && !child) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-curriculum-error"
      >
        <Text className="mb-2 text-center text-h3 font-semibold text-text-primary">
          {t('parentView.subjects.couldNotLoadTopics')}
        </Text>
        <Text className="mb-6 text-center text-body text-text-secondary">
          {t('parentView.subjects.somethingWentWrong')}
        </Text>
        <Pressable
          onPress={() => void childQuery.refetch()}
          className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel={t('common.tryAgain')}
          testID="child-curriculum-retry"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.tryAgain')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => goBackOrReplace(router, backHref)}
          className="mt-3 min-h-[44px] items-center justify-center px-6 py-3"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="child-curriculum-error-back"
        >
          <Text className="text-body font-semibold text-primary">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const header = (
    <View className="flex-row items-center pb-2 pt-4">
      <Pressable
        onPress={() => goBackOrReplace(router, backHref)}
        className="me-3 min-h-[44px] min-w-[44px] items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
        testID="child-curriculum-back"
      >
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View className="flex-1">
        <Text className="text-h2 font-bold text-text-primary">
          {t('parentView.index.curriculumTitle', {
            defaultValue: 'Curriculum',
          })}
        </Text>
        <Text className="mt-1 text-body-sm text-text-secondary">
          {t('parentView.index.curriculumSubtitle', {
            name: childName,
            defaultValue: `Browse ${childName}'s subjects and topics`,
          })}
        </Text>
      </View>
    </View>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="child-curriculum-screen"
    >
      {subjects.length > 0 ? (
        <FlatList
          className="flex-1"
          data={subjects}
          keyExtractor={(subject, index) =>
            subject.subjectId ?? `${subject.name}-${index}`
          }
          renderItem={({ item: subject, index }) => (
            <SubjectRow
              key={subject.subjectId ?? `${subject.name}-${index}`}
              profileId={profileId}
              childName={childName}
              subject={subject}
            />
          )}
          ListHeaderComponent={header}
          contentContainerStyle={contentContainerStyle}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          testID="child-curriculum-scroll"
        />
      ) : (
        <View className="flex-1 px-5">
          {header}
          <View
            className="mt-6 rounded-card bg-surface p-4"
            testID="child-curriculum-empty"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.subjects.noTopicsYetTitle', {
                defaultValue: 'No lesson topics yet',
              })}
            </Text>
            <Text className="mt-2 text-body-sm text-text-secondary">
              {t('parentView.subjects.noTopicsYetBody', {
                defaultValue:
                  'Sessions may still exist before lesson-level progress is ready.',
              })}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
