import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountAdminSheet } from '../../components/account/AccountAdminSheet';

export default function AccountScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="account-screen"
    >
      <AccountAdminSheet />
    </View>
  );
}
