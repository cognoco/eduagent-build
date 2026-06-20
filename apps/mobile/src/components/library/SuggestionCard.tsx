import { Pressable, Text } from 'react-native';
import type { SubjectTint } from '../../lib/design-tokens';

interface SuggestionCardProps {
  title: string;
  emoji?: string | null;
  description?: string | null;
  tint?: SubjectTint;
  onPress: () => void;
  testID?: string;
  /**
   * Localized "Add to shelf" label. When provided, the card shows an explicit
   * add affordance. These cards surface books the learner does NOT own yet, so
   * the affordance keeps them visually distinct from owned BookCards (which
   * show "In progress" / "Not started" status). Passed from the parent so this
   * component stays presentational (no i18n/theme hooks).
   */
  addLabel?: string;
}

export function SuggestionCard({
  title,
  emoji,
  description,
  tint,
  onPress,
  testID,
  addLabel,
}: SuggestionCardProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      className="flex-1 min-w-[140px] max-w-[48%] rounded-card border border-border bg-surface-elevated p-4"
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        ...(tint
          ? {
              borderColor: tint.solid,
              backgroundColor: tint.soft,
            }
          : {}),
      })}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        addLabel
          ? `${addLabel}: ${title}${description ? `. ${description}` : ''}`
          : description
            ? `${title}: ${description}`
            : title
      }
    >
      {emoji ? <Text className="text-2xl mb-2">{emoji}</Text> : null}
      <Text
        className="text-body-sm font-semibold text-text-primary"
        numberOfLines={3}
      >
        {title}
      </Text>
      {description ? (
        <Text
          className="text-caption text-text-secondary mt-1"
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}
      {addLabel ? (
        <Text className="text-caption font-semibold text-primary mt-3">
          + {addLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}
