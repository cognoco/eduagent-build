import {
  notificationPayloadSchema,
  nudgeCreateSchema,
  nudgeDirectionSchema,
} from './notifications.js';

const PROFILE_A = '01914d6a-0000-7000-8000-000000000001';
const PROFILE_B = '01914d6a-0000-7000-8000-000000000002';
const NUDGE_ID = '01914d6a-0000-7000-8000-000000000003';

describe('nudgeDirectionSchema', () => {
  it('supports guardian-to-learner and learner-to-guardian directions', () => {
    expect(nudgeDirectionSchema.options).toEqual([
      'guardian_to_learner',
      'learner_to_guardian',
    ]);
  });
});

describe('nudgeCreateSchema', () => {
  it('keeps existing guardian-to-learner clients working by defaulting direction', () => {
    expect(
      nudgeCreateSchema.parse({
        toProfileId: PROFILE_B,
        template: 'you_got_this',
      }),
    ).toEqual({
      toProfileId: PROFILE_B,
      template: 'you_got_this',
      direction: 'guardian_to_learner',
    });
  });

  it('accepts fixed learner-to-guardian templates', () => {
    expect(
      nudgeCreateSchema.parse({
        toProfileId: PROFILE_A,
        template: 'need_help',
        direction: 'learner_to_guardian',
      }),
    ).toEqual({
      toProfileId: PROFILE_A,
      template: 'need_help',
      direction: 'learner_to_guardian',
    });
  });

  it('rejects learner-to-guardian sends with guardian-only templates', () => {
    expect(
      nudgeCreateSchema.safeParse({
        toProfileId: PROFILE_A,
        template: 'you_got_this',
        direction: 'learner_to_guardian',
      }).success,
    ).toBe(false);
  });

  it('rejects guardian-to-learner sends with learner-only templates', () => {
    expect(
      nudgeCreateSchema.safeParse({
        toProfileId: PROFILE_B,
        template: 'thanks',
        direction: 'guardian_to_learner',
      }).success,
    ).toBe(false);
  });
});

describe('notificationPayloadSchema nudge data', () => {
  const basePayload = {
    profileId: PROFILE_A,
    title: 'Your learner sent you a nudge',
    body: 'I need help',
    type: 'nudge' as const,
    data: {
      nudgeId: NUDGE_ID,
      fromProfileId: PROFILE_B,
      toProfileId: PROFILE_A,
      direction: 'learner_to_guardian' as const,
      templateKey: 'need_help' as const,
    },
  };

  it('accepts template-key-only nudge payload data with typed IDs', () => {
    expect(notificationPayloadSchema.safeParse(basePayload).success).toBe(true);
  });

  it('rejects child-authored free text in nudge payload data', () => {
    expect(
      notificationPayloadSchema.safeParse({
        ...basePayload,
        data: {
          ...basePayload.data,
          childMessage: 'Can you help me with fractions?',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects display names in nudge payload data', () => {
    expect(
      notificationPayloadSchema.safeParse({
        ...basePayload,
        data: {
          ...basePayload.data,
          fromDisplayName: 'Child Name',
        },
      }).success,
    ).toBe(false);
  });
});
