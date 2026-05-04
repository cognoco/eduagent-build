import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useDictationPlayback } from '../../../hooks/use-dictation-playback';
import { useDictationPreferences } from '../../../hooks/use-dictation-preferences';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';

export default function PlaybackScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const { data } = useDictationData();

  const prefs = useDictationPreferences(activeProfile?.id);

  const ageYears = activeProfile?.birthYear
    ? new Date().getFullYear() - activeProfile.birthYear
    : 10;
  const chunkSize = ageYears <= 8 ? 2 : ageYears <= 12 ? 3 : 4;

  const playback = useDictationPlayback({
    sentences: data?.sentences ?? [],
    pace: prefs.pace,
    punctuationReadAloud: prefs.punctuationReadAloud,
    language: data?.language ?? 'en',
    chunkSize,
  });

  // RF-08: Guard prevents auto-start from re-triggering on re-renders.
  // [F-030] dep on data — if context state hasn't flushed by mount time
  // (race between setData and router.push), auto-start fires on the next
  // render once data arrives. hasStartedRef prevents double-start.
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (!hasStartedRef.current && (data?.sentences?.length ?? 0) > 0) {
      hasStartedRef.current = true;
      playback.start();
    }
  }, [data, playback]);

  // Navigate to complete screen when done
  useEffect(() => {
    if (playback.state === 'complete') {
      router.replace('/(app)/dictation/complete' as never);
    }
  }, [playback.state, router]);

  // Back press confirmation — RF-09: progress is not auto-recorded, explicit user action only
  const handleExit = useCallback(() => {
    platformAlert(
      t('dictation.playback.exitTitle'),
      t('dictation.playback.exitMessage'),
      [
        { text: t('dictation.playback.keepGoing'), style: 'cancel' },
        {
          text: t('dictation.playback.leave'),
          style: 'destructive',
          onPress: () => router.replace('/(app)/practice' as never),
        },
      ]
    );
  }, [router, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExit();
      return true;
    });
    return () => sub.remove();
  }, [handleExit]);

  const isPaused = playback.state === 'paused';
  const isCountdown = playback.state === 'countdown';

  if (!data) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="dictation-playback-screen"
      >
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('dictation.playback.noDataMessage')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
          className="bg-primary rounded-xl py-4 px-8 items-center"
          testID="playback-go-back"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Text className="text-text-inverse font-semibold text-body">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="dictation-playback-screen"
    >
      {/* Top control strip */}
      <View className="flex-row items-center px-4 py-2 border-b border-border">
        <Pressable
          onPress={prefs.cyclePace}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-pace"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.playback.paceLabel', {
            pace: t(`dictation.playback.pace.${prefs.pace}`, {
              defaultValue: prefs.pace,
            }),
          })}
        >
          <Text className="text-body-sm font-semibold text-text-primary">
            {t(`dictation.playback.pace.${prefs.pace}`, {
              defaultValue: prefs.pace,
            })}
          </Text>
        </Pressable>

        <Pressable
          onPress={prefs.togglePunctuation}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-punctuation"
          accessibilityRole="button"
          accessibilityLabel={
            prefs.punctuationReadAloud
              ? t('dictation.playback.punctuationOn')
              : t('dictation.playback.punctuationOff')
          }
        >
          <Ionicons
            name={prefs.punctuationReadAloud ? 'text' : 'text-outline'}
            size={18}
            color={colors.textPrimary}
          />
        </Pressable>

        <Pressable
          onPress={playback.skip}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-skip"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.playback.skipToNext')}
        >
          <Ionicons
            name="play-skip-forward"
            size={18}
            color={colors.textPrimary}
          />
        </Pressable>

        <View className="flex-1" />

        <Text
          className="text-body-sm text-text-secondary"
          testID="playback-progress"
        >
          {playback.currentIndex + 1} / {playback.totalSentences}
        </Text>
      </View>

      {/* Main tap area — pause/resume */}
      <Pressable
        className="flex-1 items-center justify-center px-8"
        onPress={() => {
          if (isPaused) {
            playback.resume();
          } else {
            playback.pause();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isPaused
            ? t('dictation.playback.resumeDictation')
            : t('dictation.playback.pauseDictation')
        }
        testID="playback-tap-area"
      >
        {isCountdown ? (
          <Text className="text-h1 font-bold text-text-primary">
            {t('dictation.playback.ready')}
          </Text>
        ) : isPaused ? (
          <View className="items-center">
            <Ionicons name="pause" size={48} color={colors.textSecondary} />
            <Text className="text-body text-text-secondary mt-4">
              {t('dictation.playback.tapToContinue')}
            </Text>
          </View>
        ) : (
          <Text className="text-h2 text-text-muted tracking-widest">* * *</Text>
        )}
      </Pressable>

      {/* Repeat button */}
      <View className="px-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={playback.repeat}
          className="bg-surface-elevated rounded-xl py-4 items-center"
          testID="playback-repeat"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.playback.repeatLastPhrase')}
        >
          <View className="flex-row items-center">
            <Ionicons name="refresh" size={20} color={colors.textPrimary} />
            <Text className="text-body text-text-primary ml-2">
              {t('dictation.playback.repeat')}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleExit}
          className="py-3 items-center mt-2"
          testID="playback-exit"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.playback.exitDictation')}
        >
          <Text className="text-body-sm text-text-muted">
            {t('dictation.playback.exit')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
