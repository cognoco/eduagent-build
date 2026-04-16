import React, { createContext, useContext, useState } from 'react';
import { Stack } from 'expo-router';
import type { DictationSentence, DictationMode } from '@eduagent/schemas';
import type { DictationReviewResult } from '../../../hooks/use-dictation-api';

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
  null
);

export function useDictationData(): DictationDataContextType {
  const ctx = useContext(DictationDataContext);
  if (!ctx) {
    throw new Error('useDictationData must be used within DictationDataProvider');
  }
  return ctx;
}

function DictationDataProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [data, setDataState] = useState<DictationData | null>(null);

  const setData = (next: DictationData) => setDataState(next);
  const clear = () => setDataState(null);

  return (
    <DictationDataContext.Provider value={{ data, setData, clear }}>
      {children}
    </DictationDataContext.Provider>
  );
}

export default function DictationLayout(): React.ReactElement {
  return (
    <DictationDataProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
    </DictationDataProvider>
  );
}
