import type { AccommodationMode } from '@eduagent/schemas';

export interface AccommodationOption {
  mode: AccommodationMode;
  title: string;
  description: string;
}

export const ACCOMMODATION_OPTIONS: AccommodationOption[] = [
  {
    mode: 'none',
    title: 'None',
    description: 'Standard learning experience',
  },
  {
    mode: 'short-burst',
    title: 'Short-Burst',
    description: 'Shorter explanations and frequent breaks',
  },
  {
    mode: 'audio-first',
    title: 'Audio-First',
    description: 'Voice-driven learning with less text',
  },
  {
    mode: 'predictable',
    title: 'Predictable',
    description: 'Consistent structure and clear expectations',
  },
];

export interface AccommodationGuideRow {
  condition: string;
  recommendation: AccommodationMode;
}

export const ACCOMMODATION_GUIDE: AccommodationGuideRow[] = [
  {
    condition: 'Loses focus after 10 minutes',
    recommendation: 'short-burst',
  },
  {
    condition: 'Prefers listening over reading',
    recommendation: 'audio-first',
  },
  {
    condition: 'Gets anxious with surprises or open-ended tasks',
    recommendation: 'predictable',
  },
  {
    condition: 'None of the above',
    recommendation: 'none',
  },
];
