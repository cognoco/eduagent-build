import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MentorNoticePolicyObservation } from '@eduagent/schemas';

import { MENTOR_NOTICE_POLICY_STATE_KEY_PREFIX } from './secure-store-keys';
import {
  MENTOR_NOTICE_POLICY_BOOTSTRAP,
  noticesSuppressedForPayload,
  observationSignal,
  reduceMentorNoticePolicy,
  resetMentorNoticePolicyStoreForTests,
  storedSignal,
  useMentorNoticePolicy,
  type MentorNoticePolicyState,
} from './mentor-notice-policy';

function observation(
  revision: number,
  enabled: boolean,
): MentorNoticePolicyObservation {
  return {
    rolloutRevision: revision,
    rolloutEnabled: enabled,
    projectionEpoch: `notice-policy-v1:r${revision}:${
      enabled ? 'on' : 'off'
    }:self:consented`,
  };
}

/** Fold a sequence of wire observations in from the bootstrap. */
function fold(
  sequence: (MentorNoticePolicyObservation | undefined | unknown)[],
  from: MentorNoticePolicyState = MENTOR_NOTICE_POLICY_BOOTSTRAP,
): MentorNoticePolicyState {
  return sequence.reduce<MentorNoticePolicyState>(
    (state, next) => reduceMentorNoticePolicy(state, observationSignal(next)),
    from,
  );
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe('reduceMentorNoticePolicy — monotonicity', () => {
  it('ignores an observation at a LOWER revision', () => {
    const at7 = fold([observation(7, true)]);

    expect(
      reduceMentorNoticePolicy(at7, observationSignal(observation(6, false))),
    ).toBe(at7);
    expect(
      reduceMentorNoticePolicy(at7, observationSignal(observation(6, true))),
    ).toBe(at7);
  });

  it('lets DISABLED win at the SAME revision', () => {
    expect(fold([observation(7, true), observation(7, false)])).toEqual({
      revision: 7,
      enabled: false,
    });
    // ...and the reverse arrival order lands in the same place.
    expect(fold([observation(7, false), observation(7, true)])).toEqual({
      revision: 7,
      enabled: false,
    });
  });

  it('requires a STRICTLY HIGHER revision to re-enable', () => {
    const disabledAt7 = fold([observation(7, true), observation(7, false)]);

    // Same revision, enabled — refused.
    expect(fold([observation(7, true)], disabledAt7)).toEqual({
      revision: 7,
      enabled: false,
    });
    // Lower revision, enabled — refused.
    expect(fold([observation(6, true)], disabledAt7)).toEqual({
      revision: 7,
      enabled: false,
    });
    // Strictly higher, enabled — accepted. This is the ONLY re-enable path.
    expect(fold([observation(8, true)], disabledAt7)).toEqual({
      revision: 8,
      enabled: true,
    });
  });

  it('adopts a higher revision wholesale, including its disabled state', () => {
    expect(fold([observation(6, true), observation(7, false)])).toEqual({
      revision: 7,
      enabled: false,
    });
  });

  // ── THE INVARIANT ──────────────────────────────────────────────────────────
  // Every ordering of a fixed three-observation set, not a happy-path final
  // state. Arrival order is exactly what a client cannot control: a reply that
  // left the server before an emergency flag-off can land after one that left
  // after it.
  describe('every arrival order of {6,enabled} {7,disabled} {7,enabled}', () => {
    const set = [
      observation(6, true),
      observation(7, false),
      observation(7, true),
    ];
    const orderings = permutations(set);

    it('enumerates all six orderings', () => {
      expect(orderings).toHaveLength(6);
    });

    it.each(orderings.map((o) => [o.map(describeObservation).join(' → '), o]))(
      'ends DISABLED at revision 7 for %s',
      (_label, ordering) => {
        // The property: notices are enabled only if the HIGHEST revision ever
        // seen arrived enabled AND was never seen disabled. Revision 7 was
        // seen disabled in every ordering, so no ordering may end enabled.
        expect(fold(ordering as MentorNoticePolicyObservation[])).toEqual({
          revision: 7,
          enabled: false,
        });
      },
    );

    // Control: the assertion above must not be passing because the reducer is
    // trivially always-disabled. Drop the disable and every ordering enables.
    it.each(
      permutations([observation(6, true), observation(7, true)]).map((o) => [
        o.map(describeObservation).join(' → '),
        o,
      ]),
    )(
      'ends ENABLED at revision 7 for %s (no disable in the set)',
      (_label, ordering) => {
        expect(fold(ordering as MentorNoticePolicyObservation[])).toEqual({
          revision: 7,
          enabled: true,
        });
      },
    );
  });
});

function describeObservation(o: MentorNoticePolicyObservation): string {
  return `{${o.rolloutRevision},${o.rolloutEnabled ? 'en' : 'dis'}}`;
}

describe('reduceMentorNoticePolicy — fail-closed paths', () => {
  it('treats a MALFORMED observation as a disable AT THE CURRENT REVISION', () => {
    const enabledAt7 = fold([observation(7, true)]);

    for (const malformed of [
      null,
      {},
      { rolloutRevision: 9, rolloutEnabled: true },
      { rolloutRevision: -1, rolloutEnabled: true, projectionEpoch: 'e' },
      { rolloutRevision: 7.5, rolloutEnabled: true, projectionEpoch: 'e' },
      { rolloutRevision: '9', rolloutEnabled: true, projectionEpoch: 'e' },
      { rolloutRevision: 9, rolloutEnabled: 'yes', projectionEpoch: 'e' },
      { rolloutRevision: 9, rolloutEnabled: true, projectionEpoch: '' },
      'nonsense',
    ]) {
      expect(observationSignal(malformed)).toBe('malformed');
      expect(fold([malformed], enabledAt7)).toEqual({
        revision: 7,
        enabled: false,
      });
    }
  });

  // The revision is HELD, not dropped to 0, precisely so this holds: were it
  // dropped, the next valid-but-stale observation at revision 7 would look
  // 'newer' than 0 and re-enable.
  it('cannot re-enable through a malformed observation at ANY ordering', () => {
    const orderings = permutations([
      observation(7, true),
      observation(7, false),
      { rolloutRevision: 7, rolloutEnabled: true } as unknown,
    ]);

    for (const ordering of orderings) {
      expect(fold(ordering).enabled).toBe(false);
    }
  });

  it('treats an ABSENT observation as no signal — current state stands', () => {
    const enabledAt7 = fold([observation(7, true)]);
    const disabledAt7 = fold([observation(7, false)]);

    expect(observationSignal(undefined)).toBe('absent');
    expect(reduceMentorNoticePolicy(enabledAt7, 'absent')).toBe(enabledAt7);
    expect(reduceMentorNoticePolicy(disabledAt7, 'absent')).toBe(disabledAt7);
  });

  it('bootstraps disabled at revision 0', () => {
    expect(MENTOR_NOTICE_POLICY_BOOTSTRAP).toEqual({
      revision: 0,
      enabled: false,
    });
  });

  it('reads a MISSING stored record as no signal, so the bootstrap stands', () => {
    expect(storedSignal(null)).toBe('absent');
    expect(
      reduceMentorNoticePolicy(
        MENTOR_NOTICE_POLICY_BOOTSTRAP,
        storedSignal(null),
      ),
    ).toEqual({ revision: 0, enabled: false });
  });

  it('reads a MALFORMED stored record as a disable', () => {
    for (const raw of [
      'not json',
      '{"revision":"7","enabled":true}',
      '{"revision":-1,"enabled":true}',
      '{"revision":7.5,"enabled":true}',
      '{"revision":7}',
      'null',
      '[]',
    ]) {
      expect(storedSignal(raw)).toBe('malformed');
    }

    expect(
      reduceMentorNoticePolicy(
        { revision: 7, enabled: true },
        storedSignal('{"revision":9,"enabled":true'),
      ),
    ).toEqual({ revision: 7, enabled: false });
  });

  it('round-trips a well-formed stored record', () => {
    expect(storedSignal('{"revision":7,"enabled":true}')).toEqual({
      revision: 7,
      enabled: true,
    });
  });
});

describe('noticesSuppressedForPayload', () => {
  const enabledAt7 = {
    state: { revision: 7, enabled: true } as MentorNoticePolicyState,
    observed: true,
    hydrated: true,
  };

  it('suppresses until hydrated, whatever the payload says', () => {
    expect(
      noticesSuppressedForPayload(
        { ...enabledAt7, hydrated: false },
        observation(7, true),
      ),
    ).toBe(true);
  });

  it('suppresses while policy is disabled', () => {
    expect(
      noticesSuppressedForPayload(
        { ...enabledAt7, state: { revision: 7, enabled: false } },
        observation(7, true),
      ),
    ).toBe(true);
  });

  it('suppresses a STALE payload — one whose observation predates what we hold', () => {
    expect(noticesSuppressedForPayload(enabledAt7, observation(6, true))).toBe(
      true,
    );
  });

  it('does NOT suppress a payload at the revision we hold', () => {
    expect(noticesSuppressedForPayload(enabledAt7, observation(7, true))).toBe(
      false,
    );
  });

  it('does NOT suppress a payload from a HIGHER revision', () => {
    // The fold will have adopted it moments earlier; a newer payload is never
    // stale.
    expect(noticesSuppressedForPayload(enabledAt7, observation(8, true))).toBe(
      false,
    );
  });

  it('suppresses a payload carrying a MALFORMED observation', () => {
    expect(noticesSuppressedForPayload(enabledAt7, { junk: 1 })).toBe(true);
  });

  // ── The never-told / told-disabled split ───────────────────────────────────
  // `{revision: 0, enabled: false}` is both "nothing was ever observed" and
  // "policy is off at revision 0". A payload carrying no observation of its own
  // must be treated differently in each case, and collapsing them inverts a
  // shipped WI-2504 guarantee in one direction or leaves the cached-resurrection
  // hole open in the other.
  describe('a payload carrying NO observation', () => {
    it('renders on a device that has never been told anything', () => {
      // A pre-field worker's response, or a legitimately cached projection on a
      // device that has only ever been offline. The server predicate V is the
      // control and has already stripped notice data if the flag is off.
      expect(
        noticesSuppressedForPayload(
          {
            state: MENTOR_NOTICE_POLICY_BOOTSTRAP,
            observed: false,
            hydrated: true,
          },
          undefined,
        ),
      ).toBe(false);
    });

    it('renders on a device told the rollout is ON', () => {
      expect(noticesSuppressedForPayload(enabledAt7, undefined)).toBe(false);
    });

    it('is BLANKED on a device told the rollout is OFF — cached resurrection', () => {
      expect(
        noticesSuppressedForPayload(
          {
            state: { revision: 7, enabled: false },
            observed: true,
            hydrated: true,
          },
          undefined,
        ),
      ).toBe(true);
    });

    it('is BLANKED when the device was told something unparseable at revision 0', () => {
      // Same {0,false} state as the never-told case above, opposite verdict —
      // this is exactly the distinction `observed` carries.
      expect(
        noticesSuppressedForPayload(
          {
            state: MENTOR_NOTICE_POLICY_BOOTSTRAP,
            observed: true,
            hydrated: true,
          },
          undefined,
        ),
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// The store itself. The reducer being correct is not the acceptance criterion —
// the criterion is the state a CONSUMER reads, and a reducer wired through a
// hook that re-hydrates over it fails the real property while the pure tests
// above stay green.
// ---------------------------------------------------------------------------

const ACTOR = 'actor-a';
const OTHER_ACTOR = 'actor-b';
const PROFILE = 'profile-1';

function stateKey(actorId: string, profileId: string): string {
  return `${MENTOR_NOTICE_POLICY_STATE_KEY_PREFIX}::${actorId}::${profileId}`;
}

async function seedStored(
  actorId: string,
  profileId: string,
  raw: string,
): Promise<void> {
  await AsyncStorage.setItem(stateKey(actorId, profileId), raw);
}

function mountPolicy(actorId: string | null = ACTOR, profileId = PROFILE) {
  return renderHook(() => useMentorNoticePolicy(actorId, profileId));
}

describe('useMentorNoticePolicy', () => {
  beforeEach(async () => {
    resetMentorNoticePolicyStoreForTests();
    await AsyncStorage.clear();
  });

  let restoreAppState: (() => void) | null = null;

  afterEach(() => {
    restoreAppState?.();
    restoreAppState = null;
    jest.restoreAllMocks();
  });

  it('cold start with no stored record hydrates to the fail-closed bootstrap', async () => {
    const { result } = mountPolicy();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 0, enabled: false });
    // A fresh install must not paint notices off anything until a server
    // observation arrives.
    expect(result.current.suppressed(observation(0, true))).toBe(true);
  });

  it('warm start hydrates the stored record, so notices survive a relaunch', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');

    const { result } = mountPolicy();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 7, enabled: true });
    expect(result.current.suppressed(observation(7, true))).toBe(false);
  });

  it('suppresses everything BEFORE hydration lands', () => {
    // Synchronous first render: nothing has come back from storage yet, so no
    // projection may be keyed or painted (the cold-offline-launch case).
    const { result } = mountPolicy();

    expect(result.current.hydrated).toBe(false);
    expect(result.current.suppressed(observation(7, true))).toBe(true);
  });

  it('stays fail-closed when the storage READ throws', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    // Swap the function by hand rather than via jest.spyOn: the AsyncStorage
    // jest mock does not survive `mockRestore()` here, and a half-restored
    // getItem leaks into every later test in this file.
    const original = AsyncStorage.getItem;
    AsyncStorage.getItem = jest
      .fn()
      .mockRejectedValue(
        new Error('storage unavailable'),
      ) as unknown as typeof AsyncStorage.getItem;

    try {
      const { result } = mountPolicy();

      await waitFor(() => expect(result.current.hydrated).toBe(true));
      expect(result.current.state).toEqual({ revision: 0, enabled: false });
      expect(result.current.suppressed(observation(7, true))).toBe(true);
    } finally {
      AsyncStorage.getItem = original;
    }
  });

  it('stays fail-closed on a MALFORMED stored record', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":"seven","enabled":true}');

    const { result } = mountPolicy();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 0, enabled: false });
  });

  it('never lets one actor inherit another actor’s policy state on the same profile', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');

    const mine = mountPolicy(ACTOR, PROFILE);
    const theirs = mountPolicy(OTHER_ACTOR, PROFILE);

    await waitFor(() => expect(mine.result.current.hydrated).toBe(true));
    await waitFor(() => expect(theirs.result.current.hydrated).toBe(true));

    expect(mine.result.current.state.enabled).toBe(true);
    expect(theirs.result.current.state.enabled).toBe(false);
  });

  it('persists an adopted observation so the next cold start reads it back', async () => {
    const first = mountPolicy();
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));

    act(() => first.result.current.observe(observation(7, true)));
    await waitFor(() =>
      expect(first.result.current.state).toEqual({
        revision: 7,
        enabled: true,
      }),
    );

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":7,"enabled":true}',
      ),
    );

    // Simulate a relaunch: in-memory state gone, storage intact.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 7,
      enabled: true,
    });
  });

  it('shares ONE observation across concurrently mounted consumers', async () => {
    // useNowFeed, useNowOverflow and useSessionSummary mount together on the
    // Mentor screen. Per-hook state is the WI-2504-bounce-2 bug: one instance
    // observed a disable while siblings kept serving warm notice data.
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    const a = mountPolicy();
    const b = mountPolicy();
    await waitFor(() => expect(a.result.current.hydrated).toBe(true));
    await waitFor(() => expect(b.result.current.hydrated).toBe(true));

    act(() => a.result.current.observe(observation(7, false)));

    await waitFor(() => expect(b.result.current.state.enabled).toBe(false));
  });

  // ── THE INVARIANT, at the store ────────────────────────────────────────────
  describe('every arrival order of {6,enabled} {7,disabled} {7,enabled}', () => {
    const orderings = permutations([
      observation(6, true),
      observation(7, false),
      observation(7, true),
    ]);

    it.each(orderings.map((o) => [o.map(describeObservation).join(' → '), o]))(
      'the store reports DISABLED for %s',
      async (_label, ordering) => {
        resetMentorNoticePolicyStoreForTests();
        await AsyncStorage.clear();

        const { result } = mountPolicy();
        await waitFor(() => expect(result.current.hydrated).toBe(true));

        for (const next of ordering as MentorNoticePolicyObservation[]) {
          act(() => result.current.observe(next));
        }

        expect(result.current.state).toEqual({ revision: 7, enabled: false });
        // And the highest-revision payload itself may not paint.
        expect(result.current.suppressed(observation(7, true))).toBe(true);
      },
    );
  });

  it('re-reads storage on FOREGROUND, and the re-read cannot re-enable', async () => {
    // Hydrated once is not hydrated only: storage can change under a mounted
    // tree. WI-2504 declined a staleTime for the same reason. What makes the
    // re-read safe is that it routes through the reducer.
    const listeners: ((s: AppStateStatus) => void)[] = [];
    const originalAddEventListener = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: unknown) => {
      listeners.push(handler as (s: AppStateStatus) => void);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener;
    restoreAppState = () => {
      AppState.addEventListener = originalAddEventListener;
    };

    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.state.enabled).toBe(true));

    // A rollback landed in storage out of band (another mounted surface, a
    // background write). Foregrounding must pick it up.
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":false}');
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    await waitFor(() => expect(result.current.state.enabled).toBe(false));

    // ...and a LOWER stored revision arriving on a later foreground may not
    // undo it. This is the regression a plain re-read would introduce.
    await seedStored(ACTOR, PROFILE, '{"revision":6,"enabled":true}');
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    expect(result.current.state).toEqual({ revision: 7, enabled: false });

    // A strictly higher revision is the only way back.
    await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":true}');
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    await waitFor(() =>
      expect(result.current.state).toEqual({ revision: 8, enabled: true }),
    );
  });

  it('ignores a background AppState transition', async () => {
    const listeners: ((s: AppStateStatus) => void)[] = [];
    const originalAddEventListener = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: unknown) => {
      listeners.push(handler as (s: AppStateStatus) => void);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener;
    restoreAppState = () => {
      AppState.addEventListener = originalAddEventListener;
    };

    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.state.enabled).toBe(true));

    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":false}');
    await act(async () => {
      for (const listener of listeners) listener('background');
    });

    expect(result.current.state.enabled).toBe(true);
  });

  it('judges an unbound (actor-less) payload on its OWN observation alone', () => {
    const { result } = mountPolicy(null);

    // Nothing to hydrate FROM, so callers gating on `hydrated` are not blocked
    // while auth resolves. There is also no per-pair history to consult, so the
    // payload's own observation is the whole answer — anything stricter blanks a
    // legitimate notice for the render or two before `userId` lands, which is
    // what a session-summary screen mounting mid-auth actually does.
    expect(result.current.hydrated).toBe(true);
    expect(result.current.suppressed(observation(9, true))).toBe(false);
    expect(result.current.suppressed(observation(9, false))).toBe(true);
    expect(result.current.suppressed(undefined)).toBe(false);
    expect(result.current.suppressed({ junk: 1 } as never)).toBe(true);

    // ...and it writes nothing: no actor means no key to persist under.
    act(() => result.current.observe(observation(9, true)));
    expect(result.current.state).toEqual({ revision: 0, enabled: false });
  });
});
