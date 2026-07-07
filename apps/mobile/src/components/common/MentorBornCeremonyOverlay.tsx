import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sentry } from '../../lib/sentry';
import {
  completeMentorBornCeremony,
  useMentorBornCeremonyRequest,
} from '../../lib/mentor-born-ceremony';
import { MentorBirthAnimation } from './MentorBirthAnimation';

export const MENTOR_BORN_CEREMONY_CAP_MS = 2_500;

/** Thin error boundary so mentor-born animation crashes don't block the app. */
class MentorBornErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      '[MentorBornCeremony] crashed:',
      error.message,
      info.componentStack,
    );
    Sentry.captureException(error, {
      tags: { component: 'MentorBornCeremony' },
    });
    this.props.onError();
  }
  override render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function MentorBornCeremonyOverlay() {
  const request = useMentorBornCeremonyRequest();
  const { t } = useTranslation();
  const onComplete = useCallback(() => {
    if (request) completeMentorBornCeremony(request.id);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const timeout = setTimeout(onComplete, MENTOR_BORN_CEREMONY_CAP_MS);
    return () => clearTimeout(timeout);
  }, [onComplete, request]);

  if (!request) return null;

  return (
    <View
      className="bg-background"
      pointerEvents="auto"
      style={styles.overlay}
      testID="mentor-born-ceremony-overlay"
    >
      <MentorBornErrorBoundary onError={onComplete}>
        <MentorBirthAnimation
          readyLabel={t('onboarding.mentorBirth.ready')}
          onComplete={onComplete}
          size={220}
        />
      </MentorBornErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 20,
  },
});
