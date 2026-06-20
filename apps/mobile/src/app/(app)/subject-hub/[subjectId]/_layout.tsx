import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SubjectHubLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
