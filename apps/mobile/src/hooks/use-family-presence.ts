import { useDashboard } from './use-dashboard';
import { useActiveProfileRole } from './use-active-profile-role';

export interface FamilyPresence {
  hasFamily: boolean;
  isLoading: boolean;
}

export function useFamilyPresence(): FamilyPresence {
  const { data, isLoading } = useDashboard();
  const activeRole = useActiveProfileRole();
  const hasFamily =
    activeRole === 'owner' &&
    data?.demoMode === false &&
    (data.children?.length ?? 0) > 0;
  return { hasFamily, isLoading };
}
