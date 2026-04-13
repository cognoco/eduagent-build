import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="interview" />
      <Stack.Screen name="analogy-preference" />
      <Stack.Screen name="curriculum-review" />
      <Stack.Screen name="language-setup" />
    </Stack>
  );
}
