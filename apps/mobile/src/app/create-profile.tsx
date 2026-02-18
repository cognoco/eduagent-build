import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile, type Profile } from '../lib/profile';
import { useConsentCheck } from '../hooks/use-consent';
import { useThemeColors } from '../lib/theme';

type PersonaType = 'TEEN' | 'LEARNER' | 'PARENT';

const PERSONA_OPTIONS: { value: PersonaType; label: string }[] = [
  { value: 'TEEN', label: 'Teen' },
  { value: 'LEARNER', label: 'Learner' },
  { value: 'PARENT', label: 'Parent' },
];

type LocationValue = 'EU' | 'US' | 'OTHER';

const LOCATION_OPTIONS: { value: LocationValue; label: string }[] = [
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
  { value: 'OTHER', label: 'Other' },
];

export default function CreateProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { post } = useApi();
  const { switchProfile } = useProfile();

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [personaType, setPersonaType] = useState<PersonaType>('LEARNER');
  const [location, setLocation] = useState<'EU' | 'US' | 'OTHER' | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { required: consentRequired, consentType } = useConsentCheck(
    birthDate.trim() || null,
    location || null
  );

  const canSubmit = displayName.trim().length >= 1 && !loading;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or fewer.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        displayName: trimmedName,
        personaType,
      };
      if (birthDate.trim()) {
        body.birthDate = birthDate.trim();
      }
      if (location) {
        body.location = location;
      }

      const result = await post<{ profile: Profile }>('/profiles', body);
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      await switchProfile(result.profile.id);

      if (consentRequired && consentType) {
        router.replace({
          pathname: '/consent',
          params: { profileId: result.profile.id, consentType },
        });
      } else {
        router.back();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    canSubmit,
    displayName,
    birthDate,
    personaType,
    location,
    consentRequired,
    consentType,
    post,
    queryClient,
    switchProfile,
    router,
  ]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-h1 font-bold text-text-primary">
            New profile
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            testID="create-profile-cancel"
          >
            <Text className="text-body text-primary font-semibold">Cancel</Text>
          </Pressable>
        </View>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text
              className="text-danger text-body-sm"
              testID="create-profile-error"
            >
              {error}
            </Text>
          </View>
        )}

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Display name
        </Text>
        <TextInput
          className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
          placeholder="Enter name"
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={50}
          editable={!loading}
          testID="create-profile-name"
        />

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Birth date (optional)
        </Text>
        <TextInput
          className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={birthDate}
          onChangeText={setBirthDate}
          editable={!loading}
          testID="create-profile-birthdate"
        />

        <Text className="text-body-sm font-semibold text-text-secondary mb-2">
          Persona type
        </Text>
        <View className="flex-row mb-8">
          {PERSONA_OPTIONS.map((option) => {
            const isSelected = personaType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPersonaType(option.value)}
                className={`flex-1 py-3 items-center rounded-button mr-2 last:mr-0 ${
                  isSelected ? 'bg-primary' : 'bg-surface'
                }`}
                disabled={loading}
                testID={`persona-${option.value.toLowerCase()}`}
              >
                <Text
                  className={`text-body-sm font-semibold ${
                    isSelected ? 'text-text-inverse' : 'text-text-primary'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {birthDate.trim() !== '' && (
          <>
            <Text className="text-body-sm font-semibold text-text-secondary mb-2">
              Region
            </Text>
            <View className="flex-row mb-8">
              {LOCATION_OPTIONS.map((option) => {
                const isSelected = location === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setLocation(option.value)}
                    className={`flex-1 py-3 items-center rounded-button mr-2 last:mr-0 ${
                      isSelected ? 'bg-primary' : 'bg-surface'
                    }`}
                    disabled={loading}
                    testID={`location-${option.value.toLowerCase()}`}
                  >
                    <Text
                      className={`text-body-sm font-semibold ${
                        isSelected ? 'text-text-inverse' : 'text-text-primary'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          className={`rounded-button py-3.5 items-center ${
            canSubmit ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="create-profile-submit"
        >
          {loading ? (
            <ActivityIndicator
              color={colors.textInverse}
              testID="create-profile-loading"
            />
          ) : (
            <Text
              className={`text-body font-semibold ${
                canSubmit ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              Create profile
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
