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
  variant?: 'card' | 'centered';
  testID?: string;
}

export function EmptyStateCard({
  title,
  message,
  primaryAction,
  variant = 'card',
  testID,
}: EmptyStateCardProps): ReactElement {
  return (
    <ErrorFallback
      title={title}
      message={message}
      primaryAction={primaryAction}
      variant={variant}
      testID={testID}
    />
  );
}
