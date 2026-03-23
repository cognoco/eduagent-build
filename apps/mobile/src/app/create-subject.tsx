import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCreateSubject } from '../hooks/use-subjects';
import { useResolveSubject } from '../hooks/use-resolve-subject';
import { useThemeColors } from '../lib/theme';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import type { SubjectResolveResult } from '@eduagent/schemas';

// Captured at module load — safe because these screens are portrait-locked.
const SCREEN_HEIGHT = Dimensions.get('screen').height;

type ResolveState =
  | { phase: 'idle' }
  | { phase: 'resolving' }
  | { phase: 'suggestion'; result: SubjectResolveResult }
  | { phase: 'creating' };

export default function CreateSubjectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const createSubject = useCreateSubject();
  const resolveSubject = useResolveSubject();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [resolveState, setResolveState] = useState<ResolveState>({
    phase: 'idle',
  });
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  const isBusy =
    resolveState.phase === 'resolving' || resolveState.phase === 'creating';
  const canSubmit = name.trim().length >= 1 && !isBusy;

  const doCreate = useCallback(
    async (subjectName: string) => {
      setResolveState({ phase: 'creating' });
      setError('');
      try {
        const result = await createSubject.mutateAsync({
          name: subjectName,
        });
        router.replace({
          pathname: '/(learner)/onboarding/interview',
          params: {
            subjectId: result.subject.id,
            subjectName: result.subject.name,
          },
        } as never);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setResolveState({ phase: 'idle' });
      }
    },
    [createSubject, router]
  );

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    setResolveState({ phase: 'resolving' });

    try {
      const result = await resolveSubject.mutateAsync({
        rawInput: name.trim(),
      });

      if (result.status === 'direct_match') {
        await doCreate(result.resolvedName ?? name.trim());
        return;
      }

      if (result.status === 'no_match') {
        setError(
          result.displayMessage ||
            "I couldn't find a matching subject. Try a subject name like 'Physics' or describe what you'd like to learn."
        );
        setResolveState({ phase: 'idle' });
        return;
      }

      // corrected or resolved — show suggestion card
      setResolveState({ phase: 'suggestion', result });
    } catch {
      // Resolve failed — fall through to create with raw name
      await doCreate(name.trim());
    }
  }, [canSubmit, name, resolveSubject, doCreate]);

  const onAcceptSuggestion = useCallback(async () => {
    if (resolveState.phase !== 'suggestion') return;
    const resolved = resolveState.result.resolvedName ?? name.trim();
    setName(resolved);
    await doCreate(resolved);
  }, [resolveState, name, doCreate]);

  const onEditSuggestion = useCallback(() => {
    if (resolveState.phase !== 'suggestion') return;
    // Pre-fill the input with the suggested name so the user can tweak it
    if (resolveState.result.resolvedName) {
      setName(resolveState.result.resolvedName);
    }
    setResolveState({ phase: 'idle' });
  }, [resolveState]);

  const onNameChange = useCallback(
    (text: string) => {
      setName(text);
      // Reset suggestion if user edits the input
      if (resolveState.phase === 'suggestion') {
        setResolveState({ phase: 'idle' });
      }
    },
    [resolveState.phase]
  );

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          minHeight: SCREEN_HEIGHT,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-h1 font-bold text-text-primary">
            New subject
          </Text>
          <Button
            variant="tertiary"
            size="small"
            label="Cancel"
            onPress={() => router.back()}
            testID="create-subject-cancel"
          />
        </View>

        {error !== '' && (
          <View
            className="bg-danger/10 rounded-card px-4 py-3 mb-4"
            accessibilityRole="alert"
          >
            <Text
              className="text-danger text-body-sm"
              testID="create-subject-error"
            >
              {error}
            </Text>
          </View>
        )}

        <Text className="text-body text-text-secondary mb-4">
          What would you like to learn? Enter any subject or describe what
          interests you — we'll figure out the rest.
        </Text>

        <View onLayout={onFieldLayout('name')}>
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            Subject name
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder="e.g. Calculus, World History, 'learn about ants'..."
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={onNameChange}
            maxLength={200}
            editable={!isBusy}
            testID="create-subject-name"
            autoFocus
            onFocus={onFieldFocus('name')}
          />
        </View>

        {/* Resolve loading indicator */}
        {resolveState.phase === 'resolving' && (
          <View
            className="flex-row items-center mb-4"
            testID="subject-resolve-loading"
          >
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginRight: 8 }}
            />
            <Text className="text-body-sm text-text-secondary">
              Checking subject name...
            </Text>
          </View>
        )}

        {/* Suggestion card */}
        {resolveState.phase === 'suggestion' && (
          <View
            className="bg-primary-soft rounded-card px-4 py-4 mb-4"
            testID="subject-suggestion-card"
          >
            <View className="flex-row items-start mb-3">
              <Ionicons
                name="sparkles"
                size={18}
                color={colors.primary}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text
                className="text-body text-text-primary flex-1"
                testID="subject-suggestion-message"
              >
                {resolveState.result.displayMessage}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Pressable
                onPress={onAcceptSuggestion}
                className="flex-1 bg-primary rounded-button py-3 items-center min-h-[44px] justify-center"
                testID="subject-suggestion-accept"
                accessibilityRole="button"
                accessibilityLabel="Accept suggestion"
              >
                <Text className="text-text-inverse font-semibold text-body-sm">
                  Accept
                </Text>
              </Pressable>
              <Pressable
                onPress={onEditSuggestion}
                className="flex-1 bg-surface rounded-button py-3 items-center min-h-[44px] justify-center border border-border"
                testID="subject-suggestion-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit suggestion"
              >
                <Text className="text-text-primary font-semibold text-body-sm">
                  Edit
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <Button
          variant="primary"
          label="Start Learning"
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={isBusy}
          testID="create-subject-submit"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
