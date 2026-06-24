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

import { ErrorFallback } from '../../../../components/common';
import { RecentSessionsList } from '../../../../components/progress';
import { useChildDetail, useDashboard } from '../../../../hooks/use-dashboard';
import { useChildLearnerProfile } from '../../../../hooks/use-learner-profile';
import { useProfileSessions } from '../../../../hooks/use-progress';
import {
  useChildConsentStatus,
  useRevokeConsent,
} from '../../../../hooks/use-consent';
// [F-153] useRestoreConsent moved to use-restore-consent (variables-as-arg pattern)
import { useRestoreConsent } from '../../../../hooks/use-restore-consent';
import { ACCOMMODATION_OPTIONS } from '../../../../lib/accommodation-options';
import { getGracePeriodDaysRemaining } from '../../../../lib/consent-grace';
import { formatApiError } from '../../../../lib/format-api-error';
import { formatShortDate } from '../../../../lib/format-datetime';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../../lib/navigation';
import { platformAlert } from '../../../../lib/platform-alert';
import { isNewLearner } from '../../../../lib/progressive-disclosure';
import { useProfile } from '../../../../lib/profile';
import { useThemeColors } from '../../../../lib/theme';
import type { Translate as I18nTranslate } from '../../../../i18n';

function formatLastSession(
  isoDate: string | null | undefined,
  t: I18nTranslate,
): string | null {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = Date.now() - then.getTime();
  if (diffMs < 60_000) return t('parentView.index.timeAgo.justNow');

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return t('parentView.index.timeAgo.minutes', { count: diffMinutes });
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t('parentView.index.timeAgo.hours', { count: diffHours });
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return t('parentView.index.timeAgo.days', { count: diffDays });
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return t('parentView.index.timeAgo.weeks', { count: diffWeeks });
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return t('parentView.index.timeAgo.months', { count: diffMonths });
  }

  const diffYears = Math.floor(diffDays / 365);
  return t('parentView.index.timeAgo.years', { count: diffYears });
}

function formatJoinedDate(
  isoDate: string | null | undefined,
  locale: string | undefined,
): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return formatShortDate(date, locale, {
    month: 'long',
    year: 'numeric',
  });
}

type DashboardSubject = DashboardChild['subjects'][number];
type SubjectMentorNoteKey =
  | 'parentView.index.subjectSessionNextStep'
  | 'parentView.index.subjectRawMentorSummary'
  | 'parentView.index.subjectRawNextStep'
  | 'parentView.index.subjectQuietSummary'
  | 'parentView.index.subjectQuietNextStep';
type Translate = (
  key: SubjectMentorNoteKey,
  options?: Record<string, unknown>,
) => string;

type SubjectMentorNote = {
  summary: string;
  nextStep: string;
};

type ProgressNudgeAction = {
  subjectId: string;
  subjectName: string;
  focusName: string;
  topicId: string | null;
  topicTitle: string | null;
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
    topicId: latestSession?.topicId?.trim() || null,
    topicTitle: latestSession?.topicTitle ?? null,
    lastSessionLabel,
    lastSessionAt: latestSession?.startedAt ?? null,
    hasSessionHistory: latestSession != null,
  };
}

function sortSubjectsByRecentSession(
  subjects: DashboardSubject[],
  sessions: ChildSession[] | undefined,
): DashboardSubject[] {
  if (!sessions || sessions.length === 0) return subjects;

  const lastSessionBySubject = new Map<string, number>();
  for (const session of sessions) {
    const subjectId = session.subjectId?.trim();
    if (!subjectId) continue;
    const startedAt = Date.parse(session.startedAt);
    if (Number.isNaN(startedAt)) continue;
    const current = lastSessionBySubject.get(subjectId) ?? 0;
    if (startedAt > current) {
      lastSessionBySubject.set(subjectId, startedAt);
    }
  }

  return [...subjects].sort((a, b) => {
    const aId = a.subjectId?.trim() ?? '';
    const bId = b.subjectId?.trim() ?? '';
    const aLast = lastSessionBySubject.get(aId) ?? 0;
    const bLast = lastSessionBySubject.get(bId) ?? 0;
    if (aLast !== bLast) return bLast - aLast;
    return a.name.localeCompare(b.name);
  });
}

function getLatestSessionForSubject(
  subject: DashboardSubject,
  sessions: ChildSession[] | undefined,
): ChildSession | null {
  const subjectId = subject.subjectId?.trim();
  if (!subjectId || !sessions || sessions.length === 0) return null;

  let latestSession: ChildSession | null = null;
  let latestStartedAt = 0;
  for (const session of sessions) {
    if (session.subjectId?.trim() !== subjectId) continue;
    const startedAt = Date.parse(session.startedAt);
    if (Number.isNaN(startedAt)) continue;
    if (!latestSession || startedAt > latestStartedAt) {
      latestSession = session;
      latestStartedAt = startedAt;
    }
  }

  return latestSession;
}

function firstSentence(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^.+?[.!?](?:\s|$)/);
  return (match?.[0] ?? normalized).trim();
}

function sessionMentorSummary(session: ChildSession | null): string | null {
  const summary =
    session?.displaySummary ??
    session?.highlight ??
    session?.narrative ??
    session?.homeworkSummary?.summary ??
    null;
  if (!summary) return null;

  const cleanSummary = firstSentence(summary);
  return cleanSummary.length > 0 ? cleanSummary : null;
}

function buildSubjectMentorNote({
  t,
  childName,
  subject,
  latestSession,
  rawInput,
}: {
  t: Translate;
  childName: string;
  subject: DashboardSubject;
  latestSession: ChildSession | null;
  rawInput: string | null;
}): SubjectMentorNote {
  const latestSummary = sessionMentorSummary(latestSession);
  if (latestSummary) {
    return {
      summary: latestSummary,
      nextStep: t('parentView.index.subjectSessionNextStep', {
        name: childName,
        subject: subject.name,
        defaultValue: `A short follow-up in ${subject.name} would help ${childName} reconnect with it.`,
      }),
    };
  }

  if (rawInput) {
    return {
      summary: t('parentView.index.subjectRawMentorSummary', {
        name: childName,
        subject: subject.name,
        rawInput,
        defaultValue: `This started from "${rawInput}", so ${childName} may still be finding the right shape for ${subject.name}.`,
      }),
      nextStep: t('parentView.index.subjectRawNextStep', {
        defaultValue:
          'One small session can turn that broad interest into a concrete topic.',
      }),
    };
  }

  return {
    summary: t('parentView.index.subjectQuietSummary', {
      name: childName,
      subject: subject.name,
      defaultValue: `${subject.name} is ready when ${childName} wants to return to it.`,
    }),
    nextStep: t('parentView.index.subjectQuietNextStep', {
      defaultValue:
        'Start with one easy question or topic so the restart feels light.',
    }),
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
            ? `Last session was ${action.lastSessionLabel}. Open ${action.subjectName} to find one quick review or next step you can do together.`
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
  childName,
  subject,
  showRetentionBadge,
  latestSession,
}: {
  profileId: string;
  childName: string;
  subject: DashboardSubject;
  showRetentionBadge: boolean;
  latestSession: ChildSession | null;
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
  const translateMentorNote: Translate = (key, options) =>
    t(key, options) as string;
  const mentorNote = buildSubjectMentorNote({
    t: translateMentorNote,
    childName,
    subject,
    latestSession,
    rawInput,
  });

  const content = (
    <View>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pe-3">
          <Text className="text-h3 font-semibold text-text-primary">
            {subject.name}
          </Text>
        </View>
        {showRetentionBadge ? (
          <View className="rounded-full bg-primary-soft px-3 py-1">
            <Text className="text-caption font-semibold text-primary">
              {t(`parentView.retention.${subject.retentionStatus}.label`, {
                defaultValue: subject.retentionStatus,
              })}
            </Text>
          </View>
        ) : null}
        {canOpen ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
            style={{ marginLeft: 10, marginTop: 4 }}
          />
        ) : null}
      </View>
      <View className="mt-3">
        <Text
          className="text-body-sm text-text-primary leading-5"
          numberOfLines={3}
          testID={canOpen ? `subject-mentor-summary-${subjectId}` : undefined}
        >
          {mentorNote.summary}
        </Text>
        <Text
          className="text-caption text-text-secondary mt-2 leading-5"
          numberOfLines={2}
          testID={canOpen ? `subject-mentor-next-step-${subjectId}` : undefined}
        >
          {mentorNote.nextStep}
        </Text>
        {rawInput && !latestSession ? (
          <Text
            className="text-caption text-text-tertiary mt-3"
            testID={canOpen ? `subject-raw-input-${subjectId}` : undefined}
          >
            {t('parentView.index.subjectRawInputAudit', {
              rawInput,
              defaultValue: `Your child searched for "${rawInput}"`,
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!canOpen) {
    return <View className="bg-surface rounded-card p-5 mt-3">{content}</View>;
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
            childName,
          },
        } as Href)
      }
      className="bg-surface rounded-card p-5 mt-3"
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

// [Issue 37b8] Consent mutations are legally sensitive. Never surface the raw
// `err.message` (server-side / Hermes engine strings) to a parent — classify
// the raw error at the API-client boundary, then format a user-safe message.
function consentMutationErrorMessage(err: unknown): string {
  return formatApiError(err);
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
  const restoreConsent = useRestoreConsent();
  const [error, setError] = useState('');
  // [Issue 37b8] Track which mutation failed so the error block can offer a
  // retry that re-runs the SAME action (per the "primary fallback retries the
  // specific problem" UX-resilience rule), not a generic dead-end message.
  const [retryFailedMutation, setRetryFailedMutation] = useState<
    (() => void) | null
  >(null);

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

  // The destructive confirmation has already been granted by the time this
  // runs, so a retry re-runs the mutation directly without re-prompting.
  const runWithdraw = (): void => {
    setError('');
    setRetryFailedMutation(null);
    revokeConsent.mutate(undefined, {
      onError: (err) => {
        setError(consentMutationErrorMessage(err));
        setRetryFailedMutation(() => runWithdraw);
      },
    });
  };

  const handleWithdraw = (): void => {
    setError('');
    setRetryFailedMutation(null);
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
          onPress: runWithdraw,
        },
      ],
    );
  };

  const handleRestore = (): void => {
    setError('');
    setRetryFailedMutation(null);
    restoreConsent.mutate(
      { childProfileId },
      {
        onError: (err) => {
          setError(consentMutationErrorMessage(err));
          setRetryFailedMutation(() => handleRestore);
        },
      },
    );
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
        <View
          className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3 mt-3"
          accessibilityRole="alert"
          testID="consent-management-error"
        >
          <Text className="text-body-sm text-danger">{error}</Text>
          {retryFailedMutation ? (
            <Pressable
              onPress={retryFailedMutation}
              className="bg-surface rounded-button px-4 py-3 min-h-[44px] items-center justify-center mt-3"
              accessibilityRole="button"
              accessibilityLabel={t('common.tryAgain')}
              testID="consent-management-retry"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          ) : null}
        </View>
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
          <ActivityIndicator
            testID="consent-status-loading"
            accessibilityLabel={t('common.loading')}
          />
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
              <ActivityIndicator
                testID="cancel-deletion-loading"
                accessibilityLabel={t('common.loading')}
              />
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
            <ActivityIndicator
              testID="withdraw-consent-loading"
              accessibilityLabel={t('common.loading')}
            />
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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, isLoading: isProfileLoading } = useProfile();
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
  const { data: childConsentData } = useChildConsentStatus(profileId);
  const consentResolved = childConsentData !== undefined;
  const consentWithdrawn = childConsentData?.consentStatus === 'WITHDRAWN';
  const restoreConsentForScreen = useRestoreConsent();
  // [WI-263] Hard-deny until consent is known: do not read the child's learner
  // profile until the consent query has resolved AND is not withdrawn. Gating
  // only on `consentWithdrawn` would still fire the fetch on the first render
  // (before consent loads, when `consentWithdrawn` is false) and leak a read in
  // the withdrawn state this guard exists to block.
  const { data: learnerProfile } = useChildLearnerProfile(
    showSettingsOnly && consentResolved && !consentWithdrawn
      ? profileId
      : undefined,
  );
  const lastSessionAt = sessionsQuery.data?.[0]?.startedAt ?? null;
  const lastSessionLabel = formatLastSession(lastSessionAt, t);
  const joinedLabel = formatJoinedDate(ownedProfile?.createdAt, i18n.language);
  const activeAccommodation = ACCOMMODATION_OPTIONS.find(
    (option) => option.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );
  const resolvedChildName =
    child?.displayName ?? ownedProfile?.displayName ?? null;
  const isChildIdentityLoading =
    resolvedChildName == null &&
    (isProfileLoading || isLoading || dashboardQuery.isLoading);
  const childName = resolvedChildName ?? t('parentView.index.yourChild');
  const progressNudgeAction = useMemo(
    () =>
      buildProgressNudgeAction({
        child,
        latestSession: sessionsQuery.data?.[0],
        lastSessionLabel,
      }),
    [child, lastSessionLabel, sessionsQuery.data],
  );
  const sortedSubjects = useMemo(
    () =>
      sortSubjectsByRecentSession(child?.subjects ?? [], sessionsQuery.data),
    [child?.subjects, sessionsQuery.data],
  );
  const showSubjectRetentionBadges = !isNewLearner(child?.totalSessions);
  const openProgressNudgeAction = (): void => {
    if (!progressNudgeAction) return;

    if (progressNudgeAction.topicId) {
      const totalTopicSessions =
        sessionsQuery.data?.filter(
          (session) => session.topicId === progressNudgeAction.topicId,
        ).length ?? 1;

      router.push({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: {
          profileId,
          topicId: progressNudgeAction.topicId,
          title:
            progressNudgeAction.topicTitle ?? progressNudgeAction.focusName,
          completionStatus: 'in_progress',
          masteryScore: '',
          retentionStatus: '',
          totalSessions: String(Math.max(totalTopicSessions, 1)),
          subjectId: progressNudgeAction.subjectId,
          subjectName: progressNudgeAction.subjectName,
          childName,
        },
      } as Href);
      return;
    }

    router.push({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId,
        subjectId: progressNudgeAction.subjectId,
        subjectName: progressNudgeAction.subjectName,
        childName,
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

  if (!isProfileLoading && profiles.length > 0 && !isOwnedProfile) {
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

  if (isChildIdentityLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-loading"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  const hasKnownChildProfile = child != null || ownedProfile != null;
  const detailUnavailable =
    (!isLoading && childDetail === null && !hasKnownChildProfile) ||
    (isError && !hasKnownChildProfile && !dashboardQuery.isLoading);

  if (detailUnavailable) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-unavailable"
      >
        <ErrorFallback
          variant="centered"
          title={t('parentView.index.profileNoLongerAvailable')}
          message={t('parentView.index.profileRemovedOrNoAccess')}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => void refetch(),
            testID: 'child-profile-retry',
          }}
          secondaryAction={{
            label: t('parentView.index.backToDashboard'),
            onPress: () => router.replace(FAMILY_HOME_PATH as Href),
            testID: 'child-profile-back',
          }}
          testID="child-profile-unavailable-fallback"
        />
      </View>
    );
  }

  if (consentWithdrawn) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="consent-withdrawn-empty-state"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('consent.withdrawn.title')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('consent.withdrawn.hint', { name: childName })}
        </Text>
        <Pressable
          onPress={() =>
            restoreConsentForScreen.mutate({ childProfileId: profileId })
          }
          disabled={restoreConsentForScreen.isPending}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('consent.withdrawn.requestCta')}
          testID="consent-withdrawn-request-cta"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('consent.withdrawn.requestCta')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.replace(FAMILY_HOME_PATH as Href)}
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

        {!showSettingsOnly && sortedSubjects.length > 0 ? (
          <View className="mt-6" testID="child-subjects-section">
            <Text className="text-h3 font-semibold text-text-primary mb-1">
              {t('parentView.index.subjects', {
                defaultValue: 'Subjects',
              })}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-1">
              {t('parentView.index.subjectsDescription', {
                name: childName,
                defaultValue: `${childName}'s active subjects, with the most recent activity first.`,
              })}
            </Text>
            {sortedSubjects.map((subject, index) => (
              <SubjectCard
                key={subject.subjectId ?? index}
                profileId={profileId}
                childName={childName}
                subject={subject}
                showRetentionBadge={showSubjectRetentionBadges}
                latestSession={getLatestSessionForSubject(
                  subject,
                  sessionsQuery.data,
                )}
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

        {showSettingsOnly ? (
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
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
