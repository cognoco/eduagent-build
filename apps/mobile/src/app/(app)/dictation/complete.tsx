import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
import { useDictationData } from './_layout';
import {
  useReviewDictation,
  useRecordDictationResult,
} from '../../../hooks/use-dictation-api';

// RF-09: Dictation result is NOT auto-recorded on mount.
// "I'm done" is an explicit user action that records the result.
// "Check my writing" records with reviewed=true + mistakeCount on the review screen.

export default function DictationCompleteScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data, setData } = useDictationData();
  const reviewMutation = useReviewDictation();
  const recordResult = useRecordDictationResult();

  const isReviewing = reviewMutation.isPending;

  const [reviewTimedOut, setReviewTimedOut] = useState(false);
  const reviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isReviewing) {
      setReviewTimedOut(false);
      reviewTimeoutRef.current = setTimeout(() => {
        setReviewTimedOut(true);
      }, 20_000);
    } else {
      if (reviewTimeoutRef.current) clearTimeout(reviewTimeoutRef.current);
      setReviewTimedOut(false);
    }
    return () => {
      if (reviewTimeoutRef.current) clearTimeout(reviewTimeoutRef.current);
    };
  }, [isReviewing]);

  // [F-031] Synchronous double-tap guard. `disabled={isPending}` relies on
  // React state which batches asynchronously — a second pointer event can
  // race through before isPending flips to true (especially on RN Web where
  // pointer events bypass Pressable's disabled prop). A ref is set on the
  // same tick, closing the gap.
  const doneInFlightRef = React.useRef(false);

  // [BUG-692] Set when the user navigates away (hardware back, Skip alert
  // button, or screen blur) while reviewMutation is still in flight. Checked
  // post-await before pushing to /dictation/review and inside the catch block
  // before showing the retry alert.
  const reviewCancelledRef = useRef(false);

  // [BUG-692] Mark cancelled on screen blur (hardware back gesture) so a
  // late-arriving review response does not push to the review screen.
  useFocusEffect(
    useCallback(() => {
      return () => {
        reviewCancelledRef.current = true;
      };
    }, []),
  );

  // [F-020] If a user lands on /dictation/complete via a deep link, back
  // gesture, or browser refresh, `data` is null (context is stack-lifecycle
  // scoped). Tapping "I'm done" in that case would POST /dictation/results
  // with sentenceCount=0 — polluting the user's streak history with a fake
  // entry. Mirror the existing `/dictation/review` guard: show an inline
  // "session data not found" empty state with an explicit recovery path.
  const hasValidSession = !!data && (data.sentences?.length ?? 0) > 0;
  if (!hasValidSession) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        testID="dictation-complete-missing-data"
      >
        <Ionicons name="help-circle-outline" size={56} color={colors.muted} />
        <Text
          className="text-h3 font-semibold text-text-primary mt-4 text-center"
          accessibilityRole="header"
        >
          {t('dictation.complete.noSessionTitle')}
        </Text>
        <Text className="text-body text-text-secondary mt-2 text-center">
          {t('dictation.complete.noSessionMessage')}
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/dictation' as never)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mt-6"
          accessibilityRole="button"
          accessibilityLabel={t('dictation.complete.startDictation')}
          testID="dictation-complete-missing-start"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('dictation.complete.startDictation')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // [E2E] When EXPO_PUBLIC_E2E=1 the dev-client build exposes a gallery picker
  // button (complete-pick-gallery testID). The wrapper script plants a test JPEG
  // in the emulator gallery via ADB before running the flow so that the review
  // LLM call receives a predictable image without requiring a real camera session.
  const isE2E = process.env.EXPO_PUBLIC_E2E === '1';

  const handleCheckWriting = async (
    source: 'camera' | 'gallery' = 'camera',
  ) => {
    // [BUG-692] Reset the cancelled flag at the start of each new attempt.
    reviewCancelledRef.current = false;

    // 1. Launch camera (or gallery in E2E mode)
    let uri: string | undefined;
    let assetMimeType: string | undefined;
    try {
      const result =
        source === 'gallery'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              allowsEditing: false,
            });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      uri = asset?.uri;
      // [ASSUMP-F8] Prefer the picker's reported mimeType when present.
      // Extension sniffing fails for Android content:// URIs (no extension)
      // and misclassifies unusual camera outputs. The server whitelists
      // only jpeg/png/webp, so normalize anything else to jpeg.
      assetMimeType = asset?.mimeType;
    } catch {
      platformAlert(
        t('dictation.complete.cameraErrorTitle'),
        t('dictation.complete.cameraErrorMessage'),
        [{ text: t('common.ok') }],
      );
      return;
    }

    if (!uri) return;

    // 2. Convert to base64
    let imageBase64: string;
    let imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    try {
      imageBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (
        assetMimeType === 'image/png' ||
        assetMimeType === 'image/webp' ||
        assetMimeType === 'image/jpeg'
      ) {
        imageMimeType = assetMimeType;
      } else if (uri.toLowerCase().endsWith('.png')) {
        imageMimeType = 'image/png';
      } else if (uri.toLowerCase().endsWith('.webp')) {
        imageMimeType = 'image/webp';
      } else {
        imageMimeType = 'image/jpeg';
      }
    } catch {
      platformAlert(
        t('dictation.complete.photoErrorTitle'),
        t('dictation.complete.photoErrorMessage'),
        [{ text: t('common.ok') }],
      );
      return;
    }

    // 3. Send to LLM for review
    const sentences = data?.sentences ?? [];
    const language = data?.language ?? 'en';

    try {
      const reviewResult = await reviewMutation.mutateAsync({
        imageBase64,
        imageMimeType,
        sentences,
        language,
      });

      // [BUG-692] If the user navigated away (hardware back, Cancel button,
      // or screen blur) while the review was in flight, skip navigation.
      if (reviewCancelledRef.current) return;

      // 4. Store review result in context then navigate
      if (data) {
        setData({ ...data, reviewResult });
      }
      router.push('/(app)/dictation/review' as never);
    } catch (err) {
      // [BUG-692] Don't pop an alert if the user already navigated away.
      if (reviewCancelledRef.current) return;
      const message = err instanceof Error ? err.message : t('errors.generic');
      platformAlert(t('dictation.complete.reviewFailedTitle'), message, [
        {
          text: t('dictation.complete.tryAgain'),
          onPress: () => void handleCheckWriting(),
        },
        {
          text: t('dictation.complete.skip'),
          style: 'cancel',
          onPress: () => {
            reviewCancelledRef.current = true;
          },
        },
      ]);
    }
  };

  const handleDone = async () => {
    if (doneInFlightRef.current) return;
    doneInFlightRef.current = true;

    const sentences = data?.sentences ?? [];
    const mode = data?.mode ?? 'homework';
    const localDate = new Date().toISOString().slice(0, 10);

    try {
      await recordResult.mutateAsync({
        localDate,
        sentenceCount: sentences.length,
        mistakeCount: null,
        mode,
        reviewed: false,
      });
    } catch (err) {
      // [ASSUMP-F11] If mutateAsync threw, nothing was saved server-side.
      // Previously the Alert said "Your progress was saved" — a lie that
      // also violated the "silent recovery without escalation" rule. Now we
      // tell the user honestly and offer Retry / Continue.
      doneInFlightRef.current = false;
      console.warn('[dictation] result recording failed:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : t('dictation.complete.couldNotSaveDictation');
      platformAlert(t('dictation.complete.couldNotSaveTitle'), message, [
        {
          text: t('common.retry'),
          onPress: () => void handleDone(),
        },
        {
          text: t('dictation.complete.continueWithoutSaving'),
          style: 'cancel',
          onPress: () => router.replace('/(app)/practice' as never),
        },
      ]);
      return;
    }

    router.replace('/(app)/practice' as never);
  };

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      testID="dictation-complete-screen"
    >
      {isReviewing ? (
        <>
          {reviewTimedOut ? (
            <>
              <Text
                className="text-body text-danger text-center mb-4"
                testID="review-timeout-error"
              >
                {t('dictation.complete.tookTooLong')}
              </Text>
              <Pressable
                onPress={() => {
                  reviewMutation.reset();
                  setReviewTimedOut(false);
                  void handleCheckWriting();
                }}
                className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'dictation.complete.retryCheckingWriting',
                )}
                testID="review-timeout-retry"
              >
                <Text className="text-text-inverse font-semibold text-body">
                  {t('common.tryAgain')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-body text-text-secondary mt-4 text-center">
                {t('dictation.complete.checkingWriting')}
              </Text>
            </>
          )}
          <Pressable
            onPress={() => {
              reviewCancelledRef.current = true; // [BUG-692]
              reviewMutation.reset();
              setReviewTimedOut(false);
              goBackOrReplace(router, '/(app)/practice');
            }}
            className="mt-4 py-2 px-4 min-h-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('dictation.complete.cancelCheckingWriting')}
            testID="review-cancel"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
          <Text
            className="text-h2 font-bold text-text-primary mt-4 text-center"
            accessibilityRole="header"
          >
            {t('dictation.complete.wellDone')}
          </Text>
          <Text className="text-body text-text-secondary mt-2 text-center">
            {t('dictation.complete.wantToCheck')}
          </Text>

          <View className="w-full gap-3 mt-8">
            <Pressable
              onPress={() => void handleCheckWriting('camera')}
              className="bg-primary rounded-xl py-4 items-center"
              testID="complete-check-writing"
              accessibilityRole="button"
              accessibilityLabel={t('dictation.complete.checkMyWriting')}
            >
              <View className="flex-row items-center">
                <Ionicons name="camera" size={20} color={colors.textInverse} />
                <Text className="text-text-inverse font-semibold text-body ml-2">
                  {t('dictation.complete.checkMyWriting')}
                </Text>
              </View>
            </Pressable>

            {/* [E2E] Gallery picker — only visible in E2E dev-client builds (EXPO_PUBLIC_E2E=1).
                The wrapper script plants a test JPEG in the emulator gallery via ADB before
                running the flow so the LLM receives a predictable image. */}
            {isE2E ? (
              <Pressable
                onPress={() => void handleCheckWriting('gallery')}
                className="rounded-xl py-4 items-center bg-surface-elevated"
                testID="complete-pick-gallery"
                accessibilityRole="button"
                accessibilityLabel="Pick from gallery (E2E)"
              >
                <View className="flex-row items-center">
                  <Ionicons
                    name="images-outline"
                    size={20}
                    color={colors.textPrimary}
                  />
                  <Text className="font-semibold text-body text-text-primary ml-2">
                    Pick from gallery (E2E)
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => void handleDone()}
              disabled={recordResult.isPending}
              className="rounded-xl py-4 items-center bg-surface-elevated"
              testID="complete-done"
              accessibilityRole="button"
              accessibilityLabel={t('dictation.complete.imDone')}
            >
              {recordResult.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="font-semibold text-body text-text-primary">
                  {t('dictation.complete.imDone')}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(app)/dictation' as never)}
              className="py-3 items-center"
              testID="complete-try-again"
              accessibilityRole="button"
              accessibilityLabel={t('dictation.complete.tryAnotherDictation')}
            >
              <Text className="text-body-sm text-text-muted">
                {t('dictation.complete.tryAnotherDictation')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
