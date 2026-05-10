import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

// CLAUDE.md: any nested layout with an index screen AND dynamic children must
// export unstable_settings so cross-stack deep pushes land on index first.
export const unstable_settings = { initialRouteName: 'index' };

export default function ChildDetailLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      initialRouteName="index"
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
        name="weekly-report/[weeklyReportId]"
        getId={({ params }) => params?.weeklyReportId}
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
