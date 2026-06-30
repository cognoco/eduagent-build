import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { DeskLampAnimation } from '../common/DeskLampAnimation';
import { MagicPenAnimation } from '../common/MagicPenAnimation';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

export function PersonScopeJournalPlaceholder({
  scope,
}: {
  scope: PersonScope;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      testID="person-scope-journal-placeholder"
      className="flex-1 bg-background px-5 py-4"
    >
      <Text className="text-h2 font-semibold text-text-primary">
        {scope.displayName}
      </Text>
      <View className="mt-4 rounded-card border border-border bg-surface p-5">
        <View
          className="h-[148px] items-center justify-center"
          pointerEvents="none"
        >
          <DeskLampAnimation
            size={118}
            testID="person-scope-journal-empty-lamp"
          />
          <View className="absolute bottom-0 right-5">
            <MagicPenAnimation
              size={68}
              testID="person-scope-journal-empty-pen"
            />
          </View>
        </View>
        <Text className="mt-3 text-center text-h3 font-semibold text-text-primary">
          {t('supportHub.journal.personPlaceholderTitle')}
        </Text>
        <Text className="mt-2 text-center text-body text-text-secondary">
          {t('supportHub.journal.emptyMessage', { name: scope.displayName })}
        </Text>
        <Text className="mt-2 text-center text-caption text-text-secondary">
          {t('supportHub.journal.personPlaceholderMessage')}
        </Text>
      </View>
    </View>
  );
}
