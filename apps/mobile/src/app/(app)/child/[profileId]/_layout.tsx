import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

export default function ChildDetailLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
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
