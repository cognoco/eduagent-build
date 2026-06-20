import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export const ACCOUNT_PRESENTATION = 'modal' as const;

export default function AccountLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: ACCOUNT_PRESENTATION,
      }}
    />
  );
}
