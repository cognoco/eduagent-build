import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTheme, type Persona } from '../../lib/theme';
import { useProfile } from '../../lib/profile';
import { useExportData } from '../../hooks/use-account';

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
    >
      <Text className="text-body text-text-primary">{label}</Text>
      {value && (
        <Text className="text-body-sm text-text-secondary">{value}</Text>
      )}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2">
      <Text className="text-body text-text-primary">{label}</Text>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { activeProfile } = useProfile();
  const { persona, setPersona } = useTheme();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const exportData = useExportData();

  const handleExport = useCallback(async () => {
    try {
      await exportData.mutateAsync();
      Alert.alert('Export complete', 'Your data export is ready.');
    } catch {
      Alert.alert('Export failed', 'Please try again later.');
    }
  }, [exportData]);

  const displayName =
    activeProfile?.displayName ??
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    'User';

  const personaLabels: Record<Persona, string> = {
    teen: 'Teen (Dark)',
    learner: 'Eager Learner (Calm)',
    parent: 'Parent (Light)',
  };

  const personas: Persona[] = ['teen', 'learner', 'parent'];

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">More</Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2 mt-4">
          Appearance
        </Text>
        {personas.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPersona(p)}
            className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
          >
            <Text className="text-body text-text-primary">
              {personaLabels[p]}
            </Text>
            {persona === p && (
              <Text className="text-primary text-body font-semibold">
                Active
              </Text>
            )}
          </Pressable>
        ))}

        <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2 mt-6">
          Notifications
        </Text>
        <ToggleRow
          label="Push notifications"
          value={pushEnabled}
          onToggle={setPushEnabled}
        />
        <ToggleRow
          label="Weekly progress digest"
          value={weeklyDigest}
          onToggle={setWeeklyDigest}
        />

        <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2 mt-6">
          Account
        </Text>
        <SettingsRow
          label="Profile"
          value={displayName}
          onPress={() => router.push('/profiles')}
        />
        <SettingsRow label="Subscription" value="Plus" />
        <SettingsRow label="Help & Support" />
        <SettingsRow label="Export my data" onPress={handleExport} />
        <SettingsRow
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />

        <Pressable
          onPress={async () => {
            await signOut();
          }}
          className="bg-surface rounded-card px-4 py-3.5 mt-6 items-center"
          testID="sign-out-button"
        >
          <Text className="text-body font-semibold text-danger">Sign out</Text>
        </Pressable>

        <View className="mt-8 items-center">
          <Text className="text-caption text-text-secondary">
            EduAgent v1.0.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
