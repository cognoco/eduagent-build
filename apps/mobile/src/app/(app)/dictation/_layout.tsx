import React, { createContext, useCallback, useContext, useState } from 'react';
import { Redirect, Stack } from 'expo-router';
import type { DictationSentence, DictationMode } from '@eduagent/schemas';
import type { DictationReviewResult } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

// ---------------------------------------------------------------------------
// DictationData context — RF-03: data flows through context, not route params
// ---------------------------------------------------------------------------

export interface DictationData {
  sentences: DictationSentence[];
  language: string;
  title?: string;
  topic?: string;
  mode: DictationMode;
  reviewResult?: DictationReviewResult; // Added for review flow
}

interface DictationDataContextType {
  data: DictationData | null;
  setData: (data: DictationData) => void;
  clear: () => void;
}

const DictationDataContext = createContext<DictationDataContextType | null>(
  null,
);

export function useDictationData(): DictationDataContextType {
  const ctx = useContext(DictationDataContext);
  if (!ctx) {
    throw new Error(
      'useDictationData must be used within DictationDataProvider',
    );
  }
  return ctx;
}

function DictationDataProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [data, setDataState] = useState<DictationData | null>(null);

  // [MIN-5] useCallback prevents unnecessary re-renders in children consuming context
  const setData = useCallback((next: DictationData) => setDataState(next), []);
  const clear = useCallback(() => setDataState(null), []);

  return (
    <DictationDataContext.Provider value={{ data, setData, clear }}>
      {children}
    </DictationDataContext.Provider>
  );
}

export default function DictationLayout(): React.ReactElement {
  const colors = useThemeColors();
  const navigationContract = useNavigationContract();

  // V0 fallback: canEnter() blocks during profile-load when V1 is off — preserve
  // V0 behavior so cold deep-links don't redirect to /home. See H5.1 in branch CR.
  const blocked = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? !navigationContract.canEnter('dictation')
    : navigationContract.isParentProxy;

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <DictationDataProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </DictationDataProvider>
  );
}
