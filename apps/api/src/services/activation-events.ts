import {
  activationEvents,
  type ActivationEvent,
  type Database,
} from '@eduagent/database';
import type {
  ActivationEventType,
  ActivationProfileShape,
} from '@eduagent/schemas';

import { safeWrite } from './safe-non-core';

export interface RecordActivationEventInput {
  eventType: ActivationEventType;
  profileId?: string | null;
  anonymousId?: string | null;
  occurredAt?: Date;
  environment?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  profileShape?: ActivationProfileShape | null;
  route?: string | null;
  /**
   * Uniquely identifies this occurrence for dedupe purposes. Because
   * `profileId` is nullable (pre-signup events), the DB unique index is on
   * `dedupeKey` alone — build it so it already encodes the actor. Two
   * shapes are common:
   *  - "first-only" events (first_session_started, onboarding_completed,
   *    signup_completed): key by `activation=<type>|profile=<id>` so only
   *    the first occurrence per profile survives `onConflictDoNothing`.
   *  - per-occurrence events (review_card_seen, app_opened): key by
   *    `buildActivationEventDedupeKey` with an `occurrenceKey` (e.g. a
   *    session id, card id, or day bucket) so repeats don't collide.
   */
  dedupeKey?: string;
  occurrenceKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordActivationEventSafelyInput extends Omit<
  RecordActivationEventInput,
  'profileShape'
> {
  profileMeta?: { isOwner: boolean } | null;
  profileShape?: ActivationProfileShape | null;
}

/**
 * Best-effort profileShape derivation from the route-level ProfileMeta.
 * ProfileMeta (middleware/profile-scope.ts) exposes `isOwner` but not
 * `hasFamilyLinks`, so a true owner cannot be distinguished from a guardian
 * without an extra query — deliberately not done here (this is telemetry,
 * not a security decision). Only `child` is asserted confidently
 * (isOwner === false); an owner-context row is tagged 'unknown' unless the
 * caller has independent proof of shape (e.g. the bootstrap route, which
 * knows the freshly-created owner has no children yet — see
 * routes/profiles.ts). See docs/runbooks/activation-funnel-queries.md for
 * how to join to `profiles.has_family_links` for exact segmentation.
 */
export function deriveActivationProfileShape(profileMeta: {
  isOwner: boolean;
}): ActivationProfileShape {
  return profileMeta.isOwner === false ? 'child' : 'unknown';
}

export function buildActivationEventDedupeKey(
  input: Pick<RecordActivationEventInput, 'eventType'> & {
    actorKey: string;
    occurrenceKey?: string | null;
  },
): string {
  const encodeSegment = (value: string) => encodeURIComponent(value);
  const encodeOptionalSegment = (value?: string | null) =>
    value == null ? 'null' : `value(${encodeSegment(value)})`;

  return [
    `activation=${encodeSegment(input.eventType)}`,
    `actor=${encodeSegment(input.actorKey)}`,
    `occurrence=${encodeOptionalSegment(input.occurrenceKey)}`,
  ].join('|');
}

export function buildActivationEventOccurrenceKey(input: {
  occurrenceId?: string | null;
  occurredAt: Date;
}): string {
  return input.occurrenceId ?? input.occurredAt.toISOString().slice(0, 10);
}

/**
 * Records a launch-activation funnel event. Intended to always be called
 * through `safeWrite()` (apps/api/src/services/safe-non-core.ts) so a write
 * failure never breaks the surrounding user action — this is telemetry, not
 * a core flow.
 *
 * NEVER pass raw learning content or sensitive child data in `metadata` —
 * this table is funnel telemetry (counts, timing, route/source, build
 * info), not a content log.
 */
export async function recordActivationEvent(
  db: Database,
  input: RecordActivationEventInput,
): Promise<ActivationEvent | null> {
  const actorKey = input.profileId ?? input.anonymousId ?? 'unknown';
  const dedupeKey =
    input.dedupeKey ??
    buildActivationEventDedupeKey({
      eventType: input.eventType,
      actorKey,
      occurrenceKey: input.occurrenceKey,
    });

  const [row] = await db
    .insert(activationEvents)
    .values({
      profileId: input.profileId ?? null,
      anonymousId: input.anonymousId ?? null,
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date(),
      environment: input.environment ?? null,
      appVersion: input.appVersion ?? null,
      platform: input.platform ?? null,
      profileShape: input.profileShape ?? null,
      route: input.route ?? null,
      dedupeKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [activationEvents.dedupeKey],
    })
    .returning();

  return row ?? null;
}

export async function recordActivationEventSafely(
  db: Database,
  input: RecordActivationEventSafelyInput,
  surface: string,
  context?: Record<string, unknown>,
): Promise<ActivationEvent | null> {
  const { profileMeta, ...eventInput } = input;
  const profileShape =
    eventInput.profileShape !== undefined
      ? eventInput.profileShape
      : profileMeta
        ? deriveActivationProfileShape(profileMeta)
        : null;
  let recorded: ActivationEvent | null = null;

  await safeWrite(
    async () => {
      recorded = await recordActivationEvent(db, {
        ...eventInput,
        profileShape,
      });
      return recorded;
    },
    surface,
    context,
  );

  return recorded;
}
