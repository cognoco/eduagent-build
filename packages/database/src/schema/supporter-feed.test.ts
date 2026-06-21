import {
  mentorActivityLedger,
  supporterEncouragementChips,
  supporterFeedSurfaceState,
} from './index.js';

describe('supporter feed schema', () => {
  it('exports the S4 supporter view-state and encouragement carrier tables', () => {
    expect(supporterFeedSurfaceState).toBeDefined();
    expect(supporterEncouragementChips).toBeDefined();
  });

  it('defines source-keyed supporter feed surface state', () => {
    expect(supporterFeedSurfaceState.id).toBeDefined();
    expect(supporterFeedSurfaceState.viewerPersonId).toBeDefined();
    expect(supporterFeedSurfaceState.scopeKind).toBeDefined();
    expect(supporterFeedSurfaceState.sourceKind).toBeDefined();
    expect(supporterFeedSurfaceState.sourceKey).toBeDefined();
    expect(supporterFeedSurfaceState.supportershipId).toBeDefined();
    expect(supporterFeedSurfaceState.targetPersonId).toBeDefined();
    expect(supporterFeedSurfaceState.surfaceCount).toBeDefined();
    expect(supporterFeedSurfaceState.surfacedAt).toBeDefined();
    expect(supporterFeedSurfaceState.snoozedUntil).toBeDefined();
    expect(supporterFeedSurfaceState.dismissedAt).toBeDefined();
  });

  it('defines supportership-scoped encouragement chips', () => {
    expect(supporterEncouragementChips.id).toBeDefined();
    expect(supporterEncouragementChips.supportershipId).toBeDefined();
    expect(supporterEncouragementChips.supporterPersonId).toBeDefined();
    expect(supporterEncouragementChips.supporteePersonId).toBeDefined();
    expect(supporterEncouragementChips.source).toBeDefined();
    expect(supporterEncouragementChips.suggestedText).toBeDefined();
    expect(supporterEncouragementChips.subjectId).toBeDefined();
    expect(supporterEncouragementChips.topicId).toBeDefined();
    expect(supporterEncouragementChips.dismissedAt).toBeDefined();
    expect(supporterEncouragementChips.consumedAt).toBeDefined();
  });

  it('does not add an S4 edge column to mentor_activity_ledger', () => {
    expect('edgeId' in mentorActivityLedger).toBe(false);
  });
});
