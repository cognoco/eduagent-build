import { Image, Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useProfile } from '../../lib/profile';
import { accountReturnTokenForPathname } from '../../lib/navigation';

function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AccountAvatar(): React.ReactElement | null {
  const { activeProfile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  if (!activeProfile) return null;
  const displayName = activeProfile.displayName.trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        displayName
          ? t('accountAdmin.openAccount', { name: displayName })
          : t('accountAdmin.openAccountNoName')
      }
      onPress={() =>
        router.push({
          pathname: '/(app)/account',
          params: { returnTo: accountReturnTokenForPathname(pathname) },
        })
      }
      style={{ height: 44, width: 44 }}
      className="items-center justify-center rounded-full border border-border bg-surface shadow-sm"
      testID="account-avatar-button"
    >
      {activeProfile.avatarUrl ? (
        <Image
          source={{ uri: activeProfile.avatarUrl }}
          className="h-10 w-10 rounded-full"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
          <Text className="text-body-sm font-bold text-primary">
            {initials(displayName)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
