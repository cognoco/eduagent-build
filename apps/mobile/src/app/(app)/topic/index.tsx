import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

// [BUG-685 / M-5] Required by `unstable_settings.initialRouteName: 'index'`
// in `_layout.tsx`. The topic stack is rendered cross-tab when the user
// navigates from a book screen (which lives in the shelf stack) to
// `/topic/[topicId]`. Without an actual `index` route to seed the bottom
// of the stack, Expo Router synthesises a 1-deep stack and `router.back()`
// from the topic screen falls through to the Tabs first-route (Home).
//
// This index never renders during normal forward navigation — it only
// surfaces when the user backs out of `/topic/[topicId]` after a
// cross-stack push, at which point we route them back to the Library
// (the closest shared ancestor that contains every shelf and book).
export default function TopicIndexRedirect(): React.JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(app)/library');
  }, [router]);
  return <View testID="topic-index-redirect" />;
}
