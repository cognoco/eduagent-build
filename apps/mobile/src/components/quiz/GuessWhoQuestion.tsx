import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ClientQuizQuestion, QuestionCheckInput } from '@eduagent/schemas';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useThemeColors } from '../../lib/theme';

type ClientGuessWhoQuestion = Extract<
  ClientQuizQuestion,
  { type: 'guess_who' }
>;

export interface GuessWhoResolvedResult {
  correct: boolean;
  answerGiven: string;
  cluesUsed: number;
  answerMode: 'free_text' | 'multiple_choice';
}

export type GuessWhoCheckOptions = Pick<
  QuestionCheckInput,
  'answerMode' | 'finalAttempt' | 'cluesUsed'
>;

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    const replacement = shuffled[j];
    if (current === undefined || replacement === undefined) continue;
    shuffled[i] = replacement;
    shuffled[j] = current;
  }
  return shuffled;
}

function getHintMessage(
  nextClueCount: number,
  usedWrongGuess: boolean,
  t: TFunction,
): string {
  if (nextClueCount >= 3) {
    return usedWrongGuess
      ? t('quiz.guessWhoQuestion.hintWithMCAvailableWrong')
      : t('quiz.guessWhoQuestion.hintWithMCAvailable');
  }

  return usedWrongGuess
    ? t('quiz.guessWhoQuestion.hintWrong')
    : t('quiz.guessWhoQuestion.hint');
}

interface GuessWhoQuestionProps {
  question: ClientGuessWhoQuestion;
  onCheckAnswer: (
    answerGiven: string,
    options: GuessWhoCheckOptions,
  ) => Promise<boolean>;
  onResolved: (result: GuessWhoResolvedResult) => void;
}

export function GuessWhoQuestion({
  question,
  onCheckAnswer,
  onResolved,
}: GuessWhoQuestionProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [guess, setGuess] = useState('');
  const [visibleClueCount, setVisibleClueCount] = useState(1);
  const [helperText, setHelperText] = useState<string | null>(null);
  const [fallbackOptions, setFallbackOptions] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setGuess('');
    setVisibleClueCount(1);
    setHelperText(null);
    setFallbackOptions(shuffle(question.mcFallbackOptions));
  }, [question]);

  const canSubmit = guess.trim().length > 0 && !isChecking;
  const canShowFallback = visibleClueCount >= 3;
  const isFinalClue = visibleClueCount >= question.clues.length;

  function resolveFreeText(correct: boolean, answerGiven: string) {
    onResolved({
      correct,
      answerGiven,
      cluesUsed: visibleClueCount,
      answerMode: 'free_text',
    });
  }

  // [CR-1] Free-text guesses are now validated server-side via the check
  // endpoint. The server performs fuzzy matching (Levenshtein) against
  // canonicalName + acceptedAliases, which are no longer sent to the client.
  async function handleSubmitGuess() {
    const normalizedGuess = guess.trim();
    if (!normalizedGuess || isChecking) return;

    Keyboard.dismiss();
    setIsChecking(true);

    try {
      const correct = await onCheckAnswer(normalizedGuess, {
        answerMode: 'free_text',
        finalAttempt: isFinalClue,
        cluesUsed: visibleClueCount,
      });

      if (correct) {
        resolveFreeText(true, normalizedGuess);
        return;
      }

      if (isFinalClue) {
        resolveFreeText(false, normalizedGuess);
        return;
      }

      const nextClueCount = Math.min(
        question.clues.length,
        visibleClueCount + 1,
      );
      setVisibleClueCount(nextClueCount);
      setGuess('');
      setHelperText(getHintMessage(nextClueCount, true, t));
    } catch {
      if (isFinalClue) {
        resolveFreeText(false, normalizedGuess);
      } else {
        const nextClueCount = Math.min(
          question.clues.length,
          visibleClueCount + 1,
        );
        setVisibleClueCount(nextClueCount);
        setGuess('');
        setHelperText(getHintMessage(nextClueCount, true, t));
      }
    } finally {
      setIsChecking(false);
    }
  }

  async function handleRevealNextClue() {
    Keyboard.dismiss();

    if (isFinalClue) {
      if (isChecking) return;
      setIsChecking(true);
      try {
        await onCheckAnswer('[skipped]', {
          answerMode: 'free_text',
          finalAttempt: true,
          cluesUsed: visibleClueCount,
        });
      } catch {
        // The play screen will surface check failures; a skip remains wrong.
      } finally {
        setIsChecking(false);
      }
      resolveFreeText(false, '[skipped]');
      return;
    }

    const nextClueCount = Math.min(question.clues.length, visibleClueCount + 1);
    setVisibleClueCount(nextClueCount);
    setHelperText(getHintMessage(nextClueCount, false, t));
  }

  async function handleFallbackChoice(option: string) {
    if (isChecking) return;
    setIsChecking(true);

    try {
      const correct = await onCheckAnswer(option, {
        answerMode: 'multiple_choice',
        finalAttempt: true,
        cluesUsed: visibleClueCount,
      });
      onResolved({
        correct,
        answerGiven: option,
        cluesUsed: visibleClueCount,
        answerMode: 'multiple_choice',
      });
    } catch {
      onResolved({
        correct: false,
        answerGiven: option,
        cluesUsed: visibleClueCount,
        answerMode: 'multiple_choice',
      });
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <View className="gap-4" testID="guess-who-question">
      <View className="gap-2">
        {question.clues.slice(0, visibleClueCount).map((clue, index) => (
          <View
            key={`${index}-${clue}`}
            className="rounded-card bg-surface p-4"
          >
            <Text className="text-caption font-semibold text-primary">
              {t('quiz.guessWhoQuestion.clue', { number: index + 1 })}
            </Text>
            <Text className="mt-1 text-body text-text-primary">{clue}</Text>
          </View>
        ))}
      </View>

      <View className="rounded-card bg-surface p-4">
        <View className="rounded-input bg-surface-elevated px-3">
          <TextInput
            value={guess}
            onChangeText={setGuess}
            placeholder={t('quiz.guessWhoQuestion.typeAName')}
            placeholderTextColor={colors.muted}
            className="py-3 text-body text-text-primary"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmitGuess}
            accessibilityLabel={t('quiz.guessWhoQuestion.answerLabel')}
            testID="guess-who-input"
          />
        </View>

        <View className="mt-3 flex-row gap-3">
          <Pressable
            onPress={handleSubmitGuess}
            disabled={!canSubmit}
            className={`flex-1 min-h-[44px] items-center justify-center rounded-button px-4 py-3 ${
              canSubmit ? 'bg-primary' : 'bg-surface-elevated opacity-60'
            }`}
            accessibilityRole="button"
            accessibilityLabel={t('quiz.guessWhoQuestion.submitGuessLabel')}
            testID="guess-who-submit"
          >
            {isChecking ? (
              <ActivityIndicator
                size="small"
                color={colors.textInverse}
                accessibilityLabel={t('common.loading')}
              />
            ) : (
              <Text
                className={`text-body-sm font-semibold ${
                  canSubmit ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                {t('quiz.guessWhoQuestion.submitGuess')}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={handleRevealNextClue}
            className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={
              isFinalClue
                ? t('quiz.guessWhoQuestion.iDontKnowLabel')
                : t('quiz.guessWhoQuestion.revealNextClueLabel')
            }
            testID="guess-who-next-clue"
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              {isFinalClue
                ? t('quiz.guessWhoQuestion.iDontKnow')
                : t('quiz.guessWhoQuestion.revealNextClue')}
            </Text>
          </Pressable>
        </View>

        {helperText ? (
          <Text className="mt-3 text-body-sm text-text-secondary">
            {helperText}
          </Text>
        ) : null}
      </View>

      {canShowFallback ? (
        <View className="gap-3">
          <Text className="text-body-sm font-semibold text-text-secondary">
            {t('quiz.guessWhoQuestion.fallbackPrompt')}
          </Text>
          {fallbackOptions.map((option, index) => (
            <Pressable
              key={`${index}-${option}`}
              onPress={() => handleFallbackChoice(option)}
              disabled={isChecking}
              className={`min-h-[56px] items-center justify-center rounded-card bg-surface-elevated px-5 py-4 ${
                isChecking ? 'opacity-60' : ''
              }`}
              accessibilityRole="button"
              accessibilityLabel={option}
              testID={`guess-who-option-${index}`}
            >
              <Text className="text-body font-semibold text-text-primary">
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
