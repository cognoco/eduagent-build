import {
  FAMILY_HOME_PATH,
  homeHrefForReturnTo,
  goBackOrReplace,
  pushLearningResumeTarget,
  LEARNER_HOME_HREF,
  LEARNER_HOME_RETURN_TO,
} from './navigation';
import type { LearningResumeTarget } from '@eduagent/schemas';
import type { Router } from 'expo-router';

describe('navigation constants', () => {
  it('exports FAMILY_HOME_PATH for family-facing navigation', () => {
    expect(FAMILY_HOME_PATH).toBe('/(app)/dashboard');
  });
});

describe('homeHrefForReturnTo', () => {
  it('returns the learner-home href when returnTo === LEARNER_HOME_RETURN_TO', () => {
    expect(homeHrefForReturnTo(LEARNER_HOME_RETURN_TO)).toBe(LEARNER_HOME_HREF);
  });

  it('uses the first param when given an array', () => {
    expect(homeHrefForReturnTo([LEARNER_HOME_RETURN_TO, 'other'])).toBe(
      LEARNER_HOME_HREF
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
      })
    );
  });

  it('omits topic / session / resume params when not provided on the target', () => {
    const router = makeRouter();
    pushLearningResumeTarget(router, makeMinimalTarget());
    const call = router.push.mock.calls[0]![0] as { params: object };
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
      })
    );
  });
});
