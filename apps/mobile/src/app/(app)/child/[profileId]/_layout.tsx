import { Stack } from 'expo-router';

export default function ChildDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="session/[sessionId]"
        getId={({ params }) => params?.sessionId}
      />
      <Stack.Screen
        name="report/[reportId]"
        getId={({ params }) => params?.reportId}
      />
      <Stack.Screen
        name="subjects/[subjectId]"
        getId={({ params }) => params?.subjectId}
      />
      <Stack.Screen
        name="topic/[topicId]"
        getId={({ params }) => params?.topicId}
      />
    </Stack>
  );
}
