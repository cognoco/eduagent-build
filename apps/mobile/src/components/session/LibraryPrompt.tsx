import { Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

export function LibraryPrompt(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() =>
        router.push(
          (FEATURE_FLAGS.MODE_NAV_V2_ENABLED
            ? '/(app)/subjects'
            : '/(app)/library') as Href,
        )
      }
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
