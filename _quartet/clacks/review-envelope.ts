// WI-1157: the CONSUME side of the quartet.review_result.v1 structured envelope
// (WI-1197 is the EMIT side — zdx-marketplace's plugins/cosmo/skills/review/envelope.ts
// + reference/review-result-envelope.md define the schema this file mirrors verbatim).
//
// Before this, the review-watcher only knew a review agent's outcome by eyeballing its
// prose .final.md / stdout — the disposition, findings, and Cosmo mutations lived only in
// free text. This module reads the structured JSON envelope instead: a review agent's
// cosmo:review invocation writes it via --envelope-file, and readReviewEnvelope parses it
// with no string-matching against prose at all.

export type ReviewDisposition = 'approve' | 'bounce' | 'blocked' | 'manual';

export interface ReviewEnvelope {
  schema: string;
  wi: string;
  workstream: string;
  reviewerRuntime: string;
  disposition: ReviewDisposition;
  evidence: string[];
  commandsRun: string[];
  cosmoMutations: string[];
  overridesApplied: string[];
  findings: string[];
  followUps: string[];
  timestamp: string;
}

const DISPOSITIONS: ReviewDisposition[] = [
  'approve',
  'bounce',
  'blocked',
  'manual',
];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Parse a `quartet.review_result.v1` JSON string into a normalized envelope. Returns
 *  null — never throws — for anything that isn't one: unparseable JSON, a missing/wrong
 *  `schema` tag, or a `disposition` outside the four known values. Every field beyond
 *  `disposition` is read structurally off the JSON object; nothing here inspects prose. */
export function parseReviewEnvelope(raw: string): ReviewEnvelope | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.schema !== 'quartet.review_result.v1') return null;
  if (!DISPOSITIONS.includes(parsed?.disposition)) return null;
  return {
    schema: parsed.schema,
    wi: typeof parsed.wi === 'string' ? parsed.wi : '',
    workstream: typeof parsed.workstream === 'string' ? parsed.workstream : '',
    reviewerRuntime:
      typeof parsed.reviewerRuntime === 'string' ? parsed.reviewerRuntime : '',
    disposition: parsed.disposition,
    evidence: asStringArray(parsed.evidence),
    commandsRun: asStringArray(parsed.commandsRun),
    cosmoMutations: asStringArray(parsed.cosmoMutations),
    overridesApplied: asStringArray(parsed.overridesApplied),
    findings: asStringArray(parsed.findings),
    followUps: asStringArray(parsed.followUps),
    timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
  };
}

/** Read + parse the envelope file at `path`. Returns null on any failure — the file is
 *  absent (an older review run from before WI-1197, or this run's agent never passed
 *  --envelope-file) or its content doesn't parse as a `quartet.review_result.v1` envelope
 *  — rather than throwing. The caller's fallback for a null result is to log the outcome
 *  as `manual` (needs a human look) instead of assuming success. */
export function readReviewEnvelope(
  path: string,
  readFile: (p: string) => string,
): ReviewEnvelope | null {
  let raw: string;
  try {
    raw = readFile(path);
  } catch {
    return null;
  }
  return parseReviewEnvelope(raw);
}
