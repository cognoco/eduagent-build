import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TopicPickerSheet } from '../../components/library/TopicPickerSheet';

const IS_E2E_BUILD = process.env.EXPO_PUBLIC_E2E === 'true';

/**
 * E2E-only host for the real TopicPickerSheet consumer. The changing topic
 * label exposes action and dismissal counts through the rendered UI so a real
 * browser can verify keyboard behavior without synthetic click shims.
 */
export default function BottomSheetKeyboardProofScreen(): React.ReactElement | null {
  const router = useRouter();
  const [selectionCount, setSelectionCount] = useState(0);
  const [closeCount, setCloseCount] = useState(0);

  useEffect(() => {
    if (!IS_E2E_BUILD) {
      router.replace('/(app)/home');
    }
  }, [router]);

  if (!IS_E2E_BUILD) {
    return null;
  }

  return (
    <View testID="bottom-sheet-keyboard-proof">
      <TopicPickerSheet
        visible
        topics={[
          {
            topicId: 'keyboard-proof',
            name: `Keyboard proof — selections ${selectionCount}; closes ${closeCount}`,
            chapter: null,
          },
        ]}
        onSelect={() => setSelectionCount((count) => count + 1)}
        onClose={() => setCloseCount((count) => count + 1)}
      />
    </View>
  );
}
