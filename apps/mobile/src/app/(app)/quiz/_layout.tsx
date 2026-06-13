import React, { createContext, useCallback, useContext, useState } from 'react';
import { Redirect, Stack } from 'expo-router';
import type {
  CompleteRoundResponse,
  QuizActivityType,
  QuizRoundResponse,
} from '@eduagent/schemas';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

export const unstable_settings = {
  initialRouteName: 'index',
};

interface QuizFlowState {
  activityType: QuizActivityType | null;
  subjectId: string | null;
  languageName: string | null;
  returnTo: string | null;
  round: QuizRoundResponse | null;
  completionResult: CompleteRoundResponse | null;
}

interface QuizFlowContextType extends QuizFlowState {
  setActivityType: (activityType: QuizActivityType) => void;
  setSubjectId: (subjectId: string | null) => void;
  setLanguageName: (languageName: string | null) => void;
  setReturnTo: (returnTo: string | null) => void;
  setRound: (round: QuizRoundResponse | null) => void;
  setCompletionResult: (result: CompleteRoundResponse | null) => void;
  clear: () => void;
}

const QuizFlowContext = createContext<QuizFlowContextType | null>(null);

const INITIAL_STATE: QuizFlowState = {
  activityType: null,
  subjectId: null,
  languageName: null,
  returnTo: null,
  round: null,
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
  const setReturnTo = useCallback((returnTo: string | null) => {
    setState((current) => ({ ...current, returnTo }));
  }, []);
  const setRound = useCallback((round: QuizRoundResponse | null) => {
    setState((current) => ({ ...current, round }));
  }, []);
  const setCompletionResult = useCallback(
    (completionResult: CompleteRoundResponse | null) => {
      setState((current) => ({ ...current, completionResult }));
    },
    [],
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
        setReturnTo,
        setRound,
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
  const navigationContract = useNavigationContract();

  // V0 fallback: canEnter() blocks during profile-load when V1 is off — preserve
  // V0 behavior so cold deep-links don't redirect to /home. See H5.1 in branch CR.
  const blocked = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? !navigationContract.canEnter('quiz')
    : navigationContract.isParentProxy;

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

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
