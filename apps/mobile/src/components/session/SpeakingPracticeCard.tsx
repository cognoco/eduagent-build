import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';

export interface SpeakingPracticeCardProps {
  targetText: string;
  transcript?: string;
  isListening?: boolean;
  isSpeaking?: boolean;
  onPlayTarget: () => void;
  onRecordPress: () => void;
  onRetry?: () => void;
  // WI-1777: the server's deterministic score is the ONLY source of
  // match/missing/extra feedback rendered by this card (from the persisted
  // attempt's score — see apps/api's speaking-practice/scoring.ts). There is
  // no client-side comparison: a divergent client scorer previously
  // co-rendered a live "Matched!/missing: X" verdict from the raw transcript
  // that could disagree with the server's persisted verdict (Phase-4 finding
  // M1) — e.g. "Está" vs. STT "esta" showed the learner "missing: está"
  // while the server, which strips diacritics, scored it complete. Until
  // `missingWords` is supplied (i.e. an attempt has actually been scored),
  // the card shows only the raw transcript text — no verdict, no missing/
  // extra words — including while listening and after a failed submission.
  missingWords?: string[];
  extraWords?: string[];
  isComplete?: boolean;
}

export function SpeakingPracticeCard({
  targetText,
  transcript = '',
  isListening = false,
  isSpeaking = false,
  onPlayTarget,
  onRecordPress,
  onRetry,
  missingWords,
  extraWords,
  isComplete,
}: SpeakingPracticeCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const trimmedTranscript = transcript.trim();
  const hasServerFeedback = missingWords !== undefined;
  const hasTranscript = trimmedTranscript.length > 0;
  const effectiveIsComplete = hasServerFeedback && (isComplete ?? false);
  const showMissingWords = hasServerFeedback && (missingWords?.length ?? 0) > 0;
  const showExtraWords = hasServerFeedback && (extraWords?.length ?? 0) > 0;

  return (
    <View
      className="mx-4 mb-3 rounded-card bg-surface-elevated px-4 py-3"
      testID="speaking-practice-card"
      accessibilityRole="summary"
    >
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-caption font-semibold uppercase text-primary">
            {t('session.speakingPractice.title')}
          </Text>
          <Text className="mt-0.5 text-caption text-text-secondary">
            {t('session.speakingPractice.subtitle')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onPlayTarget}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              isSpeaking
                ? t('session.speakingPractice.stopAudioLabel')
                : t('session.speakingPractice.playAudioLabel')
            }
            className="h-9 w-9 items-center justify-center rounded-full bg-surface"
            testID="speaking-practice-play"
          >
            <Ionicons
              name={isSpeaking ? 'stop' : 'volume-medium'}
              size={18}
              color={colors.accent}
            />
          </Pressable>
          <Pressable
            onPress={onRecordPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              isListening
                ? t('session.speakingPractice.stopRecordingLabel')
                : t('session.speakingPractice.startRecordingLabel')
            }
            className={`h-9 w-9 items-center justify-center rounded-full ${
              isListening ? 'bg-danger' : 'bg-surface'
            }`}
            testID="speaking-practice-record"
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={18}
              color={isListening ? colors.textInverse : colors.primary}
            />
          </Pressable>
        </View>
      </View>

      <Text
        className="text-body text-text-primary"
        testID="speaking-practice-target"
      >
        {targetText}
      </Text>

      {isListening ? (
        <Text className="mt-3 text-caption font-semibold text-primary">
          {t('session.speakingPractice.listening')}
        </Text>
      ) : null}

      {hasTranscript ? (
        <View className="mt-3 border-t border-border pt-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('session.speakingPractice.transcriptLabel')}
          </Text>
          <Text
            className="mt-1 text-body-sm text-text-primary"
            testID="speaking-practice-transcript"
          >
            {trimmedTranscript}
          </Text>
          {effectiveIsComplete ? (
            <Text className="mt-2 text-caption font-semibold text-success">
              {t('session.speakingPractice.matched')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showExtraWords ? (
        <Text
          className="mt-3 text-body-sm text-text-secondary"
          testID="speaking-practice-extra"
        >
          {t('session.speakingPractice.extraWords', {
            words: (extraWords ?? []).join(', '),
          })}
        </Text>
      ) : null}

      {showMissingWords ? (
        <View className="mt-3 rounded-button bg-surface px-3 py-2">
          <Text
            className="text-body-sm font-semibold text-text-primary"
            testID="speaking-practice-missing"
          >
            {t('session.speakingPractice.retryWithMissingWords', {
              words: (missingWords ?? []).join(', '),
            })}
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('session.speakingPractice.retryLabel')}
              className="mt-2 min-h-[36px] self-start justify-center rounded-button bg-primary px-3"
              testID="speaking-practice-retry"
            >
              <Text className="text-caption font-semibold text-text-inverse">
                {t('session.speakingPractice.retry')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
