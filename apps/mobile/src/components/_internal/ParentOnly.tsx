import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';

export function ParentOnly({ children }: { children: ReactNode }): ReactNode {
  const role = useActiveProfileRole();
  const router = useRouter();

  useEffect(() => {
    if (role === 'child' || role === 'impersonated-child') {
      router.replace('/');
    }
  }, [role, router]);

  if (role !== 'owner') return null;

  return children;
}
