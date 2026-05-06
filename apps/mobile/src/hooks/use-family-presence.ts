import { useDashboard } from './use-dashboard';

export interface FamilyPresence {
  hasFamily: boolean;
  isLoading: boolean;
}

export function useFamilyPresence(): FamilyPresence {
  const { data, isLoading } = useDashboard();
  const hasFamily = (data?.children?.length ?? 0) > 0;
  return { hasFamily, isLoading };
}
