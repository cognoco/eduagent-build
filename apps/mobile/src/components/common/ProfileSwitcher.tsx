import { useState, useCallback, type ReactNode } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import type { Profile } from '@eduagent/schemas';

const PERSONA_LABELS: Record<string, string> = {
  TEEN: 'Teen',
  LEARNER: 'Learner',
  PARENT: 'Parent',
};

interface ProfileSwitcherProps {
  profiles: Profile[];
  activeProfileId: string;
  onSwitch: (profileId: string) => void;
}

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSwitch,
}: ProfileSwitcherProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const initials = activeProfile
    ? activeProfile.displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  const handleSelect = useCallback(
    (profileId: string) => {
      setIsOpen(false);
      if (profileId !== activeProfileId) {
        onSwitch(profileId);
      }
    },
    [activeProfileId, onSwitch]
  );

  if (profiles.length <= 1) return null;

  return (
    <View
      // On web, zIndex alone works. On native, we need elevation for Android.
      style={Platform.OS === 'web' ? { zIndex: 50 } : undefined}
    >
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        className="flex-row items-center bg-surface-elevated rounded-full px-3 py-1.5"
        accessibilityRole="button"
        accessibilityLabel={`Switch profile. Current: ${
          activeProfile?.displayName ?? 'Unknown'
        }`}
        accessibilityState={{ expanded: isOpen }}
        testID="profile-switcher-chip"
      >
        <View className="w-7 h-7 rounded-full bg-primary items-center justify-center me-2">
          <Text className="text-text-inverse text-caption font-bold">
            {initials}
          </Text>
        </View>
        <Text className="text-body-sm font-medium text-text-primary me-1">
          {activeProfile?.displayName ?? 'Profile'}
        </Text>
        <Text className="text-text-secondary text-caption">
          {isOpen ? '\u25B2' : '\u25BC'}
        </Text>
      </Pressable>

      {isOpen && (
        <>
          {/* Backdrop — closes dropdown on outside tap */}
          <Pressable
            onPress={() => setIsOpen(false)}
            style={{
              position: 'absolute',
              top: -1000,
              left: -1000,
              right: -1000,
              bottom: -1000,
              zIndex: 40,
            }}
            accessibilityLabel="Close profile switcher"
            testID="profile-switcher-backdrop"
          />

          {/* Dropdown menu */}
          <View
            className="bg-surface-elevated rounded-card shadow-lg"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              minWidth: 200,
              marginTop: 4,
              zIndex: 50,
              ...Platform.select({
                android: { elevation: 8 },
                default: {},
              }),
            }}
            testID="profile-switcher-menu"
          >
            {profiles.map((profile) => {
              const isActive = profile.id === activeProfileId;
              return (
                <Pressable
                  key={profile.id}
                  onPress={() => handleSelect(profile.id)}
                  className={`px-4 py-3 flex-row items-center ${
                    isActive ? 'bg-primary-soft' : ''
                  }`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${profile.displayName}, ${
                    PERSONA_LABELS[profile.personaType] ?? profile.personaType
                  }${isActive ? ', active' : ''}`}
                  accessibilityState={{ selected: isActive }}
                  testID={`profile-option-${profile.id}`}
                >
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center me-3 ${
                      isActive ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <Text
                      className={`text-caption font-bold ${
                        isActive ? 'text-text-inverse' : 'text-text-secondary'
                      }`}
                    >
                      {profile.displayName
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-body-sm font-medium ${
                        isActive ? 'text-primary' : 'text-text-primary'
                      }`}
                    >
                      {profile.displayName}
                    </Text>
                    <Text className="text-caption text-text-secondary">
                      {PERSONA_LABELS[profile.personaType] ??
                        profile.personaType}
                    </Text>
                  </View>
                  {isActive && (
                    <Text className="text-primary text-body-sm ms-2">
                      {'\u2713'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
