export type OwnerEntry = 'mentor' | 'subjects' | 'journal';
export type OwnerEntryPhase =
  | 'account-entry'
  | 'account-ready'
  | 'leaf-ready'
  | 'browser-back'
  | 'account-return'
  | 'initiating-tab-return';

export type OwnerJourneyPhase =
  | 'seed-request'
  | 'seed-backoff'
  | 'sign-in-setup'
  | 'sign-in-session'
  | 'sign-in-readiness'
  | `${OwnerEntry}-${OwnerEntryPhase}`;

export type OwnerJourneyReadinessMarker =
  | 'server-owned-seed-response'
  | 'sign-in-form'
  | 'session-cookie'
  | 'post-approval'
  | 'mentor-screen'
  | 'subjects-screen'
  | 'journal-screen'
  | 'account-screen'
  | 'owner-rows'
  | 'leaf-screen'
  | 'browser-history'
  | 'initiating-tab';

export interface OwnerJourneyPhaseUpdate {
  phase: OwnerJourneyPhase;
  attempt?: number;
  status?: number;
  url?: string | URL;
  readinessMarker?: OwnerJourneyReadinessMarker;
}

export interface OwnerJourneyPhaseDiagnostics {
  enter(update: OwnerJourneyPhaseUpdate): void;
  dispose(): void;
}

interface DiagnosticSnapshot {
  phase: OwnerJourneyPhase;
  attempt?: number;
  statusClass?: string;
  pathname?: string;
  readinessMarker?: OwnerJourneyReadinessMarker;
}

const HEARTBEAT_INTERVAL_MS = 5_000;

export function ownerEntryPhase(
  entry: OwnerEntry,
  phase: OwnerEntryPhase,
): `${OwnerEntry}-${OwnerEntryPhase}` {
  return `${entry}-${phase}`;
}

function statusClass(status: number | undefined): string | undefined {
  if (!Number.isInteger(status) || status === undefined) return undefined;
  const hundred = Math.floor(status / 100);
  return hundred >= 1 && hundred <= 5 ? `${hundred}xx` : 'other';
}

function pathname(url: string | URL | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, 'https://owner-journey.invalid').pathname;
  } catch {
    return '/invalid';
  }
}

export function createOwnerJourneyPhaseDiagnostics({
  emit = console.log,
}: {
  emit?: (line: string) => void;
} = {}): OwnerJourneyPhaseDiagnostics {
  const startedAt = Date.now();
  let current: DiagnosticSnapshot | null = null;

  const emitCurrent = (): void => {
    if (!current) return;
    const fields = [
      `[V2 owner journey] phase=${current.phase}`,
      `elapsedMs=${Math.max(0, Date.now() - startedAt)}`,
    ];
    if (current.attempt !== undefined) {
      fields.push(`attempt=${current.attempt}`);
    }
    if (current.statusClass) {
      fields.push(`statusClass=${current.statusClass}`);
    }
    if (current.pathname) {
      fields.push(`pathname=${current.pathname}`);
    }
    if (current.readinessMarker) {
      fields.push(`readiness=${current.readinessMarker}`);
    }
    emit(fields.join(' '));
  };

  const heartbeat = setInterval(emitCurrent, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  return {
    enter(update) {
      current = {
        phase: update.phase,
        attempt:
          Number.isInteger(update.attempt) && (update.attempt ?? 0) > 0
            ? update.attempt
            : undefined,
        statusClass: statusClass(update.status),
        pathname: pathname(update.url),
        readinessMarker: update.readinessMarker,
      };
      emitCurrent();
    },
    dispose() {
      clearInterval(heartbeat);
      current = null;
    },
  };
}
