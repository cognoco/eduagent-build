import { matrixFixtures } from './__fixtures__/navigation-matrix';
import {
  resolveNavigationContract,
  type RouteParams,
} from './navigation-contract';

describe('navigation-contract matrix snapshot', () => {
  matrixFixtures.forEach((fixture) => {
    it(`${fixture.id}: ${fixture.label}`, () => {
      const contract = resolveNavigationContract(fixture.context);

      const probeKey = (
        route: string,
        params: RouteParams | undefined,
      ): string => (params ? `${route}:${JSON.stringify(params)}` : route);

      const snapshot = {
        shape: contract.shape,
        effectiveAppContext: contract.effectiveAppContext,
        isFamilyCapable: contract.isFamilyCapable,
        isParentProxy: contract.isParentProxy,
        visibleTabs: [...contract.visibleTabs].sort(),
        home: contract.home,
        chrome: contract.chrome,
        gates: contract.gates,
        queryScope: contract.queryScope,
        diagnostic: {
          ...contract.diagnostic,
          linkedChildIds: [...contract.diagnostic.linkedChildIds].sort(),
        },
        canEnter: Object.fromEntries(
          fixture.probeRoutes.map((p) => [
            probeKey(p.route, p.params),
            contract.canEnter(p.route, p.params),
          ]),
        ),
        isSurfaced: Object.fromEntries(
          fixture.probeRoutes.map((p) => [
            probeKey(p.route, p.params),
            contract.isSurfaced(p.route, p.params),
          ]),
        ),
      };

      expect(snapshot).toMatchSnapshot();
    });
  });
});
