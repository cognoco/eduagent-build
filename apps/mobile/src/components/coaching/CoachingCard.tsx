import { type ReactNode } from 'react';
import { BaseCoachingCard } from './BaseCoachingCard';

interface CoachingCardProps {
  headline: string;
  subtext?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  isLoading?: boolean;
}

export function CoachingCard({
  headline,
  subtext,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  isLoading,
}: CoachingCardProps): ReactNode {
  return (
    <BaseCoachingCard
      headline={headline}
      subtext={subtext}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      secondaryLabel={secondaryLabel}
      onSecondary={onSecondary}
      isLoading={isLoading}
      testID="coaching-card"
    />
  );
}
