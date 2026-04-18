import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ClientQuizQuestion } from '@eduagent/schemas';
import { useThemeColors } from '../../../../lib/theme';

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
  usedWrongGuess: boolean
): string {
  if (nextClueCount >= 3) {
    return usedWrongGuess
      ? "Not quite. Here's another clue, and multiple choice is now available."
      : "Here's another clue. Multiple choice is now available too.";
  }

  return usedWrongGuess
    ? "Not quite. Here's another clue."
    : "Here's another clue.";
}

interface GuessWhoQuestionProps {
  question: ClientGuessWhoQuestion;
  onCheckAnswer: (answerGiven: string) => Promise<boolean>;
  onResolved: (result: GuessWhoResolvedResult) => void;
}

export function GuessWhoQuestion({
  question,
  onCheckAnswer,
  onResolved,
}: GuessWhoQuestionProps): React.ReactElement {
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
      const correct = await onCheckAnswer(normalizedGuess);

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
        visibleClueCount + 1
      );
      setVisibleClueCount(nextClueCount);
      setGuess('');
      setHelperText(getHintMessage(nextClueCount, true));
    } catch {
      if (isFinalClue) {
        resolveFreeText(false, normalizedGuess);
      } else {
        const nextClueCount = Math.min(
          question.clues.length,
          visibleClueCount + 1
        );
        setVisibleClueCount(nextClueCount);
        setGuess('');
        setHelperText(getHintMessage(nextClueCount, true));
      }
    } finally {
      setIsChecking(false);
    }
  }

  function handleRevealNextClue() {
    Keyboard.dismiss();

    if (isFinalClue) {
      resolveFreeText(false, '[skipped]');
      return;
    }

    const nextClueCount = Math.min(question.clues.length, visibleClueCount + 1);
    setVisibleClueCount(nextClueCount);
    setHelperText(getHintMessage(nextClueCount, false));
  }

  async function handleFallbackChoice(option: string) {
    if (isChecking) return;
    setIsChecking(true);

    try {
      const correct = await onCheckAnswer(option);
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
              Clue {index + 1}
            </Text>
            <Text className="mt-1 text-body text-text-primary">{clue}</Text>
          </View>
        ))}
      </View>

      <View className="rounded-card bg-surface p-4">
        <Text className="text-caption font-semibold text-text-secondary">
          Type your guess
        </Text>
        <View className="mt-3 rounded-input bg-surface-elevated px-3">
          <TextInput
            value={guess}
            onChangeText={setGuess}
            placeholder="Type a name"
            placeholderTextColor={colors.muted}
            className="py-3 text-body text-text-primary"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmitGuess}
            accessibilityLabel="Guess who answer"
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
            accessibilityLabel="Submit guess"
            testID="guess-who-submit"
          >
            {isChecking ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text
                className={`text-body-sm font-semibold ${
                  canSubmit ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                Submit guess
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={handleRevealNextClue}
            className="flex-1 min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={
              isFinalClue ? "I don't know" : 'Reveal next clue'
            }
            testID="guess-who-next-clue"
          >
            <Text className="text-body-sm font-semibold text-text-primary">
              {isFinalClue ? "I don't know" : 'Reveal next clue'}
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
            Need a fallback? Pick one:
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
