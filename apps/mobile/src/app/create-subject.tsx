import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCreateSubject, useSubjects } from '../hooks/use-subjects';
import { useResolveSubject } from '../hooks/use-resolve-subject';
import { useThemeColors } from '../lib/theme';
import { Button } from '../components/common/Button';
import { useKeyboardScroll } from '../hooks/use-keyboard-scroll';
import { formatApiError } from '../lib/format-api-error';
import { homeHrefForReturnTo, goBackOrReplace } from '../lib/navigation';
import type { SubjectResolveResult } from '@eduagent/schemas';

/** Strip markdown bold markers so `**Science**` renders as plain "Science". */
function stripBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}

// Captured at module load — safe because these screens are portrait-locked.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

const STARTER_CHIPS = [
  'Math',
  'Science',
  'English',
  'History',
  'Spanish',
  'Geography',
  'Art',
  'Music',
  'Programming',
] as const;

type ResolveState =
  | { phase: 'idle' }
  | { phase: 'resolving' }
  | { phase: 'suggestion'; result: SubjectResolveResult }
  | { phase: 'creating' };

export default function CreateSubjectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { returnTo, chatTopic } = useLocalSearchParams<{
    returnTo?: string;
    chatTopic?: string;
  }>();
  const colors = useThemeColors();
  const createSubject = useCreateSubject();
  const resolveSubject = useResolveSubject();
  const {
    data: existingSubjects,
    isError: existingSubjectsError,
    refetch: refetchSubjects,
  } = useSubjects();
  const [name, setName] = useState('');
  const [originalInput, setOriginalInput] = useState('');
  const [error, setError] = useState('');
  // BUG-324: Track subject-limit error from the raw error object — not the
  // formatted display string which may strip keywords the regex depends on.
  const [isSubjectLimitError, setIsSubjectLimitError] = useState(false);
  const [resolveState, setResolveState] = useState<ResolveState>({
    phase: 'idle',
  });
  const [resolveRounds, setResolveRounds] = useState(0);
  const [showClarifyInput, setShowClarifyInput] = useState(false);
  const [clarificationInput, setClarificationInput] = useState('');
  const [resolveTimedOut, setResolveTimedOut] = useState(false);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [BUG-692] Ref set when Cancel is pressed mid-flight; checked post-await
  // before any router navigation and inside catch before showing alerts.
  const cancelledRef = useRef(false);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();

  // [M4] 30s timeout on resolve phase — show error + retry
  useEffect(() => {
    if (resolveState.phase === 'resolving') {
      setResolveTimedOut(false);
      resolveTimeoutRef.current = setTimeout(() => {
        setResolveTimedOut(true);
        setResolveState({ phase: 'idle' });
        setError(t('subject.resolveTookTooLong'));
      }, 30_000);
      return () => {
        if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
      };
    }
    if (resolveTimeoutRef.current) {
      clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
    return undefined;
  }, [resolveState.phase]);

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
      cancelledRef.current = false; // [BUG-692] reset on each new attempt
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

        // [BUG-692] If the user pressed Cancel while the mutation was in
        // flight, abort navigation — the router already moved elsewhere.
        if (cancelledRef.current) return;

        // BUG-236: When invoked from chat, return to the session with the new
        // subject so the user can continue learning the topic they asked about.
        if (returnTo === 'chat') {
          router.replace({
            pathname: '/(app)/session',
            params: {
              mode: 'freeform',
              subjectId: result.subject.id,
              subjectName: result.subject.name,
              ...(chatTopic ? { topicName: chatTopic } : {}),
              ...(rawInput ? { rawInput } : {}),
            },
          } as never);
          return;
        }

        if (result.structureType === 'focused_book' && result.bookId) {
          router.replace({
            pathname: '/(app)/onboarding/interview',
            params: {
              subjectId: result.subject.id,
              subjectName: result.subject.name,
              bookId: result.bookId,
              bookTitle: result.bookTitle ?? focus,
              step: '1',
              totalSteps: '4',
            },
          } as never);
          return;
        }

        if (result.structureType === 'broad') {
          router.replace({
            pathname: '/(app)/pick-book/[subjectId]',
            params: {
              subjectId: result.subject.id,
            },
          } as never);
          return;
        }

        if (result.subject.pedagogyMode === 'four_strands') {
          router.replace({
            pathname: '/(app)/onboarding/interview',
            params: {
              subjectId: result.subject.id,
              subjectName: result.subject.name,
              ...(result.subject.languageCode
                ? {
                    languageCode: result.subject.languageCode,
                    languageName: result.subject.name,
                  }
                : {}),
              step: '1',
              totalSteps: '4',
            },
          } as never);
          return;
        }

        router.replace({
          pathname: '/(app)/onboarding/interview',
          params: {
            subjectId: result.subject.id,
            subjectName: result.subject.name,
            step: '1',
            totalSteps: '4',
          },
        } as never);
      } catch (err: unknown) {
        // [BUG-692] Don't show error alert if user already navigated away.
        if (cancelledRef.current) return;
        const rawMsg = err instanceof Error ? err.message : '';
        setIsSubjectLimitError(
          /subject limit|max subjects|too many subjects/i.test(rawMsg)
        );
        setError(formatApiError(err));
        setResolveState({ phase: 'idle' });
      }
    },
    [createSubject, router, originalInput, returnTo, chatTopic]
  );

  const resolveInput = useCallback(
    async (rawInput: string) => {
      const trimmedInput = rawInput.trim();
      if (!trimmedInput) return;

      setResolveRounds((prev) => prev + 1);
      setOriginalInput((prev) => prev || trimmedInput);
      setResolveState({ phase: 'resolving' });
      setError('');
      cancelledRef.current = false; // [BUG-692] reset on each new attempt

      try {
        const result = await resolveSubject.mutateAsync({
          rawInput: trimmedInput,
        });

        // [BUG-692] Abort if the user cancelled while resolve was in flight.
        if (cancelledRef.current) return;

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
        // [BUG-692] Don't show error if user already navigated away.
        if (cancelledRef.current) return;
        // Don't fall through to create on network error
        setError(t('subject.resolveNetworkError'));
        setResolveState({ phase: 'idle' });
        return;
      }
    },
    [doCreate, resolveSubject]
  );

  const onSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError(t('subject.enterSubjectNameError'));
      return;
    }
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
      // [BUG-237] When the user's original input (e.g. "Easter") differs from
      // the picked suggestion name (e.g. "World History"), the original input
      // IS the focus topic.  Without this, the API receives only "World History"
      // with no focus hint and bulk-generates generic books.
      //
      // Also handle LLM returning combined names like "Biology — Botany" or
      // "Biology: Botany" — split and use the second part as the subject name
      // with the original input as focus.
      let subjectName = suggestion.name;
      let suggestionFocus = suggestion.focus;
      const dashMatch = suggestion.name.match(/^(.+?)\s*[—–:]\s*(.+)$/);
      if (dashMatch?.[2] && !suggestionFocus) {
        subjectName = dashMatch[2].trim();
        suggestionFocus = originalInput || dashMatch[2].trim();
      }

      setName(subjectName);
      const effectiveFocus =
        suggestionFocus ??
        (originalInput &&
        originalInput.toLowerCase() !== subjectName.toLowerCase()
          ? originalInput
          : undefined);
      await doCreate(
        subjectName,
        originalInput || undefined,
        effectiveFocus,
        effectiveFocus ? suggestion.description : undefined
      );
    },
    [doCreate, originalInput]
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

  const handleCancel = useCallback(() => {
    // [BUG-692] Signal any in-flight mutation to skip post-await navigation.
    cancelledRef.current = true;

    if (returnTo === 'chat') {
      // [BUG-633 / M-1] Bare router.back() silently no-ops when the modal was
      // opened via deep link / push notification — no prior stack entry to go
      // back to. Fall back to the home tab so cancel is never a dead button.
      goBackOrReplace(router, '/(app)/home' as never);
      return;
    }

    if (returnTo === 'library') {
      router.replace('/(app)/library' as never);
      return;
    }

    router.replace(homeHrefForReturnTo(returnTo) as never);
  }, [returnTo, router]);

  const handleSubjectLimitPress = useCallback(() => {
    if (returnTo === 'chat') {
      // [BUG-633 / M-1] Same defensive fallback as handleCancel.
      goBackOrReplace(router, '/(app)/home' as never);
    } else {
      router.replace('/(app)/library' as never);
    }
  }, [returnTo, router]);

  const onChipPress = useCallback(
    async (chip: string) => {
      setName(chip);
      setError('');
      setOriginalInput(''); // clear stale original input
      setResolveState({ phase: 'idle' });
      setResolveRounds(0);
      await resolveInput(chip);
    },
    [resolveInput]
  );

  const starterChips = useMemo(() => {
    const existingNames = new Set(
      (existingSubjects ?? []).map((s) => s.name.toLowerCase())
    );
    return STARTER_CHIPS.filter(
      (chip) => !existingNames.has(chip.toLowerCase())
    );
  }, [existingSubjects]);

  const isAmbiguous =
    showSuggestion && resolveState.result.status === 'ambiguous';
  const isNoMatch = showSuggestion && resolveState.result.status === 'no_match';
  const allowUseMyWords = isNoMatch || resolveRounds >= 2;
  const exactWords = (clarificationInput || originalInput || name).trim();
  const subjectLimitGuidance = isSubjectLimitError
    ? ' Delete an old subject first to make room.'
    : '';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background items-center"
      // [BUG-829] `padding` works on iOS but pushes the input off-screen on
      // Android (especially with prediction-bar keyboards). `height` is the
      // documented Android-correct value; web doesn't need either.
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
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
            {t('subject.title')}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            label={t('common.cancel')}
            onPress={handleCancel}
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
            {/* M4: Retry Pressable when resolve timed out */}
            {resolveTimedOut && (
              <Pressable
                onPress={() => {
                  setResolveTimedOut(false);
                  setError('');
                  void onSubmit();
                }}
                className="mt-2 self-start"
                accessibilityRole="button"
                accessibilityLabel={t('subject.retryCheckLabel')}
                testID="resolve-timeout-retry"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            )}
            {/* BUG-116: Actionable navigation to manage existing subjects */}
            {isSubjectLimitError && (
              <Pressable
                onPress={handleSubjectLimitPress}
                className="mt-2 bg-surface rounded-button py-2.5 px-4 items-center"
                accessibilityRole="button"
                accessibilityLabel={
                  returnTo === 'chat'
                    ? t('common.goBack')
                    : t('subject.manageSubjects')
                }
                testID="manage-subjects-button"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('subject.manageSubjects')}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <Text className="text-body text-text-secondary mb-4">
          {t('subject.prompt')}
        </Text>

        <View onLayout={onFieldLayout('name')}>
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            {t('subject.nameLabel')}
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder={t('subject.namePlaceholder')}
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

        {/* Inline error when existing subjects failed to load [UX-DE] */}
        {resolveState.phase === 'idle' &&
          !isBusy &&
          name.trim() === '' &&
          existingSubjectsError && (
            <Pressable
              onPress={() => void refetchSubjects()}
              className="mb-3 self-start"
              accessibilityRole="button"
              accessibilityLabel={t('subject.retryLoadSubjectsLabel')}
              testID="subjects-load-error-retry"
            >
              <Text className="text-body-sm text-danger">
                {t('subject.subjectsLoadError')}{' '}
                <Text className="font-semibold text-primary">
                  {t('subject.tapToRetry')}
                </Text>
              </Text>
            </Pressable>
          )}

        {resolveState.phase === 'idle' &&
          !isBusy &&
          name.trim() === '' &&
          ((existingSubjects?.length ?? 0) > 0 || starterChips.length > 0) && (
            <View
              className="gap-3 mt-4 mb-4"
              testID="subject-options"
              accessibilityLabel={t('subject.suggestedSubjectsLabel')}
            >
              {(existingSubjects ?? []).map((subject) => (
                <Pressable
                  key={subject.id}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/session',
                      params: {
                        mode: 'learning',
                        subjectId: subject.id,
                        subjectName: subject.name,
                      },
                    } as never)
                  }
                  className="rounded-card bg-surface-elevated px-4 py-3 flex-row items-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('subject.continueSubjectLabel', {
                    name: subject.name,
                  })}
                  testID={`subject-continue-${subject.id}`}
                >
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-primary">
                      {t('subject.continueSubject', { name: subject.name })}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
              {starterChips.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => void onChipPress(chip)}
                  className="rounded-card bg-surface-elevated px-4 py-3 flex-row items-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('subject.startSubjectLabel', {
                    name: chip,
                  })}
                  testID={`subject-start-${chip.toLowerCase()}`}
                >
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-primary">
                      {t('subject.startSubject', { name: chip })}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
            </View>
          )}

        {/* Broader category entry point — encourages natural language input */}
        {resolveState.phase === 'idle' && !isBusy && name.trim() === '' && (
          <Text
            className="text-body-sm text-text-secondary mb-4"
            testID="not-sure-hint"
          >
            {t('subject.notSureHint')}
          </Text>
        )}

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
              {t('subject.checkingName')}
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
                {stripBold(resolveState.result.displayMessage ?? '')}
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
              accessibilityLabel={t('subject.somethingElse')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('subject.somethingElse')}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-0.5">
                {t('subject.somethingElseHint')}
              </Text>
            </Pressable>

            {showClarifyInput && (
              <View className="mt-3" testID="subject-clarify-card">
                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  {t('subject.clarifyLabel')}
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-3"
                  placeholder={t('subject.clarifyPlaceholder')}
                  placeholderTextColor={colors.muted}
                  value={clarificationInput}
                  onChangeText={setClarificationInput}
                  editable={!isBusy}
                  testID="subject-clarify-input"
                />
                <Button
                  variant="primary"
                  label={t('subject.checkThisInstead')}
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
                accessibilityLabel={t('subject.useMyWordsLabel', {
                  words: exactWords,
                })}
              >
                <Text className="text-body-sm font-semibold text-primary">
                  {t('subject.useMyWords', { words: exactWords })}
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
              {stripBold(resolveState.result.displayMessage ?? '') ||
                t('subject.noMatchFallback')}
            </Text>
            {exactWords !== '' && (
              <Button
                variant="primary"
                label={t('subject.justUse', { words: exactWords })}
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
              accessibilityLabel={t('subject.editSubjectNameLabel')}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {t('subject.editInstead')}
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
              testID="subject-single-suggestion-card"
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
                  {stripBold(resolveState.result.displayMessage ?? '')}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={onAcceptSuggestion}
                  className="flex-1 bg-primary rounded-button py-3 items-center min-h-[44px] justify-center"
                  testID="subject-suggestion-accept"
                  accessibilityRole="button"
                  accessibilityLabel={t('subject.acceptSuggestionLabel')}
                >
                  <Text className="text-text-inverse font-semibold text-body-sm">
                    {t('subject.accept')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onEditSuggestion}
                  className="flex-1 bg-surface rounded-button py-3 items-center min-h-[44px] justify-center border border-border"
                  testID="subject-suggestion-edit"
                  accessibilityRole="button"
                  accessibilityLabel={t('subject.editSuggestionLabel')}
                >
                  <Text className="text-text-primary font-semibold text-body-sm">
                    {t('common.edit')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

        {/* Only show Start Learning when not showing suggestions */}
        {!showSuggestion && (
          <>
            <Button
              variant="primary"
              label={t('subject.startLearning')}
              onPress={onSubmit}
              disabled={!canSubmit}
              loading={isBusy}
              testID="create-subject-submit"
            />
            {/* BUG-414: Explain why button is disabled */}
            {!canSubmit && !isBusy && (
              <Text
                className="text-body-sm text-text-secondary text-center mt-2"
                testID="create-subject-validation-hint"
              >
                {t('subject.validationHint')}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
