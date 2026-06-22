import type { ReactElement } from 'react';

import { ErrorFallback } from './ErrorFallback';

interface EmptyStateCardAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

interface EmptyStateCardProps {
  title: string;
  message: string;
  primaryAction: EmptyStateCardAction;
  /** Optional secondary action (e.g. go back) so the empty state isn't a dead end. */
  secondaryAction?: EmptyStateCardAction;
  variant?: 'card' | 'centered';
  testID?: string;
}

export function EmptyStateCard({
  title,
  message,
  primaryAction,
  secondaryAction,
  variant = 'card',
  testID,
}: EmptyStateCardProps): ReactElement {
  return (
    <ErrorFallback
      title={title}
      message={message}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      variant={variant}
      testID={testID}
    />
  );
}
