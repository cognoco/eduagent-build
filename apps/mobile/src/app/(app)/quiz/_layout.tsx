import React, { createContext, useCallback, useContext, useState } from 'react';
import { Redirect, Stack } from 'expo-router';
import type {
  CompleteRoundResponse,
  QuizActivityType,
  QuizRoundResponse,
} from '@eduagent/schemas';
import { useThemeColors } from '../../../lib/theme';
import { useParentProxy } from '../../../hooks/use-parent-proxy';

// CLAUDE.md: any nested layout with an index screen AND dynamic children must
// export unstable_settings so cross-stack deep pushes land on index first.
export const unstable_settings = { initialRouteName: 'index' };

interface QuizFlowState {
  activityType: QuizActivityType | null;
  subjectId: string | null;
  languageName: string | null;
  round: QuizRoundResponse | null;
  prefetchedRoundId: string | null;
  completionResult: CompleteRoundResponse | null;
}

interface QuizFlowContextType extends QuizFlowState {
  setActivityType: (activityType: QuizActivityType) => void;
  setSubjectId: (subjectId: string | null) => void;
  setLanguageName: (languageName: string | null) => void;
  setRound: (round: QuizRoundResponse | null) => void;
  setPrefetchedRoundId: (id: string | null) => void;
  setCompletionResult: (result: CompleteRoundResponse | null) => void;
  clear: () => void;
}

const QuizFlowContext = createContext<QuizFlowContextType | null>(null);

const INITIAL_STATE: QuizFlowState = {
  activityType: null,
  subjectId: null,
  languageName: null,
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

// Exported so tests can mount real descendants inside the real provider
// without re-implementing (and drifting from) the context state machine.
export function QuizFlowProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<QuizFlowState>(INITIAL_STATE);
  const setActivityType = useCallback((activityType: QuizActivityType) => {
    setState((current) => ({ ...current, activityType }));
  }, []);
  const setSubjectId = useCallback((subjectId: string | null) => {
    setState((current) => ({ ...current, subjectId }));
  }, []);
  const setLanguageName = useCallback((languageName: string | null) => {
    setState((current) => ({ ...current, languageName }));
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
        setSubjectId,
        setLanguageName,
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
  const colors = useThemeColors();
  const { isParentProxy } = useParentProxy();

  if (isParentProxy) return <Redirect href="/(app)/home" />;

  return (
    <QuizFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </QuizFlowProvider>
  );
}
