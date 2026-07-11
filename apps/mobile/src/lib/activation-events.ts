/**
 * Shared client for the activation-events funnel ingest route — WI-1689.
 *
 * Single call path for all 6 client-observable event types
 * (`clientActivationEventTypeSchema`): app_opened, signup_started,
 * onboarding_completed, review_card_seen, review_card_tapped, day2_return.
 * Every call site uses `useReportActivationEvent()` so environment/
 * appVersion/platform/route metadata is populated consistently and no call
 * site hand-rolls its own fetch.
 *
 * Fire-and-forget by design, mirroring the server's `safeWrite()` contract:
 * a telemetry failure (network error, transient 401, etc.) must never throw
 * into the caller or interrupt the user-facing flow it's attached to.
 */
import { useCallback } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import type { ClientActivationEventType } from '@eduagent/schemas';
import { useApiClient } from './api-client';
import { getAnonymousId } from './anonymous-id';
import { Sentry } from './sentry';

function resolveEnvironment(): string {
  return Updates.channel || (__DEV__ ? 'development' : 'production');
}

export interface ReportActivationEventOptions {
  /**
   * Distinguishes repeated occurrences of the same eventType on the same
   * UTC day when day-level dedupe would be too coarse (e.g. a review card's
   * id). Omit for events where "once per UTC day" is the intended dedupe
   * granularity — see activationEventIngestRequestSchema's occurrenceId doc.
   */
  occurrenceId?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}

export type ReportActivationEvent = (
  eventType: ClientActivationEventType,
  options?: ReportActivationEventOptions,
) => void;

export function useReportActivationEvent(): ReportActivationEvent {
  const client = useApiClient();

  return useCallback(
    (
      eventType: ClientActivationEventType,
      options: ReportActivationEventOptions = {},
    ) => {
      void (async () => {
        try {
          const anonymousId = await getAnonymousId();
          await client['activation-events'].$post({
            json: {
              eventType,
              anonymousId,
              appVersion: Constants.expoConfig?.version ?? undefined,
              platform: Platform.OS,
              environment: resolveEnvironment(),
              ...(options.route !== undefined ? { route: options.route } : {}),
              ...(options.occurrenceId !== undefined
                ? { occurrenceId: options.occurrenceId }
                : {}),
              ...(options.metadata !== undefined
                ? { metadata: options.metadata }
                : {}),
            },
          });
        } catch (err) {
          // Telemetry must never break the calling flow — log and move on.
          Sentry.addBreadcrumb({
            category: 'activation-events',
            level: 'warning',
            message: `report failed: ${eventType}`,
            data: { error: err instanceof Error ? err.message : String(err) },
          });
        }
      })();
    },
    [client],
  );
}
