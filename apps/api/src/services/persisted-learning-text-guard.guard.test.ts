import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestError } from '../errors';
import {
  assertNoClinicalInferenceInLearningRecord,
  scrubClinicalInferenceFromLearningRecord,
} from './persisted-learning-text-guard';

const SERVICE_ROOT = resolve(__dirname);

function readService(relativePath: string): string {
  return readFileSync(resolve(SERVICE_ROOT, relativePath), 'utf8');
}

describe('[WI-1195] persisted learning-text guard wiring', () => {
  // WHAT THIS RATCHET IS FOR, restated because [WI-2628] changed WHICH control
  // sits at some of these boundaries without changing the invariant:
  //
  //   EVERY Article-9 learning-record persistence boundary is guarded, and the
  //   number of guard applications at each one is pinned — so a new write path
  //   added to one of these files cannot slip in unguarded.
  //
  // It is a SOURCE-SCANNING ratchet: it reads other services' text rather than
  // importing them, so it has no module dependency on them and jest
  // `--findRelatedTests` over those files will NOT select it. If you change any
  // file named below, run this suite explicitly.
  //
  // [WI-2628] introduced one shared multilingual gate
  // (`learning-text-safety/gate.ts`) to replace the English-only guard in this
  // file. That migration is PARTIAL, so each boundary declares which control
  // currently provides its guard. The rule is per-boundary
  // OLD-GUARD **or** NEW-GATE — never neither, and never a bare "is the module
  // mentioned somewhere" check: the application COUNT is still pinned on both
  // sides of the migration, and a migrated file must have ZERO old-guard calls
  // left so the move is forward-only.
  interface Boundary {
    /** Path relative to `services/`. */
    readonly file: string;
    /**
     * Which control guards this boundary right now. `english-only-guard` is not
     * an acceptable end state — it is the tracked pre-migration state, and its
     * remaining members are the follow-up's scope.
     */
    readonly control: 'english-only-guard' | 'multilingual-gate';
    /**
     * Guard applications at write time. Not "lines that mention a guard" — the
     * number of persistence paths the guard is actually applied to.
     */
    readonly applications: number;
    /** The old guard's call form for this file: it asserts, or it scrubs. */
    readonly oldGuardCall: RegExp;
    /**
     * The new gate's application form at this boundary. Differs by AC-5
     * asymmetry: a user mutation applies `assertLearningTextSafe`, while a
     * derived write applies a local drop helper built on the batch decision.
     * Null for a boundary still on the old guard.
     */
    readonly newGateCall: RegExp | null;
  }

  // IMPORT-STYLE-AGNOSTIC, deliberately bare. The prefixed form
  // (`learningTextGuard.scrub…`) is what most call sites use, but
  // `mentor-notices/state.ts` used a NAMED import — and that is precisely why the
  // Stage-1 ratchet never pinned it: the prefixed pattern matched nothing there
  // and the boundary was silently uncovered. A bare pattern matches both forms,
  // so switching import style can no longer evade the ratchet.
  //
  // Safe from prose false positives: verified that none of the wired files
  // mentions either symbol in a comment, which would otherwise break the
  // "zero old-guard calls left" assertion on a correctly-migrated file.
  const OLD_GUARD_ASSERT = /assertNoClinicalInferenceInLearningRecord/g;
  const OLD_GUARD_SCRUB = /scrubClinicalInferenceFromLearningRecord/g;
  /** Any reference to the shared gate module, in any import form. */
  const GATE_MODULE = /learning-text-safety\/gate/;

  const BOUNDARIES: readonly Boundary[] = [
    // --- migrated by [WI-2628] Stage 3 -------------------------------------
    {
      // `insertNoteWithCap` (covers createNote + createNoteForSession) and
      // `updateNote` — the same two write paths the old guard's two calls
      // protected, 1:1.
      file: 'notes.ts',
      control: 'multilingual-gate',
      applications: 2,
      oldGuardCall: OLD_GUARD_ASSERT,
      newGateCall: /assertLearningTextSafe\(/g,
    },
    {
      // One application inside the verified-artifact loop, backed by a single
      // pre-transaction batch evaluation. Still raises rather than dropping —
      // a documented AC-5 deviation, because the throw is the caller's
      // all-or-nothing control flow.
      file: 'evidence-links.ts',
      control: 'multilingual-gate',
      applications: 1,
      oldGuardCall: OLD_GUARD_ASSERT,
      newGateCall: /assertLearningTextSafe\(/g,
    },
    {
      // Notice concept + correction hint, both evaluated in ONE batch, so the
      // application count is 1 (the batch), not 2 (the fields). This boundary was
      // absent from the Stage-1 ratchet entirely — state.ts imported the old
      // guard bare rather than through the `learningTextGuard.` namespace, so
      // neither of the old prefixed patterns matched it and its count was never
      // pinned. Added here, so a second write path in state.ts cannot skip the
      // gate. Both patterns are bare now, so import style no longer matters.
      file: 'mentor-notices/state.ts',
      control: 'multilingual-gate',
      applications: 1,
      oldGuardCall: OLD_GUARD_SCRUB,
      newGateCall: /evaluateLearningTextFields\(/g,
    },
    {
      // The needs-deepening `misconception` update AND insert. Derived writes,
      // so they DROP via a local helper over a batch hoisted above the
      // transaction (an LLM round-trip must not run inside one).
      file: 'session/session-exchange.ts',
      control: 'multilingual-gate',
      applications: 2,
      oldGuardCall: OLD_GUARD_SCRUB,
      newGateCall: /safeMisconception\(target\)/g,
    },
    // --- still on the English-only guard: the [WI-2628] follow-up's scope ---
    // Each gates text derived from a read taken INSIDE a transaction, so the
    // async gate cannot be evaluated before the transaction opens without
    // restructuring. Until that lands the OLD guard is what protects them, so
    // this ratchet keeps requiring it here — removing it would leave the
    // boundary bare.
    {
      file: 'memory/backfill-mapping.ts',
      control: 'english-only-guard',
      applications: 1,
      oldGuardCall: OLD_GUARD_SCRUB,
      newGateCall: null,
    },
    {
      file: 'memory/dedup-actions.ts',
      control: 'english-only-guard',
      applications: 1,
      oldGuardCall: OLD_GUARD_SCRUB,
      newGateCall: null,
    },
    {
      file: 'learner-profile.ts',
      control: 'english-only-guard',
      applications: 1,
      oldGuardCall: OLD_GUARD_SCRUB,
      newGateCall: null,
    },
  ];

  function countMatches(source: string, pattern: RegExp): number {
    // Fresh lastIndex per use — these are module-level /g regexes shared across
    // rows, and a leaked lastIndex would silently undercount a later boundary.
    return source.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
  }

  it('covers exactly the seven Art 9 persistence boundaries, with no duplicates', () => {
    // Guards the LIST itself. Every assertion below is per-row, so quietly
    // deleting a row would drop a boundary from the ratchet while leaving it
    // green — the one failure mode a table-driven ratchet invites.
    const files = BOUNDARIES.map((boundary) => boundary.file);
    expect(new Set(files).size).toBe(files.length);
    expect(files.slice().sort()).toEqual([
      'evidence-links.ts',
      'learner-profile.ts',
      'memory/backfill-mapping.ts',
      'memory/dedup-actions.ts',
      'mentor-notices/state.ts',
      'notes.ts',
      'session/session-exchange.ts',
    ]);
  });

  it('keeps every Art 9 learning-record persistence boundary guarded', () => {
    // THE INVARIANT: old guard OR new gate at every boundary, never neither,
    // with the application count pinned either way.
    const unguarded = BOUNDARIES.filter((boundary) => {
      const source = readService(boundary.file);
      return (
        countMatches(source, boundary.oldGuardCall) === 0 &&
        (boundary.newGateCall === null ||
          countMatches(source, boundary.newGateCall) === 0)
      );
    });
    expect(unguarded.map((boundary) => boundary.file)).toEqual([]);
  });

  describe.each(BOUNDARIES)(
    '$file (guarded by $control)',
    (boundary: Boundary) => {
      it(`applies its guard at all ${boundary.applications} write path(s)`, () => {
        const source = readService(boundary.file);
        const pattern =
          boundary.control === 'multilingual-gate'
            ? (boundary.newGateCall as RegExp)
            : boundary.oldGuardCall;
        expect(countMatches(source, pattern)).toBe(boundary.applications);
      });

      if (boundary.control === 'multilingual-gate') {
        it('routes through the shared multilingual gate module', () => {
          expect(GATE_MODULE.test(readService(boundary.file))).toBe(true);
        });

        it('has NO English-only guard calls left (forward-only)', () => {
          // The half that makes the migration irreversible by accident. Without
          // it, a file could import the gate and still guard a write path with
          // the English-only regex — which is the defect [WI-2628] exists to
          // remove, wearing the new gate's clothes.
          expect(
            countMatches(readService(boundary.file), boundary.oldGuardCall),
          ).toBe(0);
        });
      } else {
        it('has not yet been migrated to the multilingual gate', () => {
          // Not an aspiration — a tracked fact. This boundary is protected TODAY
          // by the English-only guard, i.e. it does not yet catch non-English
          // clinical attributions. Flipping it to the gate must also flip this
          // row's `control`, which is what keeps the partial state visible
          // instead of being inferable from an absence.
          expect(GATE_MODULE.test(readService(boundary.file))).toBe(false);
        });
      }
    },
  );
});

describe('[WI-1195] persisted learning-text clinical attribution guard', () => {
  it.each([
    'Alex has ADHD.',
    'Alex probably has ADHD.',
    'Alex possibly has ADHD.',
    'Sam is autistic.',
    'Jordan shows signs of dyslexia.',
  ])(
    'rejects a clinical characterisation attributed to a named person: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
    },
  );

  it.each([
    'The learner has ADHD.',
    'The learner probably has ADHD.',
    'The learner possibly has ADHD.',
    'Their autism affects the learning plan.',
  ])(
    'rejects a qualified clinical characterisation attributed to a generic person: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
    },
  );

  it('rejects a named possessive clinical characterisation', () => {
    expect(
      scrubClinicalInferenceFromLearningRecord("Alex's dyslexia"),
    ).toBeNull();
  });

  it.each([
    "I'm autistic.",
    'I’m autistic.',
    "She's dyslexic.",
    'She’s dyslexic.',
    "They're autistic.",
    'They’re autistic.',
  ])('rejects a contracted clinical characterisation: %s', (text) => {
    expect(scrubClinicalInferenceFromLearningRecord(text)).toBeNull();
  });

  it('keeps null input null', () => {
    expect(scrubClinicalInferenceFromLearningRecord(null)).toBeNull();
  });

  it('throws BadRequestError at an asserting persistence boundary', () => {
    expect(() =>
      assertNoClinicalInferenceInLearningRecord('The learner has ADHD.'),
    ).toThrow(BadRequestError);
  });

  it.each([
    'ADHD can affect executive function.',
    'Alex is learning about ADHD.',
    "I'm learning about autism.",
    'She’s studying dyslexia.',
    "They're discussing ADHD.",
  ])(
    'allows educational discussion without a clinical characterisation: %s',
    (text) => {
      expect(scrubClinicalInferenceFromLearningRecord(text)).toBe(text);
    },
  );
});
