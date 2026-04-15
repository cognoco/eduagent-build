import { Stack } from 'expo-router';

export default function VocabularyLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="[subjectId]"
        getId={({ params }) => params?.subjectId}
      />
    </Stack>
  );
}
