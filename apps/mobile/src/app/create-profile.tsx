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
  Modal,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile, type Profile } from '../lib/profile';
import { checkConsentRequirement } from '../hooks/use-consent';
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

function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function detectPersona(birthDate: Date): PersonaType {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  if (age < 13) return 'TEEN';
  if (age < 18) return 'LEARNER';
  return 'PARENT';
}

const MAX_DATE = new Date();
const MIN_DATE = new Date(
  MAX_DATE.getFullYear() - 100,
  MAX_DATE.getMonth(),
  MAX_DATE.getDate()
);

export default function CreateProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { switchProfile } = useProfile();

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [personaType, setPersonaType] = useState<PersonaType>('LEARNER');
  const [personaAutoDetected, setPersonaAutoDetected] = useState(false);
  const [location, setLocation] = useState<'EU' | 'US' | 'OTHER' | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const birthDateString = birthDate ? formatDateForApi(birthDate) : null;

  const { required: consentRequired, consentType } = checkConsentRequirement(
    birthDateString,
    location || null
  );

  const onDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        setBirthDate(selectedDate);
        const detected = detectPersona(selectedDate);
        setPersonaType(detected);
        setPersonaAutoDetected(true);
      }
    },
    []
  );

  const canSubmit =
    displayName.trim().length >= 1 && birthDate !== null && !loading;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !birthDate) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length > 50) {
      setError('Display name must be 50 characters or fewer.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const body: {
        displayName: string;
        personaType?: PersonaType;
        birthDate?: string;
        location?: string;
      } = {
        displayName: trimmedName,
        personaType,
        birthDate: formatDateForApi(birthDate),
      };
      if (location) {
        body.location = location;
      }

      const res = await client.profiles.$post({ json: body });
      const result = (await res.json()) as { profile: Profile };
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
    client,
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
          Birth date
        </Text>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          className="bg-surface rounded-input px-4 py-3 mb-2"
          disabled={loading}
          accessibilityLabel="Select birth date"
          testID="create-profile-birthdate"
        >
          <Text
            className={birthDate ? 'text-text-primary text-body' : 'text-body'}
            style={birthDate ? undefined : { color: colors.muted }}
          >
            {birthDate
              ? formatDateForDisplay(birthDate)
              : 'Select date of birth'}
          </Text>
        </Pressable>

        {Platform.OS === 'ios' && showDatePicker && (
          <Modal transparent animationType="slide" testID="date-picker-modal">
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-surface rounded-t-2xl pb-8">
                <View className="flex-row justify-end px-4 pt-3 pb-1">
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
                    accessibilityLabel="Close date picker"
                    testID="date-picker-done"
                  >
                    <Text className="text-primary text-body font-semibold">
                      Done
                    </Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={birthDate ?? new Date(2010, 0, 1)}
                  mode="date"
                  display="spinner"
                  maximumDate={MAX_DATE}
                  minimumDate={MIN_DATE}
                  onChange={onDateChange}
                  testID="date-picker"
                />
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={birthDate ?? new Date(2010, 0, 1)}
            mode="date"
            display="default"
            maximumDate={MAX_DATE}
            minimumDate={MIN_DATE}
            onChange={onDateChange}
            testID="date-picker"
          />
        )}

        {Platform.OS === 'web' && showDatePicker && (
          <View className="mb-2">
            <DateTimePicker
              value={birthDate ?? new Date(2010, 0, 1)}
              mode="date"
              display="default"
              maximumDate={MAX_DATE}
              minimumDate={MIN_DATE}
              onChange={onDateChange}
              testID="date-picker"
            />
          </View>
        )}

        {personaAutoDetected && birthDate && (
          <Text
            className="text-body-sm text-text-secondary mb-4"
            testID="persona-auto-hint"
          >
            Based on your age, we set your profile type to{' '}
            {personaType === 'TEEN'
              ? 'Teen'
              : personaType === 'LEARNER'
              ? 'Learner'
              : 'Parent'}
            . You can change it below.
          </Text>
        )}

        {!personaAutoDetected && !birthDate && <View className="h-2" />}

        <Text className="text-body-sm font-semibold text-text-secondary mb-2">
          Profile type
        </Text>
        <View className="flex-row mb-8">
          {PERSONA_OPTIONS.map((option) => {
            const isSelected = personaType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setPersonaType(option.value);
                  setPersonaAutoDetected(false);
                }}
                className={`flex-1 py-3 items-center rounded-button mr-2 last:mr-0 ${
                  isSelected ? 'bg-primary' : 'bg-surface'
                }`}
                disabled={loading}
                accessibilityLabel={`Select ${option.label} profile type`}
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

        {birthDate !== null && (
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
