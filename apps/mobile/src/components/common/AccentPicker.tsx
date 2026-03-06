import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { accentPresets } from '../../lib/design-tokens';

/**
 * Row of accent color swatches for the current persona.
 * Tap a swatch to change the app's accent color.
 * Shows a checkmark on the active selection.
 */
export function AccentPicker(): React.ReactElement {
  const { persona, accentPresetId, setAccentPresetId } = useTheme();
  const presets = accentPresets[persona];
  const defaultId = presets[0]?.id ?? null;
  const activeId = accentPresetId ?? defaultId;

  return (
    <View testID="accent-picker">
      <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
        Accent Color
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {presets.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <Pressable
              key={preset.id}
              onPress={() =>
                setAccentPresetId(preset.id === defaultId ? null : preset.id)
              }
              accessibilityLabel={`${preset.label} accent color${
                isActive ? ', selected' : ''
              }`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              testID={`accent-swatch-${preset.id}`}
              className="items-center"
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: preset.swatch,
                  borderWidth: isActive ? 3 : 0,
                  borderColor: isActive ? 'rgba(255,255,255,0.9)' : undefined,
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Outer ring for active state
                  shadowColor: isActive ? preset.swatch : 'transparent',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isActive ? 0.4 : 0,
                  shadowRadius: 6,
                  elevation: isActive ? 4 : 0,
                }}
              >
                {isActive && (
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                )}
              </View>
              <Text className="text-caption text-text-secondary mt-1">
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
