import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  mentorNoticePolicyObservationSchema,
  type MentorNoticePolicyObservation,
} from '@eduagent/schemas';

import { Sentry } from './sentry';
import { MENTOR_NOTICE_POLICY_STATE_KEY_PREFIX as KEY_PREFIX } from './secure-store-keys';

// ---------------------------------------------------------------------------
// [WI-2627] Client-side monotonic mentor-notice rollout state
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS AND WHY IT IS NOT `useObservedPolicyEpoch`. WI-2504 gave the
// client one OPAQUE epoch and keys its persisted projection on it. An epoch is
// comparable for EQUALITY only, so two responses carrying different epochs
// cannot be ordered and the later-ARRIVING one wins whatever it says. That is
// enough to invalidate a cache and not enough to survive a rollback: a reply
// that left the server before an emergency flag-off, arriving after one that
// left after it, re-enables the surface.
//
// So this module holds the ORDER, and `useObservedPolicyEpoch`
// (hooks/use-now-feed.ts) keeps holding the cache key. They are deliberately
// two things:
//
//   epoch    — "what key does my cache live under" (equality; opaque; never
//              parsed, per Stage 1's contract in packages/schemas)
//   revision — "may notices be shown at all, and does this payload predate
//              what I already know" (ordered)
//
// Deriving `enabled` from the epoch would mean parsing the opaque token, which
// Stage 1 explicitly forbids, AND would latch a per-request tightening (proxy,
// non-subject, consent-withdrawn — all of which change the epoch but NOT the
// deployment rollout flag) into a monotonic disabled-wins field. One proxy read
// would then disable the surface for the same learner's own legitimate read at
// the same revision until a deploy bumped it. See the field-by-field rationale
// on `mentorNoticePolicyObservationSchema`.
//
// DEFENCE IN DEPTH, NOT THE GATE. The server's visibility predicate V is the
// control: a flag-off worker strips notice data from every response regardless
// of client vintage. This store exists so a CACHED or IN-FLIGHT projection
// cannot resurrect notices the client has already been told are void.

/**
 * What this device knows about the mentor-notice rollout, for one
 * (actor, profile) pair.
 */
export type MentorNoticePolicyState = {
  /** Highest deployment rollout revision this device has ever observed. */
  revision: number;
  /** Whether notices may be shown at that revision. */
  enabled: boolean;
};

/**
 * The state a device has before it has read anything back from storage, and the
 * state every fail-closed path lands on.
 *
 * Revision 0 is the LOWEST admissible revision (Stage 1 clamps a malformed
 * `MENTOR_NOTICE_POLICY_REVISION` binding to 0 for the same reason), and
 * re-enabling requires a STRICTLY HIGHER revision, so a device sitting on the
 * bootstrap can be re-enabled by any genuine observation but can never be
 * re-enabled by a replayed or malformed one.
 */
export const MENTOR_NOTICE_POLICY_BOOTSTRAP: MentorNoticePolicyState = {
  revision: 0,
  enabled: false,
};

/**
 * A policy signal, normalised out of whatever medium delivered it.
 *
 * The three cases are NOT interchangeable and each has its own acceptance rule
 * (see `reduceMentorNoticePolicy`):
 *
 *   a state      — a well-formed observation or stored record
 *   'malformed'  — something arrived and could not be trusted
 *   'absent'     — nothing arrived at all
 */
export type MentorNoticePolicySignal =
  | MentorNoticePolicyState
  | 'malformed'
  | 'absent';

/**
 * How a candidate revision sits relative to the one already held.
 *
 * `compareRevision` below is the ONLY site in the client where two revisions
 * are ever compared. Both the monotonic fold and the stale-payload test consume
 * its verdict rather than re-deriving it; a second comparison site is how this
 * invariant gets silently lost.
 */
type RevisionOrder = 'older' | 'same' | 'newer';

function compareRevision(candidate: number, held: number): RevisionOrder {
  if (candidate < held) return 'older';
  if (candidate > held) return 'newer';
  return 'same';
}

/**
 * Normalise an observation as it appeared on the wire.
 *
 * `undefined` — the field was absent from the response entirely — is 'absent',
 * NOT a disable. A worker predating the field carries no rollback signal in
 * either direction: it strips notice data anyway if the flag is off, and
 * flag-off already changes `projectionEpoch`, which keys the cache. Treating
 * absence as a disable would blank notices fleet-wide any time a pre-field
 * worker answered. `null`, a wrong-typed value, or a negative/non-integer
 * revision is 'malformed' — something DID arrive and cannot be trusted.
 */
export function observationSignal(
  observation: MentorNoticePolicyObservation | undefined | unknown,
): MentorNoticePolicySignal {
  if (observation === undefined) return 'absent';
  const parsed = mentorNoticePolicyObservationSchema.safeParse(observation);
  if (!parsed.success) return 'malformed';
  return {
    revision: parsed.data.rolloutRevision,
    enabled: parsed.data.rolloutEnabled,
  };
}

const storedRecordSchema = z.object({
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
});

/**
 * Normalise a record read back from AsyncStorage.
 *
 * `null` (no record — fresh install, or a build predating this key) is
 * 'absent', which the reducer resolves to "keep what you have": at hydration
 * time that is the bootstrap, which is already the fail-closed state. A record
 * that is present but unparseable is 'malformed' and disables.
 */
export function storedSignal(raw: string | null): MentorNoticePolicySignal {
  if (raw === null) return 'absent';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'malformed';
  }
  const result = storedRecordSchema.safeParse(parsed);
  return result.success ? result.data : 'malformed';
}

/**
 * THE monotonic fold. Every revision that reaches this client passes through
 * here, and nothing else decides whether policy state moves.
 *
 *   older  → ignore. A payload from before what we know cannot inform us.
 *   same   → disabled wins (`current.enabled && next.enabled`), so a disable
 *            observed at revision N can never be undone at revision N. This is
 *            what makes "re-enable requires a strictly higher revision" true by
 *            construction rather than by a separate rule.
 *   newer  → adopt wholesale. A deploy that raises the revision is the only
 *            thing that can re-enable.
 *
 * Fail-closed cases:
 *   'malformed' → disable AT THE CURRENT REVISION. Not at revision 0: dropping
 *                 the revision would make the next stale-but-valid observation
 *                 at the real revision look 'newer' and re-enable. Holding the
 *                 revision means a malformed payload can never re-enable under
 *                 any arrival order.
 *   'absent'    → keep current. Nothing was observed; a device is never
 *                 credited with, nor punished for, a change it did not receive.
 *
 * Returns `current` by identity when nothing changes, so `useSyncExternalStore`
 * does not re-render on every response.
 */
export function reduceMentorNoticePolicy(
  current: MentorNoticePolicyState,
  next: MentorNoticePolicySignal,
): MentorNoticePolicyState {
  if (next === 'absent') return current;
  if (next === 'malformed') {
    return current.enabled
      ? { revision: current.revision, enabled: false }
      : current;
  }

  switch (compareRevision(next.revision, current.revision)) {
    case 'older':
      return current;
    case 'same': {
      const enabled = current.enabled && next.enabled;
      return enabled === current.enabled
        ? current
        : { revision: current.revision, enabled };
    }
    case 'newer':
      return { revision: next.revision, enabled: next.enabled };
  }
}

/**
 * What this device knows, as the payload test below needs it.
 *
 * `observed` is the distinction the bootstrap alone cannot express, and getting
 * it wrong inverts a shipped guarantee. `{revision: 0, enabled: false}` is BOTH
 * "this device has been told nothing" and "policy is off at revision 0", and
 * those two must behave differently for a payload that carries no observation of
 * its own: a never-told device keeps serving what it legitimately cached
 * (WI-2504's rule, and its tests), while a device that HAS been told the rollout
 * is off must blank that same cache. Tracked outside
 * `MentorNoticePolicyState` because it is not something revisions order — it is
 * whether any ordering has happened at all.
 */
export type MentorNoticePolicyKnowledge = {
  state: MentorNoticePolicyState;
  /** Has any real signal — wire or stored — ever been folded in? */
  observed: boolean;
  hydrated: boolean;
};

/**
 * Whether a signal counts as having been TOLD something.
 *
 * 'malformed' does: a record or field was present and could not be trusted, so
 * the device is not entitled to the never-told benefit of the doubt. 'absent'
 * does not — nothing arrived.
 */
export function signalIsObservation(signal: MentorNoticePolicySignal): boolean {
  return signal !== 'absent';
}

/**
 * Whether a PAYLOAD's notice content must be suppressed, given what this device
 * knows.
 *
 * Distinct from the fold above, and both are required. The fold keeps STATE
 * correct; this keeps a single response from painting notices even when state is
 * already correct — a `/now` reply that left the server at revision 6 and lands
 * after the client learned revision 7 carries pre-rollback cards, and the fold
 * (which correctly ignores its observation) does nothing about its cards.
 *
 * Suppressed when any of:
 *   - not hydrated: nothing may render off a projection before the stored
 *     observation is back (the cold-offline-launch case WI-2504 established);
 *   - the payload's own observation is malformed;
 *   - the payload carries NO observation and this device HAS been told the
 *     rollout is off — the cached-resurrection case this store exists for;
 *   - the payload carries an observation, and policy is off at the revision we
 *     hold, or that observation is STRICTLY OLDER than the revision we hold.
 *
 * NOT suppressed when the payload carries no observation and this device has
 * never been told anything: the server's predicate V is the control and has
 * already stripped notice data if the flag is off, so a pre-field worker's
 * response (or a legitimately cached projection on a device that has only ever
 * been offline) must keep rendering. Treating that as a disable would blank
 * notices fleet-wide the moment a pre-field worker answered.
 *
 * Note the asymmetry in the last clause: an observation at the SAME revision is
 * not stale even when it says disabled — it must still disable, which the fold
 * does, and the `!enabled` check then suppresses. Only strictly-older is stale.
 */
export function noticesSuppressedForPayload(
  knowledge: MentorNoticePolicyKnowledge,
  observation: MentorNoticePolicyObservation | undefined | unknown,
): boolean {
  if (!knowledge.hydrated) return true;
  const signal = observationSignal(observation);
  if (signal === 'malformed') return true;
  if (signal === 'absent') {
    return knowledge.observed ? !knowledge.state.enabled : false;
  }
  if (!knowledge.state.enabled) return true;
  return compareRevision(signal.revision, knowledge.state.revision) === 'older';
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

function storageKey(actorId: string, profileId: string): string {
  return `${KEY_PREFIX}::${actorId}::${profileId}`;
}

export type MentorNoticePolicySnapshot = MentorNoticePolicyKnowledge;

type Entry = {
  snapshot: MentorNoticePolicySnapshot;
  listeners: Set<() => void>;
  hydrating: boolean;
};

const UNBOUND_SNAPSHOT: MentorNoticePolicySnapshot = {
  state: MENTOR_NOTICE_POLICY_BOOTSTRAP,
  observed: false,
  hydrated: false,
};

/**
 * One entry per (actor, profile). Actor-keyed for the WI-2498/WI-2504 reason:
 * a guardian selecting their child's profile and the child themselves resolve
 * to the same profileId, so a profile-only key would let one actor inherit the
 * other's policy state. Module-level rather than React state so every mounted
 * consumer of the same pair shares ONE observation — the concurrency bug
 * WI-2504 bounce 2 fixed for the epoch, avoided here by construction.
 */
const entries = new Map<string, Entry>();

function getEntry(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      snapshot: {
        state: MENTOR_NOTICE_POLICY_BOOTSTRAP,
        observed: false,
        hydrated: false,
      },
      listeners: new Set(),
      hydrating: false,
    };
    entries.set(key, entry);
  }
  return entry;
}

function commit(
  entry: Entry,
  state: MentorNoticePolicyState,
  observed: boolean,
  hydrated: boolean,
): void {
  const previous = entry.snapshot;
  if (
    previous.state === state &&
    previous.observed === observed &&
    previous.hydrated === hydrated
  ) {
    return;
  }
  entry.snapshot = { state, observed, hydrated };
  for (const listener of entry.listeners) listener();
}

/**
 * Backoff delays between retried `setItem` attempts. Sized for the transient
 * case this exists to cover — a momentary OS-level write hiccup or lock, not
 * sustained disk pressure — so a real disable-write recovers within a couple
 * hundred milliseconds instead of being lost to a single rejected call.
 */
const PERSIST_RETRY_DELAYS_MS = [50, 150, 400];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * [WI-2627] Retry a disable-write across transient `setItem` failures.
 *
 * `persist` is fire-and-forget (`void persist(...)`) and its only caller
 * already committed the correct state to memory before calling it — so a
 * failed write never corrupts THIS session. What it can corrupt is the NEXT
 * one: a relaunch reads whatever `setItem` last durably wrote, and a single
 * rejected write silently leaves that durable record at its previous,
 * more-permissive value. A disable the device believes it recorded can then
 * be resurrected on relaunch even though the in-memory fold was correct the
 * whole time.
 *
 * Two shapes considered and rejected:
 *   - A dirty marker written into the same store is not sound: it fails
 *     under exactly the disk-full case this exists to cover, since both
 *     writes fail together.
 *   - `removeItem` on write failure alone is insufficient: an absent record
 *     hydrates as never-told, and never-told lets the cached projection
 *     keep painting.
 *
 * Retrying with backoff is the defensible shape: it recovers the common
 * transient failure (the case this device most likely to hit) without
 * inventing a second fallible write path. RESIDUAL, recorded rather than
 * papered over: under sustained/unbounded failure (e.g. disk genuinely
 * full for the retry window), the write can still never land, and a
 * relaunch during that window can still read a stale record. In-session
 * behaviour stays fail-closed throughout — only the durable record can lag.
 */
async function persist(
  key: string,
  state: MentorNoticePolicyState,
): Promise<void> {
  const payload = JSON.stringify(state);
  let lastError: unknown;
  for (let attempt = 0; attempt <= PERSIST_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await AsyncStorage.setItem(key, payload);
      return;
    } catch (err) {
      lastError = err;
      const backoff = PERSIST_RETRY_DELAYS_MS[attempt];
      if (backoff !== undefined) await delay(backoff);
    }
  }
  Sentry.captureException(lastError, {
    tags: { feature: 'mentor_notice_policy', op: 'write' },
  });
}

/**
 * Read storage and fold the result in. Used for the once-per-pair hydration AND
 * for the foreground re-read below — both go through the same reducer, which is
 * what makes the re-read safe (see `useMentorNoticePolicy`).
 *
 * A storage THROW is 'malformed', not 'absent': "storage failure remains
 * fail-closed" per the acceptance criteria. It disables at the held revision,
 * so it can never re-enable and never resurrects a lower revision.
 */
async function readAndFold(key: string, entry: Entry): Promise<void> {
  let signal: MentorNoticePolicySignal;
  try {
    signal = storedSignal(await AsyncStorage.getItem(key));
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'mentor_notice_policy', op: 'read' },
    });
    signal = 'malformed';
  }
  commit(
    entry,
    reduceMentorNoticePolicy(entry.snapshot.state, signal),
    // A stored record that EXISTS (even unparseably) means this device was told
    // something and persisted it; only its genuine absence leaves the device
    // never-told.
    entry.snapshot.observed || signalIsObservation(signal),
    true,
  );
}

function hydrateOnce(key: string, entry: Entry): void {
  if (entry.hydrating || entry.snapshot.hydrated) return;
  entry.hydrating = true;
  void readAndFold(key, entry);
}

/** Test seam: drop all in-memory policy state. */
export function resetMentorNoticePolicyStoreForTests(): void {
  entries.clear();
}

/**
 * [WI-2627] Fold a signal for an EXPLICIT (actor, profile) pair, outside React.
 *
 * The hook's `observe`/`suppressed` read whatever pair is bound at the current
 * render. That is wrong for any operation that OUTLIVES a render — an in-flight
 * XHR stream, most of all. The response belongs to the profile that was active
 * when the request went out, so its observation must be folded into THAT pair's
 * store, not whichever pair happens to be active when the stream terminates.
 * Folding into the wrong pair persists one profile's rollout state under
 * another's key and judges one profile's notice against another's history —
 * breaking the actor-keying guarantee WI-2498/WI-2504 established.
 *
 * `null`/`undefined` on either id means there is no pair to fold into; the call
 * is a no-op rather than a write under a guessed key.
 */
export function foldMentorNoticePolicyFor(
  actorId: string | null | undefined,
  profileId: string | null | undefined,
  signal: MentorNoticePolicySignal,
): void {
  if (!actorId || !profileId) return;
  if (!signalIsObservation(signal)) return;
  const key = storageKey(actorId, profileId);
  const entry = getEntry(key);
  const next = reduceMentorNoticePolicy(entry.snapshot.state, signal);
  commit(entry, next, true, entry.snapshot.hydrated);
  void persist(key, next);
}

/**
 * [WI-2627] The payload-suppression verdict for an EXPLICIT (actor, profile)
 * pair, outside React. Same reason as `foldMentorNoticePolicyFor`: an operation
 * that outlives a render must ask about the pair its request was issued under.
 *
 * An unbound pair has no history and no key, so the payload is judged on its own
 * observation alone — the same rule the hook applies when auth has not resolved.
 */
export function mentorNoticePolicySuppressesPayloadFor(
  actorId: string | null | undefined,
  profileId: string | null | undefined,
  observation: MentorNoticePolicyObservation | undefined,
): boolean {
  const signal = observationSignal(observation);
  if (!actorId || !profileId) {
    return noticesSuppressedForPayload(
      {
        state: reduceMentorNoticePolicy(MENTOR_NOTICE_POLICY_BOOTSTRAP, signal),
        observed: signalIsObservation(signal),
        hydrated: true,
      },
      observation,
    );
  }
  return noticesSuppressedForPayload(
    getEntry(storageKey(actorId, profileId)).snapshot,
    observation,
  );
}

/**
 * This device's mentor-notice rollout state for (actor, profile), plus the two
 * verdicts every notice-bearing surface needs.
 *
 * ON "HYDRATED ONCE": hydration runs once per (actor, profile) — but the store
 * ALSO re-reads storage when the app is foregrounded, and that is deliberate,
 * not a regression of WI-2504's decision to omit a `staleTime` so a fresh mount
 * re-reads storage. Both exist for the same reason: storage can change out from
 * under a mounted tree (another actor's session, a background write). What
 * makes the re-read safe here — and what WI-2504 could not have, with an
 * equality-only epoch — is that it routes through `reduceMentorNoticePolicy`,
 * so a stale lower-or-equal read cannot re-enable anything.
 */
export function useMentorNoticePolicy(
  actorId: string | null | undefined,
  profileId: string | null | undefined,
): {
  state: MentorNoticePolicyState;
  /** Whether any real signal has ever been folded in for this pair. */
  observed: boolean;
  hydrated: boolean;
  /** Fold an observation off any surface into the shared state. */
  observe: (observation: MentorNoticePolicyObservation | undefined) => void;
  /**
   * Record a fail-closed `malformed` signal when the observation could not be
   * reached at all — e.g. the whole response failed schema validation, so no
   * observation value exists to pass to `observe`.
   */
  observeMalformed: () => void;
  /** Whether THIS payload's notice content must be suppressed. */
  suppressed: (
    observation: MentorNoticePolicyObservation | undefined,
  ) => boolean;
} {
  const bound = !!actorId && !!profileId;
  const key = bound ? storageKey(actorId, profileId) : null;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!key) return () => undefined;
      const entry = getEntry(key);
      entry.listeners.add(onStoreChange);
      hydrateOnce(key, entry);
      return () => {
        entry.listeners.delete(onStoreChange);
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): MentorNoticePolicySnapshot => {
    if (!key) return UNBOUND_SNAPSHOT;
    return getEntry(key).snapshot;
  }, [key]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Foreground re-read. Routed through the reducer, so it can only ever move
  // state toward "disabled" or a strictly higher revision.
  useEffect(() => {
    if (!key) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void readAndFold(key, getEntry(key));
    });
    return () => sub.remove();
  }, [key]);

  const observe = useCallback(
    (observation: MentorNoticePolicyObservation | undefined) => {
      // Persists even when the reduced state is unchanged: the first
      // observation of an already-matching state (e.g. {0,false} arriving at
      // the bootstrap) moves no revision but DOES move this device from
      // never-told to told, and that has to survive a relaunch or the next cold
      // start would hand a cached projection the never-told benefit of the
      // doubt. See `foldMentorNoticePolicyFor`.
      foldMentorNoticePolicyFor(
        actorId,
        profileId,
        observationSignal(observation),
      );
    },
    [actorId, profileId],
  );

  const observeMalformed = useCallback(() => {
    foldMentorNoticePolicyFor(actorId, profileId, 'malformed');
  }, [actorId, profileId]);

  // Reads the LIVE store rather than this render's snapshot. In render the two
  // agree (both come from the same entry, and `useSyncExternalStore` re-renders
  // on every commit). The difference matters in an imperative callback that has
  // just called `observe`: the SSE done frame that carries a notice is also the
  // frame that can carry the disable voiding it, and a snapshot-based answer
  // would be one render stale — it would paint the notice it was told to drop.
  const suppressed = useCallback(
    (observation: MentorNoticePolicyObservation | undefined) =>
      mentorNoticePolicySuppressesPayloadFor(actorId, profileId, observation),
    [actorId, profileId],
  );

  return useMemo(
    () => ({
      state: snapshot.state,
      observed: bound ? snapshot.observed : true,
      hydrated: bound ? snapshot.hydrated : true,
      observe,
      observeMalformed,
      suppressed,
    }),
    [
      snapshot.state,
      snapshot.observed,
      snapshot.hydrated,
      bound,
      observe,
      observeMalformed,
      suppressed,
    ],
  );
}
