import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';

export function ParentOnly({ children }: { children: ReactNode }): ReactNode {
  const role = useActiveProfileRole();
  const router = useRouter();
  const { t } = useTranslation();
  const isRedirecting = role === 'child' || role === 'impersonated-child';

  useEffect(() => {
    if (isRedirecting) {
      router.replace('/(app)/home');
    }
  }, [isRedirecting, router]);

  if (role !== 'owner') {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        testID={isRedirecting ? 'parent-only-redirect' : 'parent-only-loading'}
      >
        <Text className="text-body text-text-secondary text-center">
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  return children;
}
