import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { SecuritySessions } from '../../../components/security-sessions';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';

export default function SecuritySessionsScreen(): React.JSX.Element | null {
  const router = useRouter();
  const navigationContract = useNavigationContract();
  const canShowAccountSecurity = navigationContract.gates.showAccountSecurity;

  useEffect(() => {
    if (!canShowAccountSecurity) {
      router.replace('/(app)/more/account');
    }
  }, [canShowAccountSecurity, router]);

  if (!canShowAccountSecurity) return null;

  return (
    <View className="flex-1 bg-background">
      {/* Credential controls are account-level for the shared Clerk identity,
          so deep links re-check the same owner-and-non-proxy gate as account.tsx. */}
      <SecuritySessions
        onBackToAccount={() => router.replace('/(app)/more/account')}
      />
    </View>
  );
}
