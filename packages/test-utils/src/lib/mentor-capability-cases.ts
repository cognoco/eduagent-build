type MentorMatcherExpectation =
  | {
      kind: 'jump';
      deepLink: {
        route: string;
        params: Readonly<Record<string, string>>;
        chain: readonly string[];
      };
    }
  | { kind: 'mentor' }
  | { kind: 'uncertain' };

type MentorRouteExpectation =
  | { kind: 'path'; href: string }
  | {
      kind: 'session';
      pathname: '/(app)/session';
      params: {
        entrySource: 'mentor';
        returnTo: 'mentor';
        mode: 'freeform';
      };
    }
  | { kind: 'none' };

interface MentorCapabilityCaseDefinition {
  id: string;
  capability:
    | 'catalog-jump'
    | 'mentor-session'
    | 'clarification'
    | 'unsupported-route'
    | 'wrong-scope-denial';
  scope: 'learner' | 'person';
  input: string;
  expectedMatcher: MentorMatcherExpectation;
  expectedRoute: MentorRouteExpectation;
  expectedRawInput: string | null;
}

/**
 * Test-only deterministic contract for the Mentor input capability boundaries.
 * Keep fuzz/property inputs in their owning suites; this table is the shared
 * five-case spine, not a replacement adversarial corpus.
 */
export const MENTOR_CAPABILITY_CASES = [
  {
    id: 'catalog-jump',
    capability: 'catalog-jump',
    scope: 'learner',
    input: 'show subject subject-123',
    expectedMatcher: {
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: 'subject-123' },
        chain: [],
      },
    },
    expectedRoute: {
      kind: 'path',
      href: '/(app)/subject-hub/subject-123',
    },
    expectedRawInput: null,
  },
  {
    id: 'mentor-session',
    capability: 'mentor-session',
    scope: 'learner',
    input: 'Why do apples fall toward the ground?',
    expectedMatcher: { kind: 'mentor' },
    expectedRoute: {
      kind: 'session',
      pathname: '/(app)/session',
      params: {
        entrySource: 'mentor',
        returnTo: 'mentor',
        mode: 'freeform',
      },
    },
    expectedRawInput: 'Why do apples fall toward the ground?',
  },
  {
    id: 'clarification',
    capability: 'clarification',
    scope: 'learner',
    input: 'review',
    expectedMatcher: { kind: 'uncertain' },
    expectedRoute: { kind: 'none' },
    expectedRawInput: 'review',
  },
  {
    id: 'unsupported-route',
    capability: 'unsupported-route',
    scope: 'learner',
    input: 'take me to the library',
    expectedMatcher: { kind: 'uncertain' },
    expectedRoute: { kind: 'none' },
    expectedRawInput: 'take me to the library',
  },
  {
    id: 'wrong-scope-denial',
    capability: 'wrong-scope-denial',
    scope: 'person',
    input: 'Explain plate tectonics to me',
    expectedMatcher: { kind: 'mentor' },
    expectedRoute: { kind: 'none' },
    expectedRawInput: 'Explain plate tectonics to me',
  },
] as const satisfies readonly MentorCapabilityCaseDefinition[];

export type MentorCapabilityCase = (typeof MENTOR_CAPABILITY_CASES)[number];
