import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [WI-2004] Defect-class guard — "safety gate on primary path only".
 *
 * Class: a compliance/data-integrity gate enforced on the PRIMARY path and
 * absent on a DEGRADED/SECONDARY one. WI-1985's instance: the incident-edge
 * teardown (guardianship + supportership) ran on the whole-org erasure path but
 * was missing on the four PERSON-scoped erasure paths, so a person-scoped
 * erasure of an edge-bearing managed child FK-aborted (RESTRICT) — statutory
 * auto-erasure never completed. The fix routes every person-scoped path through
 * `erasePreparedPersonTx`, which calls `tearDownPersonEdgesTx(tx, personId)`
 * BEFORE the person-row drop.
 *
 * This is a WIRING invariant, not a behavioural test: it follows every public
 * secondary path to its transactional attempt function, asserts each attempt
 * reaches the shared erasure helper, and asserts the helper runs the gate before
 * the `tx.delete(person)` drop (moving it after the drop re-introduces the
 * RESTRICT abort), so re-introducing the primary-only defect fails here. Behavioural
 * coverage lives in `deletion-v2.integration.test.ts` ("person-scoped deletes
 * tear down edges (WI-1985)") — a staging-DB suite that does not run in the
 * default unit env, so it cannot guard the class in the always-on API suite;
 * this test does. See docs/secondary-path-gate-review-rule.md.
 */

// Strip block + line comments so a commented-out call does not false-pass the
// presence/ordering checks below (a guard whose job is detecting removal must
// only see active code).
// ponytail: regex comment-strip, not a full parser — a `//` inside a string
// literal could over-truncate; deletion-v2.ts has none, and the integration
// suite is the behavioural backstop.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SOURCE = stripComments(
  readFileSync(join(__dirname, 'deletion-v2.ts'), 'utf8'),
);

// Every person-scoped erasure path — each genuinely erases the person, so an
// incident edge cannot survive there any more than on the whole-org path.
const PUBLIC_ERASURE_ENTRYPOINTS = [
  ['deletePersonV2', 'erasePreparedPersonTx('],
  [
    'deletePersonIfConsentWithdrawnV2',
    'attemptPersonIfConsentWithdrawnErasureV2(',
  ],
  ['deletePersonIfNoConsentV2', 'attemptPersonIfNoConsentErasureV2('],
  ['deleteArchivedPersonIfStillEligibleV2', 'attemptArchivedPersonErasureV2('],
] as const;

const TRANSACTIONAL_ERASURE_FNS = [
  'deletePersonV2',
  'attemptPersonIfConsentWithdrawnErasureV2',
  'attemptPersonIfNoConsentErasureV2',
  'attemptArchivedPersonErasureV2',
] as const;

const TEARDOWN_CALL = 'tearDownPersonEdgesTx(tx, personId)';
const PERSON_DROP = '.delete(person)';
const SHARED_ERASURE_CALL = 'erasePreparedPersonTx(';
const CLERK_FENCE_CALL =
  'reservePendingClerkErasuresTx(tx, context.clerkUserIds)';

/** Body of a top-level function: from its declaration to the next top-level
 *  `function`/`export` declaration (or EOF). */
function functionBody(source: string, fnName: string): string {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) {
    throw new Error(
      `[WI-2004] person-scoped erasure function '${fnName}' not found in deletion-v2.ts — ` +
        `if it was renamed/removed, update this class guard (docs/secondary-path-gate-review-rule.md).`,
    );
  }
  const rest = source.slice(start + 1);
  const nextDecl = rest.search(/\n(export )?(async )?function \w+\(/);
  return nextDecl === -1
    ? source.slice(start)
    : source.slice(start, start + 1 + nextDecl);
}

describe('[WI-2004] deletion edge-teardown gate is wired on every person-scoped path (not just the whole-org primary)', () => {
  it.each(PUBLIC_ERASURE_ENTRYPOINTS)(
    '%s delegates to its erasure implementation',
    (fnName, delegateCall) => {
      const body = functionBody(SOURCE, fnName);
      expect(body).toContain(delegateCall);
    },
  );

  it.each(TRANSACTIONAL_ERASURE_FNS)(
    '%s reaches the shared person-erasure helper',
    (fnName) => {
      const body = functionBody(SOURCE, fnName);
      expect(body).toContain(SHARED_ERASURE_CALL);
    },
  );

  it('the shared erasure helper tears down incident edges before the person-row drop', () => {
    const helper = functionBody(SOURCE, 'erasePreparedPersonTx');
    const fenceAt = helper.indexOf(CLERK_FENCE_CALL);
    const gateAt = helper.indexOf(TEARDOWN_CALL);
    const dropAt = helper.indexOf(PERSON_DROP);
    expect(fenceAt).toBeGreaterThanOrEqual(0);
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(fenceAt).toBeLessThan(gateAt);
    expect(gateAt).toBeLessThan(dropAt);
  });

  it('the teardown helper itself severs BOTH guardianship and supportership (the gate it wires is real)', () => {
    const helper = functionBody(SOURCE, 'tearDownPersonEdgesTx');
    expect(helper).toContain('.delete(guardianship)');
    expect(helper).toContain('.delete(supportership)');
  });
});
