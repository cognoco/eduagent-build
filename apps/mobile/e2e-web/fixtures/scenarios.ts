import path from 'node:path';
import { authStateDir, buildSeedEmail } from '../helpers/runtime';

export const authScenarios = {
  soloLearner: {
    key: 'solo-learner',
    seedScenario: 'onboarding-complete',
    email: buildSeedEmail('solo-learner'),
    storageStatePath: path.join(authStateDir, 'solo-learner.json'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
  },
  ownerWithChildren: {
    key: 'owner-with-children',
    seedScenario: 'parent-multi-child',
    email: buildSeedEmail('owner-with-children'),
    storageStatePath: path.join(authStateDir, 'owner-with-children.json'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
  },
} as const;
