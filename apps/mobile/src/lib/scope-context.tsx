import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  isActiveScopePersisted: boolean;
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
  const [persistedScopeKey, setPersistedScopeKey] = useState<string | null>(
    null,
  );
  const persistenceRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++persistenceRequestIdRef.current;
    setStoredScopeKey(null);
    setPersistedScopeKey(null);
    if (!profileId) return;

    let cancelled = false;
    void SecureStore.getItemAsync(getLastActiveScopeStorageKey(profileId))
      .then((value) => {
        if (!cancelled && persistenceRequestIdRef.current === requestId) {
          setStoredScopeKey(value);
          setPersistedScopeKey(value);
        }
      })
      .catch(() => {
        if (!cancelled && persistenceRequestIdRef.current === requestId) {
          setStoredScopeKey(null);
          setPersistedScopeKey(null);
        }
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
    if (preferredScopeKey === scopeKey(IMPLICIT_ME_SCOPE)) {
      return IMPLICIT_ME_SCOPE;
    }
    return (
      scopeList.scopes.find((scope) => scopeKey(scope) === preferredScopeKey) ??
      defaultScope
    );
  }, [defaultScope, scopeList, storedScopeKey, userScopeKey]);

  const setActiveScope = useCallback(
    (scope: ScopeDescriptor) => {
      if (scopeList.shape !== 'supporter') return;
      // 'me' is a supporter's own identity, not a relationship the server
      // needs to have resolved yet — unlike 'person' scopes, which require a
      // live supportership edge. resolveScopesForPerson only adds 'me' to
      // scopeList.scopes once the supporter has real learning state of their
      // own, but mentor.tsx/subjects.tsx already render the same cold-start
      // experience for a zero-history 'me' scope that every brand-new
      // learner account passes through, so it's safe to switch into it here
      // even before the server has surfaced it as a known scope.
      if (scope.kind !== 'me' && !isKnownScope(scope, scopeList.scopes)) return;
      const nextScopeKey = scopeKey(scope);
      setUserScopeKey(nextScopeKey);
      const requestId = ++persistenceRequestIdRef.current;
      setPersistedScopeKey(null);
      if (profileId) {
        const key = getLastActiveScopeStorageKey(profileId);
        void SecureStore.setItemAsync(key, nextScopeKey)
          .then(() => {
            if (persistenceRequestIdRef.current === requestId) {
              setPersistedScopeKey(nextScopeKey);
            }
          })
          .catch(() => {
            console.warn('[scope-context] failed to persist active scope');
          });
      }
    },
    [profileId, scopeList],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      scopeList,
      availableScopes,
      activeScope,
      isActiveScopePersisted:
        persistedScopeKey !== null &&
        persistedScopeKey === scopeKey(activeScope),
      setActiveScope,
      isLoading,
      error,
    }),
    [
      activeScope,
      availableScopes,
      error,
      isLoading,
      persistedScopeKey,
      scopeList,
      setActiveScope,
    ],
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

  const scopesQuery = useApiQuery<SupporterScopeList>({
    queryKey: ['profile', activeProfile?.id ?? 'none', 'scopes'],
    enabled: !!activeProfile,
    retry: false,
    schema: supporterScopeListSchema,
    fetch: (signal) => client.scopes.$get({}, { init: { signal } }),
    select: (json) => json,
    notFoundFallback: LEARNER_SCOPE_LIST,
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
