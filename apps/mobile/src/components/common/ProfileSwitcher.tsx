import { useState, useCallback, useRef, type ReactNode } from 'react';
import { View, Text, Pressable, Platform, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Profile } from '@eduagent/schemas';
import type { TFunction } from 'i18next';
import { isGuardianProfile } from '../../lib/profile';
import { platformAlert } from '../../lib/platform-alert';

/** Derive a user-facing role label from profile ownership.
 * A guardian is an account owner with linked child profiles.
 * Everyone else (including adult self-learners) shows as "Student". */
function roleLabel(
  profile: { isOwner: boolean },
  allProfiles: ReadonlyArray<{ isOwner: boolean }>,
  t: TFunction,
): string {
  return isGuardianProfile(profile, allProfiles)
    ? t('profileSwitcher.roleParent')
    : t('profileSwitcher.roleStudent');
}

/** Derive up-to-2-char uppercase initials. Null-safe: a missing/blank
 * displayName falls back to '?' instead of throwing on `.split(' ').map(w[0])`
 * (the empty-string case yields `[undefined]` → `.toUpperCase()` on undefined). */
function deriveInitials(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return '?';
  return (
    trimmed
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const initials = deriveInitials(activeProfile?.displayName);

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
        platformAlert(
          t('profileSwitcher.switchErrorTitle'),
          t('common.pleaseTryAgain'),
        );
        // Dropdown stays open for retry
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [activeProfileId, onSwitch, t],
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
        accessibilityLabel={t('profileSwitcher.a11yChip', {
          name: activeProfile?.displayName ?? t('profileSwitcher.fallbackName'),
        })}
        accessibilityState={{ expanded: isOpen }}
        testID="profile-switcher-chip"
      >
        <View className="w-7 h-7 rounded-full bg-primary items-center justify-center me-2">
          <Text className="text-text-inverse text-caption font-bold">
            {initials}
          </Text>
        </View>
        <Text className="text-body-sm font-medium text-text-primary me-1">
          {activeProfile?.displayName ?? t('profileSwitcher.fallbackName')}
        </Text>
        <Text className="text-text-secondary text-caption">
          {isOpen ? '\u25B2' : '\u25BC'}
        </Text>
      </Pressable>

      {/* [#9] Render the menu in a Modal/portal so it escapes any clipping
          parent (header / ScrollView / overflow:hidden). The previous in-flow
          absolutely-positioned dropdown was clipped to invisible/cut-off inside
          a scrolling header on web/Android. The Modal backdrop reliably covers
          the whole viewport and outside-tap still closes. */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        accessibilityViewIsModal
      >
        {/* Guard the body on isOpen as well: at runtime Modal already gates on
            `visible`, but this also ensures nothing renders when closed under
            test renderers whose Modal mock ignores `visible`. */}
        {isOpen ? (
          /* Backdrop — fills the viewport; tap outside the menu to close. */
          <Pressable
            onPress={() => setIsOpen(false)}
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={t('profileSwitcher.a11yClose')}
            testID="profile-switcher-backdrop"
          >
            {/* Menu anchored to the top-right, near the chip. The inner View
              swallows presses so a tap on the menu doesn't close it.
              onStartShouldSetResponder stops touch propagation to the
              backdrop without requiring an empty onPress handler. */}
            <View
              style={{
                position: 'absolute',
                top: Platform.OS === 'ios' ? 96 : 56,
                right: 12,
              }}
            >
              <View
                className="bg-surface-elevated rounded-card shadow-lg"
                style={{
                  minWidth: 200,
                  ...Platform.select({
                    android: { elevation: 8 },
                    default: {},
                  }),
                }}
                testID="profile-switcher-menu"
                onStartShouldSetResponder={() => true}
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
                      accessibilityLabel={
                        isActive
                          ? t('profileSwitcher.a11yOptionActive', {
                              name: profile.displayName,
                              role: roleLabel(profile, profiles, t),
                            })
                          : t('profileSwitcher.a11yOption', {
                              name: profile.displayName,
                              role: roleLabel(profile, profiles, t),
                            })
                      }
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
                            isActive
                              ? 'text-text-inverse'
                              : 'text-text-secondary'
                          }`}
                        >
                          {deriveInitials(profile.displayName)}
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
                          {roleLabel(profile, profiles, t)}
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
            </View>
          </Pressable>
        ) : null}
      </Modal>
    </View>
  );
}
