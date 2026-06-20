import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  supporterScopeListSchema,
  type ScopeDescriptor,
  type SupporterScopeList,
} from '@eduagent/schemas';

import { useApiQuery } from '../hooks/use-api-query';
import { useApiClient } from './api-client';
import { useProfile } from './profile';
import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';

const LEARNER_SCOPE_LIST: SupporterScopeList = { shape: 'learner' };
const IMPLICIT_ME_SCOPE: ScopeDescriptor = { kind: 'me' };

interface ScopeContextValue {
  scopeList: SupporterScopeList;
  availableScopes: ScopeDescriptor[];
  activeScope: ScopeDescriptor;
  setActiveScope: (scope: ScopeDescriptor) => void;
  isLoading: boolean;
  error: Error | null;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function getLastActiveScopeStorageKey(profileId: string): string {
  return sanitizeSecureStoreKey(`scope.last-active-${profileId}`);
}

function scopeKey(scope: ScopeDescriptor): string {
  switch (scope.kind) {
    case 'supporter-hub':
      return 'supporter-hub';
    case 'me':
      return 'me';
    case 'person':
      return `person:${scope.personId}:${scope.edgeId}`;
  }
}

function isKnownScope(
  scope: ScopeDescriptor,
  scopes: ScopeDescriptor[],
): boolean {
  const key = scopeKey(scope);
  return scopes.some((candidate) => scopeKey(candidate) === key);
}

function coerceError(error: unknown): Error | null {
  if (!error) return null;
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function ScopeStateProvider({
  children,
  scopeList,
  profileId,
  isLoading = false,
  error = null,
}: {
  children: ReactNode;
  scopeList: SupporterScopeList;
  profileId?: string;
  isLoading?: boolean;
  error?: Error | null;
}): React.ReactElement {
  const [userScopeKey, setUserScopeKey] = useState<string | null>(null);
  const [storedScopeKey, setStoredScopeKey] = useState<string | null>(null);

  useEffect(() => {
    setStoredScopeKey(null);
    if (!profileId) return;

    let cancelled = false;
    void SecureStore.getItemAsync(getLastActiveScopeStorageKey(profileId))
      .then((value) => {
        if (!cancelled) setStoredScopeKey(value);
      })
      .catch(() => {
        if (!cancelled) setStoredScopeKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const availableScopes = useMemo(
    () => (scopeList.shape === 'supporter' ? scopeList.scopes : []),
    [scopeList],
  );

  const defaultScope = useMemo<ScopeDescriptor>(() => {
    if (scopeList.shape === 'learner') return IMPLICIT_ME_SCOPE;
    return (
      scopeList.scopes[scopeList.defaultScopeIndex] ??
      scopeList.scopes[0] ?? { kind: 'supporter-hub' }
    );
  }, [scopeList]);

  const activeScope = useMemo<ScopeDescriptor>(() => {
    if (scopeList.shape === 'learner') return IMPLICIT_ME_SCOPE;
    const preferredScopeKey = userScopeKey ?? storedScopeKey;
    if (!preferredScopeKey) return defaultScope;
    return (
      scopeList.scopes.find((scope) => scopeKey(scope) === preferredScopeKey) ??
      defaultScope
    );
  }, [defaultScope, scopeList, storedScopeKey, userScopeKey]);

  const setActiveScope = useCallback(
    (scope: ScopeDescriptor) => {
      if (scopeList.shape !== 'supporter') return;
      if (!isKnownScope(scope, scopeList.scopes)) return;
      const nextScopeKey = scopeKey(scope);
      setUserScopeKey(nextScopeKey);
      if (profileId) {
        const key = getLastActiveScopeStorageKey(profileId);
        void SecureStore.setItemAsync(key, nextScopeKey).catch(() => undefined);
      }
    },
    [profileId, scopeList],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      scopeList,
      availableScopes,
      activeScope,
      setActiveScope,
      isLoading,
      error,
    }),
    [activeScope, availableScopes, error, isLoading, scopeList, setActiveScope],
  );

  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}

function QueryBackedScopeProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  const scopesQuery = useApiQuery<unknown, SupporterScopeList>({
    queryKey: ['profile', activeProfile?.id ?? 'none', 'scopes'],
    enabled: !!activeProfile,
    fetch: (signal) => client.scopes.$get({}, { init: { signal } }),
    select: (json) => supporterScopeListSchema.parse(json),
  });

  return (
    <ScopeStateProvider
      scopeList={scopesQuery.data ?? LEARNER_SCOPE_LIST}
      profileId={activeProfile?.id}
      isLoading={scopesQuery.isLoading}
      error={coerceError(scopesQuery.error)}
    >
      {children}
    </ScopeStateProvider>
  );
}

export function ScopeContextProvider({
  children,
  initialScopeList,
  initialProfileId,
}: {
  children: ReactNode;
  initialScopeList?: SupporterScopeList;
  initialProfileId?: string;
}): React.ReactElement {
  if (initialScopeList) {
    return (
      <ScopeStateProvider
        scopeList={initialScopeList}
        profileId={initialProfileId}
      >
        {children}
      </ScopeStateProvider>
    );
  }

  return <QueryBackedScopeProvider>{children}</QueryBackedScopeProvider>;
}

export function useScopeContext(): ScopeContextValue {
  const value = useContext(ScopeContext);
  if (!value) {
    throw new Error('useScopeContext must be used inside ScopeContextProvider');
  }
  return value;
}
