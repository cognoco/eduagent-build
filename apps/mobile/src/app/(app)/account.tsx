import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AccountAdminSheet } from '../../components/account/AccountAdminSheet';
import { goBackOrReplace } from '../../lib/navigation';

export default function AccountScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="account-screen"
    >
      <View className="px-4 pt-2 pb-1 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          hitSlop={8}
          testID="account-back"
        >
          <Ionicons name="arrow-back" size={24} className="text-text-primary" />
        </Pressable>
      </View>
      <AccountAdminSheet />
    </View>
  );
}
