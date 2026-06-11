import { Stack, useLocalSearchParams } from 'expo-router';
import { RequireFamilyContext } from '../../../../components/guards/RequireFamilyContext';
import { useThemeColors } from '../../../../lib/theme';

// AGENTS.md: any nested layout with an index screen AND dynamic children must
// export unstable_settings so cross-stack deep pushes land on index first.
export const unstable_settings = { initialRouteName: 'index' };

export default function ChildDetailLayout() {
  const colors = useThemeColors();
  const { profileId: rawProfileId } = useLocalSearchParams<{
    profileId?: string | string[];
  }>();
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;

  return (
    <RequireFamilyContext route="child/[profileId]" params={{ profileId }}>
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
        <Stack.Screen name="curriculum" />
        <Stack.Screen
          name="topic/[topicId]"
          getId={({ params }) => params?.topicId}
        />
      </Stack>
    </RequireFamilyContext>
  );
}
