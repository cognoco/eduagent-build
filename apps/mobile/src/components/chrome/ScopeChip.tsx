import { Pressable, ScrollView, Text, View } from 'react-native';
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
  const {
    scopeList,
    availableScopes,
    activeScope,
    isActiveScopePersisted,
    setActiveScope,
  } = useScopeContext();
  const labels = {
    supportHub: t('scopeChip.supportHub'),
    me: t('scopeChip.me'),
  };

  if (scopeList.shape !== 'supporter' || availableScopes.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="scope-chip"
      accessibilityRole="tablist"
      className="max-w-[260px] rounded-full border border-border bg-surface shadow-sm"
      contentContainerClassName="items-center gap-1 p-1"
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
            className={`min-h-11 min-w-11 max-w-[150px] items-center justify-center rounded-full px-3 ${
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
      {process.env.EXPO_PUBLIC_E2E === 'true' && isActiveScopePersisted && (
        <View
          accessible
          collapsable={false}
          pointerEvents="none"
          testID={`scope-chip-persisted-${scopeOptionKey(activeScope)}`}
          style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 2,
            height: 2,
          }}
        />
      )}
    </ScrollView>
  );
}
