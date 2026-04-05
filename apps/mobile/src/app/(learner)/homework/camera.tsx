import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  Linking,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { HomeworkProblem } from '@eduagent/schemas';
import { useThemeColors } from '../../../lib/theme';
import { cameraReducer, initialCameraState } from './camera-reducer';
import { useHomeworkOcr } from '../../../hooks/use-homework-ocr';
import { useCreateSubject, useSubjects } from '../../../hooks/use-subjects';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { CelebrationAnimation } from '../../../components/common';
import { formatApiError } from '../../../lib/format-api-error';
import {
  createHomeworkProblem,
  getHomeworkProblemText,
  serializeHomeworkProblems,
  splitHomeworkProblems,
} from './problem-cards';

type FlashMode = 'off' | 'on' | 'auto';

export default function CameraScreen(): React.ReactNode {
  const router = useRouter();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
  }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [permission, requestPermission] = useCameraPermissions();
  const [state, dispatch] = useReducer(cameraReducer, initialCameraState);
  const ocr = useHomeworkOcr();
  const cameraRef = useRef<CameraView>(null);
  const { data: subjects } = useSubjects();
  const createSubject = useCreateSubject();

  const [ocrText, setOcrText] = useState('');
  const [draftProblems, setDraftProblems] = useState<HomeworkProblem[]>([]);
  const [manualText, setManualText] = useState('');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [showCelebration, setShowCelebration] = useState(true);

  // Subject auto-classification state
  const classifyMutation = useClassifySubject();
  const [autoDetectedSubject, setAutoDetectedSubject] = useState<{
    subjectId: string;
    subjectName: string;
  } | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const classifyTriggeredRef = useRef(false);
  const [manualSubjectName, setManualSubjectName] = useState('');

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'RESET', hasPermission: permission?.granted ?? false });
      setOcrText('');
      setDraftProblems([]);
      setManualText('');
      setManualSubjectName('');
      setShowCelebration(true);
      setFlash('off');
      setAutoDetectedSubject(null);
      setShowSubjectPicker(false);
      classifyTriggeredRef.current = false;
    }, [permission?.granted])
  );

  // Sync permission state into reducer
  useEffect(() => {
    if (permission?.granted && state.phase === 'permission') {
      dispatch({ type: 'PERMISSION_GRANTED' });
    }
  }, [permission?.granted, state.phase]);

  // Sync OCR hook status into reducer
  useEffect(() => {
    if (ocr.status === 'done' && ocr.text) {
      dispatch({ type: 'OCR_SUCCESS', text: ocr.text });
      setOcrText(ocr.text);
      setDraftProblems(splitHomeworkProblems(ocr.text));
    } else if (ocr.status === 'error' && ocr.error) {
      dispatch({ type: 'OCR_ERROR', message: ocr.error });
    }
  }, [ocr.status, ocr.text, ocr.error]);

  const combinedProblemText = getHomeworkProblemText(draftProblems);

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
          const c = result.candidates[0]!;
          setAutoDetectedSubject({
            subjectId: c.subjectId,
            subjectName: c.subjectName,
          });
        } else {
          setShowSubjectPicker(true);
        }
      } catch {
        setShowSubjectPicker(true);
      }
    }
    classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, combinedProblemText, subjectId]);

  const handleCapture = useCallback(async () => {
    const photo = await cameraRef.current?.takePictureAsync();
    if (photo?.uri) {
      dispatch({ type: 'PHOTO_TAKEN', uri: photo.uri });
    }
  }, []);

  const handleConfirmPhoto = useCallback(async () => {
    if (!state.imageUri) return;
    dispatch({ type: 'CONFIRM_PHOTO' });
    await ocr.process(state.imageUri);
  }, [state.imageUri, ocr]);

  const handleRetake = useCallback(() => {
    dispatch({ type: 'RETAKE' });
  }, []);

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
      sourceOcrText?: string
    ) => {
      router.replace({
        pathname: '/(learner)/session',
        params: {
          mode: 'homework',
          subjectId: sid,
          subjectName: sName,
          problemText,
          ...(problems && problems.length > 0
            ? { homeworkProblems: serializeHomeworkProblems(problems) }
            : {}),
          ...(sourceOcrText ? { ocrText: sourceOcrText } : {}),
          ...(imageUri ? { imageUri } : {}),
        },
      } as never);
    },
    [router]
  );

  const handleConfirmResult = useCallback(() => {
    const effectiveSubjectId = subjectId ?? autoDetectedSubject?.subjectId;
    const effectiveSubjectName =
      subjectName ?? autoDetectedSubject?.subjectName ?? '';
    if (!combinedProblemText.trim()) {
      Alert.alert(
        'No problems found',
        'Please keep at least one problem card.'
      );
      return;
    }
    if (!effectiveSubjectId) {
      Alert.alert(
        'No subject selected',
        'Please go back and select a subject first.'
      );
      return;
    }
    navigateToSession(
      effectiveSubjectId,
      effectiveSubjectName,
      combinedProblemText,
      draftProblems,
      state.imageUri ?? undefined,
      ocrText
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
  ]);

  const handlePickSubject = useCallback(
    (sid: string, sName: string) => {
      navigateToSession(
        sid,
        sName,
        combinedProblemText,
        draftProblems,
        state.imageUri ?? undefined,
        ocrText
      );
    },
    [
      navigateToSession,
      combinedProblemText,
      draftProblems,
      state.imageUri,
      ocrText,
    ]
  );

  const handleManualSubjectContinue = useCallback(async () => {
    const typedName = manualSubjectName.trim();
    if (!typedName) return;

    const existingSubject = subjects?.find(
      (subject) => subject.name.trim().toLowerCase() === typedName.toLowerCase()
    );
    if (existingSubject) {
      navigateToSession(
        existingSubject.id,
        existingSubject.name,
        combinedProblemText,
        draftProblems,
        state.imageUri ?? undefined,
        ocrText
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
        ocrText
      );
    } catch (err: unknown) {
      Alert.alert('Could not create subject', formatApiError(err));
    }
  }, [
    combinedProblemText,
    createSubject,
    draftProblems,
    manualSubjectName,
    navigateToSession,
    ocrText,
    state.imageUri,
    subjects,
  ]);

  const handleManualContinue = useCallback(async () => {
    if (subjectId) {
      navigateToSession(subjectId, subjectName ?? '', manualText);
      return;
    }
    // No subjectId — auto-classify the manually typed text
    try {
      const result = await classifyMutation.mutateAsync({ text: manualText });
      if (!result.needsConfirmation && result.candidates.length === 1) {
        navigateToSession(
          result.candidates[0]!.subjectId,
          result.candidates[0]!.subjectName,
          manualText
        );
      } else {
        // Multiple candidates or low confidence — show picker
        setShowSubjectPicker(true);
      }
    } catch {
      // Classification failed — show picker
      setShowSubjectPicker(true);
    }
  }, [navigateToSession, subjectId, subjectName, manualText, classifyMutation]);

  const handleManualPickSubject = useCallback(
    (sid: string, sName: string) => {
      navigateToSession(sid, sName, manualText);
    },
    [navigateToSession, manualText]
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const handleProblemTextChange = useCallback(
    (problemId: string, text: string) => {
      setDraftProblems((prev) =>
        prev.map((problem) =>
          problem.id === problemId ? { ...problem, text } : problem
        )
      );
    },
    []
  );

  const handleAddProblem = useCallback(() => {
    setDraftProblems((prev) => [
      ...prev,
      createHomeworkProblem('', { source: 'manual', originalText: null }),
    ]);
  }, []);

  const handleRemoveProblem = useCallback((problemId: string) => {
    setDraftProblems((prev) =>
      prev.filter((problem) => problem.id !== problemId)
    );
  }, []);

  // ---- Permission phase ----
  if (state.phase === 'permission') {
    const denied = permission && !permission.granted && !permission.canAskAgain;

    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-h2 font-bold text-text-primary text-center mb-3">
          Camera Access Needed
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          {denied
            ? 'Camera access was denied. You can enable it in your device settings to photograph homework problems.'
            : 'We need your camera to photograph homework problems so your AI tutor can help you work through them step by step.'}
        </Text>
        {denied ? (
          <Pressable
            testID="open-settings-button"
            onPress={() => Linking.openSettings()}
            className="bg-primary rounded-button py-4 px-8 min-h-[48px] items-center justify-center"
            accessibilityLabel="Open device settings"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Open Settings
            </Text>
          </Pressable>
        ) : (
          <Pressable
            testID="grant-permission-button"
            onPress={requestPermission}
            className="bg-primary rounded-button py-4 px-8 min-h-[48px] items-center justify-center"
            accessibilityLabel="Allow camera access"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Allow Camera
            </Text>
          </Pressable>
        )}
        <Pressable
          testID="close-button"
          onPress={handleClose}
          className="mt-4 py-3 px-6 min-h-[48px] items-center justify-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-body text-text-secondary">Go back</Text>
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
            accessibilityLabel="Close camera"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {/* Capture guide overlay */}
          <View className="flex-1 items-center justify-center px-6">
            <View className="w-full aspect-[4/3] border-2 border-dashed border-primary/60 rounded-card items-center justify-center">
              <Text className="text-white/70 text-body-sm text-center">
                Center your homework
              </Text>
            </View>
          </View>

          {/* Bottom controls: flash toggle + capture button */}
          <View
            className="flex-row items-center justify-center px-8 pb-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Pressable
              testID="flash-toggle"
              onPress={toggleFlash}
              className="absolute left-8 w-12 h-12 items-center justify-center rounded-full bg-black/40"
              accessibilityLabel={`Flash ${flash === 'off' ? 'off' : 'on'}`}
              accessibilityRole="button"
            >
              <Text className="text-white text-body">
                {flash === 'off' ? '⚡' : '⚡✓'}
              </Text>
            </Pressable>

            <Pressable
              testID="capture-button"
              onPress={handleCapture}
              className="w-16 h-16 rounded-full bg-primary items-center justify-center"
              accessibilityLabel="Take photo"
              accessibilityRole="button"
            >
              <View className="w-14 h-14 rounded-full border-2 border-white/80" />
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
              accessibilityLabel="Captured homework photo"
            />
          ) : (
            <View className="w-full aspect-[4/3] bg-surface rounded-card items-center justify-center">
              <Text className="text-body text-text-secondary">
                Photo captured
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-4 px-6 pb-4">
          <Pressable
            testID="retake-button"
            onPress={handleRetake}
            className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
            accessibilityLabel="Retake photo"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-primary">
              Retake
            </Text>
          </Pressable>
          <Pressable
            testID="camera-use-this-button"
            onPress={handleConfirmPhoto}
            className="flex-1 bg-accent rounded-button py-4 min-h-[48px] items-center justify-center border border-accent"
            accessibilityLabel="Use this photo"
            accessibilityRole="button"
          >
            <Text className="text-body font-bold text-white">Use this</Text>
          </Pressable>
        </View>
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
            Reading your {subjectName ? `${subjectName} homework` : 'homework'}
            ...
          </Text>
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
          onPress={handleClose}
          className="self-start flex-row items-center min-h-[48px] mt-2 px-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text className="text-body font-semibold text-text-primary ml-1">
            Back
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
          Here are the problems I found:
        </Text>

        <View className="gap-3">
          {draftProblems.map((problem, index) => (
            <View
              key={problem.id}
              className="bg-surface rounded-card p-4"
              testID={`problem-card-${index}`}
            >
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-body font-semibold text-text-primary">
                  Problem {index + 1}
                </Text>
                {draftProblems.length > 1 && (
                  <Pressable
                    onPress={() => handleRemoveProblem(problem.id)}
                    testID={`remove-problem-${index}`}
                    accessibilityLabel={`Remove problem ${index + 1}`}
                    accessibilityRole="button"
                  >
                    <Text className="text-body-sm text-danger">Remove</Text>
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
                placeholder={`Problem ${index + 1}`}
                placeholderTextColor={colors.muted}
                accessibilityLabel={`Problem ${index + 1}, editable`}
              />
            </View>
          ))}
        </View>

        <Pressable
          testID="add-problem-button"
          onPress={handleAddProblem}
          className="mt-3 self-start bg-surface-elevated rounded-button px-4 py-3 min-h-[48px] justify-center"
          accessibilityLabel="Add another problem card"
          accessibilityRole="button"
        >
          <Text className="text-body-sm font-semibold text-text-primary">
            Add another problem
          </Text>
        </Pressable>

        {/* Subject auto-detection loading indicator */}
        {needsSubjectPick && classifyMutation.isPending && (
          <Text
            className="text-body-sm text-text-secondary mt-3"
            testID="classify-loading"
          >
            Figuring out the subject...
          </Text>
        )}

        {/* Auto-detected subject confirmation */}
        {needsSubjectPick && autoDetectedSubject && !showSubjectPicker && (
          <View
            className="flex-row items-center gap-2 mt-3 mb-2"
            testID="auto-detected-subject"
          >
            <Text className="text-sm text-text-secondary">
              Looks like{' '}
              <Text className="font-medium text-text-primary">
                {autoDetectedSubject.subjectName}
              </Text>
            </Text>
            <Pressable
              onPress={() => setShowSubjectPicker(true)}
              testID="change-subject-link"
            >
              <Text className="text-sm text-primary underline">Change</Text>
            </Pressable>
          </View>
        )}

        {/* Subject picker — shown when classification needs confirmation, fails, or user taps "Change" */}
        {needsSubjectPick && showSubjectPicker && (
          <View className="mt-6" testID="subject-picker">
            <Text className="text-body font-semibold text-text-primary mb-3">
              Which subject is this for?
            </Text>
            {/* Show classification candidates first (sorted by confidence) */}
            {classifyMutation.data?.candidates
              ?.slice()
              .sort((a, b) => b.confidence - a.confidence)
              .map((candidate, index) => (
                <Pressable
                  key={candidate.subjectId}
                  onPress={() =>
                    handlePickSubject(
                      candidate.subjectId,
                      candidate.subjectName
                    )
                  }
                  className={`rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center ${
                    index === 0
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-surface-elevated'
                  }`}
                  accessibilityLabel={`Select ${candidate.subjectName}`}
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
                    (c) => c.subjectId === s.id
                  )
              )
              .map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => handlePickSubject(s.id, s.name)}
                  className="bg-surface-elevated rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center"
                  accessibilityLabel={`Select ${s.name}`}
                  accessibilityRole="button"
                  testID={`subject-pick-${s.id}`}
                >
                  <Text className="text-body text-text-primary">{s.name}</Text>
                </Pressable>
              ))}
            {(classifyMutation.data?.candidates?.length ?? 0) === 0 &&
              (subjects?.length ?? 0) === 0 && (
                <Pressable
                  onPress={() => router.push('/create-subject')}
                  className="bg-surface rounded-button py-3 px-4 mb-2 min-h-[48px] justify-center"
                  accessibilityLabel="Create a new subject"
                  accessibilityRole="button"
                  testID="camera-create-subject"
                >
                  <Text className="text-body font-semibold text-primary">
                    Create New Subject
                  </Text>
                </Pressable>
              )}

            {/* Manual subject entry — lets user type a subject name */}
            <Text className="text-body-sm text-text-secondary mt-4 mb-2">
              Or type a subject name:
            </Text>
            <TextInput
              testID="camera-subject-input"
              value={manualSubjectName}
              onChangeText={setManualSubjectName}
              placeholder="e.g. Biology, History..."
              placeholderTextColor={colors.muted}
              className="bg-surface rounded-button px-4 py-3 text-body text-text-primary min-h-[48px] mb-3 border border-border"
              accessibilityLabel="Type a subject name"
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
              accessibilityLabel="Continue with typed subject"
              accessibilityRole="button"
            >
              <Text
                className={`text-body font-semibold ${
                  manualSubjectName.trim()
                    ? 'text-white'
                    : 'text-text-secondary'
                }`}
              >
                {createSubject.isPending ? 'Creating subject...' : 'Continue'}
              </Text>
            </Pressable>

            <Pressable
              testID="retake-button"
              onPress={handleRetake}
              className="bg-surface rounded-button py-4 mt-2 min-h-[48px] items-center justify-center"
              accessibilityLabel="Retake photo"
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary">
                Retake
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
                accessibilityLabel="Retake photo"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-primary">
                  Retake
                </Text>
              </Pressable>
              <Pressable
                testID="confirm-button"
                onPress={handleConfirmResult}
                className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
                accessibilityLabel="Start session with this problem"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Let&apos;s go
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
              accessibilityLabel="Retake photo"
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary">
                Retake
              </Text>
            </Pressable>
            <Pressable
              testID="confirm-button"
              onPress={handleConfirmResult}
              className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
              accessibilityLabel="Start session with this problem"
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Let&apos;s go
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  // ---- Error phase ----
  if (state.phase === 'error') {
    const showManualFallback = ocr.failCount >= 2;

    return (
      <View
        className="flex-1 bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Pressable
          testID="close-button"
          onPress={handleClose}
          className="self-start w-12 h-12 items-center justify-center mt-2"
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Text className="text-h3 font-bold text-text-primary">X</Text>
        </Pressable>

        <View className="flex-1 justify-center">
          <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
            {showManualFallback
              ? "Hmm, I'm having trouble reading that"
              : state.errorMessage ??
                "We couldn't read that clearly. Try taking the photo again with better lighting."}
          </Text>

          {showManualFallback ? (
            <View className="mt-6">
              <Text className="text-body text-text-secondary text-center mb-4">
                Want to type it out instead?
              </Text>
              <TextInput
                testID="manual-input"
                value={manualText}
                onChangeText={setManualText}
                multiline
                placeholder="Type your problem here..."
                placeholderTextColor={colors.muted}
                className="bg-surface rounded-card p-4 text-body text-text-primary min-h-[120px] mb-4"
                textAlignVertical="top"
                accessibilityLabel="Type your problem manually"
              />
              <View className="gap-3">
                {!subjectId && manualText.trim() && showSubjectPicker ? (
                  <>
                    <Text className="text-body font-semibold text-text-primary mt-2 mb-1">
                      Which subject is this for?
                    </Text>
                    {subjects?.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => handleManualPickSubject(s.id, s.name)}
                        className="bg-surface-elevated rounded-button py-3 px-4 min-h-[48px] justify-center"
                        accessibilityLabel={`Select ${s.name}`}
                        accessibilityRole="button"
                        testID={`manual-subject-pick-${s.id}`}
                      >
                        <Text className="text-body text-text-primary">
                          {s.name}
                        </Text>
                      </Pressable>
                    ))}
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
                    accessibilityLabel="Continue with typed problem"
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
                        ? 'Figuring out the subject...'
                        : 'Continue →'}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  testID="try-camera-again-button"
                  onPress={handleRetake}
                  className="bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
                  accessibilityLabel="Try camera again"
                  accessibilityRole="button"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    Try camera again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-4 mt-6">
              <Pressable
                testID="retake-button"
                onPress={handleRetake}
                className="flex-1 bg-surface rounded-button py-4 min-h-[48px] items-center justify-center"
                accessibilityLabel="Retake photo"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-primary">
                  Retake
                </Text>
              </Pressable>
              <Pressable
                testID="retry-button"
                onPress={handleRetryOcr}
                className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
                accessibilityLabel="Try reading again"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Try again
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Fallback — should never reach here
  return null;
}
