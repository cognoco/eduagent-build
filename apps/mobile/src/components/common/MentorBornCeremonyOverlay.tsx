import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  completeMentorBornCeremonyDurably,
  restorePendingMentorBornCeremony,
  useMentorBornCeremonyRequest,
} from '../../lib/mentor-born-ceremony';
import { MentorBirthErrorBoundary } from './MentorBirthErrorBoundary';
import { MentorBirthAnimation } from './MentorBirthAnimation';

export const MENTOR_BORN_CEREMONY_CAP_MS = 2_500;

export function MentorBornCeremonyOverlay() {
  const request = useMentorBornCeremonyRequest();
  const { t } = useTranslation();
  const onComplete = useCallback(() => {
    if (request) void completeMentorBornCeremonyDurably(request.id);
  }, [request]);

  useEffect(() => {
    void restorePendingMentorBornCeremony();
  }, []);

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
      <MentorBirthErrorBoundary
        componentTag="MentorBornCeremony"
        onError={onComplete}
      >
        <MentorBirthAnimation
          readyLabel={t('onboarding.mentorBirth.ready')}
          onComplete={onComplete}
          size={220}
        />
      </MentorBirthErrorBoundary>
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
