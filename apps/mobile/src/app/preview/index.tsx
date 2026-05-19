import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MentomateLogo } from '../../components/MentomateLogo';

export default function PreviewLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-landing"
    >
      <MentomateLogo size="lg" />
      <Text className="text-h1 font-bold text-text-primary mt-8 mb-3 text-center">
        Try MentoMate
      </Text>
      <Text className="text-body text-text-secondary mb-10 text-center">
        See how it works — no sign-up needed yet.
      </Text>
      <Pressable
        onPress={() => router.push('/preview/intent')}
        className="bg-primary rounded-button py-3.5 px-10 items-center w-full"
        testID="preview-landing-continue"
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Continue
        </Text>
      </Pressable>
    </View>
  );
}
