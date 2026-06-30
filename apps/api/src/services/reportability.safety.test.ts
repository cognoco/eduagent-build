/**
 * Break-test T10a — "safety crosses every wall that affect-as-report cannot."
 * (S5 visibility-contract plan, `## Tests` → T10a.)
 *
 * The reportability gate blocks raw affect (`confided_affect`, `self_doubt`, …)
 * from travelling up to a supporter via the allow-list in `assertReportable`.
 * But a deterministic SAFETY escalation must NOT be suppressed by that same gate:
 * a `confided_affect` fact flagged `safetyEscalation` has to survive — remapped
 * to a neutral `observable_engagement` kind so no raw affect leaks, yet still
 * delivered.
 *
 * The load-bearing line is `reportability.ts` `assertReportable`:
 *   `if (fact.safetyEscalation) return;`  // bypasses the allow-list
 * Reverting it makes blocking affect-as-report ALSO block affect-as-safety —
 * the exact regression this test exists to catch (revert that line → red).
 *
 * Pure unit test: `filterToReportable` / `shouldDeliverSafetyEscalation` are
 * synchronous and side-effect-free. No mocks, no DB.
 */

import {
  filterToReportable,
  shouldDeliverSafetyEscalation,
  type CandidateReportFact,
} from './reportability';

describe('reportability safety bypass [T10a]', () => {
  // Same kind both ways — the ONLY difference is the safetyEscalation flag.
  const baseAffect: CandidateReportFact = {
    id: 'affect-1',
    kind: 'confided_affect',
    title: 'I feel stupid',
    detail: 'raw affect — must never travel upward as a report',
    source: 'journal',
  };

  it('blocks confided affect as a report when it is NOT a safety escalation', () => {
    expect(shouldDeliverSafetyEscalation(baseAffect)).toBe(false);
    expect(filterToReportable([baseAffect])).toEqual([]);
  });

  it('still delivers the SAME affect when it IS a safety escalation, remapped to a neutral kind', () => {
    const escalation: CandidateReportFact = {
      ...baseAffect,
      id: 'affect-1-safety',
      safetyEscalation: true,
    };

    expect(shouldDeliverSafetyEscalation(escalation)).toBe(true);

    const reportable = filterToReportable([escalation]);
    expect(reportable).toHaveLength(1);
    expect(reportable[0]).toMatchObject({
      kind: 'observable_engagement',
      metadata: { safetyEscalation: true },
    });
    // Crossing the wall must not smuggle the raw kind through.
    expect(reportable[0]?.kind).not.toBe('confided_affect');
  });
});
