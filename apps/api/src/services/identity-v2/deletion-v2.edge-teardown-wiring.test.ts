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
 * auto-erasure never completed. The fix wired `tearDownPersonEdgesTx(tx,
 * personId)` into every person-scoped path.
 *
 * This is a WIRING invariant, not a behavioural test: it asserts the gate CALL
 * is present in each of the four secondary-path functions, so re-introducing
 * the primary-only defect (dropping the call from any one path) fails here.
 * Behavioural coverage lives in `deletion-v2.integration.test.ts`
 * ("person-scoped deletes tear down edges (WI-1985)") — a staging-DB suite that
 * does not run in the default unit env, so it cannot guard the class in the
 * always-on API suite; this test does. See
 * docs/secondary-path-gate-review-rule.md.
 */

const SOURCE = readFileSync(join(__dirname, 'deletion-v2.ts'), 'utf8');

// Every person-scoped erasure path — each genuinely erases the person, so an
// incident edge cannot survive there any more than on the whole-org path.
const PERSON_SCOPED_ERASURE_FNS = [
  'deletePersonV2',
  'deletePersonIfConsentWithdrawnV2',
  'deletePersonIfNoConsentV2',
  'deleteArchivedPersonIfStillEligibleV2',
] as const;

const TEARDOWN_CALL = 'tearDownPersonEdgesTx(tx, personId)';

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
  it.each(PERSON_SCOPED_ERASURE_FNS)(
    '%s severs incident edges before the person-row drop',
    (fnName) => {
      expect(functionBody(SOURCE, fnName)).toContain(TEARDOWN_CALL);
    },
  );

  it('the teardown helper itself severs BOTH guardianship and supportership (the gate it wires is real)', () => {
    const helper = functionBody(SOURCE, 'tearDownPersonEdgesTx');
    expect(helper).toContain('.delete(guardianship)');
    expect(helper).toContain('.delete(supportership)');
  });
});
