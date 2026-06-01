import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, Pressable, ScrollView, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';

interface SessionActivity {
  browserName?: string | null;
  city?: string | null;
  country?: string | null;
  deviceType?: string | null;
}

interface SecuritySessionResource {
  id: string;
  lastActiveAt?: Date | number | string | null;
  latestActivity?: SessionActivity | null;
  revoke?: () => Promise<unknown>;
}

function formatSessionTitle(
  session: SecuritySessionResource,
  fallback: string,
): string {
  const activity = session.latestActivity;
  const device = activity?.deviceType ?? null;
  const browser = activity?.browserName ?? null;
  return [device, browser].filter(Boolean).join(' - ') || fallback;
}

function formatSessionLocation(
  session: SecuritySessionResource,
): string | null {
  const activity = session.latestActivity;
  return [activity?.city, activity?.country].filter(Boolean).join(', ') || null;
}

function formatLastActive(
  value: SecuritySessionResource['lastActiveAt'],
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function SecuritySessions(): React.JSX.Element {
  const { sessionId } = useAuth();
  const { user } = useUser();
  const { t } = useTranslation();
  const userRef = useRef(user);
  const [sessions, setSessions] = useState<SecuritySessionResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  );
  const canLoadSessions = typeof user?.getSessions === 'function';
  const userId = user?.id ?? null;

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const formatClerkError = useCallback(
    (err: unknown): string =>
      isClerkRequestTimeoutError(err)
        ? t('accountSecurity.timeoutMessage')
        : extractClerkError(err),
    [t],
  );

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setRevokeError(null);

    const currentUser = userRef.current;

    if (!currentUser?.getSessions) {
      setSessions([]);
      setLoadError(t('securitySessions.errorNotReady'));
      setIsLoading(false);
      return;
    }

    try {
      const nextSessions = (await withClerkTimeout(
        currentUser.getSessions(),
        'user.getSessions',
      )) as SecuritySessionResource[];
      setSessions(nextSessions);
    } catch (err) {
      setSessions([]);
      setLoadError(formatClerkError(err));
    } finally {
      setIsLoading(false);
    }
  }, [formatClerkError, t]);

  useEffect(() => {
    void loadSessions();
  }, [canLoadSessions, loadSessions, userId]);

  const handleRevoke = useCallback(
    async (session: SecuritySessionResource) => {
      if (session.id === sessionId || !session.revoke) return;

      setRevokingSessionId(session.id);
      setRevokeError(null);
      try {
        await withClerkTimeout(session.revoke(), 'session.revoke');
        await loadSessions();
      } catch (err) {
        setRevokeError(formatClerkError(err));
      } finally {
        setRevokingSessionId(null);
      }
    },
    [formatClerkError, loadSessions, sessionId],
  );

  if (isLoading) {
    return (
      <View
        className="flex-1 justify-center px-5"
        testID="security-sessions-loading"
      >
        <Text className="text-body text-text-secondary text-center">
          {t('securitySessions.loading')}
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View
        className="flex-1 justify-center px-5"
        testID="security-sessions-load-error"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center">
          {t('securitySessions.loadErrorTitle')}
        </Text>
        <Text className="text-body-sm text-text-secondary text-center mt-2">
          {loadError}
        </Text>
        <Pressable
          onPress={loadSessions}
          className="bg-primary rounded-card px-4 py-3 mt-4 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('securitySessions.retryLabel')}
          testID="security-sessions-retry"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('securitySessions.retryButton')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View
        className="flex-1 justify-center px-5"
        testID="security-sessions-empty"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center">
          {t('securitySessions.emptyTitle')}
        </Text>
        <Text className="text-body-sm text-text-secondary text-center mt-2">
          {t('securitySessions.emptyDescription')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 px-5"
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 16 }}
      testID="security-sessions-list"
    >
      <Text className="text-body-sm text-text-secondary mb-4">
        {t('securitySessions.description')}
      </Text>
      {revokeError ? (
        <Text className="text-xs text-danger mb-3" accessibilityRole="alert">
          {revokeError}
        </Text>
      ) : null}
      {sessions.map((session) => {
        const isCurrent = session.id === sessionId;
        const location = formatSessionLocation(session);
        const lastActive = formatLastActive(session.lastActiveAt);
        const revoking = revokingSessionId === session.id;
        const title = formatSessionTitle(
          session,
          t('securitySessions.deviceFallback'),
        );

        return (
          <View
            key={session.id}
            className="bg-surface rounded-card px-4 py-3.5 mb-2"
            testID={`session-row-${session.id}`}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-body font-semibold text-text-primary">
                  {title}
                </Text>
                {location ? (
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {location}
                  </Text>
                ) : null}
                {lastActive ? (
                  <Text className="text-xs text-text-secondary mt-1">
                    {t('securitySessions.lastActive', { value: lastActive })}
                  </Text>
                ) : null}
              </View>
              {isCurrent ? (
                <View
                  className="bg-primary/10 rounded-full px-2 py-1"
                  testID={`session-current-badge-${session.id}`}
                >
                  <Text className="text-xs font-semibold text-primary">
                    {t('securitySessions.currentBadge')}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => void handleRevoke(session)}
                  disabled={revoking}
                  className="bg-danger/10 rounded-card px-3 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t('securitySessions.revokeLabel', {
                    device: title,
                  })}
                  testID={`revoke-session-${session.id}`}
                >
                  <Text className="text-xs font-semibold text-danger">
                    {revoking
                      ? t('securitySessions.revoking')
                      : t('securitySessions.revokeButton')}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
