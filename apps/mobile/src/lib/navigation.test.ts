import {
  childProfileHref,
  FAMILY_HOME_PATH,
  homeHrefForReturnTo,
  isSessionForwardableReturnTo,
  goBackOrReplace,
  pushLearningResumeTarget,
  replaceV2LearningResumeTarget,
  pushChildReport,
  pushChildWeeklyReport,
  LEARNER_HOME_HREF,
  LEARNER_HOME_RETURN_TO,
  OWN_LEARNING_RETURN_TO,
  PRACTICE_HREF,
  PRACTICE_RETURN_TO,
  JOURNAL_HREF,
  JOURNAL_RETURN_TO,
  SUBJECTS_HREF,
  SUBJECTS_RETURN_TO,
  SUBJECT_HUB_RETURN_TO,
  FAMILY_RECAPS_HREF,
  FAMILY_RECAPS_RETURN_TO,
  FAMILY_PROGRESS_HREF,
  FAMILY_PROGRESS_RETURN_TO,
  STUDY_PROGRESS_HREF,
  STUDY_PROGRESS_RETURN_TO,
  FAMILY_CHILDREN_HREF,
  FAMILY_CHILDREN_RETURN_TO,
  FAMILY_HOME_RETURN_TO,
  accountReturnHref,
  accountReturnTokenForPathname,
} from './navigation';
import {
  consumeHubToSessionTransition,
  resetNavigationTransitionProvenanceForTests,
} from './navigation-transition-provenance';
import type { LearningResumeTarget } from '@eduagent/schemas';
import type { Router } from 'expo-router';

describe('navigation constants', () => {
  it('exports FAMILY_HOME_PATH for family-facing navigation', () => {
    expect(FAMILY_HOME_PATH).toBe('/(app)/home');
  });
});

describe('isSessionForwardableReturnTo', () => {
  it('accepts each return token that session entry points may forward', () => {
    expect(isSessionForwardableReturnTo(SUBJECTS_RETURN_TO)).toBe(true);
    expect(isSessionForwardableReturnTo(LEARNER_HOME_RETURN_TO)).toBe(true);
    expect(isSessionForwardableReturnTo(OWN_LEARNING_RETURN_TO)).toBe(true);
  });

  it('rejects unrelated and absent return tokens', () => {
    expect(isSessionForwardableReturnTo(PRACTICE_RETURN_TO)).toBe(false);
    expect(isSessionForwardableReturnTo('settings')).toBe(false);
    expect(isSessionForwardableReturnTo(undefined)).toBe(false);
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

  it('returns the journal href when returnTo is journal', () => {
    expect(homeHrefForReturnTo(JOURNAL_RETURN_TO)).toBe(JOURNAL_HREF);
  });

  it('[WI-2234] returns the Mentor href only for the Mentor session token', () => {
    expect(homeHrefForReturnTo('mentor')).toBe('/(app)/mentor');
  });

  it('returns the V2 Subjects tab for the subjects return token', () => {
    expect(homeHrefForReturnTo(SUBJECTS_RETURN_TO)).toBe(SUBJECTS_HREF);
  });

  it('returns the exact Subject Hub when a topic carries the hub return contract', () => {
    expect(homeHrefForReturnTo('subject-hub', 'biology-subject')).toEqual({
      pathname: '/(app)/subject-hub/[subjectId]',
      params: { subjectId: 'biology-subject' },
    });
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

  it.each([
    ['an app-looking path', '/(app)/journal'],
    ['a path-traversal-shaped token', 'subject-hub/../../journal'],
    ['an unknown first array value', ['not-allowed', SUBJECTS_RETURN_TO]],
  ] as Array<[caseName: string, returnTo: string | string[]]>)(
    'treats %s as untrusted input and returns the fixed home fallback',
    (_caseName, returnTo) => {
      expect(homeHrefForReturnTo(returnTo)).toBe(FAMILY_HOME_PATH);
    },
  );

  // [WI-1658]
  it('resolves FAMILY_HOME_RETURN_TO to FAMILY_HOME_PATH', () => {
    expect(homeHrefForReturnTo(FAMILY_HOME_RETURN_TO)).toBe(FAMILY_HOME_PATH);
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

  it('replaces with Subjects when a Subjects-origin screen has no browser history', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    } satisfies Pick<Router, 'back' | 'canGoBack' | 'replace'>;

    goBackOrReplace(router, SUBJECTS_HREF);

    expect(router.canGoBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(app)/subjects');
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

describe('V2 account return contract [WI-2240]', () => {
  it.each([
    ['/mentor', 'mentor'],
    ['/subjects', 'subjects'],
    ['/subjects/subject-1', 'subjects'],
    ['/subject/subject-1', 'subjects'],
    ['/subject-hub/subject-1', 'subjects'],
    ['/topic/topic-1', 'subjects'],
    ['/pick-book/subject-1', 'subjects'],
    ['/vocabulary/subject-1', 'subjects'],
    ['/shelf/subject-1/book/book-1', 'subjects'],
    ['/child/child-1/curriculum', 'subjects'],
    ['/child/child-1/subjects/subject-1', 'subjects'],
    ['/child/child-1/topic/topic-1', 'subjects'],
    ['/journal', 'journal'],
    ['/journal/practice', 'journal'],
  ] as const)('maps %s to the initiating V2 tab token', (pathname, token) => {
    expect(accountReturnTokenForPathname(pathname)).toBe(token);
  });

  it('uses Mentor as the strict V2 fallback for an unknown initiating path', () => {
    expect(accountReturnTokenForPathname('/unexpected')).toBe('mentor');
    expect(accountReturnTokenForPathname('/child/child-1')).toBe('mentor');
    expect(accountReturnTokenForPathname('/child/child-1/reports')).toBe(
      'mentor',
    );
    expect(
      accountReturnTokenForPathname('/child/child-1/session/session-1'),
    ).toBe('mentor');
    expect(accountReturnTokenForPathname('/child/child-1/subjects')).toBe(
      'mentor',
    );
    expect(
      accountReturnTokenForPathname('/child/child-1/subject/subject-1'),
    ).toBe('mentor');
    expect(accountReturnHref(undefined, true)).toBe('/(app)/mentor');
    expect(accountReturnHref('unexpected', true)).toBe('/(app)/mentor');
  });

  it.each([
    ['mentor', '/(app)/mentor'],
    ['subjects', '/(app)/subjects'],
    ['journal', '/(app)/journal'],
  ] as const)('resolves %s to its exact V2 tab root', (token, href) => {
    expect(accountReturnHref(token, true)).toBe(href);
  });

  it('preserves the legacy home fallback when V2 is disabled', () => {
    expect(accountReturnHref('journal', false)).toBe('/(app)/home');
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
  beforeEach(() => {
    resetNavigationTransitionProvenanceForTests();
  });

  function makeRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
    } satisfies Pick<Router, 'push' | 'replace'>;
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

  // [BUG-551] Cross-tab push must seed the contextual ancestor BEFORE pushing
  // session. With no return token, Home remains the fallback ancestor.
  it('keeps Home as the ancestor when returnTo is absent', () => {
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

  it('preserves the legacy Home ancestor when returnTo is subjects', () => {
    const router = makeRouter();
    const target: LearningResumeTarget = {
      ...makeMinimalTarget(),
      topicId: 'topic-subjects-return',
      topicTitle: 'Linear equations',
      sessionId: 'session-subjects-return',
    };

    pushLearningResumeTarget(router, target, SUBJECTS_RETURN_TO);

    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/home');
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subj-1',
        subjectName: 'Math',
        topicId: 'topic-subjects-return',
        topicName: 'Linear equations',
        sessionId: 'session-subjects-return',
        returnTo: SUBJECTS_RETURN_TO,
      },
    });
  });

  it('forwards the exact Subject Hub identity when resuming a learning session', () => {
    const router = makeRouter();
    const target = makeMinimalTarget();

    pushLearningResumeTarget(
      router,
      target,
      SUBJECT_HUB_RETURN_TO,
      target.subjectId,
    );

    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subj-1',
        subjectName: 'Math',
        returnTo: SUBJECT_HUB_RETURN_TO,
        returnId: 'subj-1',
      },
    });
  });

  it('isolates current-route replacement behind the V2-only helper', () => {
    const router = makeRouter();
    const target: LearningResumeTarget = {
      ...makeMinimalTarget(),
      topicId: 'topic-hub-resume',
      topicTitle: 'Cell respiration',
      sessionId: 'session-hub-resume',
    };

    replaceV2LearningResumeTarget(router, target, SUBJECTS_RETURN_TO, {
      preserveSubjectsHistory: true,
    });

    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subj-1',
        subjectName: 'Math',
        topicId: 'topic-hub-resume',
        topicName: 'Cell respiration',
        sessionId: 'session-hub-resume',
        returnTo: SUBJECTS_RETURN_TO,
      },
    });
    expect(consumeHubToSessionTransition('subj-1')).toBe(true);
  });

  it('does not create history proof for a V2 replacement without a proven Subjects predecessor', () => {
    const router = makeRouter();

    replaceV2LearningResumeTarget(
      router,
      makeMinimalTarget(),
      SUBJECTS_RETURN_TO,
      { preserveSubjectsHistory: false },
    );

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(consumeHubToSessionTransition('subj-1')).toBe(false);
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
