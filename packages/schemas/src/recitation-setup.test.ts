import {
  recitationSetupActionSchema,
  recitationSetupStateSchema,
} from './recitation-setup.js';

describe('recitation setup schemas', () => {
  it('accepts the bounded server-owned state and action vocabulary', () => {
    expect(
      recitationSetupStateSchema.parse({
        phase: 'awaiting_selection',
        clarificationCount: 1,
      }),
    ).toEqual({ phase: 'awaiting_selection', clarificationCount: 1 });
    expect(recitationSetupActionSchema.parse('invite_to_begin')).toBe(
      'invite_to_begin',
    );
  });

  it('rejects unbounded or unknown persisted values', () => {
    expect(
      recitationSetupStateSchema.safeParse({
        phase: 'ready',
        clarificationCount: 2,
      }).success,
    ).toBe(false);
    expect(recitationSetupActionSchema.safeParse('retry_forever').success).toBe(
      false,
    );
  });
});
