import { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';

// [CR-2026-05-19-H23] Required by `unstable_settings.initialRouteName: 'index'`
// in `_layout.tsx`. The vocabulary stack is rendered cross-tab when the user
// navigates from the Progress tab (`progress/vocabulary.tsx` or
// `progress/[subjectId]/index.tsx`) to `/vocabulary/[subjectId]`. Without an
// actual `index` route to seed the bottom of the stack, Expo Router
// synthesises a 1-deep stack and `router.back()` from the vocabulary screen
// falls through to the Tabs first-route (Home).
//
// This index never renders during normal forward navigation — it only
// surfaces when the user backs out of `/vocabulary/[subjectId]` after a
// cross-stack push, at which point we route them back to the Progress tab
// (the closest shared ancestor that originated the push).
export default function VocabularyIndexRedirect(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  useFocusEffect(
    useCallback(() => {
      if (
        pathname !== '/vocabulary' &&
        pathname !== '/vocabulary/' &&
        pathname !== '/(app)/vocabulary' &&
        pathname !== '/(app)/vocabulary/'
      ) {
        return;
      }
      router.replace('/(app)/progress');
    }, [pathname, router]),
  );
  return <View testID="vocabulary-index-redirect" />;
}
