/**
 * [WI-1504] Trust-boundary contract for the activation-events ingest schema.
 *
 * The ingest request (`POST /v1/activation-events`) must accept ONLY the six
 * client-observed event types and REJECT the four server-owned types
 * (signup_completed, first_subject_or_lesson_started, first_session_started,
 * first_session_completed) at the Zod boundary. A client that could forge a
 * server-owned funnel event would corrupt the launch funnel metrics.
 *
 * This is the fast RED-GREEN guard: if
 * `activationEventIngestRequestSchema.eventType` is ever widened back to the
 * full `activationEventTypeSchema`, the "rejects each server-owned type" case
 * fails.
 */

import {
  activationEventIngestRequestSchema,
  activationEventTypeSchema,
  clientActivationEventTypeSchema,
} from './activation-events.js';

const CLIENT_TYPES = [
  'app_opened',
  'signup_started',
  'onboarding_completed',
  'review_card_seen',
  'review_card_tapped',
  'day2_return',
] as const;

const SERVER_OWNED_TYPES = [
  'signup_completed',
  'first_subject_or_lesson_started',
  'first_session_started',
  'first_session_completed',
] as const;

describe('clientActivationEventTypeSchema', () => {
  it('accepts every client-observed event type', () => {
    for (const t of CLIENT_TYPES) {
      expect(clientActivationEventTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects every server-owned event type', () => {
    for (const t of SERVER_OWNED_TYPES) {
      expect(clientActivationEventTypeSchema.safeParse(t).success).toBe(false);
    }
  });

  it('is a strict subset of the full activationEventTypeSchema', () => {
    // Every client type is a valid full type; the union of client + server
    // types reconstructs the full enum (no drift between the two lists).
    for (const t of CLIENT_TYPES) {
      expect(activationEventTypeSchema.safeParse(t).success).toBe(true);
    }
    for (const t of SERVER_OWNED_TYPES) {
      expect(activationEventTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(new Set([...CLIENT_TYPES, ...SERVER_OWNED_TYPES]).size).toBe(
      activationEventTypeSchema.options.length,
    );
  });
});

describe('activationEventIngestRequestSchema — server-owned type rejection', () => {
  it('accepts a well-formed client event', () => {
    const parsed = activationEventIngestRequestSchema.safeParse({
      eventType: 'app_opened',
      anonymousId: 'anon-device-1',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects each server-owned eventType at the schema boundary (forgery guard)', () => {
    for (const t of SERVER_OWNED_TYPES) {
      const parsed = activationEventIngestRequestSchema.safeParse({
        eventType: t,
        anonymousId: 'anon-device-1',
      });
      expect(parsed.success).toBe(false);
    }
  });
});
