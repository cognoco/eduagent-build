import { z } from 'zod';

export const RECITATION_SETUP_ACTIONS = [
  'clarify_selection',
  'invite_to_begin',
  'invite_after_cap',
  'invite_recitation',
  'clarify_edit',
  'handle_non_recitation',
  'coach_recitation',
  'leave_recitation',
] as const;

export const recitationSetupActionSchema = z.enum(RECITATION_SETUP_ACTIONS);
export type RecitationSetupAction = z.infer<typeof recitationSetupActionSchema>;

export const recitationSetupStateSchema = z.object({
  phase: z.enum(['awaiting_selection', 'ready']),
  clarificationCount: z.union([z.literal(0), z.literal(1)]),
});
export type RecitationSetupState = z.infer<typeof recitationSetupStateSchema>;

export interface RecitationSetupTransition {
  action: RecitationSetupAction;
  state: RecitationSetupState;
}
