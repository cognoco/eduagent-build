import React, { createContext, useCallback, useContext, useState } from 'react';
import { Stack } from 'expo-router';
import type {
  CompleteRoundResponse,
  QuizActivityType,
  QuizRoundResponse,
} from '@eduagent/schemas';

interface QuizFlowState {
  activityType: QuizActivityType | null;
  round: QuizRoundResponse | null;
  prefetchedRoundId: string | null;
  completionResult: CompleteRoundResponse | null;
}

interface QuizFlowContextType extends QuizFlowState {
  setActivityType: (activityType: QuizActivityType) => void;
  setRound: (round: QuizRoundResponse | null) => void;
  setPrefetchedRoundId: (id: string | null) => void;
  setCompletionResult: (result: CompleteRoundResponse | null) => void;
  clear: () => void;
}

const QuizFlowContext = createContext<QuizFlowContextType | null>(null);

const INITIAL_STATE: QuizFlowState = {
  activityType: null,
  round: null,
  prefetchedRoundId: null,
  completionResult: null,
};

export function useQuizFlow(): QuizFlowContextType {
  const context = useContext(QuizFlowContext);
  if (!context) {
    throw new Error('useQuizFlow must be used within QuizFlowProvider');
  }
  return context;
}

function QuizFlowProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<QuizFlowState>(INITIAL_STATE);
  const setActivityType = useCallback((activityType: QuizActivityType) => {
    setState((current) => ({ ...current, activityType }));
  }, []);
  const setRound = useCallback((round: QuizRoundResponse | null) => {
    setState((current) => ({ ...current, round }));
  }, []);
  const setPrefetchedRoundId = useCallback(
    (prefetchedRoundId: string | null) => {
      setState((current) => ({ ...current, prefetchedRoundId }));
    },
    []
  );
  const setCompletionResult = useCallback(
    (completionResult: CompleteRoundResponse | null) => {
      setState((current) => ({ ...current, completionResult }));
    },
    []
  );
  const clear = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return (
    <QuizFlowContext.Provider
      value={{
        ...state,
        setActivityType,
        setRound,
        setPrefetchedRoundId,
        setCompletionResult,
        clear,
      }}
    >
      {children}
    </QuizFlowContext.Provider>
  );
}

export default function QuizLayout(): React.ReactElement {
  return (
    <QuizFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
    </QuizFlowProvider>
  );
}
