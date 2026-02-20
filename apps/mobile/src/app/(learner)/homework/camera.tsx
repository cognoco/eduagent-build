import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';
import { cameraReducer, initialCameraState } from './camera-reducer';
import { useHomeworkOcr } from '../../../hooks/use-homework-ocr';

type FlashMode = 'off' | 'on' | 'auto';

export default function CameraScreen(): React.ReactNode {
  const router = useRouter();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName: string;
  }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [permission, requestPermission] = useCameraPermissions();
  const [state, dispatch] = useReducer(cameraReducer, initialCameraState);
  const ocr = useHomeworkOcr();
  const cameraRef = useRef<CameraView>(null);

  const [editedText, setEditedText] = useState('');
  const [manualText, setManualText] = useState('');
  const [flash, setFlash] = useState<FlashMode>('off');

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
        imageUri: state.imageUri ?? undefined,
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
      },
    } as never);
  }, [router, subjectId, subjectName, manualText]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
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
            className="absolute top-0 left-4 w-12 h-12 items-center justify-center rounded-full bg-black/40"
            style={{ marginTop: insets.top + 8 }}
            accessibilityLabel="Close camera"
            accessibilityRole="button"
          >
            <Text className="text-white text-h3 font-bold">X</Text>
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
    return (
      <View
        className="flex-1 bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Pressable
          testID="back-button"
          onPress={handleClose}
          className="self-start min-h-[48px] items-center justify-center mt-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-body font-medium text-primary">← Back</Text>
        </Pressable>

        <Text className="text-body text-text-secondary mt-4 mb-3">
          Here&apos;s what I see:
        </Text>

        <TextInput
          testID="result-text-input"
          value={editedText}
          onChangeText={setEditedText}
          multiline
          className="bg-surface rounded-card p-4 text-body text-text-primary min-h-[120px]"
          textAlignVertical="top"
          placeholderTextColor={colors.muted}
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
            {showManualFallback
              ? "Hmm, I'm having trouble reading that"
              : state.errorMessage ?? 'Something went wrong'}
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
                    Continue →
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
