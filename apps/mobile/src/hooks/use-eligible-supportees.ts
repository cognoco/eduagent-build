import { useMemo } from 'react';

import { useLinkedChildren } from '../lib/profile';
import { useScopeContext } from '../lib/scope-context';

export interface EligibleManagedPerson {
  id: string;
  displayName: string;
}

/**
 * Managed persons (children linked to the current adult owner's account,
 * see `useLinkedChildren`) that do NOT yet have an active visibility
 * contract.
 *
 * A managed person already has a contract once they appear as a `person`
 * scope in `availableScopes` — `resolveScopesForPerson`
 * (`apps/api/src/services/scope-resolution.ts`) derives those entries from
 * non-revoked `supportership` rows, which are created as soon as
 * `POST /visibility/links` succeeds (even while the contract itself is
 * still `pending`). So "no scope yet" is the correct, already-available
 * signal for "eligible for a new link" — no extra API call needed.
 *
 * WI-1393: these are the candidates offered by the support-hub "start
 * supporting" picker so `/(app)/link/initiate` is never reached without a
 * `supporteePersonId`.
 */
export function useEligibleManagedPersons(): EligibleManagedPerson[] {
  const linkedChildren = useLinkedChildren();
  const { availableScopes } = useScopeContext();

  return useMemo(() => {
    const linkedPersonIds = new Set(
      availableScopes
        .filter((scope) => scope.kind === 'person')
        .map((scope) => scope.personId),
    );
    return linkedChildren
      .filter((child) => !linkedPersonIds.has(child.id))
      .map((child) => ({ id: child.id, displayName: child.displayName }));
  }, [linkedChildren, availableScopes]);
}
