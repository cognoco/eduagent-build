import { Pressable, Text, View } from 'react-native';

interface ErrorFallbackAction {
  label: string;
  onPress: () => void;
  testID?: string;
  /** When true, the button is non-interactive and visually dimmed. */
  disabled?: boolean;
}

interface ErrorFallbackProps {
  /** Heading text. */
  title?: string;
  /** Body text shown below the title. */
  message?: string;
  /** Primary action button (e.g., retry). */
  primaryAction?: ErrorFallbackAction;
  /** Secondary action button (e.g., go back / go home). */
  secondaryAction?: ErrorFallbackAction;
  /**
   * Visual variant.
   * - `"card"` — coaching-card background, left-aligned (use inline in ScrollViews)
   * - `"centered"` — transparent, center-aligned (use for full-screen error states)
   */
  variant?: 'card' | 'centered';
  testID?: string;
}

export function ErrorFallback({
  title = 'Something went wrong',
  message = 'Check your connection and try again.',
  primaryAction,
  secondaryAction,
  variant = 'card',
  testID,
}: ErrorFallbackProps): React.ReactElement {
  const isCard = variant === 'card';

  return (
    <View
      className={
        isCard
          ? 'bg-coaching-card rounded-card p-5'
          : 'flex-1 items-center justify-center px-6'
      }
      testID={testID}
    >
      <Text
        className={
          isCard
            ? 'text-h3 font-semibold text-text-primary'
            : 'text-h3 font-semibold text-text-primary text-center mb-2'
        }
      >
        {title}
      </Text>
      <Text
        className={
          isCard
            ? 'text-body text-text-secondary mt-2'
            : 'text-body text-text-secondary text-center mb-6'
        }
      >
        {message}
      </Text>
      {(primaryAction || secondaryAction) && (
        <View className={isCard ? 'flex-row gap-3 mt-4' : 'flex-row gap-3'}>
          {primaryAction ? (
            <Pressable
              onPress={primaryAction.onPress}
              disabled={primaryAction.disabled}
              className={
                isCard
                  ? `bg-primary rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center${
                      primaryAction.disabled ? ' opacity-50' : ''
                    }`
                  : `bg-primary rounded-button px-6 py-3 items-center flex-1 min-h-[48px] justify-center${
                      primaryAction.disabled ? ' opacity-50' : ''
                    }`
              }
              accessibilityRole="button"
              accessibilityLabel={primaryAction.label}
              accessibilityState={{ disabled: primaryAction.disabled }}
              testID={primaryAction.testID}
            >
              <Text className="text-body font-semibold text-text-inverse">
                {primaryAction.label}
              </Text>
            </Pressable>
          ) : null}
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              className={
                isCard
                  ? 'bg-surface rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center'
                  : 'bg-surface rounded-button px-6 py-3 items-center flex-1 min-h-[48px] justify-center'
              }
              accessibilityRole="button"
              accessibilityLabel={secondaryAction.label}
              testID={secondaryAction.testID}
            >
              <Text className="text-body font-semibold text-text-primary">
                {secondaryAction.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
