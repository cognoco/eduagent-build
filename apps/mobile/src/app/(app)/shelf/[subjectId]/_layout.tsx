import { Stack } from 'expo-router';

export default function SubjectShelfLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="book/[bookId]"
        getId={({ params }) => params?.bookId}
      />
    </Stack>
  );
}
