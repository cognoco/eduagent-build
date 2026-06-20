import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { useScopeContext } from '../../lib/scope-context';

function scopeOptionKey(scope: ScopeDescriptor): string {
  switch (scope.kind) {
    case 'supporter-hub':
      return 'supporter-hub';
    case 'me':
      return 'me';
    case 'person':
      return `person-${scope.personId}`;
  }
}

function scopeLabel(
  scope: ScopeDescriptor,
  labels: { supportHub: string; me: string },
): string {
  switch (scope.kind) {
    case 'supporter-hub':
      return labels.supportHub;
    case 'me':
      return labels.me;
    case 'person':
      return scope.displayName;
  }
}

function sameScope(left: ScopeDescriptor, right: ScopeDescriptor): boolean {
  return scopeOptionKey(left) === scopeOptionKey(right);
}

export function ScopeChip(): React.ReactElement | null {
  const { t } = useTranslation();
  const { scopeList, availableScopes, activeScope, setActiveScope } =
    useScopeContext();
  const labels = {
    supportHub: t('scopeChip.supportHub'),
    me: t('scopeChip.me'),
  };

  if (scopeList.shape !== 'supporter' || availableScopes.length === 0) {
    return null;
  }

  return (
    <View
      testID="scope-chip"
      accessibilityRole="tablist"
      className="max-w-[260px] flex-row items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm"
    >
      {availableScopes.map((scope) => {
        const selected = sameScope(scope, activeScope);
        const label = scopeLabel(scope, labels);
        return (
          <Pressable
            key={scopeOptionKey(scope)}
            testID={`scope-chip-option-${scopeOptionKey(scope)}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => setActiveScope(scope)}
            className={`min-h-9 max-w-[150px] items-center justify-center rounded-full px-3 ${
              selected ? 'bg-primary' : 'bg-transparent'
            }`}
          >
            <Text
              numberOfLines={1}
              className={`text-body-sm font-semibold ${
                selected ? 'text-on-primary' : 'text-text-secondary'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
