import {
  childProfileHref,
  FAMILY_HOME_PATH,
  homeHrefForReturnTo,
  goBackOrReplace,
  pushLearningResumeTarget,
  pushChildReport,
  pushChildWeeklyReport,
  LEARNER_HOME_HREF,
  LEARNER_HOME_RETURN_TO,
  PRACTICE_HREF,
  PRACTICE_RETURN_TO,
  FAMILY_RECAPS_HREF,
  FAMILY_RECAPS_RETURN_TO,
  FAMILY_PROGRESS_HREF,
  FAMILY_PROGRESS_RETURN_TO,
  STUDY_PROGRESS_HREF,
  STUDY_PROGRESS_RETURN_TO,
  FAMILY_CHILDREN_HREF,
  FAMILY_CHILDREN_RETURN_TO,
} from './navigation';
import type { LearningResumeTarget } from '@eduagent/schemas';
import type { Router } from 'expo-router';

describe('navigation constants', () => {
  it('exports FAMILY_HOME_PATH for family-facing navigation', () => {
    expect(FAMILY_HOME_PATH).toBe('/(app)/home');
  });
});

describe('childProfileHref', () => {
  it('builds child profile hrefs with optional mode params', () => {
    expect(childProfileHref('child-1')).toBe('/(app)/child/child-1');
    expect(childProfileHref('child-1', 'progress')).toBe(
      '/(app)/child/child-1?mode=progress',
    );
    expect(childProfileHref('child-1', 'settings')).toBe(
      '/(app)/child/child-1?mode=settings',
    );
  });
});

describe('homeHrefForReturnTo', () => {
  it('returns the learner-home href when returnTo === LEARNER_HOME_RETURN_TO', () => {
    expect(homeHrefForReturnTo(LEARNER_HOME_RETURN_TO)).toBe(LEARNER_HOME_HREF);
  });

  it('uses the first param when given an array', () => {
    expect(homeHrefForReturnTo([LEARNER_HOME_RETURN_TO, 'other'])).toBe(
      LEARNER_HOME_HREF,
    );
  });

  it('returns the practice href when returnTo === PRACTICE_RETURN_TO', () => {
    expect(homeHrefForReturnTo(PRACTICE_RETURN_TO)).toBe(PRACTICE_HREF);
  });

  it('resolves Family and Study context return tokens', () => {
    expect(homeHrefForReturnTo(FAMILY_RECAPS_RETURN_TO)).toBe(
      FAMILY_RECAPS_HREF,
    );
    expect(homeHrefForReturnTo(FAMILY_PROGRESS_RETURN_TO)).toBe(
      FAMILY_PROGRESS_HREF,
    );
    expect(homeHrefForReturnTo(STUDY_PROGRESS_RETURN_TO)).toBe(
      STUDY_PROGRESS_HREF,
    );
    expect(homeHrefForReturnTo(FAMILY_CHILDREN_RETURN_TO)).toBe(
      FAMILY_CHILDREN_HREF,
    );
  });

  it('resolves Family return tokens with context ids to deep hrefs', () => {
    expect(homeHrefForReturnTo(FAMILY_RECAPS_RETURN_TO, 'recap-1')).toEqual({
      pathname: '/(app)/recaps/[recapId]',
      params: { recapId: 'recap-1' },
    });
    expect(homeHrefForReturnTo(FAMILY_CHILDREN_RETURN_TO, 'child-1')).toBe(
      '/(app)/child/child-1',
    );
  });

  it('falls back to the family home for any other value', () => {
    expect(homeHrefForReturnTo('something-else')).toBe('/(app)/home');
    expect(homeHrefForReturnTo(undefined)).toBe('/(app)/home');
  });
});

describe('goBackOrReplace', () => {
  it('calls back() when canGoBack returns true', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
    } satisfies Pick<Router, 'back' | 'canGoBack' | 'replace'>;
    goBackOrReplace(router, '/(app)/home');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('calls replace(fallbackHref) when canGoBack returns false', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    } satisfies Pick<Router, 'back' | 'canGoBack' | 'replace'>;
    goBackOrReplace(router, '/(app)/home');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(app)/home');
  });

  // ---------------------------------------------------------------------------
  // [BUG-552] goBackOrReplace fallback contract lock-down
  //
  // When canGoBack() returns false (first-route / deep-link entry), the
  // function MUST call router.replace with the exact fallbackHref passed by
  // the caller, and MUST NOT call router.back().
  //
  // Callers are responsible for passing the *parent* screen as fallbackHref,
  // not the app home root — passing home creates a UX dead-end (the user is
  // dropped at Home with no path back to their context). This test uses a
  // representative parent href ('/(app)/more') to make the contract explicit.
  //
  // See AGENTS.md — "cross-tab / cross-stack router.push" rule.
  // ---------------------------------------------------------------------------
  it('[BUG-552] deep-link / first-route: calls replace(fallbackHref) with the exact parent href, never back()', () => {
    const parentHref = '/(app)/more' as const;
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    } satisfies Pick<Router, 'back' | 'canGoBack' | 'replace'>;

    goBackOrReplace(router, parentHref);

    expect(router.canGoBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(parentHref);
  });
});

// ---------------------------------------------------------------------------
// [BUG-977 / CCR-PR126-M-2] pushLearningResumeTarget
//
// The previous implementation used `as never` which silenced the typed Href
// system entirely — a typo in pathname or invalid params key would only
// surface as a runtime navigation failure. The fix replaces it with `as Href`,
// which still permits the dynamic params shape but pins the pathname against
// the route table at compile time.
// ---------------------------------------------------------------------------

describe('pushLearningResumeTarget [BUG-977]', () => {
  function makeRouter() {
    return { push: jest.fn() } satisfies Pick<Router, 'push'>;
  }

  function makeMinimalTarget(): LearningResumeTarget {
    return {
      subjectId: 'subj-1',
      subjectName: 'Math',
      topicId: null,
      topicTitle: null,
      sessionId: null,
      resumeFromSessionId: null,
      resumeKind: 'subject_freeform',
      lastActivityAt: null,
      reason: '',
    };
  }

  // [BUG-551] Cross-tab push must seed the back-stack with the home screen
  // BEFORE pushing session. A single push synthesises a 1-deep stack so
  // back() from session falls through to the active tab's first-route (Home)
  // instead of the caller's previous screen.
  it('[BUG-551] pushes home screen before session to seed the ancestor back-stack', () => {
    const router = makeRouter();
    const target = makeMinimalTarget();
    pushLearningResumeTarget(router, target);

    expect(router.push).toHaveBeenCalledTimes(2);
    // First call must be the home screen (ancestor)
    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/home');
    // Second call is the session screen
    expect(router.push).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pathname: '/(app)/session' }),
    );
  });

  it('passes the session pathname and required params for a minimal target', () => {
    const router = makeRouter();
    const target = makeMinimalTarget();
    pushLearningResumeTarget(router, target);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'subj-1',
          subjectName: 'Math',
        }),
      }),
    );
  });

  it('omits topic / session / resume params when not provided on the target', () => {
    const router = makeRouter();
    pushLearningResumeTarget(router, makeMinimalTarget());
    // [BUG-551] push is called twice: index 0 is home, index 1 is session
    const call = router.push.mock.calls[1]![0] as { params: object };
    const params = call.params as Record<string, unknown>;
    expect(params).not.toHaveProperty('topicId');
    expect(params).not.toHaveProperty('topicName');
    expect(params).not.toHaveProperty('sessionId');
    expect(params).not.toHaveProperty('resumeFromSessionId');
    expect(params).not.toHaveProperty('returnTo');
  });

  it('includes topic / session / resume / returnTo params when present', () => {
    const router = makeRouter();
    const target: LearningResumeTarget = {
      ...makeMinimalTarget(),
      topicId: 't-1',
      topicTitle: 'Algebra',
      sessionId: 's-1',
      resumeFromSessionId: 's-prev',
    };
    pushLearningResumeTarget(router, target, 'learner-home');
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'subj-1',
          subjectName: 'Math',
          topicId: 't-1',
          topicName: 'Algebra',
          sessionId: 's-1',
          resumeFromSessionId: 's-prev',
          returnTo: 'learner-home',
        },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [BUG-524] pushChildReport / pushChildWeeklyReport — cross-tab chain push
//
// A direct push to `child/[profileId]/report/[reportId]` (or
// `weekly-report/[weeklyReportId]`) from another tab synthesises a 1-deep
// stack containing only the leaf, so `router.back()` falls through to the
// Tabs first-route (Home) instead of the child's index. unstable_settings
// in `child/[profileId]/_layout.tsx` only seeds one level, so it does NOT
// cover this 2-segment push. The helpers MUST push `child/[profileId]`
// first, then the leaf.
// ---------------------------------------------------------------------------

describe('pushChildReport [BUG-524]', () => {
  it('pushes child/[profileId] FIRST, then the report leaf', () => {
    const router = { push: jest.fn() } satisfies Pick<Router, 'push'>;
    pushChildReport(router, 'child-1', 'report-9');

    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/child/child-1');
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/report/[reportId]',
      params: { profileId: 'child-1', reportId: 'report-9' },
    });
  });
});

describe('pushChildWeeklyReport [BUG-524]', () => {
  it('pushes child/[profileId] FIRST, then the weekly-report leaf', () => {
    const router = { push: jest.fn() } satisfies Pick<Router, 'push'>;
    pushChildWeeklyReport(router, 'child-1', 'weekly-7');

    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/child/child-1');
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
      params: { profileId: 'child-1', weeklyReportId: 'weekly-7' },
    });
  });
});
