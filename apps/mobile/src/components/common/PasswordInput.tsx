import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useThemeColors } from '../../lib/theme';

interface PasswordInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  testID?: string;
  /** Show "At least 8 characters" hint below the input */
  showRequirements?: boolean;
}

export function PasswordInput({
  value,
  onChangeText,
  placeholder = 'Enter password',
  editable = true,
  testID,
  showRequirements = false,
}: PasswordInputProps) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  const meetsLength = value.length >= 8;

  return (
    <View>
      <View className="flex-row items-center bg-surface rounded-input">
        <TextInput
          className="flex-1 text-text-primary text-body px-4 py-3"
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          autoCapitalize="none"
          autoComplete="password"
          testID={testID}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          className="px-3 min-h-[44px] justify-center"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityRole="button"
          testID={testID ? `${testID}-toggle` : 'password-toggle'}
        >
          <Text className="text-body-sm font-semibold text-primary">
            {visible ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      </View>
      {showRequirements && (
        <Text
          className={`text-xs mt-1 ${
            meetsLength ? 'text-success' : 'text-text-secondary'
          }`}
          testID={testID ? `${testID}-hint` : 'password-hint'}
        >
          At least 8 characters
        </Text>
      )}
    </View>
  );
}
