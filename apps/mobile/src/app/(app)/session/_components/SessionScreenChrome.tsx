import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import i18next from 'i18next';

import { MilestoneDots } from '../../../../components/session/MilestoneDots';
import { getResumeBannerCopy } from '../../../../components/session/resume-banner-copy';
import { SessionTimer } from '../../../../components/session/SessionTimer';
import { SessionTopicHeader } from '../../../../components/session/SessionTopicHeader';

export interface SessionScreenChromeProps {
  activeSessionId: string | null;
  isClosing: boolean;
  isStreaming: boolean;
  modeSubtitle: string;
  showTimer: boolean;
  milestoneCount: number;
  pendingClassification: boolean;
  classifyError: string | null;
  sessionExpired: boolean;
  resumedBanner: boolean;
  topicName: string | undefined;
  apiChecked: boolean;
  isApiReachable: boolean;
  showSkipWarmup: boolean;
  isSkippingWarmup: boolean;
  onEndSession: () => void;
  onHomeBack: () => void;
  onRetryClassification: () => void;
  onChangeTopic: () => void;
  onSkipWarmup: () => void;
}

export function SessionScreenChrome(props: SessionScreenChromeProps): {
  headerRight: React.ReactNode;
  headerBelow: React.ReactNode;
  subtitle: string;
} {
  const endSessionButton = (
    <Pressable
      onPress={props.activeSessionId ? props.onEndSession : props.onHomeBack}
      disabled={props.isClosing || props.isStreaming}
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      style={{ maxWidth: 104 }}
      testID="end-session-button"
      accessibilityLabel={
        props.isClosing
          ? i18next.t('session.screenChrome.a11yWrapping')
          : props.activeSessionId
            ? i18next.t('session.screenChrome.a11yDone')
            : i18next.t('session.screenChrome.exit')
      }
      accessibilityRole="button"
    >
      <Text
        className="text-body-sm font-semibold text-text-secondary"
        numberOfLines={1}
      >
        {props.isClosing
          ? i18next.t('session.screenChrome.wrapping')
          : props.activeSessionId
            ? i18next.t('common.done')
            : i18next.t('session.screenChrome.exit')}
      </Text>
    </Pressable>
  );

  const headerRight = (
    <View className="flex-row flex-wrap items-center justify-end">
      {props.showTimer && <SessionTimer />}
      <MilestoneDots count={props.milestoneCount} />
      {endSessionButton}
    </View>
  );

  const subtitle = props.pendingClassification
    ? i18next.t('session.screenChrome.subtitleClassifying')
    : props.classifyError
      ? props.classifyError
      : props.sessionExpired
        ? i18next.t('session.screenChrome.subtitleExpired')
        : props.resumedBanner
          ? getResumeBannerCopy(props.topicName)
          : props.apiChecked && !props.isApiReachable
            ? i18next.t('session.screenChrome.subtitleUnreachable')
            : props.modeSubtitle;

  const classifyErrorChip = props.classifyError ? (
    <View className="flex-row items-center gap-2 px-4 pb-2">
      <Pressable
        onPress={props.onRetryClassification}
        className="bg-surface-elevated rounded-full px-3 py-1.5 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={i18next.t(
          'session.screenChrome.retryClassification',
        )}
        testID="classify-error-retry"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          {i18next.t('session.screenChrome.retryClassification')}
        </Text>
      </Pressable>
    </View>
  ) : null;

  const topicHeaderStrip = props.topicName ? (
    <SessionTopicHeader
      topicName={props.topicName}
      onChangeTopic={props.onChangeTopic}
    />
  ) : null;

  const skipWarmupChip = props.showSkipWarmup ? (
    <View className="flex-row items-center gap-2 px-4 pb-2">
      <Pressable
        onPress={props.onSkipWarmup}
        disabled={props.isSkippingWarmup}
        className="bg-surface-elevated rounded-full px-3 py-1.5 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={i18next.t('session.screenChrome.skipWarmup')}
        testID="session-skip-warmup"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          {i18next.t('session.screenChrome.skipWarmup')}
        </Text>
      </Pressable>
    </View>
  ) : null;

  const headerBelow =
    topicHeaderStrip || classifyErrorChip || skipWarmupChip ? (
      <View className="gap-2">
        {topicHeaderStrip}
        {classifyErrorChip}
        {skipWarmupChip}
      </View>
    ) : null;

  return {
    headerRight,
    headerBelow,
    subtitle,
  };
}
