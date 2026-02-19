import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cameraReducer, initialCameraState } from './camera-reducer';
import { useHomeworkOcr } from '../../../hooks/use-homework-ocr';

export default function CameraScreen(): React.ReactNode {
  const router = useRouter();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName: string;
  }>();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [state, dispatch] = useReducer(cameraReducer, initialCameraState);
  const ocr = useHomeworkOcr();
  const cameraRef = useRef<CameraView>(null);

  const [editedText, setEditedText] = useState('');
  const [manualText, setManualText] = useState('');

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
      setEditedText(ocr.text);
    } else if (ocr.status === 'error' && ocr.error) {
      dispatch({ type: 'OCR_ERROR', message: ocr.error });
    }
  }, [ocr.status, ocr.text, ocr.error]);

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

  const handleConfirmResult = useCallback(() => {
    router.replace({
      pathname: '/(learner)/session',
      params: {
        mode: 'homework',
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        problemText: editedText,
        imageUri: state.imageUri ?? '',
      },
    } as never);
  }, [router, subjectId, subjectName, editedText, state.imageUri]);

  const handleManualContinue = useCallback(() => {
    router.replace({
      pathname: '/(learner)/session',
      params: {
        mode: 'homework',
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        problemText: manualText,
        imageUri: state.imageUri ?? '',
      },
    } as never);
  }, [router, subjectId, subjectName, manualText, state.imageUri]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // ---- Permission phase ----
  if (state.phase === 'permission') {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-h2 font-bold text-text-primary text-center mb-3">
          Camera Access Needed
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          We need your camera to photograph homework problems so your AI tutor
          can help you work through them step by step.
        </Text>
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
        >
          {/* Close button */}
          <Pressable
            testID="close-button"
            onPress={handleClose}
            className="absolute top-0 left-4 w-12 h-12 items-center justify-center rounded-full bg-black/40"
            style={{ marginTop: insets.top + 8 }}
            accessibilityLabel="Close camera"
            accessibilityRole="button"
          >
            <Text className="text-white text-h3 font-bold">X</Text>
          </Pressable>

          {/* Capture guide overlay */}
          <View className="flex-1 items-center justify-center px-6">
            <View className="w-full aspect-[4/3] border-2 border-dashed border-white/60 rounded-card" />
          </View>

          {/* Capture button */}
          <View
            className="items-center pb-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
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
          <View className="w-full aspect-[4/3] bg-surface rounded-card items-center justify-center">
            <Text className="text-body text-text-secondary">
              Photo captured
            </Text>
          </View>
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
            testID="use-photo-button"
            onPress={handleConfirmPhoto}
            className="flex-1 bg-primary rounded-button py-4 min-h-[48px] items-center justify-center"
            accessibilityLabel="Use this photo"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Use this
            </Text>
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
            <View className="h-4 bg-surface rounded-full w-full" />
            <View className="h-4 bg-surface rounded-full w-4/5" />
            <View className="h-4 bg-surface rounded-full w-3/5" />
          </View>
          <Text className="text-body text-text-secondary text-center mt-6">
            Reading your {subjectName ?? 'homework'}...
          </Text>
        </View>
      </View>
    );
  }

  // ---- Result phase ----
  if (state.phase === 'result') {
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

        <Text className="text-h3 font-semibold text-text-primary mt-4 mb-3">
          Here&apos;s what I see:
        </Text>

        <TextInput
          testID="result-text-input"
          value={editedText}
          onChangeText={setEditedText}
          multiline
          className="bg-surface rounded-card p-4 text-body text-text-primary min-h-[120px]"
          textAlignVertical="top"
          accessibilityLabel="Recognized text, editable"
        />

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
      </View>
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
            {state.errorMessage ?? 'Something went wrong'}
          </Text>

          {showManualFallback ? (
            <View className="mt-6">
              <Text className="text-body text-text-secondary text-center mb-4">
                No worries -- you can type it out instead
              </Text>
              <TextInput
                testID="manual-input"
                value={manualText}
                onChangeText={setManualText}
                multiline
                placeholder="Type or paste your problem here..."
                className="bg-surface rounded-card p-4 text-body text-text-primary min-h-[120px] mb-4"
                textAlignVertical="top"
                accessibilityLabel="Type your problem manually"
              />
              <View className="gap-3">
                <Pressable
                  testID="manual-continue-button"
                  onPress={handleManualContinue}
                  disabled={!manualText.trim()}
                  className={`rounded-button py-4 min-h-[48px] items-center justify-center ${
                    manualText.trim() ? 'bg-primary' : 'bg-surface'
                  }`}
                  accessibilityLabel="Continue with typed problem"
                  accessibilityRole="button"
                >
                  <Text
                    className={`text-body font-semibold ${
                      manualText.trim()
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    Continue
                  </Text>
                </Pressable>
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
