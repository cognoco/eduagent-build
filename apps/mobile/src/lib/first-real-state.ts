export interface FirstRealStateInput {
  activeSubjectCount?: number | null;
  feedCardCount?: number | null;
  completedExchangeCount?: number | null;
}

export function hasFirstRealState({
  activeSubjectCount,
  feedCardCount,
  completedExchangeCount,
}: FirstRealStateInput): boolean {
  return (
    (activeSubjectCount ?? 0) > 0 ||
    (feedCardCount ?? 0) > 0 ||
    (completedExchangeCount ?? 0) > 0
  );
}
