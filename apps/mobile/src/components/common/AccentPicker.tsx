import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Persona } from '../../lib/theme';
import { useThemeColors } from '../../lib/theme';
import { accentPresets } from '../../lib/design-tokens';

interface AccentPickerProps {
  persona: Persona;
  accentPresetId: string | null;
  setAccentPresetId: (id: string | null) => void;
}

/**
 * Row of accent color swatches for the given persona.
 * Tap a swatch to change the app's accent color.
 * Shows a checkmark on the active selection.
 */
export function AccentPicker({
  persona,
  accentPresetId,
  setAccentPresetId,
}: AccentPickerProps): React.ReactElement {
  const colors = useThemeColors();
  const presets = accentPresets[persona];
  const defaultId = presets[0]?.id ?? null;
  const activeId = accentPresetId ?? defaultId;

  return (
    <View testID="accent-picker">
      <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
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
                style={
                  isActive
                    ? {
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: 3,
                        borderColor: preset.swatch,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    : {
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: 3,
                        borderColor: 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                }
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: preset.swatch,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.surface}
                    />
                  )}
                </View>
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
