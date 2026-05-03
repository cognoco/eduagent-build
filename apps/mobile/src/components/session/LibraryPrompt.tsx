import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function LibraryPrompt(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => router.push('/(app)/library' as never)}
      testID="session-library-link"
      accessibilityRole="link"
      accessibilityLabel={t('session.libraryPrompt.goToLibrary')}
      className="mt-2 items-center py-2"
    >
      <Text className="text-caption text-text-secondary">
        {t('session.libraryPrompt.wantToSee')}{' '}
        <Text className="underline font-medium">
          {t('session.libraryPrompt.goToLibrary')}
        </Text>
      </Text>
    </Pressable>
  );
}
