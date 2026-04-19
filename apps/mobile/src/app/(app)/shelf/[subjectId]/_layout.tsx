import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

export default function SubjectShelfLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="book/[bookId]"
        getId={({ params }) => params?.bookId}
      />
    </Stack>
  );
}
