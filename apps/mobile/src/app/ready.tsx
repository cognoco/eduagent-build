import { useEffect, useState, useCallback } from 'react';
import { View, Text, Platform, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useProfile } from '../lib/profile';
import { MentorBirthErrorBoundary } from '../components/common/MentorBirthErrorBoundary';
import { MentorBirthAnimation } from '../components/common/MentorBirthAnimation';
import { CheckmarkPopAnimation } from '../components/common/CheckmarkPopAnimation';
import { Button } from '../components/common/Button';
import { isSessionForwardableReturnTo } from '../lib/navigation';

const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

// Stagger between checkmark reveals — slow enough to feel intentional, fast
// enough that the user does not perceive it as a loading screen.
const ROW_STAGGER_MS = 550;
const FIRST_ROW_DELAY_MS = 500;

interface ReadyRowProps {
  visible: boolean;
  label: string;
  testID: string;
}

function ReadyRow({ visible, label, testID }: ReadyRowProps) {
  if (!visible) {
    return <View className="h-12 mb-3" testID={`${testID}-placeholder`} />;
  }
  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      className="flex-row items-center mb-3"
      testID={testID}
    >
      <CheckmarkPopAnimation size={32} strokeWidth={3} />
      <Text className="text-body text-text-primary ml-3 flex-1">{label}</Text>
    </Animated.View>
  );
}

export default function ReadyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { activeProfile } = useProfile();

  const params = useLocalSearchParams<{
    subject?: string;
    subjectId?: string;
    sessionId?: string;
    topicId?: string;
    topicName?: string;
    rawInput?: string;
    returnTo?: string;
  }>();

  const subject = (params.subject ?? '').trim();
  const learner = (activeProfile?.displayName ?? '').trim();

  // Stagger reveals so the screen feels alive instead of "loading."
  const [visibleRows, setVisibleRows] = useState(reduceMotion ? 3 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const timers = [
      setTimeout(() => setVisibleRows(1), FIRST_ROW_DELAY_MS),
      setTimeout(() => setVisibleRows(2), FIRST_ROW_DELAY_MS + ROW_STAGGER_MS),
      setTimeout(
        () => setVisibleRows(3),
        FIRST_ROW_DELAY_MS + ROW_STAGGER_MS * 2,
      ),
    ];
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [reduceMotion]);

  const onStart = useCallback(() => {
    // Forward all the session params the create-subject screen would have
    // passed directly — preserves both the happy path (sessionId + topicId)
    // and the curriculum-preparing fallback (topicName + rawInput).
    const sessionParams: Record<string, string> = {
      mode: 'learning',
    };
    if (params.subjectId) sessionParams.subjectId = params.subjectId;
    if (subject) sessionParams.subjectName = subject;
    if (params.sessionId) sessionParams.sessionId = params.sessionId;
    if (params.topicId) sessionParams.topicId = params.topicId;
    if (params.topicName) sessionParams.topicName = params.topicName;
    if (params.rawInput) sessionParams.rawInput = params.rawInput;
    if (isSessionForwardableReturnTo(params.returnTo))
      sessionParams.returnTo = params.returnTo;

    router.replace({
      pathname: '/(app)/session',
      params: sessionParams,
    } as Href);
  }, [
    router,
    subject,
    params.subjectId,
    params.sessionId,
    params.topicId,
    params.topicName,
    params.rawInput,
    params.returnTo,
  ]);

  // /ready always runs as the learner whose profile is now active —
  // create-profile.tsx calls switchProfile(...) before this screen loads.
  const toneRow = t('onboarding.ready.rowTone');

  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        minHeight: SCREEN_HEIGHT,
      }}
      testID="ready-screen"
    >
      <View
        className="flex-1 items-center px-6"
        style={
          Platform.OS === 'web'
            ? { maxWidth: 480, width: '100%', alignSelf: 'center' }
            : undefined
        }
      >
        <View className="items-center mt-8 mb-4">
          <MentorBirthErrorBoundary componentTag="ready-mentor-birth">
            <MentorBirthAnimation
              size={220}
              readyLabel={t('onboarding.mentorBirth.ready')}
            />
          </MentorBirthErrorBoundary>
        </View>

        <Text className="text-h1 font-bold text-text-primary text-center mb-2">
          {t('onboarding.ready.title')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          {learner
            ? t('onboarding.ready.introWithLearner', { learner })
            : t('onboarding.ready.intro')}
        </Text>

        <View className="w-full mb-6">
          <ReadyRow
            visible={visibleRows >= 1}
            label={toneRow}
            testID="ready-row-tone"
          />
          <ReadyRow
            visible={visibleRows >= 2}
            label={
              subject
                ? t('onboarding.ready.rowSubject', { subject })
                : t('onboarding.ready.rowSubjectNoSubject')
            }
            testID="ready-row-subject"
          />
          <ReadyRow
            visible={visibleRows >= 3}
            label={t('onboarding.ready.rowPace')}
            testID="ready-row-pace"
          />
        </View>

        <Text className="text-body-sm text-text-secondary text-center mb-8 italic">
          {t('onboarding.ready.reassurance')}
        </Text>

        <View className="w-full">
          <Button
            variant="primary"
            label={t('onboarding.ready.cta')}
            onPress={onStart}
            testID="ready-start"
          />
        </View>
      </View>
    </View>
  );
}
