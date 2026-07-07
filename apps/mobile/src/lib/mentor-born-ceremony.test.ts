import {
  __resetMentorBornCeremonyForTests,
  completeMentorBornCeremony,
  getMentorBornCeremonySnapshot,
  requestMentorBornCeremony,
} from './mentor-born-ceremony';

describe('mentor-born ceremony requests', () => {
  beforeEach(() => {
    __resetMentorBornCeremonyForTests();
  });

  it('requests the ceremony once per learner profile', () => {
    const first = requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    expect(first).toMatchObject({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });
    expect(getMentorBornCeremonySnapshot().requestCount).toBe(1);

    if (!first) throw new Error('expected first ceremony request');
    completeMentorBornCeremony(first.id);

    const duplicate = requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    expect(duplicate).toBeNull();
    expect(getMentorBornCeremonySnapshot()).toMatchObject({
      activeRequest: null,
      requestCount: 1,
      requestedProfileIds: ['learner-1'],
    });
  });

  it('allows a different learner profile to receive its own first ceremony', () => {
    const first = requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    if (!first) throw new Error('expected first ceremony request');
    completeMentorBornCeremony(first.id);

    requestMentorBornCeremony({
      profileId: 'learner-2',
      reason: 'first-profile-created',
    });

    expect(getMentorBornCeremonySnapshot()).toMatchObject({
      activeRequest: {
        profileId: 'learner-2',
        reason: 'first-profile-created',
      },
      requestCount: 2,
      requestedProfileIds: ['learner-1', 'learner-2'],
    });
  });
});
