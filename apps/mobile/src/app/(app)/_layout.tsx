import React from 'react';
import { Tabs, Redirect, usePathname, useRouter } from 'expo-router';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../lib/profile';
import { useThemeColors, useTokenVars } from '../../lib/theme';
import {
  initNotificationHandler,
  useNotificationResponseHandler,
} from '../../hooks/use-notification-response-handler';
import { usePushTokenRegistration } from '../../hooks/use-push-token-registration';
import { useRevenueCatIdentity } from '../../hooks/use-revenuecat';
import { evaluateSentryForProfile, Sentry } from '../../lib/sentry';
import { formatApiError } from '../../lib/format-api-error';
import { signOutWithCleanup } from '../../lib/sign-out';
import { toInternalAppRedirectPath } from '../../lib/normalize-redirect-path';
import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { FeedbackProvider } from '../../components/feedback/FeedbackProvider';
import { ErrorFallback } from '../../components/common';
import { ModeSwitcher } from '../../components/chrome/ModeSwitcher';
import { ScopeChip } from '../../components/chrome/ScopeChip';
import { AccountAvatar } from '../../components/account/AccountAvatar';
import { goBackOrReplace } from '../../lib/navigation';
import { ScopeContextProvider } from '../../lib/scope-context';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useMentorLanguageSync } from '../../hooks/use-mentor-language-sync';
import { useNavigationShellContract } from '../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import {
  getPreviewState,
  clearPreviewState,
} from '../../lib/preview-onboarding-state';
// [CRITICAL-B2] clearPreviewState ownership: SaveWizardGate Step-3 success
// (./_components/save-wizard/ConfirmStep.tsx) and signOutWithCleanup. The
// AppLayout effect below clears stale preview state when an active profile
// already exists.
import { getProxyChromeColors } from './_lib/proxy-chrome';
import { resolveAuthRedirectPath } from './_lib/auth-redirect';
import { PENDING_CONSENT_STATUSES } from './_lib/consent-gate-helpers';
import { ProxyBanner } from './_components/ProxyBanner';
import { PostApprovalLanding } from './_components/PostApprovalLanding';
import { CreateProfileGate } from './_components/CreateProfileGate';
import { ConsentWithdrawnGate } from './_components/ConsentWithdrawnGate';
import { ConsentPendingGate } from './_components/ConsentPendingGate';
import { usePostApprovalLanding } from './_hooks/use-post-approval-landing';
import { SaveWizardGate } from './_components/save-wizard/SaveWizardGate';

initNotificationHandler();

// Routes where the entire tab bar is hidden (immersive / full-screen UX).
// Bug 770: `practice` was missing — direct navigation to /practice from any
// shell (study / family / V0-guardian) was rendering the activity inside the
// host tab bar, making the audience scope ambiguous. Adding it here collapses
// the tab bar (height: 0) the same way quiz/homework/dictation already do.
const FULL_SCREEN_ROUTES = new Set([
  'account',
  'onboarding',
  'session',
  'homework',
  'dictation',
  'quiz',
  'practice',
  'shelf',
  'shelf/[subjectId]',
  'shelf/[subjectId]/book/[bookId]',
]);

// Bug 763: Routes that must NEVER appear in the tab bar / debug-link surface,
// regardless of the active tab shape. The dynamic-`screenOptions` whitelist
// (`isVisible ? {} : { href: null, ... }`) is supposed to hide every route
// not in `visibleTabs`, but Expo Router 6 / React Navigation 7 on web still
// auto-discover these route directories (dynamic params, nested layouts) and
// surface them as `/quiz`, `/shelf/undefined`, `/subject/undefined`,
// `/pick-book/undefined`, `/child/undefined` links because the
// per-route-options callback runs AFTER initial link list assembly. The
// belt-and-braces fix is an explicit `<Tabs.Screen href={null}>` entry per
// non-tab route below; this is the same pattern Expo Router docs recommend
// for hidden routes.
export const HIDDEN_TAB_ROUTES = [
  'account',
  'dashboard',
  'subscription',
  'mentor-memory',
  'session',
  'homework',
  'dictation',
  'quiz',
  'practice',
  'shelf',
  'subject',
  'subject-hub',
  'pick-book',
  'child',
  'my-notes',
  'vocabulary',
  'topic',
  'onboarding',
] as const;

const ACCOUNT_AVATAR_HIDDEN_PATHS = [
  '/account',
  '/onboarding',
  '/session',
  '/homework',
  '/dictation',
  '/quiz',
  '/practice',
  '/shelf',
] as const;

const PENDING_AUTH_REDIRECT_SETTLE_MS = 1_000;
const DEFAULT_AUTH_REDIRECT_PATH = '/(app)/home';
const PREVIEW_PROBE_TIMEOUT_MS = 2_500;
const V2_CHROME_MIN_TOP_INSET = 24;
const V2_TAB_BAR_MIN_BOTTOM_INSET = 48;

const iconMap: Record<
  string,
  {
    focused: keyof typeof Ionicons.glyphMap;
    default: keyof typeof Ionicons.glyphMap;
  }
> = {
  Home: { focused: 'home', default: 'home-outline' },
  School: { focused: 'school', default: 'school-outline' },
  Book: { focused: 'book', default: 'book-outline' },
  Recaps: { focused: 'albums', default: 'albums-outline' },
  Progress: { focused: 'stats-chart', default: 'stats-chart-outline' },
  Users: { focused: 'people', default: 'people-outline' },
  More: { focused: 'menu', default: 'menu-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const colors = useThemeColors();
  const entry = iconMap[name];
  return (
    <Ionicons
      name={
        entry ? (focused ? entry.focused : entry.default) : 'ellipse-outline'
      }
      size={22}
      color={focused ? colors.accent : colors.textSecondary}
    />
  );
}

export default function AppLayout() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const currentAppPath = toInternalAppRedirectPath(pathname);
  const {
    profiles,
    activeProfile,
    isLoading: isProfileLoading,
    profileLoadError,
    profileWasRemoved,
    acknowledgeProfileRemoval,
    switchProfile,
  } = useProfile();
  useMentorLanguageSync();
  const proxyColors = getProxyChromeColors(colors);
  const role = useActiveProfileRole();
  const navigationShell = useNavigationShellContract();
  const visibleTabs = navigationShell.visibleTabs;
  const homeTabPresentation = navigationShell.homeTabPresentation;
  const isProxyChromeActive = navigationShell.proxy.active;

  // Sync Clerk auth state with RevenueCat identity (runs on auth change)
  useRevenueCatIdentity();

  const pendingAuthRedirect = isSignedIn ? peekPendingAuthRedirect() : null;
  const replayedAuthRedirectRef = React.useRef<string | null>(null);

  // [M14] Timeout for pendingAuthRedirect spinner
  const [pendingRedirectTimedOut, setPendingRedirectTimedOut] =
    React.useState(false);
  const isPendingRedirectSpinning = !!(
    pendingAuthRedirect && currentAppPath !== pendingAuthRedirect
  );
  React.useEffect(() => {
    if (!isPendingRedirectSpinning) {
      setPendingRedirectTimedOut(false);
      return;
    }
    const t = setTimeout(() => setPendingRedirectTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [isPendingRedirectSpinning]);

  // [M15] Timeout for isProfileLoading spinner
  const [profileLoadTimedOut, setProfileLoadTimedOut] = React.useState(false);
  React.useEffect(() => {
    if (!isProfileLoading) {
      setProfileLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setProfileLoadTimedOut(true), 20_000);
    return () => clearTimeout(t);
  }, [isProfileLoading]);

  // Age-gated Sentry: re-evaluate on profile switch (Story 10.14)
  React.useEffect(() => {
    evaluateSentryForProfile(
      activeProfile?.birthYear ?? null,
      activeProfile?.consentStatus ?? null,
    );
  }, [
    activeProfile?.id,
    activeProfile?.birthYear,
    activeProfile?.consentStatus,
  ]);

  React.useEffect(() => {
    if (!pendingAuthRedirect || currentAppPath !== pendingAuthRedirect) {
      return;
    }

    if (pendingAuthRedirect === DEFAULT_AUTH_REDIRECT_PATH) {
      clearPendingAuthRedirect();
      return;
    }

    // W-03: on web we can briefly land on the requested route before a later
    // mount-time redirect snaps the tab shell back to /home. Keep the pending
    // redirect alive until the target path stays stable for a short window so
    // the replay effect can recover from that late navigation.
    const clearTimer = setTimeout(() => {
      if (peekPendingAuthRedirect() === pendingAuthRedirect) {
        clearPendingAuthRedirect();
      }
    }, PENDING_AUTH_REDIRECT_SETTLE_MS);

    return () => clearTimeout(clearTimer);
  }, [currentAppPath, pendingAuthRedirect]);

  React.useEffect(() => {
    if (!pendingAuthRedirect || currentAppPath === pendingAuthRedirect) {
      replayedAuthRedirectRef.current = null;
      return;
    }

    if (replayedAuthRedirectRef.current === pendingAuthRedirect) {
      return;
    }

    replayedAuthRedirectRef.current = pendingAuthRedirect;
    router.replace(pendingAuthRedirect as never);
  }, [currentAppPath, pendingAuthRedirect, router]);

  // Auto-dismiss profile-switched toast after 5 seconds
  React.useEffect(() => {
    if (!profileWasRemoved) return;
    const timer = setTimeout(acknowledgeProfileRemoval, 5_000);
    return () => clearTimeout(timer);
  }, [profileWasRemoved, acknowledgeProfileRemoval]);

  // Post-approval landing: show once after parent approves GDPR/COPPA consent.
  // [BUG-914] Gate on role === 'child' so the celebration is suppressed for
  // parent profiles (relevant when a parent switches back from impersonating
  // a child and lands here) AND for impersonated-child sessions (where the
  // user is actually the parent and would see "Your parent said yes" while
  // operating their own account).
  const [showPostApproval, dismissPostApproval] = usePostApprovalLanding(
    activeProfile?.id,
    activeProfile?.consentStatus,
    role,
  );
  usePushTokenRegistration();
  useNotificationResponseHandler();

  // [BUG-923] Previously fired on every render of the (app) layout, drowning
  // signal in noise during debugging sessions. Log only when isLoaded or
  // isSignedIn actually transition.
  React.useEffect(() => {
    if (__DEV__) {
      console.log(
        `[AUTH-DEBUG] (app) layout | isLoaded=${isLoaded} | isSignedIn=${isSignedIn}`,
      );
    }
  }, [isLoaded, isSignedIn]);

  // [CRITICAL-A2] Preview-state probe — async, resolves once on mount.
  // Determines whether to show the SaveWizardGate (inline gate, not a route).
  // Initial state is 'loading' to hold rendering until the probe settles,
  // preventing a transient CreateProfileGate flash while the async read runs.
  const [previewProbeState, setPreviewProbeState] = React.useState<
    'loading' | 'present' | 'absent'
  >('loading');
  // [HIGH-A2] Wizard completion sentinel. previewProbeState alone never flips
  // back to 'absent' after mount; the wizard signals completion via onComplete.
  const [wizardDone, setWizardDone] = React.useState(false);
  // The preview wizard may outlive first-profile auto-activation once it has
  // actually started, but stale preview state must not hijack existing users
  // who already have an active profile when the layout first loads.
  const [wizardStarted, setWizardStarted] = React.useState(false);

  React.useEffect(() => {
    if (!FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED) {
      setPreviewProbeState('absent');
      return;
    }
    let cancelled = false;
    let settled = false;
    const timeout = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      Sentry.addBreadcrumb({
        category: 'preview-onboarding',
        level: 'warning',
        message: 'preview SecureStore read timed out',
      });
      setPreviewProbeState('absent');
    }, PREVIEW_PROBE_TIMEOUT_MS);
    void getPreviewState()
      .then((s) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeout);
        setPreviewProbeState(s ? 'present' : 'absent');
      })
      .catch(() => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeout);
        setPreviewProbeState('absent');
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // [CRITICAL-B2] DELIBERATELY no auto-cleanup effect here. A previous
  // iteration had:
  //   useEffect(() => { if (activeProfile && profiles.length > 0) clearPreviewState() })
  // — that races the wizard's owner-POST → child-POST sequence and wipes
  // `createdOwnerProfileId` between the two calls, destroying the [HIGH-4]
  // resume guard. Cleanup is owned by:
  //   (a) TTL inside getPreviewState (1h)
  //   (b) sign-out-cleanup (Task 4)
  //   (c) wizard's explicit clearPreviewState() on Step-3 success (Task 14)

  React.useEffect(() => {
    if (
      !FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED ||
      previewProbeState !== 'present' ||
      !activeProfile ||
      wizardStarted ||
      wizardDone
    ) {
      return;
    }
    setPreviewProbeState('absent');
    void clearPreviewState();
  }, [activeProfile, previewProbeState, wizardDone, wizardStarted]);

  const markWizardStarted = React.useCallback(() => {
    setWizardStarted(true);
  }, []);

  const markWizardDone = React.useCallback(() => {
    setWizardDone(true);
  }, []);

  if (!isLoaded)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  if (!isSignedIn) {
    if (__DEV__)
      console.warn(
        '[AUTH-DEBUG] (app) layout → NOT signed in, bouncing to sign-in',
      );
    const redirectTo = encodeURIComponent(
      rememberPendingAuthRedirect(resolveAuthRedirectPath(pathname)),
    );
    return <Redirect href={`/sign-in?redirectTo=${redirectTo}` as const} />;
  }

  if (pendingAuthRedirect && currentAppPath !== pendingAuthRedirect) {
    if (pendingRedirectTimedOut) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title={t('tabs.authRedirectTimeout.title')}
            message={t('tabs.authRedirectTimeout.message')}
            primaryAction={{
              label: t('common.goHome'),
              onPress: () => goBackOrReplace(router, '/(app)/home'),
              testID: 'auth-redirect-timeout-home',
            }}
            testID="auth-redirect-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="auth-redirect-replay"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  // Show a centered spinner while profiles load — never return null (blank
  // screen) because the loading state also fires after switchProfile resets
  // queries.  Returning null made the entire screen disappear on every
  // profile switch and during initial load.
  if (isProfileLoading) {
    if (profileLoadTimedOut) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title={t('tabs.profileLoadTimeout.title')}
            message={t('tabs.profileLoadTimeout.message')}
            primaryAction={{
              label: t('common.retry'),
              onPress: () => setProfileLoadTimedOut(false),
              testID: 'profile-loading-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.signOut'),
              onPress: () => {
                void signOutWithCleanup({
                  clerkSignOut,
                  queryClient,
                  profileIds: profiles.map((p) => p.id),
                  clerkUserId: userId ?? undefined,
                });
              },
              testID: 'profile-loading-timeout-signout',
            }}
            testID="profile-loading-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="profile-loading"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  // If the profile query fails, do not treat it as "no profiles". That would
  // push an existing user into first-time profile creation and can trigger a
  // confusing add-profile subscription limit.
  if (profileLoadError) {
    return (
      <View className="flex-1 bg-background">
        <ErrorFallback
          variant="centered"
          title={t('appShell.profileLoadErrorTitle')}
          message={formatApiError(profileLoadError)}
          primaryAction={{
            label: t('common.retry'),
            onPress: () => {
              setProfileLoadTimedOut(false);
              void queryClient.invalidateQueries({ queryKey: ['profiles'] });
              void queryClient.refetchQueries({ queryKey: ['profiles'] });
            },
            testID: 'profile-load-error-retry',
          }}
          secondaryAction={{
            label: t('common.signOut'),
            onPress: () => {
              void signOutWithCleanup({
                clerkSignOut,
                queryClient,
                profileIds: profiles.map((p) => p.id),
                clerkUserId: userId ?? undefined,
              });
            },
            testID: 'profile-load-error-signout',
          }}
          testID="profile-load-error"
        />
      </View>
    );
  }

  // FeedbackProvider wraps ALL authenticated screens (including gates) so
  // shake-to-give-feedback works everywhere after sign-in. Previously it only
  // wrapped the tab navigator, making shake dead on gate screens.
  //
  // key={themeKey} removed — crashes Android Fabric (MENTOMATE-MOBILE-6).
  // NativeWind vars() style updates propagate without remounting.

  // [CRITICAL-A2] Gate ordering — preview probe + wizard branch.
  // These sit ABOVE !activeProfile so the wizard stays mounted when
  // ProfileProvider auto-activates the first profile mid-wizard
  // (profile.ts:154-174). Without this ordering the wizard would unmount
  // after Step 2's POST succeeds.
  //
  // [CRITICAL-A3] Ordering guarantees (non-negotiable):
  //   1. !isLoaded → spinner  (auth not loaded; do not render any app UI)
  //   2. !isSignedIn → Redirect  (signed-out user must not see the wizard)
  //   3. pendingAuthRedirect spinner  (OAuth-return redirect-replay)
  //   4. isProfileLoading spinner  (profile query in flight)
  //   5. profileLoadError fallback  (independent of preview state)
  //   6. preview-probe-loading spinner
  //   7. SaveWizardGate branch
  //   8. !activeProfile → CreateProfileGate
  //   9. consent gates → Tabs
  //
  // The welcome intro used to live at step 8; it moved pre-auth in
  // docs/plans/2026-05-27-pre-auth-welcome-flow.md, so this layout no longer
  // probes intro state. Signed-in users always skip the cards.
  if (
    FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
    previewProbeState === 'loading'
  ) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="preview-state-loading"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  if (
    FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
    previewProbeState === 'present' &&
    !wizardDone &&
    (!activeProfile || wizardStarted)
  ) {
    return (
      <FeedbackProvider>
        <SaveWizardGate
          onStart={markWizardStarted}
          onComplete={markWizardDone}
        />
      </FeedbackProvider>
    );
  }

  // No profile exists — show gate that pushes to profile creation modal
  if (!activeProfile) {
    return (
      <FeedbackProvider>
        <CreateProfileGate />
      </FeedbackProvider>
    );
  }

  // Linked-parent accounts intentionally enter through /(app)/home now.
  // home.tsx renders the parent JTBD surface for owners with child profiles.

  // Gate: block app access when parental consent is pending (COPPA/GDPR)
  if (
    activeProfile?.consentStatus &&
    PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)
  ) {
    return (
      <FeedbackProvider>
        <ConsentPendingGate />
      </FeedbackProvider>
    );
  }

  // Gate: block access when consent has been withdrawn (deletion pending)
  if (activeProfile?.consentStatus === 'WITHDRAWN') {
    return (
      <FeedbackProvider>
        <ConsentWithdrawnGate />
      </FeedbackProvider>
    );
  }

  // Show celebratory landing once after consent approval
  if (showPostApproval) {
    return (
      <FeedbackProvider>
        <PostApprovalLanding onContinue={dismissPostApproval} />
      </FeedbackProvider>
    );
  }

  const proxyBanner =
    navigationShell.proxy.active && navigationShell.proxy.parentProfileId
      ? {
          childName: navigationShell.proxy.childName,
          parentProfileId: navigationShell.proxy.parentProfileId,
        }
      : null;
  const showAccountAvatar =
    FEATURE_FLAGS.MODE_NAV_V2_ENABLED &&
    !isProxyChromeActive &&
    !ACCOUNT_AVATAR_HIDDEN_PATHS.some((hiddenPath) =>
      pathname.startsWith(hiddenPath),
    );
  const showScopeChip = showAccountAvatar;
  const chromeTopInset = FEATURE_FLAGS.MODE_NAV_V2_ENABLED
    ? Math.max(insets.top, V2_CHROME_MIN_TOP_INSET)
    : insets.top;
  const tabBarBottomInset = FEATURE_FLAGS.MODE_NAV_V2_ENABLED
    ? Math.max(insets.bottom, V2_TAB_BAR_MIN_BOTTOM_INSET)
    : Math.max(insets.bottom, 24);

  return (
    <FeedbackProvider>
      <ScopeContextProvider>
        <View style={[{ flex: 1 }, tokenVars]}>
          {proxyBanner && (
            <ProxyBanner
              childName={proxyBanner.childName}
              onSwitchBack={() =>
                void switchProfile(proxyBanner.parentProfileId)
              }
            />
          )}
          {!FEATURE_FLAGS.MODE_NAV_V2_ENABLED && <ModeSwitcher />}
          {showScopeChip ? (
            <View
              className="absolute left-4 z-40"
              style={{ top: chromeTopInset + 8 }}
              testID="scope-chip-shell"
            >
              <ScopeChip />
            </View>
          ) : null}
          {showAccountAvatar ? (
            <View
              className="absolute right-4 z-40"
              style={{ top: chromeTopInset + 8 }}
              testID="account-avatar-shell"
            >
              <AccountAvatar />
            </View>
          ) : null}
          {/* ─── Whitelist tab pattern ────────────────────────────────────
           Only routes listed in visibleTabs render a tab button.
           Everything else is auto-hidden via screenOptions defaults.
           Adding a new route file to (app)/ will NEVER create a
           phantom tab — no manual Tabs.Screen entry needed.

           Routes in FULL_SCREEN_ROUTES also hide the entire tab bar
           (immersive screens like session, onboarding, homework).
         ──────────────────────────────────────────────────────────── */}
          <Tabs
            screenOptions={({ route }) => {
              const isVisible = visibleTabs.has(route.name);
              const isFullScreen = FULL_SCREEN_ROUTES.has(route.name);
              return {
                headerShown: false,
                // F-003/F-016/F-055: on web, inactive tab scenes stay in the DOM.
                // An opaque sceneStyle prevents the previous tab from bleeding
                // through when switching to a full-screen route (session, quiz, etc.).
                sceneStyle: {
                  backgroundColor: isProxyChromeActive
                    ? proxyColors.sceneBackground
                    : colors.background,
                },
                tabBarStyle: isFullScreen
                  ? {
                      display: 'none',
                      // On some Android devices and Expo web, display:'none'
                      // alone doesn't remove the tab bar from the touch
                      // responder chain. Fully collapse it so it can't
                      // intercept touches or occupy layout space.
                      height: 0,
                      overflow: 'hidden' as const,
                    }
                  : {
                      backgroundColor: isProxyChromeActive
                        ? proxyColors.tabBackground
                        : colors.surface,
                      borderTopColor: isProxyChromeActive
                        ? proxyColors.border
                        : colors.border,
                      borderTopWidth: isProxyChromeActive ? 2 : 1,
                      height: 56 + tabBarBottomInset,
                      paddingBottom: tabBarBottomInset,
                    },
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarLabelStyle: { fontSize: 12 },
                // Auto-hide any route not in the whitelist.
                // href:null removes the link; tabBarItemStyle removes the
                // flexbox space (Expo Router v6 + React Nav v7 regression).
                ...(isVisible
                  ? {}
                  : { href: null, tabBarItemStyle: { display: 'none' } }),
              };
            }}
          >
            <Tabs.Screen
              name="mentor"
              options={{
                title: t('tabs.mentor'),
                tabBarButtonTestID: 'tab-mentor',
                tabBarAccessibilityLabel: t('tabs.mentorLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Home" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="subjects"
              options={{
                title: t('tabs.subjects'),
                tabBarButtonTestID: 'tab-subjects',
                tabBarAccessibilityLabel: t('tabs.subjectsLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Book" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="journal"
              options={{
                title: t('tabs.journal'),
                tabBarButtonTestID: 'tab-journal',
                tabBarAccessibilityLabel: t('tabs.journalLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Recaps" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="home"
              options={{
                title: t(homeTabPresentation.titleKey),
                tabBarButtonTestID: 'tab-home',
                tabBarAccessibilityLabel: t(
                  homeTabPresentation.accessibilityLabelKey,
                ),
                // Lazy-load the Home tab so the initial mount only renders the
                // visible gate screens (consent, profile creation). The trade-off
                // is a brief spinner on the first Home tap, but it cuts ~200ms
                // off the critical auth→gate path on low-end devices.
                lazy: true,
                tabBarIcon: ({ focused }) => (
                  <TabIcon
                    name={homeTabPresentation.iconName}
                    focused={focused}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="own-learning"
              options={{
                title: t('tabs.myLearning'),
                tabBarButtonTestID: 'tab-my-learning',
                tabBarAccessibilityLabel: t('tabs.myLearningLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="School" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="library"
              options={{
                title: t('tabs.library'),
                tabBarButtonTestID: 'tab-library',
                tabBarAccessibilityLabel: t('tabs.libraryLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Book" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="recaps"
              options={{
                title: t('tabs.recaps'),
                tabBarButtonTestID: 'tab-recaps',
                tabBarAccessibilityLabel: t('tabs.recapsLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Recaps" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="progress"
              options={{
                title: t('tabs.progress'),
                tabBarButtonTestID: 'tab-progress',
                tabBarAccessibilityLabel: t('tabs.progressLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="Progress" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="more"
              options={{
                title: t('tabs.more'),
                tabBarButtonTestID: 'tab-more',
                tabBarAccessibilityLabel: t('tabs.moreLabel'),
                tabBarIcon: ({ focused }) => (
                  <TabIcon name="More" focused={focused} />
                ),
              }}
            />
            {/* Bug 763: Explicit href:null entries for non-tab routes so Expo
              Router does not auto-surface them as /quiz, /shelf/undefined,
              /subject/undefined, /pick-book/undefined, /child/undefined,
              etc. in the tab bar / web link list. The dynamic screenOptions
              callback above is the primary defense; these declarations are
              the belt-and-braces backup for routes that the callback misses
              on web auto-discovery. */}
            {HIDDEN_TAB_ROUTES.map((routeName) => (
              <Tabs.Screen
                key={routeName}
                name={routeName}
                options={{ href: null }}
              />
            ))}
          </Tabs>
          {profileWasRemoved && (
            <Pressable
              onPress={acknowledgeProfileRemoval}
              className="absolute left-4 right-4 z-50"
              style={{ top: chromeTopInset + 8 }}
              testID="profile-switched-toast"
              accessibilityRole="alert"
            >
              <View className="rounded-2xl bg-surface-elevated px-5 py-4 w-full shadow-lg">
                <Text className="text-body font-semibold text-text-primary mb-1">
                  {t('tabs.profileSwitchedToast.title')}
                </Text>
                <Text className="text-body-sm text-text-secondary">
                  {t('tabs.profileSwitchedToast.message')}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      </ScopeContextProvider>
    </FeedbackProvider>
  );
}
