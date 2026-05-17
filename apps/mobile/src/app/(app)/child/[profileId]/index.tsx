import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChildSession, DashboardChild } from '@eduagent/schemas';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecentSessionsList } from '../../../../components/progress';
import { useChildDetail, useDashboard } from '../../../../hooks/use-dashboard';
import { useChildLearnerProfile } from '../../../../hooks/use-learner-profile';
import { useProfileSessions } from '../../../../hooks/use-progress';
import {
  useChildConsentStatus,
  useRestoreConsent,
  useRevokeConsent,
} from '../../../../hooks/use-consent';
import { ACCOMMODATION_OPTIONS } from '../../../../lib/accommodation-options';
import { getGracePeriodDaysRemaining } from '../../../../lib/consent-grace';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../../lib/navigation';
import { platformAlert } from '../../../../lib/platform-alert';
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

type DashboardSubject = DashboardChild['subjects'][number];

type ProgressNudgeAction = {
  subjectId: string;
  subjectName: string;
  focusName: string;
  lastSessionLabel: string | null;
  lastSessionAt: string | null;
  hasSessionHistory: boolean;
};

type SessionRecency = 'fresh' | 'recent' | 'stale' | 'none';

function getSessionRecency(isoDate: string | null): SessionRecency {
  if (!isoDate) return 'none';
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return 'none';
  const diffMs = Date.now() - then.getTime();
  if (diffMs < 24 * 60 * 60 * 1000) return 'fresh';
  if (diffMs < 7 * 24 * 60 * 60 * 1000) return 'recent';
  return 'stale';
}

function buildProgressNudgeAction({
  child,
  latestSession,
  lastSessionLabel,
}: {
  child: DashboardChild | null | undefined;
  latestSession: ChildSession | undefined;
  lastSessionLabel: string | null;
}): ProgressNudgeAction | null {
  const subjects = child?.subjects ?? [];
  const sessionSubjectId = latestSession?.subjectId?.trim();
  const sessionSubject = sessionSubjectId
    ? subjects.find((subject) => subject.subjectId === sessionSubjectId)
    : undefined;
  const focusName =
    latestSession?.topicTitle ??
    child?.currentlyWorkingOn?.[0] ??
    sessionSubject?.name ??
    subjects[0]?.name;
  const subject =
    sessionSubject ??
    (focusName
      ? subjects.find((entry) => entry.name === focusName)
      : undefined) ??
    subjects[0];
  const subjectId =
    typeof subject?.subjectId === 'string' ? subject.subjectId.trim() : '';

  if (!subject || subjectId.length === 0 || !focusName) {
    return null;
  }

  return {
    subjectId,
    subjectName: subject.name,
    focusName,
    lastSessionLabel,
    lastSessionAt: latestSession?.startedAt ?? null,
    hasSessionHistory: latestSession != null,
  };
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

function ProgressNudgeCard({
  childName,
  action,
  onPress,
}: {
  childName: string;
  action: ProgressNudgeAction;
  onPress: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const recency = getSessionRecency(action.lastSessionAt);
  const titleKey =
    recency === 'fresh'
      ? 'parentView.index.progressNudgeFreshTitle'
      : recency === 'recent'
        ? 'parentView.index.progressNudgeRecentTitle'
        : recency === 'stale'
          ? 'parentView.index.progressNudgeStaleTitle'
          : 'parentView.index.progressNudgeStartTitle';
  const subtitleKey =
    recency === 'fresh'
      ? 'parentView.index.progressNudgeFreshSubtitle'
      : recency === 'recent'
        ? 'parentView.index.progressNudgeRecentSubtitle'
        : recency === 'stale'
          ? 'parentView.index.progressNudgeStaleSubtitle'
          : 'parentView.index.progressNudgeStartSubtitle';
  const title = t(titleKey, {
    name: childName,
    focus: action.focusName,
    defaultValue:
      recency === 'fresh'
        ? `Ask about ${action.focusName} while it is fresh`
        : recency === 'recent'
          ? `Keep ${action.focusName} warm`
          : recency === 'stale'
            ? `Help ${childName} ease back into ${action.focusName}`
            : `Learn alongside ${childName}`,
  });
  const subtitle = t(subtitleKey, {
    name: childName,
    focus: action.focusName,
    subject: action.subjectName,
    time: action.lastSessionLabel,
    defaultValue:
      recency === 'fresh'
        ? `${childName} studied ${action.focusName} ${action.lastSessionLabel}. Try a quick pass yourself, then ask what clicked.`
        : recency === 'recent'
          ? `${childName} last touched ${action.focusName} ${action.lastSessionLabel}. Open ${action.subjectName}, take a quick look yourself, then pick one follow-up question.`
          : recency === 'stale'
            ? `Last session was ${action.lastSessionLabel}. Open ${action.subjectName}, preview a small step yourself, then invite ${childName} back in.`
            : `Open ${action.subjectName} to see what is ready, then try a small lesson yourself so you can help.`,
  });

  return (
    <Pressable
      onPress={onPress}
      className="mt-4 rounded-card bg-primary-soft px-4 py-4"
      accessibilityRole="button"
      accessibilityLabel={title}
      testID="child-progress-nudge-card"
    >
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-full bg-surface items-center justify-center me-3">
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {subtitle}
          </Text>
          <Text className="text-body-sm font-semibold text-primary mt-3">
            {t('parentView.index.openProgressNudgeAction', {
              subject: action.subjectName,
              defaultValue: `Open ${action.subjectName}`,
            })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function SubjectCard({
  profileId,
  subject,
}: {
  profileId: string;
  subject: DashboardSubject;
}): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const subjectId =
    typeof subject.subjectId === 'string' ? subject.subjectId.trim() : '';
  const canOpen = subjectId.length > 0;
  const rawInput =
    subject.rawInput &&
    subject.rawInput.trim().toLowerCase() !== subject.name.trim().toLowerCase()
      ? subject.rawInput.trim()
      : null;

  const content = (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 pe-3">
        <Text className="text-body font-semibold text-text-primary">
          {subject.name}
        </Text>
        {rawInput ? (
          <Text
            className="text-caption text-text-secondary mt-1"
            testID={canOpen ? `subject-raw-input-${subjectId}` : undefined}
          >
            {t('parentView.index.subjectRawInputAudit', {
              rawInput,
              defaultValue: `Your child searched for "${rawInput}"`,
            })}
          </Text>
        ) : null}
      </View>
      <View className="rounded-full bg-primary-soft px-3 py-1">
        <Text className="text-caption font-semibold text-primary">
          {t(`parentView.retention.${subject.retentionStatus}`, {
            defaultValue: subject.retentionStatus,
          })}
        </Text>
      </View>
      {canOpen ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
          style={{ marginLeft: 10 }}
        />
      ) : null}
    </View>
  );

  if (!canOpen) {
    return <View className="bg-surface rounded-card p-4 mt-3">{content}</View>;
  }

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
          params: {
            profileId,
            subjectId,
            subjectName: subject.name,
          },
        } as Href)
      }
      className="bg-surface rounded-card p-4 mt-3"
      accessibilityRole="button"
      accessibilityLabel={t('parentView.index.openSubjectProgress', {
        subject: subject.name,
        defaultValue: `Open ${subject.name} progress`,
      })}
      testID={`subject-card-${subjectId}`}
    >
      {content}
    </Pressable>
  );
}

function consentMutationErrorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : 'Could not update consent. Please try again.';
}

function ConsentManagementSection({
  childProfileId,
  childName,
}: {
  childProfileId: string;
  childName: string;
}): React.ReactElement | null {
  const { t } = useTranslation();
  const consent = useChildConsentStatus(childProfileId);
  const revokeConsent = useRevokeConsent(childProfileId);
  const restoreConsent = useRestoreConsent(childProfileId);
  const [error, setError] = useState('');

  const consentStatus = consent.data?.consentStatus ?? null;
  const hasConsentRecord =
    consent.isLoading ||
    consent.isError ||
    consentStatus === 'CONSENTED' ||
    consentStatus === 'WITHDRAWN';

  if (!hasConsentRecord) return null;

  const isWithdrawn = consentStatus === 'WITHDRAWN';
  const daysRemaining = isWithdrawn
    ? getGracePeriodDaysRemaining(consent.data?.respondedAt ?? null)
    : 0;

  const handleWithdraw = (): void => {
    setError('');
    platformAlert(
      t('parentView.index.withdrawConsentConfirmTitle', {
        childName,
        defaultValue: `Withdraw consent for ${childName}?`,
      }),
      t('parentView.index.withdrawConsentBody', {
        childName,
        defaultValue:
          'Learning access will pause and account deletion will be scheduled. You can cancel during the grace period.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('parentView.index.confirmWithdrawConsent', {
            defaultValue: 'Withdraw',
          }),
          style: 'destructive',
          onPress: () => {
            revokeConsent.mutate(undefined, {
              onError: (err) => setError(consentMutationErrorMessage(err)),
            });
          },
        },
      ],
    );
  };

  const handleRestore = (): void => {
    setError('');
    restoreConsent.mutate(undefined, {
      onError: (err) => setError(consentMutationErrorMessage(err)),
    });
  };

  return (
    <View
      className="bg-surface rounded-card px-4 py-4 mt-3"
      testID="consent-section"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('parentView.index.consentTitle', {
          defaultValue: 'Consent',
        })}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1">
        {t('parentView.index.consentDescription', {
          name: childName,
          defaultValue: `Manage parental consent for ${childName}.`,
        })}
      </Text>

      {error !== '' ? (
        <Text
          className="text-body-sm text-danger mt-3"
          accessibilityRole="alert"
          testID="consent-management-error"
        >
          {error}
        </Text>
      ) : null}

      {consent.isError ? (
        <View
          className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3 mt-4"
          accessibilityRole="alert"
          testID="consent-status-error"
        >
          <Text className="text-body-sm text-danger">
            {t('parentView.index.consentStatusError', {
              defaultValue: 'Could not load consent status. Please try again.',
            })}
          </Text>
          <Pressable
            onPress={() => void consent.refetch()}
            className="bg-surface rounded-button px-4 py-3 min-h-[44px] items-center justify-center mt-3"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
            testID="consent-status-retry"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : consent.isLoading ? (
        <View className="py-4 items-start">
          <ActivityIndicator testID="consent-status-loading" />
        </View>
      ) : isWithdrawn ? (
        <View
          className="bg-warning/10 border border-warning/30 rounded-card px-3 py-3 mt-4"
          accessibilityRole="alert"
          testID="grace-period-banner"
        >
          <Text className="text-body font-semibold text-warning">
            {t('parentView.index.deletionPending', {
              defaultValue: 'Deletion pending',
            })}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {daysRemaining > 0
              ? t('parentView.index.deletionGraceDays', {
                  count: daysRemaining,
                  defaultValue: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to cancel deletion.`,
                })
              : t('parentView.index.deletionGraceFallback', {
                  defaultValue:
                    'Deletion is scheduled. Try cancelling now if this was a mistake.',
                })}
          </Text>
          <Pressable
            onPress={handleRestore}
            disabled={restoreConsent.isPending}
            className="bg-warning rounded-button px-4 py-3 min-h-[44px] items-center justify-center mt-3"
            accessibilityRole="button"
            accessibilityLabel={t('parentView.index.cancelDeletion', {
              defaultValue: 'Cancel deletion',
            })}
            testID="cancel-deletion-button"
          >
            {restoreConsent.isPending ? (
              <ActivityIndicator testID="cancel-deletion-loading" />
            ) : (
              <Text className="text-body font-semibold text-text-inverse">
                {t('parentView.index.cancelDeletion', {
                  defaultValue: 'Cancel deletion',
                })}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={handleWithdraw}
          disabled={revokeConsent.isPending}
          className="border border-danger rounded-button px-4 py-3 min-h-[44px] items-center justify-center mt-4"
          accessibilityRole="button"
          accessibilityLabel={t('parentView.index.withdrawConsent', {
            defaultValue: 'Withdraw consent',
          })}
          testID="withdraw-consent-button"
        >
          {revokeConsent.isPending ? (
            <ActivityIndicator testID="withdraw-consent-loading" />
          ) : (
            <Text className="text-body font-semibold text-danger">
              {t('parentView.index.withdrawConsent', {
                defaultValue: 'Withdraw consent',
              })}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function ChildDetailScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { profiles } = useProfile();
  const { profileId: rawProfileId, mode: rawMode } = useLocalSearchParams<{
    profileId: string;
    mode?: string;
  }>();
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  const showSettingsOnly = mode === 'settings';
  const showProgressOnly = mode === 'progress';

  const ownedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId),
    [profiles, profileId],
  );
  const isOwnedProfile = ownedProfile != null;
  const {
    data: childDetail,
    isLoading,
    isError,
    refetch,
  } = useChildDetail(profileId);
  const dashboardQuery = useDashboard();
  const dashboardChild = useMemo(
    () =>
      dashboardQuery.data?.children.find(
        (entry) => entry.profileId === profileId,
      ) ?? null,
    [dashboardQuery.data?.children, profileId],
  );
  const child = childDetail ?? dashboardChild;
  const sessionsQuery = useProfileSessions(profileId);
  const { data: learnerProfile } = useChildLearnerProfile(profileId);
  const lastSessionAt = sessionsQuery.data?.[0]?.startedAt ?? null;
  const lastSessionLabel = formatLastSession(lastSessionAt);
  const joinedLabel = formatJoinedDate(ownedProfile?.createdAt);
  const activeAccommodation = ACCOMMODATION_OPTIONS.find(
    (option) => option.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );
  const childName =
    child?.displayName ?? ownedProfile?.displayName ?? t('common.loading');
  const progressNudgeAction = useMemo(
    () =>
      buildProgressNudgeAction({
        child,
        latestSession: sessionsQuery.data?.[0],
        lastSessionLabel,
      }),
    [child, lastSessionLabel, sessionsQuery.data],
  );
  const openProgressNudgeAction = (): void => {
    if (!progressNudgeAction) return;
    router.push({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId,
        subjectId: progressNudgeAction.subjectId,
        subjectName: progressNudgeAction.subjectName,
      },
    } as Href);
  };

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

  const detailUnavailable =
    (!isLoading && childDetail === null && !child) ||
    (isError && !child && !dashboardQuery.isLoading);

  if (detailUnavailable) {
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
        {showProgressOnly && progressNudgeAction ? (
          <ProgressNudgeCard
            childName={childName}
            action={progressNudgeAction}
            onPress={openProgressNudgeAction}
          />
        ) : null}

        {!showSettingsOnly && !showProgressOnly ? (
          <RowLink
            icon="document-text-outline"
            title={t('parentView.reports.title', {
              defaultValue: 'Reports',
            })}
            subtitle={t('parentView.index.reportsSubtitle', {
              name: childName,
              defaultValue: `Weekly and monthly updates for ${childName}`,
            })}
            onPress={() =>
              router.push({
                pathname: '/(app)/child/[profileId]/reports',
                params: { profileId },
              } as Href)
            }
            testID="child-reports-link"
          />
        ) : null}

        {!showSettingsOnly && child?.subjects && child.subjects.length > 0 ? (
          <View className="mt-6" testID="child-subjects-section">
            <Text className="text-h3 font-semibold text-text-primary mb-1">
              {t('parentView.index.subjects', {
                defaultValue: 'Subjects',
              })}
            </Text>
            {child.subjects.map((subject, index) => (
              <SubjectCard
                key={subject.subjectId ?? index}
                profileId={profileId}
                subject={subject}
              />
            ))}
          </View>
        ) : null}

        {!showSettingsOnly ? (
          <RecentSessionsList
            profileId={profileId}
            sessionsQuery={sessionsQuery}
          />
        ) : null}

        {!showProgressOnly ? (
          <>
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

            <ConsentManagementSection
              childProfileId={profileId}
              childName={childName}
            />

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
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
