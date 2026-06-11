// ---------------------------------------------------------------------------
// Policy Engine — unit tests (WI-571 WP-W1-spine TDD)
// ---------------------------------------------------------------------------

import { evaluatePolicyCell } from './engine';
import { parseEnvelope } from '../llm/envelope';

describe('evaluatePolicyCell', () => {
  it('exports evaluatePolicyCell as a function', () => {
    expect(typeof evaluatePolicyCell).toBe('function');
  });

  it('returns { prohibited: boolean, consentRequired: boolean } shape', () => {
    const result = evaluatePolicyCell({ age: 'known', residence: 'known' });
    expect(typeof result.prohibited).toBe('boolean');
    expect(typeof result.consentRequired).toBe('boolean');
  });

  it('unknown age → most-restrictive default (consentRequired: true)', () => {
    const result = evaluatePolicyCell({ age: 'unknown', residence: 'known' });
    expect(result.consentRequired).toBe(true);
  });

  it('unknown residence → most-restrictive default (consentRequired: true)', () => {
    const result = evaluatePolicyCell({ age: 'known', residence: 'unknown' });
    expect(result.consentRequired).toBe(true);
  });

  it('both unknown → most-restrictive default (consentRequired: true)', () => {
    const result = evaluatePolicyCell({ age: 'unknown', residence: 'unknown' });
    expect(result.consentRequired).toBe(true);
  });

  it('both known → still fail-closed until policy_cells populated (scaffold default)', () => {
    // The `known` flags only signal presence, not actual age/regime values.
    // Without populated policy_cells, the scaffold stays consentRequired: true.
    // W2/W3 replaces this with real DB reads.
    const result = evaluatePolicyCell({ age: 'known', residence: 'known' });
    expect(result.prohibited).toBe(false);
    expect(result.consentRequired).toBe(true);
  });
});

describe('envelope parse path reachable from policy-engine scaffold (AC-3)', () => {
  it('parseEnvelope is importable and functional from the policy-engine context', () => {
    const result = parseEnvelope(
      '{"reply":"hello","signals":{"partial_progress":false}}',
      'unknown',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.reply).toBe('hello');
    }
  });
});
