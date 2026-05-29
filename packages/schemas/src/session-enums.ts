import { z } from 'zod';

// Engagement signal — parent-facing session recap classification.
// Canonical source for all engagement signal values used by API (session-highlights)
// and mobile (EngagementChip). Do not redefine these locally.
//
// These enums live in their own leaf module (importing only zod) so that both
// sessions.ts and progress.ts can consume them without creating a circular
// import. sessions.ts imports celebration schemas from progress.ts; if progress.ts
// also imported these enums from sessions.ts the cycle would leave
// engagementSignalSchema undefined at module-eval time. Keep this file dependency-free.
export const ENGAGEMENT_SIGNALS = [
  'curious',
  'stuck',
  'breezing',
  'focused',
  'scattered',
] as const;

export const engagementSignalSchema = z.enum(ENGAGEMENT_SIGNALS);
export type EngagementSignal = z.infer<typeof engagementSignalSchema>;

export const sessionTypeSchema = z.enum([
  'learning',
  'homework',
  'interleaved',
]);
export type SessionType = z.infer<typeof sessionTypeSchema>;
