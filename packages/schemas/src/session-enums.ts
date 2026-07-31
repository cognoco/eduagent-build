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

/** Active app nav shell (WI-2220). V1 maps to 'v0' client-side — see
 *  apps/api/src/services/app-help-map.ts for the shell-to-map contract.
 *
 *  [WI-2472] Lives here rather than in sessions.ts so assessments.ts can
 *  consume it too: sessions.ts already imports verificationTypeSchema from
 *  assessments.ts, so importing back from sessions.ts would close a cycle and
 *  leave one of the two schemas undefined at module-eval time. sessions.ts
 *  re-exports it below, so existing `from './sessions'` consumers and the
 *  package barrel are unaffected. */
export const appShellSchema = z.enum(['v0', 'v2']);
export type AppShell = z.infer<typeof appShellSchema>;
