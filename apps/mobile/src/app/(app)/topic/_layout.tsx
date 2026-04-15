import { Stack } from 'expo-router';

export default function TopicLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[topicId]" getId={({ params }) => params?.topicId} />
    </Stack>
  );
}
