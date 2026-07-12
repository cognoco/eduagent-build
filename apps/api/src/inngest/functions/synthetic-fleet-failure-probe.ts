// @inngest-admin: no-db (operator-approved, PII-free observability probe)
import { inngest } from '../client';

const PROBE_ID = 'wi-1907';

function isClosedProbePayload(data: unknown): data is { probeId: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.probeId === PROBE_ID;
}

export const syntheticFleetFailureProbe = inngest.createFunction(
  {
    id: 'synthetic-fleet-failure-probe',
    name: 'Synthetic fleet failure probe (WI-1907)',
    retries: 0,
  },
  { event: 'app/ops.synthetic_fleet_failure_probe_requested' },
  async ({ event }) => {
    if (!isClosedProbePayload(event.data)) {
      return { status: 'ignored' as const, reason: 'invalid_payload' as const };
    }

    throw new Error('Synthetic fleet failure probe (WI-1907)');
  },
);
