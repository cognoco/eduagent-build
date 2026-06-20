import React from 'react';

import { JournalTabView } from '../../../components/journal/JournalTabView';
import {
  PersonScopeJournalPlaceholder,
  SupportHubJournalTab,
} from '../../../components/support';
import { useScopeContext } from '../../../lib/scope-context';

export default function JournalScreen(): React.ReactElement {
  const { activeScope, availableScopes } = useScopeContext();

  if (activeScope.kind === 'supporter-hub') {
    return (
      <SupportHubJournalTab
        personScopes={availableScopes.filter(
          (scope) => scope.kind === 'person',
        )}
      />
    );
  }

  if (activeScope.kind === 'person') {
    return <PersonScopeJournalPlaceholder scope={activeScope} />;
  }

  return <JournalTabView />;
}
