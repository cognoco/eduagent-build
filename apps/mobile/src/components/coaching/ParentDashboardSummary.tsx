import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ConsentStatus } from '@eduagent/schemas';

import { BaseCoachingCard } from './BaseCoachingCard';
import { RetentionSignal, type RetentionStatus } from '../progress';
import { useThemeColors } from '../../lib/theme';
import {
  isNewLearner,
  sessionsUntilFullProgress,
} from '../../lib/progressive-disclosure';
import { SamplePreview } from '../parent/SamplePreview';
import { MetricInfoDot } from '../parent/MetricInfoDot';

interface SubjectInfo {
  name: string;
  retentionStatus: RetentionStatus;
}

interface ParentDashboardSummaryProps {
  profileId: string;
  childName: string;
  summary: string;
  subjects: SubjectInfo[];
  trend: 'up' | 'down' | 'stable';
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeek: number;
  totalTimeLastWeek: number;
  exchangesThisWeek?: number;
  exchangesLastWeek?: number;
  guidedVsImmediateRatio?: number;
  currentStreak?: number;
  totalXp?: number;
  consentStatus?: ConsentStatus | null;
  retentionTrend?: 'improving' | 'declining' | 'stable';
  totalSessions?: number;
  progress?: {
    topicsMastered: number;
    vocabularyTotal: number;
    weeklyDeltaTopicsMastered: number | null;
    weeklyDeltaVocabularyTotal: number | null;
    weeklyDeltaTopicsExplored: number | null;
    engagementTrend: 'increasing' | 'stable' | 'declining';
    guidance: string | null;
  } | null;
  onDrillDown: () => void;
  isLoading?: boolean;
}

const TREND_ARROWS: Record<'up' | 'down' | 'stable', string> = {
  up: '\u2191',
  down: '\u2193',
  stable: '\u2192',
};

const TREND_LABELS: Record<'up' | 'down' | 'stable', string> = {
  up: 'up from',
  down: 'down from',
  stable: 'same as',
};

const RETENTION_TREND_CONFIG: Record<
  'improving' | 'declining' | 'stable',
  { arrow: string; labelKey: string; className: string }
> = {
  improving: {
    arrow: '\u2191',
    labelKey: 'coaching.parentDashboard.retentionTrend.improving',
    className: 'text-retention-strong',
  },
  declining: {
    arrow: '\u2193',
    labelKey: 'coaching.parentDashboard.retentionTrend.declining',
    className: 'text-retention-weak',
  },
  stable: {
    arrow: '\u2192',
    labelKey: 'coaching.parentDashboard.retentionTrend.stable',
    className: 'text-text-secondary',
  },
};

const AGGREGATE_SIGNAL_CONFIG: Record<
  'on-track' | 'needs-attention' | 'falling-behind',
  {
    icon: keyof typeof Ionicons.glyphMap;
    colorKey: 'retentionStrong' | 'retentionFading' | 'retentionWeak';
    labelKey: string;
    textColor: string;
  }
> = {
  'on-track': {
    icon: 'leaf',
    colorKey: 'retentionStrong',
    labelKey: 'coaching.parentDashboard.signal.onTrack',
    textColor: 'text-retention-strong',
  },
  'needs-attention': {
    icon: 'flame',
    colorKey: 'retentionFading',
    labelKey: 'coaching.parentDashboard.signal.needsAttention',
    textColor: 'text-retention-fading',
  },
  'falling-behind': {
    icon: 'sparkles',
    colorKey: 'retentionWeak',
    labelKey: 'coaching.parentDashboard.signal.fallingBehind',
    textColor: 'text-retention-weak',
  },
};

type AggregateSignal = keyof typeof AGGREGATE_SIGNAL_CONFIG;

function deriveAggregateSignal(
  subjects: SubjectInfo[],
): AggregateSignal | null {
  if (subjects.length === 0) return null;

  const hasWeakOrForgotten = subjects.some(
    (s) => s.retentionStatus === 'weak' || s.retentionStatus === 'forgotten',
  );
  if (hasWeakOrForgotten) return 'falling-behind';

  const hasFading = subjects.some((s) => s.retentionStatus === 'fading');
  if (hasFading) return 'needs-attention';

  return 'on-track';
}

const formatTime = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

function sessionWord(n: number): string {
  return n === 1 ? 'session' : 'sessions';
}

function consentStatusLabelKey(
  status: ConsentStatus | null | undefined,
): string | null {
  switch (status) {
    case 'PENDING':
      return 'coaching.parentDashboard.consent.pending';
    case 'PARENTAL_CONSENT_REQUESTED':
      return 'coaching.parentDashboard.consent.parentalConsentRequested';
    case 'WITHDRAWN':
      return 'coaching.parentDashboard.consent.withdrawn';
    case 'CONSENTED':
      return 'coaching.parentDashboard.consent.consented';
    default:
      return null;
  }
}

function consentStatusMessageKey(
  status: ConsentStatus | null | undefined,
): string {
  switch (status) {
    case 'PENDING':
      return 'coaching.parentDashboard.consent.pendingMessage';
    case 'PARENTAL_CONSENT_REQUESTED':
      return 'coaching.parentDashboard.consent.parentalConsentRequestedMessage';
    case 'WITHDRAWN':
      return 'coaching.parentDashboard.consent.withdrawnMessage';
    default:
      return 'coaching.parentDashboard.consent.redactedMessage';
  }
}

function consentPrimaryLabelKey(
  status: ConsentStatus | null | undefined,
): string {
  switch (status) {
    case 'WITHDRAWN':
      return 'coaching.parentDashboard.consent.restoreAction';
    case 'PENDING':
    case 'PARENTAL_CONSENT_REQUESTED':
      return 'coaching.parentDashboard.consent.checkStatusAction';
    default:
      return 'coaching.parentDashboard.viewDetails';
  }
}

function engagementTrendLabelKey(
  trend: 'increasing' | 'stable' | 'declining',
): string {
  switch (trend) {
    case 'increasing':
      return 'coaching.parentDashboard.engagementTrend.increasing';
    case 'declining':
      return 'coaching.parentDashboard.engagementTrend.declining';
    case 'stable':
      return 'coaching.parentDashboard.engagementTrend.stable';
  }
}

function signedDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function ParentDashboardSummary({
  profileId,
  childName,
  summary,
  subjects,
  trend,
  sessionsThisWeek,
  sessionsLastWeek,
  totalTimeThisWeek,
  totalTimeLastWeek,
  exchangesThisWeek = 0,
  exchangesLastWeek = 0,
  guidedVsImmediateRatio = 0,
  currentStreak = 0,
  totalXp = 0,
  consentStatus,
  retentionTrend,
  totalSessions,
  progress,
  onDrillDown,
  isLoading,
}: ParentDashboardSummaryProps): ReactNode {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const aggregateSignal = deriveAggregateSignal(subjects);
  const showFullSignals = !isNewLearner(totalSessions);
  const remaining = sessionsUntilFullProgress(totalSessions);
  const hasRestrictedConsent =
    consentStatus != null && consentStatus !== 'CONSENTED';
  const consentLabelKey = consentStatusLabelKey(consentStatus);
  const consentLabel = consentLabelKey ? t(consentLabelKey) : '';
  const primaryLabel = hasRestrictedConsent
    ? t(consentPrimaryLabelKey(consentStatus))
    : t('coaching.parentDashboard.viewDetails');
  const exchangeDelta = exchangesThisWeek - exchangesLastWeek;
  const guidedPercent = Math.round(guidedVsImmediateRatio * 100);

  const trendText = `${sessionsThisWeek} ${sessionWord(
    sessionsThisWeek,
  )}, ${formatTime(totalTimeThisWeek)} this week (${TREND_ARROWS[trend]} ${
    TREND_LABELS[trend]
  } ${sessionsLastWeek} ${sessionWord(sessionsLastWeek)}, ${formatTime(
    totalTimeLastWeek,
  )} last week)`;

  const metadata = (
    <>
      {consentLabel ? (
        <View
          className={`self-start rounded-full px-3 py-1 mb-2 ${
            hasRestrictedConsent ? 'bg-danger/10' : 'bg-primary/10'
          }`}
          testID="consent-status-badge"
          accessibilityLabel={t(
            'coaching.parentDashboard.consent.accessibilityLabel',
            { status: consentLabel },
          )}
        >
          <Text
            className={`text-caption font-semibold ${
              hasRestrictedConsent ? 'text-danger' : 'text-primary'
            }`}
          >
            {consentLabel}
          </Text>
        </View>
      ) : null}
      {hasRestrictedConsent ? (
        <View
          className="bg-background rounded-lg px-3 py-3"
          testID="consent-redacted-message"
        >
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('coaching.parentDashboard.consent.metricsHiddenTitle')}
          </Text>
          <Text className="text-caption text-text-secondary mt-1">
            {t(consentStatusMessageKey(consentStatus), { name: childName })}
          </Text>
        </View>
      ) : null}
      {showFullSignals && !hasRestrictedConsent && (
        <View className="flex-row flex-wrap gap-2 mt-1.5">
          {progress ? (
            <View
              className="flex-row items-center gap-1 bg-background rounded-full px-3 py-1.5"
              testID="engagement-trend-chip"
            >
              <Text className="text-caption font-semibold text-text-primary">
                {t(engagementTrendLabelKey(progress.engagementTrend))}
              </Text>
              <MetricInfoDot metricKey="engagement-trend" />
            </View>
          ) : null}
          {exchangeDelta !== 0 ? (
            <View
              className="flex-row items-center gap-1 bg-background rounded-full px-3 py-1.5"
              testID="exchange-delta-chip"
            >
              <Text className="text-caption font-semibold text-text-primary">
                {signedDelta(exchangeDelta)} exchanges
              </Text>
              <MetricInfoDot metricKey="exchange-delta" />
            </View>
          ) : null}
          {guidedVsImmediateRatio > 0 ? (
            <View
              className="flex-row items-center gap-1 bg-background rounded-full px-3 py-1.5"
              testID="guided-ratio-chip"
            >
              <Text className="text-caption font-semibold text-text-primary">
                {guidedPercent}% guided
              </Text>
              <MetricInfoDot metricKey="guided-ratio" />
            </View>
          ) : null}
          {currentStreak > 0 || totalXp > 0 ? (
            <View
              className="flex-row items-center gap-1 bg-background rounded-full px-3 py-1.5"
              testID="streak-xp-chip"
            >
              <Text className="text-caption font-semibold text-text-primary">
                {[
                  currentStreak > 0 ? `${currentStreak}-day streak` : null,
                  totalXp > 0 ? `${totalXp} XP` : null,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
              <MetricInfoDot metricKey="streak-xp" />
            </View>
          ) : null}
        </View>
      )}
      {showFullSignals ? (
        !hasRestrictedConsent && aggregateSignal ? (
          <View
            className="flex-row items-center mt-1"
            testID="aggregate-signal"
            accessibilityLabel={`Overall status: ${t(
              AGGREGATE_SIGNAL_CONFIG[aggregateSignal].labelKey,
            )}`}
          >
            <Ionicons
              name={AGGREGATE_SIGNAL_CONFIG[aggregateSignal].icon}
              size={16}
              color={colors[AGGREGATE_SIGNAL_CONFIG[aggregateSignal].colorKey]}
              style={{ marginRight: 8 }}
            />
            <Text
              className={`text-body-sm font-semibold ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].textColor}`}
            >
              {t(AGGREGATE_SIGNAL_CONFIG[aggregateSignal].labelKey)}
            </Text>
          </View>
        ) : !hasRestrictedConsent ? (
          <Text
            className="text-caption text-text-secondary mt-1"
            testID="aggregate-signal-empty"
          >
            {t('coaching.parentDashboard.noDataYet')}
          </Text>
        ) : null
      ) : null}
      {showFullSignals && !hasRestrictedConsent && (
        <Text
          className="text-caption text-text-secondary mt-1"
          accessibilityLabel={`Trend: ${trendText}`}
        >
          {trendText}
        </Text>
      )}
      {showFullSignals ? (
        !hasRestrictedConsent && retentionTrend ? (
          <View
            className="flex-row items-center mt-1.5"
            testID="retention-trend-badge"
            accessibilityLabel={`Review health: ${retentionTrend}`}
          >
            <Text className="text-caption text-text-secondary">
              {t('coaching.parentDashboard.reviewHealth')}{' '}
            </Text>
            <Text
              className={`text-caption font-semibold ${RETENTION_TREND_CONFIG[retentionTrend].className}`}
            >
              {RETENTION_TREND_CONFIG[retentionTrend].arrow}{' '}
              {t(RETENTION_TREND_CONFIG[retentionTrend].labelKey)}
            </Text>
          </View>
        ) : !hasRestrictedConsent ? (
          <Text
            className="text-caption text-text-secondary mt-1.5"
            testID="retention-trend-empty"
          >
            {t('coaching.parentDashboard.noDataYet')}
          </Text>
        ) : null
      ) : null}
      {showFullSignals && !hasRestrictedConsent && progress ? (
        <View className="mt-3 gap-2">
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-background rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {progress.topicsMastered} topics
                {progress.weeklyDeltaTopicsMastered != null
                  ? ` • +${progress.weeklyDeltaTopicsMastered} this week`
                  : ''}
              </Text>
            </View>
            {progress.vocabularyTotal > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {progress.vocabularyTotal} words
                  {progress.weeklyDeltaVocabularyTotal != null
                    ? ` • +${progress.weeklyDeltaVocabularyTotal}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {progress.weeklyDeltaTopicsExplored != null &&
            progress.weeklyDeltaTopicsExplored > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  +{progress.weeklyDeltaTopicsExplored} explored
                </Text>
              </View>
            ) : null}
          </View>
          {progress.guidance ? (
            <Text className="text-caption text-text-secondary">
              {progress.guidance}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showFullSignals && !hasRestrictedConsent && subjects.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {subjects.map((subject) => (
            <View
              key={subject.name}
              className="flex-row items-center bg-background rounded-full px-3 py-1.5"
            >
              <Text className="text-caption text-text-primary me-2">
                {subject.name}
              </Text>
              <RetentionSignal status={subject.retentionStatus} parentFacing />
            </View>
          ))}
        </View>
      ) : null}
      {!showFullSignals && !hasRestrictedConsent ? (
        <View className="mt-2" testID="parent-dashboard-teaser">
          <SamplePreview
            unlockMessage={`After ${remaining} more ${
              remaining === 1 ? 'session' : 'sessions'
            }, you'll see ${childName}'s learning trends here.`}
          >
            <View className="flex-row items-end gap-3 h-16 px-2 pt-2">
              {[40, 60, 35, 75, 50].map((height, i) => (
                <View
                  key={i}
                  className="flex-1 rounded-t-full bg-primary"
                  style={{ height }}
                />
              ))}
            </View>
          </SamplePreview>
        </View>
      ) : null}
    </>
  );

  return (
    <BaseCoachingCard
      headline={childName}
      subtext={summary}
      primaryLabel={primaryLabel}
      onPrimary={onDrillDown}
      metadata={metadata}
      isLoading={isLoading}
      testID={`dashboard-child-${profileId}`}
    />
  );
}
