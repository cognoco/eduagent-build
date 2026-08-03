import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MentorNoticePolicyObservation } from '@eduagent/schemas';

import {
  MENTOR_NOTICE_POLICY_DISABLE_FLOOR_KEY_SUFFIX,
  MENTOR_NOTICE_POLICY_STATE_KEY_PREFIX,
} from './secure-store-keys';
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
    // [WI-2911] This state came off a SUCCESSFUL read. The blind counterpart —
    // the same state assembled while storage was unreadable — is asserted
    // separately below, and is the one whose verdict this Work Item inverts.
    trusted: true,
    malformedSuppressed: false,
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
            trusted: true,
            malformedSuppressed: false,
          },
          undefined,
        ),
      ).toBe(false);
    });

    it('renders on a device told the rollout is ON', () => {
      expect(noticesSuppressedForPayload(enabledAt7, undefined)).toBe(false);
    });

    // [WI-2911] THE INVERSION, stated against its own sibling. The line above is
    // a shipped guarantee — a device told the rollout is ON renders a payload
    // that carries no observation. It still holds, and it holds *because* that
    // state came off a successful read. The identical state assembled while
    // storage was unreadable gets the opposite verdict, because "told the
    // rollout is ON" is then a claim the device could not corroborate against
    // the disable floor sitting unread on its own disk.
    it('is BLANKED on a device told the rollout is ON while storage is UNREADABLE', () => {
      expect(
        noticesSuppressedForPayload(
          { ...enabledAt7, trusted: false },
          undefined,
        ),
      ).toBe(true);
    });

    it('is BLANKED on a never-told device while storage is UNREADABLE', () => {
      // The never-told benefit of the doubt is also withheld while blind: a
      // device that cannot read its own disk cannot know it was never told.
      expect(
        noticesSuppressedForPayload(
          {
            state: MENTOR_NOTICE_POLICY_BOOTSTRAP,
            observed: false,
            hydrated: true,
            trusted: false,
            malformedSuppressed: false,
          },
          undefined,
        ),
      ).toBe(true);
    });

    it('is BLANKED on a device told the rollout is OFF — cached resurrection', () => {
      expect(
        noticesSuppressedForPayload(
          {
            state: { revision: 7, enabled: false },
            observed: true,
            hydrated: true,
            trusted: true,
            malformedSuppressed: false,
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
            trusted: true,
            malformedSuppressed: false,
          },
          undefined,
        ),
      ).toBe(true);
    });
  });

  // [WI-2627] While the read is UNTRUSTED, suppression is unconditional — and
  // that is asserted here as a property over every signal shape, not as a verdict
  // on the one payload a reviewer happened to name.
  //
  // The scoping this block used to assert (gate on the observation-LESS branch,
  // let a payload with its own observation through on the theory that the
  // server's predicate V makes a live reply trustworthy) was the defect. It
  // assumes the reply is live. A pre-rollback reply is equally well-formed and
  // carries an equally valid observation; the only thing that could tell them
  // apart is the disable floor, which is precisely what an unreadable device
  // cannot consult. So "carries an observation" is not evidence of freshness
  // while blind, and no per-shape rule can recover the distinction.
  describe('while storage is UNREADABLE, suppression is unconditional', () => {
    const blindEnabledAt5 = {
      state: { revision: 5, enabled: true } as MentorNoticePolicyState,
      observed: true,
      hydrated: true,
      trusted: false,
      malformedSuppressed: false,
    };

    // Every shape `observationSignal` can return, including the two that would
    // otherwise render: an observation AT the held revision, and one ABOVE it.
    it.each([
      ['absent', undefined],
      ['malformed', { rolloutRevision: 'nope' }],
      ['older than held', observation(4, true)],
      ['same as held', observation(5, true)],
      ['newer than held', observation(9, true)],
      ['newer and disabled', observation(9, false)],
    ])('suppresses a %s observation', (_shape, payload) => {
      expect(noticesSuppressedForPayload(blindEnabledAt5, payload)).toBe(true);
    });

    // The counterpart, and what keeps the assertion above from being trivially
    // true: flip ONLY `trusted`, change nothing else, and the same payload
    // renders. Without this the block would pass against a function that
    // suppressed everything unconditionally.
    it('renders that same payload once a read has SUCCEEDED', () => {
      expect(
        noticesSuppressedForPayload(
          { ...blindEnabledAt5, trusted: true },
          observation(5, true),
        ),
      ).toBe(false);
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

/** The suppress-only disable-floor marker namespace for a pair. */
function floorPrefix(actorId: string, profileId: string): string {
  return `${stateKey(actorId, profileId)}::${MENTOR_NOTICE_POLICY_DISABLE_FLOOR_KEY_SUFFIX}::`;
}

/**
 * THE FLOOR — the maximum revision across the marker key set, or `null` when
 * there are no markers.
 *
 * Deliberately asserts the floor rather than any key's bytes: the floor is the
 * property that must not decrease, and an assertion on one slot's contents is
 * what let a lowering defect read as "the record is present". Recomputed here
 * rather than imported so the test is not tautological with the implementation.
 */
async function readFloor(
  actorId: string,
  profileId: string,
): Promise<number | null> {
  const prefix = floorPrefix(actorId, profileId);
  const revisions = (await AsyncStorage.getAllKeys())
    .filter((k) => k.startsWith(prefix))
    .map((k) => Number(k.slice(prefix.length)));
  return revisions.length === 0 ? null : Math.max(...revisions);
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

  // ── The write path's own rollback boundary ─────────────────────────────────
  // The read half above is fail-closed and tested. This is the write half: a
  // disable-write whose FIRST `setItem` attempt is rejected (a transient OS
  // hiccup, not sustained disk pressure) must still land durably, so a
  // relaunch during the retry window does not resurrect the notice the
  // in-session state already correctly suppressed.
  it('recovers a disable-write after a transient setItem rejection, so a relaunch does not resurrect the notice', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":6,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 6, enabled: true });

    const originalSetItem = AsyncStorage.setItem;
    let rejectedOnce = false;
    AsyncStorage.setItem = jest.fn((k: string, v: string) => {
      if (!rejectedOnce) {
        rejectedOnce = true;
        return Promise.reject(new Error('transient disk write failure'));
      }
      return originalSetItem(k, v);
    }) as unknown as typeof AsyncStorage.setItem;

    try {
      act(() => result.current.observe(observation(7, false)));

      // In-session state is correct immediately — the fold is synchronous and
      // does not wait on the write.
      expect(result.current.suppressed(undefined)).toBe(true);

      // The retried write eventually lands durably...
      await waitFor(async () => {
        const raw = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));
        expect(raw).toBe('{"revision":7,"enabled":false}');
      });
    } finally {
      AsyncStorage.setItem = originalSetItem;
    }

    // ...so a relaunch (fresh in-memory store, storage intact) reads the
    // disable, not the pre-rollback record.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 7,
      enabled: false,
    });
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
  });

  // ── [WI-2627 rework, finding 2] Durable state under interleaved writes ────
  //
  // The in-memory reducer was already monotonic; the DURABLE record was not.
  // Each observation started its own fire-and-forget write carrying its OWN
  // captured snapshot, so an older ENABLED write that failed and retried could
  // land AFTER a newer DISABLED write that succeeded — leaving AsyncStorage
  // holding the enabled record. Nothing in-session noticed, because in-session
  // state was correct the whole time. The next launch hydrated the stale enabled
  // record and resurrected the notices the rollback had voided.
  //
  // Asserting the in-memory reducer proves nothing here, so this test asserts
  // the FINAL DURABLE RECORD and then hydrates a fresh store from it.
  it('never lets an older enabled write land last, so a restart after interleaved writes does not resurrect notices', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":6,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 6, enabled: true });

    // Hand-controlled `setItem`: the FIRST attempt is held open and then
    // rejected, every later one goes through. Holding it open is what makes the
    // interleaving deterministic instead of racing the retry backoff.
    const originalSetItem = AsyncStorage.setItem;
    const writes: string[] = [];
    const failFirstAttempt: ((err: unknown) => void)[] = [];
    let calls = 0;
    AsyncStorage.setItem = jest.fn((k: string, v: string) => {
      writes.push(v);
      calls += 1;
      if (calls === 1) {
        return new Promise<void>((_resolve, reject) => {
          failFirstAttempt.push(reject);
        });
      }
      return originalSetItem(k, v);
    }) as unknown as typeof AsyncStorage.setItem;

    try {
      // (1) The ENABLED write at revision 7. Its first attempt is now in flight
      // and will fail.
      act(() => result.current.observe(observation(7, true)));
      await waitFor(() => expect(writes.length).toBe(1));
      expect(writes[0]).toBe('{"revision":7,"enabled":true}');

      // (2) The DISABLED write at revision 8, issued while (1) is still
      // outstanding. In-session state goes fail-closed immediately.
      act(() => result.current.observe(observation(8, false)));
      expect(result.current.state).toEqual({ revision: 8, enabled: false });
      expect(result.current.suppressed(undefined)).toBe(true);

      // (3) Only NOW does (1) fail, so its retry is genuinely late — the
      // pre-rework ordering in which the older enabled payload lands last.
      failFirstAttempt[0]?.(new Error('transient disk write failure'));

      // Wait for the LATE RETRY to have actually issued, and for the last write
      // to have reached disk. Asserting the durable record before this point is
      // what makes the test vacuous: there is a window in which the disable has
      // landed and the older enabled retry has not yet overwritten it, and a
      // bare `waitFor` on the expected value passes inside that window on
      // completely unfixed code. Both the fixed and pre-fix orderings issue
      // exactly three `setItem` calls here (held+rejected attempt, its retry,
      // and the second observation's write), so this waits for all of them.
      await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(3));
      await waitFor(async () => {
        expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
          writes[writes.length - 1],
        );
      });

      // THE FINAL DURABLE RECORD, once every write including the late retry has
      // landed. This is the assertion the defect fails.
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":8,"enabled":false}',
      );
    } finally {
      AsyncStorage.setItem = originalSetItem;
    }

    // THE CRITERION'S OWN LAYER: restart. Fresh in-memory store, storage as the
    // interleaving left it. The defect lived here — hydration adopting the stale
    // enabled record — so this is where it has to be denied.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 8,
      enabled: false,
    });
    // ...and a cached projection carrying no observation of its own stays blank.
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
    expect(relaunched.result.current.suppressed(observation(8, true))).toBe(
      true,
    );

    // Corroboration on the mechanism: every write that reached disk after the
    // failed first attempt carried the CURRENT state, so no ordering of retries
    // could have put the older enabled payload last.
    expect(
      writes.slice(1).filter((w) => w !== '{"revision":8,"enabled":false}'),
    ).toEqual([]);
  });

  // ── [WI-2627 rework 2] A failed READ must not license a write ─────────────
  //
  // The breach this closes, reproduced by an independent adjudicator against the
  // previous head. `readAndFold`'s catch nulled `entry.durable`, and
  // `durableCandidate` reads `null` as "no guard, write current state". Those are
  // two different facts wearing one value: "nothing trustworthy is THERE" versus
  // "we could not LOOK, and a higher-revision disable may be sitting there".
  //
  // At cold start in-memory is the bootstrap `{0,false}`, so it has no revision
  // to defend with, and a well-formed enabled observation at ANY revision above 0
  // is `newer` and adopted wholesale — then written straight over an intact
  // higher-revision disable on disk. Observed on the previous head: durable
  // `{8,false}` became `{3,true}`, and the restart showed notices.
  //
  // Note this is the module's OWN stated threat model (see the header): "a reply
  // that left the server before an emergency flag-off, arriving after one that
  // left after it". A rev-3-enabled reply reaching a device whose disk says
  // rev-8-disabled is precisely that.
  it('does not regress the durable record when the READ threw, so a restart after a blind write does not resurrect notices', async () => {
    // Disk holds a HIGH-revision DISABLE — the emergency rollback. Note the
    // asymmetry with the read-throw test above, which seeds an ENABLED record and
    // asserts only in-memory: that axis cannot reach this hole.
    await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');

    // ...and the read of it fails, so this device is blind to it.
    const originalGetItem = AsyncStorage.getItem;
    const originalSetItem = AsyncStorage.setItem;
    let readsFailed = 0;
    let writesAttempted = 0;
    AsyncStorage.getItem = jest.fn(() => {
      readsFailed += 1;
      return Promise.reject(new Error('storage unavailable'));
    }) as unknown as typeof AsyncStorage.getItem;
    // Passthrough spy: this must NOT change behaviour, only let the test tell
    // "the write path has finished" from "it has not run yet".
    AsyncStorage.setItem = jest.fn((k: string, v: string) => {
      writesAttempted += 1;
      return originalSetItem(k, v);
    }) as unknown as typeof AsyncStorage.setItem;

    try {
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      // Cold start + failed read: the bootstrap, which has NO revision to defend
      // with. This is the precondition that makes the hole reachable.
      expect(result.current.state).toEqual({ revision: 0, enabled: false });

      // A well-formed observation at a LOWER revision than the disable on disk,
      // saying notices are ON. Against the bootstrap it is legitimately 'newer',
      // so in-memory adopting it is correct and expected.
      act(() => result.current.observe(observation(3, true)));
      expect(result.current.state).toEqual({ revision: 3, enabled: true });

      // ...BUT THE INTERNAL FOLD IS NOT THE CRITERION, AND THIS LINE MUST NOT BE
      // READ AS BLESSING RESURRECTION. Gate-2 read the assertion directly above
      // as the suite "preserving rather than guarding against" the original
      // symptom, which is a fair reading of a bare `state` assertion sitting in a
      // storage-failure test: `{revision:3, enabled:true}` is literally the
      // resurrected value. The distinction the assertion above cannot carry on
      // its own is that `state` is the internal fold, while what a SURFACE gets
      // is `suppressed()` — and the two deliberately disagree here.
      //
      // The gate is the READ, not the fold: while the read is untrusted, an
      // observation-less payload stays blank no matter what the fold says. So the
      // property is asserted here, at the exact point the fold adopts the stale
      // enabled value, rather than only in the dedicated in-session block further
      // down this file. A future reader arriving at the line above now finds the
      // answer beside it instead of having to know where else to look.
      expect(result.current.suppressed(undefined)).toBe(true);
      // ...and so does a payload carrying that same observation. [WI-2627] This
      // line previously expected `false`, on the theory that a payload with its
      // own observation is necessarily live because the server strips notice
      // data when the rollout is off. That theory assumed away the threat: a
      // pre-rollback reply carries notice data AND a well-formed observation,
      // and a device that cannot read its disk cannot compare either against the
      // durable disable floor. While the read is untrusted the fold is not
      // evidence and neither is the payload.
      expect(result.current.suppressed(observation(3, true))).toBe(true);

      // Wait for the write path to have FINISHED, by a condition both the fixed
      // and the broken implementation satisfy — otherwise this wait would itself
      // become the assertion and the durable check below would never be reached.
      // Fixed: the read is retried (2 reads) and no write is attempted. Broken:
      // one read, then a write straight over the disable.
      await waitFor(() =>
        expect(readsFailed + writesAttempted).toBeGreaterThanOrEqual(2),
      );
    } finally {
      AsyncStorage.getItem = originalGetItem;
      AsyncStorage.setItem = originalSetItem;
    }

    // THE DURABLE RECORD: untouched. Not lowered 8 → 3, and `enabled` not flipped
    // false → true. Withholding is the fail-closed direction here: whatever is on
    // disk is at least as strict as what we would have written.
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
      '{"revision":8,"enabled":false}',
    );

    // THE CRITERION'S OWN LAYER: restart. Storage is readable again, as it would
    // be on a fresh launch. The rollback is still in force and notices stay gone.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 8,
      enabled: false,
    });
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
    // ...and the stale enabled observation still cannot re-enable it.
    expect(relaunched.result.current.suppressed(observation(3, true))).toBe(
      true,
    );
    // Corroboration on the mechanism: the write was WITHHELD, not merely
    // guarded into a no-op.
    expect(writesAttempted).toBe(0);
    // ...and the blindness was retried rather than assumed permanent.
    expect(readsFailed).toBeGreaterThanOrEqual(2);
  });

  // The other half of the read-throw split: a genuinely ABSENT record is
  // "nothing trustworthy is there", not "we could not look", and must NOT
  // withhold — otherwise the fix above would silently stop every fresh install
  // from ever persisting anything.
  it('still writes when the read SUCCEEDS and finds no record, so the withhold is scoped to failed reads', async () => {
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(observation(4, true)));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":4,"enabled":true}',
      );
    });
  });

  // ── The other DIRECTION of blindness ──────────────────────────────────────
  //
  // The first withhold was unconditional, and that traded the original breach
  // for two NEW kill-switch fail-opens that `origin/main` does not have: a
  // genuine emergency disable was silently swallowed. Both cases below were
  // measured against `origin/main` as well as head — a single-source run cannot
  // tell a regression from a residual, which is exactly how that shipped.
  //
  // The rule that resolves it: while blind, an ENABLED candidate is withheld
  // (it can resurrect notices), a genuine DISABLE is written anyway (losing the
  // kill-switch is strictly worse than anything the write can overwrite).

  /** Fail every `getItem` for the duration of `run`. */
  async function whileBlind(run: () => Promise<void>): Promise<void> {
    const originalGetItem = AsyncStorage.getItem;
    AsyncStorage.getItem = jest.fn(() =>
      Promise.reject(new Error('storage unavailable')),
    ) as unknown as typeof AsyncStorage.getItem;
    try {
      await run();
    } finally {
      AsyncStorage.getItem = originalGetItem;
    }
  }

  it('writes a GENUINE disable while blind, over a lower-revision enabled record it cannot see', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":3,"enabled":true}');

    await whileBlind(async () => {
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      act(() => result.current.observe(observation(9, false)));
      // Long enough to cover the read and write retry ladders.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
    });

    // The emergency disable LANDS — durably, on the suppress-only sidecar.
    // Withholding it left disk unchanged and the restart showed notices — a
    // kill-switch silently swallowed.
    //
    // [rework 4] Only the ENCODING of "it landed" moved: the disable now goes to
    // the sidecar and the state record is left ALONE. That is strictly more than
    // was asserted before — the unseen state record is preserved rather than
    // overwritten — and the behavioural assertions below (restart state,
    // suppression) are unchanged.
    expect(await readFloor(ACTOR, PROFILE)).toBe(9);
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
      '{"revision":3,"enabled":true}',
    );

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: false,
    });
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
  });

  it('persists a disable on a FRESH INSTALL whose first read throws, so it cannot hydrate as never-told', async () => {
    // No stored record at all — the case that needs no pre-existing state to
    // reach. Withholding here left the record ABSENT, and an absent record
    // hydrates as NEVER-TOLD, which `noticesSuppressedForPayload` treats as
    // "not suppressed" and lets a cached projection paint. That is precisely
    // the hazard `removeItem` was rejected for, reintroduced by the withhold.
    await whileBlind(async () => {
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      act(() => result.current.observe(observation(9, false)));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
    });

    // [rework 4] Encoding only: the disable lands on the sidecar. Nothing was
    // there to preserve, so the state record legitimately stays absent — and the
    // never-told check below is what proves the sidecar alone is enough.
    expect(await readFloor(ACTOR, PROFILE)).toBe(9);
    // ...and the state record is STILL absent — restored after review flagged
    // that this assertion was dropped rather than re-expressed. It is what makes
    // the never-told check below load-bearing: the floor marker is the only
    // record on disk, so it alone has to carry both the disable and `observed`.
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBeNull();

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: false,
    });
    // The never-told check: a payload carrying no observation of its own must
    // still be suppressed. A never-told device answers `false` here.
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
  });

  // ── [WI-2627 rework 4] THE RESURRECTION PATH ITSELF ───────────────────────
  //
  // This REPLACES a test that asserted the defect as an accepted cost ("a blind
  // disable can LOWER the durable floor, and stays disabled either way"). It was
  // not an inconvenient assertion that got adjusted: it recorded exactly the
  // weakening this Work Item exists to eliminate, and it stopped at immediate
  // suppression — one step before the continuation where the lowered floor
  // actually bites.
  //
  // The full sequence, all five steps, ending after a RESTART:
  //   1. disk holds an UNSEEN rev-8 disable (reads are failing)
  //   2. a genuine rev-3 disable is written while blind
  //   3. reads recover; the app foregrounds and re-hydrates
  //   4. a STALE rev-5 ENABLED reply arrives
  //   5. restart
  //
  // On the previous head step 2 lowered the durable floor 8 → 3, so at step 4
  // rev-5-enabled was `newer`, adopted, and written — and step 5 showed notices.
  // The floor must survive step 2 for rev-5 to be `older` and refused.
  it('closes the resurrection path: a blind disable cannot lower the durable floor, so a stale enabled reply cannot re-enable after restart', async () => {
    // The AppState seam gives step 3 ("reads recover; hydration") in-session,
    // which is where the defect sequence puts it.
    const listeners: ((s: AppStateStatus) => void)[] = [];
    const originalAddEventListener = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: unknown) => {
      listeners.push(handler as (s: AppStateStatus) => void);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener;
    restoreAppState = () => {
      AppState.addEventListener = originalAddEventListener;
    };

    // (1) The emergency rev-8 rollback is on disk, and this device cannot see it.
    await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');
    const originalGetItem = AsyncStorage.getItem;
    AsyncStorage.getItem = jest.fn(() =>
      Promise.reject(new Error('storage unavailable')),
    ) as unknown as typeof AsyncStorage.getItem;

    const { result } = mountPolicy();
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      // Blind cold start: the bootstrap, which has NO revision to defend with.
      // This is the precondition that makes the hole reachable.
      expect(result.current.state).toEqual({ revision: 0, enabled: false });

      // (2) A GENUINE rev-3 disable — a real kill-switch, at a lower revision
      // than the one already on disk. It must be persisted (losing it is worse
      // than anything a write can overwrite) WITHOUT lowering the floor.
      act(() => result.current.observe(observation(3, false)));
      // Long enough to cover the read and write retry ladders.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
    } finally {
      AsyncStorage.getItem = originalGetItem;
    }

    // THE FLOOR, at the layer the defect lived: the unseen rev-8 disable is
    // INTACT. This is the assertion the previous head fails — it held
    // `{"revision":3,"enabled":false}` here.
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
      '{"revision":8,"enabled":false}',
    );
    // ...and the rev-3 kill-switch was NOT swallowed to achieve that. It is
    // durably recorded on the suppress-only sidecar.
    expect(await readFloor(ACTOR, PROFILE)).toBe(3);

    // (3) Reads recover. Foregrounding re-hydrates, and the intact rev-8 disable
    // is re-established as what this device holds.
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    await waitFor(() =>
      expect(result.current.state).toEqual({ revision: 8, enabled: false }),
    );

    // (4) THE STALE INTERMEDIATE REPLY: rev-5, enabled. It left the server
    // between the rev-3 and rev-8 deploys. Against the LOWERED floor it was
    // `newer` and re-enabled; against the intact floor it is `older` and refused.
    act(() => result.current.observe(observation(5, true)));
    expect(result.current.state).toEqual({ revision: 8, enabled: false });
    expect(result.current.suppressed(observation(5, true))).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // (5) RESTART — the step the previous permanent test never reached, and the
    // only layer at which "notices are exposed" is observable at all.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 8,
      enabled: false,
    });
    // The rollback is still in force: neither a cached projection carrying no
    // observation nor the stale rev-5 reply may paint.
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
    expect(relaunched.result.current.suppressed(observation(5, true))).toBe(
      true,
    );
  });

  // NON-TRIVIALITY CONTROL for the test above, in the direction that matters
  // most: "always suppress" and "never let anything re-enable" satisfy every
  // assertion there. Neither survives this. A device whose floor was set by a
  // blind disable must still accept a legitimate deploy above it — otherwise the
  // fix ships a permanently bricked surface with no recovery path, and a suite
  // that only asserts suppression cannot tell the two apart.
  it('still accepts a legitimate re-enable above a floor set by a blind disable, so the device is never stranded', async () => {
    // Fresh install, blind, genuine rev-3 disable → the floor is set and there is
    // no state record at all, so the sidecar is the ONLY thing holding it.
    const originalGetItem = AsyncStorage.getItem;
    AsyncStorage.getItem = jest.fn(() =>
      Promise.reject(new Error('storage unavailable')),
    ) as unknown as typeof AsyncStorage.getItem;

    try {
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      act(() => result.current.observe(observation(3, false)));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
    } finally {
      AsyncStorage.getItem = originalGetItem;
    }
    expect(await readFloor(ACTOR, PROFILE)).toBe(3);

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 3,
      enabled: false,
    });

    // A genuine deploy at a STRICTLY HIGHER revision turns notices back on.
    act(() => relaunched.result.current.observe(observation(9, true)));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: true,
    });
    expect(relaunched.result.current.suppressed(observation(9, true))).toBe(
      false,
    );
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":9,"enabled":true}',
      );
    });

    // ...and it SURVIVES a restart with the stale rev-3 floor still on disk. The
    // sidecar is never cleared, and never needs to be: it folds as `older` and is
    // inert. A floor that re-disabled here would be the stranding failure.
    resetMentorNoticePolicyStoreForTests();
    const again = mountPolicy();
    await waitFor(() => expect(again.result.current.hydrated).toBe(true));
    expect(again.result.current.state).toEqual({ revision: 9, enabled: true });
    expect(again.result.current.suppressed(observation(9, true))).toBe(false);
  });

  // THE OTHER BRANCH OF THE BLIND GATE. The sidecar path is reached only when
  // `readUntrusted && durable === null` — i.e. we have never established what is
  // on disk. When a read DID succeed and storage goes blind afterwards, the
  // ordinary revision-guarded write still runs, and it must do both jobs on its
  // own: land a genuine kill-switch, and refuse to lower a floor. Untested, this
  // is the gate condition's uncovered half.
  it.each([
    // seeded record, disable revision, expected durable record, expected state
    [
      'lands a genuine disable ABOVE it',
      '{"revision":3,"enabled":true}',
      9,
      '{"revision":9,"enabled":false}',
      { revision: 9, enabled: false },
    ],
    [
      'refuses to lower a floor BELOW it',
      '{"revision":8,"enabled":false}',
      3,
      '{"revision":8,"enabled":false}',
      { revision: 8, enabled: false },
    ],
  ])(
    'after a SUCCESSFUL read, a disable arriving while blind %s',
    async (_label, seeded, disableRevision, expectedDurable, expectedState) => {
      await seedStored(ACTOR, PROFILE, seeded as string);
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      // Storage goes blind only NOW — after the read established `durable`, so
      // the sidecar path is deliberately NOT taken.
      const originalGetItem = AsyncStorage.getItem;
      AsyncStorage.getItem = jest.fn(() =>
        Promise.reject(new Error('storage unavailable')),
      ) as unknown as typeof AsyncStorage.getItem;
      try {
        act(() =>
          result.current.observe(observation(disableRevision as number, false)),
        );
        await act(async () => {
          await new Promise((r) => setTimeout(r, 1200));
        });
      } finally {
        AsyncStorage.getItem = originalGetItem;
      }

      // The guarded write carried it: no sidecar was needed or written.
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        expectedDurable,
      );
      expect(await readFloor(ACTOR, PROFILE)).toBeNull();

      resetMentorNoticePolicyStoreForTests();
      const relaunched = mountPolicy();
      await waitFor(() =>
        expect(relaunched.result.current.hydrated).toBe(true),
      );
      expect(relaunched.result.current.state).toEqual(expectedState);
      expect(relaunched.result.current.suppressed(undefined)).toBe(true);
    },
  );

  // ── [WI-2627 rework 5] TWO CONSECUTIVE BLIND COLD STARTS ──────────────────
  //
  // The Gate-1 adjudicator's reproducer for PR #2645 head 1bb3f80aa, made
  // permanent. That head carried the floor in ONE slot, and a slot we cannot read
  // can be lowered by a blind write exactly as the state record could — so E3
  // completed end to end, relocated to a different key. Sustained disk pressure
  // spans restarts by nature, so "blind twice in a row" is this failure's ordinary
  // shape, not a coincidence; and on a FRESH INSTALL the floor is the ONLY carrier,
  // so lowering it lowers the bar absolutely.
  //
  // "A different key cannot destroy the state record" was true and answered the
  // wrong question. What has to survive is the FLOOR, not the record.
  it('closes the relocated resurrection path: two blind cold starts cannot lower the floor, so a stale enabled reply still cannot re-enable', async () => {
    /** One blind session that persists a genuine disable, then exits. */
    async function blindSessionWithGenuineDisable(revision: number) {
      const originalGetItem = AsyncStorage.getItem;
      AsyncStorage.getItem = jest.fn(() =>
        Promise.reject(new Error('storage unavailable')),
      ) as unknown as typeof AsyncStorage.getItem;
      try {
        const { result } = mountPolicy();
        await waitFor(() => expect(result.current.hydrated).toBe(true));
        act(() => result.current.observe(observation(revision, false)));
        await act(async () => {
          await new Promise((r) => setTimeout(r, 1200));
        });
      } finally {
        AsyncStorage.getItem = originalGetItem;
      }
    }

    // (1) FRESH INSTALL, reads blind. A genuine rev-8 emergency disable is
    // persisted. It can only land on the floor, so the floor is the ONLY carrier.
    await blindSessionWithGenuineDisable(8);
    expect(await readFloor(ACTOR, PROFILE)).toBe(8);
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBeNull();

    // (2) RESTART, reads STILL blind → nothing established to guard against,
    // again. A genuine rev-3 disable arrives. On the single-slot head this
    // overwrote the rev-8 marker and the floor fell 8 → 3.
    resetMentorNoticePolicyStoreForTests();
    await blindSessionWithGenuineDisable(3);
    expect(await readFloor(ACTOR, PROFILE)).toBe(8);
    // Both markers are present — the rev-3 disable was recorded WITHOUT displacing
    // rev-8. That is the whole mechanism: a set gains members, it never replaces.
    expect(
      await AsyncStorage.getItem(`${floorPrefix(ACTOR, PROFILE)}8`),
    ).not.toBeNull();
    expect(
      await AsyncStorage.getItem(`${floorPrefix(ACTOR, PROFILE)}3`),
    ).not.toBeNull();

    // (3) Reads recover; hydrate. The rev-8 rollback is what this device holds.
    resetMentorNoticePolicyStoreForTests();
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.state).toEqual({ revision: 8, enabled: false });

    // (4) THE STALE INTERMEDIATE REPLY: rev-5 enabled. It cleared the lowered bar
    // on the single-slot head; against the intact floor it is `older`.
    act(() => result.current.observe(observation(5, true)));
    expect(result.current.state).toEqual({ revision: 8, enabled: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // (5) RESTART — where notices were exposed.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 8,
      enabled: false,
    });
    expect(relaunched.result.current.suppressed(undefined)).toBe(true);
    expect(relaunched.result.current.suppressed(observation(5, true))).toBe(
      true,
    );

    // RECOVERY, on the same device that just accumulated two markers — the
    // bricking edge a floor guard reintroduces. A genuine deploy above the
    // highest marker still turns notices back on, and survives a restart.
    act(() => relaunched.result.current.observe(observation(9, true)));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: true,
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":9,"enabled":true}',
      );
    });
    resetMentorNoticePolicyStoreForTests();
    const again = mountPolicy();
    await waitFor(() => expect(again.result.current.hydrated).toBe(true));
    expect(again.result.current.state).toEqual({ revision: 9, enabled: true });
    expect(again.result.current.suppressed(observation(9, true))).toBe(false);
  });

  // ── [WI-2627 rework 6] A CORRUPT MARKER MUST NOT BRICK THE DEVICE ─────────
  //
  // REPLACES a test that asserted the bricking behaviour. It seeded a corrupt
  // marker over an enabled state record and asserted `{7,false}` — "disabled at
  // the held revision" — and it was green while the defect shipped underneath it,
  // because it only ever asserted ONE hydration. Never a restart.
  //
  // What was wrong: an unparseable marker folded 'malformed', which disables at
  // the HELD revision unconditionally and is re-applied on EVERY hydration. A
  // genuine re-enable was adopted in-session, written durably, and then
  // re-disabled at that same revision on the next launch — forever, at any deploy
  // revision. And unlike a corrupt STATE RECORD, which the next write overwrites,
  // a corrupt marker is never pruned, so nothing could ever clear it. The
  // no-prune decision bought non-lowerability and sold self-healing.
  it('withholds the never-told benefit for a corrupt marker, but does not suppress at a revision it cannot prove', async () => {
    // Fresh install, the corrupt marker the ONLY thing on disk.
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}abc`, '1');

    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    // The fail-closed half that must NOT be lost: a marker exists, so this device
    // counts as told-something and a cached projection carrying no observation of
    // its own stays blank.
    expect(result.current.state).toEqual({ revision: 0, enabled: false });
    expect(result.current.suppressed(undefined)).toBe(true);

    // ...and the honest limit: its true revision is UNKNOWABLE, so it asserts
    // revision 0 and nothing more. Claiming a revision we cannot read would be the
    // fabrication this module forbids — pointed at blocking re-enables, which is
    // exactly what stranded the device.
  });

  it('lets a genuine re-enable SURVIVE A RESTART with a corrupt marker still on disk', async () => {
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}abc`, '1');

    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.observe(observation(9, true)));
    expect(result.current.state).toEqual({ revision: 9, enabled: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
      '{"revision":9,"enabled":true}',
    );

    // THE CRITERION'S OWN LAYER. In-session recovery is NOT the criterion — that
    // is precisely what the replaced test asserted, and why the brick shipped
    // under it. The marker is still on disk here.
    resetMentorNoticePolicyStoreForTests();
    const r1 = mountPolicy();
    await waitFor(() => expect(r1.result.current.hydrated).toBe(true));
    expect(r1.result.current.state).toEqual({ revision: 9, enabled: true });
    expect(r1.result.current.suppressed(observation(9, true))).toBe(false);

    // ...and a LATER deploy is not re-disabled either. On the defect this landed
    // as {20,false}: raising the revision never helped, because the marker
    // re-fired at whatever revision was then held.
    act(() => r1.result.current.observe(observation(20, true)));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    resetMentorNoticePolicyStoreForTests();
    const r2 = mountPolicy();
    await waitFor(() => expect(r2.result.current.hydrated).toBe(true));
    expect(r2.result.current.state).toEqual({ revision: 20, enabled: true });
    expect(r2.result.current.suppressed(observation(20, true))).toBe(false);

    // The marker was never pruned — recovery is NOT achieved by removing it.
    expect(
      await AsyncStorage.getItem(`${floorPrefix(ACTOR, PROFILE)}abc`),
    ).not.toBeNull();
  });

  // ── THE DISCLOSED RESIDUAL, PINNED ────────────────────────────────────────
  //
  // A corrupt marker over an ENABLED state record. This configuration was covered
  // by the test the anti-brick fix replaced, and the replacement seeded the marker
  // ALONE — so the behaviour INVERTED here with nothing left asserting it:
  //
  //   before  state {7,false}  suppressed(undefined)=true   suppressed(obs 7,true)=true
  //   now     state {7,true}   suppressed(undefined)=false  suppressed(obs 7,true)=false
  //
  // THIS IS THE ACCEPTED OUTCOME, NOT A BUG — do not "fix" it back. A corrupt
  // marker's true revision is UNKNOWABLE. The old behaviour asserted one anyway
  // (disable at the HELD revision), and because markers are never pruned it
  // re-fired on every hydration and permanently suppressed notices at any deploy
  // revision. Treating the unknowable revision as 0 is what makes recovery
  // possible; the cost is exactly this — a corrupt marker cannot override a
  // legitimately enabled state record. Pinned so the trade stays visible, because
  // on this Work Item a deleted test was itself green while asserting a defect.
  it('DISCLOSED RESIDUAL: a corrupt marker does not override an enabled state record', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}abc`, '1');

    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.state).toEqual({ revision: 7, enabled: true });
    expect(result.current.suppressed(undefined)).toBe(false);
    expect(result.current.suppressed(observation(7, true))).toBe(false);

    // The fail-closed floor is unaffected: a PARSEABLE marker at the same revision
    // still suppresses, so this residual is scoped to the unknowable case alone.
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}7`, '1');
    resetMentorNoticePolicyStoreForTests();
    const withGoodMarker = mountPolicy();
    await waitFor(() =>
      expect(withGoodMarker.result.current.hydrated).toBe(true),
    );
    expect(withGoodMarker.result.current.state).toEqual({
      revision: 7,
      enabled: false,
    });
    expect(withGoodMarker.result.current.suppressed(undefined)).toBe(true);
  });

  // CONTROL, kept separate so the marker path and the state-record path cannot
  // silently converge again. A corrupt STATE RECORD self-heals because the next
  // write OVERWRITES it; that asymmetry is what made the marker case permanent,
  // and it is what this control pins.
  it('a corrupt STATE RECORD still self-heals across a restart', async () => {
    await seedStored(ACTOR, PROFILE, 'not json');

    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.observe(observation(9, true)));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: true,
    });
    expect(relaunched.result.current.suppressed(observation(9, true))).toBe(
      false,
    );
  });

  // ONE corrupt key must not destroy the floor the GOOD markers establish. This
  // is the fail-open the first pass at the malformed branch had: bailing on the
  // first unparseable suffix discarded every marker already accumulated, so
  // `{…::8, …::abc}` disabled at the HELD revision — the bootstrap 0 when there
  // is no state record — and a stale rev-5 enable was then `newer` than 0 and
  // re-enabled. Same E3, triggered by a single corrupt key.
  it('keeps the floor from GOOD markers when a sibling marker is unparseable', async () => {
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}8`, '1');
    await AsyncStorage.setItem(`${floorPrefix(ACTOR, PROFILE)}abc`, '1');

    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    // The rev-8 floor SURVIVES the corrupt sibling — not lowered to 0.
    expect(result.current.state).toEqual({ revision: 8, enabled: false });
    // ...so the stale intermediate reply is still refused.
    act(() => result.current.observe(observation(5, true)));
    expect(result.current.state).toEqual({ revision: 8, enabled: false });
    expect(result.current.suppressed(undefined)).toBe(true);

    // ...and a genuine deploy above the floor still recovers, so a corrupt key
    // cannot strand the device either.
    act(() => result.current.observe(observation(9, true)));
    expect(result.current.state).toEqual({ revision: 9, enabled: true });
    expect(result.current.suppressed(observation(9, true))).toBe(false);
  });

  // NON-TRIVIALITY CONTROL for the test above. "Always write disabled" and
  // "always hydrate disabled" would both satisfy every assertion there; neither
  // survives this. A clean enabled observation must reach disk as enabled and
  // hydrate as enabled.
  it('durably records an ENABLED observation, so the interleaving test above is not satisfied by always writing disabled', async () => {
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(observation(9, true)));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBe(
        '{"revision":9,"enabled":true}',
      );
    });

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 9,
      enabled: true,
    });
    expect(relaunched.result.current.suppressed(observation(9, true))).toBe(
      false,
    );
  });

  // ── [WI-2911] THE IN-SESSION CONTINUATION ──────────────────────────────────
  //
  // WI-2627 closed the DURABLE class: while blind the state-record write is
  // withheld (`readUntrusted`), a genuine disable diverts to the append-only
  // floor markers, and a restart re-reads them. None of that governs the REST OF
  // THE SESSION. `readAndFold`'s catch folds 'malformed', which disables AT THE
  // HELD REVISION — and at initial hydration the held revision is the bootstrap
  // 0, so the first observation above 0 is `newer` and adopted wholesale,
  // `enabled` included. Every surface carrying no observation of its own then
  // repaints off that state while the disable floor sits unread on disk.
  //
  // The gate is the READ, not the observation. Gating on "an observation is
  // present" would blank notices on every response from a worker predating the
  // field — fleet-wide, on healthy devices. Gating on the read fires only where
  // storage is actually unreadable.
  //
  // Each test below asserts the PROPERTY a surface gets — stays suppressed /
  // becomes enabled — never the internal flag that produces it.
  describe('[WI-2911] storage unreadable, in-session', () => {
    /** Run `body` with the named storage reads rejecting throughout. */
    async function whileUnreadable<T>(
      which: 'state-record' | 'key-enumeration' | 'both',
      body: () => Promise<T>,
    ): Promise<T> {
      const originalGetItem = AsyncStorage.getItem;
      const originalGetAllKeys = AsyncStorage.getAllKeys;
      const boom = () => Promise.reject(new Error('storage unavailable'));
      // Swapped by hand, not via jest.spyOn — the AsyncStorage jest mock does not
      // survive `mockRestore()` here and a half-restored read leaks into every
      // later test in this file (see the note on the WI-2627 read test above).
      if (which !== 'key-enumeration') {
        AsyncStorage.getItem = jest.fn(
          boom,
        ) as unknown as typeof AsyncStorage.getItem;
      }
      if (which !== 'state-record') {
        AsyncStorage.getAllKeys = jest.fn(
          boom,
        ) as unknown as typeof AsyncStorage.getAllKeys;
      }
      try {
        return await body();
      } finally {
        AsyncStorage.getItem = originalGetItem;
        AsyncStorage.getAllKeys = originalGetAllKeys;
      }
    }

    /**
     * Let the persist chain's read-retry ladder (50/150/400ms) run to
     * exhaustion INSIDE the failure window, so no storage work escapes into the
     * next test. Draining here is also what "the failure is still present" means:
     * the ladder gets its full four attempts and recovers nothing.
     */
    async function drainPersist(): Promise<void> {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
    }

    // ── VARIANTS 1-3: WHICH read throws ──────────────────────────────────────
    // All three land in the same catch, and each is reachable on its own: the
    // state record and the floor enumeration are sequential inside one `try`, so
    // a failure of either discards both facts. The seeded record is ENABLED in
    // the enumeration case on purpose — the verdict must not be satisfiable by
    // "the disk happened to say disabled".
    it.each([
      [
        'the state-record read throws',
        'state-record' as const,
        '{"revision":8,"enabled":false}',
      ],
      [
        'the key ENUMERATION throws',
        'key-enumeration' as const,
        '{"revision":8,"enabled":true}',
      ],
      ['BOTH reads throw', 'both' as const, '{"revision":8,"enabled":false}'],
    ])(
      'VARIANT: %s at hydration — a later enabled observation cannot repaint the observation-less surface',
      async (_label, which, seeded) => {
        await seedStored(ACTOR, PROFILE, seeded);

        await whileUnreadable(which, async () => {
          const { result } = mountPolicy();
          await waitFor(() => expect(result.current.hydrated).toBe(true));

          // Immediate post-hydration. This much passes on the base branch too —
          // it is the AC-8 gap the WI-2627 reviewer named, and it is NOT the
          // criterion. The next two lines are.
          expect(result.current.suppressed(undefined)).toBe(true);

          // THE CONTINUATION: a pre-rollback reply — in flight across the
          // flag-off, or replayed out of the persisted query cache — arrives.
          act(() => result.current.observe(observation(5, true)));

          // THE PROPERTY. On the base branch the fold adopts {5,true} as `newer`
          // than the bootstrap 0 and this flips to false, repainting cached
          // notice cards while the rev-8 rollback sits unread on disk.
          expect(result.current.suppressed(undefined)).toBe(true);

          // ...and so is the reply that carries it. [WI-2627] The rev-5 reply in
          // this very test IS the pre-rollback one — it is described as such two
          // assertions above — so expecting it to render was asserting the
          // resurrection rather than guarding against it. The device is blind to
          // the rev-8 disable on disk and has no way to tell this reply from a
          // live one; suppressing both is the only fail-closed answer.
          expect(result.current.suppressed(observation(5, true))).toBe(true);

          await drainPersist();
        });
      },
    );

    // ── VARIANTS 6-8: WHERE the later observation sits ───────────────────────
    // Relative to the rollback revision the device cannot read — the only
    // ordering that means anything here, since the held revision is the
    // bootstrap 0 and EVERY well-formed observation looks `newer` than that.
    // All three are adopted by the fold and all three must still fail to repaint.
    it.each([
      ['ABOVE the unreadable rollback', 9],
      ['AT the unreadable rollback', 8],
      ['BELOW the unreadable rollback', 7],
    ])(
      'VARIANT: an enabled observation %s cannot repaint the observation-less surface',
      async (_label, revision) => {
        await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');

        await whileUnreadable('state-record', async () => {
          const { result } = mountPolicy();
          await waitFor(() => expect(result.current.hydrated).toBe(true));

          act(() => result.current.observe(observation(revision, true)));

          // The fold DID adopt it — this is not vacuous suppression from a state
          // that never moved.
          expect(result.current.state).toEqual({ revision, enabled: true });
          expect(result.current.suppressed(undefined)).toBe(true);

          await drainPersist();
        });
      },
    );

    // ── VARIANT 5: the OTHER half of the hydration/re-read pair ──────────────
    // A device whose hydration SUCCEEDED was enabled from a trusted source, and
    // a later foreground re-read that throws must not revoke that. Getting this
    // wrong strands a device holding a server-issued enable — the failure mode
    // the WI-2627 append-only rework actually shipped once.
    it('VARIANT: a foreground re-read that throws AFTER a successful hydration does not strand the device', async () => {
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
      // Read succeeded, so the observation-less surface renders.
      expect(result.current.suppressed(undefined)).toBe(false);

      await whileUnreadable('state-record', async () => {
        await act(async () => {
          for (const listener of listeners) listener('active');
        });
        // The failed re-read folds 'malformed', which disables at the held
        // revision — unchanged, and correct.
        await waitFor(() => expect(result.current.state.enabled).toBe(false));
        expect(result.current.suppressed(undefined)).toBe(true);

        // A genuine deploy above it turns notices back on, WHILE STILL BLIND.
        // This is the standing an earlier successful read established, and it is
        // why the read gate is monotonic rather than recomputed per read.
        act(() => result.current.observe(observation(8, true)));
        expect(result.current.suppressed(undefined)).toBe(false);

        await drainPersist();
      });
    });

    // ── VARIANT 9: a response carrying NO mentorNoticePolicy field ───────────
    // The pre-field-worker case, and the reason the gate is the READ rather than
    // observation-presence. Both halves matter and they point opposite ways.
    it('VARIANT: a pre-field-worker response still renders on a HEALTHY device — the gate is the read, not the field', async () => {
      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      // No `mentorNoticePolicy` at all. `observe(undefined)` folds nothing, by
      // design, and the payload is judged never-told.
      act(() => result.current.observe(undefined));

      expect(result.current.suppressed(undefined)).toBe(false);
    });

    it('VARIANT: a pre-field-worker response is BLANKED on a device whose storage is unreadable', async () => {
      // The declared cost of gating on the read: a blind device on a pre-field
      // worker sees no notices at all, because its live response carries no
      // observation to be judged on. Bounded to devices that cannot read their
      // own storage — never fleet-wide, which is what gating on the FIELD would
      // have been.
      await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');

      await whileUnreadable('both', async () => {
        const { result } = mountPolicy();
        await waitFor(() => expect(result.current.hydrated).toBe(true));

        // Ordered so the verdict is not satisfiable by a state that never left
        // the bootstrap: a modern worker's reply lands FIRST and drives the store
        // to enabled, and only then does a field-less response arrive. Without
        // the read gate this renders — `observed` and `state.enabled` are both
        // true — off a rollback the device never managed to read.
        act(() => result.current.observe(observation(5, true)));
        expect(result.current.state).toEqual({ revision: 5, enabled: true });

        act(() => result.current.observe(undefined));

        expect(result.current.suppressed(undefined)).toBe(true);

        await drainPersist();
      });
    });

    // ── AC 7: SUPPRESSION HOLDS ACROSS A RESTART, FAILURE STILL PRESENT ─────
    // Asserting recovery in-session only is how a permanent brick ships, so the
    // anti-brick property still has to be here — but [WI-2627] moved WHERE it is
    // obtained. It used to be the live payload: notices came back mid-session on
    // a reply carrying its own observation. That was the fail-open, because a
    // pre-rollback reply is indistinguishable from a live one to a device that
    // cannot read its floor. So while the fault persists there is no recovery
    // surface at all, in either session, and that is deliberate.
    //
    // The brick is ruled out by the half of this test BELOW the fault clearing:
    // the device returns to exactly the state of one that never failed, so the
    // suppression is bounded by the fault rather than durable.
    it('stays fail-closed across a RESTART with the storage failure still present', async () => {
      await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');

      await whileUnreadable('both', async () => {
        // ── session 1 ──
        const first = mountPolicy();
        await waitFor(() => expect(first.result.current.hydrated).toBe(true));
        act(() => first.result.current.observe(observation(5, true)));
        expect(first.result.current.suppressed(undefined)).toBe(true);
        expect(first.result.current.suppressed(observation(5, true))).toBe(
          true,
        );
        await drainPersist();

        // ── restart: all in-memory state gone, storage still rejecting ──
        resetMentorNoticePolicyStoreForTests();

        // ── session 2 ──
        const second = mountPolicy();
        await waitFor(() => expect(second.result.current.hydrated).toBe(true));
        // Fail-closed on the observation-less surface...
        expect(second.result.current.suppressed(undefined)).toBe(true);

        // ...and equally on the reply that carries its own observation, exactly
        // as in session 1. Nothing carried forward — the second blind session is
        // neither more nor less permissive than the first.
        act(() => second.result.current.observe(observation(5, true)));
        expect(second.result.current.suppressed(observation(5, true))).toBe(
          true,
        );
        expect(second.result.current.suppressed(undefined)).toBe(true);

        await drainPersist();
      });

      // ── AC 4, the other side: the fault clears, and the device is unchanged
      // from a device that never had one. The durable rev-8 rollback is still
      // there and still governs — nothing about the blind sessions above lowered
      // it, and nothing about them stranded the device either.
      resetMentorNoticePolicyStoreForTests();
      const healed = mountPolicy();
      await waitFor(() => expect(healed.result.current.hydrated).toBe(true));
      expect(healed.result.current.state).toEqual({
        revision: 8,
        enabled: false,
      });
      act(() => healed.result.current.observe(observation(9, true)));
      expect(healed.result.current.suppressed(undefined)).toBe(false);
    });

    // ── AC 4: HEALTHY COLD START UNCHANGED ───────────────────────────────────
    // The control for every suppression above. If the read gate leaked onto the
    // healthy path, this is what would catch it.
    it('leaves a healthy warm start rendering its observation-less surface', async () => {
      await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');

      const { result } = mountPolicy();
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      expect(result.current.suppressed(undefined)).toBe(false);
      expect(result.current.suppressed(observation(7, true))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-2781] A MALFORMED POLICY FIELD MUST NOT SET A DURABLE DISABLE
//
// Asserted at the OBSERVE SEAM (the hook's `observe`, which is what the four
// production sites call) rather than against the reducer. A reducer-level
// assertion sits one layer below the seam and would pass while the defect
// ships, because the question is what the observe path PERSISTS, not how the
// pure fold behaves.
//
// THE DECISION (AC-1): a malformed FIELD suppresses IN-SESSION ONLY, and the
// durable write is withheld. Reasoning: 'malformed' means a message arrived
// that could not be read — an absence of information, not an instruction from
// the server. Treating it as a durable disable conflates "we could not read one
// response" with "the server told us to stop", and because a same-revision fold
// keeps a disable, one corrupted field then bricks notices on that device until
// a deployment bumps the revision. Fail-closed is preserved for the session; it
// is the DURABILITY that is wrong, so that is what this bounds.
//
// A well-formed observation clears the in-session suppression, because a
// readable message is exactly the information whose absence caused it.
// ---------------------------------------------------------------------------

describe('[WI-2781] malformed policy FIELD at the observe seam', () => {
  const MALFORMED = { rolloutRevision: 'not-a-number' } as unknown as undefined;

  async function drain(): Promise<void> {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
  }

  beforeEach(async () => {
    resetMentorNoticePolicyStoreForTests();
    await AsyncStorage.clear();
  });

  it('VARIANT (e): does not survive a relaunch — the durable record is untouched', async () => {
    // The variant the whole item is about. An in-session-only assertion cannot
    // detect a durability defect, so this one is the load-bearing case.
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');

    const first = mountPolicy();
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    expect(first.result.current.state).toEqual({ revision: 5, enabled: true });

    act(() => first.result.current.observe(MALFORMED));
    // Fail-closed FOR THE SESSION is intended and preserved.
    expect(first.result.current.suppressed(undefined)).toBe(true);
    await drain();

    // ...but nothing about it may reach the disk.
    const persisted = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));
    expect(JSON.parse(persisted as string)).toEqual({
      revision: 5,
      enabled: true,
    });

    // ── relaunch ──
    resetMentorNoticePolicyStoreForTests();
    const second = mountPolicy();
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.state).toEqual({ revision: 5, enabled: true });
    expect(second.result.current.suppressed(observation(5, true))).toBe(false);
  });

  it('VARIANT (a): a well-formed observation at the SAME revision recovers in-session', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(MALFORMED));
    expect(result.current.suppressed(undefined)).toBe(true);

    // No revision bump — the recovery path AC-2 requires.
    act(() => result.current.observe(observation(5, true)));
    expect(result.current.suppressed(undefined)).toBe(false);
    expect(result.current.state).toEqual({ revision: 5, enabled: true });
  });

  it('VARIANT (a2): a STALE well-formed observation does NOT recover — the fold discarded it', async () => {
    // The reducer refuses to act on an out-of-order older reply. A message the
    // fold itself ignored cannot be the readable observation that retires the
    // suppression, or a late revision-6 arrival re-shows retained revision-7
    // payloads after a malformed field that may have carried a rollback.
    await seedStored(ACTOR, PROFILE, '{"revision":7,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(MALFORMED));
    expect(result.current.suppressed(undefined)).toBe(true);

    act(() => result.current.observe(observation(6, true)));
    expect(result.current.suppressed(undefined)).toBe(true);
    // The held state is untouched — this is the discard, not a disable.
    expect(result.current.state).toEqual({ revision: 7, enabled: true });

    // ...and a non-stale observation still recovers, so the flag is bounded.
    act(() => result.current.observe(observation(7, true)));
    expect(result.current.suppressed(undefined)).toBe(false);
  });

  it('VARIANT (b): repeated corruption stays suppressed, and still writes nothing', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(MALFORMED));
    act(() => result.current.observe(MALFORMED));
    act(() => result.current.observe(MALFORMED));
    expect(result.current.suppressed(undefined)).toBe(true);
    await drain();

    const persisted = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));
    expect(JSON.parse(persisted as string)).toEqual({
      revision: 5,
      enabled: true,
    });
  });

  it('VARIANT (c): corruption while ALREADY disabled leaves the genuine disable durable', async () => {
    // AC-3's control. The genuine rollback must not be weakened by anything
    // this item does, so the disable has to still be on disk afterwards.
    await seedStored(ACTOR, PROFILE, '{"revision":8,"enabled":false}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(MALFORMED));
    await drain();

    const persisted = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));
    expect(JSON.parse(persisted as string)).toEqual({
      revision: 8,
      enabled: false,
    });

    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.state).toEqual({
      revision: 8,
      enabled: false,
    });
  });

  it('VARIANT (d): on a never-told device, corruption does not manufacture a told state', async () => {
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(MALFORMED));
    expect(result.current.suppressed(undefined)).toBe(true);
    await drain();

    // Writing anything here would move the device from never-told to told on the
    // strength of a message it could not read, and never-told is what lets a
    // legitimate cached projection keep painting after a relaunch.
    expect(await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))).toBeNull();

    // The two senses of "told" are different, and only the durable one is
    // withheld. IN-SESSION the device IS told: a malformed field is something
    // arriving, so `observed` moves and the never-told benefit of the doubt is
    // forfeited for this session — asserted directly rather than left to ride
    // on `malformedSuppressed` being read first.
    expect(result.current.observed).toBe(true);

    // ── relaunch ── nothing was written, so the fresh process is never-told
    // again and a legitimate cached projection may keep painting.
    resetMentorNoticePolicyStoreForTests();
    const relaunched = mountPolicy();
    await waitFor(() => expect(relaunched.result.current.hydrated).toBe(true));
    expect(relaunched.result.current.observed).toBe(false);
  });

  it('AC-3 control: a genuine server disable is still durable, and a HIGHER revision still re-enables', async () => {
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');
    const { result } = mountPolicy();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.observe(observation(6, false)));
    await drain();
    expect(
      JSON.parse(
        (await AsyncStorage.getItem(stateKey(ACTOR, PROFILE))) as string,
      ),
    ).toEqual({ revision: 6, enabled: false });

    // Strictly higher re-enables — asserted rather than assumed, per AC-3.
    act(() => result.current.observe(observation(7, true)));
    expect(result.current.state).toEqual({ revision: 7, enabled: true });
    expect(result.current.suppressed(observation(7, true))).toBe(false);
  });

  it('a malformed field and a genuine disable remain distinguishable', async () => {
    // AC-4: the two must not collapse into one indistinguishable state.
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');

    const corrupted = mountPolicy();
    await waitFor(() => expect(corrupted.result.current.hydrated).toBe(true));
    act(() => corrupted.result.current.observe(MALFORMED));
    await drain();
    const afterMalformed = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));

    resetMentorNoticePolicyStoreForTests();
    await AsyncStorage.clear();
    await seedStored(ACTOR, PROFILE, '{"revision":5,"enabled":true}');

    const disabled = mountPolicy();
    await waitFor(() => expect(disabled.result.current.hydrated).toBe(true));
    act(() => disabled.result.current.observe(observation(5, false)));
    await drain();
    const afterDisable = await AsyncStorage.getItem(stateKey(ACTOR, PROFILE));

    expect(afterMalformed).not.toEqual(afterDisable);
  });
});
