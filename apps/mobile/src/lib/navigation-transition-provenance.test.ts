import {
  consumeHubToSessionTransition,
  consumeHubToTopicTransition,
  consumeSubjectsToHubTransition,
  markHubToSessionTransition,
  markHubToTopicTransition,
  markSubjectsToHubTransition,
  resetNavigationTransitionProvenanceForTests,
} from './navigation-transition-provenance';

describe('navigation transition provenance', () => {
  beforeEach(() => {
    resetNavigationTransitionProvenanceForTests();
  });

  it('consumes an exact Subjects-to-Hub transition once', () => {
    markSubjectsToHubTransition('subject-1');

    expect(consumeSubjectsToHubTransition('subject-1')).toBe(true);
    expect(consumeSubjectsToHubTransition('subject-1')).toBe(false);
  });

  it('rejects a mismatched destination and clears the pending proof', () => {
    markHubToTopicTransition('subject-1', 'topic-1');

    expect(consumeHubToTopicTransition('subject-1', 'topic-2')).toBe(false);
    expect(consumeHubToTopicTransition('subject-1', 'topic-1')).toBe(false);
  });

  it.each([
    {
      transition: 'Subjects-to-Hub',
      mark: () => markSubjectsToHubTransition('subject-1'),
      consume: (subjectId: string) => consumeSubjectsToHubTransition(subjectId),
    },
    {
      transition: 'Hub-to-Topic',
      mark: () => markHubToTopicTransition('subject-1', 'topic-1'),
      consume: (subjectId: string) =>
        consumeHubToTopicTransition(subjectId, 'topic-1'),
    },
    {
      transition: 'Hub-to-Session',
      mark: () => markHubToSessionTransition('subject-1'),
      consume: (subjectId: string) => consumeHubToSessionTransition(subjectId),
    },
  ])(
    'rejects a mismatched $transition subject and clears the pending proof',
    ({ mark, consume }) => {
      mark();

      expect(consume('subject-2')).toBe(false);
      expect(consume('subject-1')).toBe(false);
    },
  );

  it('keeps only the latest actual transition', () => {
    markSubjectsToHubTransition('subject-1');
    markHubToSessionTransition('subject-1');

    expect(consumeHubToSessionTransition('subject-1')).toBe(true);
    expect(consumeSubjectsToHubTransition('subject-1')).toBe(false);
  });

  it('does not survive the reset boundary that models a runtime refresh', () => {
    markHubToSessionTransition('subject-1');
    resetNavigationTransitionProvenanceForTests();

    expect(consumeHubToSessionTransition('subject-1')).toBe(false);
  });
});
