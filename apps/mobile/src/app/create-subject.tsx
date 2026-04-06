import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
import { formatApiError } from '../lib/format-api-error';
import type { SubjectResolveResult } from '@eduagent/schemas';

// Captured at module load — safe because these screens are portrait-locked.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

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
  const [originalInput, setOriginalInput] = useState('');
  const [error, setError] = useState('');
  const [resolveState, setResolveState] = useState<ResolveState>({
    phase: 'idle',
  });
  const [resolveRounds, setResolveRounds] = useState(0);
  const [showClarifyInput, setShowClarifyInput] = useState(false);
  const [clarificationInput, setClarificationInput] = useState('');
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  const isBusy =
    resolveState.phase === 'resolving' || resolveState.phase === 'creating';
  const canSubmit = name.trim().length >= 1 && !isBusy;
  const showSuggestion = resolveState.phase === 'suggestion';

  const doCreate = useCallback(
    async (
      subjectName: string,
      rawInputOverride?: string,
      focus?: string,
      focusDescription?: string
    ) => {
      setResolveState({ phase: 'creating' });
      setError('');
      try {
        const rawInput =
          rawInputOverride ??
          (originalInput && originalInput !== subjectName
            ? originalInput
            : undefined);
        const result = await createSubject.mutateAsync({
          name: subjectName,
          ...(rawInput ? { rawInput } : {}),
          ...(focus ? { focus, focusDescription } : {}),
        });

        if (result.structureType === 'focused_book' && result.bookId) {
          router.replace({
            pathname: '/(learner)/onboarding/interview',
            params: {
              subjectId: result.subject.id,
              subjectName: result.subject.name,
              bookId: result.bookId,
              bookTitle: result.bookTitle ?? focus,
            },
          } as never);
          return;
        }

        if (result.structureType === 'broad') {
          router.replace({
            pathname: '/(learner)/library',
            params: {
              subjectId: result.subject.id,
            },
          } as never);
          return;
        }

        if (result.subject.pedagogyMode === 'four_strands') {
          router.replace({
            pathname: '/(learner)/onboarding/language-setup',
            params: {
              subjectId: result.subject.id,
              languageCode: result.subject.languageCode ?? '',
              languageName: result.subject.name,
            },
          } as never);
          return;
        }

        router.replace({
          pathname: '/(learner)/onboarding/interview',
          params: {
            subjectId: result.subject.id,
            subjectName: result.subject.name,
          },
        } as never);
      } catch (err: unknown) {
        setError(formatApiError(err));
        setResolveState({ phase: 'idle' });
      }
    },
    [createSubject, router, originalInput]
  );

  const resolveInput = useCallback(
    async (rawInput: string) => {
      const trimmedInput = rawInput.trim();
      if (!trimmedInput) return;

      setResolveRounds((prev) => prev + 1);
      setOriginalInput(trimmedInput);
      setResolveState({ phase: 'resolving' });
      setError('');

      try {
        const result = await resolveSubject.mutateAsync({
          rawInput: trimmedInput,
        });

        if (result.status === 'direct_match') {
          await doCreate(
            result.resolvedName ?? trimmedInput,
            undefined,
            result.focus ?? undefined,
            result.focusDescription ?? undefined
          );
          return;
        }

        setShowClarifyInput(false);
        setResolveState({ phase: 'suggestion', result });
      } catch {
        await doCreate(trimmedInput, trimmedInput);
      }
    },
    [doCreate, resolveSubject]
  );

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    await resolveInput(name.trim());
  }, [canSubmit, name, resolveInput]);

  const onPickSuggestion = useCallback(
    async (suggestion: {
      name: string;
      description: string;
      focus?: string;
    }) => {
      setName(suggestion.name);
      await doCreate(suggestion.name, undefined, suggestion.focus);
    },
    [doCreate]
  );

  const onAcceptSuggestion = useCallback(async () => {
    if (resolveState.phase !== 'suggestion') return;
    const resolved = resolveState.result.resolvedName ?? name.trim();
    const focus = resolveState.result.focus ?? undefined;
    const focusDescription = resolveState.result.focusDescription ?? undefined;
    setName(resolved);
    await doCreate(resolved, undefined, focus, focusDescription);
  }, [resolveState, name, doCreate]);

  const onEditSuggestion = useCallback(() => {
    if (resolveState.phase !== 'suggestion') return;
    if (resolveState.result.resolvedName) {
      setName(resolveState.result.resolvedName);
    }
    setShowClarifyInput(false);
    setClarificationInput('');
    setResolveState({ phase: 'idle' });
  }, [resolveState]);

  const onSomethingElse = useCallback(() => {
    setShowClarifyInput(true);
    setClarificationInput('');
    setError('');
  }, []);

  const onClarifySubmit = useCallback(async () => {
    if (!clarificationInput.trim() || isBusy) return;
    setName(clarificationInput.trim());
    await resolveInput(clarificationInput.trim());
  }, [clarificationInput, isBusy, resolveInput]);

  const onUseMyWords = useCallback(async () => {
    const rawInput = (clarificationInput || originalInput || name).trim();
    if (!rawInput) return;
    setName(rawInput);
    await doCreate(rawInput, rawInput);
  }, [clarificationInput, doCreate, name, originalInput]);

  const onNameChange = useCallback(
    (text: string) => {
      setName(text);
      if (error) setError('');
      if (resolveState.phase === 'suggestion') {
        setResolveState({ phase: 'idle' });
      }
      setResolveRounds(0);
    },
    [resolveState.phase, error]
  );

  const isAmbiguous =
    showSuggestion && resolveState.result.status === 'ambiguous';
  const isNoMatch = showSuggestion && resolveState.result.status === 'no_match';
  const allowUseMyWords = isNoMatch || resolveRounds >= 2;
  const exactWords = (clarificationInput || originalInput || name).trim();
  const subjectLimitGuidance =
    /subject limit|max subjects|too many subjects/i.test(error)
      ? ' Delete an old subject first to make room.'
      : '';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background items-center"
      behavior="padding"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={
          Platform.OS === 'web' ? { maxWidth: 480, width: '100%' } : undefined
        }
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
              {subjectLimitGuidance}
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

        {/* Ambiguous: multiple tappable suggestion cards */}
        {isAmbiguous && resolveState.phase === 'suggestion' && (
          <View className="mb-4" testID="subject-suggestion-card">
            <View className="flex-row items-center mb-3">
              <Ionicons
                name="sparkles"
                size={18}
                color={colors.primary}
                style={{ marginRight: 8 }}
              />
              <Text
                className="text-body text-text-primary flex-1"
                testID="subject-suggestion-message"
              >
                {resolveState.result.displayMessage}
              </Text>
            </View>
            {resolveState.result.suggestions.map((suggestion, index) => (
              <Pressable
                key={`${suggestion.name}-${suggestion.focus ?? index}`}
                onPress={() => onPickSuggestion(suggestion)}
                className="bg-primary-soft rounded-card px-4 py-3 mb-2 flex-row items-center min-h-[52px]"
                testID={`subject-suggestion-option-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${suggestion.name}${
                  suggestion.focus ? `: ${suggestion.focus}` : ''
                }`}
              >
                <View className="flex-1">
                  <Text className="text-body font-semibold text-text-primary">
                    {suggestion.name}
                    {suggestion.focus ? `: ${suggestion.focus}` : ''}
                  </Text>
                  {suggestion.description !== '' && (
                    <Text className="text-body-sm text-text-secondary mt-0.5">
                      {suggestion.description}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))}
            <Pressable
              onPress={onSomethingElse}
              className="bg-surface rounded-card px-4 py-3 mt-2 border border-border min-h-[52px] justify-center"
              testID="subject-something-else"
              accessibilityRole="button"
              accessibilityLabel="Something else"
            >
              <Text className="text-body font-semibold text-text-primary">
                Something else
              </Text>
              <Text className="text-body-sm text-text-secondary mt-0.5">
                Be as specific as you like.
              </Text>
            </Pressable>

            {showClarifyInput && (
              <View className="mt-3" testID="subject-clarify-card">
                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  What exactly do you want to learn?
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-3"
                  placeholder="e.g. ant colonies, Roman roads, solving fractions..."
                  placeholderTextColor={colors.muted}
                  value={clarificationInput}
                  onChangeText={setClarificationInput}
                  editable={!isBusy}
                  testID="subject-clarify-input"
                />
                <Button
                  variant="primary"
                  label="Check this instead"
                  onPress={onClarifySubmit}
                  disabled={!clarificationInput.trim() || isBusy}
                  loading={isBusy}
                  testID="subject-clarify-submit"
                />
              </View>
            )}

            {allowUseMyWords && exactWords !== '' && (
              <Pressable
                onPress={onUseMyWords}
                className="mt-3 py-3 min-h-[44px] items-center justify-center"
                testID="subject-use-my-words"
                accessibilityRole="button"
                accessibilityLabel={`Just use ${exactWords} as my subject`}
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Just use "{exactWords}" as my subject
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {isNoMatch && resolveState.phase === 'suggestion' && (
          <View
            className="bg-primary-soft rounded-card px-4 py-4 mb-4"
            testID="subject-no-match-card"
          >
            <Text
              className="text-body text-text-primary mb-3"
              testID="subject-suggestion-message"
            >
              {resolveState.result.displayMessage ||
                "I couldn't match that cleanly, but we can still use your exact words."}
            </Text>
            {exactWords !== '' && (
              <Button
                variant="primary"
                label={`Just use "${exactWords}"`}
                onPress={onUseMyWords}
                disabled={isBusy}
                loading={isBusy}
                testID="subject-use-my-words"
              />
            )}
            <Pressable
              onPress={onEditSuggestion}
              className="py-3 items-center mt-2"
              testID="subject-no-match-edit"
              accessibilityRole="button"
              accessibilityLabel="Edit subject name"
            >
              <Text className="text-body-sm font-semibold text-primary">
                Edit instead
              </Text>
            </Pressable>
          </View>
        )}

        {/* Single suggestion: corrected or resolved */}
        {showSuggestion &&
          !isAmbiguous &&
          !isNoMatch &&
          resolveState.phase === 'suggestion' && (
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

        {/* Only show Start Learning when not showing suggestions */}
        {!showSuggestion && (
          <Button
            variant="primary"
            label="Start Learning"
            onPress={onSubmit}
            disabled={!canSubmit}
            loading={isBusy}
            testID="create-subject-submit"
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
