import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, Pressable, ScrollView, View } from 'react-native';
import { useAuth, useUser, useReverification } from '@clerk/clerk-expo';

import { extractClerkError } from '../lib/clerk-error';
import {
  isClerkRequestTimeoutError,
  withClerkTimeout,
} from '../lib/clerk-timeout';
import { platformAlert } from '../lib/platform-alert';

interface SessionActivity {
  browserName?: string | null;
  city?: string | null;
  country?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
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

interface SecuritySessionsProps {
  onBackToAccount?: () => void;
}

export function SecuritySessions({
  onBackToAccount,
}: SecuritySessionsProps = {}): React.JSX.Element {
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
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const canLoadSessions = typeof user?.getSessions === 'function';
  const userId = user?.id ?? null;

  // [CRITICAL-2b] Step-up reverification before destroying a session. If the
  // Clerk instance requires reverification for sensitive actions, the enhanced
  // fetcher prompts the user to re-confirm their credentials and retries on
  // success; otherwise it passes through unchanged. This is the defence against
  // an unattended unlocked phone silently revoking the owner's other devices.
  const reverifiedRevoke = useReverification(
    (session: SecuritySessionResource) =>
      session.revoke?.() ?? Promise.resolve(),
  );
  const reverifiedRevokeAll = useReverification(
    async (targets: SecuritySessionResource[]) => {
      for (const session of targets) {
        if (session.revoke) {
          await withClerkTimeout(session.revoke(), 'session.revoke');
        }
      }
    },
  );

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
        await withClerkTimeout(reverifiedRevoke(session), 'session.revoke');
        await loadSessions();
      } catch (err) {
        setRevokeError(formatClerkError(err));
      } finally {
        setRevokingSessionId(null);
      }
    },
    [formatClerkError, loadSessions, reverifiedRevoke, sessionId],
  );

  const otherSessions = useMemo(
    () => sessions.filter((s) => s.id !== sessionId && s.revoke),
    [sessions, sessionId],
  );

  // [HIGH-1] The headline emergency action: revoke every session except the
  // current device in one tap. This is the safe default when the user has lost
  // a device and cannot reliably identify which row it is (HIGH-2).
  const runRevokeAll = useCallback(async () => {
    if (otherSessions.length === 0) return;
    setIsRevokingAll(true);
    setRevokeError(null);
    try {
      await reverifiedRevokeAll(otherSessions);
      await loadSessions();
    } catch (err) {
      setRevokeError(formatClerkError(err));
    } finally {
      setIsRevokingAll(false);
    }
  }, [formatClerkError, loadSessions, otherSessions, reverifiedRevokeAll]);

  const handleRevokeAll = useCallback(() => {
    if (otherSessions.length === 0) return;
    platformAlert(
      t('securitySessions.signOutAllTitle'),
      t('securitySessions.signOutAllConfirm', { count: otherSessions.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('securitySessions.signOutAllConfirmButton'),
          style: 'destructive',
          onPress: () => void runRevokeAll(),
        },
      ],
    );
  }, [otherSessions.length, runRevokeAll, t]);

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
        {onBackToAccount ? (
          <Pressable
            onPress={onBackToAccount}
            className="bg-primary rounded-card px-4 py-3 mt-4 items-center"
            accessibilityRole="button"
            accessibilityLabel={t('securitySessions.emptyBackLabel')}
            testID="security-sessions-empty-back"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('securitySessions.emptyBackButton')}
            </Text>
          </Pressable>
        ) : null}
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
      {otherSessions.length > 0 ? (
        <Pressable
          onPress={handleRevokeAll}
          disabled={isRevokingAll}
          className="bg-danger rounded-card px-4 py-3.5 mb-4 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('securitySessions.signOutAllLabel')}
          testID="security-sessions-revoke-all"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {isRevokingAll
              ? t('securitySessions.signingOutAll')
              : t('securitySessions.signOutAllButton', {
                  count: otherSessions.length,
                })}
          </Text>
        </Pressable>
      ) : null}
      {sessions.map((session) => {
        const isCurrent = session.id === sessionId;
        const location = formatSessionLocation(session);
        const lastActive = formatLastActive(session.lastActiveAt);
        const ipAddress = session.latestActivity?.ipAddress ?? null;
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
                {ipAddress ? (
                  <Text className="text-xs text-text-secondary mt-1">
                    {t('securitySessions.ipAddress', { ip: ipAddress })}
                  </Text>
                ) : null}
                {/* [HIGH-2] Last-active is the primary disambiguator when two
                    devices render identical titles — keep it prominent so the
                    user can tell the lost device from the one in their hand. */}
                {lastActive ? (
                  <Text className="text-body-sm font-medium text-text-primary mt-1">
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
                  disabled={revoking || isRevokingAll}
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
