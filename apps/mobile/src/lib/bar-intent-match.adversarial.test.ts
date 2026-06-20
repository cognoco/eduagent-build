import { nowDeepLinkRouteSchema } from '@eduagent/schemas';

import { matchBarIntent, type BarIntentResult } from './bar-intent-match';
import { pushNowDeepLink } from './now-deep-link';

// ---------------------------------------------------------------------------
// Adversarial / property tests for the V2 bar intent-matcher — the mentor's
// deterministic "tool use" (typed/spoken bar text → a zero-LLM navigation jump
// on a confident closed-route-catalog match, else a mentor turn).
//
// No human testers exercise the V2 shell, so this fuzzes matchBarIntent with
// hostile, degenerate, multilingual, and injection inputs and asserts the
// invariants that keep a deterministic jump safe:
//   1. It NEVER throws and always returns a valid {jump|mentor|uncertain}.
//   2. Every jump it emits expands through pushNowDeepLink WITHOUT throwing —
//      i.e. the route is in the closed catalog and every required param (for the
//      route AND its ancestor chain) is present. This is the load-bearing
//      cross-surface invariant: a "confident" jump that the deep-link expander
//      would reject is a crash waiting to happen in production.
//   3. mentor/uncertain results echo the original trimmed text unchanged.
// ---------------------------------------------------------------------------

const NOOP_ROUTER = { push: (): void => undefined };

const VERBS_SESSION = ['continue', 'resume', 'open'];
const VERBS_OPEN = ['open', 'show', 'go to'];
const VERBS_REVIEW = ['review', 'practice'];
const VERBS_CHALLENGE = ['challenge', 'test'];

const IDS = [
  'abc-123',
  's1',
  '00000000-0000-7000-8000-000000000101',
  'a_b-c',
  'x'.repeat(300),
  'CAPS-ID',
  '1',
];

// Words that look like shell destinations the catalog does NOT expose — these
// must resolve to uncertain (no jump to an unsupported route).
const UNSUPPORTED = [
  'show my progress',
  'open journal',
  'go to subjects',
  'take me to the library',
  'open more',
  'show settings',
];

const QUESTIONS = [
  'why is the sky blue?',
  'how do volcanoes erupt?',
  'what is photosynthesis?',
  'when did the war end?',
];

const HOSTILE = [
  '',
  ' ',
  '\n\t  ',
  'a',
  'session',
  'open',
  'review subject',
  'open subject',
  'continue session',
  'open subject book topic',
  'x'.repeat(10_000),
  '😀 open subject s1 😀',
  'مرحبا open subject s1',
  'open subject s1; DROP TABLE',
  '<script>open subject s1</script>',
  'open session ../../etc/passwd',
  'open    subject    s1',
  'OPEN SUBJECT S1',
  'null',
  'undefined',
  'open sessions1',
];

function buildCorpus(): string[] {
  const out: string[] = [];
  for (const id of IDS) {
    for (const v of VERBS_SESSION) out.push(`${v} session ${id}`);
    for (const v of VERBS_OPEN) out.push(`${v} subject ${id}`);
    for (const v of VERBS_REVIEW) out.push(`${v} subject ${id} topic ${id}`);
    for (const v of VERBS_CHALLENGE) out.push(`${v} subject ${id} topic ${id}`);
    for (const v of VERBS_OPEN) {
      out.push(`${v} subject ${id} book ${id} topic ${id}`);
    }
    // Adversarial: jump verbs with one required id missing.
    out.push(`review subject ${id}`); // topic missing → must not be a review jump
    out.push(`open book ${id} topic ${id}`); // subject missing
  }
  out.push(...UNSUPPORTED, ...QUESTIONS, ...HOSTILE);
  return out;
}

const CORPUS = buildCorpus();

function isValidShape(result: BarIntentResult): boolean {
  if (result.kind === 'jump') {
    return (
      typeof result.deepLink === 'object' &&
      typeof result.deepLink.route === 'string'
    );
  }
  return typeof result.text === 'string';
}

describe('matchBarIntent — adversarial corpus invariants', () => {
  it('the corpus is large enough to be meaningful', () => {
    expect(CORPUS.length).toBeGreaterThan(80);
  });

  it('NEVER throws and always returns a valid result shape', () => {
    const failures: string[] = [];
    for (const input of CORPUS) {
      try {
        const result = matchBarIntent(input);
        if (!isValidShape(result)) {
          failures.push(`${JSON.stringify(input)} → invalid shape`);
        }
      } catch (err) {
        failures.push(`${JSON.stringify(input)} → THREW: ${String(err)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every JUMP expands through pushNowDeepLink without throwing (route + all chain params valid)', () => {
    const failures: string[] = [];
    for (const input of CORPUS) {
      const result = matchBarIntent(input);
      if (result.kind !== 'jump') continue;

      // Route must be a member of the closed catalog enum.
      if (!nowDeepLinkRouteSchema.safeParse(result.deepLink.route).success) {
        failures.push(
          `${JSON.stringify(input)} → route not in catalog: ${result.deepLink.route}`,
        );
        continue;
      }
      // The deep-link expander must accept it — this proves every required
      // param (route + ancestor chain) is present.
      try {
        pushNowDeepLink(NOOP_ROUTER, result.deepLink, {
          subjectHubTarget: 'v2-subject-hub',
        });
      } catch (err) {
        failures.push(
          `${JSON.stringify(input)} → pushNowDeepLink threw: ${String(err)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('never jumps to an unsupported shell route (progress / journal / subjects / library / more)', () => {
    for (const input of UNSUPPORTED) {
      expect(matchBarIntent(input).kind).not.toBe('jump');
    }
  });

  it('treats text shorter than the 8-char floor as uncertain (never a jump)', () => {
    for (const input of CORPUS) {
      if (input.trim().replace(/\s+/g, ' ').length < 8) {
        expect(matchBarIntent(input).kind).toBe('uncertain');
      }
    }
  });

  it('mentor / uncertain results echo the trimmed input verbatim', () => {
    for (const input of CORPUS) {
      const result = matchBarIntent(input);
      if (result.kind === 'mentor' || result.kind === 'uncertain') {
        expect(result.text).toBe(input.trim());
      }
    }
  });

  it('is fully synchronous (no Promise, no network) for every corpus input', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    for (const input of CORPUS) {
      expect(matchBarIntent(input)).not.toBeInstanceOf(Promise);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
