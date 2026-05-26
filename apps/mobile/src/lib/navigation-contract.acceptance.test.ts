// PR 4 acceptance — deep routes and parent-native review.
//
// Locks in the two outcomes the navigation contract Phase 6 plan calls out:
//   (a) a V1 parent opening child/[profileId]/* is parent-native: no proxy
//       chrome, learning write actions remain available;
//   (b) a retained proxy session still surfaces proxy chrome and hides
//       learning write actions.

import {
  PROFILE_FACTORY_ISO as ISO,
  PROFILE_FACTORY_CHILD_BIRTH_YEAR as CHILD_BIRTH_YEAR,
  makeProfile,
} from '../test-utils/profile-factories';
import {
  resolveNavigationContract,
  type ProfileContext,
} from './navigation-contract';

const parent = makeProfile({
  id: '00000000-0000-7000-a000-000000000401',
  defaultAppContext: 'family',
  hasFamilyLinks: true,
});

const linkedChild = makeProfile({
  id: '00000000-0000-7000-a000-000000000501',
  birthYear: CHILD_BIRTH_YEAR,
  isOwner: false,
  linkCreatedAt: ISO,
});

const unlinkedChildParams = {
  profileId: '00000000-0000-7000-a000-000000000999',
};

const linkedChildParams = { profileId: linkedChild.id };

function context(overrides: Partial<ProfileContext> = {}): ProfileContext {
  return {
    activeProfile: parent,
    appContext: 'family',
    isParentProxy: false,
    profiles: [parent, linkedChild],
    role: 'owner',
    flags: { MODE_NAV_V1_ENABLED: true },
    subscription: {
      status: 'ready',
      tier: 'family',
      effectiveAccessTier: 'family',
      billingAccess: 'current',
    },
    ...overrides,
  };
}

describe('parent-native review (V1)', () => {
  it('parent in Family opening a linked child detail route sees no proxy chrome', () => {
    const contract = resolveNavigationContract(context());

    expect(contract.shape).toBe('family');
    expect(contract.isParentProxy).toBe(false);
    expect(contract.chrome.proxyBanner).toBe('hidden');
    expect(contract.canEnter('child/[profileId]', linkedChildParams)).toBe(
      true,
    );
    expect(
      contract.canEnter('child/[profileId]/reports', linkedChildParams),
    ).toBe(true);
    expect(
      contract.canEnter('child/[profileId]/curriculum', linkedChildParams),
    ).toBe(true);
    expect(
      contract.canEnter(
        'child/[profileId]/session/[sessionId]',
        linkedChildParams,
      ),
    ).toBe(true);
  });

  it('parent in Family retains learning write actions for their own learning', () => {
    const contract = resolveNavigationContract(context());

    // The parent is reviewing a child's surface but is not impersonating them.
    // Their own learning write actions (sessions, homework, dictation, etc.)
    // must remain available so they can use the app themselves.
    expect(contract.gates.showLearningActions).toBe(true);
    expect(contract.gates.sessionIsOwner).toBe(true);
    expect(contract.canEnter('session')).toBe(true);
    expect(contract.canEnter('homework')).toBe(true);
  });

  it('does not unlock child detail routes when the profileId is not a linked child', () => {
    const contract = resolveNavigationContract(context());

    expect(contract.canEnter('child/[profileId]', unlinkedChildParams)).toBe(
      false,
    );
    expect(contract.isSurfaced('child/[profileId]', unlinkedChildParams)).toBe(
      false,
    );
  });
});

describe('retained proxy path (V1)', () => {
  it('parent in proxy mode shows proxy chrome', () => {
    const contract = resolveNavigationContract(
      context({ isParentProxy: true, activeProfile: linkedChild }),
    );

    expect(contract.isParentProxy).toBe(true);
    expect(contract.chrome.proxyBanner).toBe('required');
  });

  it('parent in proxy mode hides learning write actions', () => {
    const contract = resolveNavigationContract(
      context({ isParentProxy: true, activeProfile: linkedChild }),
    );

    // Learning write actions must be hidden from the proxy session so the
    // parent cannot inadvertently mutate the child's learning record while
    // impersonating them.
    expect(contract.gates.showLearningActions).toBe(false);
    expect(contract.gates.sessionIsOwner).toBe(false);
    expect(contract.canEnter('session')).toBe(false);
    expect(contract.canEnter('homework')).toBe(false);
    expect(contract.canEnter('quiz')).toBe(false);
    expect(contract.canEnter('dictation')).toBe(false);
    expect(contract.canEnter('practice')).toBe(false);
    expect(contract.canEnter('mentor-memory')).toBe(false);
  });

  it('parent in proxy mode cannot enter parent-native child detail routes', () => {
    const contract = resolveNavigationContract(
      context({ isParentProxy: true, activeProfile: linkedChild }),
    );

    // Family child review surfaces are a parent-native path and must NOT be
    // reachable while impersonating a child. The parent must exit proxy mode
    // first.
    expect(contract.canEnter('child/[profileId]', linkedChildParams)).toBe(
      false,
    );
    expect(
      contract.canEnter('child/[profileId]/reports', linkedChildParams),
    ).toBe(false);
  });
});
