import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

interface FluencyDrillProps {
  prompt: string;
  expectedAnswer: string;
  timeLimitSeconds?: number;
  onAnswer: (answer: string, timeMs: number, isCorrect: boolean) => void;
  onTimeout: () => void;
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function FluencyDrill(props: FluencyDrillProps) {
  const {
    prompt,
    expectedAnswer,
    timeLimitSeconds = 15,
    onAnswer,
    onTimeout,
  } = props;
  const [answer, setAnswer] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSeconds);
  const startTimeRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    startTimeRef.current = Date.now();
    setAnswer('');
    setSecondsLeft(timeLimitSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 1) {
          clearInterval(interval);
          onTimeoutRef.current();
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [prompt, timeLimitSeconds]);

  const handleSubmit = useCallback(() => {
    const timeMs = Date.now() - startTimeRef.current;
    const isCorrect =
      normalizeAnswer(answer) === normalizeAnswer(expectedAnswer);
    onAnswer(answer, timeMs, isCorrect);
  }, [answer, expectedAnswer, onAnswer]);

  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-primary font-bold text-lg">Fluency Drill</Text>
        <Text
          className={
            secondsLeft <= 5
              ? 'font-mono text-lg text-danger'
              : 'font-mono text-lg text-text-secondary'
          }
        >
          {secondsLeft}s
        </Text>
      </View>
      <Text className="text-text-primary text-base mb-4">{prompt}</Text>
      <TextInput
        className="bg-surface-elevated text-text-primary rounded-xl p-3 text-base mb-3"
        value={answer}
        onChangeText={setAnswer}
        placeholder="Type your answer..."
        autoFocus
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <Pressable
        className="bg-primary rounded-xl py-3 items-center"
        onPress={handleSubmit}
      >
        <Text className="text-text-inverse font-semibold">Submit</Text>
      </Pressable>
    </View>
  );
}
