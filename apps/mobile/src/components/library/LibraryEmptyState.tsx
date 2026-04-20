import React from 'react';
import { Pressable, Text, View } from 'react-native';

type LibraryEmptyStateProps =
  | {
      variant: 'no-results';
      entityName: string; // "shelves" | "books" | "topics"
      onClear: () => void;
      clearLabel?: string; // defaults to "Clear search"
      message?: string; // overrides default "No {entityName} match your search"
    }
  | {
      variant: 'no-content';
      onAddSubject: () => void;
    };

export function LibraryEmptyState(
  props: LibraryEmptyStateProps
): React.ReactElement {
  if (props.variant === 'no-results') {
    return (
      <View
        className="bg-surface rounded-card px-4 py-6 items-center"
        testID="library-no-results"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {props.message ?? }
        </Text>
        <Pressable
          onPress={props.onClear}
          className="bg-surface-elevated rounded-button px-5 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={props.clearLabel ?? 'Clear search'}
          testID="library-clear-search"
        >
          <Text className="text-body font-semibold text-primary">
            {props.clearLabel ?? 'Clear search'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="bg-surface rounded-card px-4 py-6 items-center"
      testID="library-no-content"
    >
      <Text className="text-body text-text-secondary text-center mb-4">
        Add a subject to start building your library
      </Text>
      <Pressable
        onPress={props.onAddSubject}
        className="bg-primary rounded-button px-5 py-3 items-center"
        accessibilityRole="button"
        accessibilityLabel="Add Subject"
        testID="library-add-subject-empty"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Add Subject
        </Text>
      </Pressable>
    </View>
  );
}
