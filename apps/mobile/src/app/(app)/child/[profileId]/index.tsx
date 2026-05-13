import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useChildDetail,
  useChildSessions,
} from '../../../../hooks/use-dashboard';
import { useChildLearnerProfile } from '../../../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../../../lib/accommodation-options';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../../lib/navigation';
import { useProfile } from '../../../../lib/profile';
import { useThemeColors } from '../../../../lib/theme';

function formatLastSession(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = Date.now() - then.getTime();
  if (diffMs < 60_000) return 'just now';

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

function formatJoinedDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function RowLink({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-surface rounded-card px-4 py-3.5 mt-3"
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <View className="w-10 h-10 rounded-full bg-primary-soft items-center justify-center me-3">
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-0.5">
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function InfoRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}): React.ReactElement {
  return (
    <View className="bg-surface rounded-card px-4 py-3.5 mt-3" testID={testID}>
      <Text className="text-caption font-semibold text-text-secondary">
        {label}
      </Text>
      <Text className="text-body font-semibold text-text-primary mt-1">
        {value}
      </Text>
    </View>
  );
}

export default function ChildDetailScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { profiles } = useProfile();
  const { profileId: rawProfileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;

  const ownedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId),
    [profiles, profileId],
  );
  const isOwnedProfile = ownedProfile != null;
  const {
    data: child,
    isLoading,
    isError,
    refetch,
  } = useChildDetail(profileId);
  const sessions = useChildSessions(profileId);
  const { data: learnerProfile } = useChildLearnerProfile(profileId);
  const lastSessionAt = sessions.data?.[0]?.startedAt ?? null;
  const lastSessionLabel = formatLastSession(lastSessionAt);
  const joinedLabel = formatJoinedDate(ownedProfile?.createdAt);
  const activeAccommodation = ACCOMMODATION_OPTIONS.find(
    (option) => option.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );
  const childName =
    child?.displayName ?? ownedProfile?.displayName ?? t('common.loading');

  if (!profileId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-no-id"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('parentView.index.profileNotFound')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('parentView.index.unableToLoadChildDetails')}
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/home' as Href)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="child-profile-no-id-go-home"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.goHome')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if ((!isLoading && child === null) || (isError && !child)) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-unavailable"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('parentView.index.profileNoLongerAvailable')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('parentView.index.profileRemovedOrNoAccess')}
        </Text>
        {isError ? (
          <Pressable
            onPress={() => void refetch()}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
            testID="child-profile-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.replace(FAMILY_HOME_PATH as Href)}
          className="bg-surface rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('parentView.index.backToDashboard')}
          testID="child-profile-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('parentView.index.backToDashboard')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (profiles.length > 0 && !isOwnedProfile) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
        testID="child-profile-no-access"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {t('parentView.index.noAccessToProfile')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, FAMILY_HOME_PATH)}
          className="bg-primary rounded-button px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, FAMILY_HOME_PATH)}
          className="me-3 py-2 pe-2"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {childName}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            {lastSessionLabel
              ? t('parentView.index.lastSessionAgo', {
                  time: lastSessionLabel,
                  defaultValue: `Last session ${lastSessionLabel}`,
                })
              : t('parentView.index.noSessionsYet', {
                  defaultValue: 'No sessions yet',
                })}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        testID="child-detail-scroll"
      >
        {profileId && child?.displayName ? (
          <RowLink
            icon="options-outline"
            title={t('more.accommodation.childScreenTitle', {
              name: child.displayName,
            })}
            subtitle={
              activeAccommodation
                ? `${activeAccommodation.title} - ${activeAccommodation.description}`
                : t('parentView.index.noLearningPreferenceSet', {
                    defaultValue: 'No learning preference set',
                  })
            }
            onPress={() =>
              router.push(
                `/(app)/more/accommodation?childProfileId=${profileId}` as Href,
              )
            }
            testID={`child-accommodation-row-${profileId}`}
          />
        ) : null}

        <RowLink
          icon="sparkles-outline"
          title={t('parentView.index.mentorMemoryTitleFallback')}
          subtitle={t('parentView.index.manageMentorMemoryForChild', {
            name: childName,
            defaultValue: `Manage what the mentor remembers about ${childName}`,
          })}
          onPress={() =>
            router.push({
              pathname: '/(app)/child/[profileId]/mentor-memory',
              params: { profileId },
            } as Href)
          }
          testID="mentor-memory-link"
        />

        {joinedLabel ? (
          <InfoRow
            label={t('parentView.index.profileDetails', {
              defaultValue: 'Profile details',
            })}
            value={t('parentView.index.childProfileJoined', {
              date: joinedLabel,
              defaultValue: `Added ${joinedLabel}`,
            })}
            testID="child-profile-details"
          />
        ) : null}

        <View className="mt-5 rounded-card bg-primary-soft px-4 py-3">
          <View className="flex-row items-start">
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.primary}
            />
            <Text className="text-caption text-text-secondary ms-2 flex-1">
              {t('parentView.index.childProfileScopeHint', {
                defaultValue:
                  'Progress and reports live in their own tabs, so this page only keeps child-specific settings.',
              })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
