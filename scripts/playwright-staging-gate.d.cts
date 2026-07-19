export type GateState = 'healthy' | 'confirmed-unavailable' | 'not-run';
export type FailureKind =
  | 'success'
  | 'cancellation'
  | 'product'
  | 'unknown'
  | 'infra-signalled'
  | 'not-run';

export const GATE_STATES: Readonly<{
  HEALTHY: 'healthy';
  UNAVAILABLE: 'confirmed-unavailable';
  NOT_RUN: 'not-run';
}>;

export function runCanary(options: {
  apiUrl: string;
  secret: string;
  fetchImpl?: (
    input: URL,
    init: {
      method: string;
      headers: Record<string, string>;
      signal: AbortSignal;
    },
  ) => Promise<{ status: unknown }>;
  attempts?: number;
  timeoutMs?: number;
  random?: () => number;
}): Promise<{
  state: GateState;
  reason?: string;
  terminal?: boolean;
  status?: number;
}>;

export function classifyFailure(options: {
  artifactRoot: string;
  exitCode: number;
  resultText?: string;
}): { kind: Exclude<FailureKind, 'not-run'> };

export function decide(options: {
  preflight: GateState;
  postflight: GateState;
  classification: FailureKind;
  exitCode: number;
}): number;
