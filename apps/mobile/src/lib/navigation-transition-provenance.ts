type NavigationTransition =
  | {
      kind: 'subjects-to-hub';
      subjectId: string;
    }
  | {
      kind: 'hub-to-topic';
      subjectId: string;
      topicId: string;
    }
  | {
      kind: 'hub-to-session';
      subjectId: string;
    };

let pendingTransition: NavigationTransition | undefined;

function consumeTransition(expected: NavigationTransition): boolean {
  const transition = pendingTransition;
  pendingTransition = undefined;

  if (!transition || transition.kind !== expected.kind) return false;

  switch (expected.kind) {
    case 'subjects-to-hub':
    case 'hub-to-session':
      return transition.subjectId === expected.subjectId;
    case 'hub-to-topic':
      return (
        transition.kind === 'hub-to-topic' &&
        transition.subjectId === expected.subjectId &&
        transition.topicId === expected.topicId
      );
  }
}

export function markSubjectsToHubTransition(subjectId: string): void {
  pendingTransition = { kind: 'subjects-to-hub', subjectId };
}

export function consumeSubjectsToHubTransition(subjectId: string): boolean {
  return consumeTransition({ kind: 'subjects-to-hub', subjectId });
}

export function markHubToTopicTransition(
  subjectId: string,
  topicId: string,
): void {
  pendingTransition = { kind: 'hub-to-topic', subjectId, topicId };
}

export function consumeHubToTopicTransition(
  subjectId: string,
  topicId: string,
): boolean {
  return consumeTransition({ kind: 'hub-to-topic', subjectId, topicId });
}

export function markHubToSessionTransition(subjectId: string): void {
  pendingTransition = { kind: 'hub-to-session', subjectId };
}

export function consumeHubToSessionTransition(subjectId: string): boolean {
  return consumeTransition({ kind: 'hub-to-session', subjectId });
}

export function clearNavigationTransitionProvenance(): void {
  pendingTransition = undefined;
}

export function resetNavigationTransitionProvenanceForTests(): void {
  clearNavigationTransitionProvenance();
}
