import { useState, useCallback, useRef, type ReactNode } from 'react';
import { View, Text, Pressable, Platform, Alert } from 'react-native';
import type { Profile } from '@eduagent/schemas';
import { isGuardianProfile } from '../../lib/profile';

/** Derive a user-facing role label from profile ownership.
 * A guardian is an account owner with linked child profiles.
 * Everyone else (including adult self-learners) shows as "Student". */
function roleLabel(
  profile: { isOwner: boolean },
  allProfiles: ReadonlyArray<{ isOwner: boolean }>
): string {
  return isGuardianProfile(profile, allProfiles) ? 'Parent' : 'Student';
}

interface ProfileSwitcherProps {
  profiles: Profile[];
  activeProfileId?: string;
  onSwitch: (profileId: string) => Promise<{ success: boolean }> | void;
}

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSwitch,
}: ProfileSwitcherProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);

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
    async (profileId: string) => {
      if (profileId === activeProfileId) {
        setIsOpen(false);
        return;
      }
      if (switchingRef.current) return;
      switchingRef.current = true;
      setSwitching(true);
      try {
        const result = await onSwitch(profileId);
        // BM-05: switchProfile now returns a result object instead of
        // throwing, so check success to decide whether to close.
        if (!result || result.success) {
          setIsOpen(false);
        }
        // Switch failed — keep dropdown open so user can retry.
      } catch (err: unknown) {
        console.error('Profile switch failed:', err);
        Alert.alert('Could not switch profile', 'Please try again.');
        // Dropdown stays open for retry
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [activeProfileId, onSwitch]
  );

  if (profiles.length <= 1) return null;

  return (
    <View
      // On web, zIndex alone works. On Android, elevation is needed for z-ordering.
      style={Platform.select({
        web: { zIndex: 50 },
        android: { zIndex: 50, elevation: 10 },
        default: { zIndex: 50 },
      })}
    >
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        className="flex-row items-center bg-surface-elevated rounded-full px-3 py-1.5"
        style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
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
              // BUG-408: Use fixed offset instead of percentage — Android doesn't
              // resolve `top: '100%'` correctly in non-sized absolute parents.
              top: 40,
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
                  disabled={switching}
                  className={`px-4 py-3 flex-row items-center ${
                    isActive ? 'bg-primary-soft' : ''
                  } ${switching ? 'opacity-50' : ''}`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${profile.displayName}, ${roleLabel(
                    profile,
                    profiles
                  )}${isActive ? ', active' : ''}`}
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
                      {roleLabel(profile, profiles)}
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
