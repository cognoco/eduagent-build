import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  Linking,
  ScrollView,
  AppState,
  ActivityIndicator,
} from 'react-native';
import {
  useRouter,
  useLocalSearchParams,
  useFocusEffect,
  type Href,
} from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { HomeworkCaptureSource, HomeworkProblem } from '@eduagent/schemas';
import { useThemeColors } from '../../../lib/theme';
import {
  cameraReducer,
  initialCameraState,
} from '../../../components/homework/camera-reducer';
import { useHomeworkOcr } from '../../../hooks/use-homework-ocr';
import { useSpeechRecognition } from '../../../hooks/use-speech-recognition';
import { useCreateSubject, useSubjects } from '../../../hooks/use-subjects';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { CelebrationAnimation } from '../../../components/common';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace, homeHrefForReturnTo } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { Sentry } from '../../../lib/sentry';
import {
  createHomeworkProblem,
  getHomeworkProblemText,
  serializeHomeworkProblems,
  splitHomeworkProblems,
} from '../../../components/homework/problem-cards';

type FlashMode = 'off' | 'on' | 'auto';

export default function CameraScreen(): React.ReactNode {
  const router = useRouter();
  const { t } = useTranslation();
  const { subjectId, subjectName, returnTo } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    returnTo?: string;
  }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [state, dispatch] = useReducer(cameraReducer, initialCameraState);
  const ocr = useHomeworkOcr();
  const cameraRef = useRef<CameraView>(null);
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const createSubject = useCreateSubject();
  const speech = useSpeechRecognition();

  const [ocrText, setOcrText] = useState('');
  const [draftProblems, setDraftProblems] = useState<HomeworkProblem[]>([]);
  const [droppedProblems, setDroppedProblems] = useState<HomeworkProblem[]>([]);
  const [manualText, setManualText] = useState('');
  const [voiceProblemId, setVoiceProblemId] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [showCelebration, setShowCelebration] = useState(true);
  // [IMP-1] Track MIME type from the image source for reliable detection.
  // Camera always produces JPEG; gallery picks provide OS-level mimeType.
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);

  // Subject auto-classification state
  const classifyMutation = useClassifySubject();
  const [autoDetectedSubject, setAutoDetectedSubject] = useState<{
    subjectId: string;
    subjectName: string;
  } | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const classifyTriggeredRef = useRef(false);
  const [manualSubjectName, setManualSubjectName] = useState('');
  const lastAppliedTranscriptRef = useRef('');

  // BUG-366: Track phase via ref so useFocusEffect can check it without
  // adding it as a dependency (which would cause spurious re-runs).
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Reset state when screen regains focus (prevents stale state loop).
  // BUG-366: Skip reset when user is in result phase — preserves OCR work
  // when returning from create-subject navigation.
  useFocusEffect(
    useCallback(() => {
      if (phaseRef.current === 'result') return;
      dispatch({ type: 'RESET', hasPermission: permission?.granted ?? false });
      setOcrText('');
      setDraftProblems([]);
      setDroppedProblems([]);
      setManualText('');
      setVoiceProblemId(null);
      lastAppliedTranscriptRef.current = '';
      setManualSubjectName('');
      setShowCelebration(true);
      setFlash('off');
      setAutoDetectedSubject(null);
      setShowSubjectPicker(false);
      classifyTriggeredRef.current = false;
    }, [permission?.granted]),
  );

  // Sync permission state into reducer
  useEffect(() => {
    if (permission?.granted && state.phase === 'permission') {
      dispatch({ type: 'PERMISSION_GRANTED' });
    }
  }, [permission?.granted, state.phase]);

  // Re-check permission when returning from system Settings.
  // useCameraPermissions does not auto-refresh on app resume, so the screen
  // gets stuck in the permission phase after the user grants access externally.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void getPermission();
      }
    });
    return () => sub.remove();
  }, [getPermission]);

  // [BUG-824] Reset the classify trigger whenever the captured image changes,
  // so a fresh photo is always re-classified. Without this, a user whose
  // image source changes in place (different photo, same screen) would skip
  // classification because the ref was still `true` from the previous image.
  // Retake and focus paths already reset it explicitly, but those don't
  // cover the image-source-changed case.
  useEffect(() => {
    classifyTriggeredRef.current = false;
  }, [state.imageUri]);

  useEffect(() => {
    if (!voiceProblemId || speech.isListening || !speech.transcript.trim()) {
      return;
    }

    const transcript = speech.transcript.trim();
    if (transcript === lastAppliedTranscriptRef.current) {
      return;
    }

    lastAppliedTranscriptRef.current = transcript;
    setDraftProblems((prev) =>
      prev.map((problem) => {
        if (problem.id !== voiceProblemId) {
          return problem;
        }
        const separator = problem.text.trim() ? '\n' : '';
        return {
          ...problem,
          text: `${problem.text}${separator}${transcript}`,
        };
      }),
    );
  }, [speech.isListening, speech.transcript, voiceProblemId]);

  useEffect(() => {
    if (!speech.error) return;
    platformAlert('Microphone unavailable', speech.error);
  }, [speech.error]);

  // Sync OCR hook status into reducer
  useEffect(() => {
    if (ocr.status === 'done' && ocr.text) {
      const splitResult = splitHomeworkProblems(ocr.text);
      dispatch({ type: 'OCR_SUCCESS', text: ocr.text });
      setOcrText(ocr.text);
      setDraftProblems(splitResult.problems);
      setDroppedProblems(splitResult.droppedProblems);
    } else if (ocr.status === 'error' && ocr.error) {
      dispatch({ type: 'OCR_ERROR', message: ocr.error });
      setDroppedProblems([]);
    }
  }, [ocr.status, ocr.text, ocr.error]);

  // [BUG-689 / M-9] UI-level safety timeout. The hook itself caps the
  // on-device pass at 20s and the server fallback at 15s, but a hung
  // promise (e.g. native module wedged, fetch never resolving) can leave
  // the screen stuck on the "Reading your homework..." spinner. After
  // 45s in the processing phase we cancel the OCR and surface an
  // actionable error so the user is never trapped.
  useEffect(() => {
    if (state.phase !== 'processing') return undefined;
    const OCR_UI_TIMEOUT_MS = 45_000;
    const timeoutId = setTimeout(() => {
      ocr.cancel();
      dispatch({
        type: 'OCR_ERROR',
        message: t('homework.ocrTimeout'),
      });
    }, OCR_UI_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [state.phase, ocr, t]);

  const combinedProblemText = getHomeworkProblemText(draftProblems);
  const homeworkCaptureSource = state.imageUri ? state.source : undefined;

  // Auto-classify subject when OCR text is available and no subjectId
  useEffect(() => {
    async function classify(): Promise<void> {
      if (
        state.phase !== 'result' ||
        !combinedProblemText ||
        subjectId ||
        classifyTriggeredRef.current
      )
        return;
      classifyTriggeredRef.current = true;
      try {
        const result = await classifyMutation.mutateAsync({
          text: combinedProblemText,
        });
        if (!result.needsConfirmation && result.candidates.length === 1) {
          const candidate = result.candidates[0];
          // [BUG-807] Server response may be malformed — `length === 1` does
          // not guarantee a non-null entry, and even a non-null entry might
          // be missing subjectId/subjectName. Validate before destructuring,
          // otherwise we'd setAutoDetectedSubject({ subjectId: undefined })
          // and downstream navigation would crash on the empty route param.
          if (candidate?.subjectId && candidate?.subjectName) {
            setAutoDetectedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
          } else {
            Sentry.captureMessage(
              'Homework auto-detect: malformed candidate (missing subjectId/Name)',
              { level: 'warning', extra: { candidate } },
            );
            setShowSubjectPicker(true);
          }
        } else if (
          result.suggestedSubjectName &&
          result.candidates.length === 0
        ) {
          // LLM suggested a subject but the user has none enrolled yet —
          // auto-create it so the user sees "Looks like [Subject]" + "Let's go"
          try {
            const created = await createSubject.mutateAsync({
              name: result.suggestedSubjectName,
              rawInput: result.suggestedSubjectName,
            });
            setAutoDetectedSubject({
              subjectId: created.subject.id,
              subjectName: created.subject.name,
            });
          } catch (autoCreateErr) {
            // BUG-363: Silent recovery ban — capture so we can track how often
            // auto-create fails and triage root causes.
            Sentry.captureException(autoCreateErr, {
              tags: {
                component: 'HomeworkCamera',
                action: 'auto-create-subject',
              },
            });
            // [BUG-809] Surface the actual server error to the user instead
            // of a generic "select your subject manually." line. formatApiError
            // distinguishes quota / forbidden / network errors from each other,
            // which is precisely the information the user needs to react.
            platformAlert(
              'Could not detect subject',
              `${formatApiError(
                autoCreateErr,
              )} Please select your subject manually.`,
            );
            setShowSubjectPicker(true);
          }
        } else {
          setShowSubjectPicker(true);
        }
      } catch (err) {
        // [BUG-802] Silent fallback ban — Sentry capture + user-visible alert
        // explaining why the subject picker appeared. Without this, the user
        // lands on the picker with no idea their photo failed to classify.
        Sentry.captureException(err, {
          tags: {
            component: 'HomeworkCamera',
            action: 'auto-classify-subject',
          },
        });
        platformAlert(
          "Couldn't identify the subject",
          `${formatApiError(err)} Please pick the subject manually.`,
        );
        setShowSubjectPicker(true);
      }
    }
    classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, combinedProblemText, subjectId]);

  const handleCapture = useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync();
      if (photo?.uri) {
        setImageMimeType('image/jpeg'); // expo-camera always produces JPEG
        dispatch({ type: 'PHOTO_TAKEN', uri: photo.uri, source: 'camera' });
      }
    } catch (error) {
      console.error('[HomeworkCamera] Failed to capture photo:', error);
      platformAlert(
        'Could not take photo',
        'Please try again. If the problem continues, try importing from your gallery instead.',
      );
    }
  }, []);

  const handlePickFromGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) {
        return;
      }

      const selectedImage = result.assets?.[0];
      if (!selectedImage?.uri) {
        platformAlert(
          "Couldn't open your photos",
          'Please try again or use the camera instead.',
        );
        return;
      }

      setImageMimeType(selectedImage.mimeType ?? null);
      dispatch({
        type: 'PHOTO_TAKEN',
        uri: selectedImage.uri,
        source: 'gallery',
      });
    } catch (error) {
      console.error('[HomeworkCamera] Failed to open image library:', error);

      const permission =
        await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
      if (permission && !permission.granted && !permission.canAskAgain) {
        platformAlert(
          'Photo access needed',
          'Please enable photo library access in Settings to import homework from your gallery.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
        return;
      }

      platformAlert(
        "Couldn't open your photos",
        'Please try again or use the camera instead.',
      );
    }
  }, []);

  const handleConfirmPhoto = useCallback(async () => {
    if (!state.imageUri) return;
    dispatch({ type: 'CONFIRM_PHOTO' });
    await ocr.process(state.imageUri);
  }, [state.imageUri, ocr]);

  const handleRetake = useCallback(() => {
    if (speech.isListening) {
      void speech.stopListening();
    }
    setVoiceProblemId(null);
    lastAppliedTranscriptRef.current = '';
    setOcrText('');
    setDraftProblems([]);
    setDroppedProblems([]);
    setManualText('');
    setManualSubjectName('');
    setAutoDetectedSubject(null);
    setShowSubjectPicker(false);
    setShowCelebration(true);
    classifyTriggeredRef.current = false;
    dispatch({ type: 'RETAKE' });
  }, [speech]);

  const handleRetryOcr = useCallback(async () => {
    dispatch({ type: 'RETRY_OCR' });
    await ocr.retry();
  }, [ocr]);

  const navigateToSession = useCallback(
    (
      sid: string,
      sName: string,
      problemText: string,
      problems?: HomeworkProblem[],
      imageUri?: string,
      sourceOcrText?: string,
      captureSource?: HomeworkCaptureSource,
    ) => {
      const MAX_PARAM_LENGTH = 8000; // safe URL param budget

      let homeworkProblemsParam: string | undefined;
      let droppedProblemCount = 0;
      let singleProblemTruncated = false;
      if (problems && problems.length > 0) {
        // Drop trailing problems until the serialized string fits.
        let truncatedProblems = [...problems];
        let serialized = serializeHomeworkProblems(truncatedProblems);
        while (
          serialized.length > MAX_PARAM_LENGTH &&
          truncatedProblems.length > 1
        ) {
          truncatedProblems = truncatedProblems.slice(0, -1);
          serialized = serializeHomeworkProblems(truncatedProblems);
        }
        droppedProblemCount = problems.length - truncatedProblems.length;
        // If a single problem still exceeds the budget, truncate its text
        // at a word boundary as a last resort.
        if (
          serialized.length > MAX_PARAM_LENGTH &&
          truncatedProblems.length === 1
        ) {
          const problem = truncatedProblems[0];
          if (problem) {
            const maxTextLen =
              problem.text.length - (serialized.length - MAX_PARAM_LENGTH) - 30;
            const wordBoundary = problem.text.lastIndexOf(
              ' ',
              Math.max(0, maxTextLen),
            );
            const truncatedText =
              problem.text.slice(
                0,
                wordBoundary > 0 ? wordBoundary : maxTextLen,
              ) + ' [truncated]';
            truncatedProblems = [{ ...problem, text: truncatedText }];
            serialized = serializeHomeworkProblems(truncatedProblems);
            singleProblemTruncated = true;
          }
        }
        homeworkProblemsParam = serialized;
      }

      // [BUG-823 / F-MOB-25] Surface truncation to the user instead of
      // silently dropping problems. Without this, a learner who imports 10
      // problems can lose 9 of them with no indication. We alert (non-blocking
      // toast/dialog) and log to Sentry so we can monitor frequency and
      // decide whether to raise MAX_PARAM_LENGTH or migrate off URL params.
      if (droppedProblemCount > 0 || singleProblemTruncated) {
        const alertMessage = singleProblemTruncated
          ? droppedProblemCount > 0
            ? `Some problems were too long to fit. Only the first ${
                (problems?.length ?? 0) - droppedProblemCount
              } were saved, and the last one was shortened.`
            : 'This problem was too long to send in full and was shortened.'
          : `Some problems were too long; only the first ${
              (problems?.length ?? 0) - droppedProblemCount
            } of ${problems?.length ?? 0} are saved.`;
        platformAlert('Heads up', alertMessage);
        Sentry.captureMessage('homework problems truncated for URL budget', {
          level: 'warning',
          extra: {
            inputCount: problems?.length ?? 0,
            droppedProblemCount,
            singleProblemTruncated,
            maxParamLength: MAX_PARAM_LENGTH,
          },
        });
      }

      router.replace({
        pathname: '/(app)/session',
        params: {
          mode: 'homework',
          subjectId: sid,
          subjectName: sName,
          problemText,
          ...(homeworkProblemsParam !== undefined
            ? { homeworkProblems: homeworkProblemsParam }
            : {}),
          ...(sourceOcrText ? { ocrText: sourceOcrText } : {}),
          ...(imageUri ? { imageUri } : {}),
          ...(imageMimeType ? { imageMimeType } : {}),
          ...(captureSource ? { captureSource } : {}),
          ...(returnTo ? { returnTo } : {}),
        },
      } as Href);
    },
    [imageMimeType, returnTo, router],
  );

  const handleConfirmResult = useCallback(() => {
    const effectiveSubjectId = subjectId ?? autoDetectedSubject?.subjectId;
    const effectiveSubjectName =
      subjectName ?? autoDetectedSubject?.subjectName ?? '';
    if (!combinedProblemText.trim()) {
      platformAlert(
        'No problems found',
        'Please keep at least one problem card.',
      );
      return;
    }
    if (!effectiveSubjectId) {
      platformAlert(
        'No subject selected',
        'Please go back and select a subject first.',
      );
      return;
    }
    navigateToSession(
      effectiveSubjectId,
      effectiveSubjectName,
      combinedProblemText,
      draftProblems,
      state.imageUri ?? undefined,
      ocrText,
      homeworkCaptureSource,
    );
  }, [
    navigateToSession,
    subjectId,
    subjectName,
    autoDetectedSubject,
    combinedProblemText,
    draftProblems,
    state.imageUri,
    ocrText,
    homeworkCaptureSource,
  ]);

  const handlePickSubject = useCallback(
    (sid: string, sName: string) => {
      navigateToSession(
        sid,
        sName,
        combinedProblemText,
        draftProblems,
        state.imageUri ?? undefined,
        ocrText,
        homeworkCaptureSource,
      );
    },
    [
      navigateToSession,
      combinedProblemText,
      draftProblems,
      state.imageUri,
      ocrText,
      homeworkCaptureSource,
    ],
  );

  const handleManualSubjectContinue = useCallback(async () => {
    const typedName = manualSubjectName.trim();
    if (!typedName) return;

    const existingSubject = subjects?.find(
      (subject) =>
        subject.name.trim().toLowerCase() === typedName.toLowerCase(),
    );
    if (existingSubject) {
      navigateToSession(
        existingSubject.id,
        existingSubject.name,
        combinedProblemText,
        draftProblems,
        state.imageUri ?? undefined,
        ocrText,
        homeworkCaptureSource,
      );
      return;
    }

    try {
      const result = await createSubject.mutateAsync({
        name: typedName,
        rawInput: typedName,
      });
      navigateToSession(
        result.subject.id,
        result.subject.name,
        combinedProblemText,
        draftProblems,
        state.imageUri ?? undefined,
        ocrText,
        homeworkCaptureSource,
      );
    } catch (err: unknown) {
      platformAlert('Could not create subject', formatApiError(err));
    }
  }, [
    combinedProblemText,
    createSubject,
    draftProblems,
    manualSubjectName,
    navigateToSession,
    ocrText,
    homeworkCaptureSource,
    state.imageUri,
    subjects,
  ]);

  const handleManualContinue = useCallback(async () => {
    if (subjectId) {
      navigateToSession(
        subjectId,
        subjectName ?? '',
        manualText,
        undefined,
        undefined,
        undefined,
        homeworkCaptureSource,
      );
      return;
    }
    // No subjectId — auto-classify the manually typed text
    try {
      const result = await classifyMutation.mutateAsync({ text: manualText });
      if (!result.needsConfirmation && result.candidates.length === 1) {
        const candidate = result.candidates[0];
        if (candidate) {
          navigateToSession(
            candidate.subjectId,
            candidate.subjectName,
            manualText,
            undefined,
            undefined,
            undefined,
            homeworkCaptureSource,
          );
        }
      } else {
        // Multiple candidates or low confidence — show picker
        setShowSubjectPicker(true);
      }
    } catch (classifyErr) {
      // BUG-367: Tell the user why the subject picker appeared instead of
      // silently showing it after classification fails.
      Sentry.captureException(classifyErr, {
        tags: { component: 'HomeworkCamera', action: 'manual-classify' },
      });
      platformAlert(
        'Could not identify the subject',
        'Please pick the subject this homework belongs to.',
        [{ text: t('common.ok') }],
      );
      setShowSubjectPicker(true);
    }
  }, [
    navigateToSession,
    subjectId,
    subjectName,
    manualText,
    classifyMutation,
    homeworkCaptureSource,
    t,
  ]);

  const handleManualPickSubject = useCallback(
    (sid: string, sName: string) => {
      navigateToSession(
        sid,
        sName,
        manualText,
        undefined,
        undefined,
        undefined,
        homeworkCaptureSource,
      );
    },
    [navigateToSession, manualText, homeworkCaptureSource],
  );

  const handleClose = useCallback(() => {
    goBackOrReplace(router, homeHrefForReturnTo(returnTo));
  }, [returnTo, router]);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const handleProblemTextChange = useCallback(
    (problemId: string, text: string) => {
      setDraftProblems((prev) =>
        prev.map((problem) =>
          problem.id === problemId ? { ...problem, text } : problem,
        ),
      );
    },
    [],
  );

  const handleAddProblem = useCallback(() => {
    setDraftProblems((prev) => [
      ...prev,
      createHomeworkProblem('', { source: 'manual', originalText: null }),
    ]);
  }, []);

  const handleRestoreDroppedProblems = useCallback(() => {
    if (droppedProblems.length === 0) return;
    setDraftProblems((prev) => [...prev, ...droppedProblems]);
    setDroppedProblems([]);
  }, [droppedProblems]);

  const handleRemoveProblem = useCallback((problemId: string) => {
    setDraftProblems((prev) =>
      prev.filter((problem) => problem.id !== problemId),
    );
    setVoiceProblemId((prev) => (prev === problemId ? null : prev));
  }, []);

  const handleProblemMicPress = useCallback(
    async (problemId: string) => {
      if (speech.isListening) {
        await speech.stopListening();
        if (voiceProblemId === problemId) {
          return;
        }
      }

      setVoiceProblemId(problemId);
      lastAppliedTranscriptRef.current = '';
      speech.clearTranscript();
      await speech.startListening();
    },
    [speech, voiceProblemId],
  );

  // ---- Permission phase ----
  if (state.phase === 'permission') {
    const denied = permission && !permission.granted && !permission.canAskAgain;

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-h2 font-bold text-text-primary text-center mb-3">
          {t('homework.permissionTitle')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          {denied
            ? t('homework.permissionDenied')
            : t('homework.permissionPrompt')}
        </Text>
        {denied ? (
          <Pressable
            testID="open-settings-button"
            onPress={() => Linking.openSettings()}
            className="bg-primary rounded-button py-4 px-8 min-h-[48px] items-center justify-center"
            accessibilityLabel={t('homework.openSettingsLabel')}
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('homework.openSettings')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            testID="grant-permission-button"
            onPress={requestPermission}
            className="bg-primary rounded-button py-4 px-8 min-h-[48px] items-center justify-center"
            accessibilityLabel={t('homework.allowCameraLabel')}
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('homework.allowCamera')}
            </Text>
          </Pressable>
        )}
        <Pressable
          testID="close-button"
          onPress={handleClose}
          className="mt-4 py-3 px-6 min-h-[48px] items-center justify-center"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
        >
          <Text className="text-body text-text-secondary">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---- Viewfinder phase ----
  if (state.phase === 'viewfinder') {
    return (
      <View className="flex-1 bg-background">
        <CameraView
          ref={cameraRef}
          testID="camera-view"
          style={{ flex: 1 }}
          facing="back"
          flash={flash}
        >
          {/* Close button — top-left (standard camera app convention) */}
          <Pressable
            testID="close-button"
            onPress={handleClose}
            className="absolute top-0 left-4 w-14 h-14 items-center justify-center rounded-full bg-black/60 border border-white/30"
            style={{ marginTop: insets.top + 8 }}
            accessibilityLabel={t('homework.closeCameraLabel')}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {/* Capture guide overlay — box-none so close button receives touches */}
          <View
            className="flex-1 items-center justify-center px-6"
            style={{ pointerEvents: 'box-none' }}
          >
            <View className="w-full aspect-[4/3] border-2 border-dashed border-primary/60 rounded-card items-center justify-center">
              <Text className="text-white/70 text-body-sm text-center">
                {t('homework.centerHomework')}
              </Text>
            </View>
          </View>

          {/* Bottom controls: gallery + capture + flash */}
          <View
            className="flex-row items-center justify-center px-8 pb-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Pressable
              testID="gallery-button"
              onPress={() => void handlePickFromGallery()}
              className="absolute left-8 w-12 h-12 items-center justify-center rounded-full bg-black/40"
              accessibilityLabel={t('homework.galleryLabel')}
              accessibilityRole="button"
            >
              <Ionicons name="images-outline" size={22} color="white" />
            </Pressable>

            <Pressable
              testID="capture-button"
              onPress={handleCapture}
              className="w-16 h-16 rounded-full bg-primary items-center justify-center"
              accessibilityLabel={t('homework.takePhotoLabel')}
              accessibilityRole="button"
            >
              <View className="w-14 h-14 rounded-full border-2 border-white/80" />
            </Pressable>

            <Pressable
              testID="flash-toggle"
              onPress={toggleFlash}
              className="absolute right-8 w-12 h-12 items-center justify-center rounded-full bg-black/40"
              accessibilityLabel={t('homework.flashLabel', {
                state:
                  flash === 'off'
                    ? t('homework.flashOff')
                    : t('homework.flashOn'),
              })}
              accessibilityRole="button"
            >
              <Ionicons
                name={flash === 'off' ? 'flash-off-outline' : 'flash-outline'}
                size={22}
                color="white"
              />
            </Pressable>
          </View>
        </CameraView>
      </View>
    );
  }

  // ---- Preview phase ----
  if (state.phase === 'preview') {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-1 items-center justify-center px-6">
          {state.imageUri ? (
            <Image
              source={{ uri: state.imageUri }}
              className="w-full aspect-[4/3] rounded-card"
              resizeMode="contain"
              testID="photo-preview"
              accessibilityLabel={t('homework.photoPreviewLabel')}
            />
          ) : (
            <View className="w-full aspect-[4/3] bg-surface rounded-card items-center justify-center">
              <Text className="text-body text-text-secondary">
                {t('homework.photoCaptured')}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-4 px-6 pb-2">
          <Pressable
            testID="retake-button"
            onPress={handleRetake}
            className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
            accessibilityLabel={t('homework.retakeLabel')}
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('homework.retake')}
            </Text>
          </Pressable>
          <Pressable
            testID="camera-use-this-button"
            onPress={handleConfirmPhoto}
            className="flex-1 bg-accent rounded-button py-4 min-h-[48px] items-center justify-center border border-accent"
            accessibilityLabel={t('homework.useThisPhotoLabel')}
            accessibilityRole="button"
          >
            <Text className="text-body font-bold text-white">
              {t('homework.useThis')}
            </Text>
          </Pressable>
        </View>
        <Pressable
          testID="preview-cancel"
          onPress={handleClose}
          className="py-3 px-6 min-h-[44px] items-center justify-center self-center mb-2"
          accessibilityLabel={t('homework.cancelAndGoBackLabel')}
          accessibilityRole="button"
        >
          <Text className="text-body text-text-secondary">
            {t('common.cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---- Processing phase ----
  if (state.phase === 'processing') {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="w-full">
          <View className="w-full aspect-[4/3] bg-surface/50 rounded-card mb-6" />
          <View className="gap-3 px-2">
            <View className="h-4 bg-surface-elevated rounded-full w-full" />
            <View className="h-4 bg-surface-elevated rounded-full w-4/5" />
            <View className="h-4 bg-surface-elevated rounded-full w-3/5" />
          </View>
          <Text className="text-body text-text-secondary text-center mt-6">
            {t('homework.readingHomework', { subject: subjectName ?? '' })}
          </Text>
          <Pressable
            onPress={() => {
              ocr.cancel();
              dispatch({ type: 'RETAKE' });
            }}
            className="mt-6 py-3 px-6 min-h-[44px] items-center justify-center self-center"
            accessibilityLabel={t('homework.cancelOcrLabel')}
            accessibilityRole="button"
            testID="camera-cancel-ocr"
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Result phase ----
  if (state.phase === 'result') {
    const needsSubjectPick = !subjectId;

    return (
      <ScrollView
        className="flex-1 bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="result-scroll"
      >
        <Pressable
          testID="camera-back-button"
          onPress={handleRetake}
          className="self-start flex-row items-center min-h-[48px] mt-2 px-2"
          accessibilityLabel={t('homework.retakeLabel')}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text className="text-body font-semibold text-text-primary ml-1">
            {t('common.back')}
          </Text>
        </Pressable>

        {showCelebration && (
          <View className="items-center mt-2">
            <CelebrationAnimation
              size={80}
              color={colors.success}
              accentColor={colors.accent}
              onComplete={() => setShowCelebration(false)}
              testID="homework-celebration"
            />
          </View>
        )}

        <Text className="text-body text-text-secondary mt-4 mb-3">
          {t('homework.problemsFound')}
        </Text>

        {droppedProblems.length > 0 && (
          <Pressable
            testID="dropped-fragments-chip"
            onPress={handleRestoreDroppedProblems}
            className="mb-3 rounded-button bg-surface px-4 py-3"
            accessibilityLabel={t('homework.addSkippedFragmentsLabel')}
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-medium text-text-primary">
              {t('homework.skippedFragments', {
                count: droppedProblems.length,
              })}
            </Text>
          </Pressable>
        )}

        <View className="gap-3">
          {draftProblems.map((problem, index) => (
            <View
              key={problem.id}
              className="bg-surface rounded-card p-4"
              testID={`problem-card-${index}`}
            >
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-body font-semibold text-text-primary">
                  {t('homework.problemNumber', { number: index + 1 })}
                </Text>
                {draftProblems.length > 1 && (
                  <Pressable
                    onPress={() => handleRemoveProblem(problem.id)}
                    testID={`remove-problem-${index}`}
                    accessibilityLabel={t('homework.removeProblemLabel', {
                      number: index + 1,
                    })}
                    accessibilityRole="button"
                  >
                    <Text className="text-body-sm text-danger">
                      {t('homework.remove')}
                    </Text>
                  </Pressable>
                )}
              </View>

              <TextInput
                testID={
                  index === 0 ? 'result-text-input' : `problem-input-${index}`
                }
                value={problem.text}
                onChangeText={(text) =>
                  handleProblemTextChange(problem.id, text)
                }
                multiline
                className="bg-background rounded-card p-4 text-body text-text-primary min-h-[120px]"
                textAlignVertical="top"
                placeholder={t('homework.problemNumber', { number: index + 1 })}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t('homework.problemInputLabel', {
                  number: index + 1,
                })}
              />
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-body-sm text-text-secondary">
                  {voiceProblemId === problem.id && speech.isListening
                    ? t('homework.listening')
                    : t('homework.voiceHint')}
                </Text>
                <Pressable
                  testID={`problem-mic-${index}`}
                  onPress={() => void handleProblemMicPress(problem.id)}
                  className={`w-12 h-12 rounded-full items-center justify-center ${
                    voiceProblemId === problem.id && speech.isListening
                      ? 'bg-primary'
                      : 'bg-surface-elevated'
                  }`}
                  accessibilityLabel={
                    voiceProblemId === problem.id && speech.isListening
                      ? t('homework.stopDictatingProblemLabel', {
                          number: index + 1,
                        })
                      : t('homework.dictateProblemLabel', {
                          number: index + 1,
                        })
                  }
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={
                      voiceProblemId === problem.id && speech.isListening
                        ? 'stop'
                        : 'mic-outline'
                    }
                    size={22}
                    color={
                      voiceProblemId === problem.id && speech.isListening
                        ? colors.textInverse
                        : colors.textSecondary
                    }
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          testID="add-problem-button"
          onPress={handleAddProblem}
          className="mt-3 self-start bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] justify-center"
          accessibilityLabel={t('homework.addProblemLabel')}
          accessibilityRole="button"
        >
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('homework.addProblem')}
          </Text>
        </Pressable>

        {/* M10: Classification done but no subject resolved and picker not shown */}
        {needsSubjectPick &&
          !classifyMutation.isPending &&
          !autoDetectedSubject &&
          !showSubjectPicker &&
          classifyMutation.isSuccess && (
            <View
              className="mt-4 rounded-card bg-surface p-4"
              testID="classify-fallback"
            >
              <Text className="text-body-sm text-text-secondary mb-3">
                {t('homework.classifyFallbackPrompt')}
              </Text>
              <Pressable
                onPress={() => setShowSubjectPicker(true)}
                className="bg-primary rounded-button py-3 mb-2 min-h-[48px] items-center justify-center"
                accessibilityLabel={t('homework.typeSubjectManuallyLabel')}
                accessibilityRole="button"
                testID="classify-fallback-type-subject"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('homework.typeSubjectManually')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleRetake}
                className="bg-surface-elevated rounded-button py-3 min-h-[48px] items-center justify-center"
                accessibilityLabel={t('homework.retakeLabel')}
                accessibilityRole="button"
                testID="classify-fallback-retake"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('homework.retake')}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Subject auto-detection loading indicator */}
        {needsSubjectPick && classifyMutation.isPending && (
          <View>
            <Text
              className="text-body-sm text-text-secondary mt-3"
              testID="classify-loading"
            >
              {t('homework.classifyLoading')}
            </Text>
            {/* BUG-388: Always show Retake during classification so user
                isn't stuck if detection hangs or takes too long */}
            <Pressable
              testID="classify-pending-retake"
              onPress={handleRetake}
              className="bg-surface rounded-button py-3 mt-4 min-h-[48px] items-center justify-center"
              accessibilityLabel={t('homework.retakeLabel')}
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('homework.retake')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Auto-detected subject confirmation */}
        {needsSubjectPick && autoDetectedSubject && !showSubjectPicker && (
          <View
            className="flex-row items-center gap-2 mt-3 mb-2"
            testID="auto-detected-subject"
          >
            <Text className="text-sm text-text-secondary">
              {t('homework.looksLike')}{' '}
              <Text className="font-medium text-text-primary">
                {autoDetectedSubject.subjectName}
              </Text>
            </Text>
            <Pressable
              onPress={() => setShowSubjectPicker(true)}
              testID="change-subject-link"
            >
              <Text className="text-sm text-primary underline">
                {t('homework.change')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Subject picker — shown when classification needs confirmation, fails, or user taps "Change" */}
        {needsSubjectPick && showSubjectPicker && (
          <View className="mt-6" testID="subject-picker">
            <Text className="text-body font-semibold text-text-primary mb-3">
              {t('homework.whichSubject')}
            </Text>
            {/* [BUG-690] In the error/no-candidate phase the picker can render
                empty rows of subjects while useSubjects() is still loading.
                Show an explicit loading state so the picker is never blank. */}
            {subjectsLoading && !classifyMutation.data?.candidates?.length ? (
              <View
                className="flex-row items-center gap-2 py-3"
                testID="subject-picker-loading"
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-body-sm text-text-secondary">
                  {t('homework.loadingSubjects')}
                </Text>
              </View>
            ) : null}
            {/* Show classification candidates first (sorted by confidence) */}
            {classifyMutation.data?.candidates
              ?.slice()
              .filter((c): c is NonNullable<typeof c> => c != null)
              .sort((a, b) => b.confidence - a.confidence)
              .map((candidate, index) => (
                <Pressable
                  key={candidate.subjectId}
                  onPress={() =>
                    handlePickSubject(
                      candidate.subjectId,
                      candidate.subjectName,
                    )
                  }
                  className={`rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center ${
                    index === 0
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-surface-elevated'
                  }`}
                  accessibilityLabel={t('homework.selectSubjectLabel', {
                    name: candidate.subjectName,
                  })}
                  accessibilityRole="button"
                  testID={`subject-pick-${candidate.subjectId}`}
                >
                  <Text className="text-body text-text-primary">
                    {candidate.subjectName}
                  </Text>
                </Pressable>
              ))}
            {/* Remaining enrolled subjects not in candidates */}
            {subjects
              ?.filter(
                (s) =>
                  !classifyMutation.data?.candidates?.some(
                    (c) => c != null && c.subjectId === s.id,
                  ),
              )
              .map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => handlePickSubject(s.id, s.name)}
                  className="bg-surface-elevated rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center"
                  accessibilityLabel={t('homework.selectSubjectLabel', {
                    name: s.name,
                  })}
                  accessibilityRole="button"
                  testID={`subject-pick-${s.id}`}
                >
                  <Text className="text-body text-text-primary">{s.name}</Text>
                </Pressable>
              ))}
            <Pressable
              onPress={() => router.push('/create-subject')}
              className="bg-surface rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center"
              accessibilityLabel={t('homework.createNewSubjectLabel')}
              accessibilityRole="button"
              testID="camera-create-subject"
            >
              <Text className="text-body font-semibold text-primary">
                {t('homework.createNewSubject')}
              </Text>
            </Pressable>

            {/* Manual subject entry — lets user type a subject name */}
            <Text className="text-body-sm text-text-secondary mt-4 mb-2">
              {t('homework.orTypeSubject')}
            </Text>
            <TextInput
              testID="camera-subject-input"
              value={manualSubjectName}
              onChangeText={setManualSubjectName}
              placeholder={t('homework.subjectInputPlaceholder')}
              placeholderTextColor={colors.muted}
              className="bg-surface rounded-button px-4 py-3 text-body text-text-primary min-h-[48px] mb-3 border border-border"
              accessibilityLabel={t('homework.typeSubjectLabel')}
              autoCapitalize="words"
            />
            <Pressable
              testID="camera-continue-button"
              onPress={() => void handleManualSubjectContinue()}
              disabled={!manualSubjectName.trim() || createSubject.isPending}
              className={`rounded-button py-4 min-h-[48px] items-center justify-center mb-2 ${
                manualSubjectName.trim() && !createSubject.isPending
                  ? 'bg-accent'
                  : 'bg-surface-elevated'
              }`}
              accessibilityLabel={t('homework.continueWithSubjectLabel')}
              accessibilityRole="button"
            >
              <Text
                className={`text-body font-semibold ${
                  manualSubjectName.trim()
                    ? 'text-white'
                    : 'text-text-secondary'
                }`}
              >
                {createSubject.isPending
                  ? t('homework.creatingSubject')
                  : t('common.continue')}
              </Text>
            </Pressable>

            <Pressable
              testID="retake-button"
              onPress={handleRetake}
              className="bg-surface rounded-button py-4 mt-2 min-h-[48px] items-center justify-center"
              accessibilityLabel={t('homework.retakeLabel')}
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('homework.retake')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* No subject pick needed — show standard action buttons */}
        {needsSubjectPick &&
          !showSubjectPicker &&
          !classifyMutation.isPending &&
          autoDetectedSubject && (
            <View className="flex-row gap-4 mt-6">
              <Pressable
                testID="retake-button"
                onPress={handleRetake}
                className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
                accessibilityLabel={t('homework.retakeLabel')}
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('homework.retake')}
                </Text>
              </Pressable>
              <Pressable
                testID="confirm-button"
                onPress={handleConfirmResult}
                className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
                accessibilityLabel={t('homework.startSessionLabel')}
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('homework.letsGo')}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Subject already known — standard action buttons */}
        {!needsSubjectPick && (
          <View className="flex-row gap-4 mt-6">
            <Pressable
              testID="retake-button"
              onPress={handleRetake}
              className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
              accessibilityLabel={t('homework.retakeLabel')}
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('homework.retake')}
              </Text>
            </Pressable>
            <Pressable
              testID="confirm-button"
              onPress={handleConfirmResult}
              className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
              accessibilityLabel={t('homework.startSessionLabel')}
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('homework.letsGo')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  // ---- Error phase ----
  if (state.phase === 'error') {
    const showManualFallback = ocr.failCount >= 1;
    const errorMessage = state.errorMessage ?? t('homework.ocrDefaultError');

    return (
      <View
        className="flex-1 bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Pressable
          testID="close-button"
          onPress={handleClose}
          className="self-start w-12 h-12 items-center justify-center mt-2"
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        >
          <Text className="text-h3 font-bold text-text-primary">X</Text>
        </Pressable>

        <View className="flex-1 justify-center">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {errorMessage}
          </Text>

          {showManualFallback ? (
            <View className="mt-6">
              <Text className="text-body text-text-secondary text-center mb-4">
                {t('homework.typeItOut')}
              </Text>
              <TextInput
                testID="manual-input"
                value={manualText}
                onChangeText={setManualText}
                multiline
                placeholder={t('homework.manualInputPlaceholder')}
                placeholderTextColor={colors.muted}
                className="bg-surface rounded-card p-4 text-body text-text-primary min-h-[120px] mb-4"
                textAlignVertical="top"
                accessibilityLabel={t('homework.typeManuallyLabel')}
              />
              <View className="gap-3">
                {!subjectId && manualText.trim() && showSubjectPicker ? (
                  <>
                    <Text className="text-body font-semibold text-text-primary mt-2 mb-1">
                      {t('homework.whichSubject')}
                    </Text>
                    {subjectsLoading ? (
                      <View
                        className="flex-row items-center gap-2 py-3"
                        testID="manual-subject-picker-loading"
                      >
                        <ActivityIndicator
                          size="small"
                          color={colors.primary}
                        />
                        <Text className="text-body-sm text-text-secondary">
                          {t('homework.loadingSubjects')}
                        </Text>
                      </View>
                    ) : !subjects || subjects.length === 0 ? (
                      <View
                        className="py-3"
                        testID="manual-subject-picker-empty"
                      >
                        <Text className="text-body-sm text-text-secondary mb-3">
                          {t('homework.noSubjectsYet')}
                        </Text>
                        <Pressable
                          testID="manual-subject-picker-create"
                          onPress={() => router.push('/create-subject')}
                          className="bg-primary rounded-button py-3 px-4 min-h-[48px] items-center justify-center"
                          accessibilityLabel={t(
                            'homework.createNewSubjectLabel',
                          )}
                          accessibilityRole="button"
                        >
                          <Text className="text-body font-semibold text-text-inverse">
                            {t('homework.createSubject')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      subjects.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => handleManualPickSubject(s.id, s.name)}
                          className="bg-surface-elevated rounded-button py-3 px-4 min-h-[48px] justify-center"
                          accessibilityLabel={t('homework.selectSubjectLabel', {
                            name: s.name,
                          })}
                          accessibilityRole="button"
                          testID={`manual-subject-pick-${s.id}`}
                        >
                          <Text className="text-body text-text-primary">
                            {s.name}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </>
                ) : (
                  <Pressable
                    testID="manual-continue-button"
                    onPress={handleManualContinue}
                    disabled={!manualText.trim() || classifyMutation.isPending}
                    className={`rounded-button py-4 min-h-[48px] items-center justify-center ${
                      manualText.trim() && !classifyMutation.isPending
                        ? 'bg-primary'
                        : 'bg-surface'
                    }`}
                    accessibilityLabel={t('homework.continueWithProblemLabel')}
                    accessibilityRole="button"
                  >
                    <Text
                      className={`text-body font-semibold ${
                        manualText.trim() && !classifyMutation.isPending
                          ? 'text-text-inverse'
                          : 'text-text-secondary'
                      }`}
                    >
                      {classifyMutation.isPending
                        ? t('homework.classifyLoading')
                        : t('homework.continueArrow')}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  testID="try-camera-again-button"
                  onPress={handleRetake}
                  className="bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
                  accessibilityLabel={t('homework.tryCameraAgainLabel')}
                  accessibilityRole="button"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {t('homework.tryCameraAgain')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View className="flex-row gap-4 mt-6">
                <Pressable
                  testID="retake-button"
                  onPress={handleRetake}
                  className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
                  accessibilityLabel={t('homework.retakeLabel')}
                  accessibilityRole="button"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {t('homework.retake')}
                  </Text>
                </Pressable>
                <Pressable
                  testID="retry-button"
                  onPress={handleRetryOcr}
                  className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
                  accessibilityLabel={t('homework.tryReadingAgainLabel')}
                  accessibilityRole="button"
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    {t('common.tryAgain')}
                  </Text>
                </Pressable>
              </View>
              {/* L2: Provide Go Home escape on first OCR failure */}
              <Pressable
                testID="go-home-button"
                onPress={handleClose}
                className="mt-3 py-3 min-h-[48px] items-center justify-center"
                accessibilityLabel={t('common.goHome')}
                accessibilityRole="button"
              >
                <Text className="text-body-sm font-semibold text-text-secondary">
                  {t('common.goHome')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  // Fallback — should never reach here
  return null;
}
