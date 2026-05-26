import type {
  PreviewOnboardingStateV0,
  SaveTarget,
} from '../../../lib/preview-onboarding-state';

export type WizardStep = 1 | 2 | 3;

export interface TargetOption {
  target: SaveTarget;
  label: string;
  testID: string;
}

export const SAVE_TARGETS: ReadonlyArray<TargetOption> = [
  { target: 'self', label: 'My learning', testID: 'save-target-self' },
  {
    target: 'child',
    label: "My child's learning",
    testID: 'save-target-child',
  },
  { target: 'both', label: 'Both', testID: 'save-target-both' },
];

export function defaultTargetFor(
  state: PreviewOnboardingStateV0 | null,
): SaveTarget | null {
  if (!state) return null;
  switch (state.intent) {
    case 'self':
      return 'self';
    case 'child':
      return 'child';
    case 'both':
      return 'both';
    case 'not_sure':
      return null; // ask explicitly per spec Routing And Landing Rules
  }
}
