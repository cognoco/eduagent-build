import { createContext, useCallback, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useShakeDetector } from '../../hooks/use-shake-detector';
import { FeedbackSheet } from './FeedbackSheet';

interface FeedbackContextValue {
  openFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  // Default noop — overridden by the provider below
  openFeedback: () => undefined,
});

export function useFeedbackContext(): FeedbackContextValue {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({
  children,
}: PropsWithChildren): React.ReactElement {
  const [visible, setVisible] = useState(false);

  const openFeedback = useCallback(() => {
    setVisible(true);
  }, []);

  useShakeDetector(openFeedback);

  return (
    <FeedbackContext.Provider value={{ openFeedback }}>
      {children}
      <FeedbackSheet visible={visible} onClose={() => setVisible(false)} />
    </FeedbackContext.Provider>
  );
}
